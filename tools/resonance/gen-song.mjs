// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// REVTURN plays a song: the X motor sings the melody (its full-step rate IS the pitch), the spindle holds a quiet
// bass drone that changes at phrase ends. Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
//
// Song: "Ode to Joy" (Beethoven, Symphony No. 9, 1824; public domain), key of C, range G3..G4.
// X: 21.1667 Hz per ipm (16x, $100=800), accel $120=50 mm/s2. Every note reverses X so repeated notes are heard
// (the stop at each reversal is the "pluck"). Note length is corrected for the accel ramps: a trapezoid move takes
// L/v + v/a, so L = v * (d - v/a). X stays inside DRO +-1.4 (real +-0.7 in) around X0, Z parked at -0.25.
// Spindle changes (M3 S) make the planner wait, so they only happen between phrases.
// Output: ode_to_joy.nc + ode_to_joy.schedule.json (every note: N, name, Hz, ipm, start and length in seconds)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HZ_X = (25.4 / 60) * (800 / 16), HZ_C = (1 / 60) * 13.333 * 360 / 8, ACC = 50; // mm/s2
const TAKE1 = process.env.TAKE1 === '1';                            // take 1 as first played: C3 drone, no dolphin
const BPM = 92, Q = 60 / BPM;
const LIMIT = 0.68;                                                    // real inches either side of X0
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const hz = (n) => { const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * 2 ** ((NAMES.indexOf(m[1]) + 12 * (Number(m[2]) + 1) - 69) / 12); };
const f4 = (n) => n.toFixed(4);

