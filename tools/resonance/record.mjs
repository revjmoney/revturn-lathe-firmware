// REVTURN resonance recorder: runs one sweep program on the lathe while a phone running phyphox (Remote access on)
// records, all over WiFi. Logs the lathe's own live feed / rpm with PC timestamps so each speed can be cut out of
// the phone data afterwards. Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
//
// Usage:
//   node record.mjs --phone http://192.168.1.x:8080 --check            (only talk to the phone: no lathe, no motion)
//   node record.mjs --phone http://192.168.1.x:8080 --file spindle_sweep.nc [--lathe revturn.local]
// Output: runs/<file>-<time>/phone.json (every phyphox buffer), lathe.csv (t_ms,state,feed,rpm), meta.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LatheLink } from '../../../../lathe-ui/src/link.js';
import { parseStatus } from '../../../../lathe-ui/src/status.js';
import { uploadFile, runLine } from '../../../../lathe-ui/src/files.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const phone = (arg('--phone') ?? '').replace(/\/$/, '');
const file = arg('--file');
const host = arg('--lathe', 'revturn.local');
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!phone) { console.error('need --phone http://<phone ip>:8080 (shown in phyphox after Remote access is on)'); process.exit(2); }

const pget = async (path) => {
  const r = await fetch(`${phone}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`phone ${path}: HTTP ${r.status}`);
  return r.json();
};
const buffersOf = (cfg) => (cfg.buffers ?? []).map((b) => b.name);
const grab = async (names) => (await pget(`/get?${names.map((n) => `${encodeURIComponent(n)}=full`).join('&')}`)).buffer;

const cfg = await pget('/config');
const names = buffersOf(cfg);
console.log(`phone: "${cfg.title ?? cfg.crc32 ?? 'experiment'}", buffers: ${names.join(', ')}`);

if (process.argv.includes('--check')) {
  await pget('/control?cmd=clear'); await pget('/control?cmd=start'); await sleep(3000); await pget('/control?cmd=stop');
  const b = await grab(names);
  for (const n of names) { const v = b[n]?.buffer ?? []; console.log(`  ${n}: ${v.length} values${v.length ? `, last ${v.at(-1)}` : ''}`); }
  const t = names.find((n) => /time/i.test(n));
  if (t) { const v = b[t].buffer; if (v.length > 1) console.log(`  sample rate about ${Math.round((v.length - 1) / (v.at(-1) - v[0]))} Hz`); }
  process.exit(0);
}
if (!file) { console.error('need --file <sweep>.nc (or --check)'); process.exit(2); }

// lathe link: log every status with a PC timestamp
const link = new LatheLink(`ws://${host}:81/`, { reconnectMs: 60000 });
const log = []; let last = null, t0 = 0;
link.addEventListener('status', (e) => {
  const s = parseStatus(e.detail, last); if (!s) return; last = s;
  log.push([Date.now() - t0, s.state, s.feed, s.rpm, s.sd ? s.sd.pct : '', s.ln ?? '', s.mpos.map((v) => v.toFixed(3)).join(' ')]);
});
const lines = []; let capture = false;
link.addEventListener('line', (e) => { if (capture) lines.push(e.detail); if (/^(error|ALARM)/.test(e.detail)) console.log('lathe:', e.detail); });
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('lathe did not connect')), 8000);
  link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } });
  link.connect();
});
const poll = setInterval(() => link.sendRealtime(0x3f), 100); // ask for status 10x a second
await sleep(800);
if (last?.state !== 'Idle') { console.error(`lathe must be Idle (it is ${last?.state ?? 'unknown'})`); process.exit(1); }

// snapshot every setting and the machine info into the run folder (good data: exactly what the lathe was set to)
capture = true; link.sendLine('$$'); link.sendLine('$I'); await sleep(2500); capture = false;
const settingsSnap = lines.filter((l) => /^\$\d+=/.test(l) && !/^\$7[45]=/.test(l)); // never the WiFi name / password
const infoSnap = lines.filter((l) => /^\[/.test(l) && !/(MAC|IP:|SSID)/i.test(l));
const text = readFileSync(join(here, file), 'utf8');
await uploadFile(host, file, text);
console.log(`uploaded ${file}; starting phone + program`);
await pget('/control?cmd=clear');
t0 = Date.now(); log.length = 0;
const startWall = t0;
await pget('/control?cmd=start');
const tPhoneStart = Date.now() - t0;
await sleep(1500);                                  // a quiet second of baseline before anything moves
link.sendLine(runLine(file));
// A file run reports SD:<pct>,<file> until it ends; during a G4 pause the state reads Idle, so the end is
// "the SD field is gone" (seen 2026-11-11: stopping at the first Idle cut the spindle sweep after 4 s).
let started = false, quiet = 0;
for (;;) {
  await sleep(250);
  const st = last?.state;
  if (last?.sd || st === 'Run') started = true;
  quiet = started && !last?.sd && st === 'Idle' ? quiet + 1 : 0;
  if (quiet >= 8) break; // 2 s of Idle with no file running
  if (/Alarm|Door/.test(st ?? '')) { console.error(`lathe went to ${st}: stopping`); break; }
  if (Date.now() - t0 > 15 * 60000) { console.error('took too long: stopping'); break; }
}
await sleep(1500);
await pget('/control?cmd=stop');
clearInterval(poll);
const data = await grab(names);
link.close();

const dir = join(here, 'runs', `${file.replace('.nc', '')}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'phone.json'), JSON.stringify(data));
writeFileSync(join(dir, 'lathe.csv'), 't_ms,state,feed_mm_min,rpm,sd_pct,line_n,mpos_xyzc\n' + log.map((r) => r.join(',')).join('\n') + '\n');
writeFileSync(join(dir, 'settings.txt'), settingsSnap.join('\n') + '\n');
writeFileSync(join(dir, 'machine-info.txt'), infoSnap.join('\n') + '\n');
writeFileSync(join(dir, file), text);
try { writeFileSync(join(dir, file.replace('.nc', '.schedule.json')), readFileSync(join(here, file.replace('.nc', '.schedule.json')))); } catch { /* no schedule for this one */ }
writeFileSync(join(dir, 'meta.json'), JSON.stringify({ file, phone, title: cfg.title, buffers: names, tPhoneStartMs: tPhoneStart, startedAt: new Date(startWall).toISOString(), statusCount: log.length, endState: last?.state, endMpos: last?.mpos, settingsCount: settingsSnap.length }, null, 1));
console.log(`saved ${dir} (${log.length} lathe status lines, ${names.map((n) => `${n}:${data[n]?.buffer?.length ?? 0}`).join(' ')})`);
process.exit(0);
