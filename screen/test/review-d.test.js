// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Code review 2026-11-10, the last screen items: time left when joining a run, bore / drill sketches, EDIT listener leak.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { renderForm } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (s) => root.querySelector(s);
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  link.setConnected(true);
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('time left when this screen joins a run partway through', () => {
  it('uses the progress this screen has seen, not the whole run', () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    link.status('<Run|MPos:0,0,0,0|SD:50.0,/part.nc>');
    vi.setSystemTime(new Date('2026-11-10T12:01:00Z'));
    link.status('<Run|MPos:0,0,0,0|SD:60.0,/part.nc>');
    // 10 % per minute, 40 % to go: about 4 minutes (the old estimate said 0:40)
    expect($('[data-progress]').textContent).toMatch(/~4:00 left/);
  });
});

describe('every cycle form has its sketch', () => {
  it('bore and drill do not show "undefined"', () => {
    for (const c of ['bore', 'drill']) {
      const el = renderForm(c);
      expect(el.textContent).not.toMatch(/undefined/);
      expect(el.querySelector('svg.sketch')).not.toBe(null);
    }
  });
});

describe('EDIT', () => {
  it('opening the editor after several EDIT visits builds it once', () => {
    registerProgram(app);
    app.state.setup = app.state.setup ?? {};
    const prog = { name: 'p', steps: [] };
    // open a program through the app's program state
    app.showMode('PROG');
    root.querySelector('[name="progName"]').value = 'p';
    root.querySelector('[data-prog-new]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 4; i++) { app.showMode('DRO'); app.showMode('EDIT'); }
    let opens = 0;
    const orig = app.popup.open.bind(app.popup);
    app.popup.open = (...a) => { opens++; return orig(...a); };
    $('[data-open-editor]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opens).toBe(1);
    expect(prog).toBeTruthy();
  });
});
