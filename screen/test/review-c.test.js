// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Code review 2026-11-10: B7, B8 and the screen robustness items (section C).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LatheLink } from '../src/link.js';
import { parseStatus } from '../src/status.js';
import { feed } from '../src/cycles/common.js';
import * as groove from '../src/cycles/groove.js';
import * as face from '../src/cycles/face.js';
import { checkProgram } from '../src/program.js';
import { startApp } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { FakeLink } from './helpers/fake-link.js';

class FakeSocket {
  static all = [];
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.all.push(this); }
  send(d) { if (this.readyState !== 1) throw new Error('InvalidStateError'); this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen?.({}); }
}

describe('link: one socket at a time, never throws', () => {
  beforeEach(() => { FakeSocket.all = []; });
  it('connect() while a socket exists closes the old one first', () => {
    const link = new LatheLink('ws://x/', { WebSocketImpl: FakeSocket });
    link.connect(); FakeSocket.all[0].open();
    link.connect();
    expect(FakeSocket.all.length).toBe(2);
    expect(FakeSocket.all[0].readyState).toBe(3);
  });
  it('sending while the new socket is still connecting returns false instead of throwing', () => {
    const link = new LatheLink('ws://x/', { WebSocketImpl: FakeSocket });
    link.connect(); FakeSocket.all[0].open();
    link.connect(); // new one still CONNECTING
    expect(() => link.sendRealtime(0x18)).not.toThrow();
    expect(link.sendRealtime(0x18)).toBe(false);
  });
});

describe('status: a garbled report is ignored, never NaN', () => {
  it('returns null for non-numeric positions', () => {
    expect(parseStatus('<Idle|MPos:1.0,x,0,0>', null)).toBe(null);
    expect(parseStatus('<Idle|MPos:0,0,0,0|WCO:0,,abc,0>', null)).toBe(null);
  });
  it('still parses good reports', () => {
    expect(parseStatus('<Idle|MPos:1,0,2,3>', null).wpos).toEqual([1, 0, 2, 3]);
  });
});

describe('numbers in g-code never use exponents', () => {
  it('feed() prints plain decimals', () => {
    expect(feed(0.00001)).not.toMatch(/e/i);
    expect(feed(2)).toBe('2');
    expect(feed(1.5)).toBe('1.5');
  });
  it('a value too small to print is refused by the form check', () => {
    const r = face.generate({ startDia: 1, endDia: 0, zStart: 0, depth: 0.02, step: 0.01, feed: 0.00000001, rpm: 30 }, { maxRpm: 200, c0: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('groove: too many moves is refused, not a frozen page', () => {
  it('a tiny peck fails fast', () => {
    const t0 = Date.now();
    const r = groove.generate({ dia: 1, z: 0, width: 0.2, depth: 0.1, peck: 0.0000001, feed: 1, toolWidth: 0.1, rpm: 30 }, { maxRpm: 200, c0: 0 });
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('a tiny tool width fails fast', () => {
    const r = groove.generate({ dia: 1, z: 0, width: 0.5, depth: 0.1, peck: 0.02, feed: 1, toolWidth: 0.0000001, rpm: 30 }, { maxRpm: 200, c0: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('opened program files are checked', () => {
  it('a name with a newline cannot inject a g-code line', () => {
    const r = checkProgram({ name: 'x\nM3 S275', steps: [] }, 'x');
    expect(r.ok).toBe(true);
    expect(r.program.name).not.toMatch(/\n/);
    expect(r.program.name).toMatch(/^[a-z0-9_-]+$/);
  });
  it('missing steps or a step without a cycle is refused', () => {
    expect(checkProgram({ name: 'a' }, 'a').ok).toBe(false);
    expect(checkProgram({ name: 'a', steps: [{ params: {} }] }, 'a').ok).toBe(false);
    expect(checkProgram('nope', 'a').ok).toBe(false);
  });
});

describe('screen', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  const click = (s) => $(s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const fire = (s, t) => $(s).dispatchEvent(new Event(t, { bubbles: true }));
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
  });
  afterEach(() => { app.stop(); vi.useRealTimers(); });

  it('ABS SET is refused unless Idle', () => {
    link.status('<Run|MPos:0,0,0,0>');
    for (const k of ['Z', '1', 'ABS SET']) click(`[data-key="${k}"]`);
    expect(link.lines.some((l) => l.includes('G10'))).toBe(false);
    expect($('[data-msg]').textContent).toMatch(/Idle/);
  });

  it('a long CONT jog never queues more than about two segments ahead of the machine', () => {
    click('[data-step="cont"]');
    fire('[data-jog="Z-"]', 'pointerdown');
    for (let t = 0; t < 10000; t += 100) { vi.advanceTimersByTime(100); link.status('<Jog|MPos:0,0,0,0>'); }
    const sent = link.lines.filter((l) => l.startsWith('$J=')).reduce((a, l) => a + Math.abs(Number(/Z(-?[0-9.]+)/.exec(l)[1])), 0);
    const machine = (10 / 60) * 10; // 10 ipm for 10 s
    expect(sent).toBeLessThan(machine + 3 * (10 / 60) * 0.15);
    fire('[data-jog="Z-"]', 'pointerup');
  });
});
