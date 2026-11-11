// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Backplot: the real tool-tip path traced from live status, drawn over the program path (Rev 2026-11-08).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBackplot } from '../src/backplot.js';
import { toolpath, plotBounds } from '../src/ui/preview.js';
import { startApp } from '../src/app.js';
import { registerProgram } from '../src/ui/program.js';
import { FakeLink } from './helpers/fake-link.js';

describe('createBackplot', () => {
  it('records moves, skips points closer than minStep', () => {
    const b = createBackplot({ minStep: 0.001 });
    b.add({ x: 1, z: 0 });
    b.add({ x: 1, z: 0.0004 });  // too close: skipped
    b.add({ x: 1, z: -0.5 });
    expect(b.points).toEqual([{ x: 1, z: 0 }, { x: 1, z: -0.5 }]);
  });
  it('ignores non-numbers', () => {
    const b = createBackplot();
    b.add({ x: NaN, z: 0 }); b.add(null);
    expect(b.points).toEqual([]);
  });
  it('keeps only the newest max points', () => {
    const b = createBackplot({ minStep: 0, max: 3 });
    for (let i = 0; i < 5; i++) b.add({ x: 0, z: -i });
    expect(b.points.map((p) => p.z)).toEqual([-2, -3, -4]);
  });
  it('clear empties the trail', () => {
    const b = createBackplot();
    b.add({ x: 1, z: 0 }); b.clear();
    expect(b.points).toEqual([]);
  });
});

describe('toolpath with incremental moves', () => {
  it('follows G91 incremental X/Z and G90 back to absolute', () => {
    const pts = toolpath(['G90 G1 Z0 F10', 'G91 G93', 'G1 Z-2 C-7200 F2.5', 'G1 Z0.5 C720 F5', 'G90 G94', 'G1 Z-3 F5']);
    expect(pts.map((p) => p.z)).toEqual([0, -2, -1.5, -3]);
  });
});

describe('plotBounds', () => {
  it('covers the program path, the trail and the tool', () => {
    const b = plotBounds([{ x: 1, z: 0 }, { x: 1, z: -1 }], [{ x: 3, z: -4 }], { x: 0.5, z: 0.8 });
    expect(b).toEqual({ zMin: -4, zMax: 0.8, rMin: 0, rMax: 1.5 });
  });
  it('works with only a trail (no program)', () => {
    expect(plotBounds([], [{ x: 2, z: -1 }, { x: 2, z: 0 }], null)).toEqual({ zMin: -1, zMax: 0, rMin: 0, rMax: 1 });
  });
  it('fits negative X too (X zero set mid-travel): the whole program, not just above the centerline', () => {
    expect(plotBounds([{ x: -3.5, z: 1.8 }, { x: 3.5, z: -1.8 }], [], null)).toEqual({ zMin: -1.8, zMax: 1.8, rMin: -1.75, rMax: 1.75 });
  });
  it('returns null when there is nothing to draw', () => {
    expect(plotBounds([], [], null)).toBe(null);
  });
});

describe('live backplot in the app', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink();
    app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    registerProgram(app);
    link.setConnected(true);
  });
  afterEach(() => { app.stop(); vi.useRealTimers(); });

  it('traces the tool tip from status reports, in every mode', () => {
    link.status('<Idle|MPos:0,0,0,0|WCO:0,0,0,0>');
    click($('[data-mode="CYCLES"]'));
    link.status('<Jog|MPos:0,0,-25.4,0>');
    link.status('<Jog|MPos:0,0,-50.8,0>');
    const pts = app.backplot.points;
    expect(pts.length).toBe(3);
    expect(pts.at(-1).z).toBeCloseTo(app.t1Reading('Z'), 6);
  });

  // Rev 2026-11-09: the backplot is its own DOS-style window, opened from the top bar (any screen), DRO or RUN
  it('backplot window opens from the top bar, DRO and RUN; CLEAR works; Esc and [■] close it', () => {
    link.status('<Idle|MPos:0,0,0,0|WCO:0,0,0,0>');
    link.status('<Idle|MPos:0,0,-25.4,0>');
    expect($('[data-backplot]')).toBe(null); // no small canvas on the DRO screen any more
    expect(app.backplot.points.length).toBe(2); // still traced in the background
    click($('.top [data-open-backplot]'));
    expect($('[data-pop]').hidden).toBe(false);
    expect($('[data-pop-title]').textContent).toBe('[ BACKPLOT ]');
    expect($('[data-pop] [data-backplot]')).not.toBe(null);
    click($('[data-trail-clear]'));
    expect(app.backplot.points).toEqual([app.tipPosition()]); // the new trail starts where the tool is now
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($('[data-pop]').hidden).toBe(true);
    expect($('[data-backplot]')).toBe(null);
    click($('[data-panel] [data-open-backplot]')); // the DRO screen's own button
    expect(app.popup.kind).toBe('backplot');
    click($('[data-pop-close]'));
    expect(app.popup.kind).toBe(null);
    // Rev 2026-11-11: RUN is its own big window with the backplot drawn inside it
    click($('[data-mode="RUN"]'));
    expect(app.popup.kind).toBe('mode:RUN');
    expect($('[data-pop] [data-backplot]')).not.toBe(null);
  });

  // Rev 2026-11-11: the mode buttons stay visible, so tapping one leaves the window; BACKPLOT toggles
  it('tapping a mode closes the backplot window, BACKPLOT toggles it; HOLD / STOP stay outside it', () => {
    click($('.top [data-open-backplot]'));
    expect(app.popup.kind).toBe('backplot');
    click($('[data-mode="SET UP"]'));
    expect(app.popup.kind).toBe(null);
    click($('.top [data-open-backplot]'));
    expect(app.popup.kind).toBe('backplot');
    click($('.top [data-open-backplot]'));
    expect(app.popup.kind).toBe(null);
    click($('.top [data-open-backplot]'));
    expect(app.popup.kind).toBe('backplot');
    expect($('[data-pop] [data-hold]')).toBe(null);
    expect($('.right [data-hold]')).not.toBe(null);
  });
});
