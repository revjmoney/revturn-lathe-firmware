// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
import { registerSetup } from '../src/ui/setup.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app, store;
const $ = (sel) => root.querySelector(sel);
const click = (sel) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const setField = (sel, value) => { const el = $(sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const readBlob = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(b); });

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  try { localStorage.clear(); } catch {}
  root = document.getElementById('app');
  link = new FakeLink();
  store = new Map();
  const fetchImpl = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
      const file = [...opts.body.entries()][1][1];
      store.set(file.name.slice(1), await readBlob(file));
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }
    const u = new URL(url);
    if (u.pathname === '/files') return { ok: true, json: async () => ({ files: [...store.keys()].map((name) => ({ name })) }) };
    const name = decodeURIComponent(u.pathname.slice(1));
    return store.has(name) ? { ok: true, text: async () => store.get(name) } : { ok: false, status: 404 };
  });
  app = startApp(root, link, { host: 'lathe', fetchImpl });
  registerCycles(app);
  registerProgram(app);
  registerSetup(app);
  link.setConnected(true);
  link.line('$30=40.000');
  link.status('<Idle|MPos:0,0,0,0|D:1>');
  link.lines.length = 0;
  link.realtime.length = 0;
});
afterEach(() => { app.stop(); vi.restoreAllMocks(); });

describe('overrides (Fanuc panel)', () => {
  it('send the grbl realtime override bytes', () => {
    for (const k of ['feed-', 'feed100', 'feed+', 'spin-', 'spin100', 'spin+', 'rapid25', 'rapid50', 'rapid100']) click(`[data-ov="${k}"]`);
    expect(link.realtime).toEqual([0x92, 0x90, 0x91, 0x9b, 0x99, 0x9a, 0x97, 0x96, 0x95]);
  });
  it('show the live override values', () => {
    link.status('<Idle|MPos:0,0,0,0|Ov:120,50,90>');
    expect($('[data-ov-show]').textContent).toBe('FEED 120% · RAPID 50% · SPINDLE 90%');
  });
});

describe('alarm and unlock', () => {
  it('shows RESET/UNLOCK only in alarm and sends $X', () => {
    expect($('[data-unlock]').hidden).toBe(true);
    link.status('<Alarm:3|MPos:0,0,0,0>');
    expect($('[data-unlock]').hidden).toBe(false);
    click('[data-unlock]');
    expect(link.lines).toContain('$X');
  });
  it('explains the alarm in the message line', () => {
    link.line('ALARM:1');
    expect($('[data-msg]').textContent).toBe('ALARM:1 Hard limit: press UNLOCK after checking the machine');
  });
});

describe('report units', () => {
  it('asks for $13 on connect and handles inch reports', () => {
    link.setConnected(false);
    link.lines.length = 0;
    link.setConnected(true);
    expect(link.lines).toContain('$13');
    link.line('$13=1');
    link.status('<Idle|MPos:1,0,-0.5,0>');
    expect($('[data-dro="x"]').textContent).toBe('1.0000');
  });
});

describe('dry run', () => {
  it('toggles a red badge and runs the cycle as an air cut', async () => {
    click('[data-dryrun]');
    expect($('[data-drybadge]').hidden).toBe(false);
    app.showMode('CYCLES');
    click('[data-cycle="face"]');
    click('[data-go]');
    await new Promise((r) => setTimeout(r, 0));
    click('[data-go]');
    await vi.waitFor(() => expect(link.lines).toEqual(['$F=/cycle.nc']));
    expect(store.get('cycle.nc')).toMatch(/\(DRY RUN: Z \+0\.52, spindle off\)/);
    expect(store.get("cycle.nc")).not.toMatch(/^M[34]\b/m);
  });
});

