// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// FACE: cut the end of the part from startDia down to endDia, stepping -Z.
import { HEADER, CLEARANCE, MAX_PASSES, fmt, feed, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'startDia', label: 'Start diameter', above: 0 },
  { name: 'endDia', label: 'End diameter', min: 0, required: false },
  { name: 'zStart', label: 'Z start' },
  { name: 'depth', label: 'Total depth', above: 0 },
  { name: 'step', label: 'Depth per pass', above: 0 },
  { name: 'feed', label: 'Feed', above: 0 },
];

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  const endDia = p.endDia ?? 0;
  const clr = p.clearance ?? CLEARANCE;
  if (endDia >= p.startDia) return fail('End diameter must be smaller than start diameter');

  const outX = p.startDia + 2 * clr;
  const lines = [...HEADER, `M3 S${p.rpm}`, `G0 X${fmt(outX)}`, `G0 Z${fmt(p.zStart + clr)}`];
  const passes = Math.ceil(p.depth / p.step - 1e-9);
  if (passes > MAX_PASSES) return fail(`Too many passes (${passes}): use a bigger depth per pass`);
  for (let k = 1; k <= passes; k++) {
    const z = p.zStart - Math.min(p.step * k, p.depth);
    lines.push(`G0 Z${fmt(z)}`, `G1 X${fmt(endDia)} F${feed(p.feed)}`, `G0 Z${fmt(z + clr)}`, `G0 X${fmt(outX)}`);
  }
  lines.push(`G0 Z${fmt(Math.max(p.zStart + clr, safeZ(p.zStart)))}`, 'M5');
  return done(lines);
}
