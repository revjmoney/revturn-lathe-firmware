// REVTURN resonance sweeps: three small programs that hold each speed for a few seconds, so a phone on the slide
// (phyphox over WiFi) can measure how hard the lathe shakes at every feed and spindle rpm.
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
//
// ABSOLUTE moves inside Rev's measured room (2026-11-11): X zero is mid travel with +-40 mm, Z zero is at the
// tailstock end with 80 mm toward the chuck (Z negative). Margins kept on both:
//   X stays within +-X_A (DRO diameter, inches)   Z stays between Z_NEAR and Z_FAR (inches)
//   x_sweep.nc  parks at Z_NEAR, X back and forth around X0, feeds 2..25 ipm
//   z_sweep.nc  parks at X0, Z back and forth from Z_NEAR toward the chuck, feeds 2..25 ipm
//   spindle_sweep.nc  no slide motion: M3 at 20..275 rpm, 4 s each
// Every program starts by going to Z_NEAR first (away from the tailstock end), then X0, and ends there.
// A 1 s pause (G4) separates the speeds so the analysis can tell them apart.
// Usage: node gen-sweep.mjs [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(out, { recursive: true });

const MM = 1 / 25.4;
const X_ROOM = 40 * MM, Z_ROOM = 80 * MM;   // Rev's numbers
const X_A = 0.85;                           // +-0.85 in on the DRO (diameter): 21.6 mm, inside +-40 mm even if that was real travel
const Z_NEAR = -0.25, Z_FAR = -2.25;        // -6.4 mm to -57 mm, inside the 80 mm
if (X_A > X_ROOM || -Z_FAR > Z_ROOM) throw new Error('sweep does not fit the room');

const FEEDS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25]; // ipm, 25 = the cap ($110/$112 = 635)
const RPMS = []; for (let r = 20; r <= 275; r += 15) RPMS.push(r); if (RPMS.at(-1) !== 275) RPMS.push(275);
const HOLD_S = 4;
const f4 = (n) => n.toFixed(4);
const START = ['G20 G7 G90 G94', 'M5', `G0 Z${f4(Z_NEAR)}`, 'G0 X0'];

function xSweep() {
  const L = ['(REVTURN resonance sweep: X axis, absolute, inside X +-0.85 DRO and Z -0.25)', ...START];
  const sched = []; let t = 0;
  for (const f of FEEDS) {
    const a = Math.min(X_A, (f * 2) / 60);       // DRO swing -a..+a = a real inches per stroke, about 2 s
    const strokeT = (a / f) * 60;
    const trips = Math.max(1, Math.ceil(HOLD_S / (2 * strokeT)));
    L.push(`(feed ${f} ipm)`, `G1 X${f4(-a / 2)} F${f}`);
    for (let i = 0; i < trips; i++) L.push(`G1 X${f4(a / 2)} F${f}`, `G1 X${f4(-a / 2)} F${f}`);
    L.push(`G1 X0 F${f}`, 'G4 P1');
    sched.push({ feed: f, seconds: trips * 2 * strokeT });
    t += trips * 2 * strokeT + strokeT + 1;
  }
  L.push('M30', '');
  return { text: L.join('\n'), sched, seconds: t };
}

function zSweep() {
  const L = ['(REVTURN resonance sweep: Z axis, absolute, Z -0.25 to -2.25, X0)', ...START];
  const sched = []; let t = 0;
  for (const f of FEEDS) {
    const s = Math.min(Z_NEAR - Z_FAR, (f * 4) / 60); // about 4 s per stroke, never past Z_FAR
    const strokeT = (s / f) * 60;
    const trips = Math.max(1, Math.ceil(HOLD_S / (2 * strokeT)));
    L.push(`(feed ${f} ipm)`);
    for (let i = 0; i < trips; i++) L.push(`G1 Z${f4(Z_NEAR - s)} F${f}`, `G1 Z${f4(Z_NEAR)} F${f}`);
    L.push('G4 P1');
    sched.push({ feed: f, seconds: trips * 2 * strokeT });
    t += trips * 2 * strokeT + 1;
  }
  L.push('M30', '');
  return { text: L.join('\n'), sched, seconds: t };
}

function spindleSweep() {
  const L = ['(REVTURN resonance sweep: spindle only, no slide motion after parking)', ...START];
  const sched = []; let t = 0;
  for (const r of RPMS) { L.push(`M3 S${r}`, 'G4 P4'); sched.push({ rpm: r, seconds: 4 }); t += 4; }
  L.push('M5', 'G4 P2', 'M30', '');
  return { text: L.join('\n'), sched, seconds: t + 2 };
}

// Long X sweep (Rev 2026-11-11: confirm X with longer moves): DRO -1.4..+1.4 (35.6 mm, inside +-40 mm),
// strokes up to 1.4 in real, at least 8 s per feed, and the new 40 ipm X cap ($110=1016) included.
const XL_A = 1.4;
const XL_FEEDS = [...FEEDS, 28, 32, 36, 40];
if (XL_A > X_ROOM) throw new Error('long X sweep does not fit the room');
function xSweepLong() {
  const L = ['(REVTURN resonance sweep: X axis LONG, absolute, inside X +-1.4 DRO and Z -0.25)', ...START];
  const sched = []; let t = 0;
  for (const f of XL_FEEDS) {
    const a = Math.min(XL_A, (f * 4) / 60);       // DRO swing -a..+a = a real inches per stroke, about 4 s at low feeds
    const strokeT = (a / f) * 60;
    const trips = Math.max(1, Math.ceil(8 / (2 * strokeT)));
    L.push(`(feed ${f} ipm)`, `G1 X${f4(-a)} F${f}`);
    for (let i = 0; i < trips; i++) L.push(`G1 X${f4(a)} F${f}`, `G1 X${f4(-a)} F${f}`);
    L.push(`G1 X0 F${f}`, 'G4 P1');
    sched.push({ feed: f, seconds: trips * 2 * strokeT });
    t += trips * 2 * strokeT + strokeT + 1;
  }
  L.push('M30', '');
  return { text: L.join('\n'), sched, seconds: t };
}

const jobs = { 'x_sweep.nc': xSweep(), 'x_sweep_long.nc': xSweepLong(), 'z_sweep.nc': zSweep(), 'spindle_sweep.nc': spindleSweep() };
for (const [name, j] of Object.entries(jobs)) {
  writeFileSync(join(out, name), j.text);
  writeFileSync(join(out, name.replace('.nc', '.schedule.json')), JSON.stringify(j.sched, null, 1));
  console.log(`${name}: ${j.sched.length} speeds, about ${Math.round(j.seconds)} s`);
}
