// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// INDEX: turn the chuck (C axis) to an angle, or to position `step` of `divisions` equal positions.
// Always forward: the smallest absolute C >= current C with the wanted angle mod 360.
import { HEADER, fmt, fail, done } from './common.js';

export function generate(p, ctx) {
  let angle;
  if (p.divisions !== undefined && p.divisions !== null && p.divisions !== '') {
    if (!Number.isInteger(p.divisions) || p.divisions < 1) return fail('Divisions must be a whole number of at least 1');
    if (!Number.isInteger(p.step) || p.step < 0) return fail('Position must be a whole number');
    angle = (p.step * 360) / p.divisions;
  } else if (typeof p.angle === 'number' && Number.isFinite(p.angle)) {
    angle = p.angle;
  } else {
    return fail('Angle or divisions is required');
  }
  const c0 = ctx.c0 ?? 0;
  const a = ((angle % 360) + 360) % 360;
  let target = Math.floor(c0 / 360) * 360 + a;
  if (target < c0 - 1e-9) target += 360;
  return done([...HEADER, 'M5', `G0 C${fmt(target)}`]);
}
