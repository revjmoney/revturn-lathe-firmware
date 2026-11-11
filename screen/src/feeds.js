// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Set vs actual speeds for the RUN window's DRO strip (Rev 2026-11-11).
// "Set" = the F / S words in effect at the running line of the program. "Actual" = what the axes really do,
// from position changes between status reports (includes acceleration), and grblHAL's own FS feed / rpm.

const strip = (line) => line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').toUpperCase();

// F / S in effect at program line idx (lines are the compiled program; inches, G20). f is null in G93
// (inverse time: the F word is not a feed rate there).
export function programmedAt(lines, idx) {
  let f = null, s = null, inverse = false;
  const end = Math.min(lines.length - 1, idx);
  for (let i = 0; i <= end; i++) {
    const l = strip(lines[i]);
    if (/G93(?!\d)/.test(l)) inverse = true;
    if (/G94(?!\d)/.test(l)) inverse = false;
    const fm = /F\s*(\d+\.?\d*|\.\d+)/.exec(l);
    if (fm) f = Number(fm[1]);
    const sm = /S\s*(\d+\.?\d*|\.\d+)/.exec(l);
    if (sm) s = Number(sm[1]);
  }
  return { f: inverse ? null : f, s, inverse };
}

// the line a file run is on, from grblHAL's SD progress (same estimate as the STEP label)
export const lineAtPct = (count, pct) => Math.max(0, Math.min(count - 1, Math.floor((pct / 100) * count)));

// Per-axis speed from successive positions. pos = [x radius in, z in, c deg]; t in ms.
// Returns { x, z } in inches/min (X as real slide travel, not diameter) and c in rpm, lightly smoothed.
export function createSpeedMeter({ smooth = 0.5 } = {}) {
  let last = null, v = { x: 0, z: 0, c: 0 };
  return {
    update(pos, t) {
      if (last && t > last.t) {
        const min = (t - last.t) / 60000;
        const raw = { x: Math.abs(pos[0] - last.pos[0]) / min, z: Math.abs(pos[1] - last.pos[1]) / min, c: Math.abs(pos[2] - last.pos[2]) / 360 / min };
        for (const k of ['x', 'z', 'c']) v[k] = smooth * v[k] + (1 - smooth) * raw[k];
      }
      last = { pos, t };
      return { ...v };
    },
    reset() { last = null; v = { x: 0, z: 0, c: 0 }; },
  };
}
