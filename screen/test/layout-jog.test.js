// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-09: jog buttons beside the DRO readout (the space that was empty), jog step / feed and the
// spindle controls under both, on every screen. HOLD still cancels a jog from any screen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp, MODES } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
import { registerSetup } from '../src/ui/setup.js';
import { FakeLink } from './helpers/fake-link.js';

let root, link, app;
const $ = (s) => root.querySelector(s);
const click = (s) => $(s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const fire = (s, type) => $(s).dispatchEvent(new Event(type, { bubbles: true }));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
  registerJog(app); registerCycles(app); registerProgram(app); registerSetup(app);
  link.setConnected(true);
  link.status('<Idle|MPos:0,0,0,0|D:1>');
  link.lines.length = 0;
  link.realtime.length = 0;
});
afterEach(() => app.stop());

describe('jog pad beside the DRO', () => {
  for (const mode of MODES) {
    it(`${mode}: one jog pad, next to the readout`, () => {
      app.showMode(mode);
      expect(root.querySelectorAll('[data-jog="X+"]').length).toBe(1);
      expect($('.drotop .jogpad [data-jog="C-"]')).not.toBeNull();
      expect($('.drotop .readout [data-dro="x"]')).not.toBeNull();
    });
  }

  it('step and feed controls sit under the readout and jog pad, above the spindle bar', () => {
    const order = [...root.querySelectorAll('.drotop, [data-jogctl], .spinbar')].map((e) => e.className || 'jogctl');
    expect(order[0]).toMatch(/drotop/);
    expect(order[1]).toBe('jogctl');
    expect(order[2]).toMatch(/spinbar/);
    expect($('[data-jogctl] [data-step="0.01"]')).not.toBeNull();
    expect($('[data-jogctl] [name="feedC"]')).not.toBeNull();
  });

  it('X/Z jog speed is a slider right above the spindle bar (Rev 2026-11-09)', () => {
    const xz = $('.xzbar');
    expect(xz).not.toBeNull();
    expect(xz.querySelector('input[type=range][data-xz-feed]')).not.toBeNull();
    // the next element after the jog controls block is the spindle bar, and the slider is the last thing before it
    expect($('[data-jogctl]').lastElementChild).toBe(xz);
    expect($('[data-jogctl]').nextElementSibling.classList.contains('spinbar')).toBe(true);
    expect($('[data-xz-show]').textContent).toBe('10 IPM');
    expect($('[name="feedXZ"]')).toBeNull(); // the old box is gone
  });

  it('the slider sets the X/Z jog feed', () => {
    const s = $('[data-xz-feed]');
    s.value = '25'; s.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('[data-xz-show]').textContent).toBe('25 IPM');
    click('[data-step="0.01"]');
    fire('[data-jog="Z-"]', 'pointerdown');
    expect(link.lines.at(-1)).toMatch(/Z-0\.01 F25$/);
  });

  it('slider top follows the faster of $110 / $112 (mm/min to ipm) and clamps the value', () => {
    const s = $('[data-xz-feed]');
    s.value = '50'; s.dispatchEvent(new Event('input', { bubbles: true }));
    link.line('$110=1300.000');
    link.line('$112=380.000');
    expect(s.max).toBe('51');
    link.line('$110=500.000');
    expect(s.max).toBe('19');
    expect(s.value).toBe('19');
    expect($('[data-xz-show]').textContent).toBe('19 IPM');
  });

  it('moving the slider during a CONT jog changes the speed of the next segment', () => {
    vi.useFakeTimers();
    try {
      click('[data-step="cont"]');
      fire('[data-jog="X+"]', 'pointerdown');
      expect(link.lines.at(-1)).toMatch(/F10$/);
      const s = $('[data-xz-feed]');
      s.value = '30'; s.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(100);
      expect(link.lines.at(-1)).toMatch(/F30$/);
      fire('[data-jog="X+"]', 'pointerup');
    } finally { vi.useRealTimers(); }
  });

  it('jogs from the DRO screen', () => {
    app.showMode('DRO');
    click('[data-step="0.01"]');
    fire('[data-jog="X+"]', 'pointerdown');
    expect(link.lines.length).toBe(1);
    expect(link.lines[0]).toMatch(/^\$J=/);
  });

  it('HOLD on any screen cancels a continuous jog first', () => {
    app.showMode('CYCLES');
    click('[data-step="cont"]');
    fire('[data-jog="Z+"]', 'pointerdown');
    click('[data-hold]');
    expect(link.realtime).toContain(0x85);
    expect(link.realtime.indexOf(0x85)).toBeLessThan(link.realtime.indexOf(0x21));
  });
});

// Review 2026-11-10 (A1): a CONT jog must stop however the button is let go, and STOP / Alarm must end the repeat.
describe('CONT jog always stops', () => {
  const startCont = () => { click('[data-step="cont"]'); fire('[data-jog="Z-"]', 'pointerdown'); link.lines.length = 0; link.realtime.length = 0; };
  const jogLines = () => link.lines.filter((l) => l.startsWith('$J=')).length;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pointer leaving the button (a real, non-bubbling pointerleave) cancels the jog', () => {
    startCont();
    $('[data-jog="Z-"]').dispatchEvent(new Event('pointerleave', { bubbles: false }));
    expect(link.realtime).toContain(0x85);
    vi.advanceTimersByTime(500);
    expect(jogLines()).toBe(0);
  });

  it('releasing anywhere in the window cancels the jog', () => {
    startCont();
    window.dispatchEvent(new Event('pointerup'));
    expect(link.realtime).toContain(0x85);
    vi.advanceTimersByTime(500);
    expect(jogLines()).toBe(0);
  });

  it('the window losing focus cancels the jog', () => {
    startCont();
    window.dispatchEvent(new Event('blur'));
    expect(link.realtime).toContain(0x85);
    vi.advanceTimersByTime(500);
    expect(jogLines()).toBe(0);
  });

  it('STOP ends the repeat', () => {
    startCont();
    click('[data-stop]');
    link.lines.length = 0;
    vi.advanceTimersByTime(500);
    expect(jogLines()).toBe(0);
  });

  it('an Alarm (or any state but Idle / Jog) ends the repeat', () => {
    startCont();
    link.status('<Alarm|MPos:0,0,0,0>');
    link.lines.length = 0;
    vi.advanceTimersByTime(500);
    expect(jogLines()).toBe(0);
  });
});
