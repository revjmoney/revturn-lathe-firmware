// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Shared pieces for the conversational cycles. Inches, IPM, rpm, degrees.

export const HEADER = ['G7 G18 G20 G90 G94'];
export const CLEARANCE = 0.05;
export const MAX_PASSES = 500;
// Z0 is the part face: every cycle ends here so the next cycle's X move happens in front of the part.
export const safeZ = (zStart = 0) => Math.max(zStart, 0) + CLEARANCE;

export function fmt(n) {
  const s = Number(n).toFixed(4);
  return /^-0\.0+$/.test(s) ? s.slice(1) : s;
}

// Feeds the user typed are printed as typed (trimmed); computed feeds use fmt().
// Review 2026-11-10: never exponent notation ("1e-7" is not g-code); 4 decimals, trailing zeros trimmed
export const feed = (f) => { const s = Number(f).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// schema entry: { name, label, required = true, min, max, above, int }
export function validate(params, schema) {
  for (const f of schema) {
    const v = params[f.name];
    const label = f.label ?? f.name;
    if (v === undefined || v === null || v === '') {
      if (f.required === false) continue;
      return `${label} is required`;
    }
    if (!isNum(v)) return `${label} must be a number`;
    if (f.int && !Number.isInteger(v)) return `${label} must be a whole number`;
    if (f.min !== undefined && v < f.min) return `${label} must be at least ${f.min}`;
    if (f.above !== undefined && v > f.above && v < f.above + 0.0001) return `${label} is too small (under 0.0001)`;
    if (f.above !== undefined && !(v > f.above)) return `${label} must be more than ${f.above}`;
    if (f.max !== undefined && v > f.max) return `${label} must be at most ${f.max}`;
  }
  return null;
}

export function checkRpm(rpm, maxRpm) {
  if (rpm === undefined || rpm === null || rpm === '') return 'RPM is required';
  if (!isNum(rpm) || !(rpm > 0)) return 'RPM must be a number above 0';
  if (maxRpm && rpm > maxRpm) return `RPM above machine limit (${maxRpm})`;
  return null;
}

export const fail = (error) => ({ ok: false, error });
export const done = (lines) => ({ ok: true, lines });
