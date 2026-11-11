// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Live check of the lathe file API: upload probe.nc, list, read back, delete. No motion.
import { uploadFile, listFiles, readFile, deleteFile } from '../src/files.js';
const host = process.argv[2] ?? 'revturn.local';
await uploadFile(host, 'probe.nc', 'G4 P0.1\nM2\n');
console.log('after upload:', await listFiles(host));
console.log('read back:', JSON.stringify(await readFile(host, 'probe.nc')));
await deleteFile(host, 'probe.nc');
console.log('after delete:', await listFiles(host));
