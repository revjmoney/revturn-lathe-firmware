// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// grblHAL jog commands. X/Z in inches (G20), C in degrees. Continuous jog = a long move that the
// UI cancels with the realtime jog-cancel byte when the button is released.

export const JOG_CANCEL = 0x85;
export const CONT_DISTANCE = { X: 2, Z: 10, C: 3600 };

export function jogLine({ axis, dir, step, feed }) {
  if (!(axis in CONT_DISTANCE)) throw new Error(`Cannot jog axis ${axis}`);
  if (!(feed > 0)) throw new Error('Jog feed must be more than 0');
  const dist = step === 'cont' ? CONT_DISTANCE[axis] : step;
  const d = String(Number((dir < 0 ? -dist : dist).toFixed(6)));
  const units = axis === 'C' ? '' : ' G20';
  return `$J=G91${units} ${axis}${d} F${Number(feed)}`;
}
