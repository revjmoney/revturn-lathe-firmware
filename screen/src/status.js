// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Parse grblHAL realtime status reports: <State|MPos:..|WCO:..|FS:..|A:..|D:1|...>
// Positions are in mm (X, Y, Z) and degrees (C), index 0 X, 1 Y, 2 Z, 3 C.

const nums = (s) => s.split(',').map(Number);
const pad4 = (a) => [0, 1, 2, 3].map((i) => a[i] ?? 0);

export function parseStatus(report, prev) {
  if (typeof report !== 'string' || !report.startsWith('<') || !report.endsWith('>')) return null;
  const fields = report.slice(1, -1).split('|');
  const [state, sub = null] = fields[0].split(':');

  let mpos = null, wpos = null;
  let wco = prev?.wco ?? [0, 0, 0, 0];
  // grblHAL sends D: (lathe diameter mode) only when it changes, so it carries over like WCO.
  // A: (spindle/coolant) is also only in some reports; an empty "A:" means all off.
  let feed = 0, rpm = 0, spindle = prev?.spindle ?? 'off', diameter = prev?.diameter ?? false, ov = prev?.ov ?? null, sd = null, ln = null;

  for (const f of fields.slice(1)) {
    const i = f.indexOf(':');
    const key = i < 0 ? f : f.slice(0, i);
    const val = i < 0 ? '' : f.slice(i + 1);
    switch (key) {
      case 'MPos': mpos = pad4(nums(val)); break;
      case 'WPos': wpos = pad4(nums(val)); break;
      case 'WCO': wco = pad4(nums(val)); break;
      case 'FS': [feed, rpm] = nums(val); rpm = rpm ?? 0; break;
      case 'F': feed = Number(val); break;
      case 'Ov': ov = nums(val); break;
      case 'A': spindle = val.includes('S') ? 'cw' : val.includes('C') ? 'ccw' : 'off'; break;
      case 'D': diameter = val === '1'; break;
      case 'Ln': ln = Number.parseInt(val, 10); if (!Number.isInteger(ln)) ln = null; break; // executing line (file runs)
      case 'SD': { const c = val.indexOf(','); if (c > 0) sd = { pct: Number(val.slice(0, c)), file: val.slice(c + 1) }; break; }
    }
  }

  if (mpos && !wpos) wpos = mpos.map((v, k) => v - wco[k]);
  else if (wpos && !mpos) mpos = wpos.map((v, k) => v + wco[k]);
  else if (!mpos && !wpos) { mpos = prev?.mpos ?? [0, 0, 0, 0]; wpos = mpos.map((v, k) => v - wco[k]); }

  // Review 2026-11-10: a garbled report (NaN positions) is dropped; NaN used to reach the DRO, the jog limit checks
  // and even g-code (G0 CNaN)
  if (![...mpos, ...wco, ...wpos].every(Number.isFinite)) return null;
  return { state, sub, mpos, wco, wpos, feed, rpm, spindle, diameter, ov, sd, ln };
}
