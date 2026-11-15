// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// Turn MIDI tracks into what two stepper motors can play: one note at a time per motor.
// X plays the melody (the highest sounding note), Z plays the bass (the lowest). Channel 10 is drums and is only
// used by the drum machine (a coordinated machine cannot hit a drum in the middle of a melody move).

export const hzOf = (key) => 440 * 2 ** ((key - 69) / 12);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (key) => `${NAMES[((key % 12) + 12) % 12]}${Math.floor(key / 12) - 1}`;
export const isDrumTrack = (tr) => tr.channel === 9;

// auto roles: drums -> 'drums'; the melodic track with the highest average pitch -> 'x', lowest -> 'z', rest 'off'
// (rest also go to 'x' or 'z' if their average sits close to that voice, so a split piano still sounds whole)
export function autoRoles(tracks) {
  const mel = tracks.map((t, i) => ({ i, avg: t.notes.reduce((s, n) => s + n.key, 0) / t.notes.length })).filter(({ i }) => !isDrumTrack(tracks[i]));
  const roles = tracks.map((t) => (isDrumTrack(t) ? 'drums' : 'off'));
  if (!mel.length) return roles;
  mel.sort((a, b) => b.avg - a.avg);
  roles[mel[0].i] = 'x';
  if (mel.length > 1) roles[mel[mel.length - 1].i] = 'z';
  return roles;
}

// one note at a time: at every moment keep the highest (pick='high') or lowest ('low') sounding note.
// Returns [{ t, dur, key }] with no overlaps; a re-struck note starts a new entry.
export function monoLine(notes, pick = 'high') {
  if (!notes.length) return [];
  const marks = [...new Set(notes.flatMap((n) => [n.t, n.t + n.dur]))].sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k], b2 = marks[k + 1];
    if (b2 - a < 1e-6) continue;
    const live = notes.filter((n) => n.t <= a + 1e-9 && n.t + n.dur >= b2 - 1e-9);
    if (!live.length) continue;
    const n = live.reduce((m, x) => (pick === 'high' ? (x.key > m.key ? x : m) : x.key < m.key ? x : m));
    const prev = out[out.length - 1];
    if (prev && prev.src === n && Math.abs(prev.t + prev.dur - a) < 1e-6) prev.dur += b2 - a;
    else out.push({ t: a, dur: b2 - a, key: n.key, src: n });
  }
  return out.map(({ t, dur, key }) => ({ t, dur, key }));
}

// shift a voice by whole octaves so most notes fit [loHz, hiHz]; notes still outside fold in by octaves and are
// marked folded. Returns { notes: [{ t, dur, key, hz, folded }], shift (semitones), folded (count) }
export function fitVoice(line, loHz, hiHz, transpose = 0) {
  if (!line.length) return { notes: [], shift: 0, folded: 0 };
  let best = 0, bestIn = -1;
  for (let o = -4; o <= 4; o++) {
    const inside = line.filter((n) => { const f = hzOf(n.key + transpose + 12 * o); return f >= loHz && f <= hiHz; }).length;
    if (inside > bestIn || (inside === bestIn && Math.abs(o) < Math.abs(best))) { bestIn = inside; best = o; }
  }
  const shift = transpose + 12 * best;
  let folded = 0;
  const notes = line.map((n) => {
    let key = n.key + shift, f = hzOf(key), fold = false;
    while (f > hiHz && f / 2 >= loHz) { key -= 12; f /= 2; fold = true; }
    while (f < loHz && f * 2 <= hiHz) { key += 12; f *= 2; fold = true; }
    const out = f > hiHz * 1.0001 || f < loHz * 0.9999;
    if (fold) folded++;
    return { t: n.t, dur: n.dur, key, hz: f, folded: fold, outside: out };
  });
  return { notes, shift, folded };
}

// a slow motor (Z, low accel) cannot speak short notes: fold notes under minDur into the note before them
export function mergeShort(notes, minDur) {
  const out = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    if (prev && n.dur < minDur && Math.abs(prev.t + prev.dur - n.t) < 0.02) prev.dur = n.t + n.dur - prev.t;
    else out.push({ ...n });
  }
  return out;
}

// General MIDI drum keys -> REVTURN kit pieces (K kick, S snare, H hat, O open hat, T floor tom, U high tom)
export function gmDrum(key) {
  if (key === 35 || key === 36) return 'K';
  if (key === 37 || key === 38 || key === 39 || key === 40) return 'S';
  if (key === 42 || key === 44) return 'H';
  if (key === 46 || key === 49 || key === 51 || key === 52 || key === 55 || key === 57 || key === 59) return 'O';
  if (key === 41 || key === 43 || key === 45) return 'T';
  if (key === 47 || key === 48 || key === 50) return 'U';
  return null;
}

// quantize a MIDI drum track to a grid of 8th notes: rows K,S,H,O,T,U x steps (true/false), up to maxSteps
export function drumsToGrid(notes, bpm, maxSteps = 16) {
  const step = 60 / bpm / 2;
  const grid = { K: [], S: [], H: [], O: [], T: [], U: [] };
  for (const r of Object.keys(grid)) grid[r] = Array(maxSteps).fill(false);
  for (const n of notes) {
    const piece = gmDrum(n.key); const s = Math.round(n.t / step);
    if (piece && s < maxSteps) grid[piece][s] = true;
  }
  return grid;
}
