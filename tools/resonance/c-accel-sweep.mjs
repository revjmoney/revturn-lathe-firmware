// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// C (chuck) accel sweep (Rev 2026-11-12): "try different accels for c slowly cranking it up, watch for skips on
// the webcam and mic". For each $123 value: the chuck does 6 hard half-turn reversals at A4 speed (264 deg/s), one
// turn at 22, 44 and 66 rpm, and comes back. Net motion is zero, so if steps are lost the jaws end up somewhere
// else: a camera frame is grabbed before and after every level. One continuous Pi recording (video + mic).
// $123 is ALWAYS put back to the original value at the end.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { LatheLink } from '../../screen/src/link.js';
import { parseStatus } from '../../screen/src/status.js';
import { uploadFile, runLine } from '../../screen/src/files.js';

const LEVELS = (process.argv[2] ?? '240,400,600,900,1300,1800,2500,3500').split(',').map(Number);
// speed mode (Rev 2026-11-12): --accel=3400 holds $123 there and the levels are rpm: 3-turn runs and hard reversals
const ACCEL = Number((process.argv.find((a) => a.startsWith('--accel=')) ?? '').slice(8)) || null;
// --file=prog.nc runs that program once (one level) instead of the workout; --keep leaves $123 at the new value
const RUNFILE = (process.argv.find((a) => a.startsWith('--file=')) ?? '').slice(7);
const KEEP = process.argv.includes('--keep');
const PRE = (process.argv.find((a) => a.startsWith('--pre=')) ?? '').slice(6); // a move to make first, e.g. --pre="G20 G90 G1 Z-1.5 F20" (Rev: carriage to Z-1.5)
const PHONE = (process.argv.find((a) => a.startsWith('--phone=')) ?? '').slice(8).replace(/\/$/, ''); // phyphox REVTURN Mic 4: shake + sound on the slide
const pget = async (path, ms = 8000) => { const r = await fetch(`${PHONE}${path}`, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`phone ${path}: HTTP ${r.status}`); return r.json(); };
const host = 'revturn.local', PI = process.env.REVTURN_CAM ?? 'pi@raspberrypi.local'  /* the camera Pi: user@host */;
const SSH = ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', '-i', process.env.REVTURN_CAM_KEY ?? join(homedir(), '.ssh', 'id_ed25519')];
const FIX = 'hflip,vflip,rotate=-14*PI/180:fillcolor=black,crop=880:495:170:115,scale=1280:720';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ssh = (cmd) => execFileSync('ssh', [...SSH, PI, cmd], { encoding: 'utf8' });

const prog = ['(REVTURN C accel sweep workout)', 'M5', 'G21 G91 G94'];
for (let i = 0; i < 6; i++) prog.push(`N${100 + i} G1 C180 F15840`, `N${100 + i} G1 C-180 F15840`);
prog.push('N200 G1 C360 F7920', 'N201 G1 C360 F15840', 'N202 G1 C360 F23760', 'N203 G1 C-1080 F23760', 'N204 G4 P0.5', 'G90 G20', 'M30', '');
const FILE = 'c_accel.nc';
const speedProg = (rpm) => {
  const F = Math.round(rpm * 360), L = [`(REVTURN C speed test ${rpm} rpm)`, 'M5', 'G21 G91 G94'];
  for (let i = 0; i < 3; i++) L.push(`N${300 + i} G1 C1080 F${F}`, `N${300 + i} G1 C-1080 F${F}`);
  L.push(`N310 G1 C360 F${F}`, 'N311 G4 P0.3', `N312 G1 C-360 F${F}`, 'N313 G4 P0.5', 'G90 G20', 'M30', '');
  return L.join('\n');
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = join(here, 'runs', `c_accel_sweep-${stamp}`); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, FILE), prog.join('\n'));

const link = new LatheLink(`ws://${host}:81/`, { reconnectMs: 60000 });
let last = null; const log = []; let t0 = Date.now(); const lines = [];
link.addEventListener('status', (e) => { const s = parseStatus(e.detail, last); if (!s) return; last = s; log.push([Date.now() - t0, s.state, s.sd ? s.sd.pct : '', s.ln ?? '', s.mpos.map((v) => v.toFixed(3)).join(' ')]); });
link.addEventListener('line', (e) => { lines.push(e.detail); if (/^(error|ALARM)/.test(e.detail)) console.log('lathe:', e.detail); });
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('lathe did not connect')), 8000); link.addEventListener('connection', (e) => { if (e.detail.connected) { clearTimeout(to); res(); } }); link.connect(); });
const poll = setInterval(() => link.sendRealtime(0x3f), 100);
await sleep(800);
if (last?.state !== 'Idle') { console.error(`lathe must be Idle (is ${last?.state})`); process.exit(1); }
lines.length = 0; link.sendLine('$123'); await sleep(800);
const orig = Number((lines.find((l) => /^\$123=/.test(l)) ?? '$123=240').split('=')[1]);
console.log(`C accel now ${orig}; levels ${LEVELS.join(', ')}`);
await uploadFile(host, FILE, prog.join('\n'));

