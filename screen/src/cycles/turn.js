// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// TURN (OD): rough from startDia toward the finish profile, then one finish pass.
// Optional endDia makes the finish profile a taper (finishDia at zStart -> endDia at zStart-length).
import { HEADER, CLEARANCE, MAX_PASSES, fmt, feed, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'startDia', label: 'Start diameter', above: 0 },
  { name: 'finishDia', label: 'Finish diameter', above: 0 },
  { name: 'endDia', label: 'End diameter', above: 0, required: false },
  { name: 'zStart', label: 'Z start' },
  { name: 'length', label: 'Length', above: 0 },
  { name: 'step', label: 'Depth per pass', above: 0 },
  { name: 'finishAllow', label: 'Finish allowance', min: 0 },
  { name: 'roughFeed', label: 'Rough feed', above: 0 },
  { name: 'finishFeed', label: 'Finish feed', above: 0 },
  { name: 'chamfer', label: 'End chamfer', min: 0, required: false },
  { name: 'radius', label: 'End radius', min: 0, required: false },
];

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  const clr = p.clearance ?? CLEARANCE;
  const zs = p.zStart, ze = p.zStart - p.length;
  const profS = p.finishDia, profE = p.endDia ?? p.finishDia;
  const top = Math.max(profS, profE);
  if (top + 2 * p.finishAllow >= p.startDia) return fail('Finish diameter (plus allowance) must be smaller than start diameter');

  const chamfer = p.chamfer || 0, radius = p.radius || 0;
  if (chamfer > 0 && radius > 0) return fail('Use an end chamfer or an end radius, not both');
  const corner = chamfer || radius;
  if (corner >= p.length) return fail('End chamfer/radius must be smaller than the length');
  if (corner >= profS / 2) return fail('End chamfer/radius is too big for the finish diameter');

  const outX = p.startDia + 2 * clr;
  const prof = (z) => profS + (profE - profS) * ((zs - z) / p.length);
  const lines = [...HEADER, `M3 S${p.rpm}`, `G0 X${fmt(outX)}`, `G0 Z${fmt(zs + clr)}`];

  // Review 2026-11-10: each rough pass is a level cut at diameter D that rides up the finish profile (plus
  // allowance) where the profile is above D. The old version offset the whole taper from its large end, so the
  // first pass took the full taper depth at the small end.
  const allow = (z) => prof(z) + 2 * p.finishAllow;
  const rough = (D) => {
    const at = (z) => Math.min(p.startDia, Math.max(D, allow(z)));
    lines.push(`G0 X${fmt(at(zs))}`);
    if (profE === profS) {
      lines.push(`G1 Z${fmt(ze)} F${feed(p.roughFeed)}`);
    } else {
      lines.push(`G1 Z${fmt(zs)} F${feed(p.roughFeed)}`);
      // break points: where the profile crosses the pass diameter and where it crosses the stock
      const zAt = (d) => zs - ((d - allow(zs)) / (allow(ze) - allow(zs))) * p.length;
      const zb = [D, p.startDia].map(zAt).filter((z) => z < zs - 1e-9 && z > ze + 1e-9).sort((a, b) => b - a);
      for (const z of zb) lines.push(`G1 X${fmt(at(z))} Z${fmt(z)} F${feed(p.roughFeed)}`);
      lines.push(`G1 X${fmt(at(ze))} Z${fmt(ze)} F${feed(p.roughFeed)}`);
    }
    lines.push(`G0 X${fmt(outX)}`, `G0 Z${fmt(zs + clr)}`);
  };

  const base = Math.min(profS, profE) + 2 * p.finishAllow; // the deepest point of the profile
  const needed = Math.ceil((p.startDia - base) / (2 * p.step) - 1e-9);
  if (needed > MAX_PASSES) return fail(`Too many passes (${needed}): use a bigger depth per pass`);
  for (let k = 1; k <= needed; k++) rough(Math.max(base, p.startDia - 2 * p.step * k));

  // finish pass, with the start-end corner broken by a chamfer or a radius (8 line segments)
  const F = `F${feed(p.finishFeed)}`;
  if (corner > 0) {
    lines.push(`G0 X${fmt(profS - 2 * corner)}`, `G1 Z${fmt(zs)} ${F}`);
    if (chamfer) lines.push(`G1 X${fmt(profS)} Z${fmt(zs - chamfer)} ${F}`);
    else for (let k = 1; k <= 8; k++) {
      const a = (k * Math.PI) / 16; // 0..90 deg in 8 steps
      lines.push(`G1 X${fmt(2 * (profS / 2 - radius + radius * Math.sin(a)))} Z${fmt(zs - radius + radius * Math.cos(a))} ${F}`);
    }
    lines.push(profE === profS ? `G1 Z${fmt(ze)} ${F}` : `G1 X${fmt(profE)} Z${fmt(ze)} ${F}`);
  } else {
    lines.push(`G0 X${fmt(profS)}`);
    if (profE === profS) lines.push(`G1 Z${fmt(ze)} ${F}`);
    else lines.push(`G1 Z${fmt(zs)} ${F}`, `G1 X${fmt(profE)} Z${fmt(ze)} ${F}`);
  }
  lines.push(`G0 X${fmt(outX)}`, `G0 Z${fmt(Math.max(zs + clr, safeZ(zs)))}`, 'M5');
  return done(lines);
}
