// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Rev 2026-11-11: MUSIC = MIDI songs (X melody, Z bass, legato) + a drum machine (Z kick/snare, X hats/toms).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseMidi, writeMidi } from '../src/music/midi.js';
import { autoRoles, monoLine, fitVoice, mergeShort, gmDrum, drumsToGrid, hzOf } from '../src/music/voices.js';
import { machineFrom, rangeOf, buildSong, buildBeat, presetGrid, stepPieces, netTravel, KIT, MIN_MOVE, PRESETS, zDrumNotes } from '../src/music/build.js';
import { startApp } from '../src/app.js';
import { SONGS as BOOK_SONGS } from '../src/music/songs.js';
import { registerMusic } from '../src/ui/music.js';
import { FakeLink } from './helpers/fake-link.js';

const ode = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
const odeMidi = (bpm = 120) => writeMidi([
  { name: 'melody', ch: 0, notes: ode.map((key, i) => ({ t: i, dur: 0.9, key })) },
  { name: 'bass', ch: 1, notes: [48, 43, 48, 43].map((key, i) => ({ t: i * 4, dur: 4, key })) },
  { name: 'drums', ch: 9, notes: [0, 1, 2, 3].map((b) => ({ t: b, dur: 0.1, key: b % 2 ? 38 : 36 })) },
], { bpm });
const M = machineFrom(new Map());                      // Rev's lathe defaults

describe('MIDI reader', () => {
  it('reads tracks, names, channels and notes in seconds', () => {
    const mid = parseMidi(odeMidi(120));
    expect(mid.tracks.map((t) => t.name)).toEqual(['melody', 'bass', 'drums']);
    expect(mid.tracks[2].channel).toBe(9);
    expect(mid.bpm).toBe(120);
    const mel = mid.tracks[0].notes;
    expect(mel).toHaveLength(15);
    expect(mel[1].t).toBeCloseTo(0.5, 5);               // 1 beat at 120 bpm
    expect(mel[0].dur).toBeCloseTo(0.45, 5);
    expect(mid.length).toBeCloseTo(8, 1);
  });
  it('applies the tempo (60 bpm doubles every time)', () => {
    expect(parseMidi(odeMidi(60)).tracks[0].notes[2].t).toBeCloseTo(2, 5);
  });
  it('handles running status and note-on with velocity 0 as note-off', () => {
    // MThd + one MTrk: on C4, (running) on E4, (running) C4 vel 0, (running) E4 vel 0
    const trk = [0, 0x90, 60, 100, 0, 64, 100, 0x60, 60, 0, 0, 64, 0, 0, 0xff, 0x2f, 0];
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, trk.length, ...trk]);
    const n = parseMidi(bytes).tracks[0].notes;
    expect(n.map((x) => x.key).sort()).toEqual([60, 64]);
    expect(n[0].dur).toBeCloseTo(0.5, 5);
  });
  it('refuses something that is not MIDI', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]))).toThrow(/not a MIDI/);
  });
});

describe('voices', () => {
  it('auto roles: highest track on X, lowest on Z, channel 10 is drums', () => {
    expect(autoRoles(parseMidi(odeMidi()).tracks)).toEqual(['x', 'z', 'drums']);
  });
  it('one note at a time: the highest (melody) or lowest (bass) wins', () => {
    const chord = [{ t: 0, dur: 1, key: 60 }, { t: 0, dur: 1, key: 64 }, { t: 0.5, dur: 1, key: 67 }];
    expect(monoLine(chord, 'high').map((n) => n.key)).toEqual([64, 67]);
    expect(monoLine(chord, 'low').map((n) => n.key)).toEqual([60, 67]);   // C4 holds the bass until it ends, then G4
  });
  it('fits a voice into the motor range by whole octaves and folds strays', () => {
    const [lo, hi] = rangeOf(M, 'Z');
    const r = fitVoice([{ t: 0, dur: 1, key: 23 }, { t: 1, dur: 1, key: 33 }], lo, hi); // B0, A1: too low for Z
    expect(r.shift % 12).toBe(0);
    for (const n of r.notes) { expect(n.hz).toBeGreaterThanOrEqual(lo); expect(n.hz).toBeLessThanOrEqual(hi); }
    expect(hzOf(69)).toBeCloseTo(440, 6);
  });
  it('merges notes too short for the slow Z', () => {
    expect(mergeShort([{ t: 0, dur: 0.5, key: 40 }, { t: 0.5, dur: 0.1, key: 43 }, { t: 0.6, dur: 0.5, key: 45 }], 0.25)).toHaveLength(2);
  });
  it('General MIDI drums map to the kit and quantize to the 8th grid', () => {
    expect([36, 38, 42, 46, 41, 48, 70].map(gmDrum)).toEqual(['K', 'S', 'H', 'O', 'T', 'U', null]);
    const g = drumsToGrid([{ t: 0, key: 36 }, { t: 0.25, key: 42 }, { t: 0.5, key: 38 }], 120, 16);
    expect(g.K[0] && g.H[1] && g.S[2]).toBe(true);
  });
});

