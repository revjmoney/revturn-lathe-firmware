// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// MUSIC (Rev 2026-11-11): the lathe plays songs with its stepper motors.
//   SONG: load a MIDI file, pick what each track does (X melody, Z bass, off), section, transpose, tempo. Legato:
//   X and Z keep rolling and only change speed between notes. (Drums under a melody chop it, Rev 2026-11-11: "drums
//   aren't great on this", so a song's drum track goes to the BEAT grid instead.)
//   BOOK: the REVTURN song book, public-domain pieces arranged by JMSCNC for X + Z, with slides and speed-ups.
//   MY SONGS (in BOOK, Rev 2026-11-12: "save enter sandman to my songbook on the machine"): programs saved on the
//   lathe's flash as book_<name>.nc. Rev's own picks (copyrighted songs too) live only there, never in this code.
//   GO shows the code, GO again runs the file straight from the flash.
//   BEAT: a drum machine with Rev's kit (Z kick and snare, X hats and toms), presets and a 16-step grid.
// GO previews (piano roll or grid + the code); GO again sends music.nc to the lathe and runs it, like CYCLES.
// Everything plays in a small box around wherever the tool is, and ends back where it started.
import { parseMidi } from '../music/midi.js';
import { autoRoles, monoLine, fitVoice, mergeShort, drumsToGrid, noteName, isDrumTrack } from '../music/voices.js';
import { machineFrom, rangeOf, buildSong, buildBeat, KIT, ROWS, PRESETS, presetGrid } from '../music/build.js';
import { SONGS, voiceNotes, expandSlides } from '../music/songs.js';
import { uploadFile, runLine, listFilesInfo, readFile } from '../files.js';
import { gaugeHtml, dirwHtml, dirFooterHtml } from './dirw.js';
import { h, on, esc } from './dom.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};
const ROLE_NAMES = { x: 'X MELODY', z: 'Z BASS', off: 'OFF' };
const STEPS = 16;

