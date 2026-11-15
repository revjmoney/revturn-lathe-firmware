// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Backplot: the path the tool tip really took, built from live status reports (X as diameter, inches).
// minStep drops points that barely moved (status repeats while idle); max keeps memory bounded.

export function createBackplot({ minStep = 0.0005, max = 20000 } = {}) {
  const points = [];
  return {
    points,
    add(p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const last = points.at(-1);
      const c = Number.isFinite(p.c) ? p.c : undefined;
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < minStep && Math.abs((c ?? 0) - (last.c ?? 0)) < 1) return; // C: 1 degree
      points.push(c === undefined ? { x: p.x, z: p.z } : { x: p.x, z: p.z, c });
      if (points.length > max) points.splice(0, points.length - max);
    },
    clear() { points.length = 0; },
  };
}