describe('song program', () => {
  const mid = parseMidi(odeMidi());
  const mel = fitVoice(monoLine(mid.tracks[0].notes), ...rangeOf(M, 'X'));
  const bass = fitVoice(monoLine(mid.tracks[1].notes, 'low'), ...rangeOf(M, 'Z'));
  it('pitch = feed: A4 on X runs at 440 / 21.17 Hz per ipm', () => {
    expect(M.hz.X).toBeCloseTo(21.1667, 3);
    const s = buildSong([{ t: 0, dur: 1, hz: 440 }], [], M, { dolphin: false });
    expect(s.lines.find((l) => /^N9000 G1/.test(l))).toMatch(/F20\.787/);
  });
  it('stays inside its box, never passes the max rates and ends where it started', () => {
    const s = buildSong(mel.notes, bass.notes, M, { boxX: 0.3, boxZ: 0.2, dolphin: true });
    const net = netTravel(s.lines);
    expect(net.maxX).toBeLessThanOrEqual(0.3 + 0.03);
    expect(net.maxZ).toBeLessThanOrEqual(0.2 + 0.02);
    expect(Math.abs(net.x)).toBeLessThan(1e-3);
    expect(Math.abs(net.z)).toBeLessThan(1e-3);
    const feeds = s.lines.filter((l) => / F/.test(l)).map((l) => Number(/F([\d.]+)/.exec(l)[1]));
    expect(Math.max(...feeds)).toBeLessThanOrEqual(Math.hypot(M.max.X, M.max.Z));
    expect(s.lines[1]).toBe('G20 G7 G91 G94');
    expect(s.lines.slice(-2)).toEqual(['G90', 'M30']);
  });
  it('legato: X only turns around to re-strike a note (or at the box edge), plucked mode turns on every note', () => {
    const notes = [60, 62, 64, 64].map((k, i) => ({ t: i * 0.5, dur: 0.5, hz: hzOf(k) }));
    const turns = (lines) => { let last = 0, n = 0; for (const l of lines) { const x = /X(-?[\d.]+)/.exec(l); if (!x || !/^N9/.test(l)) continue; const s = Math.sign(Number(x[1])); if (last && s !== last) n++; last = s; } return n; };
    expect(turns(buildSong(notes, [], M, { boxX: 1 }).lines)).toBe(1);           // only E4 struck twice
    expect(turns(buildSong(notes, [], M, { boxX: 1, legato: false }).lines)).toBe(3);
  });
  it('a rest is a dwell, and tempo stretches the song', () => {
    const s = buildSong([{ t: 0, dur: 0.5, hz: 300 }, { t: 1, dur: 0.5, hz: 300 }], [], M, { tempo: 0.5 });
    expect(s.lines.some((l) => /G4 P1\.000/.test(l))).toBe(true);
    expect(s.seconds).toBeCloseTo(3, 3);
  });
  it('Z drum strokes (scripts only) really move the slide at least 0.010 in and keep 0.7 s apart', () => {
    const z = zDrumNotes([{ t: 0, piece: 'K' }, { t: 0.2, piece: 'S' }, { t: 1, piece: 'S' }], M);
    expect(z).toHaveLength(4);
    const s = buildSong([], z, M);
    for (const l of s.lines.filter((x) => /^N9\d+ G1 Z/.test(x))) expect(Math.abs(Number(/Z(-?[\d.]+)/.exec(l)[1]))).toBeGreaterThanOrEqual(MIN_MOVE - 1e-4);
  });
});

