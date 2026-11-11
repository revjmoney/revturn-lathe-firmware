// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-10: JOG became TOOL (big tool cards). Rev 2026-11-11: "combine tool mode and tool setup mode into
// one screen": TOOL is gone, SET UP's tool rows each have a big T button that makes that tool active.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp, MODES } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { registerSetup } from '../src/ui/setup.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (sel) => root.querySelector(sel);
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  registerJog(app); registerSetup(app);
  link.setConnected(true);
  link.status('<Idle|MPos:0,0,0,0>');
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('tool select inside SET UP', () => {
  it('has no TOOL or JOG soft key any more', () => {
    expect(MODES).not.toContain('TOOL');
    expect(MODES).not.toContain('JOG');
    expect($('[data-mode="TOOL"]')).toBe(null);
    expect($('[data-mode="SET UP"]')).not.toBe(null);
  });

  it('every tool row has a T button, the active one lit', () => {
    click($('[data-mode="SET UP"]'));
    const btns = root.querySelectorAll('[data-pop] .trow [data-tool]');
    expect(btns.length).toBe(8);
    expect(root.querySelector('[data-pop] [data-tool="1"]').classList.contains('on')).toBe(true);
  });

  it('tapping a T makes it the active tool and keeps typed offsets', () => {
    click($('[data-mode="SET UP"]'));
    const dx = root.querySelector('[data-pop] [name="t3dx"]');
    dx.value = '0.1250';
    click(root.querySelector('[data-pop] [data-tool="4"]'));
    expect(app.state.setup.activeTool).toBe(4);
    expect($('[data-tooltag]').textContent).toBe('T4');
    expect(root.querySelector('[data-pop] [data-tool="4"]').classList.contains('on')).toBe(true);
    expect(root.querySelector('[data-pop] [data-tool="1"]').classList.contains('on')).toBe(false);
    expect(root.querySelector('[data-pop] [name="t3dx"]').value).toBe('0.1250'); // nothing re-rendered
  });

  it('the jog pad is still beside the DRO', () => {
    click($('[data-mode="SET UP"]'));
    expect($('[data-jog="X+"]')).not.toBe(null);
  });
});
