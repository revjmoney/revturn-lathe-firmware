// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// POLYGON: flats (hex, square, ...) cut with the normal lathe tool by X-C interpolation ("non-circular turning").
// The chuck turns slowly in C-axis mode (spindle off) while X follows the polygon outline and Z feeds along, so each
// pass is a helix whose radius rises at the corners and dips at the flats. Passes step the flats in by `step`.
// C angles are absolute (C zero = ZERO C), so every pass lines up; startAngle turns the polygon.
// Moves use G93 inverse time, so each segment runs at exactly cRpm whatever X does.
import { HEADER, CLEARANCE, MAX_PASSES, fmt, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'sides', label: 'Sides', min: 3, max: 12 },
  { name: 'flats', label: 'Across flats', above: 0 },
  { name: 'stockDia', label: 'Stock dia', above: 0 },
  { name: 'zStart', label: 'Z start' },
  { name: 'length', label: 'Length', above: 0 },
  { name: 'step', label: 'Depth per pass', above: 0 },
  { name: 'feedRev', label: 'Feed per C turn', above: 0 },
  { name: 'perSide', label: 'Points per side', min: 2, max: 60, int: true },
  { name: 'startAngle', label: 'Start angle', required: false },
];
export const MAX_LINES = 20000;
const PLUNGE_FEED = 1; // in/min, X onto the profile before each pass

export function generate(p, ctx) {
  const err = validate(p, SCHEMA) ?? checkRpm(p.cRpm, ctx.maxRpm);
  if (err) return fail(err.replace(/^RPM/, 'C RPM'));
  if (!Number.isInteger(p.sides)) return fail('Sides must be a whole number');
  if (!(p.flats < p.stockDia)) return fail('Across flats must be smaller than the stock dia');

  const n = p.sides, rs = p.stockDia / 2, a = p.flats / 2;
  const sector = 360 / n, dth = sector / p.perSide;
  const clr = p.clearance ?? CLEARANCE;
  const zTop = p.zStart + clr, zEnd = p.zStart - p.length;
  const passes = Math.ceil((rs - a) / p.step - 1e-9);
  if (passes > MAX_PASSES) return fail(`Too many passes (${passes}): use a bigger depth per pass`);
  const turnDeg = ((zTop - zEnd) / p.feedRev) * 360;
  const segs = Math.ceil(turnDeg / dth - 1e-9);
  if (passes * (segs + 6) > MAX_LINES) return fail(`Too many moves (${passes * (segs + 6)}): raise feed per C turn or depth per pass, or fewer points per side`);

  const start = p.startAngle ?? 0;
  const radius = (c, ap) => {
    const phi = ((((c - start) % sector) + sector) % sector) - sector / 2; // 0 = middle of a flat
    return Math.min(rs, ap / Math.cos((phi * Math.PI) / 180));
  };
  // start each pass on the angle grid that holds the flat centres and the corners, never going backwards in C
  const g0 = start + sector / 2;
  let c = g0 + Math.ceil(((ctx.c0 ?? 0) - g0) / dth - 1e-9) * dth;
  const outX = p.stockDia + 2 * clr;
  const feedFor = (deg) => fmt((360 * p.cRpm) / deg); // G93: 1 / minutes for this segment

  const lines = [...HEADER, 'M5', `(POLYGON ${n} sides, ${fmt(p.flats)} across flats, C ${p.cRpm} rpm)`,
    `G0 Z${fmt(Math.max(zTop, safeZ(p.zStart)))}`, `G0 X${fmt(outX)}`];
  for (let k = 1; k <= passes; k++) {
    const ap = Math.max(a, rs - k * p.step);
    lines.push(`G0 Z${fmt(zTop)}`, `G0 C${fmt(c)}`, `G1 X${fmt(2 * radius(c, ap))} F${PLUNGE_FEED}`, 'G93');
    const c0 = c;
    for (let i = 1; i <= segs; i++) {
      const cn = i === segs ? c0 + turnDeg : c0 + i * dth;
      const z = i === segs ? zEnd : zTop - ((cn - c0) / 360) * p.feedRev;
      lines.push(`G1 X${fmt(2 * radius(cn, ap))} Z${fmt(z)} C${fmt(cn)} F${feedFor(cn - c)}`);
      c = cn;
    }
    lines.push('G94', `G0 X${fmt(outX)}`);
    c = g0 + Math.ceil((c - g0) / dth - 1e-9) * dth; // back onto the grid for the next pass
  }
  lines.push(`G0 Z${fmt(Math.max(zTop, safeZ(p.zStart)))}`);
  return done(lines);
}
