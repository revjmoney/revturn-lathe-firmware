// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { droView } from '../src/dro.js';

const base = { state: 'Idle', sub: null, mpos: [0, 0, 0, 0], wco: [0, 0, 0, 0], wpos: [0, 0, 0, 0], feed: 0, rpm: 0, spindle: 'off', diameter: true, ov: null };
const st = (o) => ({ ...base, ...o });

describe('droView', () => {
  it('shows inches with 4 decimals and does not double X again in diameter mode', () => {
    const v = droView(st({ wpos: [25.4, 0, -12.7, 0] }), 'in');
    expect(v.x).toBe('1.0000');
    expect(v.z).toBe('-0.5000');
    expect(v.xTag).toBe('DIA');
  });

  it('shows mm with 3 decimals', () => {
    const v = droView(st({ wpos: [25.4, 0, -12.7, 0] }), 'mm');
    expect(v.x).toBe('25.400');
    expect(v.z).toBe('-12.700');
  });

  it('labels radius mode', () => {
    expect(droView(st({ diameter: false }), 'in').xTag).toBe('RAD');
  });

  it('shows spindle speed and direction while the spindle runs', () => {
    const v = droView(st({ spindle: 'cw', rpm: 40 }), 'in');
    expect(v.spindleLabel).toBe('S');
    expect(v.spindleValue).toBe('40 RPM');
    expect(v.spindleTag).toBe('FWD');
    expect(droView(st({ spindle: 'ccw', rpm: 12 }), 'in').spindleTag).toBe('REV');
  });

  it('shows the chuck angle 0-360 when the spindle is off', () => {
    const v = droView(st({ wpos: [0, 0, 0, 487.5] }), 'in');
    expect(v.spindleLabel).toBe('C');
    expect(v.spindleValue).toBe('127.50°');
    expect(droView(st({ wpos: [0, 0, 0, -90] }), 'in').spindleValue).toBe('270.00°');
    expect(droView(st({ wpos: [0, 0, 0, -2160.011] }), 'in').spindleValue).toBe('0.00°'); // one step short of a whole turn
    expect(droView(st({ wpos: [0, 0, 0, 359.996] }), 'in').spindleValue).toBe('0.00°');
  });

  it('never shows negative zero', () => {
    expect(droView(st({ wpos: [-0.00001, 0, 0, 0] }), 'in').x).toBe('0.0000');
  });

  it('passes the machine state through', () => {
    expect(droView(st({ state: 'Alarm' }), 'in').state).toBe('Alarm');
  });
});

describe('droView options', () => {
  it('handles inch reports ($13=1) without converting twice', () => {
    expect(droView(st({ wpos: [1, 0, -0.5, 0] }), 'in', { reportUnits: 'in' }).x).toBe('1.0000');
  });
  it('shows the active tool tip (T1 reading minus the tool offset)', () => {
    const v = droView(st({ wpos: [25.4 * 1.12, 0, 0, 0] }), 'in', { tool: { dx: 0.12, dz: 0 } });
    expect(v.x).toBe('1.0000');
  });
});
