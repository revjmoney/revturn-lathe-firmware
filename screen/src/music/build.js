// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// MUSIC program builders. A stepper sings at its FULL-STEP rate, so feed = pitch:
//   Hz per ipm = (25.4 / 60) * steps-per-mm / microsteps      (X, Z)
// Songs: every slice of time is one combined X+Z move (X = melody pitch, Z = bass pitch, path F = hypot).
// Each new note reverses its axis (the "pluck"); a slice that starts from a stop is shortened by F/a so the tempo
// holds through the accel ramps. Everything is incremental (G91) inside a box around where the tool is, and ends
// back where it started. Beats: Rev's drum kit (2026-11-11 sound test, every move at least 0.010 in), steps padded
// to one steady length, hit lengths measured on the lathe and scaled for other accel settings.

export const MIN_MOVE = 0.010;                                 // in (Rev: ".010 smallest moves")
const r4 = (n) => n.toFixed(4);
const r3 = (n) => n.toFixed(3);

// machine numbers from the grblHAL settings (values Map id -> string) plus microsteps (not known to grblHAL)
export function machineFrom(values, micro = {}) {
  const v = (id, d) => { const x = Number(values?.get?.(id)); return Number.isFinite(x) && x > 0 ? x : d; };
  const mx = micro.x ?? 16, mz = micro.z ?? 32, mc = micro.c ?? 8;
  return {
    hz: { X: (25.4 / 60) * (v(100, 800) / mx), Z: (25.4 / 60) * (v(102, 1932) / mz), C: (v(103, 13.333) * 360) / mc / 60 },
    max: { X: v(110, 1016) / 25.4, Z: v(112, 558.8) / 25.4, C: v(113, 99000) / 360 },  // ipm (C: rpm)
    acc: { X: v(120, 50), Z: v(122, 12), C: v(123, 3000) },    // mm/s2 (C: deg/s2, Rev set 3000 on 2026-11-12)
    micro: { x: mx, z: mz, c: mc },
  };
}

// playable pitch range per motor (Hz): from 2 ipm up to 99% of the max rate
export const rangeOf = (m, ax) => [m.hz[ax] * 2, m.hz[ax] * m.max[ax] * 0.99];

// ---------- drum kit ----------
const ob = (ax, d, f, n = 1) => Array.from({ length: n }, () => [[ax, d, f], [ax, -d, f]]).flat();
const bend = (fs, segS) => fs.map((f) => ['X', Math.max(MIN_MOVE, (f * segS) / 60), f]);
// sec = measured on the lathe at X accel 50, Z accel 12 (round 2): scaled by sqrt(base/accel) elsewhere
export const KIT = {
  K: { label: 'KICK', ax: 'Z', g: ob('Z', 0.010, 10), sec: 0.63 },
  S: { label: 'SNARE', ax: 'Z', g: ob('Z', 0.010, 22), sec: 0.65 },
  H: { label: 'HAT', ax: 'X', g: ob('X', 0.020, 40), sec: 0.41 },
  O: { label: 'OPEN HAT', ax: 'X', g: ob('X', 0.010, 40, 2), sec: 0.62 },
  T: { label: 'FLOOR TOM', ax: 'X', g: bend([10, 7, 4.5], 0.14), sec: 0.52, tom: true },
  U: { label: 'HIGH TOM', ax: 'X', g: bend([13, 9, 6], 0.1), sec: 0.39, tom: true },
};
export const ROWS = ['H', 'O', 'U', 'T', 'S', 'K'];
const kitSec = (m, c) => KIT[c].sec * Math.sqrt((KIT[c].ax === 'Z' ? 12 : 50) / m.acc[KIT[c].ax]);

export const PRESETS = {
  'BOOM BAP': { K: 'x..x....xx......', S: '....x.......x...', H: '..x...x...x...x.', O: '', T: '', U: '' },
  ROCK: { K: 'x...xx..x...xx..', S: '..x...x...x...x.', H: '.x.x...x.x.x...x', O: '.......x', T: '', U: '' },
  'FOUR ON THE FLOOR': { K: 'x.x.x.x.x.x.x.x.', S: '', H: '.x.x.x.x.x.x.x.x', O: '', T: '', U: '' },
  'HALF TIME': { K: 'x.......x.x.....', S: '....x.......x...', H: 'xxxx....xxxx....', O: '', T: '', U: '' },
  FILL: { K: 'x...............', S: '..x.x...........', H: '', O: '', T: '........xx..xx..', U: '....xx..x.x.....' },
};
export const presetGrid = (name, steps = 16) => Object.fromEntries(ROWS.map((r) => [r, Array.from({ length: steps }, (_, i) => (PRESETS[name]?.[r] ?? '')[i] === 'x')]));

