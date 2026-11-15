// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// Standard MIDI File reader (format 0 and 1): tracks, names, channels, notes in seconds (tempo changes applied).
// No libraries. Returns { format, ppq, tracks: [{ name, channel, notes: [{ t, dur, key, vel, ch }] }], length }.

const str = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

export function parseMidi(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 14 || str(b, 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const u32 = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const hlen = u32(4), format = u16(8), ntr = u16(10), div = u16(12);
  if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');
  const ppq = div;
  let p = 8 + hlen;
  const raw = [];                                        // per track: events with absolute ticks
  const tempos = [];                                      // [tick, usPerQuarter]
  for (let tr = 0; tr < ntr && p + 8 <= b.length; tr++) {
    if (str(b, p, 4) !== 'MTrk') { p += 8 + u32(p + 4); tr--; if (p >= b.length) break; continue; }
    const end = Math.min(b.length, p + 8 + u32(p + 4));
    let i = p + 8, tick = 0, status = 0;
    const ev = { name: '', events: [] };
    const vlq = () => { let v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && i < end); return v; };
    while (i < end) {
      tick += vlq();
      let s = b[i];
      if (s & 0x80) { i++; if (s < 0xf0) status = s; } else s = status;   // running status
      if (s === 0xff) {
        const type = b[i++], len = vlq();
        if (type === 0x51 && len === 3) tempos.push([tick, (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]]);
        if ((type === 0x03 || type === 0x04) && !ev.name) ev.name = str(b, i, len).trim();
        if (type === 0x2f) { i += len; break; }
        i += len;
      } else if (s === 0xf0 || s === 0xf7) { i += vlq(); }
      else {
        const hi = s & 0xf0, ch = s & 0x0f;
        const d1 = b[i++], d2 = hi === 0xc0 || hi === 0xd0 ? 0 : b[i++];
        if (hi === 0x90 || hi === 0x80) ev.events.push({ tick, on: hi === 0x90 && d2 > 0, key: d1, vel: d2, ch });
      }
    }
    raw.push(ev);
    p = end;
  }
  // tick -> seconds through the tempo map (default 120 bpm)
  tempos.sort((x, y) => x[0] - y[0]);
  const map = [[0, 0, 500000]];                           // [tick, seconds at tick, us per quarter]
  for (const [tk, us] of tempos) {
    const [t0, s0, u0] = map[map.length - 1];
    const sec = s0 + ((tk - t0) * u0) / ppq / 1e6;
    if (tk === t0) map[map.length - 1] = [tk, s0, us]; else map.push([tk, sec, us]);
  }
  const toSec = (tk) => {
    let k = map.length - 1; while (k > 0 && map[k][0] > tk) k--;
    const [t0, s0, u0] = map[k];
    return s0 + ((tk - t0) * u0) / ppq / 1e6;
  };
  const tracks = [];
  let length = 0;
  for (const tr of raw) {
    const open = new Map(), notes = [];
    for (const e of tr.events) {
      const id = `${e.ch}:${e.key}`;
      if (e.on) {
        if (open.has(id)) close(open.get(id), e.tick);      // a re-strike closes the old note
        open.set(id, { tick: e.tick, key: e.key, vel: e.vel, ch: e.ch });
      } else if (open.has(id)) { close(open.get(id), e.tick); open.delete(id); }
    }
    for (const o of open.values()) close(o, o.tick + ppq);  // a note never released: one beat
    function close(o, tk) { const t = toSec(o.tick); notes.push({ t, dur: Math.max(0.01, toSec(tk) - t), key: o.key, vel: o.vel, ch: o.ch }); }
    notes.sort((x, y) => x.t - y.t || y.key - x.key);
    if (!notes.length) continue;
    const chs = new Set(notes.map((n) => n.ch));
    for (const ch of chs) {                                 // split multi-channel tracks (format 0) per channel
      const ns = notes.filter((n) => n.ch === ch);
      tracks.push({ name: tr.name || `channel ${ch + 1}`, channel: ch, notes: ns });
      length = Math.max(length, ...ns.map((n) => n.t + n.dur));
    }
  }
  return { format, ppq, tracks, length, bpm: Math.round(60e6 / (tempos[0]?.[1] ?? 500000)) };
}

// Tiny writer, used by the tests and to make demo files: tracks = [{ name, ch, notes: [{ t (beats), dur (beats), key, vel }] }]
export function writeMidi(tracks, { bpm = 120, ppq = 480 } = {}) {
  const vlq = (v) => { const out = [v & 0x7f]; while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80); return out; };
  const chunk = (id, data) => [...id].map((c) => c.charCodeAt(0)).concat([(data.length >>> 24) & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255], data);
  const us = Math.round(60e6 / bpm);
  const trks = tracks.map((tr, ti) => {
    const ev = [];
    if (ti === 0) ev.push([0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]]);
    const nm = [...(tr.name ?? '')].map((c) => c.charCodeAt(0) & 0x7f);
    ev.push([0, [0xff, 0x03, nm.length, ...nm]]);
    for (const n of tr.notes) {
      ev.push([Math.round(n.t * ppq), [0x90 | (tr.ch ?? 0), n.key, n.vel ?? 100]]);
      ev.push([Math.round((n.t + n.dur) * ppq), [0x80 | (tr.ch ?? 0), n.key, 0]]);
    }
    ev.sort((a, b) => a[0] - b[0] || (a[1][0] & 0xf0) - (b[1][0] & 0xf0)); // offs (0x80) before ons (0x90) at a tie
    const data = []; let last = 0;
    for (const [tk, bytes] of ev) { data.push(...vlq(tk - last), ...bytes); last = tk; }
    data.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', data);
  });
  const head = chunk('MThd', [0, 1, 0, trks.length, (ppq >> 8) & 255, ppq & 255]);
  return new Uint8Array([...head, ...trks.flat()]);
}