describe('beat program (drum machine)', () => {
  it('every kit move is at least 0.010 in (Rev)', () => {
    for (const k of Object.values(KIT)) for (const [, d] of k.g) expect(Math.abs(d)).toBeGreaterThanOrEqual(MIN_MOVE - 1e-9);
  });
  it('a Z hit drops a plain hat on the same step; toms and the open hat stay', () => {
    const g = { K: [true, true], S: [false, false], H: [true, false], O: [false, false], T: [false, true], U: [false, false] };
    expect(stepPieces(g, 0)).toEqual(['K']);
    expect(stepPieces(g, 1)).toEqual(['T', 'K']);
  });
  it('steps are padded to the longest step so the beat keeps time, and it ends where it started', () => {
    for (const name of Object.keys(PRESETS)) {
      const b = buildBeat(presetGrid(name), M, { repeats: 2 });
      const net = netTravel(b.lines);
      expect(Math.abs(net.x)).toBeLessThan(1e-3);
      expect(Math.abs(net.z)).toBeLessThan(1e-3);
      expect(b.step).toBeGreaterThanOrEqual(0.6);        // a kick or snare at Z accel 12 takes about 0.63 to 0.65 s
    }
  });
  it('faster Z accel shortens the steps', () => {
    const fast = machineFrom(new Map([[122, '48']]));
    expect(buildBeat(presetGrid('ROCK'), fast).step).toBeLessThan(buildBeat(presetGrid('ROCK'), M).step);
  });
});

describe('MUSIC window', () => {
  let root, link, app, music, sent;
  const $ = (s) => root.querySelector(s);
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink(); sent = [];
    const fetchImpl = async (url, o = {}) => {                       // a tiny fake of the lathe's /files API
      if (o.method === 'POST') sent.push(o.body.get('file').name.replace(/^\//, ''));
      return { ok: true, json: async () => ({ files: sent.map((name) => ({ name })) }), text: async () => '{}' };
    };
    app = startApp(root, link, { host: 'lathe', fetchImpl });
    music = registerMusic(app);
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0>');
  });
  afterEach(() => { app.stop(); vi.useRealTimers(); });

  it('has a MUSIC button that opens the SONG and BEAT tabs', () => {
    click($('[data-mode="MUSIC"]'));
    expect(root.querySelector('[data-mtab="SONG"]')).toBeTruthy();
    click(root.querySelector('[data-mtab="BEAT"]'));
    expect(root.querySelectorAll('[data-step]').length).toBe(6 * 16);
  });
  it('a loaded MIDI lists its tracks with X / Z picks, and the drums can go to the BEAT grid', () => {
    click($('[data-mode="MUSIC"]'));
    click(root.querySelector('[data-mtab="SONG"]'));
    music.loadMidi(odeMidi(), 'ode.mid');
    const picks = [...root.querySelectorAll('[data-role]')].map((s) => s.value);
    expect(picks).toEqual(['x', 'z', 'off']);
    click(root.querySelector('[data-togrid]'));
    expect(music.grid.K[0]).toBe(true);
    expect(music.grid.S[2]).toBe(true);
  });
  it('GO shows the preview, GO again sends music.nc and runs it', async () => {
    click($('[data-mode="MUSIC"]'));
    click(root.querySelector('[data-mtab="SONG"]'));
    music.loadMidi(odeMidi(), 'ode.mid');
    const go = $('[data-go]');
    click(go); await vi.advanceTimersByTimeAsync(20);
    expect(root.querySelector('[data-mprev]').hidden).toBe(false);
    expect(root.querySelector('[data-mcode]').textContent).toMatch(/G20 G7 G91 G94/);
    click(go); await vi.advanceTimersByTimeAsync(20);
    expect(sent).toContain('music.nc');
    expect(link.lines).toContain('$F=/music.nc');
  });
  // Rev 2026-11-12: "save enter sandman to my songbook on the machine": book_*.nc on the flash show in BOOK
  it('BOOK lists MY SONGS saved on the lathe; GO shows the file, GO again runs it from the flash', async () => {
    sent.push('book_enter_sandman.nc', 'part1.nc');
    click($('[data-mode="MUSIC"]'));
    click(root.querySelector('[data-mtab="BOOK"]'));
    await vi.advanceTimersByTimeAsync(20);
    // Rev 2026-11-12: "make it look like programs": one DOS DIR list (like PROG) with the flash gauge, the built-in
    // songs first, then the ones saved on the lathe
    expect(root.querySelector('[data-booklist] .dirw')).toBeTruthy();
    expect(root.querySelector('[data-mbody] [data-flash-gauge]')).toBeTruthy();
    const names = [...root.querySelectorAll('[data-booklist] [data-book] .dwn')].map((b) => b.textContent);
    expect(names.slice(0, BOOK_SONGS.length)).toEqual(['GYMNOPÉDIE NO. 1', 'FÜR ELISE', 'IN THE HALL OF THE MOUNTAIN KING', 'MOONLIGHT SONATA (1ST MOVEMENT)', 'SYMPHONY NO. 5 (OPENING)', 'TURKISH MARCH (THE RUINS OF ATHENS)']);
    expect(names.slice(BOOK_SONGS.length)).toEqual(['ENTER SANDMAN']); // only book_ files
    const mine = [...root.querySelectorAll('[data-booklist] [data-book^="file:"]')];
    click(mine[0]);
    expect(mine[0].classList.contains('sel') || root.querySelector('[data-book^="file:"].sel')).toBeTruthy();
    click($('[data-go]')); await vi.advanceTimersByTimeAsync(20);
    expect(root.querySelector('[data-mprev]').hidden).toBe(false);
    sent.length = 0;
    click($('[data-go]')); await vi.advanceTimersByTimeAsync(20);
    expect(sent).toEqual([]); // nothing uploaded
    expect(link.lines).toContain('$F=/book_enter_sandman.nc');
  });
});

