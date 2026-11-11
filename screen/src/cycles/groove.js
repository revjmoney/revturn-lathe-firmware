// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// GROOVE / PART-OFF: peck plunges in -X. z = the groove's +Z wall; the tool's Z reference is its
// +Z corner. Plunges step 0.8 x tool width toward -Z until the groove width is covered.
// Depth equal to the radius parts off to center.
import { HEADER, MAX_PASSES, CLEARANCE, fmt, feed, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'dia', label: 'Diameter', above: 0 },
  { name: 'z', label: 'Z position' },
  { name: 'width', label: 'Width', above: 0 },
  { name: 'depth', label: 'Depth', above: 0 },
  { name: 'peck', label: 'Peck', above: 0 },
  { name: 'feed', label: 'Feed', above: 0 },
  { name: 'toolWidth', label: 'Tool width', above: 0 },
];

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  if (p.depth > p.dia / 2 + 1e-9) return fail('Depth is more than the radius');
  if (p.width < p.toolWidth - 1e-9) return fail('Width is narrower than the tool');

  const clr = CLEARANCE;
  const outX = p.dia + 2 * clr;
  const target = Math.max(0, p.dia - 2 * p.depth);
  const lines = [...HEADER, `M3 S${p.rpm}`, `G0 X${fmt(outX)}`];

  // Review 2026-11-10: a tiny peck or tool width used to loop hundreds of millions of times and freeze the screen
  const plunges = (p.width - p.toolWidth) / (0.8 * p.toolWidth) + 1, pecks = p.depth / p.peck + 1;
  if (plunges > MAX_PASSES) return fail(`Too many plunges (${Math.ceil(plunges)}): use a wider tool or a narrower groove`);
  if (pecks > MAX_PASSES) return fail(`Too many pecks (${Math.ceil(pecks)}): use a bigger peck`);
  const plungeZs = [];
  const last = p.z - (p.width - p.toolWidth);
  for (let z = p.z; z > last + 1e-9; z -= 0.8 * p.toolWidth) plungeZs.push(z);
  plungeZs.push(last);

  for (const z of plungeZs) {
    lines.push(`G0 Z${fmt(z)}`);
    for (let level = p.dia - 2 * p.peck; ; level -= 2 * p.peck) {
      const x = Math.max(target, level);
      lines.push(`G1 X${fmt(x)} F${feed(p.feed)}`);
      if (x <= target + 1e-9) break;
      lines.push(`G0 X${fmt(x + 0.02)}`);
    }
    lines.push(`G0 X${fmt(outX)}`);
  }
  lines.push(`G0 Z${fmt(safeZ(0))}`, 'M5');
  return done(lines);
}
