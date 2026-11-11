// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-11: keyboard jog. Left = Z- (toward the chuck), Right = Z+, Up = X+ (away from the user), Down = X-,
// Page Up / Page Down = C+ / C-. Follows the jog pad's step or CONT mode.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (sel) => root.querySelector(sel);
const key = (type, k, extra = {}) => {
  const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...extra });
  (extra.target ?? document).dispatchEvent(e);
  return e;
};
const press = (k, extra) => { const e = key('keydown', k, extra); key('keyup', k, extra); return e; };
const jogs = () => link.lines.filter((l) => l.startsWith('$J='));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  registerJog(app);
  link.setConnected(true);
  link.status('<Idle|MPos:0,0,0,0>');
  link.lines.length = 0;
  link.realtime.length = 0;
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('keyboard jog', () => {
  it('maps the arrows and page keys to the jog buttons (step mode)', () => {
    $('[data-step="0.01"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) press(k);
    const j = jogs();
    expect(j[0]).toMatch(/^\$J=G91 G20 Z-0\.01 /); // left: toward the chuck
    expect(j[1]).toMatch(/^\$J=G91 G20 Z0\.01 /);
    expect(j[2]).toMatch(/^\$J=G91 G20 X0\.01 /); // up: away from the user
    expect(j[3]).toMatch(/^\$J=G91 G20 X-0\.01 /);
    expect(j[4]).toMatch(/^\$J=G91 C5 /); // 0.01 step = 5 degrees on C
    expect(j[5]).toMatch(/^\$J=G91 C-5 /);
  });

  it('step mode jogs once per press: key repeat is ignored, and the page does not scroll', () => {
    const e = key('keydown', 'ArrowUp');
    key('keydown', 'ArrowUp', { repeat: true });
    key('keydown', 'ArrowUp', { repeat: true });
    key('keyup', 'ArrowUp');
    expect(jogs().length).toBe(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('CONT jogs while the key is held and cancels on release', () => {
    $('[data-step="cont"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    key('keydown', 'ArrowLeft');
    link.status('<Jog|MPos:0,0,0,0>');
    vi.advanceTimersByTime(1000);
    expect(jogs().length).toBeGreaterThan(1);
    expect(jogs().every((l) => l.includes(' Z-'))).toBe(true);
    key('keyup', 'ArrowLeft');
    expect(link.realtime).toContain(0x85);
    const n = jogs().length;
    vi.advanceTimersByTime(1000);
    expect(jogs().length).toBe(n);
  });

  it('typing in a box (MDI, forms) does not jog', () => {
    const box = $('.mdi input, .mdi textarea') ?? document.body.appendChild(document.createElement('input'));
    press('ArrowLeft', { target: box });
    expect(jogs()).toEqual([]);
  });

  it('does nothing when the jog buttons are disabled (no link)', () => {
    link.setConnected(false);
    press('ArrowRight');
    expect(jogs()).toEqual([]);
  });
});