describe('tools on the DRO', () => {
  it('selecting a tool shows its tip and ABS SET accounts for the offset', async () => {
    app.state.setup.tools[2] = { n: 3, desc: 'boring bar', dx: 0.12, dz: 0 };
    link.status(`<Idle|MPos:${(25.4 * 1.12).toFixed(4)},0,0,0|D:1>`);
    click('[data-tool="3"]');
    expect($('[data-dro="x"]').textContent).toBe('1.0000');
    expect($('[data-tooltag]').textContent).toBe('T3');
    for (const k of ['X', '1', 'ABS SET']) click(`[data-key="${k}"]`);
    expect(link.lines).toContain('G7 G20 G10 L20 P0 X1.12');
    await vi.waitFor(() => expect(JSON.parse(store.get('setup.json')).activeTool).toBe(3));
  });
});

describe('view only (another screen is in control)', () => {
  it('locks program controls but keeps HOLD and STOP', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    link.status('<Run|MPos:0,0,0,0>'); // locked only while a program runs (shared control)
    expect($('[data-conn]').textContent).toBe('VIEW ONLY');
    expect($('[data-go]').disabled).toBe(true);
    expect($('[data-zero="X"]').disabled).toBe(true);
    expect($('[data-stop]').disabled).toBe(false);
    click('[data-stop]');
    expect(link.realtime).toContain(0x18);
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '1' } }));
    expect($('[data-conn]').textContent).toBe('CONNECTED');
    expect($('[data-go]').disabled).toBe(false);
  });
});

describe('SET UP', () => {
  beforeEach(() => app.showMode('SET UP'));

  it('touch-off X sets the tool offset from a measured diameter', () => {
    link.status(`<Idle|MPos:${(25.4 * 1.12).toFixed(4)},0,0,0|D:1>`);
    vi.spyOn(window, 'prompt').mockReturnValue('1.000');
    click('[data-touch="2:X"]');
    expect(app.state.setup.tools[1].dx).toBeCloseTo(0.12, 4);
    expect($('[name="t2dx"]').value).toBe('0.1200');
  });

  it('LIMITS switch: off by default, turns on and off, and is saved on the lathe', async () => {
    const b = $('[data-limits]');
    expect(b.textContent).toBe('LIMITS OFF');
    expect(b.classList.contains('on')).toBe(false);
    click('[data-limits]');
    expect(app.state.setup.limits.enabled).toBe(true);
    expect(b.textContent).toBe('LIMITS ON');
    expect(b.classList.contains('on')).toBe(true);
    await vi.waitFor(() => expect(JSON.parse(store.get('setup.json') ?? '{}').limits?.enabled).toBe(true));
    click('[data-limits]');
    expect(b.textContent).toBe('LIMITS OFF');
    await vi.waitFor(() => expect(JSON.parse(store.get('setup.json')).limits.enabled).toBe(false));
  });

  it('view-only screens cannot flip the LIMITS switch', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    link.status('<Run|MPos:0,0,0,0>'); // locked only while a program runs (shared control)
    expect($('[data-limits]').disabled).toBe(true);
  });

  it('saving SET UP keeps the LIMITS switch as it was', async () => {
    app.state.setup.limits.enabled = true;
    app.showMode('SET UP');
    click('[data-setup-save]');
    await vi.waitFor(() => expect(store.has('setup.json')).toBe(true));
    expect(JSON.parse(store.get('setup.json')).limits.enabled).toBe(true);
  });

  it('saves tools and stroke limits to the lathe', async () => {
    setField('[name="t2desc"]', 'parting');
    setField('[name="zMin"]', '-2.5');
    click('[data-setup-save]');
    await vi.waitFor(() => expect(store.has('setup.json')).toBe(true));
    const saved = JSON.parse(store.get('setup.json'));
    expect(saved.tools[1].desc).toBe('parting');
    expect(saved.limits.zMin).toBe(-2.5);
  });
});

describe('RUN progress', () => {
  it('shows percent, elapsed and remaining from |SD:', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
      link.status('<Run|MPos:0,0,0,0|SD:0.0,/part.nc>');
      vi.setSystemTime(new Date('2026-11-08T12:01:00Z'));
      link.status('<Run|MPos:0,0,0,0|SD:25.0,/part.nc>');
      expect($('[data-progress]').textContent).toBe('part.nc 25% · 1:00 elapsed · ~3:00 left');
      link.status('<Idle|MPos:0,0,0,0>');
      expect($('[data-progress]').textContent).toBe('');
    } finally { vi.useRealTimers(); }
  });
});

