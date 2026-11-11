// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp } from '../src/app.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (sel) => root.querySelector(sel);
const click = (sel) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, json: async () => ({ files: [] }) }) });
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('connection', () => {
  it('shows DISCONNECTED and disables motion keys until connected', () => {
    expect($('[data-conn]').textContent).toBe('DISCONNECTED');
    expect($('[data-go]').disabled).toBe(true);
    expect($('[data-zero="X"]').disabled).toBe(true);
    link.setConnected(true);
    expect($('[data-conn]').textContent).toBe('CONNECTED');
    expect($('[data-go]').disabled).toBe(false);
  });

  it('puts the lathe in diameter mode and asks for the rpm limit on connect', () => {
    link.setConnected(true);
    expect(link.lines.slice(0, 2)).toEqual(['G7 G20', '$30']);
    link.line('$30=40.000');
    expect(app.state.maxRpm).toBe(40);
  });

  it('reads diameter mode from the $G modal line on connect', () => {
    link.setConnected(true);
    expect(link.lines.slice(0, 3)).toEqual(['G7 G20', '$30', '$G']);
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-dro="xt"]').textContent).toBe('RAD');
    link.line('[GC:G0 G54 G7 G17 G21 G90 G94 G97 G40 G49 G98 G50 M5 M9 T0 F0 S0.]');
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-dro="xt"]').textContent).toBe('DIA');
  });

  it('polls status every 200 ms while connected', () => {
    link.setConnected(true);
    vi.advanceTimersByTime(600);
    expect(link.realtime.filter((b) => b === 0x3f).length).toBe(3);
  });
});

describe('DRO', () => {
  it('shows X, Z and the spindle line from status reports', () => {
    link.setConnected(true);
    link.status('<Idle|MPos:25.4,0,-12.7,487.5|WCO:0,0,0,0|D:1>');
    expect($('[data-dro="x"]').textContent).toBe('1.0000');
    expect($('[data-dro="z"]').textContent).toBe('-0.5000');
    expect($('[data-dro="sl"]').textContent).toBe('C');
    expect($('[data-dro="sv"]').textContent).toBe('127.50°');
    link.status('<Run|MPos:0,0,0,0|FS:0,40|A:S|D:1>');
    expect($('[data-dro="sl"]').textContent).toBe('S');
    expect($('[data-dro="sv"]').textContent).toBe('40 RPM');
  });

  it('never shows a Y axis', () => {
    expect(root.textContent).not.toMatch(/\bY\b/);
  });
});

describe('HOLD, GO and STOP', () => {
  beforeEach(() => link.setConnected(true));

  it('HOLD sends feed hold', () => {
    click('[data-hold]');
    expect(link.realtime).toContain(0x21);
  });

  it('GO while holding resumes', () => {
    link.status('<Hold:0|MPos:0,0,0,0>');
    click('[data-go]');
    expect(link.realtime).toContain(0x7e);
  });

  it('STOP sends soft reset and tells the user to unlock', () => {
    click('[data-stop]');
    expect(link.realtime).toContain(0x18);
    expect($('[data-msg]').textContent).toBe('Reset sent: press RESET / UNLOCK if alarmed, check zeros');
  });

  it('HOLD and STOP are on screen in every mode', () => {
    for (const mode of ['DRO', 'PROG', 'EDIT', 'SET UP', 'RUN', 'CYCLES']) {
      app.showMode(mode);
      expect($('[data-hold]')).not.toBe(null);
      expect($('[data-stop]')).not.toBe(null);
      expect($('[data-mode-title]').textContent).toBe(mode);
    }
  });
});

describe('zero and keypad', () => {
  beforeEach(() => link.setConnected(true));

  it('ZERO buttons send G10 L20', () => {
    click('[data-zero="Z"]');
    click('[data-zero="ALL"]');
    expect(link.lines).toContain('G10 L20 P0 Z0');
    expect(link.lines).toContain('G10 L20 P0 X0 Z0 C0');
  });

  it('typed X 1.25 ABS SET sends the set line', () => {
    link.status('<Idle|MPos:0,0,0,0>'); // set only when Idle (review 2026-11-10)
    for (const k of ['X', '1', '.', '2', '5', 'ABS SET']) click(`[data-key="${k}"]`);
    expect(link.lines).toContain('G7 G20 G10 L20 P0 X1.25');
  });
});

