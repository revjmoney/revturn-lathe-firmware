// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// Film a lathe run (Rev 2026-11-11: "do recordings of everything from now on"): starts a Raspberry Pi's USB webcam
// (720p30 H.264 + mic), runs the program with play.mjs, stops the camera, copies the video next to the run's log
// and makes a fixed copy (camera is mounted upside down and tilted: flip, straighten 14 deg, crop, 1280x720).
// Usage: node cam-play.mjs --file song.nc [--lathe revturn.local] [--fix "<ffmpeg filter>"]
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const file = arg('--file'), lathe = arg('--lathe', 'revturn.local');
const FIX = arg('--fix', 'hflip,vflip,rotate=-14*PI/180:fillcolor=black,crop=880:495:170:115,scale=1280:720');
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PI = process.env.REVTURN_CAM ?? 'pi@raspberrypi.local'  /* the camera Pi: user@host */;
const SSH = ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', '-i', process.env.REVTURN_CAM_KEY ?? join(homedir(), '.ssh', 'id_ed25519')];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ssh = (cmd) => execFileSync('ssh', [...SSH, PI, cmd], { encoding: 'utf8' });
if (!file) { console.error('need --file <program>.nc'); process.exit(2); }

const tag = `rt_${Date.now()}`;
const remote = `/tmp/${tag}.mp4`;
// up to 20 minutes; stopped with SIGINT when the run ends (ffmpeg then closes the file cleanly)
const pid = ssh(`nohup ffmpeg -hide_banner -loglevel error -y -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -thread_queue_size 512 -i /dev/video0 -f alsa -channels 1 -sample_rate 48000 -thread_queue_size 1024 -i hw:3,0 -t 1200 -c:v h264_v4l2m2m -b:v 6M -pix_fmt yuv420p -c:a aac -b:a 160k ${remote} > /tmp/${tag}.log 2>&1 & echo $!`).trim();
const camStart = Date.now();
console.log(`camera recording on the Pi (pid ${pid}); letting it settle`);
await sleep(3000);

const before = new Set(readdirSync(join(here, 'runs')));
const code = await new Promise((res) => {
  const p = spawn(process.execPath, [join(here, 'play.mjs'), '--file', file, '--lathe', lathe], { stdio: 'inherit' });
  p.on('exit', res);
});
await sleep(2000);
try { ssh(`kill -INT ${pid}; for i in $(seq 1 30); do kill -0 ${pid} 2>/dev/null || break; sleep 0.3; done; ls -la ${remote}`); } catch (e) { console.error('camera stop:', e.message); }

const runDir = readdirSync(join(here, 'runs')).filter((d) => !before.has(d) && d.startsWith(file.replace('.nc', '')))
  .map((d) => join(here, 'runs', d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? join(here, 'runs');
const raw = join(runDir, 'camera-raw.mp4'), fixed = join(runDir, 'camera.mp4');
execFileSync('scp', ['-q', ...SSH, `${PI}:${remote}`, raw]);
ssh(`rm -f ${remote} /tmp/${tag}.log`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', FIX, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', fixed]);
writeFileSync(join(runDir, 'camera.json'), JSON.stringify({ camStartedAt: new Date(camStart).toISOString(), note: 'camera started about 3 s before the program was sent; see meta.json startedAt', fix: FIX }, null, 1));
console.log(`video: ${fixed}`);
process.exit(code ?? 0);
