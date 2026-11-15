// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { project, fitTransform, zoomAt, viewerFor, world, drawnPoints } from '../src/ui/viewer.js';
import { toolpath, drawPreview } from '../src/ui/preview.js';
import { createBackplot } from '../src/backplot.js';

describe('viewer projections', () => {
  it('SIDE: Z across, radius up', () => {
    expect(project('SIDE', { x: 2, z: -1 })).toEqual({ u: -1, v: 1 });
  });
  it('END: the chuck angle turns the radius around the centre', () => {
    const f = project('END', { x: 2, z: -5, c: 90 });
    expect(f.u).toBeCloseTo(0, 9);
    expect(f.v).toBeCloseTo(1, 9);
  });
  it('3D with no yaw or pitch is the SIDE view', () => {
    const f = project('3D', { x: 2, z: -1, c: 0 }, { yaw: 0, pitch: 0 });
    expect(f.u).toBeCloseTo(-1, 9);
    expect(f.v).toBeCloseTo(1, 9);
  });
  it('3D yaw 90 looks down Z: a point at C 90 moves across, Z drops out', () => {
    const f = project('3D', { x: 2, z: -3, c: 90 }, { yaw: 90, pitch: 0 });
    expect(f.u).toBeCloseTo(1, 9);
    expect(f.v).toBeCloseTo(0, 9);
  });
  it('world keeps the radius at any chuck angle', () => {
    const w = world({ x: 3, z: 0, c: 37 });
    expect(Math.hypot(w.wx, w.wy)).toBeCloseTo(1.5, 9);
  });
});

describe('fit and zoom', () => {
  it('fits the points into the canvas, centred', () => {
    const t = fitTransform([{ u: -1, v: 0 }, { u: 1, v: 1 }], 220, 120, 10);
    expect(t.k).toBeCloseTo(100, 9); // width 2 into 200, height 1 into 100
    expect(t.ox + 0 * t.k).toBeCloseTo(110, 9); // u 0 at the middle
    expect(t.oy - 0.5 * t.k).toBeCloseTo(60, 9); // v 0.5 at the middle
  });
  it('zooming at a point keeps that point still', () => {
    const t = { k: 50, ox: 10, oy: 200 };
    const u = (120 - t.ox) / t.k, v = (t.oy - 80) / t.k; // the world point under (120, 80)
    const z = zoomAt(t, 2, 120, 80);
    expect(z.k).toBe(100);
    expect(z.ox + u * z.k).toBeCloseTo(120, 9);
    expect(z.oy - v * z.k).toBeCloseTo(80, 9);
  });
});

describe('FIT covers what is drawn', () => {
  it('END: a helix reaches the full radius on every side, not just its end points', () => {
    const flat = drawnPoints('END', { pts: [{ x: 2, z: 0, c: 0 }, { x: 2, z: -1, c: 720 }] }).map((p) => project('END', p));
    expect(Math.min(...flat.map((f) => f.u))).toBeLessThan(-0.99); // sampled every few degrees: within 1%
    expect(Math.min(...flat.map((f) => f.v))).toBeLessThan(-0.99);
  });
  it('3D and END include the revolved ghost of a plain turning program; SIDE does not', () => {
    const pts = [{ x: 2, z: 0, rapid: false }, { x: 2, z: -1, rapid: false }];
    expect(drawnPoints('SIDE', { pts })).toHaveLength(2);
    expect(Math.min(...drawnPoints('END', { pts }).map((p) => project('END', p).u))).toBeCloseTo(-1, 6);
  });
});

describe('toolpath reads C', () => {
  it('absolute and incremental C, and C-only moves', () => {
    const pts = toolpath(['G90 G1 X1 Z0 F10', 'G1 C90', 'G91 G1 C-30 Z-1', 'G90 G1 X0.5']);
    expect(pts.map((p) => p.c)).toEqual([undefined, 90, 60, 60]);
    expect(pts.at(-1)).toEqual({ x: 0.5, z: -1, c: 60, rapid: false });
  });
  it('programs with no C keep plain { x, z } points', () => {
    expect(toolpath(['G0 X1 Z0.1'])).toEqual([{ x: 1, z: 0.1, rapid: true }]);
  });
});

describe('backplot keeps C', () => {
  it('records chuck turns even when X and Z stay put', () => {
    const b = createBackplot();
    b.add({ x: 1, z: 0, c: 0 });
    b.add({ x: 1, z: 0, c: 0.2 }); // under a degree: dropped
    b.add({ x: 1, z: 0, c: 45 });
    expect(b.points).toEqual([{ x: 1, z: 0, c: 0 }, { x: 1, z: 0, c: 45 }]);
  });
});

describe('viewer toolbar', () => {
  it('drawPreview gives each canvas one toolbar with SIDE / END / 3D / + / - / FIT', () => {
    document.body.innerHTML = '<div><canvas></canvas></div>';
    const cv = document.querySelector('canvas');
    drawPreview(cv, [{ x: 1, z: 0 }], null);
    drawPreview(cv, [{ x: 1, z: 0 }], null);
    const bars = document.querySelectorAll('.vbar');
    expect(bars.length).toBe(1);
    expect([...bars[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['SIDE', 'END', '3D', '+', '−', 'FIT']);
  });
  it('the view buttons switch the view and light up', () => {
    document.body.innerHTML = '<div><canvas></canvas></div>';
    const cv = document.querySelector('canvas');
    const v = viewerFor(cv);
    v.bar.querySelector('[data-vview="END"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(v.state.view).toBe('END');
    expect(v.bar.querySelector('.on').textContent).toBe('END');
  });
});