// a step: Z plays kick or snare (snare wins), X plays one of hat / open hat / toms (tom wins). A step with a Z hit
// drops a plain closed hat: Z and X hits cannot overlap, and kick + hat back to back is longer than one step.
export function stepPieces(grid, i) {
  const z = grid.S?.[i] ? 'S' : grid.K?.[i] ? 'K' : null;
  let x = grid.T?.[i] ? 'T' : grid.U?.[i] ? 'U' : grid.O?.[i] ? 'O' : grid.H?.[i] ? 'H' : null;
  if (z && x === 'H') x = null;
  return [x, z].filter(Boolean);
}

export function buildBeat(grid, m, { repeats = 2, title = 'beat' } = {}) {
  const steps = Math.max(...ROWS.map((r) => grid[r]?.length ?? 0));
  const cost = (i) => stepPieces(grid, i).reduce((s, c) => s + kitSec(m, c), 0);
  const step = Math.max(0.2, ...Array.from({ length: steps }, (_, i) => cost(i))) + 0.01;
  const L = [`(REVTURN beat: ${title.replace(/[()]/g, '')}, 8ths every ${r3(step)} s)`, 'G20 G7 G91 G94', 'G4 P1'];
  let n = 8000, tomDir = 1, hits = 0;
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < steps; i++) {
      const pieces = stepPieces(grid, i);
      for (const c of pieces) {
        for (const [ax, d0, f] of KIT[c].g) {
          const d = KIT[c].tom ? d0 * tomDir : d0;
          L.push(`N${n} G1 ${ax}${r4(ax === 'X' ? 2 * d : d)} F${f}`);
        }
        if (KIT[c].tom) tomDir = -tomDir;
        hits++;
      }
      const rest = step - cost(i);
      if (rest > 0.02) L.push(`N${n} G4 P${r3(rest)}`);
      n++;
    }
  }
  // toms move one way per hit: put X back where it started
  let net = 0, t2 = 1;
  for (let r = 0; r < repeats; r++) for (let i = 0; i < steps; i++) for (const c of stepPieces(grid, i)) if (KIT[c].tom) { net += t2 * KIT[c].g.reduce((s, x) => s + x[1], 0); t2 = -t2; }
  if (Math.abs(net) > 1e-6) L.push(`G1 X${r4(-2 * net)} F10`);
  L.push('G90', 'M30');
  return { lines: L, step, bpm: 60 / (2 * step), seconds: step * steps * repeats + 1, hits };
}

