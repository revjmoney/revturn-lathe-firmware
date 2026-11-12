// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Build theme-revturn (plain CSS) for the stock ESP3D-WebUI: theme-revturn.src.css with the REVTURN header logo inlined.
// Usage: node make-theme.mjs [logo png = ../screen/src/brand/header-64.png]
import { readFileSync, writeFileSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
const logo = readFileSync(process.argv[2] ?? here('../screen/src/brand/header-64.png'));
const css = readFileSync(here('./theme-revturn.src.css'), 'utf8').replaceAll('@@LOGO@@', `data:image/png;base64,${logo.toString('base64')}`)
  .replaceAll('@@GRBL@@', `data:image/svg+xml;base64,${readFileSync(here('./logo-grblhal.svg')).toString('base64')}`)
  .replaceAll('@@ESP@@', `data:image/svg+xml;base64,${readFileSync(here('./logo-esp3d.svg')).toString('base64')}`);
if (/@@[A-Z]+@@/.test(css)) throw new Error('logo placeholder left in the CSS');
// the lathe serves a .gz file as a raw download (application/gzip, no Content-Encoding), so the WebUI would
// inject compressed bytes as CSS: ship it as plain text named theme-revturn (the WebUI accepts theme-<name>)
writeFileSync(here('./webui/theme-revturn'), css);
console.log(`webui/theme-revturn: ${css.length} bytes of CSS`);
