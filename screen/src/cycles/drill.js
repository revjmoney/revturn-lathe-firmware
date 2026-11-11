// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// DRILL / PECK DRILL on center (X0), Z only, G83-style: each peck retracts fully to clear chips,
// then rapids back to just above the last depth. Peck 0 = drill in one feed.
import { HEADER, CLEARANCE, MAX_PASSES, fmt, feed, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'zStart', label: 'Z start' },
  { name: 'depth', label: 'Depth', above: 0 },
  { name: 'peck', label: 'Peck (0 = none)', min: 0 },
  { name: 'feed', label: 'Feed', above: 0 },
];
const BACKOFF = 0.01; // rapid back to this far above the previous depth

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  const clr = p.clearance ?? CLEARANCE;
  const zs = p.zStart, top = zs + clr;
  const pecks = p.peck > 0 ? Math.ceil(p.depth / p.peck - 1e-9) : 1;
  if (pecks > MAX_PASSES) return fail(`Too many passes (${pecks}): use a bigger peck`);

  const lines = [...HEADER, `M3 S${p.rpm}`, `G0 Z${fmt(Math.max(top, safeZ(zs)))}`, 'G0 X0.0000', `G0 Z${fmt(top)}`];
  let last = zs;
  for (let k = 1; k <= pecks; k++) {
    const z = zs - (p.peck > 0 ? Math.min(p.peck * k, p.depth) : p.depth);
    if (k > 1) lines.push(`G0 Z${fmt(last + BACKOFF)}`);
    lines.push(`G1 Z${fmt(z)} F${feed(p.feed)}`, `G0 Z${fmt(top)}`);
    last = z;
  }
  lines.push(`G0 Z${fmt(Math.max(top, safeZ(zs)))}`, 'M5');
  return done(lines);
}