// ---------- songs ----------
// x, z: [{ t, dur, hz }] (one note at a time each, seconds). Returns { lines, warnings, seconds, moves }
// legato (default): an axis keeps rolling the same way and only changes speed between notes (milliseconds at X accel
// 50); it reverses only at the edge of its box or to re-strike the same note. legato false = reverse on every note
// (the old "pluck" style: each note starts from a stop, so short fast notes never reach their pitch).
export function buildSong(x, z, m, { boxX = 0.6, boxZ = 0.5, tempo = 1, dolphin = false, drone = null, title = 'song', legato = true } = {}) {
  const warnings = [];
  const sx = x.map((n) => ({ ...n, t: n.t / tempo, dur: n.dur / tempo }));
  const sz = z.map((n) => ({ ...n, t: n.t / tempo, dur: n.dur / tempo }));
  const marks = [...new Set([0, ...sx.flatMap((n) => [n.t, n.t + n.dur]), ...sz.flatMap((n) => [n.t, n.t + n.dur])].map((v) => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b);
  const at = (list, a, b) => list.find((n) => n.t <= a + 1e-4 && n.t + n.dur >= b - 1e-4);
  const L = [`(REVTURN music: ${title.replace(/[()]/g, '')})`, 'G20 G7 G91 G94'];
  if (drone) L.push(`M3 S${r3(drone)}`, 'G4 P0.8');
  let px = 0, pz = 0, dx = 1, dz = 1, n = 9000, seconds = 0, moves = 0;
  if (dolphin) {
    const D = [[24, 28, 33, 38, 39.5, 36], [28, 34, 39.5, 39.5, 32, 26], [24, 30, 36, 39.5], [39.5, 33, 27, 33, 39.5], [26, 31, 36, 39.5, 39.5, 30]];
    for (const g of D) {
      for (const f0 of g) {
        const f = Math.min(f0, m.max.X * 0.99), len = (f * 0.07) / 60;
        if (Math.abs(px + dx * len) > boxX) dx = -dx;
        px += dx * len; L.push(`N8900 G1 X${r4(2 * dx * len)} F${f.toFixed(2)}`); seconds += 0.07;
      }
      dx = -dx;
      L.push('N8901 G4 P0.12'); seconds += 0.12;
    }
    L.push('N8902 G4 P0.6'); seconds += 0.6;
  }
  let lastX = null, lastZ = null;
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k], b = marks[k + 1], d = b - a;
    if (d < 1e-3) continue;
    const nx = at(sx, a, b), nz = at(sz, a, b);
    if (!nx && !nz) { L.push(`N${n} G4 P${r3(d)}`); seconds += d; lastX = lastZ = null; n++; continue; }
    const vxI = nx ? Math.min(nx.hz / m.hz.X, m.max.X) : 0, vzI = nz ? Math.min(nz.hz / m.hz.Z, m.max.Z) : 0;
    const newX = nx && nx !== lastX, newZ = nz && nz !== lastZ;
    const sameX = newX && lastX && Math.abs(lastX.hz - nx.hz) < 0.5, sameZ = newZ && lastZ && Math.abs(lastZ.hz - nz.hz) < 0.5;
    const flipX = newX && (!legato || sameX), flipZ = newZ && (!legato || sameZ);
    if (flipX) dx = -dx;
    if (flipZ) dz = -dz;
    const F = Math.hypot(vxI, vzI), Fm = (F * 25.4) / 60;
    const aEff = Math.min(vxI ? (m.acc.X * F) / vxI : Infinity, vzI ? (m.acc.Z * F) / vzI : Infinity);
    const fromStop = flipX || flipZ || (!lastX && !lastZ);
    let tc = fromStop ? Math.max(d - Fm / aEff, d * 0.4) : d;
    let lx = (vxI * tc) / 60, lz = (vzI * tc) / 60;
    if (nz?.minLen) lz = Math.max(lz, (nz.minLen * d) / nz.dur); // a drum stroke must really move the slide (Rev: 0.010 in)
    // too long for the box: split into equal parts that bounce (each bounce is an extra pluck)
    // each part is at most the box size: then turning around at the edge always lands back inside the box
    const parts = Math.max(1, Math.ceil(Math.max(lx / boxX, lz / boxZ) - 1e-9));
    if (parts > 1) { tc = Math.max(d - parts * (Fm / aEff), d * 0.4); lx = (vxI * tc) / 60; lz = (vzI * tc) / 60; }
    for (let p = 0; p < parts; p++) {
      const sxl = lx / parts, szl = lz / parts;
      if (sxl && Math.abs(px + dx * sxl) > boxX) dx = -dx;
      if (szl && Math.abs(pz + dz * szl) > boxZ) dz = -dz;
      px += sxl ? dx * sxl : 0; pz += szl ? dz * szl : 0;
      const w = [sxl ? `X${r4(2 * dx * sxl)}` : '', szl ? `Z${r4(dz * szl)}` : ''].filter(Boolean).join(' ');
      L.push(`N${n} G1 ${w} F${F.toFixed(3)}`); moves++;
      if (p < parts - 1) { if (sxl) dx = -dx; if (szl) dz = -dz; }
    }
    seconds += d; lastX = nx ?? null; lastZ = nz ?? null; n++;
    if (nx && nx.hz / m.hz.X > m.max.X) warnings.push(`X note ${Math.round(nx.hz)} Hz is above the X max rate`);
    if (nz && nz.hz / m.hz.Z > m.max.Z) warnings.push(`Z note ${Math.round(nz.hz)} Hz is above the Z max rate`);
  }
  if (Math.abs(px) > 1e-6 || Math.abs(pz) > 1e-6) L.push(`G1 ${[Math.abs(px) > 1e-6 ? `X${r4(-2 * px)}` : '', Math.abs(pz) > 1e-6 ? `Z${r4(-pz)}` : ''].filter(Boolean).join(' ')} F10`);
  if (drone) L.push('M5');
  L.push('G90', 'M30');
  return { lines: L, warnings: [...new Set(warnings)], seconds, moves };
}

