// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// ZERO X / Z / C / ALL must be on screen in every mode (Rev 2026-11-08), not just DRO.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startApp, MODES } from '../src/app.js';
import { registerJog } from '../src/ui/jog.js';
import { registerCycles } from '../src/ui/cycles.js';
import { registerProgram } from '../src/ui/program.js';
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
  registerJog(app); registerCycles(app); registerProgram(app); registerSetup(app);
  link.setConnected(true);
  link.status('<Idle|MPos:0,0,0,0>');
});
afterEach(() => { app.stop(); vi.useRealTimers(); });

describe('zero bar in every mode', () => {
  for (const mode of MODES) {
    it(`${mode}: one ZERO X/Z/C/ALL set, and ZERO Z sends G10 L20`, () => {
      click(root.querySelector(`[data-mode="${mode}"]`));
      for (const a of ['X', 'Z', 'C', 'ALL']) expect(root.querySelectorAll(`[data-zero="${a}"]`).length).toBe(1);
      const z = $('[data-zero="Z"]');
      expect(z.disabled).toBe(false);
      link.lines.length = 0;
      click(z);
      expect(link.lines).toContain('G10 L20 P0 Z0');
    });
  }

  // Rev 2026-11-10: no home switches yet, so GO TO ZERO rapids back to the work zero he set: Z first (away from
  // the chuck), then X.
  it('GO TO ZERO rapids Z to 0 first, then X to 0', () => {
    link.lines.length = 0;
    click($('[data-gozero]'));
    const zi = link.lines.indexOf('G7 G20 G90 G0 Z0'), xi = link.lines.indexOf('G0 X0');
    expect(zi).toBeGreaterThanOrEqual(0);
    expect(xi).toBeGreaterThan(zi);
  });

  it('GO TO ZERO only works when Idle', () => {
    link.status('<Run|MPos:0,0,0,0>');
    link.lines.length = 0;
    click($('[data-gozero]'));
    expect(link.lines.some((l) => /G0/.test(l))).toBe(false);
    expect($('[data-msg]').textContent).toMatch(/Idle/);
  });

  it('refuses to zero while a program is running', () => {
    link.status('<Run|MPos:0,0,0,0>');
    link.lines.length = 0;
    click($('[data-zero="X"]'));
    expect(link.lines.some((l) => l.startsWith('G10'))).toBe(false);
    expect($('[data-msg]').textContent).toMatch(/Idle/);
  });
});

// Rev 2026-11-09: C unwind with grblHAL's rotary wrap ($538). ZERO C / ALL also store G28 there (G28.1), and the
// run context only uses G28 when $538 has C on and the stored G28 angle really is C zero.
describe('C unwind (G28 rotary wrap)', () => {
  it('asks for $538 and the stored positions ($#) on connect', () => {
    link.setConnected(false); link.lines.length = 0; link.setConnected(true);
    expect(link.lines).toContain('$538');
    expect(link.lines).toContain('$#');
  });

  it('ZERO C and ZERO ALL store G28 at the new zero; ZERO X and Z do not', () => {
    link.lines.length = 0;
    click($('[data-zero="C"]'));
    expect(link.lines).toEqual(['G10 L20 P0 C0', 'G28.1', '$#']);
    link.lines.length = 0;
    click($('[data-zero="ALL"]'));
    expect(link.lines).toEqual(['G10 L20 P0 X0 Z0 C0', 'G28.1', '$#']);
    link.lines.length = 0;
    click($('[data-zero="X"]'));
    expect(link.lines).toEqual(['G10 L20 P0 X0']);
  });

  it('uses G28 only with $538 on and G28 stored on a C zero', () => {
    link.line('$538=1');
    link.line('[G28:-40.513,0.000,0.000,-2160.000]');
    link.status('<Idle|MPos:0,0,0,-1160.011|WCO:0,0,0,0>');
    expect(app.runCtx().cWrap).toBe(true);
    link.status('<Idle|MPos:0,0,0,-1160.011|WCO:0,0,0,45>'); // C zero moved (ABS SET): G28 angle is no longer zero
    expect(app.runCtx().cWrap).toBe(false);
    link.status('<Idle|MPos:0,0,0,-1160.011|WCO:0,0,0,720>');
    expect(app.runCtx().cWrap).toBe(true);
    link.line('$538=0');
    expect(app.runCtx().cWrap).toBe(false);
  });

  it('no G28 until the stored position is known', () => {
    link.line('$538=1');
    expect(app.runCtx().cWrap).toBe(false);
  });
});
