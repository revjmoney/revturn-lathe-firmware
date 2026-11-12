// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Chuck spin test for reading rpm off the webcam (Rev's green dot): 24 s at 10 rpm, 8 s at the rest, up to 300.
import { writeFileSync } from 'node:fs';
const R = [10, 20, 30, 60, 90, 120, 150, 200, 250, 275, 300];
const L = ['(REVTURN chuck spin test to 300 rpm, for the green dot on camera)', 'M5', 'G21 G91 G94'];
let tot = 0;
R.forEach((r, i) => {
  const secs = r === 10 ? 24 : 8, deg = (r * 360 * secs) / 60; tot += deg;
  L.push(`(${r} rpm)`, `N${600 + i} G1 C${deg.toFixed(3)} F${r * 360}`, `N${650 + i} G4 P1.5`);
});
const rem = ((tot % 360) + 360) % 360;
L.push(`G1 C${(rem > 180 ? 360 - rem : -rem).toFixed(3)} F18000`, 'G90 G20', 'M30', '');
writeFileSync(new URL('./spin_test.nc', import.meta.url), L.join('\n'));
console.log(`spin_test.nc: ${(tot / 360).toFixed(1)} turns`);
