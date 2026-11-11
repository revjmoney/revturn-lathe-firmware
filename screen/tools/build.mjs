// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
// Bundle src/ into one self-contained page: dist/lathe.html and dist/lathe.html.gz (what the lathe serves).
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const src = (p) => new URL(`src/${p}`, root);
const dist = (p) => new URL(`dist/${p}`, root);

const js = await build({
  entryPoints: [src('main.js').pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false,
  loader: { '.png': 'dataurl' }, // REVTURN brand art is inlined (one self-contained page)
  define: { __REVTURN_VERSION__: JSON.stringify(pkg.version), __REVTURN_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(src('style.css'), 'utf8');
let html = await readFile(src('index.html'), 'utf8');
const favicon = (await readFile(src('brand/favicon-64.png'))).toString('base64');
html = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="main.js"></script>', () => `<script>${script}</script>`)
  .replace('href="brand/favicon-64.png"', () => `href="data:image/png;base64,${favicon}"`);
if (html.includes('src="main.js"') || html.includes('href="style.css"')) throw new Error('inlining failed');

await mkdir(dist(''), { recursive: true });
await writeFile(dist('lathe.html'), html);
const gz = gzipSync(html, { level: 9 });
await writeFile(dist('lathe.html.gz'), gz);
console.log(`dist/lathe.html ${html.length} B, dist/lathe.html.gz ${gz.length} B`);

// The screen is also built into the grblHAL firmware (served from /embedded when flash has no copy).
// Refresh that copy so the next firmware build carries this version.
const fwCopy = 'F:/micro-lathe/firmware/ESP32/main/embedded/lathe.html.gz';
try {
  await writeFile(fwCopy, gz);
  console.log(`firmware copy updated: ${fwCopy} (rebuild + flash the firmware to ship it)`);
} catch {
  console.log('firmware tree not found, skipped the embedded copy');
}
