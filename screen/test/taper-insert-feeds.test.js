// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-15: taper correction, the Insert key starts/stops the spindle, fractional X/Z jog feeds.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyTaper } from '../src/transform.js';
import { normalizeSetup, defaultSetup } from '../src/setup.js';
import { prepareCycle } from '../src/run.js';
import { startApp } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { registerSetup } from '../src/ui/setup.js';
import { FakeLink } from './helpers/fake-link.js';

const T = { enabled: true, perInch: 0.0133, zRef: 0 };

describe('applyTaper', () => {
  it('is a no-op when off or zero', () => {
    const l = ['G0 X1 Z0', 'G1 Z-2 F2'];
    expect(applyTaper(l, { ...T, enabled: false })).toBe(l);
    expect(applyTaper(l, { ...T, perInch: 0 })).toBe(l);
    expect(applyTaper(l, undefined)).toBe(l);
  });
  it('walks X along a Z cut: fatter toward Z+ means a smaller X there (Rev: 0.030 over 2.25)', () => {
    const out = applyTaper(['G7 G18 G20 G90 G94', 'G0 X1.0000 Z0.0500', 'G1 Z-2.2500 F2', 'G0 X1.2 (retract)'], { enabled: true, perInch: 0.03 / 2.25, zRef: 0 });
    expect(out[1]).toBe('G0 X0.9993 Z0.0500');            // 1 - 0.01333 * 0.05
    expect(out[2]).toBe('G1 X1.0300 Z-2.2500 F2');        // toward the chuck: X grows by 0.030
    expect(out[3]).toBe('G0 X1.2300 (retract)');
  });
  it('zRef sets where the correction is zero', () => {
    expect(applyTaper(['G0 X1 Z-1'], { ...T, zRef: -1 })).toEqual(['G0 X1 Z-1']);
  });
  it('never touches comments, C-only moves, dwells or $ lines', () => {
    const out = applyTaper(['G0 X1 Z-1', '(Z5 X9)', 'G0 C90', 'G4 P1', '$H'], T);
    expect(out.slice(1)).toEqual(['(Z5 X9)', 'G0 C90', 'G4 P1', '$H']);
  });
  it('thread passes (Z with C) get X too, so the thread is straight', () => {
    const out = applyTaper(['G0 X0.5 Z0.1', 'G1 Z-1 C3600 F1'], T);
    expect(out[1]).toBe('G1 X0.5133 Z-1 C3600 F1');
  });
  it('arcs shift as a whole by the correction where they start; the next line catches up', () => {
    const out = applyTaper(['G0 X1 Z0', 'G1 Z-1 F2', 'G2 X1.2 Z-1.1 K-0.1', 'G1 Z-2'], T);
    expect(out[2]).toBe('G2 X1.2133 Z-1.1 K-0.1');
    expect(out[3]).toBe('G1 X1.2266 Z-2');
  });
  it('G91 moves get the change in correction added to the X step', () => {
    const out = applyTaper(['G90 G0 X1 Z0', 'G91', 'G1 Z-1 F2', 'G1 X0.1'], T);
    expect(out[2]).toBe('G1 X0.0133 Z-1 F2');
    expect(out[3]).toBe('G1 X0.1');
  });
  it('G8 radius mode uses half, G21 converts zRef', () => {
    expect(applyTaper(['G8 G0 X1 Z-1'], T)).toEqual(['G8 G0 X1.0067 Z-1']);
    expect(applyTaper(['G21 G0 X10 Z-25.4'], { ...T, zRef: -1 })).toEqual(['G21 G0 X10 Z-25.4']);
  });
});