// [note, beats]
const A = [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1]];
const PHRASES = [
  { bass: TAKE1 ? 'C3' : 'C2', notes: [...A, ['E4', 1.5], ['D4', 0.5], ['D4', 2]] },
  { bass: 'G2', notes: [...A, ['D4', 1.5], ['C4', 0.5], ['C4', 2]] },
  { bass: 'G2', notes: [['D4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1],
    ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['G3', 2]] },
  { bass: TAKE1 ? 'C3' : 'C2', notes: [...A, ['D4', 1.5], ['C4', 0.5], ['C4', 2]] },
];

const L = ['(REVTURN plays Ode to Joy, Beethoven, public domain: melody on X, bass drone on the spindle)',
  'G20 G7 G90 G94', 'M5', 'G0 Z-0.25', 'G0 X0'];
const sched = [];
let pos = 0, dir = 1, t = 0, n = 5000;
// Bass: C3 (131 Hz) sat on the frame's 127 Hz resonance and drowned the melody (take 1, 2026-11-11), so C2 / G2.
// 4 s of quiet for the camera, then about 3 s of DOLPHIN (Rev): whistles that glide up and down 500..840 Hz (the
// planner's accel turns each feed change into a slide) with click trains between. Also a sync mark for video.
if (!TAKE1) { L.push('(get the camera rolling)', 'N4700 G4 P4'); t += 4; }
const glide = (ipms, segS) => { for (const ipm of ipms) { const len = (ipm * segS) / 60; if (Math.abs(pos + dir * len) > LIMIT) dir = -dir; pos += dir * len; L.push(`N4800 G1 X${f4(2 * pos)} F${ipm.toFixed(2)}`); t += segS; } dir = -dir; };
const clicks = (k) => { for (let i = 0; i < k; i++) { pos += (i % 2 ? -1 : 1) * 0.003; L.push(`N4801 G1 X${f4(2 * pos)} F20`); t += 0.04; } };
const DOLPHIN = [[24, 28, 33, 38, 39.5, 36], [28, 34, 39.5, 39.5, 32, 26], [24, 30, 36, 39.5], [39.5, 33, 27, 33, 39.5], [26, 31, 36, 39.5, 39.5, 30]];
if (!TAKE1) L.push('(dolphin)');
if (!TAKE1) { DOLPHIN.forEach((g, i) => { glide(g, 0.07); if (i < DOLPHIN.length - 1) clicks(i % 2 ? 6 : 4); }); L.push('N4802 G4 P0.8'); t += 0.8; }
PHRASES.forEach((p, pi) => {
  const rpm = hz(p.bass) / HZ_C;
  L.push(`(phrase ${pi + 1}, bass ${p.bass})`, `N${n + 900} M3 S${rpm.toFixed(3)}`, `N${n + 900} G4 P0.8`);
  t += 0.8;
  for (const [name, beats] of p.notes) {
    const f = hz(name), ipm = f / HZ_X, v = ipm * 25.4 / 60;            // mm/s
    const d = beats * Q, len = Math.max(0.02, (v * Math.max(d - v / ACC, d * 0.4)) / 25.4); // inches
    if (Math.abs(pos + dir * len) > LIMIT) dir = -dir;
    pos += dir * len;
    L.push(`N${n} G1 X${f4(2 * pos)} F${ipm.toFixed(3)}`);          // G7: X words are diameter
    sched.push({ n, phrase: pi + 1, note: name, hz: Number(f.toFixed(2)), ipm: Number(ipm.toFixed(3)), beats, start: Number(t.toFixed(3)), seconds: Number(d.toFixed(3)), bass: p.bass });
    t += d; n++; dir = -dir;
  }
  n = 5000 + (pi + 1) * 100;
});
L.push('N5999 G4 P1.5', 'M5', 'G0 X0', 'M30', '');
const SONG = TAKE1 ? 'ode_to_joy_take1' : 'ode_to_joy';
writeFileSync(join(out, `${SONG}.nc`), L.join('\n'));
writeFileSync(join(out, `${SONG}.schedule.json`), JSON.stringify({ song: 'Ode to Joy (Beethoven, public domain)', bpm: BPM, hzPerIpmX: HZ_X, hzPerRpmC: HZ_C, steps: sched }, null, 1));
const ipms = sched.map((s) => s.ipm);
console.log(`${SONG}.nc: ${sched.length} notes, about ${Math.round(t)} s, X ${Math.min(...ipms).toFixed(1)}..${Math.max(...ipms).toFixed(1)} ipm, max |X| ${f4(Math.max(...L.filter((l) => / X-?\d/.test(l)).map((l) => Math.abs(Number(/X(-?[\d.]+)/.exec(l)[1])))))} on the DRO`);

// ---- Take 3 (Rev): Z plays the BASSLINE under the X melody, spindle off. ----
// Every melody note is one combined X+Z move: X at the melody pitch, Z at the bass pitch, path F = hypot. Bass is
// half notes (root then fifth per bar), so bass changes always land on a melody note start (checked below).
// Z: 25.5588 Hz per ipm ($102=1932 at 32x), accel 12 mm/s2; the combined move's accel is limited by the axis that
// hits its own limit first, so the ramp correction uses a = min(50 F/vx, 12 F/vz). Z keeps its direction through a
// bass note and turns around at the next one (or at the end of its room, Z -0.3..-2.45).
{
  const HZ_Z = (25.4 / 60) * (1932 / 32), ZC = -1.375, ZLIM = 1.07;
  const BARS = [['C3', 'G2'], ['G2', 'D3'], ['C3', 'G2'], ['G2', 'D3'],
    ['C3', 'G2'], ['G2', 'D3'], ['C3', 'G2'], ['G2', 'C3'],
    ['G2', 'D3'], ['C3', 'G2'], ['G2', 'D3'], ['C3', 'G2'],
    ['C3', 'G2'], ['G2', 'D3'], ['C3', 'G2'], ['G2', 'C3']];
  const bass = BARS.flat();                                        // one per 2 beats
  const Z = ['(REVTURN plays Ode to Joy, take 3: melody on X, BASSLINE on Z, spindle off)',
    'G20 G7 G90 G94', 'M5', 'G0 Z-0.25', 'G0 X0', `G1 Z${f4(ZC)} F20`, '(get the camera rolling)', 'N4700 G4 P4'];
  const zs = []; let xp = 0, xd = 1, zp = 0, zd = 1, tt = 4, nn = 5000, beat = 0, lastBass = -1;
  // dolphin again on X alone (same as take 2)
  Z.push('(dolphin)');
  const g2 = (ipms) => { for (const ipm of ipms) { const len = (ipm * 0.07) / 60; if (Math.abs(xp + xd * len) > LIMIT) xd = -xd; xp += xd * len; Z.push(`N4800 G1 X${f4(2 * xp)} F${ipm.toFixed(2)}`); tt += 0.07; } xd = -xd; };
  const c2 = (k) => { for (let i = 0; i < k; i++) { xp += (i % 2 ? -1 : 1) * 0.003; Z.push(`N4801 G1 X${f4(2 * xp)} F20`); tt += 0.04; } };
  DOLPHIN.forEach((g, i) => { g2(g); if (i < DOLPHIN.length - 1) c2(i % 2 ? 6 : 4); });
  Z.push('N4802 G4 P0.8'); tt += 0.8;
  PHRASES.forEach((p, pi) => {
    Z.push(`(phrase ${pi + 1})`);
    for (const [name, beats] of p.notes) {
      const bi = Math.floor(beat / 2 + 1e-9);
      if (bi !== lastBass && Math.abs(beat - 2 * bi) > 1e-9) throw new Error(`bass change inside ${name} at beat ${beat}`);
      if (bi !== lastBass) { zd = -zd; lastBass = bi; }
      const bn = bass[bi], fx = hz(name), fz = hz(bn);
      const vxI = fx / HZ_X, vzI = fz / HZ_Z, F = Math.hypot(vxI, vzI);
      const vx = vxI * 25.4 / 60, vz = vzI * 25.4 / 60, Fm = F * 25.4 / 60;
      const a = Math.min(50 * Fm / vx, 12 * Fm / vz), d = beats * Q, tc = Math.max(d - Fm / a, d * 0.4);
      const lx = (vx * tc) / 25.4, lz = (vz * tc) / 25.4;
      if (Math.abs(xp + xd * lx) > LIMIT) xd = -xd;
      if (Math.abs(zp + zd * lz) > ZLIM) zd = -zd;
      xp += xd * lx; zp += zd * lz;
      Z.push(`N${nn} G1 X${f4(2 * xp)} Z${f4(ZC + zp)} F${F.toFixed(3)}`);
      zs.push({ n: nn, phrase: pi + 1, note: name, hz: Number(fx.toFixed(2)), ipm: Number(vxI.toFixed(3)), bass: bn, bassHz: Number(fz.toFixed(2)), zIpm: Number(vzI.toFixed(3)), beats, seconds: Number(d.toFixed(3)) });
      xd = -xd; beat += beats; tt += d; nn++;
    }
    nn = 5000 + (pi + 1) * 100;
  });
  Z.push('N5999 G4 P1', 'G0 X0', 'G1 Z-0.25 F20', 'M30', '');
  writeFileSync(join(out, 'ode_to_joy_zbass.nc'), Z.join('\n'));
  writeFileSync(join(out, 'ode_to_joy_zbass.schedule.json'), JSON.stringify({ song: 'Ode to Joy take 3, Z bassline', bpm: BPM, hzPerIpmX: HZ_X, hzPerIpmZ: HZ_Z, steps: zs }, null, 1));
  const zmax = Math.max(...Z.filter((l) => /Z-/.test(l) && /^N5/.test(l)).map((l) => -Number(/Z(-[\d.]+)/.exec(l)[1])));
  const zmin = Math.min(...Z.filter((l) => /Z-/.test(l) && /^N5/.test(l)).map((l) => -Number(/Z(-[\d.]+)/.exec(l)[1])));
  console.log(`ode_to_joy_zbass.nc: ${zs.length} notes, about ${Math.round(tt)} s, Z bass ${Math.min(...zs.map((s) => s.zIpm))}..${Math.max(...zs.map((s) => s.zIpm))} ipm, Z -${zmin.toFixed(3)}..-${zmax.toFixed(3)}`);
}
