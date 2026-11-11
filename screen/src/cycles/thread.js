// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// THREAD: single-point threading as synchronized Z + C moves (no encoder needed).
// The stepper is the C axis here (M5). Pitch = Z travel per 360 deg of C.
// Each pass starts at C = 0 mod 360 so every pass enters the same groove; C only increases.
import { HEADER, CLEARANCE, MAX_PASSES, fmt, validate, checkRpm, fail, done, safeZ } from './common.js';

const SCHEMA = [
  { name: 'majorDia', label: 'Major diameter', above: 0 },
  { name: 'depth', label: 'Thread depth', above: 0, required: false },
  { name: 'zStart', label: 'Z start' },
  { name: 'length', label: 'Length', above: 0 },
  { name: 'passes', label: 'Passes', min: 1, int: true },
  { name: 'springPasses', label: 'Spring passes', min: 0, int: true, required: false },
  { name: 'leadIn', label: 'Lead-in', min: 0, required: false },
];

const nextTurn = (c) => Math.ceil(c / 360 - 1e-9) * 360;

export function generate(p, ctx) {
  const err = checkRpm(p.rpm, ctx.maxRpm) ?? validate(p, SCHEMA);
  if (err) return fail(err);
  let pitch = p.pitch;
  if (p.tpi !== undefined && p.tpi !== null && p.tpi !== '') {
    if (!(p.tpi > 0)) return fail('TPI must be more than 0');
    pitch = 1 / p.tpi;
  }
  if (!(pitch > 0)) return fail('TPI or pitch is required');

  if (p.passes + (p.springPasses ?? 1) > MAX_PASSES) return fail(`Too many passes (${p.passes + (p.springPasses ?? 1)}): use fewer passes`);
  const depth = p.depth ?? 0.6134 * pitch;
  const internal = !!p.internal;
  const minor = p.majorDia - 2 * depth;
  if (!(minor > 0)) return fail('Thread depth is too deep for this diameter');
  const leadIn = p.leadIn ?? 0.1;
  const spring = p.springPasses ?? 1;
  const clr = CLEARANCE;
  const retractX = internal ? Math.max(0, minor - 2 * clr) : p.majorDia + 2 * clr;
  const zFrom = p.zStart + leadIn, zTo = p.zStart - p.length;
  const cDeg = ((p.length + leadIn) / pitch) * 360;
  const F = fmt(pitch * p.rpm);

  const lines = [...HEADER, 'M5', `G0 X${fmt(retractX)}`, `G0 Z${fmt(zFrom)}`];
  let c = nextTurn(ctx.c0 ?? 0);
  const pass = (d) => {
    const dia = internal ? minor + 2 * d : p.majorDia - 2 * d;
    lines.push(`G0 C${fmt(c)}`, `G0 X${fmt(dia)}`, `G1 Z${fmt(zTo)} C${fmt(c + cDeg)} F${F}`,
      `G0 X${fmt(retractX)}`, `G0 Z${fmt(zFrom)}`);
    c = nextTurn(c + cDeg);
  };
  for (let k = 1; k <= p.passes; k++) pass(depth * Math.sqrt(k / p.passes));
  for (let k = 0; k < spring; k++) pass(depth);
  if (zFrom < safeZ(p.zStart)) lines.push(`G0 Z${fmt(safeZ(p.zStart))}`);
  lines.push('M5');
  return done(lines);
}
