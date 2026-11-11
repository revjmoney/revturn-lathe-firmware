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
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < minStep) return;
      points.push({ x: p.x, z: p.z });
      if (points.length > max) points.splice(0, points.length - max);
    },
    clear() { points.length = 0; },
  };
}
