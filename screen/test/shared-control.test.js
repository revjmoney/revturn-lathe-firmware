// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-10: "a phone/tablet and a web browser should all be able to control this at the same time ... unless
// a program is running then jog and stuff won't work other than watching it run or stopping it run or changing
// feed/speed". A screen that does not hold the lathe's stream is only locked (VIEW ONLY) while a program runs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (s) => root.querySelector(s);
const click = (s) => $(s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const fire = (s, type) => $(s).dispatchEvent(new Event(type, { bubbles: true }));
const otherScreenOwns = () => {
  link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
  link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  registerJog(app);
  link.setConnected(true);
  otherScreenOwns();
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('shared control', () => {
  it('a second screen can zero, jog and use MDI while the lathe is Idle', () => {
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('CONNECTED');
    expect($('[data-zero="X"]').disabled).toBe(false);
    expect($('[data-jog="X+"]').disabled).toBe(false);
    link.lines.length = 0;
    click('[data-zero="Z"]');
    expect(link.lines).toContain('G10 L20 P0 Z0');
    click('[data-step="0.01"]');
    fire('[data-jog="X+"]', 'pointerdown');
    expect(link.lines.some((l) => l.startsWith('$J='))).toBe(true);
  });

  it('while a program runs it is VIEW ONLY: no zero, no jog, but HOLD, STOP and overrides work', () => {
    link.status('<Run|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('VIEW ONLY');
    expect($('[data-zero="X"]').disabled).toBe(true);
    expect($('[data-jog="X+"]').disabled).toBe(true);
    expect($('[data-hold]').disabled).toBe(false);
    expect($('[data-stop]').disabled).toBe(false);
    expect($('[data-ov="feed-"]').disabled).toBe(false);
    link.lines.length = 0; link.realtime.length = 0;
    click('[data-zero="X"]');
    expect(link.lines.length).toBe(0);
    click('[data-ov="feed-"]');
    click('[data-ov="spin+"]');
    expect(link.realtime).toContain(0x92);
    expect(link.realtime).toContain(0x9a);
    click('[data-hold]');
    expect(link.realtime).toContain(0x21);
  });

  it('GO resumes a held program from any screen, and does nothing else while locked', () => {
    link.status('<Hold:0|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('VIEW ONLY');
    link.realtime.length = 0;
    click('[data-go]');
    expect(link.realtime).toContain(0x7e);
  });

  it('controls come back when the program ends', () => {
    link.status('<Run|MPos:0,0,0,0>');
    expect($('[data-zero="X"]').disabled).toBe(true);
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('CONNECTED');
    expect($('[data-zero="X"]').disabled).toBe(false);
  });

  it('any screen can unlock an alarm', () => {
    link.status('<Alarm|MPos:0,0,0,0>');
    link.lines.length = 0;
    click('[data-unlock]');
    expect(link.lines).toContain('$X');
  });

  it('stays locked until the first status says what the lathe is doing', () => {
    expect($('[data-conn]').textContent).toBe('VIEW ONLY');
    expect($('[data-zero="X"]').disabled).toBe(true);
  });
});
