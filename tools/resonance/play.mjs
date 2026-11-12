// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// Play one program on the lathe with no phone: uploads it, runs it, logs the status 10x a second (line N, state,
// position) so the hits can be lined up with a camera or a later recording.
// Usage: node play.mjs --file drum_test.nc [--lathe revturn.local]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LatheLink } from '../../screen/src/link.js';
import { parseStatus } from '../../screen/src/status.js';
import { uploadFile, runLine } from '../../screen/src/files.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const file = arg('--file'), host = arg('--lathe', 'revturn.local');
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!file) { console.error('need --file <program>.nc'); process.exit(2); }

const link = new LatheLink(`ws://${host}:81/`, { reconnectMs: 60000 });
const log = []; let last = null, t0 = Date.now();
link.addEventListener('status', (e) => { const s = parseStatus(e.detail, last); if (!s) return; last = s; log.push([Date.now() - t0, s.state, s.feed, s.sd ? s.sd.pct : '', s.ln ?? '', s.mpos.map((v) => v.toFixed(4)).join(' ')]); });
link.addEventListener('line', (e) => { if (/^(error|ALARM)/.test(e.detail)) console.log('lathe:', e.detail); });
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('lathe did not connect')), 8000); link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } }); link.connect(); });
const poll = setInterval(() => link.sendRealtime(0x3f), 100);
await sleep(800);
if (last?.state !== 'Idle') { console.error(`lathe must be Idle (it is ${last?.state ?? 'unknown'})`); process.exit(1); }
const text = readFileSync(join(here, file), 'utf8');
await uploadFile(host, file, text);
t0 = Date.now(); log.length = 0;
const startedAt = new Date(t0).toISOString();
link.sendLine(runLine(file));
console.log(`playing ${file}`);
let started = false, quiet = 0;
for (;;) {
  await sleep(250);
  const st = last?.state;
  if (last?.sd || st === 'Run') started = true;
  quiet = started && !last?.sd && st === 'Idle' ? quiet + 1 : 0;
  if (quiet >= 8) break;
  if (/Alarm|Door/.test(st ?? '')) { console.error(`lathe went to ${st}: stopping`); break; }
  if (Date.now() - t0 > 15 * 60000) { console.error('took too long'); break; }
}
clearInterval(poll); link.close();
const dir = join(here, 'runs', `${file.replace('.nc', '')}-play-${startedAt.replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'lathe.csv'), 't_ms,state,feed_mm_min,sd_pct,line_n,mpos_xyzc\n' + log.map((r) => r.join(',')).join('\n') + '\n');
writeFileSync(join(dir, 'meta.json'), JSON.stringify({ file, startedAt, statusCount: log.length, endState: last?.state, endMpos: last?.mpos }, null, 1));
writeFileSync(join(dir, file), text);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s, end ${last?.state} at ${last?.mpos?.map((v) => v.toFixed(4)).join(' ')}; saved ${dir}`);
process.exit(0);
