// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// Toolpath viewer for the backplot and the cycle / program previews (Rev 2026-11-12: "zoom and different views,
// like gsender"). gSender's three.js viewer is far too big for the lathe's flash, so this is a small canvas one
// with the same controls: FIT, +, -, SIDE (the lathe view), END (down the spindle, chuck moves as arcs) and 3D
// (orbit; plain turning programs also show the revolved part as a faint ghost). Wheel = zoom at the cursor,
// drag = pan (3D: drag = orbit, shift or right drag = pan), double-click = fit, two fingers = pinch zoom.
// Points: { x (diameter), z, c (degrees, optional), rapid }.

export const VIEWS = ['SIDE', 'END', '3D'];
const rad = (d) => (d * Math.PI) / 180;

// world position of a point: r = radius, the chuck angle turns it around the Z axis
export const world = (p) => { const r = p.x / 2, c = rad(p.c ?? 0); return { wx: r * Math.cos(c), wy: r * Math.sin(c), wz: p.z }; };

// a view turns a point into flat (u, v) before zoom and pan: u right, v up
export function project(view, p, cam = { yaw: -35, pitch: 25 }) {
  if (view === 'SIDE') return { u: p.z, v: p.x / 2 };                      // Z across, radius up (chuck left)
  const w = world(p);
  if (view === 'END') return { u: w.wx, v: w.wy };                          // looking down the spindle
  // 3D: X across = Z axis, up = wx, depth = wy; orbit by yaw (around up) then pitch (around across)
  const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw)), cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  const x1 = w.wz * cy + w.wy * sy, z1 = -w.wz * sy + w.wy * cy;
  return { u: x1, v: w.wx * cp - z1 * sp };
}

// the zoom and pan that fit these flat points into a w x h canvas
export function fitTransform(flat, w, h, pad = 24) { // 24: room for the tool marker
  if (!flat.length) return { k: 1, ox: w / 2, oy: h / 2 };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const f of flat) { u0 = Math.min(u0, f.u); u1 = Math.max(u1, f.u); v0 = Math.min(v0, f.v); v1 = Math.max(v1, f.v); }
  const k = Math.min((w - 2 * pad) / Math.max(u1 - u0, 0.05), (h - 2 * pad) / Math.max(v1 - v0, 0.05));
  return { k, ox: w / 2 - ((u0 + u1) / 2) * k, oy: h / 2 + ((v0 + v1) / 2) * k };
}

// zoom by f keeping the point under (sx, sy) still
export function zoomAt(t, f, sx, sy) {
  const k = Math.max(1e-3, Math.min(1e6, t.k * f)), g = k / t.k;
  return { k, ox: sx - (sx - t.ox) * g, oy: sy - (sy - t.oy) * g };
}

// a move that turns the chuck is a curve outside SIDE: split it into steps of about 2 degrees (at most 180)
export const cSteps = (view, a, b) => { const d = Math.abs((b.c ?? 0) - (a.c ?? 0)); return view !== 'SIDE' && d > 2 ? Math.min(180, Math.ceil(d / 2)) : 1; };
export const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, c: (a.c ?? 0) + ((b.c ?? 0) - (a.c ?? 0)) * f });

// every point the view will draw, so FIT takes in the arcs and the revolved ghost, not just the end points
export function drawnPoints(view, { pts = [], trail = [], marker = null } = {}) {
  const out = [];
  pts.forEach((p, i) => { if (!i) { out.push(p); return; } const n = cSteps(view, pts[i - 1], p); for (let s = 1; s <= n; s++) out.push(lerp(pts[i - 1], p, s / n)); });
  if (view !== 'SIDE' && !pts.some((p) => p.c)) for (const p of pts) if (!p.rapid) for (let a = 30; a < 360; a += 30) out.push({ ...p, c: a });
  out.push(...trail);
  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.z)) out.push(marker);
  return out;
}

const isTest = () => typeof navigator !== 'undefined' && /jsdom/.test(navigator.userAgent);
const viewers = new WeakMap();