describe('taper in setup.json and the cycles', () => {
  it('old setup.json files load with taper off', () => {
    expect(defaultSetup().taper).toEqual({ enabled: false, perInch: 0, zRef: 0 });
    expect(normalizeSetup({}).taper).toEqual({ enabled: false, perInch: 0, zRef: 0 });
    expect(normalizeSetup({ taper: { enabled: true, perInch: 0.0133, zRef: 'x' } }).taper).toEqual({ enabled: true, perInch: 0.0133, zRef: 0 });
  });
  it('a Turn cycle comes out corrected when it is on', () => {
    const setup = normalizeSetup({ taper: { enabled: true, perInch: 0.02, zRef: 0 } });
    const p = { zStart: 0, length: 1, startDia: 1, finishDia: 0.9, step: 0.05, finishAllow: 0, roughFeed: 2, finishFeed: 1, rpm: 100 };
    const on = prepareCycle('turn', p, { maxRpm: 450, c0: 0, setup });
    const off = prepareCycle('turn', p, { maxRpm: 450, c0: 0, setup: normalizeSetup({}) });
    expect(on.ok && off.ok).toBe(true);
    expect(on.lines.join('\n')).not.toBe(off.lines.join('\n'));
    expect(on.lines.length).toBe(off.lines.length);                 // words added, never lines
    expect(on.lines.some((l) => /^G1 X0\.9\d+ Z-1\.0000/.test(l))).toBe(true);
  });
});

describe('screen: Insert key and fractional jog feeds', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  const key = (k, target = document.body, extra = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink();
    app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    registerJog(app); registerSetup(app);
    link.setConnected(true);
    link.line('$30=450.000');
    link.status('<Idle|MPos:0,0,0,0>');
    link.lines.length = 0;
  });
  afterEach(() => app.stop());

  it('Insert starts the spindle at the slider speed, Insert again stops it', () => {
    const r = $('[data-spin-rpm]'); r.value = '120'; r.dispatchEvent(new Event('input', { bubbles: true }));
    key('Insert');
    expect(link.lines.at(-1)).toBe('M3 S120');
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    key('Insert');
    expect(link.lines.at(-1)).toBe('M5');
  });
  it('Insert is ignored while typing in a box, on key repeat, and while a program runs', () => {
    document.body.insertAdjacentHTML('beforeend', '<input id="box">');
    key('Insert', document.getElementById('box'));
    key('Insert', document.body, { repeat: true });
    link.status('<Run|MPos:0,0,0,0>');
    key('Insert');
    expect(link.lines.filter((l) => /^M[345]/.test(l))).toEqual([]);
  });
  it('Insert still works with focus on the spindle slider', () => {
    key('Insert', $('[data-spin-rpm]'));
    expect(link.lines.at(-1)).toBe('M3 S30');
  });
  it('the X/Z jog slider goes down to 0.1 in/min in 0.1 steps and jogs at 0.5', () => {
    app.showMode('JOG');
    const s = $('[data-xz-feed]');
    expect(s.min).toBe('0.1'); expect(s.step).toBe('0.1');
    s.value = '0.5'; s.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('[data-xz-show]').textContent).toBe('0.5 IPM');
    $('[data-step="0.01"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    $('[data-jog="Z-"]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(link.lines.at(-1)).toMatch(/Z-0\.01 F0\.5$/);
  });
});

