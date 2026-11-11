// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Live check against the lathe: connect, ask for status, print what comes back.
// Usage: node tools/probe.mjs [ws://revturn.local:81/] [--upload] [--cmd "<line>"]
// Read-only by default: sends only the realtime status request '?'.
import { LatheLink } from '../src/link.js';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('ws://')) ?? 'ws://revturn.local:81/';
const cmdIdx = args.indexOf('--cmd');
const cmd = cmdIdx >= 0 ? args[cmdIdx + 1] : null;

const link = new LatheLink(url, { reconnectMs: 60000 });
const lines = [];
link.addEventListener('line', (e) => lines.push(e.detail));
link.addEventListener('status', (e) => {
  console.log('STATUS', e.detail);
  if (!cmd) finish(0);
});
link.addEventListener('connection', (e) => {
  if (!e.detail.connected) return;
  if (cmd) link.sendLine(cmd);
  setTimeout(() => link.sendRealtime(0x3f), cmd ? 800 : 300);
});

function finish(code) {
  for (const l of lines) console.log('LINE  ', l);
  link.close();
  setTimeout(() => process.exit(code), 100);
}

setTimeout(() => { console.log('NO STATUS within 5 s'); finish(1); }, 5000);
link.connect();