export function registerMusic(app) {
  let tab = store.get('revturn.music.tab') ?? 'SONG';
  let song = null, roles = [], fileName = '';
  let bookId = store.get('revturn.music.book') ?? SONGS[0].id;
  let grid = store.get('revturn.music.grid') ?? presetGrid('BOOM BAP', STEPS);
  let opts = { from: 0, to: 60, transpose: 0, tempo: 100, dolphin: true, boxX: 0.6, boxZ: 0.3, repeats: 2, microX: 16, microZ: 32, ...(store.get('revturn.music.opts') ?? {}) };
  let armed = null, view = null, mySongs = [], flash = null, booksLoaded = false;
  // book_enter_sandman.nc -> ENTER SANDMAN
  const songLabel = (f) => f.replace(/^book_/, '').replace(/\.nc$/i, '').replace(/[_-]+/g, ' ').toUpperCase();
  const isMine = () => String(bookId).startsWith('file:');
  // the flash is listed once per visit to BOOK: with ~40 files a listing keeps the lathe busy for 2-3 s
  const loadMySongs = async () => {
    booksLoaded = true;
    try {
      flash = await listFilesInfo(app.host, app.fetchImpl);
      mySongs = flash.files.filter((f) => /^book_.+\.nc$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    } catch { flash = null; mySongs = []; }
    drawBookList();
  };
  // Rev 2026-11-12: "make it look like programs": the PROG screen's flash gauge and DOS DIR list
  const drawBookList = () => {
    const box = view?.querySelector('[data-booklist]'); if (!box) return;
    const items = [...SONGS.map((x) => ({ name: x.id, label: x.title.toUpperCase() })),
      ...mySongs.map((f) => ({ name: `file:${f.name}`, label: songLabel(f.name), bytes: f.bytes, time: f.time }))];
    box.innerHTML = dirwHtml(items, bookId, 'data-book');
    const g = view.querySelector('[data-bookflash]'); if (g) g.innerHTML = flash ? gaugeHtml(flash) : '';
    const foot = view.querySelector('[data-bookfoot]');
    if (foot) foot.innerHTML = flash ? dirFooterHtml(items.length, mySongs.reduce((t, f) => t + f.bytes, 0), Math.max(0, flash.total - flash.used)).replace('program(s)', 'song(s)   ') : '';
  };
  const bookInfo = () => {
    const sel = isMine() ? null : SONGS.find((x) => x.id === bookId) ?? SONGS[0];
    return sel ? `<b>${esc(sel.title)}</b>, ${esc(sel.composer)}. ${esc(sel.note ?? '')} Arranged by JMSCNC for X (melody) and Z (bass), public domain.`
      : `<b>${esc(songLabel(bookId.slice(5)))}</b>: saved on the lathe (${esc(bookId.slice(5))}). Plays as saved: it moves to its own start spot, so TEMPO and BOX do not apply.`;
  };

  const machine = () => machineFrom(app.settingValues, { x: opts.microX, z: opts.microZ });
  const saveOpts = () => store.set('revturn.music.opts', opts);

  const mount = (panel) => {
    view = h(`<div class="music">
      <div class="picker">${['BOOK', 'SONG', 'BEAT'].map((t) => `<button data-mtab="${t}">${t}</button>`).join('')}</div>
      <div data-mbody></div>
      <div data-mprev hidden><canvas class="preview" data-mroll></canvas><div class="code" data-mcode></div></div>
    </div>`);
    panel.appendChild(view);
    on(view, '[data-mtab]', 'click', (e, b) => { if (b.dataset.mtab === 'BOOK') booksLoaded = false; tab = b.dataset.mtab; store.set('revturn.music.tab', tab); render(); });
    view.addEventListener('input', onEdit);
    view.addEventListener('change', onEdit);
    on(view, '[data-step]', 'click', (e, b) => { const [r, i] = b.dataset.step.split(':'); grid[r][+i] = !grid[r][+i]; store.set('revturn.music.grid', grid); disarm(); b.classList.toggle('on', grid[r][+i]); beatInfo(); });
    on(view, '[data-book]', 'click', (e, b) => {
      bookId = b.dataset.book; store.set('revturn.music.book', bookId); disarm();
      for (const it of view.querySelectorAll('[data-book]')) it.classList.toggle('sel', it === b);
      const info = view.querySelector('[data-bookinfo]'); if (info) info.innerHTML = bookInfo();
      songInfo();
    });
    on(view, '[data-preset]', 'click', (e, b) => { grid = presetGrid(b.dataset.preset, STEPS); store.set('revturn.music.grid', grid); disarm(); render(); });
    on(view, '[data-togrid]', 'click', () => { const tr = song?.tracks.find(isDrumTrack); if (!tr) return; grid = drumsToGrid(tr.notes.filter((n) => n.t >= opts.from).map((n) => ({ ...n, t: n.t - opts.from })), song.bpm, STEPS); store.set('revturn.music.grid', grid); tab = 'BEAT'; render(); app.msg('Drum track copied to the BEAT grid'); });
    view.querySelector('[data-mbody]').addEventListener('change', (e) => { if (e.target.matches('[data-midi]')) loadFile(e.target.files?.[0]); });
    render();
  };

  const onEdit = (e) => {
    const t = e.target;
    if (t.matches('[data-opt]')) { const k = t.dataset.opt; opts[k] = t.type === 'checkbox' ? t.checked : Number(t.value); saveOpts(); disarm(); if (tab === 'BEAT') beatInfo(); else songInfo(); }
    if (t.matches('[data-role]')) { roles[+t.dataset.role] = t.value; disarm(); songInfo(); }
  };

  const disarm = () => { armed = null; if (view) view.querySelector('[data-mprev]').hidden = true; };

  async function loadFile(file) {
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      loadMidi(buf, file.name);
    } catch (err) { app.msg(`MIDI not read: ${err.message}`); }
  }
  function loadMidi(bytes, name) {
    song = parseMidi(bytes); fileName = name;
    roles = autoRoles(song.tracks).map((r) => (r === 'drums' ? 'off' : r));
    opts.from = 0; opts.to = Math.min(60, Math.ceil(song.length)); saveOpts();
    disarm(); render();
    app.msg(`${name}: ${song.tracks.length} tracks, ${Math.round(song.length)} s. GO to preview`);
  }

  const render = () => {
    if (!view) return;
    for (const b of view.querySelectorAll('[data-mtab]')) b.classList.toggle('on', b.dataset.mtab === tab);
    const body = view.querySelector('[data-mbody]');
    body.innerHTML = '';
    body.appendChild(tab === 'SONG' ? songForm() : tab === 'BOOK' ? bookForm() : beatForm());
    if (tab === 'BEAT') beatInfo(); else songInfo();
  };

  const num = (k, label, step = 1, min = '', max = '') => `<label class="mopt">${label}<input type="number" data-opt="${k}" value="${opts[k]}" step="${step}" min="${min}" max="${max}"></label>`;

  function songForm() {
    const rows = song ? song.tracks.map((t, i) => {
      const ks = t.notes.map((n) => n.key);
      const choices = isDrumTrack(t) ? ['off'] : ['x', 'z', 'off'];
      return `<tr><td>${esc(t.name)}</td><td>${t.channel + 1}</td><td>${t.notes.length}</td><td>${noteName(Math.min(...ks))}..${noteName(Math.max(...ks))}</td>
        <td><select data-role="${i}">${choices.map((c) => `<option value="${c}"${roles[i] === c ? ' selected' : ''}>${ROLE_NAMES[c]}</option>`).join('')}</select></td></tr>`;
    }).join('') : '';
    return h(`<div>
      <label class="mfile">LOAD MIDI <input type="file" accept=".mid,.midi,.kar,audio/midi" data-midi></label>
      ${song ? `<div class="minfo">${esc(fileName)}: ${Math.round(song.length)} s, ${song.bpm} bpm</div>
      <table class="mtracks"><tr><th>TRACK</th><th>CH</th><th>NOTES</th><th>RANGE</th><th>PLAYS</th></tr>${rows}</table>
      ${song.tracks.some(isDrumTrack) ? '<button class="mbtn" data-togrid>DRUMS TO BEAT GRID</button>' : ''}` : '<div class="soon">Load a .mid file. X plays the melody, Z the bass. Drum tracks can go to the BEAT grid.</div>'}
      <div class="mopts">${num('from', 'FROM s', 1, 0)}${num('to', 'TO s', 1, 1)}${num('transpose', 'TRANSPOSE', 1, -24, 24)}${num('tempo', 'TEMPO %', 5, 25, 200)}
        ${num('boxX', 'X BOX ± in', 0.05, 0.1, 1.4)}${num('boxZ', 'Z BOX ± in', 0.05, 0.05, 2)}${num('microX', 'X MICROSTEP', 1, 1, 256)}${num('microZ', 'Z MICROSTEP', 1, 1, 256)}
        <label class="mopt"><input type="checkbox" data-opt="dolphin"${opts.dolphin ? ' checked' : ''}> DOLPHIN INTRO</label></div>
      <div class="minfo" data-msum></div>
    </div>`);
  }

  function bookForm() {
    if (!booksLoaded) queueMicrotask(loadMySongs); else queueMicrotask(drawBookList);
    return h(`<div>
      <div data-bookflash></div>
      <div class="list" data-booklist><div class="soon">Reading the song list…</div></div>
      <div data-bookfoot></div>
      <div class="minfo" data-bookinfo>${bookInfo()}</div>
      <div class="mopts">${num('tempo', 'TEMPO %', 5, 25, 200)}${num('boxX', 'X BOX ± in', 0.05, 0.1, 1.4)}${num('boxZ', 'Z BOX ± in', 0.05, 0.05, 2)}${num('microX', 'X MICROSTEP', 1, 1, 256)}${num('microZ', 'Z MICROSTEP', 1, 1, 256)}
        <label class="mopt"><input type="checkbox" data-opt="dolphin"${opts.dolphin ? ' checked' : ''}> DOLPHIN INTRO</label></div>
      <div class="minfo" data-msum></div>
    </div>`);
  }

  function beatForm() {
    const head = `<tr><th></th>${Array.from({ length: STEPS }, (_, i) => `<th>${i % 2 ? '&' : i / 2 + 1}</th>`).join('')}</tr>`;
    const rows = ROWS.map((r) => `<tr><th>${KIT[r].label} <span class="dim">${KIT[r].ax}</span></th>${grid[r].map((on2, i) => `<td><button class="mstep${on2 ? ' on' : ''}" data-step="${r}:${i}" aria-label="${KIT[r].label} step ${i + 1}"></button></td>`).join('')}</tr>`).join('');
    return h(`<div>
      <div class="picker">${Object.keys(PRESETS).map((p) => `<button data-preset="${p}">${p}</button>`).join('')}</div>
      <table class="mgrid">${head}${rows}</table>
      <div class="mopts">${num('repeats', 'REPEATS', 1, 1, 64)}</div>
      <div class="minfo" data-msum></div>
    </div>`);
  }

  // build the program for the current tab: { ok, lines, info, notes } or { ok: false, error }
  function make() {
    const m = machine();
    if (tab === 'BEAT') {
      if (!ROWS.some((r) => grid[r].some(Boolean))) return { ok: false, error: 'The beat is empty: tap some steps' };
      const b = buildBeat(grid, m, { repeats: opts.repeats, title: 'beat' });
      return { ok: true, lines: b.lines, info: `8ths every ${b.step.toFixed(2)} s (${Math.round(b.bpm)} bpm), ${b.hits} hits, about ${Math.round(b.seconds)} s` };
    }
    if (tab === 'BOOK' && isMine()) return { ok: true, file: bookId.slice(5), lines: null, info: `${songLabel(bookId.slice(5))} (on the lathe)` };
    if (tab === 'BOOK') {
      const sel = SONGS.find((x) => x.id === bookId) ?? SONGS[0];
      const x = expandSlides(voiceNotes(sel, 'x')), z = expandSlides(voiceNotes(sel, 'z'));
      const s = buildSong(x, z, m, { boxX: opts.boxX, boxZ: opts.boxZ, tempo: opts.tempo / 100, dolphin: opts.dolphin, title: `${sel.title}, ${sel.composer}, arranged by JMSCNC` });
      const len = Math.max(...[...x, ...z].map((n) => n.t + n.dur));
      return { ok: true, lines: s.lines, info: `${sel.title}: X ${x.length} notes, Z ${z.length} notes, about ${Math.round(s.seconds + (opts.dolphin ? 4 : 0))} s${s.warnings.length ? `; ${s.warnings.join('; ')}` : ''}`, notes: { x, z, len } };
    }
    if (!song) return { ok: false, error: 'Load a MIDI file first' };
    const win = (n) => n.t >= opts.from && n.t < opts.to;
    const cut = (ns) => ns.filter(win).map((n) => ({ ...n, t: n.t - opts.from, dur: Math.min(n.dur, opts.to - n.t) }));
    const pick = (role) => song.tracks.filter((t, i) => roles[i] === role).flatMap((t) => t.notes);
    const [xl, xh] = rangeOf(m, 'X'), [zl, zh] = rangeOf(m, 'Z');
    const mel = fitVoice(monoLine(cut(pick('x')), 'high'), xl, xh, opts.transpose);
    const bass = fitVoice(monoLine(cut(pick('z')), 'low'), zl, zh, opts.transpose);
    const zNotes = mergeShort(bass.notes, 0.25 * Math.sqrt(12 / m.acc.Z));
    const zInfo = zNotes.length ? `Z bass ${zNotes.length} notes${bass.shift ? ` (shifted ${bass.shift > 0 ? '+' : ''}${bass.shift})` : ''}${bass.folded ? `, ${bass.folded} folded` : ''}` : 'Z off';
    if (!mel.notes.length && !zNotes.length) return { ok: false, error: 'Nothing to play in that section: pick tracks or change FROM / TO' };
    const s = buildSong(mel.notes, zNotes, m, { boxX: opts.boxX, boxZ: opts.boxZ, tempo: opts.tempo / 100, dolphin: opts.dolphin, title: fileName || 'song' });
    const info = `X melody ${mel.notes.length} notes${mel.folded ? `, ${mel.folded} folded` : ''}${mel.shift ? `, shifted ${mel.shift > 0 ? '+' : ''}${mel.shift}` : ''}; ${zInfo}; about ${Math.round(s.seconds + (opts.dolphin ? 4 : 0))} s${s.warnings.length ? `; ${s.warnings.join('; ')}` : ''}`;
    return { ok: true, lines: s.lines, info, notes: { x: mel.notes, z: zNotes, len: (opts.to - opts.from) } };
  }

  const songInfo = () => { const el = view?.querySelector('[data-msum]'); if (!el) return; if (!song && tab !== 'BOOK') { el.textContent = ''; return; } const r = make(); el.textContent = r.ok ? r.info : r.error; };
  const beatInfo = () => { const el = view?.querySelector('[data-msum]'); if (!el) return; const r = make(); el.textContent = r.ok ? r.info : r.error; };

  function drawRoll(canvas, notes) {
    const w = (canvas.width = canvas.clientWidth || 600), hgt = (canvas.height = canvas.clientHeight || 160);
    const g = canvas.getContext?.('2d'); if (!g) return;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, hgt);
    const all = [...notes.x, ...notes.z];
    const lo = Math.log2(Math.min(60, ...all.map((n) => n.hz))), hi = Math.log2(Math.max(900, ...all.map((n) => n.hz)));
    const X = (t) => (t / Math.max(1, notes.len)) * w, Y = (f) => hgt - ((Math.log2(f) - lo) / (hi - lo)) * (hgt - 8) - 4;
    for (const n of notes.x) { g.fillStyle = n.folded ? '#ff6b6b' : '#9dff9d'; g.fillRect(X(n.t), Y(n.hz) - 2, Math.max(2, X(n.dur)), 4); }
    for (const n of notes.z) { g.fillStyle = n.folded ? '#ff6b6b' : '#ffb347'; g.fillRect(X(n.t), Y(n.hz) - 2, Math.max(2, X(n.dur)), 4); }
  }

  let goBusy = false;
  const onGo = async () => { if (goBusy) return; goBusy = true; try { await onGoOnce(); } finally { goBusy = false; } };
  const onGoOnce = async () => {
    if (!view) return;
    if (armed) {
      const busy = app.idleCheck(); if (busy) { app.msg(busy); return; }
      const r = make(); armed = null; view.querySelector('[data-mprev]').hidden = true;
      if (!r.ok) { app.msg(r.error); return; }
      if (r.file) { if (app.send(runLine(r.file))) app.msg(`${songLabel(r.file)} playing: HOLD / STOP work as usual`); return; }
      try {
        app.msg('Sending music to the lathe…');
        await uploadFile(app.host, 'music.nc', r.lines.join('\n') + '\n', app.fetchImpl);
        if (app.send(runLine('music.nc'))) app.msg(`${tab === 'BEAT' ? 'Beat' : 'Song'} playing: HOLD / STOP work as usual`);
      } catch (err) { app.msg(err.message); }
      return;
    }
    const r = make();
    if (!r.ok) { app.msg(r.error); return; }
    if (r.file) { try { r.lines = (await readFile(app.host, r.file, app.fetchImpl)).split('\n'); } catch (err) { app.msg(err.message); return; } }
    const wrap = view.querySelector('[data-mprev]'); wrap.hidden = false;
    view.querySelector('[data-mcode]').textContent = r.lines.join('\n');
    const canvas = view.querySelector('[data-mroll]');
    canvas.hidden = !r.notes;
    if (r.notes) drawRoll(canvas, r.notes);
    armed = r.lines;
    app.msg(`${r.info}. GO again to play (the tool moves a little around where it is now)`);
  };

  app.registerMode('MUSIC', { mount, onGo, onDryRun: () => { disarm(); app.msg('MUSIC moves the slides only (no spindle): GO to preview again'); } });
  return { loadMidi, make, get grid() { return grid; }, set tab(t) { tab = t; render(); } };
}
