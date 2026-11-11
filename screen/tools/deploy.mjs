// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Upload dist/lathe.html.gz to the lathe's flash root over FTP, then check it is served.
// Usage: node tools/deploy.mjs [host]   (default revturn.local)
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const host = process.argv[2] ?? 'revturn.local';
const file = fileURLToPath(new URL('../dist/lathe.html.gz', import.meta.url));

const ftp = execFileSync('curl', ['-s', '-m', '60', '-T', file, `ftp://${host}/`, '-w', '%{response_code}'], { encoding: 'utf8' });
console.log(`FTP upload: ${ftp.trim()}`);
if (!ftp.includes('226')) process.exit(1);

const res = await fetch(`http://${host}/lathe.html`);
console.log(`GET /lathe.html: ${res.status} ${res.headers.get('content-encoding') ?? ''}`);
const body = await res.text();
console.log(body.includes('REVTURN') ? 'Page OK (REVTURN found)' : 'Page served but REVTURN not found');
process.exit(res.ok && body.includes('REVTURN') ? 0 : 1);
