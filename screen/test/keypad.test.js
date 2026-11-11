// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { Keypad, zeroLine, setLine } from '../src/keypad.js';

const type = (kp, keys, ctx) => {
  let out = null;
  for (const k of keys) out = kp.press(k, ctx);
  return out;
};

describe('zero and set lines', () => {
  it('zeroes one axis or all three', () => {
    expect(zeroLine('X')).toBe('G10 L20 P0 X0');
    expect(zeroLine('Z')).toBe('G10 L20 P0 Z0');
    expect(zeroLine('C')).toBe('G10 L20 P0 C0');
    expect(zeroLine('ALL')).toBe('G10 L20 P0 X0 Z0 C0');
  });
  it('sets an axis to a value', () => {
    expect(setLine('X', 1.25)).toBe('G7 G20 G10 L20 P0 X1.25');
  });
});

describe('Keypad', () => {
  it('X 1.25 ABS SET sets X (diameter) to 1.25', () => {
    const kp = new Keypad();
    expect(type(kp, ['X', '1', '.', '2', '5', 'ABS SET'])).toEqual({ type: 'line', line: 'G7 G20 G10 L20 P0 X1.25' });
  });

  it('INC SET adds the typed value to the current reading', () => {
    const kp = new Keypad();
    type(kp, ['Z', '0', '.', '1']);
    expect(kp.press('INC SET', { current: 0.5 })).toEqual({ type: 'line', line: 'G7 G20 G10 L20 P0 Z0.6' });
  });

  it('+/- toggles the sign', () => {
    const kp = new Keypad();
    expect(type(kp, ['Z', '2', '+/-', 'ABS SET'])).toEqual({ type: 'line', line: 'G7 G20 G10 L20 P0 Z-2' });
  });

  it('ignores a second decimal point', () => {
    const kp = new Keypad();
    type(kp, ['X', '1', '.', '.', '5']);
    expect(kp.display).toBe('X 1.5');
  });

  it('CLEAR resets the entry', () => {
    const kp = new Keypad();
    type(kp, ['X', '1', 'CLEAR']);
    expect(kp.display).toBe('');
  });

  it('ABS SET with no number does nothing', () => {
    const kp = new Keypad();
    expect(type(kp, ['X', 'ABS SET'])).toBe(null);
    expect(new Keypad().press('ABS SET')).toBe(null);
  });

  it('a digit without an axis does nothing on SET', () => {
    const kp = new Keypad();
    expect(type(kp, ['5', 'ABS SET'])).toBe(null);
  });

  it('clears after a successful set', () => {
    const kp = new Keypad();
    type(kp, ['X', '1', 'ABS SET']);
    expect(kp.display).toBe('');
  });
});
