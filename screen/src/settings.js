// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// grblHAL settings, described by the controller itself ($EG groups, $ES settings, $$ values, $SED=n help).
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
// Rev 2026-11-11: the REVTURN SETTINGS screen is built from this, so every setting the firmware has shows up.

// grblHAL setting datatypes ([SETTING:...] field 5)
export const T = { BOOL: 0, BITS: 1, XBITS: 2, RADIO: 3, AXES: 4, INT: 5, DEC: 6, STR: 7, PASS: 8, IP: 9 };

// [SETTINGGROUP:id|parent|name]
export function parseGroup(line) {
  const m = /^\[SETTINGGROUP:(\d+)\|(\d+)\|([^\]]*)\]$/.exec(line);
  return m ? { id: Number(m[1]), parent: Number(m[2]), name: m[3] } : null;
}

// [SETTING:id|group|name|unit|type|format|min|max|reboot|allownull]
export function parseSetting(line) {
  const m = /^\[SETTING:(.*)\]$/.exec(line);
  if (!m) return null;
  const f = m[1].split('|');
  if (f.length < 8) return null;
  const type = Number(f[4]);
  const listy = type === T.BITS || type === T.XBITS || type === T.RADIO;
  return {
    id: Number(f[0]), group: Number(f[1]), name: f[2], unit: f[3], type,
    format: listy ? '' : f[5],
    labels: listy ? f[5].split(',') : [],
    min: f[6] === '' ? null : Number(f[6]), max: f[7] === '' ? null : Number(f[7]),
    reboot: f[8] === '1',
  };
}

// $110=635.000  ->  { id: 110, value: '635.000' }
export function parseValue(line) {
  const m = /^\$(\d+)=(.*)$/.exec(line);
  return m ? { id: Number(m[1]), value: m[2] } : null;
}

// [SETTINGDESCR:110|Maximum rate. Used as G0 rapid rate.]
export function parseDescr(line) {
  const m = /^\[SETTINGDESCR:(\d+)\|(.*)\]$/.exec(line);
  return m ? { id: Number(m[1]), text: m[2] } : null;
}

// [AXS:4:XYZC] -> 'XYZC' (bit i of an axis mask is letter i)
export function parseAxes(line) {
  const m = /^\[AXS:\d+:([A-Z]+)\]$/.exec(line);
  return m ? m[1] : null;
}

// Check and normalise a value typed / picked on the screen. Returns { ok, value } or { ok: false, error }.
export function checkValue(s, raw) {
  const v = String(raw ?? '').trim();
  switch (s.type) {
    case T.BOOL: return v === '0' || v === '1' ? { ok: true, value: v } : { ok: false, error: 'must be on or off' };
    case T.BITS: case T.XBITS: case T.AXES: case T.RADIO: case T.INT: {
      if (!/^\d+$/.test(v)) return { ok: false, error: 'must be a whole number' };
      const n = Number(v);
      if (s.type === T.INT || s.type === T.RADIO) return range(s, n, v);
      return { ok: true, value: v };
    }
    case T.DEC: {
      if (!/^-?(\d+\.?\d*|\.\d+)$/.test(v)) return { ok: false, error: 'must be a number' };
      return range(s, Number(v), v);
    }
    case T.IP: return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v) && v.split('.').every((p) => Number(p) <= 255)
      ? { ok: true, value: v } : { ok: false, error: 'must be an IP address like 192.168.1.10' };
    case T.STR: case T.PASS: {
      if (/[\r\n]/.test(v)) return { ok: false, error: 'one line only' };
      if (s.max != null && v.length > s.max) return { ok: false, error: `at most ${s.max} characters` };
      if (s.min != null && v.length < s.min) return { ok: false, error: `at least ${s.min} characters` };
      return { ok: true, value: v };
    }
    default: return { ok: true, value: v };
  }
}
const range = (s, n, v) => {
  if (s.min != null && n < s.min) return { ok: false, error: `at least ${s.min}` };
  if (s.max != null && n > s.max) return { ok: false, error: `at most ${s.max}` };
  return { ok: true, value: v };
};

// Same value? (grblHAL prints decimals with trailing zeros: 635.000 == 635)
export function sameValue(s, a, b) {
  if (s.type === T.DEC || s.type === T.INT) return Number(a) === Number(b);
  return String(a) === String(b);
}

// Inch hint for metric units (the screen runs in inches; grblHAL settings are in mm)
export function inchHint(unit, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (unit === 'mm/min') return `${(n / 25.4).toFixed(1)} ipm`;
  if (unit === 'mm') return `${(n / 25.4).toFixed(4)} in`;
  if (unit === 'mm/sec^2' || unit === 'mm/s^2') return `${(n / 25.4).toFixed(2)} in/s²`;
  if (unit === 'step/mm' || unit === 'steps/mm') return `${(n * 25.4).toFixed(1)} steps/in`;
  return '';
}

// Groups in display order: each top level group, then its children, skipping empty ones.
export function groupTree(groups, settings) {
  const used = new Set(settings.map((s) => s.group));
  const kids = (p) => groups.filter((g) => g.parent === p && g.id !== p).sort((a, b) => a.id - b.id);
  const has = (g) => used.has(g.id) || kids(g.id).some(has);
  const out = [];
  for (const g of kids(0)) {
    if (!has(g)) continue;
    out.push({ ...g, depth: 0 });
    for (const c of kids(g.id)) if (has(c)) out.push({ ...c, depth: 1 });
  }
  if (used.has(0)) out.unshift({ id: 0, parent: 0, name: 'General', depth: 0 });
  return out;
}
