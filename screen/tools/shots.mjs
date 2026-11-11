// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Live screenshots of the REVTURN screen for the README, via headless Edge + the Chrome DevTools Protocol.
// Usage: node tools/shots.mjs [host] [outDir]
// Safety: only presses mode keys, PROG select/OPEN, a cycle picker and ONE GO in CYCLES (the first GO only
// previews; a second GO would run). Nothing that moves the machine.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = process.argv[2] ?? 'revturn.local';
const outDir = process.argv[3] ?? 'docs/screenshots';
mkdirSync(outDir, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9333;
const profile = join(tmpdir(), `revturn-shots-${Date.now()}`);
const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) { proc.kill(); throw new Error('Edge did not start'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const click = (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const shot = async (name) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const size = (w, h, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });

await cdp('Page.enable');
await size(1280, 900);
await cdp('Page.navigate', { url: `http://${host}/lathe.html` });
for (let i = 0; i < 40; i++) { await sleep(250); if ((await js(`document.querySelector('[data-conn]')?.textContent`)) !== 'DISCONNECTED') break; }
await sleep(1500);
console.log('connection:', await js(`document.querySelector('[data-conn]').textContent`));

const only = process.argv[4];
if (only) {
  await click('[data-mode="CYCLES"]'); await sleep(600);
  await click(`[data-cycle="${only}"]`); await sleep(400);
  await click('.right [data-go]'); await sleep(2500);
  await shot(`revturn-cycles-${only}.png`);
  ws.close(); proc.kill(); process.exit(0);
}
await shot('revturn-dro.png');
await click('[data-mode="JOG"]'); await sleep(600); await shot('revturn-jog.png');
await click('[data-mode="CYCLES"]'); await sleep(600);
await click('[data-cycle="thread"]'); await sleep(400);
await click('.right [data-go]'); await sleep(1200); // first GO = preview only
await shot('revturn-cycles-thread.png');
await click('[data-mode="PROG"]'); await sleep(2000);
await click('[data-prog-item="smoke_test"]'); await sleep(200);
await click('[data-prog-open]'); await sleep(1500);
await click('[data-mode="RUN"]'); await sleep(1500); await shot('revturn-run-backplot.png');
await click('[data-mode="SET UP"]'); await sleep(800); await shot('revturn-setup.png');
await click('[data-mode="DRO"]');
await size(390, 844, true); await sleep(1200); await shot('revturn-phone.png');

ws.close();
proc.kill();
process.exit(0);