describe('review fixes: screen', () => {
  it('the active tool follows a program tool change message', async () => {
    link.line('[MSG:CHANGE TO T3 boring bar]');
    expect(app.state.setup.activeTool).toBe(3);
    expect($('[data-tooltag]').textContent).toBe('T3');
    await vi.waitFor(() => expect(JSON.parse(store.get('setup.json')).activeTool).toBe(3));
  });

  it('keeps the tool table and blocks runs when setup.json cannot be read', async () => {
    app.state.setup.tools[1].dx = 0.25;
    app.fetchImpl = async () => { throw new Error('network'); };
    const ok = await app.refreshSetup();
    expect(ok).toBe(false);
    expect(app.state.setup.tools[1].dx).toBe(0.25);
    expect(app.idleCheck()).toBe('Tool table could not be read from the lathe: check the connection and try again');
  });

  it('re-reads setup.json at GO so a change made on another screen is used', async () => {
    const s = JSON.parse(JSON.stringify(app.state.setup));
    s.tools[1] = { n: 2, desc: 'new', dx: 0.3, dz: 0 };
    store.set('setup.json', JSON.stringify(s));
    expect(await app.refreshSetup()).toBe(true);
    expect(app.state.setup.tools[1].dx).toBe(0.3);
  });

  it('view-only screens cannot change the tool', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    link.status('<Run|MPos:0,0,0,0>'); // locked only while a program runs (shared control)
    expect($('[data-tool="2"]').disabled).toBe(true);
  });

  it('the controlling screen re-sends $13 when another screen joins (so watchers learn the units)', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '1' } }));
    expect(link.lines).toContain('$13');
  });

  it('the controlling screen re-sends $G when another screen joins (so watchers learn G7, not RAD)', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '1' } }));
    expect(link.lines).toContain('$G');
  });

  it('streams the running program into the MDI console as Ln moves (also on a VIEW ONLY screen)', async () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    store.set('p.nc', 'G7 G20\nG1 X1 F5\nG1 Z-1\nM30\n');
    link.status('<Run|MPos:0,0,0,0|Ln:2|SD:5.0,/p.nc>');
    await vi.waitFor(() => expect($('[data-mdi-log]').textContent).toContain('2  G1 X1 F5'));
    link.status('<Run|MPos:0,0,0,0|Ln:3|SD:50.0,/p.nc>');
    const rows = [...root.querySelectorAll('[data-mdi-log] .run')].map((r) => r.textContent);
    expect(rows).toEqual(['1  G7 G20', '2  G1 X1 F5', '3  G1 Z-1']);
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-mdi-log]').textContent).toContain('(program ended)');
  });

  it('a VIEW ONLY screen shows DIA once it sees the controller [GC:] reply', () => {
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    link.status('<Idle|MPos:0,0,0,0|D:0>');
    expect(root.textContent).toContain('RAD');
    link.line('[GC:G0 G54 G17 G7 G20 G90 G94 G49 G98 G97 M5 M9 T1 F0 S0]');
    expect(root.textContent).toContain('DIA');
    expect(root.textContent).not.toContain('RAD');
  });


  it('toggling DRY RUN clears an armed CYCLES preview', async () => {
    app.showMode('CYCLES');
    click('[data-cycle="face"]');
    click('[data-go]');
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-preview-wrap]').hidden).toBe(false);
    click('[data-dryrun]');
    expect($('[data-preview-wrap]').hidden).toBe(true);
  });

  it('SET UP refuses offsets that are not numbers', async () => {
    app.showMode('SET UP');
    setField('[name="t2dx"]', 'abc');
    click('[data-setup-save]');
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-msg]').textContent).toBe('T2 X offset must be a number');
    expect(store.has('setup.json')).toBe(false);
  });
});
