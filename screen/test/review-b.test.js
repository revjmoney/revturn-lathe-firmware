// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Code review 2026-11-10, section B (wrong cut or wrong position).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyTool, dryRun } from '../src/transform.js';
import { prepareCycle, prepareProgram } from '../src/run.js';
import { compileProgram } from '../src/program.js';
import * as turn from '../src/cycles/turn.js';
import { normalizeSetup } from '../src/setup.js';
import { startApp } from '../src/app.js';
import { FakeLink } from './helpers/fake-link.js';

const num = (line, w) => { const m = new RegExp(`${w}(-?[0-9.]+)`).exec(line); return m ? Number(m[1]) : null; };

describe('B5: numbers with a trailing dot', () => {
  it('tool offset keeps X1. and Z-2. as numbers', () => {
    const out = applyTool(['G0 X1. Z-2.'], { dx: 0.05, dz: 0.1 });
    expect(out[0]).toBe('G0 X1.0500 Z-1.9000');
  });
  it('dry run keeps Z-1. as a number', () => {
    const out = dryRun(['G1 Z-1. F5.'], 0.5);
    expect(out[0]).toBe('G1 Z-0.5000 F5.');
  });
});

describe('B1: dry run lift uses the tool tip', () => {
  const setup = () => {
    const s = normalizeSetup({});
    s.tools[1].dz = 1.2; // T2: tip sits 1.2 lower than the T1 numbers
    s.activeTool = 2;
    return s;
  };
  it('a long tool ends DRY_RUN_DZ above the face at the deepest point', () => {
    const ctx = { maxRpm: 200, c0: 0, setup: setup(), dryRun: true };
    const r = prepareCycle('turn', { startDia: 1, finishDia: 0.8, zStart: 0, length: 1, step: 0.05, finishAllow: 0.01, roughFeed: 3, finishFeed: 1.5, rpm: 30, tool: 2 }, ctx);
    expect(r.ok).toBe(true);
    let minTipZ = Infinity;
    for (const l of r.lines) {
      if (l.startsWith('(')) continue;
      const z = num(l, 'Z');
      if (z !== null) minTipZ = Math.min(minTipZ, z - 1.2);
    }
    expect(minTipZ).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
});

describe('B3: taper roughing takes the step depth, not the whole taper', () => {
  it('no rough pass cuts deeper than the step at either end', () => {
    const p = { startDia: 1.0, finishDia: 0.5, endDia: 0.9, zStart: 0, length: 1, step: 0.02, finishAllow: 0, roughFeed: 2, finishFeed: 1, rpm: 30 };
    const r = turn.generate(p, { maxRpm: 200, c0: 0 });
    expect(r.ok).toBe(true);
    // walk the rough passes: the first one may only remove one step (0.04 on diameter) from the 1.0 stock
    const firstEntry = r.lines.findIndex((l) => /^G0 X0\.\d/.test(l));
    expect(num(r.lines[firstEntry], 'X')).toBeCloseTo(0.96, 6);
    // and the finish pass still ends on the taper
    expect(r.lines).toContain('G1 X0.9000 Z-1.0000 F1');
  });
  it('a straight cylinder is unchanged', () => {
    const p = { startDia: 1, finishDia: 0.8, zStart: 0, length: 0.5, step: 0.05, finishAllow: 0.01, roughFeed: 3, finishFeed: 1.5, rpm: 30 };
    const r = turn.generate(p, { maxRpm: 40, c0: 0 });
    const starts = r.lines.filter((l) => /^G0 X0/.test(l)).map((l) => l.slice(4));
    expect(starts).toEqual(['0.9000', '0.8200', '0.8000']);
  });
});

describe('B4: a g-code step cannot leak its modes into the next step', () => {
  it('modes are reset after a g-code step', () => {
    const program = { name: 't', steps: [
      { cycle: 'gcode', params: { text: 'G21\nG91\nG0 Z2' } },
      { cycle: 'face', params: { startDia: 1, endDia: 0, zStart: 0, depth: 0.02, step: 0.01, feed: 2, rpm: 30 } },
    ] };
    const r = compileProgram(program, { maxRpm: 200, c0: 0 });
    expect(r.ok).toBe(true);
    const i = r.lines.indexOf('(STEP 2: face)');
    expect(r.lines.slice(0, i)).toContain('G7 G18 G20 G90 G94');
    expect(r.lines.lastIndexOf('G7 G18 G20 G90 G94')).toBeGreaterThan(r.lines.indexOf('G0 Z2'));
  });
});

describe('B2: ZERO and GO TO ZERO use the active tool tip', () => {
  let root, link, app;
  const $ = (s) => root.querySelector(s);
  const click = (s) => $(s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    link = new FakeLink();
    app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ files: [] }), text: async () => '{}' }) });
    link.setConnected(true);
    link.status('<Idle|MPos:0,0,0,0>');
    app.state.setup.tools[1].dx = 0.2;
    app.state.setup.tools[1].dz = 1.2;
    app.state.setup.activeTool = 2;
    link.lines.length = 0;
  });
  afterEach(() => { app.stop(); vi.useRealTimers(); });

  it('ZERO Z with T2 makes the T2 tip read 0', () => {
    click('[data-zero="Z"]');
    expect(link.lines).toContain('G7 G20 G10 L20 P0 Z1.2');
  });
  it('ZERO ALL with T2 sets X and Z for the tip and C to 0', () => {
    click('[data-zero="ALL"]');
    expect(link.lines).toContain('G7 G20 G10 L20 P0 X0.2 Z1.2 C0');
  });
  it('ZERO with T1 is unchanged', () => {
    app.state.setup.activeTool = 1;
    click('[data-zero="Z"]');
    expect(link.lines).toContain('G10 L20 P0 Z0');
  });
  it('GO TO ZERO puts the T2 tip on zero, Z first', () => {
    click('[data-gozero]');
    const zi = link.lines.indexOf('G7 G20 G90 G0 Z1.2'), xi = link.lines.indexOf('G0 X0.2');
    expect(zi).toBeGreaterThanOrEqual(0);
    expect(xi).toBeGreaterThan(zi);
  });
  it('GO TO ZERO is refused while the state is still unknown', () => {
    app.state.machine = null;
    click('[data-gozero]');
    expect(link.lines.some((l) => / G0 /.test(` ${l} `))).toBe(false);
  });
});
