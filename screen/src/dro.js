// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Turn a MachineState into the strings the DRO shows.
// Reports are in mm; grblHAL already reports X as a diameter in G7, so no doubling here.

export function fmtNum(v, decimals) {
  const s = v.toFixed(decimals);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

// opts.reportUnits: what grblHAL reports in ($13: 0 mm, 1 inch). opts.tool: active tool offsets (inches,
// T1 reading minus tool tip); the DRO shows the active tool's tip.
export function droView(s, units, opts = {}) {
  const inch = units === 'in';
  const rep = opts.reportUnits ?? 'mm';
  const k = rep === units ? 1 : inch ? 1 / 25.4 : 25.4;
  const t = opts.tool ?? { dx: 0, dz: 0 };
  const tk = inch ? 1 : 25.4; // tool offsets are stored in inches
  const d = inch ? 4 : 3;
  const running = s.spindle === 'cw' || s.spindle === 'ccw';
  let angle = ((s.wpos[3] % 360) + 360) % 360;
  if (angle > 359.98 || angle < 0.02) angle = 0; // within a step (0.0375 deg) of a whole turn reads 0.00
  return {
    x: fmtNum(s.wpos[0] * k - (t.dx || 0) * tk, d),
    z: fmtNum(s.wpos[2] * k - (t.dz || 0) * tk, d),
    xTag: s.diameter ? 'DIA' : 'RAD',
    spindleLabel: running ? 'S' : 'C',
    spindleValue: running ? `${Math.round(s.rpm)} RPM` : `${fmtNum(angle, 2)}°`,
    spindleTag: running ? (s.spindle === 'cw' ? 'FWD' : 'REV') : '',
    state: s.state,
  };
}