// one viewer per canvas, made on first draw: it adds a small toolbar over the canvas and its own mouse / touch
export function viewerFor(canvas) {
  let v = viewers.get(canvas);
  if (v) return v;
  const st = { view: 'SIDE', cam: { yaw: -35, pitch: 25 }, t: null, auto: true, data: { pts: [], marker: null, trail: [] } };
  const bar = document.createElement('div');
  bar.className = 'vbar';
  bar.innerHTML = `${VIEWS.map((n) => `<button data-vview="${n}">${n}</button>`).join('')}<button data-vzoom="in" title="Zoom in">+</button><button data-vzoom="out" title="Zoom out">&minus;</button><button data-vfit title="Fit everything">FIT</button>`;
  const host = canvas.parentElement;
  if (host) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(bar);
  }
  const mark = () => { for (const b of bar.querySelectorAll('[data-vview]')) b.classList.toggle('on', b.dataset.vview === st.view); };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.vview) { st.view = b.dataset.vview; st.auto = true; mark(); }
    if (b.dataset.vfit !== undefined) st.auto = true;
    if (b.dataset.vzoom) { ensure(); st.auto = false; st.t = zoomAt(st.t, b.dataset.vzoom === 'in' ? 1.4 : 1 / 1.4, canvas.width / 2, canvas.height / 2); }
    v.draw();
  });
  mark();
  const ensure = () => { if (!st.t || st.auto) st.t = fitTransform(allFlat(), canvas.width || 600, canvas.height || 200); };
  const allFlat = () => drawnPoints(st.view, st.data).map((p) => project(st.view, p, st.cam));

  // mouse and touch
  const ptrs = new Map(); let last = null, pinch = null;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); ensure(); st.auto = false; const r = canvas.getBoundingClientRect(); st.t = zoomAt(st.t, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); v.draw(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { st.auto = true; v.draw(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 || st.view !== '3D' }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    ensure(); st.auto = false;
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = canvas.getBoundingClientRect();
      st.t = zoomAt(st.t, d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch = d; v.draw(); return;
    }
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (last.pan) st.t = { ...st.t, ox: st.t.ox + dx, oy: st.t.oy + dy };
    else { st.cam = { yaw: st.cam.yaw + dx * 0.5, pitch: Math.max(-89, Math.min(89, st.cam.pitch + dy * 0.5)) }; }
    last = { ...last, x: e.clientX, y: e.clientY };
    v.draw();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) last = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  v = {
    state: st, bar,
    set(data) { st.data = { pts: data.pts ?? [], marker: data.marker ?? null, trail: data.trail ?? [] }; },
    setView(name) { st.view = name; st.auto = true; mark(); },
    draw() {
      if (isTest()) return;
      let ctx = null; try { ctx = canvas.getContext?.('2d'); } catch { /* no canvas */ }
      if (!ctx) return;
      const w = (canvas.width = canvas.clientWidth || 600), h = (canvas.height = canvas.clientHeight || 200);
      ensure();
      const { k, ox, oy } = st.t;
      const S = (p) => { const f = project(st.view, p, st.cam); return [ox + f.u * k, oy - f.v * k]; };
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      // axes: the spindle centerline and Z0 (SIDE), the centre cross (END), the Z axis (3D)
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#335'; ctx.lineWidth = 1;
      const line = (a, b) => { const [x1, y1] = S(a), [x2, y2] = S(b); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const zs = [...st.data.pts, ...st.data.trail].map((p) => p.z), zl = Math.min(-0.5, ...zs), zh = Math.max(0.5, ...zs);
      if (st.view === 'END') { line({ x: -2, z: 0, c: 0 }, { x: 2, z: 0, c: 0 }); line({ x: -2, z: 0, c: 90 }, { x: 2, z: 0, c: 90 }); }
      else line({ x: 0, z: zl - 0.2 }, { x: 0, z: zh + 0.2 });
      if (st.view === 'SIDE') { ctx.strokeStyle = '#553'; const [x0] = S({ x: 0, z: 0 }); ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke(); }
      ctx.setLineDash([]);
      const pts = st.data.pts, usesC = pts.some((p) => p.c);
      // 3D ghost of the turned part: the cutting path swept round the spindle (plain turning programs only)
      // END: the same ghost is a ring for every diameter the program cuts
      if (st.view === 'END' && !usesC && pts.length > 1) {
        ctx.strokeStyle = 'rgba(80,200,140,0.25)';
        const [cx, cy] = S({ x: 0, z: 0 });
        for (const r of [...new Set(pts.filter((p) => !p.rapid).map((p) => Math.abs(p.x / 2).toFixed(3)))].slice(0, 60)) { ctx.beginPath(); ctx.arc(cx, cy, Number(r) * k, 0, 2 * Math.PI); ctx.stroke(); }
      }
      if (st.view === '3D' && !usesC && pts.length > 1) {
        ctx.strokeStyle = 'rgba(80,200,140,0.13)';
        for (let a = 0; a < 360; a += 30) {
          ctx.beginPath(); let started = false;
          for (const p of pts) { if (p.rapid) { started = false; continue; } const [sx, sy] = S({ ...p, c: a }); if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy); }
          ctx.stroke();
        }
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], c = pts[i];
        ctx.setLineDash(c.rapid ? [3, 3] : []); ctx.strokeStyle = c.rapid ? '#555' : '#2f9b6a';
        // a move that turns the chuck is a curve: draw it in small steps so arcs and helixes look right
        const steps = cSteps(st.view, a, c);
        ctx.beginPath(); const [x0, y0] = S(a); ctx.moveTo(x0, y0);
        for (let s = 1; s <= steps; s++) { const [x1, y1] = S(lerp(a, c, s / steps)); ctx.lineTo(x1, y1); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const tr = st.data.trail;
      if (tr.length > 1) { ctx.strokeStyle = '#4ad7ff'; ctx.lineWidth = 2; ctx.beginPath(); const [x0, y0] = S(tr[0]); ctx.moveTo(x0, y0); for (const p of tr) { const [x1, y1] = S(p); ctx.lineTo(x1, y1); } ctx.stroke(); ctx.lineWidth = 1; }
      const m = st.data.marker;
      if (m && Number.isFinite(m.x) && Number.isFinite(m.z)) {
        const [mx, my] = S(m); ctx.fillStyle = '#ffd84a';
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 9, my - 14); ctx.lineTo(mx - 9, my - 14); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#5a7a8a'; ctx.font = '11px Consolas, monospace';
      ctx.fillText(st.view === 'SIDE' ? 'SIDE: Z across, radius up' : st.view === 'END' ? 'END: down the spindle' : '3D: drag to orbit, shift-drag to pan', 8, h - 8);
    },
  };
  viewers.set(canvas, v);
  return v;
}
