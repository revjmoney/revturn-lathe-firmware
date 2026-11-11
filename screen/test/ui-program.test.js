// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app, store, deletes;
const $ = (sel) => root.querySelector(sel);
const click = (sel) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const setField = (sel, value) => {
  const el = $(sel);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const readBlob = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(b); });

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  try { localStorage.clear(); } catch {}
  root = document.getElementById('app');
  link = new FakeLink();
  store = new Map();
  deletes = [];
  const fetchImpl = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
      const file = [...opts.body.entries()][1][1];
      store.set(file.name.slice(1), await readBlob(file));
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }
    const u = new URL(url);
    if (u.pathname === '/files' && u.searchParams.get('action') === 'delete') {
      deletes.push(u.searchParams.get('filename'));
      store.delete(u.searchParams.get('filename'));
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }
    if (u.pathname === '/files') return { ok: true, json: async () => ({ files: [...store.keys()].map((name) => ({ name })) }) };
    const name = decodeURIComponent(u.pathname.slice(1));
    return store.has(name) ? { ok: true, text: async () => store.get(name) } : { ok: false, status: 404 };
  });
  app = startApp(root, link, { host: 'lathe', fetchImpl });
  registerCycles(app);
  registerProgram(app);
  link.setConnected(true);
  link.line('$30=40.000');
  link.status('<Idle|MPos:0,0,0,0|D:1>');
  link.lines.length = 0;
});
afterEach(() => { app.stop(); vi.restoreAllMocks(); });

async function newProgramWithTwoSteps() {
  app.showMode('PROG');
  setField('[name="progName"]', 'Part A');
  click('[data-prog-new]');
  expect(app.state.mode).toBe('EDIT');
  click('[data-add="face"]');
  click('[data-add="turn"]');
}

describe('EDIT', () => {
  // Rev 2026-11-09: the editor is its own window over the whole screen (no DRO / jog while editing)
  it('opens the editor in the popup window over the DRO and jog pad, and can reopen it', async () => {
    await newProgramWithTwoSteps();
    expect(app.popup.kind).toBe('editor');
    expect($('[data-pop-title]').textContent).toBe('[ PROGRAM EDITOR: part_a ]');
    expect($('[data-pop] [data-steps]')).not.toBe(null);
    expect($('[data-pop] [data-jog]')).toBe(null); // the jog pad and DRO are under the window, not in it
    click('[data-pop-close]');
    expect(app.popup.kind).toBe(null);
    click('[data-open-editor]');
    expect(app.popup.kind).toBe('editor');
    app.showMode('DRO'); // leaving EDIT closes its window
    expect(app.popup.kind).toBe(null);
  });

  it('a g-code step gets a big g-code box', async () => {
    await newProgramWithTwoSteps();
    click('[data-add="gcode"]');
    const box = $('[data-pop] [data-step-form] textarea.gcodebox');
    expect(box).not.toBe(null);
    expect(Number(box.getAttribute('rows'))).toBeGreaterThanOrEqual(18);
  });

  it('saving a 2-step program uploads the .json and the .nc', async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    expect(JSON.parse(store.get('part_a.json')).steps.map((s) => s.cycle)).toEqual(['face', 'turn']);
    expect(store.get('part_a.nc')).toContain('(STEP 2: turn)');
  });

  it('a bad step blocks Save and names the step', async () => {
    await newProgramWithTwoSteps();
    click('[data-pstep="1"]');
    setField('[data-step-form] [name="rpm"]', '99');
    click('[data-step-apply]');
    click('[data-save]');
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-msg]').textContent).toBe('Step 2: RPM above machine limit (40)');
    expect(store.size).toBe(0);
  });

  it('moves and deletes steps', async () => {
    await newProgramWithTwoSteps();
    click('[data-pstep-up="1"]');
    expect(app.program.current.steps.map((s) => s.cycle)).toEqual(['turn', 'face']);
    click('[data-pstep-del="0"]');
    expect(app.program.current.steps.map((s) => s.cycle)).toEqual(['face']);
  });
});

describe('RUN', () => {
  it('GO runs the saved program from flash', async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    app.showMode('RUN');
    click('[data-go]');
    await vi.waitFor(() => expect(link.lines).toEqual(['$F=/part_a.nc']));
  });

  it('RUN compiles at GO time: dry run goes to a separate file', async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    click('[data-dryrun]');
    app.showMode('RUN');
    click('[data-go]');
    await vi.waitFor(() => expect(link.lines).toEqual(['$F=/part_a_dry.nc']));
    expect(store.get('part_a_dry.nc')).toMatch(/\(DRY RUN: Z \+[0-9.]+, spindle off\)/);
  });

  it('shows which step is running from the progress percent', async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    app.showMode('RUN');
    link.status('<Run|MPos:0,0,0,0|SD:95.0,/part_a.nc>');
    expect($('[data-run-step]').textContent).toBe('STEP 2 of 2: TURN');
  });

  it('refuses to run while the machine is not Idle', async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    link.status('<Run|MPos:0,0,0,0|D:1>');
    app.showMode('RUN');
    click('[data-go]');
    await vi.waitFor(() => expect($('[data-msg]').textContent).toBe('Machine must be Idle to start (now Run)'));
    expect(link.lines).toEqual([]);
  });

  it('refuses to run unsaved changes', async () => {
    await newProgramWithTwoSteps();
    app.showMode('RUN');
    click('[data-go]');
    expect(link.lines).toEqual([]);
    expect($('[data-msg]').textContent).toBe('Save the program first (EDIT, SAVE)');
  });
});

describe('IMPORT', () => {
  it('turns a Fusion post file into a program with one g-code step', async () => {
    app.showMode('PROG');
    const input = $('[data-import-file]');
    const file = new File(['%\nO1001\nG7 G18 G20\nG0 X1 Z0.1\nM30\n%'], 'Shaft A.nc', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(app.state.mode).toBe('EDIT'));
    expect(app.program.current.name).toBe('shaft_a');
    expect(app.program.current.steps).toEqual([{ cycle: 'gcode', params: { text: 'G7 G18 G20\nG0 X1 Z0.1\nM30' } }]);
  });
});

describe('PROG', () => {
  beforeEach(async () => {
    await newProgramWithTwoSteps();
    click('[data-save]');
    await vi.waitFor(() => expect(store.has('part_a.nc')).toBe(true));
    app.showMode('PROG');
    await vi.waitFor(() => expect($('[data-prog-item="part_a"]')).not.toBe(null));
  });

  it('delete asks first and does nothing on no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    click('[data-prog-item="part_a"]');
    click('[data-prog-delete]');
    await new Promise((r) => setTimeout(r, 0));
    expect(window.confirm).toHaveBeenCalled();
    expect(deletes).toEqual([]);
  });

  it('delete on yes removes both files', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    click('[data-prog-item="part_a"]');
    click('[data-prog-delete]');
    await vi.waitFor(() => expect(deletes.sort()).toEqual(['part_a.json', 'part_a.nc']));
  });

  it('opens a saved program into EDIT', async () => {
    app.program.current = null;
    click('[data-prog-item="part_a"]');
    click('[data-prog-open]');
    await vi.waitFor(() => expect(app.state.mode).toBe('EDIT'));
    expect(app.program.current.steps.length).toBe(2);
  });
});