describe('song book (public domain, arranged by JMSCNC)', () => {
  it('every song reads, has both voices, and fits the motors (after slides)', async () => {
    const { SONGS, voiceNotes, expandSlides } = await import('../src/music/songs.js');
    expect(SONGS.map((s) => s.id)).toEqual(['gymnopedie', 'fur-elise', 'mountain-king', 'moonlight', 'beethoven-5', 'turkish-march']);
    const [xl, xh] = rangeOf(M, 'X'), [zl, zh] = rangeOf(M, 'Z');
    for (const s of SONGS) {
      const x = expandSlides(voiceNotes(s, 'x')), z = expandSlides(voiceNotes(s, 'z'));
      expect(x.length).toBeGreaterThan(20);
      expect(z.length).toBeGreaterThan(5);
      for (const n of x) { expect(n.hz).toBeGreaterThanOrEqual(xl); expect(n.hz).toBeLessThanOrEqual(xh); }
      for (const n of z) { expect(n.hz).toBeGreaterThanOrEqual(zl); expect(n.hz).toBeLessThanOrEqual(zh); }
      const prog = buildSong(x, z, M, { boxX: 0.65, boxZ: 0.4 });
      const net = netTravel(prog.lines);
      expect(net.maxX).toBeLessThanOrEqual(0.65 + 1e-6);    // long notes split and turn around inside the box
      expect(net.maxZ).toBeLessThanOrEqual(0.4 + 1e-6);
    }
  });
  it('a slide bends in small steps from one note to the next, ending at the next note', async () => {
    const { expandSlides } = await import('../src/music/songs.js');
    const out = expandSlides([{ t: 0, dur: 1, key: 62, hz: 293.66, slide: true }, { t: 1, dur: 1, key: 57, hz: 220 }], { time: 0.4, steps: 4 });
    expect(out).toHaveLength(6);
    expect(out[0].dur).toBeCloseTo(0.6, 6);
    const hz = out.slice(1, 5).map((n) => n.hz);
    expect(hz[0]).toBeLessThan(293.66); expect(hz[3]).toBeGreaterThan(220);
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeLessThan(hz[i - 1]);
  });
  it('Mountain King speeds up every time round', async () => {
    const { SONGS, voiceNotes } = await import('../src/music/songs.js');
    const x = voiceNotes(SONGS.find((s) => s.id === 'mountain-king'), 'x');
    expect(x[0].dur).toBeCloseTo(0.3, 6);
    expect(x[x.length - 10].dur).toBeLessThan(0.15);
  });
});
