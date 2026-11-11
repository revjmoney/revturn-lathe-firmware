// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Entry point: connect to the lathe this page was served from (or ?host=… when testing elsewhere).
import { LatheLink } from './link.js';
import { startApp } from './app.js';
import { registerJog } from './ui/jog.js';
import { registerCycles } from './ui/cycles.js';
import { registerProgram } from './ui/program.js';
import { registerSetup } from './ui/setup.js';
import { registerSettings } from './ui/settings.js';
import { WEBUI_URL } from './app.js';

const params = new URLSearchParams(location.search);
const host = params.get('host') ?? location.hostname;
const link = new LatheLink(`ws://${host}:81/`);
const app = startApp(document.getElementById('app'), link, { host });
registerJog(app);
registerCycles(app);
registerProgram(app);
registerSetup(app);
registerSettings(app, { webuiUrl: WEBUI_URL });
window.revturn = app;
link.connect();
