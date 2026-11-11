// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { applyTool, dryRun, checkLimits, DRY_RUN_DZ } from '../src/transform.js';

describe('applyTool', () => {
  it('shifts absolute X (diameter) and Z by plus the tool offset (offset = T1 reading - true tip position)', () => {
    // T3 touches a 1.000 dia part while T1 coordinates read 1.120 -> dx 0.12; to put T3 at X1.0 command X1.12
    const out = applyTool(['G7 G18 G20 G90 G94', 'G0 X1.0000 Z0.0500', 'G1 Z-0.5000 F2', 'G0 C120.0000'], { dx: 0.12, dz: -0.2 });
    expect(out).toEqual(['G7 G18 G20 G90 G94', 'G0 X1.1200 Z-0.1500', 'G1 Z-0.7000 F2', 'G0 C120.0000']);
  });
  it('does not touch incremental moves or comments', () => {
    const out = applyTool(['G91', 'G1 Z-0.1', '(TOOL X1 Z2)', 'G90', 'G0 X1'], { dx: 0.5, dz: 0.5 });
    expect(out).toEqual(['G91', 'G1 Z-0.1', '(TOOL X1 Z2)', 'G90', 'G0 X1.5000']);
  });
  it('leaves code unchanged for tool 1 (no offset)', () => {
    const lines = ['G0 X1 Z0'];
    expect(applyTool(lines, { dx: 0, dz: 0 })).toEqual(lines);
    expect(applyTool(lines, undefined)).toEqual(lines);
  });
});

describe('dryRun', () => {
  it('lifts every absolute Z (here by 1.0 so the deepest point ends 0.5 above the face) and removes spindle starts', () => {
    expect(DRY_RUN_DZ).toBe(0.5);
    const out = dryRun(['G7 G18 G20 G90 G94', 'M3 S30', 'G0 X1 Z0.05', 'G1 Z-0.5 F2', 'M4 S10', 'M5']);
    expect(out).toEqual(['G7 G18 G20 G90 G94', '(DRY RUN: M3 S30 skipped)', 'G0 X1 Z1.0500', 'G1 Z0.5000 F2', '(DRY RUN: M4 S10 skipped)', 'M5']);
  });
  it('keeps thread C sync moves (they cut air)', () => {
    expect(dryRun(['G1 Z-0.5 C4320 F1.5'])).toEqual(['G1 Z0.5000 C4320 F1.5']);
  });
});

describe('checkLimits', () => {
  const limits = { enabled: true, xMax: 2, xMin: -0.05, zMax: 1, zMin: -3 };
  it('passes a program inside the stroke limits', () => {
    expect(checkLimits(['G0 X1 Z0.05', 'G1 X0 Z-1'], limits)).toBe(null);
  });
  it('names the axis, direction and line of an overtravel', () => {
    expect(checkLimits(['G0 X1 Z0.05', 'G1 Z-3.5 F2'], limits)).toBe('OVERTRAVEL Z- at line 2 (Z-3.5000 < Z min -3)');
    expect(checkLimits(['G0 X2.5'], limits)).toBe('OVERTRAVEL X+ at line 1 (X2.5000 > X max 2)');
  });
  it('follows modal positions across lines', () => {
    expect(checkLimits(['G0 X3', 'G0 X1'], limits)).toMatch(/^OVERTRAVEL X\+ at line 1/);
  });
  it('is off when no limits are set', () => {
    expect(checkLimits(['G0 X99'], null)).toBe(null);
  });
  it('is off when the limits switch is off', () => {
    expect(checkLimits(['G0 X99 Z-99'], { ...limits, enabled: false })).toBe(null);
  });
});

describe('review fixes: robust g-code parsing', () => {
  const limits = { enabled: true, xMax: 2, xMin: -0.05, zMax: 1, zMin: -3 };
  it('limits catch compact, lowercase, spaced and signed words', () => {
    expect(checkLimits(['G0X1.0Z-3.5'], limits)).toMatch(/^OVERTRAVEL Z-/);
    expect(checkLimits(['g1 x1 z-3.5'], limits)).toMatch(/^OVERTRAVEL Z-/);
    expect(checkLimits(['G1 Z -3.5'], limits)).toMatch(/^OVERTRAVEL Z-/);
    expect(checkLimits(['G0 X+2.5'], limits)).toMatch(/^OVERTRAVEL X\+/);
  });
  it('ignores words inside comments', () => {
    expect(checkLimits(['G0 X1 (Z-99)'], limits)).toBe(null);
  });
  it('G91.1 is not incremental mode', () => {
    expect(applyTool(['G91.1', 'G0 X1'], { dx: 0.5, dz: 0 })).toEqual(['G91.1', 'G0 X1.5000']);
  });
  it('compact G91G1 is incremental: no tool offset added', () => {
    expect(applyTool(['G91G1Z-0.1'], { dx: 0, dz: 0.5 })).toEqual(['G91G1Z-0.1']);
  });
  it('tool offsets apply to compact and lowercase code', () => {
    expect(applyTool(['g0x1z0'], { dx: 0.1, dz: 0.2 })).toEqual(['g0X1.1000Z0.2000']);
  });
});

describe('review fixes: dry run', () => {
  it('lifts the whole program clear of the face, not just 0.5 in', () => {
    const out = dryRun(['G0 X1 Z0.05', 'G1 Z-1.5 F2']);
    const zs = out.join(' ').match(/Z(-?[0-9.]+)/g).map((w) => Number(w.slice(1)));
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
  it('skips spindle starts anywhere in the line', () => {
    for (const l of ['N10 M3 S500', 'G97 S500 M03', 'M3S500', 'm4 s20']) {
      expect(dryRun([l])[0]).toMatch(/^\(DRY RUN: .* skipped\)$/);
    }
    expect(dryRun(['M30'])).toEqual(['M30']);
  });
});