// THREE VOICES (Rev 2026-11-12): X, Z and the CHUCK (C axis, spindle off) all play, in one coordinated move per slice.
// Measured on the lathe 2026-11-12: C is never scaled by inch mode, a C-only move runs at F deg/min, and when X or Z
// is in the move F is the X/Z path speed and C rides along. So: linear slices take their time from X/Z and C gets
// (deg/s x time) degrees; C-only slices use F = deg/min. Written in mm (G21) so every number means what was
// measured. C pitch: Hz = rpm x m.hz.C (10 Hz per rpm at 8x), deg/min = rpm x 360. The chuck has no box: it just
// keeps turning, and reverses only to re-strike the same note. It ends with the chuck back at its start angle
// (shortest way). C accel from $123 (needs to be high: at 240 deg/s2 a note takes a second to arrive).
export function buildTrio(x, z, c, m, { boxX = 0.6, boxZ = 0.4, tempo = 1, title = 'song', legato = true } = {}) {
  const K = 25.4, warnings = [];
  const sc = (l) => l.map((nn) => ({ ...nn, t: nn.t / tempo, dur: nn.dur / tempo }));
  const sx = sc(x), sz = sc(z), sch = sc(c);
  const marks = [...new Set([0, ...[...sx, ...sz, ...sch].flatMap((nn) => [nn.t, nn.t + nn.dur])].map((v) => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b);
  const at = (list, a, b) => list.find((nn) => nn.t <= a + 1e-4 && nn.t + nn.dur >= b - 1e-4);
  const accC = m.acc.C ?? 240;
  const L = [`(REVTURN music, three voices: ${title.replace(/[()]/g, '')})`, 'M5', 'G21 G7 G91 G94'];
  let px = 0, pz = 0, pc = 0, dx = 1, dz = 1, dcd = 1, n = 9000, seconds = 0, moves = 0;
  let lastX = null, lastZ = null, lastC = null;
  const f3 = (v) => v.toFixed(3);
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k], b = marks[k + 1], d = b - a;
    if (d < 1e-3) continue;
    const nx = at(sx, a, b), nz = at(sz, a, b), nc = at(sch, a, b);
    if (!nx && !nz && !nc) { L.push(`N${n} G4 P${r3(d)}`); seconds += d; lastX = lastZ = lastC = null; n++; continue; }
    const vx = nx ? Math.min(nx.hz / m.hz.X, m.max.X) * K : 0;             // mm/min
    const vz = nz ? Math.min(nz.hz / m.hz.Z, m.max.Z) * K : 0;
    const vc = nc ? Math.min(nc.hz / m.hz.C, (m.max.C ?? 275)) * 360 : 0;  // deg/min
    const flip = (cur, last, dir) => { const nw = cur && cur !== last; const same = nw && last && Math.abs(last.hz - cur.hz) < 0.5; return nw && (!legato || same) ? -dir : dir; };
    const ndx = flip(nx, lastX, dx), ndz = flip(nz, lastZ, dz), ndc = flip(nc, lastC, dcd);
    const fromStop = ndx !== dx || ndz !== dz || ndc !== dcd || (!lastX && !lastZ && !lastC);
    dx = ndx; dz = ndz; dcd = ndc;
    const lin = Math.hypot(vx, vz);
    // accel ramp: the slowest-to-arrive axis sets how much of the slice is spent getting up to speed
    const ramp = Math.max(vx ? vx / 60 / m.acc.X : 0, vz ? vz / 60 / m.acc.Z : 0, vc ? vc / 60 / accC : 0);
    let tc = fromStop ? Math.max(d - ramp, d * 0.4) : d;
    let lx = (vx * tc) / 60 / K, lz = (vz * tc) / 60 / K;                  // inches, for the box
    const parts = Math.max(1, Math.ceil(Math.max(lx / boxX, lz / boxZ) - 1e-9));
    for (let p = 0; p < parts; p++) {
      const sxl = lx / parts, szl = lz / parts, scl = (vc * tc) / 60 / parts;
      if (sxl && Math.abs(px + dx * sxl) > boxX) dx = -dx;
      if (szl && Math.abs(pz + dz * szl) > boxZ) dz = -dz;
      px += sxl ? dx * sxl : 0; pz += szl ? dz * szl : 0; pc += scl ? dcd * scl : 0;
      const w = [sxl ? `X${f3(2 * dx * sxl * K)}` : '', szl ? `Z${f3(dz * szl * K)}` : '', scl ? `C${f3(dcd * scl)}` : ''].filter(Boolean).join(' ');
      L.push(`N${n} G1 ${w} F${Math.round(lin > 0 ? lin : vc)}`); moves++;
      if (p < parts - 1) { if (sxl) dx = -dx; if (szl) dz = -dz; }
    }
    seconds += d; lastX = nx ?? null; lastZ = nz ?? null; lastC = nc ?? null; n++;
    if (nc && nc.hz / m.hz.C > (m.max.C ?? 275)) warnings.push(`C note ${Math.round(nc.hz)} Hz is above the C max rate`);
  }
  const back = [Math.abs(px) > 1e-6 ? `X${f3(-2 * px * K)}` : '', Math.abs(pz) > 1e-6 ? `Z${f3(-pz * K)}` : ''].filter(Boolean).join(' ');
  if (back) L.push(`G1 ${back} F250`);
  const rem = ((pc % 360) + 360) % 360;
  if (rem > 1e-3) L.push(`G1 C${f3(rem > 180 ? 360 - rem : -rem)} F18000`);
  L.push('G90 G20', 'M30');
  return { lines: L, warnings: [...new Set(warnings)], seconds, moves, chuckTurns: pc / 360 };
}

