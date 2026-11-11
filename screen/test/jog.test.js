// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { jogLine, JOG_CANCEL, CONT_DISTANCE } from '../src/jog.js';

describe('jogLine', () => {
  it('steps X minus in inches', () => {
    expect(jogLine({ axis: 'X', dir: -1, step: 0.001, feed: 10 })).toBe('$J=G91 G20 X-0.001 F10');
  });
  it('continuous Z plus uses the long distance', () => {
    expect(jogLine({ axis: 'Z', dir: 1, step: 'cont', feed: 20 })).toBe('$J=G91 G20 Z10 F20');
  });
  it('C jogs in degrees without G20', () => {
    expect(jogLine({ axis: 'C', dir: -1, step: 15, feed: 720 })).toBe('$J=G91 C-15 F720');
    expect(jogLine({ axis: 'C', dir: 1, step: 'cont', feed: 720 })).toBe('$J=G91 C3600 F720');
  });
  it('exports the jog cancel byte and distances', () => {
    expect(JOG_CANCEL).toBe(0x85);
    expect(CONT_DISTANCE).toEqual({ X: 2, Z: 10, C: 3600 });
  });
  it('refuses a bad axis or feed', () => {
    expect(() => jogLine({ axis: 'Y', dir: 1, step: 0.1, feed: 10 })).toThrow();
    expect(() => jogLine({ axis: 'X', dir: 1, step: 0.1, feed: 0 })).toThrow();
  });
});
