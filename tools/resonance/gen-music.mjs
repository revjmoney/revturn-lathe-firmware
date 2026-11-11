// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// REVTURN full frequency sweep + stepper music, all three motors (Rev 2026-11-11).
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
//
// A stepper's pitch is its FULL-STEP rate. Each axis climbs in QUARTER-TONE steps from C2 to as high as its max rate
// allows: every even step is a note of the chromatic scale (A4 = 440 Hz), the odd steps double the resolution of
// the resonance map. A fourth program plays CHORDS: all the motors at once at chosen pitches (beats, intervals,
// resonance pile-ups) to find where the scary sounds live.
//
// Full-step Hz per unit, from the live settings (2026-11-11):
//   X: $100=800 steps/mm at 16x  -> 50 full steps/mm   -> 21.1667 Hz per ipm, max 40 ipm ($110=1016)
//   Z: $102=1932 steps/mm at 32x -> 60.375 full/mm     -> 25.5588 Hz per ipm, max 22 ipm ($112=558.8)
//   C: $103=13.333 steps/deg at 8x -> 600 full/rev     -> 10 Hz per rpm, max 275 rpm ($113=99000)
// Room (Rev): X0 mid travel +-40 mm, Z0 at the tailstock end, 80 mm toward the chuck. Used: X DRO +-1.4 (35.6 mm),
// Z -0.25..-2.5. The C test parks at Z-2.5, X0 (Rev). Every step's lines carry N<id> so the status Ln: says which
// step is playing. Output: scale_x.nc, scale_z.nc, scale_c.nc, chords.nc + <name>.schedule.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(out, { recursive: true });

const HZ = { X: (25.4 / 60) * (800 / 16), Z: (25.4 / 60) * (1932 / 32), C: (1 / 60) * 13.333 * 360 / 8 }; // per ipm / per rpm
const MAX = { X: 40, Z: 22, C: 275 };
const X_DRO = 1.4, Z_NEAR = -0.25, Z_FAR = -2.5, ZC = (Z_NEAR + Z_FAR) / 2, Z_HALF = (Z_NEAR - Z_FAR) / 2 - 0.05;
const C2 = 440 * 2 ** (-33 / 12); // 65.406 Hz
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (semis) => `${NAMES[((semis % 12) + 12) % 12]}${2 + Math.floor(semis / 12)}`; // semis from C2
const r4 = (n) => Number(n.toFixed(4));
const f4 = (n) => n.toFixed(4);
const START = ['G20 G7 G90 G94', 'M5', `G0 Z${f4(Z_NEAR)}`, 'G0 X0'];

function steps(axis) {
  const list = [];
  for (let q = 0; ; q++) {
    const hz = C2 * 2 ** (q / 24);
    const speed = hz / HZ[axis];
    if (speed > MAX[axis] * 0.995) break;
    list.push({ q, hz: r4(hz), speed: r4(speed), note: q % 2 === 0 ? noteName(q / 2) : null });
  }
  return list;
}

function scaleX() {
  const L = ['(REVTURN full sweep X: quarter tones from C2, out and back around X0, Z parked -0.25)', ...START];
  const sched = [];
  steps('X').forEach((s, i) => {
    const n = 1000 + i;
    const lr = Math.min(X_DRO / 2, (s.speed * 1.5) / 60);  // real inches per stroke (DRO swing = 2 x real)
    const side = i % 2 ? -1 : 1;
    L.push(`(${s.note ?? 'q'} ${s.hz} Hz ${s.speed} ipm)`, `N${n} G1 X${f4(side * 2 * lr)} F${s.speed}`, `N${n} G1 X0 F${s.speed}`, `N${n + 50000} G4 P0.4`);
    sched.push({ n, axis: 'X', ...s, strokeIn: r4(lr), seconds: r4((2 * lr / s.speed) * 60) });
  });
  L.push('M30', '');
  return { text: L.join('\n'), sched };
}

function scaleZ() {
  const L = ['(REVTURN full sweep Z: quarter tones from C2, out and back around Z-1.375, X0)', ...START, `G1 Z${f4(ZC)} F20`];
  const sched = [];
  steps('Z').forEach((s, i) => {
    const n = 2000 + i;
    const lz = Math.min(Z_HALF, (s.speed * 1.5) / 60);
    const side = i % 2 ? -1 : 1;
    L.push(`(${s.note ?? 'q'} ${s.hz} Hz ${s.speed} ipm)`, `N${n} G1 Z${f4(ZC + side * lz)} F${s.speed}`, `N${n} G1 Z${f4(ZC)} F${s.speed}`, `N${n + 50000} G4 P0.4`);
    sched.push({ n, axis: 'Z', ...s, strokeIn: r4(lz), seconds: r4((2 * lz / s.speed) * 60) });
  });
  L.push(`G1 Z${f4(Z_NEAR)} F20`, 'M30', '');
  return { text: L.join('\n'), sched };
}

