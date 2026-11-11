// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Keypad entry: pick an axis, type a number, then ABS SET (axis reads that value here)
// or INC SET (axis reading moves by that value). Both become a G10 L20 P0 work-offset line.
// X is a diameter: the UI keeps the lathe in G7.

const AXES = ['X', 'Z', 'C'];
const trim = (n) => String(Number(n.toFixed(6)));

// Review 2026-11-10: zero is for the ACTIVE tool tip, like ABS SET. The work offset lives in the T1 frame, so the
// tip reads 0 when the T1 reading is the tool offset. With T1 (no offsets) the line is the plain G10 L20 P0 X0.
export const zeroLine = (axis, off = { dx: 0, dz: 0 }) => {
  const dx = off.dx || 0, dz = off.dz || 0;
  if (!dx && !dz) return axis === 'ALL' ? 'G10 L20 P0 X0 Z0 C0' : `G10 L20 P0 ${axis}0`;
  const v = { X: trim(dx), Z: trim(dz), C: '0' };
  const words = axis === 'ALL' ? `X${v.X} Z${v.Z} C0` : `${axis}${v[axis]}`;
  return `G7 G20 G10 L20 P0 ${words}`; // G7 G20 so an X offset is a diameter in inches even after a reset
};
// G7 G20 ride along so a set after a reset (grblHAL boots G8 radius, maybe G21) is still diameter inches.
export const setLine = (axis, value) => `G7 G20 G10 L20 P0 ${axis}${trim(value)}`;

export class Keypad {
  constructor() { this.clear(); }

  clear() { this.axis = null; this.text = ''; this.negative = false; }

  get display() {
    if (!this.axis && !this.text) return '';
    return `${this.axis ?? ''} ${this.negative ? '-' : ''}${this.text}`.trim();
  }

  get value() {
    if (!/\d/.test(this.text)) return null;
    const v = Number(this.text);
    return Number.isFinite(v) ? (this.negative ? -v : v) : null;
  }

  press(key, ctx = {}) {
    if (AXES.includes(key)) { this.axis = key; return null; }
    if (/^[0-9]$/.test(key)) { this.text += key; return null; }
    switch (key) {
      case '.': if (!this.text.includes('.')) this.text += '.'; return null;
      case '+/-': this.negative = !this.negative; return null;
      case 'CLEAR': this.clear(); return null;
      case 'ABS SET':
      case 'INC SET': {
        const v = this.value;
        if (!this.axis || v === null) return null;
        // value is for the active tool tip; the work offset is set in the T1 frame (tip + offset)
        const target = (key === 'INC SET' ? (ctx.current ?? 0) + v : v) + (ctx.offset ?? 0);
        const action = { type: 'line', line: setLine(this.axis, target) };
        this.clear();
        return action;
      }
      default: return null;
    }
  }
}
