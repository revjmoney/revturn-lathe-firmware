// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Stop a running program cleanly: feed hold, wait until motion has stopped (Hold:0), then soft reset (no alarm).
import { LatheLink } from '../../screen/src/link.js';
import { parseStatus } from '../../screen/src/status.js';
const host = process.argv[2] ?? 'revturn.local';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = new LatheLink(`ws://${host}:81/`, { reconnectMs: 60000 });
let last = null, raw = '';
link.addEventListener('status', (e) => { raw = e.detail; last = parseStatus(e.detail, last) ?? last; });
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('no connection')), 8000); link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } }); link.connect(); });
const poll = setInterval(() => link.sendRealtime(0x3f), 100);
link.sendRealtime(0x21);                                   // feed hold
for (let i = 0; i < 60 && !/Hold:0/.test(raw); i++) await sleep(100);
console.log('held:', raw.slice(0, 60));
link.sendRealtime(0x85);                                   // jog cancel (harmless)
link.sendRealtime(0x18);                                   // soft reset: ends the program
link.sendRealtime(0x95);                                   // spindle stays off after reset anyway
await sleep(1500);
console.log('now:', raw.slice(0, 60));
clearInterval(poll); link.close(); process.exit(0);
