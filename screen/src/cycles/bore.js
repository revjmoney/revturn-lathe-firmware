// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// BORE (ID turning): open an existing hole from startDia out to finishDia, then a finish pass.
// Boring bar retracts -X (toward center) by the clearance, then +Z out of the hole.
import { HEADER, CLEARANCE, MAX_PASSES, fmt, feed, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'startDia', label: 'Hole diameter now', above: 0 },
  { name: 'finishDia', label: 'Finish diameter', above: 0 },
  { name: 'zStart', label: 'Z start' },
  { name: 'length', label: 'Depth', above: 0 },
  { name: 'step', label: 'Depth per pass', above: 0 },
  { name: 'finishAllow', label: 'Finish allowance', min: 0 },
  { name: 'roughFeed', label: 'Rough feed', above: 0 },
  { name: 'finishFeed', label: 'Finish feed', above: 0 },
];

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  const clr = p.clearance ?? CLEARANCE;
  const retractX = p.startDia - 2 * clr;
  if (!(retractX > 0)) return fail('Hole too small for the boring bar to retract');
  const roughTo = p.finishDia - 2 * p.finishAllow;
  if (!(roughTo > p.startDia)) return fail('Finish diameter (minus allowance) must be bigger than the hole');
  const needed = Math.ceil((roughTo - p.startDia) / (2 * p.step) - 1e-9);
  if (needed > MAX_PASSES) return fail(`Too many passes (${needed}): use a bigger depth per pass`);

  const zs = p.zStart, ze = p.zStart - p.length;
  // safe Z in front of the face first, then into the hole
  const lines = [...HEADER, `M3 S${p.rpm}`, `G0 Z${fmt(Math.max(zs + clr, safeZ(zs)))}`, `G0 X${fmt(retractX)}`, `G0 Z${fmt(zs + clr)}`];
  const pass = (d, f) => lines.push(`G0 X${fmt(d)}`, `G1 Z${fmt(ze)} F${feed(f)}`, `G0 X${fmt(retractX)}`, `G0 Z${fmt(zs + clr)}`);
  for (let k = 1; k <= needed; k++) pass(Math.min(p.startDia + 2 * p.step * k, roughTo), p.roughFeed);
  pass(p.finishDia, p.finishFeed);
  lines.push(`G0 Z${fmt(Math.max(zs + clr, safeZ(zs)))}`, 'M5');
  return done(lines);
}
