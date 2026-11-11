// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-11: REVTURN by JMSCNC branding, the monkey, and an ABOUT window with credits and copyright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startApp } from '../src/app.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (sel) => root.querySelector(sel);
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, json: async () => ({ files: [] }), text: async () => '{}' }) });
});
afterEach(() => app.stop());

describe('branding', () => {
  it('the top bar says REVTURN by JMSCNC with the monkey', () => {
    const b = $('.top .brand');
    expect(b.textContent).toContain('REVTURN');
    expect(b.textContent).toContain('by JMSCNC');
    expect(b.querySelector('img')).not.toBe(null);
  });

  it('ABOUT opens a window with the monkey, JMSCNC copyright and the grblHAL / ESP3D-WebUI credits, and toggles', () => {
    click($('[data-open-about]'));
    expect(app.popup.kind).toBe('about');
    const t = $('[data-pop]').textContent;
    expect(t).toContain('© 2026 JMSCNC');
    expect(t).toContain('jmscnc.com');
    expect(t).toContain('grblHAL');
    expect(t).toContain('GNU GPL v3');
    expect(t).toContain('ESP3D-WebUI');
    expect($('[data-pop] a.coffee').getAttribute('href')).toBe('https://buymeacoffee.com/revjmoney'); // Rev: plaster it in ABOUT
    expect($('[data-pop] img.aboutimg')).not.toBe(null);
    click($('[data-open-about]'));
    expect(app.popup.kind).toBe(null);
  });
});
