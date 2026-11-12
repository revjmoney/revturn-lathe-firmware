// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Pull the original grblHAL and ESP3D logos out of the stock WebUI build (they are compiled as h("svg", ...) calls)
// and write them as SVG files, for the POWERED BY box in the REVTURN theme. Logos (c) their owners, GPL v3 builds.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const s = gunzipSync(readFileSync(new URL('./webui/index.html.gz', import.meta.url))).toString('utf8');
const grab = (marker) => {                         // the (0,o.h)("svg",...) expression that contains the marker
  const at = s.indexOf(marker), start = s.lastIndexOf('(0,o.h)("svg"', at);
  let i = start + '(0,o.h)'.length, depth = 0;
  for (; i < s.length; i++) { const ch = s[i]; if (ch === '(') depth++; else if (ch === ')') { depth--; if (!depth) break; } else if (ch === '"') { i = s.indexOf('"', i + 1); } }
  return s.slice(start, i + 1);
};
const attr = (o) => Object.entries(o ?? {}).map(([k, v]) => ` ${k === 'class' ? 'class' : k}="${String(v)}"`).join('');
const h = (tag, a, ...kids) => `<${tag}${attr(a)}${tag === 'svg' ? ' xmlns="http://www.w3.org/2000/svg"' : ''}>${kids.flat().filter((k) => k != null).join('')}</${tag}>`;
const render = (expr, height, color, bg) => new Function('o', 'e', 't', 'n', `return ${expr};`)({ h }, height, color, bg);
writeFileSync(new URL('./logo-grblhal.svg', import.meta.url), render(grab('115.98 86.857'), 40, '#e8e8e8', 'none'));
writeFileSync(new URL('./logo-esp3d.svg', import.meta.url), render(grab('esp3dlogo'), 40, '#e8e8e8', '#05080a'));
console.log('wrote logo-grblhal.svg and logo-esp3d.svg');
