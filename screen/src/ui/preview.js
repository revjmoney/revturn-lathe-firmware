// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Toolpath preview and backplot: parse G0/G1 X/Z/C (X is diameter, C in degrees) and draw it in the viewer
// (src/ui/viewer.js: SIDE / END / 3D, zoom, pan, fit). SIDE: Z left-right, chuck on the left, radius up.
import { viewerFor } from './viewer.js';

export function toolpath(lines) {
  const pts = [];
  let x = null, z = null, c = null, rapid = true, absolute = true;
  for (const raw of lines) {
    const line = raw.replace(/\(.*?\)/g, '').trim().toUpperCase();
    if (!line) continue;
    for (const m of line.matchAll(/\bG0*(\d+)(?:\.\d)?\b/g)) {
      const g = Number(m[1]);
      if (g === 90) absolute = true;
      if (g === 91) absolute = false;
    }
    const g = line.match(/\bG0*([01])\b/);
    if (g) rapid = g[1] === '0';
    const mx = line.match(/\bX(-?[0-9.]+)/);
    const mz = line.match(/\bZ(-?[0-9.]+)/);
    const mc = line.match(/\bC(-?[0-9.]+)/);
    if (!mx && !mz && !mc) continue;
    if (mx) x = absolute ? Number(mx[1]) : (x ?? 0) + Number(mx[1]);
    if (mz) z = absolute ? Number(mz[1]) : (z ?? 0) + Number(mz[1]);
    if (mc) c = absolute ? Number(mc[1]) : (c ?? 0) + Number(mc[1]);
    pts.push(c === null ? { x: x ?? 0, z: z ?? 0, rapid } : { x: x ?? 0, z: z ?? 0, c, rapid });
  }
  return pts;
}

// Area to fit: the program path, the traced trail and the live tool. X is diameter, so radius = x / 2.
export function plotBounds(pts = [], trail = [], marker = null) {
  const all = [...pts, ...trail];
  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.z)) all.push(marker);
  if (!all.length) return null;
  // X zero may be set mid-travel, so X can be negative: fit both sides, always including the centerline
  const zs = all.map((p) => p.z), rs = all.map((p) => p.x / 2);
  return { zMin: Math.min(...zs), zMax: Math.max(...zs), rMin: Math.min(0, ...rs), rMax: Math.max(0, ...rs) };
}

// pts: program path (dim). marker: live tool { x (dia), z, c }. trail: backplot of where the tool went (bright).
// Every canvas gets its own viewer (zoom, pan, views) the first time it is drawn.
export function drawPreview(canvas, pts, marker, trail = []) {
  if (!canvas) return;
  const v = viewerFor(canvas);
  v.set({ pts, marker, trail });
  v.draw();
}
