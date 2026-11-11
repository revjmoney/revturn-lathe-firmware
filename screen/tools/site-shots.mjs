// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Screenshots of every REVTURN screen for the website, via headless Edge + the Chrome DevTools Protocol.
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
// Usage: node tools/site-shots.mjs [host] [outDir]
// Safety: only presses mode keys, PROG select / OPEN, group buttons, ABOUT / BACKPLOT, a cycle picker and ONE GO in
// CYCLES (the first GO only previews; a second GO would run). Nothing that moves the machine or saves a setting.
// Privacy: the MDI console is emptied before every shot ($$ output has the WiFi name), and the WiFi group and
// MACHINE INFO (IP, MAC) are never captured.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = process.argv[2] ?? 'revturn.local';
const outDir = process.argv[3] ?? 'F:/micro-lathe/firmware/revturn-lathe-firmware/site/media';
mkdirSync(outDir, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9334;
const profile = join(tmpdir(), `revturn-site-shots-${Date.now()}`);
const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
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
const clickText = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const clean = () => js(`(() => { const l = document.querySelector('[data-mdi-log]'); if (l) l.innerHTML = ''; return true; })()`);
const shot = async (name) => {
  await clean(); await sleep(150);
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
const size = (w, h, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });

await cdp('Page.enable');
await size(1280, 800);
await cdp('Page.navigate', { url: `http://${host}/` });
for (let i = 0; i < 40; i++) { await sleep(250); if ((await js(`document.querySelector('[data-conn]')?.textContent`)) === 'CONNECTED') break; }
await sleep(2000);
console.log('connection:', await js(`document.querySelector('[data-conn]').textContent`));

await shot('screen-dro.png');
await click('[data-open-backplot]'); await sleep(800); await shot('screen-backplot.png');
await click('[data-open-backplot]'); await sleep(300);
await click('[data-open-about]'); await sleep(600); await shot('screen-about.png');
await click('[data-open-about]'); await sleep(300);

await click('[data-mode="SET UP"]'); await sleep(900); await shot('screen-setup.png');

await click('[data-mode="CYCLES"]'); await sleep(700);
for (const c of ['face', 'turn', 'thread']) {
  await click(`[data-cycle="${c}"]`); await sleep(400);
  await click('.right [data-go]'); await sleep(1500); // first GO = preview only
  await shot(`screen-cycles-${c}.png`);
}

await click('[data-mode="PROG"]'); await sleep(2000);
await shot('screen-prog.png');
await click('[data-prog-item="smoke_test_4"]'); await sleep(200);
await click('[data-prog-open]'); await sleep(1500);
await shot('screen-edit.png');
await clickText('[data-pstep]', '1.'); await sleep(600);
await shot('screen-edit-step.png');
await click('[data-mode="RUN"]'); await sleep(2000); await shot('screen-run.png');

await click('[data-mode="SETTINGS"]'); await sleep(3500);
for (const [g, f] of [['General', 'settings-general'], ['X-axis', 'settings-x-axis'], ['Spindle', 'settings-spindle'], ['Jogging', 'settings-jogging']]) {
  await clickText('[data-set-group]', g); await sleep(700);
  await shot(`screen-${f}.png`);
}
await js(`(() => { const s = document.querySelector('[data-set-search]'); s.value = 'maximum rate'; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(600);
await shot('screen-settings-search.png');

await click('[data-mode="DRO"]'); await sleep(600);
await size(390, 844, true); await sleep(1500); await shot('screen-phone.png');

ws.close();
proc.kill();
process.exit(0);