describe('screen: tap the DRO number to set it', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink();
    app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0>');
    link.lines.length = 0;
  });
  afterEach(() => { app.stop(); delete window.prompt; });
  const tap = (k) => $(`.drotop .readout [data-dro="${k}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('tapping X asks for the diameter and sets it with G10 L20 (T1, no offset)', () => {
    window.prompt = () => '1.250';
    tap('x');
    expect(link.lines.at(-1)).toBe('G7 G20 G10 L20 P0 X1.25');
  });
  it('tapping Z sets Z; the active tool offset rides along like ABS SET', () => {
    app.state.setup.tools[1].dz = -0.1; app.state.setup.activeTool = 2;
    window.prompt = () => '0';
    tap('z');
    expect(link.lines.at(-1)).toBe('G7 G20 G10 L20 P0 Z-0.1');
  });
  it('cancel, junk, or a running machine send nothing', () => {
    window.prompt = () => null; tap('x');
    window.prompt = () => 'abc'; tap('x');
    link.status('<Run|MPos:0,0,0,0>');
    window.prompt = () => '1'; tap('x');
    expect(link.lines.filter((l) => /G10/.test(l))).toEqual([]);
  });
});

import { taperMdiLine, modesAfter } from '../src/transform.js';
describe('taper on MDI lines', () => {
  const M = { absolute: true, diameter: true, mm: false, motion: 0 };
  it('a Z-only cut from where the tool sits walks X (DRO is the truth)', () => {
    expect(taperMdiLine('G1 Z-2.25 F1', { enabled: true, perInch: 0.0133, zRef: 0 }, M, { x: 1, z: 0 })).toBe('G1 X1.0299 Z-2.25 F1');
  });
  it('an absolute X/Z move is corrected for its Z; G91 steps get the change; off = unchanged', () => {
    const T = { enabled: true, perInch: 0.0133, zRef: 0 };
    expect(taperMdiLine('G0 X1 Z-1', T, M, { x: 2, z: 0 })).toBe('G0 X1.0133 Z-1');
    expect(taperMdiLine('G1 Z-1', T, { ...M, absolute: false, motion: 1 }, { x: 1, z: 0 })).toBe('G1 X0.0133 Z-1');
    expect(taperMdiLine('G1 Z-1', { ...T, enabled: false }, M, { x: 1, z: 0 })).toBe('G1 Z-1');
    expect(taperMdiLine('M3 S100', T, M, { x: 1, z: 0 })).toBe('M3 S100');
  });
  it('modesAfter tracks G90/G91, G7/G8, G20/G21 and the motion mode', () => {
    expect(modesAfter('G91 G21 G8 G1', { absolute: true, diameter: true, mm: false, motion: 0 })).toEqual({ absolute: false, diameter: false, mm: true, motion: 1 });
  });
  it('the screen corrects a typed MDI line and shows what it sent', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app'), link = new FakeLink();
    const app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    try {
      link.setConnected(true);
      link.line('$13=1');                                    // reports in inches
      link.line('[GC:G1 G54 G17 G7 G20 G90 G94]');
      link.status('<Idle|WPos:1.0000,0,0.0000,0>');
      app.state.setup.taper = { enabled: true, perInch: 0.0133, zRef: 0 };
      link.lines.length = 0;
      const box = root.querySelector('[data-mdi-input]');
      box.value = 'G1 Z-2.25 F1';
      root.querySelector('[data-mdi-send]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(link.lines.at(-1)).toBe('G1 X1.0299 Z-2.25 F1');
      await Promise.resolve();
      expect(root.querySelector('[data-mdi-log]').textContent).toContain('(taper corrected) G1 X1.0299 Z-2.25 F1');
    } finally { app.stop(); }
  });
});

describe('taper on Z jogs (Rev 2026-11-15: "yes add it to the z jog too")', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  const down = (j) => $(`[data-jog="${j}"]`).dispatchEvent(new Event('pointerdown', { bubbles: true }));
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink();
    app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    registerJog(app);
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0>');
    app.state.setup.taper = { enabled: true, perInch: 0.02, zRef: 0 };
    app.showMode('JOG');
    link.lines.length = 0;
  });
  afterEach(() => app.stop());
  const pickStep = (s) => $(`[data-step="${s}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('a Z- step jog toward the chuck carries the matching X step', () => {
    pickStep('0.1'); down('Z-');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 X0\.002 Z-0\.1 F/);
  });
  it('a Z+ step jog takes X back the other way', () => {
    pickStep('0.1'); down('Z+');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 X-0\.002 Z0\.1 F/);
  });
  it('X jogs, C jogs and taper off stay plain', () => {
    pickStep('0.1'); down('X+');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 X0\.1 F/);
    app.state.setup.taper.enabled = false; down('Z-');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 Z-0\.1 F/);
  });
  it('radius mode (G8) uses half the diameter step', () => {
    link.line('[GC:G0 G54 G17 G8 G20 G90 G94]');
    pickStep('0.1'); down('Z-');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 X0\.001 Z-0\.1 F/);
  });
  it('CONT jog segments carry X too', () => {
    pickStep('cont'); down('Z-');
    expect(link.lines.at(-1)).toMatch(/^\$J=G91 G20 X0\.\d+ Z-0\.\d+ F/);
  });
});
