// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Manual spindle: ON/OFF button + speed slider on every screen, default 30 rpm (Rev 2026-11-09).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp, MODES } from '../src/app.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (s) => root.querySelector(s);
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const slide = (v) => { const r = $('[data-spin-rpm]'); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  link.setConnected(true);
  link.line('$30=150.000');
  link.status('<Idle|MPos:0,0,0,0>');
  link.lines.length = 0;
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('spindle control', () => {
  it('is on every screen, defaults to 30 rpm, max follows $30', () => {
    for (const m of MODES) {
      click($(`[data-mode="${m}"]`));
      expect(root.querySelectorAll('[data-spin-toggle]').length).toBe(1);
    }
    expect($('[data-spin-rpm]').value).toBe('30');
    expect($('[data-spin-rpm]').max).toBe('150');
    expect($('[data-spin-show]').textContent).toBe('30 RPM');
  });

  it('ON sends M3 at the slider speed', () => {
    click($('[data-spin-toggle]'));
    expect(link.lines).toEqual(['M3 S30']);
  });

  it('moving the slider while it turns changes the speed, keeping direction', () => {
    link.status('<Idle|MPos:0,0,0,0|A:C>');
    slide(60);
    expect($('[data-spin-show]').textContent).toBe('60 RPM');
    expect(link.lines).toEqual(['M4 S60']);
  });

  it('moving the slider while stopped only sets the speed for the next ON', () => {
    slide(45);
    expect(link.lines).toEqual([]);
    click($('[data-spin-toggle]'));
    expect(link.lines).toEqual(['M3 S45']);
  });

  it('ON stays labelled ON and lights up while turning; STOP sends M5', () => {
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    expect($('[data-spin-toggle]').textContent).toBe('SPINDLE ON');
    expect($('[data-spin-toggle]').classList.contains('on')).toBe(true);
    click($('[data-spin-stop]'));
    expect(link.lines).toEqual(['M5']);
  });

  it('works while jogging but not while a program runs', () => {
    link.status('<Jog|MPos:0,0,0,0>');
    click($('[data-spin-toggle]'));
    expect(link.lines).toEqual(['M3 S30']);
    link.lines.length = 0;
    link.status('<Run|MPos:0,0,0,0|A:S>');
    click($('[data-spin-toggle]'));
    slide(80);
    expect(link.lines).toEqual([]);
    expect($('[data-msg]').textContent).toMatch(/program/i);
  });

  it('is disabled until connected', () => {
    link.setConnected(false);
    expect($('[data-spin-toggle]').disabled).toBe(true);
    expect($('[data-spin-rpm]').disabled).toBe(true);
  });
});

describe('spindle steady state and STOP', () => {
  it('does not flicker when reports leave out A:', () => {
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    link.status('<Idle|MPos:0,0,0,0>');
    link.status('<Idle|MPos:0,0,0,0>');
    expect($('[data-spin-toggle]').classList.contains('on')).toBe(true);
  });
  it('has a SPINDLE STOP button that always sends M5', () => {
    expect($('[data-spin-stop]').textContent).toBe('SPINDLE STOP');
    click($('[data-spin-stop]'));
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    click($('[data-spin-stop]'));
    expect(link.lines).toEqual(['M5', 'M5']);
  });
  it('ON while already turning re-sends the slider speed instead of stopping', () => {
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    click($('[data-spin-toggle]'));
    expect(link.lines).toEqual(['M3 S30']);
  });
});

describe('slider changes speed live while dragging', () => {
  const drag = (v) => { const r = $('[data-spin-rpm]'); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); };
  it('sends the first value at once, then at most every 200 ms, ending on the last value', () => {
    link.status('<Idle|MPos:0,0,0,0|A:S>');
    drag(40);
    expect(link.lines).toEqual(['M3 S40']);
    vi.advanceTimersByTime(50); drag(50);
    vi.advanceTimersByTime(50); drag(60);
    expect(link.lines).toEqual(['M3 S40']);
    vi.advanceTimersByTime(200);
    expect(link.lines).toEqual(['M3 S40', 'M3 S60']);
    // release on the same value adds nothing new
    $('[data-spin-rpm]').dispatchEvent(new Event('change', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(link.lines).toEqual(['M3 S40', 'M3 S60']);
  });
  it('dragging while stopped sends nothing', () => {
    drag(70); vi.advanceTimersByTime(500);
    expect(link.lines).toEqual([]);
  });
});
