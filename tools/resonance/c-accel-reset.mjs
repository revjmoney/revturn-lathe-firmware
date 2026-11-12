// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Stop whatever runs (hold, then reset), report $123, and set it to the value given (default 240).
import { LatheLink } from '../../screen/src/link.js';
const want = process.argv[2] ?? '240';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = new LatheLink('ws://revturn.local:81/', { reconnectMs: 60000 });
let raw = ''; const lines = [];
link.addEventListener('status', (e) => { raw = e.detail; });
link.addEventListener('line', (e) => lines.push(e.detail));
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('no connection')), 8000); link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } }); link.connect(); });
const poll = setInterval(() => link.sendRealtime(0x3f), 100);
await sleep(500);
console.log('was:', raw.slice(0, 70));
if (!/^<Idle/.test(raw)) { link.sendRealtime(0x21); for (let i = 0; i < 80 && !/Hold:0|^<Idle/.test(raw); i++) await sleep(100); link.sendRealtime(0x18); await sleep(1500); }
lines.length = 0; link.sendLine('$123'); await sleep(800);
console.log('C accel was', lines.find((l) => /^\$123=/.test(l)));
lines.length = 0; link.sendLine(`$123=${want}`); await sleep(800);
lines.length = 0; link.sendLine('$123'); await sleep(800);
console.log('C accel now', lines.find((l) => /^\$123=/.test(l)), '| state', raw.slice(0, 60));
clearInterval(poll); link.close(); process.exit(0);
