// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// PROG file box (Rev 2026-11-12): a small glowing gauge of the lathe's flash (size and use), and the program list
// laid out like DOS "DIR /W" (names packed in columns), but narrower columns so twice as many fit across.
import { esc } from './dom.js';

const K = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}M` : `${Math.round(b / 1024)}K`);
const commas = (n) => Math.round(n).toLocaleString('en-US');

// the ring: green, amber past 75%, red past 90%, with a soft glow in the same colour
export function gaugeHtml({ total = 0, used = 0, pct = 0 } = {}) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const col = p >= 90 ? '#ff5a4a' : p >= 75 ? '#ffb347' : '#7fffb0';
  const r = 26, c = 2 * Math.PI * r, on = (c * p) / 100;
  return `<div class="flashgauge" data-flash-gauge="${p}" title="Lathe flash: ${commas(used)} of ${commas(total)} bytes used">
    <svg viewBox="0 0 64 64" width="64" height="64" aria-label="Flash ${p}% used">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="#14202a" stroke-width="7"/>
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${on.toFixed(1)} ${(c - on).toFixed(1)}" transform="rotate(-90 32 32)" style="filter: drop-shadow(0 0 3px ${col}) drop-shadow(0 0 6px ${col})"/>
      <text x="32" y="36" text-anchor="middle" fill="${col}" font-size="13" font-family="Consolas, monospace" font-weight="bold">${p}%</text>
    </svg>
    <div class="fg-text"><b>FLASH</b><span>${K(used)} of ${K(total)} used</span><span>${K(Math.max(0, total - used))} free</span></div>
  </div>`;
}

// DOS style date: 2026-11-11T18:18:05 -> 11-11-26 (Rev: "a date saved would be cool")
// a year before 2000 means the lathe's clock was not set when the file was saved (it starts at 1970): show dashes
export const dosDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); if (!m) return ''; return Number(m[1]) < 2000 ? '--------' : `${m[2]}-${m[3]}-${m[1].slice(2)}`; };

// DIR listing (Rev 2026-11-12: "include the file sizes ... and long filenames"): each cell is a DOS DIR line, the
// full name on the left and its size (bytes, with commas) on the right; cells are packed in narrow columns, two or
// more across. items: [{ name, bytes }] or plain names.
export function dirwHtml(items, selected, attr = 'data-prog-item') {
  if (!items.length) return '<div class="soon">No programs saved yet</div>';
  const list = items.map((it) => (typeof it === 'string' ? { name: it } : it));
  // label (optional): what to show when it differs from the value (MUSIC BOOK: "ENTER SANDMAN" for file:book_enter_sandman.nc)
  return `<div class="dirw">${list.map(({ name, label, bytes, time }) => `<div class="dw${name === selected ? ' sel' : ''}" ${attr}="${esc(name)}" title="${esc(label ?? name)}${time ? `  saved ${esc(String(time).replace('T', ' '))}` : ''}"><span class="dwn">${esc(label ?? name)}</span>${bytes != null ? `<span class="dws">${commas(bytes)}</span>` : ''}${time ? `<span class="dwd">${dosDate(time)}</span>` : ''}</div>`).join('')}</div>`;
}

// the DOS footer: "  12 program(s)   45,312 bytes" / "     460,800 bytes free"
export function dirFooterHtml(count, bytes, free) {
  return `<pre class="dirfoot">${String(count).padStart(6)} program(s)  ${commas(bytes).padStart(12)} bytes\n${''.padStart(19)}${commas(free).padStart(12)} bytes free</pre>`;
}
