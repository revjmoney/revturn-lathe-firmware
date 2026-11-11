// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerJog } from '../src/ui/jog.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app, uploads, files;
const $ = (sel) => root.querySelector(sel);
const fire = (sel, type) => $(sel).dispatchEvent(new MouseEvent(type, { bubbles: true }));
const click = (sel) => fire(sel, 'click');
const setField = (name, value) => {
  const el = $(`[name="${name}"]`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const flush = () => new Promise((r) => setTimeout(r, 0));
// jsdom's Blob has no .text(); real browsers do. Read uploads with FileReader in tests.
const readBlob = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(b); });

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  try { localStorage.clear(); } catch {}
  root = document.getElementById('app');
  link = new FakeLink();
  uploads = [];
  files = [];
  const fetchImpl = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
      const entries = [...opts.body.entries()];
      const file = entries[1][1];
      uploads.push({ name: file.name, text: await readBlob(file) });
      files.push(file.name.slice(1));
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }
    if (!String(url).includes('/files')) return { ok: false, status: 404 }; // like the lathe: missing file
    return { ok: true, json: async () => ({ files: files.map((name) => ({ name })) }) };
  });
  app = startApp(root, link, { host: 'lathe', fetchImpl });
  registerJog(app);
  registerCycles(app);
  link.setConnected(true);
  link.line('$30=40.000');
  link.status('<Idle|MPos:0,0,0,0|D:1>');
  link.lines.length = 0;
  link.realtime.length = 0;
});
afterEach(() => app.stop());

describe('CYCLES', () => {
  beforeEach(() => { app.showMode('CYCLES'); click('[data-cycle="face"]'); });

  it('first GO with a bad form shows the error and sends nothing', async () => {
    setField('depth', '');
    click('[data-go]');
    await flush();
    expect($('[data-msg]').textContent).toBe('Total depth is required');
    expect(link.lines).toEqual([]);
    expect(uploads).toEqual([]);
    expect($('[data-preview-wrap]').hidden).toBe(true);
  });

  it('first GO previews only, second GO uploads cycle.nc and runs it', async () => {
    click('[data-go]');
    await flush();
    expect(link.lines).toEqual([]);
    expect($('[data-preview-wrap]').hidden).toBe(false);
    expect($('[data-code]').textContent).toContain('G7 G18 G20 G90 G94');
    click('[data-go]');
    await vi.waitFor(() => expect(link.lines).toEqual(['$F=/cycle.nc']));
    expect(uploads.map((u) => u.name)).toEqual(['/cycle.nc']);
    expect(uploads[0].text.trim().endsWith('M30')).toBe(true);
    expect(link.lines).toEqual(['$F=/cycle.nc']);
  });

  it('editing the form after the preview needs a fresh preview', async () => {
    click('[data-go]');
    await flush();
    setField('feed', '3');
    click('[data-go]');
    await flush();
    expect(uploads).toEqual([]);
    expect(link.lines).toEqual([]);
  });

  it('refuses to start while the machine is not Idle', async () => {
    click('[data-go]');
    await flush();
    link.status('<Run|MPos:0,0,0,0|D:1>');
    click('[data-go]');
    await flush();
    expect(uploads).toEqual([]);
    expect($('[data-msg]').textContent).toBe('Machine must be Idle to start (now Run)');
  });

  it('refuses rpm above the machine limit', async () => {
    setField('rpm', '50');
    click('[data-go]');
    await flush();
    expect($('[data-msg]').textContent).toBe('RPM above machine limit (40)');
  });
});

describe('jog pad (beside the DRO)', () => {
  beforeEach(() => app.showMode('DRO'));

  it('with the limits switch off (default), a step jog past a limit still goes', () => {
    app.state.setup.limits.xMax = 0.005;
    click('[data-step="0.01"]');
    fire('[data-jog="X+"]', 'pointerdown');
    expect(link.lines.length).toBe(1);
    expect(link.lines[0]).toMatch(/^\$J=/);
  });

  it('refuses a step jog past the stroke limits', () => {
    app.state.setup.limits.enabled = true;
    app.state.setup.limits.xMax = 0.005;
    click('[data-step="0.01"]');
    fire('[data-jog="X+"]', 'pointerdown');
    expect(link.lines).toEqual([]);
    expect($('[data-msg]').textContent).toBe('OVERTRAVEL X+: jog refused (X max 0.005)');
  });

  it('stops a continuous jog before it crosses a stroke limit', () => {
    vi.useFakeTimers();
    try {
      app.state.setup.limits.enabled = true;
      app.state.setup.limits.zMin = -0.06;
      click('[data-step="cont"]');
      fire('[data-jog="Z-"]', 'pointerdown');
      // pretend the machine follows the jog: Z moves 0.025 in per segment
      for (let k = 1; k <= 4; k++) { link.status(`<Jog|MPos:0,0,${(-0.025 * k * 25.4).toFixed(3)},0|D:1>`); vi.advanceTimersByTime(100); }
      expect(link.realtime).toContain(0x85);
      expect($('[data-msg]').textContent).toBe('OVERTRAVEL Z-: jog stopped (Z min -0.06)');
    } finally { vi.useRealTimers(); }
  });

  it('a step jog sends one jog line on press', () => {
    click('[data-step="0.01"]');
    fire('[data-jog="X-"]', 'pointerdown');
    expect(link.lines).toEqual(['$J=G91 G20 X-0.01 F10']);
  });

  it('a continuous jog sends a short segment then cancels on release', () => {
    click('[data-step="cont"]');
    fire('[data-jog="Z+"]', 'pointerdown');
    fire('[data-jog="Z+"]', 'pointerup');
    expect(link.lines).toEqual(['$J=G91 G20 Z0.025 F10']);
    expect(link.realtime).toEqual([0x85]);
  });

  it('HOLD in jog mode still sends feed hold (a program may be running)', () => {
    click('[data-hold]');
    expect(link.realtime).toEqual([0x21]);
  });

  it('HOLD during a continuous jog cancels the jog and holds', () => {
    click('[data-step="cont"]');
    fire('[data-jog="X+"]', 'pointerdown');
    click('[data-hold]');
    expect(link.realtime).toEqual([0x85, 0x21]);
  });

  it('a held continuous jog repeats short segments and stops when released', () => {
    vi.useFakeTimers();
    try {
      click('[data-step="cont"]');
      fire('[data-jog="Z-"]', 'pointerdown');
      vi.advanceTimersByTime(350);
      const n = link.lines.length;
      expect(n).toBeGreaterThanOrEqual(3);
      for (const l of link.lines) expect(l).toBe('$J=G91 G20 Z-0.025 F10');
      fire('[data-jog="Z-"]', 'pointerup');
      vi.advanceTimersByTime(500);
      expect(link.lines.length).toBe(n);
      expect(link.realtime).toEqual([0x85]);
    } finally { vi.useRealTimers(); }
  });
});