describe('MDI', () => {
  beforeEach(() => link.setConnected(true));

  it('sends the typed line and logs it with replies', () => {
    $('[data-mdi-input]').value = 'G0 X1';
    click('[data-mdi-send]');
    expect(link.lines).toContain('G0 X1');
    link.line('error:20');
    const log = $('[data-mdi-log]').textContent;
    expect(log).toContain('> G0 X1');
    expect(log).toContain('error:20 Unsupported command');
  });

  it('Up arrow recalls the previous command', () => {
    $('[data-mdi-input]').value = 'M3 S20';
    click('[data-mdi-send]');
    $('[data-mdi-input]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect($('[data-mdi-input]').value).toBe('M3 S20');
  });
});

describe('review fixes', () => {
  it('re-sends G7 G20 and $G once Idle after grblHAL restarts', () => {
    link.setConnected(true);
    link.lines.length = 0;
    link.line("GrblHAL 1.1f ['$' or '$HELP' for help]");
    link.status('<Idle|MPos:0,0,0,0>'); // sent at the first Idle status (grblHAL refuses g-code while in Alarm)
    expect(link.lines).toEqual(['G7 G20', '$G']);
  });

  it('STOP and HOLD say so when nothing could be sent', () => {
    click('[data-stop]');
    expect($('[data-msg]').textContent).toBe('Not connected: nothing sent');
    click('[data-hold]');
    expect($('[data-msg]').textContent).toBe('Not connected: nothing sent');
  });

  it('the top bar shows the real DIA/RAD mode', () => {
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0|D:0>');
    expect($('[data-units]').textContent).toBe('IN · RAD · G18');
    link.status('<Idle|MPos:0,0,0,0|D:1>');
    expect($('[data-units]').textContent).toBe('IN · DIA · G18');
  });

  // Rev 2026-11-10: the screen dropped every 3.6 s when another client held control but never polled
  // (a stock WebUI tab). A VIEW ONLY screen must ask for status itself once the broadcasts stop.
  it('a VIEW ONLY screen polls status itself when no broadcast arrives', () => {
    link.reconnectNow = vi.fn();
    link.setConnected(true);
    link.dispatchEvent(new CustomEvent('session', { detail: { currentID: '1' } }));
    link.dispatchEvent(new CustomEvent('session', { detail: { activeID: '2' } }));
    link.status('<Run|MPos:0,0,0,0>');
    link.realtime.length = 0;
    vi.advanceTimersByTime(200);
    expect(link.realtime.filter((b) => b === 0x3f).length).toBe(0); // fresh broadcast: stay quiet
    vi.advanceTimersByTime(600);
    expect(link.realtime.filter((b) => b === 0x3f).length).toBeGreaterThan(0);
    link.status('<Run|MPos:0,0,0,0>'); // the owner (or our own ask) answered
    vi.advanceTimersByTime(1200);
    link.status('<Run|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('VIEW ONLY');
    expect(link.reconnectNow).not.toHaveBeenCalled();
  });

  // Review 2026-11-10 (A3): a reset during motion lands in Alarm, where grblHAL refuses G7 G20. The lathe then
  // stayed in G8 radius (X moves 2x off) after RESET / UNLOCK. The modes must go back once it is Idle again.
  it('puts G7 G20 back after an alarm is unlocked', () => {
    link.setConnected(true);
    link.status('<Run|MPos:0,0,0,0>');
    link.line("GrblHAL 1.1f ['$' or '$HELP' for help]");
    link.status('<Alarm|MPos:0,0,0,0>');
    link.lines.length = 0;
    click('[data-unlock]');
    expect(link.lines).toEqual(['$X']);
    link.status('<Idle|MPos:0,0,0,0>');
    expect(link.lines).toContain('G7 G20');
    expect(link.lines).toContain('$G');
    link.lines.length = 0;
    link.status('<Idle|MPos:0,0,0,0>');
    expect(link.lines).not.toContain('G7 G20'); // once, not on every status
  });

  it('marks a silent connection dead after 1.5 s without status and reconnects', () => {
    link.reconnectNow = vi.fn();
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0>');
    vi.advanceTimersByTime(1000);
    expect($('[data-conn]').textContent).toBe('CONNECTED');
    vi.advanceTimersByTime(1000);
    expect($('[data-conn]').textContent).toBe('NO DATA');
    expect($('[data-go]').disabled).toBe(true);
    expect(link.reconnectNow).toHaveBeenCalled();
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-conn]').textContent).toBe('CONNECTED');
  });
});

describe('releasing the lathe connection (grblHAL serves one screen at a time)', () => {
  const setVisibility = (v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => setVisibility('visible'));

  it('closes the link when the page is hidden and reconnects when it is shown again', () => {
    link.close = vi.fn();
    link.connect = vi.fn();
    setVisibility('hidden');
    expect(link.close).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(link.connect).toHaveBeenCalledTimes(1);
  });

  it('closes the link when the page is being unloaded', () => {
    link.close = vi.fn();
    window.dispatchEvent(new Event('pagehide'));
    expect(link.close).toHaveBeenCalledTimes(1);
  });
});
