// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-11: PROG, SET UP and CYCLES open in the full window like EDIT / BACKPLOT, with an obvious CLOSE.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
import { registerSetup } from '../src/ui/setup.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (sel) => root.querySelector(sel);
const click = (sel) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  try { localStorage.clear(); } catch {}
  root = document.getElementById('app');
  link = new FakeLink();
  const fetchImpl = vi.fn(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/files') return { ok: true, json: async () => ({ files: [] }) };
    return { ok: false, status: 404 };
  });
  app = startApp(root, link, { host: 'lathe', fetchImpl });
  registerCycles(app);
  registerProgram(app);
  registerSetup(app);
  link.setConnected(true);
  link.line('$30=40.000');
  link.status('<Idle|MPos:0,0,0,0|D:1>');
  link.lines.length = 0;
});
afterEach(() => { app.stop(); vi.restoreAllMocks(); });

describe('windowed modes', () => {
  for (const [mode, title, inside] of [['PROG', 'PROGRAMS', '[data-prog-new]'], ['SET UP', 'SET UP', '[data-setup-save]'], ['CYCLES', 'CYCLES', '[data-cycle]']]) {
    it(`${mode} opens in the window, closes, reopens, and leaving the mode closes it`, () => {
      app.showMode(mode);
      expect(app.popup.kind).toBe(`mode:${mode}`);
      expect($('[data-pop-title]').textContent).toBe(`[ ${title} ]`);
      expect($(`[data-pop] ${inside}`)).not.toBe(null);
      expect($(`[data-panel] ${inside}`)).toBe(null);
      click('[data-pop-close]');
      expect(app.popup.kind).toBe(null);
      click('[data-panel] [data-open-modewin]');
      expect(app.popup.kind).toBe(`mode:${mode}`);
      expect(root.querySelectorAll(`[data-pop] ${inside}`).length).toBeGreaterThan(0);
      app.showMode('DRO');
      expect(app.popup.kind).toBe(null);
    });
  }

  it('the window leaves the mode buttons outside it, and tapping one switches mode', () => {
    app.showMode('PROG');
    expect($('[data-pop] [data-mode]')).toBe(null);
    click('[data-mode="SET UP"]');
    expect(app.popup.kind).toBe('mode:SET UP');
    click('[data-mode="DRO"]');
    expect(app.popup.kind).toBe(null);
  });

  it('GO in CYCLES with the window closed reopens it instead of running', () => {
    app.showMode('CYCLES');
    click('[data-pop-close]');
    click('[data-go]');
    expect(app.popup.kind).toBe('mode:CYCLES');
    expect(link.lines).toEqual([]);
  });

  it('RUN window has the DRO as one line across the top, updated live, plus the backplot', () => {
    app.showMode('RUN');
    expect(app.popup.kind).toBe('mode:RUN');
    link.status('<Idle|MPos:0,0,-25.4,0|WCO:0,0,0,0>');
    const bar = $('[data-pop] .runbar');
    expect(bar).not.toBe(null);
    expect(bar.querySelector('[data-dro="z"]').textContent).toBe($('.readout [data-dro="z"]').textContent);
    expect(bar.querySelector('[data-dro="z"]').textContent).toContain('1.0000');
    expect($('[data-pop] [data-backplot]')).not.toBe(null);
  });

  it('RUN window has the feed / spindle / rapid override buttons, and they work', () => {
    app.showMode('RUN');
    link.realtime.length = 0;
    click('[data-pop] [data-ov="feed-"]');
    expect(link.realtime.length).toBe(1);
    link.status('<Run|MPos:0,0,0,0|Ov:80,100,100>');
    expect($('[data-pop] [data-ov-show]').textContent).toContain('FEED 80%');
  });

  it('RUN shows a small set / actual line under X, Z and the spindle', () => {
    app.showMode('RUN');
    link.status('<Idle|MPos:0,0,0,0|WCO:0,0,0,0>');
    expect($('[data-pop] [data-fd="x"]').textContent).toMatch(/^set -- · act 0\.00 ipm$/);
    expect($('[data-pop] [data-fd="z"]').textContent).toContain('act');
    expect($('[data-pop] [data-fd="s"]').textContent).toMatch(/rpm$/);
  });

  it('while a program runs, set = its F times the feed override', () => {
    app.program.current = { name: 'p', steps: [{ cycle: 'gcode', params: { text: 'G1 X1 Z0 F10\nG1 Z-1\nG1 Z-2\nG1 Z-3' } }] };
    app.program.saved = true;
    app.showMode('RUN');
    link.status('<Run|MPos:0,0,0,0|WCO:0,0,0,0|Ov:50,100,100|SD:99,/p.nc>');
    expect($('[data-pop] [data-fd="x"]').textContent).toMatch(/^set 5\.00 \(50%\) · act/);
  });

  it('EDIT with no program open still opens the big window, with a way to PROG', () => {
    app.showMode('EDIT');
    expect(app.popup.kind).toBe('editor');
    expect($('[data-pop-title]').textContent).toBe('[ PROGRAM EDITOR ]');
    click('[data-pop] [data-goto-prog]');
    expect(app.state.mode).toBe('PROG');
    expect(app.popup.kind).toBe('mode:PROG');
  });

  it('NEW from the PROG window goes to the editor window', () => {
    app.showMode('PROG');
    $('[data-pop] [name="progName"]').value = 'w';
    click('[data-pop] [data-prog-new]');
    expect(app.state.mode).toBe('EDIT');
    expect(app.popup.kind).toBe('editor');
  });
});