const setAccel = async (v) => { lines.length = 0; link.sendLine(`$123=${v}`); for (let i = 0; i < 30 && !lines.some((l) => /^(ok|error)/.test(l)); i++) await sleep(100); return lines.find((l) => /^(ok|error)/.test(l)); };
const runOnce = async () => {
  link.sendLine(runLine(FILE));
  let started = false, quiet = 0; const ts = Date.now();
  for (;;) { await sleep(200); const st = last?.state; if (last?.sd || st === 'Run') started = true; quiet = started && !last?.sd && st === 'Idle' ? quiet + 1 : 0; if (quiet >= 6) break; if (/Alarm|Door/.test(st ?? '')) return `stopped: ${st}`; if (Date.now() - ts > 1200000) return 'too long'; }
  return `ok in ${((Date.now() - ts) / 1000).toFixed(1)} s`;
};

const tag = `rt_${Date.now()}`, remote = `/tmp/${tag}.mp4`;
// camera settings for every take (Rev 2026-11-12): manual 3.9 ms exposure holds a true 30 fps and freezes the chuck
const CAMSET = (process.argv.find((x) => x.startsWith('--camset=')) ?? '--camset=auto_exposure=1,exposure_time_absolute=39,brightness=133').slice(9);
try { ssh(`v4l2-ctl -d /dev/video0 ${CAMSET.split(',').map((kv) => `-c ${kv}`).join(' ')}`); } catch (e) { console.error('camera settings:', e.message); }
const pid = ssh(`nohup ffmpeg -hide_banner -loglevel error -y -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -thread_queue_size 512 -i /dev/video0 -f alsa -channels 1 -sample_rate 48000 -thread_queue_size 1024 -i hw:3,0 -t 1200 -c:v h264_v4l2m2m -b:v 6M -pix_fmt yuv420p -c:a aac -b:a 160k ${remote} > /tmp/${tag}.log 2>&1 & echo $!`).trim();
const camT0 = Date.now(); t0 = camT0;
let phoneT0 = null;
if (PHONE) { await pget('/control?cmd=clear'); await pget('/control?cmd=start'); phoneT0 = (Date.now() - camT0) / 1000; console.log('phone recording'); }
await sleep(3500);
const marks = [];
try {
  if (PRE) {
    await uploadFile(host, 'c_pre.nc', ['(REVTURN sweep: move first)', PRE, 'M30', ''].join('\n'));
    link.sendLine(runLine('c_pre.nc'));
    let started = false, quiet = 0;
    for (let i = 0; i < 600; i++) { await sleep(200); if (last?.sd || last?.state === 'Run') started = true; quiet = started && !last?.sd && last?.state === 'Idle' ? quiet + 1 : 0; if (quiet >= 5) break; }
    console.log(`moved first: ${PRE} -> MPos ${last?.mpos?.map((v) => v.toFixed(3)).join(' ')}`);
    await uploadFile(host, FILE, prog.join('\n'));
  }
  for (const a of LEVELS) {
    const r = ACCEL ? (marks.length ? 'kept' : await setAccel(ACCEL)) : await setAccel(a);
    if (RUNFILE) await uploadFile(host, FILE, readFileSync(join(here, RUNFILE), 'utf8'));
    else if (ACCEL) await uploadFile(host, FILE, speedProg(a));
    marks.push({ accel: a, set: r, before: (Date.now() - camT0) / 1000 });
    await sleep(1500);                                         // still frame before
    const res = await runOnce();
    await sleep(1500);                                         // still frame after
    marks[marks.length - 1].after = (Date.now() - camT0) / 1000; marks[marks.length - 1].result = res;
    console.log(ACCEL ? `${a} rpm at $123=${ACCEL}: ${r}, workout ${res}` : `$123=${a}: ${r}, workout ${res}`);
    if (!/^ok/.test(res)) break;
  }
} finally {
  if (!KEEP) { const r = await setAccel(orig); console.log(`$123 back to ${orig}: ${r}`); } else console.log(`$123 left at ${ACCEL ?? LEVELS.at(-1)} (--keep)`);
  await sleep(1000);
  try { ssh(`kill -INT ${pid}; for i in $(seq 1 30); do kill -0 ${pid} 2>/dev/null || break; sleep 0.3; done`); } catch { /* */ }
  clearInterval(poll); link.close();
}
if (PHONE) {
  try { await pget('/control?cmd=stop'); const cfg = await pget('/config'); const names = cfg.buffers.map((b) => b.name).filter((n) => n !== 'rec');
    const data = (await pget(`/get?${names.map((n) => `${encodeURIComponent(n)}=full`).join('&')}`, 300000)).buffer;
    writeFileSync(join(dir, 'phone.json'), JSON.stringify(data)); console.log(`phone data saved (${names.join(', ')})`); } catch (e) { console.error('phone:', e.message); }
}
const raw = join(dir, 'camera-raw.mp4'), fixed = join(dir, 'camera.mp4');
execFileSync('scp', ['-q', ...SSH, `${PI}:${remote}`, raw]); ssh(`rm -f ${remote} /tmp/${tag}.log`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', FIX, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', fixed]);
if (RUNFILE) writeFileSync(join(dir, RUNFILE), readFileSync(join(here, RUNFILE), 'utf8'));
for (const m of marks) for (const k of ['before', 'after']) {
  const t = k === 'before' ? m.before + 1.0 : m.after - 0.5;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', fixed, '-frames:v', '1', join(dir, `frame_${m.accel}_${k}.jpg`)]);
}
writeFileSync(join(dir, 'marks.json'), JSON.stringify({ orig, phoneStartS: phoneT0, levels: marks }, null, 1));
writeFileSync(join(dir, 'lathe.csv'), 't_ms,state,sd_pct,line_n,mpos_xyzc\n' + log.map((r) => r.join(',')).join('\n') + '\n');
console.log(`saved ${dir}`);
process.exit(0);
