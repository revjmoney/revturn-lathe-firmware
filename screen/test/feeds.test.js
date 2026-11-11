// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { programmedAt, lineAtPct, createSpeedMeter } from '../src/feeds.js';

describe('programmedAt', () => {
  const lines = ['G20 G7', 'M3 S150', 'G1 X1 Z0 F10', '(F99 in a comment)', 'G1 Z-1', 'G1 X0.9 F4.5', 'G93 G1 C360 F6', 'G94 G1 Z0 F12'];
  it('keeps the last F and S up to the line', () => {
    expect(programmedAt(lines, 0)).toEqual({ f: null, s: null, inverse: false });
    expect(programmedAt(lines, 4)).toEqual({ f: 10, s: 150, inverse: false });
    expect(programmedAt(lines, 5).f).toBe(4.5);
  });
  it('ignores F in comments, and F is not a feed in G93', () => {
    expect(programmedAt(lines, 3).f).toBe(10);
    expect(programmedAt(lines, 6)).toEqual({ f: null, s: 150, inverse: true });
    expect(programmedAt(lines, 7).f).toBe(12);
  });
  it('maps SD percent to a line inside the program', () => {
    expect(lineAtPct(10, 0)).toBe(0);
    expect(lineAtPct(10, 55)).toBe(5);
    expect(lineAtPct(10, 100)).toBe(9);
  });
});

describe('createSpeedMeter', () => {
  it('turns position changes into per-axis speeds (in/min, rpm)', () => {
    const m = createSpeedMeter({ smooth: 0 });
    m.update([0, 0, 0], 0);
    const v = m.update([0.05, -0.1, 180], 1000); // in 1 s: X 0.05 in, Z 0.1 in, C half a turn
    expect(v.x).toBeCloseTo(3, 6);
    expect(v.z).toBeCloseTo(6, 6);
    expect(v.c).toBeCloseTo(30, 6);
  });
  it('ignores a report with no time step', () => {
    const m = createSpeedMeter({ smooth: 0 });
    m.update([0, 0, 0], 5);
    expect(m.update([1, 1, 1], 5)).toEqual({ x: 0, z: 0, c: 0 });
  });
});
