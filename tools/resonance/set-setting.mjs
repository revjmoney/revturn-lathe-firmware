// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Set grblHAL settings (machine must be Idle) and print old and new: node set-setting.mjs 113=108000 [123=3000 ...]
import { LatheLink } from '../../screen/src/link.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const link = new LatheLink('ws://revturn.local:81/', { reconnectMs: 60000 });
let raw = ''; const lines = [];
link.addEventListener('status', (e) => { raw = e.detail; });
link.addEventListener('line', (e) => lines.push(e.detail));
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('no connection')), 8000); link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } }); link.connect(); });
const poll = setInterval(() => link.sendRealtime(0x3f), 100);
await sleep(600);
if (!/^<Idle/.test(raw)) { console.error('not Idle:', raw.slice(0, 40)); process.exit(1); }
for (const kv of process.argv.slice(2)) {
  const [id, v] = kv.split('=');
  lines.length = 0; link.sendLine(`$${id}`); await sleep(500); const old = lines.find((l) => l.startsWith(`$${id}=`));
  lines.length = 0; link.sendLine(`$${id}=${v}`); await sleep(500); const ok = lines.find((l) => /^(ok|error)/.test(l));
  lines.length = 0; link.sendLine(`$${id}`); await sleep(500); const now = lines.find((l) => l.startsWith(`$${id}=`));
  console.log(`${old} -> ${now} (${ok})`);
}
clearInterval(poll); link.close(); process.exit(0);