function scaleC() {
  const L = ['(REVTURN full sweep C: spindle quarter tones from C2, parked Z-2.5 X0 per Rev)', 'G20 G7 G90 G94', 'M5', `G0 Z${f4(Z_FAR)}`, 'G0 X0'];
  const sched = [];
  steps('C').forEach((s, i) => {
    const n = 3000 + i;
    L.push(`(${s.note ?? 'q'} ${s.hz} Hz ${s.speed} rpm)`, `N${n} M3 S${s.speed}`, `N${n} G4 P2.5`);
    sched.push({ n, axis: 'C', ...s, seconds: 2.5 });
  });
  L.push('M5', 'G4 P2', `G0 Z${f4(Z_NEAR)}`, 'M30', '');
  return { text: L.join('\n'), sched };
}

// CHORDS: [label, X Hz, Z Hz, C Hz] (null = that motor off). Combined X+Z moves: the path feed is set so each
// axis runs at its own speed; strokes out and back around X0 / Z-1.375, about 2 s each.
const CHORDS = [
  ['X+Z both at their resonance, 1 Hz beat', 127, 128, null],
  ['X+Z near unison, 2 Hz beat', 220, 222, null],
  ['X+Z 10 Hz beat', 220, 230, null],
  ['X+Z minor second, a clash', 220, 233.08, null],
  ['X+Z perfect fifth', 220, 330, null],
  ['X+Z octave', 220, 440, null],
  ['X + spindle, 2 Hz beat', 220, null, 222],
  ['Z + spindle, 2 Hz beat', null, 220, 222],
  ['X + spindle, X at resonance', 127, null, 130],
  ['all three near unison: 2, 3, 5 Hz beats', 220, 222, 225],
  ['all three at their resonance', 127, 128, 130],
  ['all three in tune: A4 unison', 440, 440, 440],
  ['C major chord: X C4, Z E4, C G4', 261.63, 329.63, 392],
  ['A minor chord: X A3, Z C4, C E4', 220, 261.63, 329.63],
  ['low rumble', 100, 100, 100],
  ['spread', 150, 200, 250],
  ['mid', 400, 500, 600],
  ['X+Z fast, spindle 2 octaves up', 600, 550, 2400],
  ['everything fast', 800, 550, 2600],
];

function chords() {
  const L = ['(REVTURN chords: all the motors at once at chosen pitches)', ...START, `G1 Z${f4(ZC)} F20`];
  const sched = [];
  CHORDS.forEach(([label, fx, fz, fc], i) => {
    const n = 4000 + i;
    const vx = fx ? fx / HZ.X : 0, vz = fz ? fz / HZ.Z : 0, rpm = fc ? fc / HZ.C : 0;
    if (vx > MAX.X || vz > MAX.Z || rpm > MAX.C) throw new Error(`chord ${label} is past a max rate`);
    let t = 2;                                                   // seconds per stroke
    if (vx) t = Math.min(t, ((X_DRO / 2) / vx) * 60);
    if (vz) t = Math.min(t, (Z_HALF / vz) * 60);
    const lx = (vx * t) / 60, lz = (vz * t) / 60, F = Math.hypot(vx, vz);
    const side = i % 2 ? -1 : 1;
    L.push(`(${label.replace(/[()]/g, "")}: X ${fx ?? '-'} Hz, Z ${fz ?? '-'} Hz, C ${fc ?? '-'} Hz)`);
    L.push(rpm ? `N${n} M3 S${r4(rpm)}` : `N${n} M5`, `N${n} G4 P${rpm ? 1.2 : 0.3}`);
    if (F) {
      const go = [vx ? `X${f4(side * 2 * lx)}` : '', vz ? `Z${f4(ZC + side * lz)}` : ''].filter(Boolean).join(' ');
      const back = [vx ? 'X0' : '', vz ? `Z${f4(ZC)}` : ''].filter(Boolean).join(' ');
      L.push(`N${n} G1 ${go} F${r4(F)}`, `N${n} G1 ${back} F${r4(F)}`);
    } else L.push(`N${n} G4 P${2 * t}`);
    L.push(`N${n + 50000} G4 P0.5`);
    sched.push({ n, label, xHz: fx, zHz: fz, cHz: fc, xIpm: r4(vx), zIpm: r4(vz), rpm: r4(rpm), pathF: r4(F), seconds: r4(2 * t) });
  });
  L.push('M5', `G1 Z${f4(Z_NEAR)} F20`, 'M30', '');
  return { text: L.join('\n'), sched };
}

const jobs = { 'scale_x.nc': scaleX(), 'scale_z.nc': scaleZ(), 'scale_c.nc': scaleC(), 'chords.nc': chords() };
for (const [name, j] of Object.entries(jobs)) {
  writeFileSync(join(out, name), j.text);
  writeFileSync(join(out, name.replace('.nc', '.schedule.json')), JSON.stringify({ hzPer: HZ, max: MAX, steps: j.sched }, null, 1));
  const secs = j.sched.reduce((s, x) => s + x.seconds + 0.6, 0);
  const notes = j.sched.filter((x) => x.note).map((x) => x.note);
  console.log(`${name}: ${j.sched.length} steps, about ${Math.round(secs)} s${notes.length ? `, notes ${notes[0]}..${notes.at(-1)} (${notes.length}, ${(notes.length / 12).toFixed(1)} octaves)` : ''}`);
}