// DRUMS ON Z UNDER A MELODY: grblHAL moves X and Z together, so a separate Z jab would stop the melody. Instead
// each kick / snare becomes two short Z "notes" (out, then back) that ride inside the X melody moves:
//   kick  = 0.010 in out and back, slow (a low thud), snare = 0.020 in out and back (about 2x the pitch: rattle).
// Each half takes `half` s (Z accel 12 needs about 0.32 s for 0.010 in), so hits closer than `gap` s are dropped,
// keeping kicks and snares that land on beats first. drums: [{ t, piece: 'K'|'S' }] in song seconds.
export function zDrumNotes(drums, m, { half = 0.32 * Math.sqrt(12 / m.acc.Z), gap = 0.7 * Math.sqrt(12 / m.acc.Z), beat = 0.5 } = {}) {
  const onBeat = (t) => Math.abs(t / beat - Math.round(t / beat)) < 0.08;
  const sorted = [...drums].sort((a, b) => a.t - b.t || (onBeat(b.t) - onBeat(a.t)) || (a.piece === 'S' ? -1 : 1));
  const out = []; let lastT = -1e9;
  for (const d of sorted) {
    if (d.t - lastT < gap) continue;
    const dist = d.piece === 'S' ? 0.020 : MIN_MOVE;
    const ipm = (dist / half) * 60;
    const hz = ipm * m.hz.Z;
    out.push({ t: d.t, dur: half, hz, minLen: dist, drum: d.piece }, { t: d.t + half, dur: half, hz, minLen: dist, drum: d.piece });
    lastT = d.t;
  }
  return out;
}

// net travel of a program written by these builders (for tests and the preview): [x real in, z in]
export function netTravel(lines) {
  let x = 0, z = 0, maxX = 0, maxZ = 0;
  for (const l of lines) {
    if (!/^(N\d+ )?G1 /.test(l)) continue;
    const mx = /X(-?[\d.]+)/.exec(l), mz = /Z(-?[\d.]+)/.exec(l);
    if (mx) x += Number(mx[1]) / 2;
    if (mz) z += Number(mz[1]);
    maxX = Math.max(maxX, Math.abs(x)); maxZ = Math.max(maxZ, Math.abs(z));
  }
  return { x, z, maxX, maxZ };
}
