// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Toolpath preview and backplot: parse G0/G1 X/Z (X is diameter) and draw it side-on.
// Z runs left-right with the chuck on the left; the part's radius runs up from the centerline.

export function toolpath(lines) {
  const pts = [];
  let x = null, z = null, rapid = true, absolute = true;
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
    if (!mx && !mz) continue;
    if (mx) x = absolute ? Number(mx[1]) : (x ?? 0) + Number(mx[1]);
    if (mz) z = absolute ? Number(mz[1]) : (z ?? 0) + Number(mz[1]);
    pts.push({ x: x ?? 0, z: z ?? 0, rapid });
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

// pts: program path (dim). marker: live tool { x (dia), z }. trail: backplot of where the tool went (bright).
export function drawPreview(canvas, pts, marker, trail = []) {
  if (typeof navigator !== 'undefined' && /jsdom/.test(navigator.userAgent)) return; // no canvas in tests
  let ctx = null;
  try { ctx = canvas.getContext?.('2d'); } catch { /* no canvas */ }
  const b = plotBounds(pts, trail, marker);
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth || 600);
  const hgt = (canvas.height = canvas.clientHeight || 200);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, hgt);
  if (!b) return;
  const pad = 14;
  const rSpan = Math.max(b.rMax - b.rMin, 0.05), zSpan = Math.max(b.zMax - b.zMin, 0.05);
  const k = Math.min((w - 2 * pad) / zSpan, (hgt - 2 * pad - 14) / rSpan); // 14: room for the tool marker
  // centre the drawing in the leftover space so the whole program sits in the middle of the canvas
  const ox = (w - zSpan * k) / 2, oy = (hgt - 14 - rSpan * k) / 2 + 14;
  const X = (z) => ox + (z - b.zMin) * k;
  const Y = (r) => oy + (b.rMax - r) * k;
  ctx.strokeStyle = '#335';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke(); // centerline
  if (b.zMin <= 0 && b.zMax >= 0) { ctx.strokeStyle = '#553'; ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), hgt); ctx.stroke(); } // Z0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    ctx.setLineDash(c.rapid ? [3, 3] : []);
    ctx.strokeStyle = c.rapid ? '#555' : '#2f6b4a';
    ctx.beginPath(); ctx.moveTo(X(a.z), Y(a.x / 2)); ctx.lineTo(X(c.z), Y(c.x / 2)); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (trail.length > 1) {
    ctx.strokeStyle = '#4ad7ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(trail[0].z), Y(trail[0].x / 2));
    for (const p of trail) ctx.lineTo(X(p.z), Y(p.x / 2));
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.z)) {
    const mx = X(marker.z), my = Y(marker.x / 2);
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 9, my - 14); ctx.lineTo(mx - 9, my - 14); ctx.closePath(); ctx.fill(); // tool tip pointing at the part
  }
}
