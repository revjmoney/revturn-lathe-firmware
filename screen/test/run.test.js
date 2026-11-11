// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { prepareCycle, prepareProgram } from '../src/run.js';
import { defaultSetup } from '../src/setup.js';

const setup = () => {
  const s = defaultSetup();
  s.tools[1] = { n: 2, desc: 'parting', dx: 0.1, dz: -0.05 };
  s.limits = { enabled: true, xMax: 3, xMin: -0.05, zMax: 3, zMin: -4 };
  return s;
};
const ctx = (o = {}) => ({ maxRpm: 40, c0: 0, setup: setup(), dryRun: false, ...o });
const faceP = { startDia: 1, zStart: 0, depth: 0.02, step: 0.01, feed: 2, rpm: 30 };
const turnP = { startDia: 1, finishDia: 0.8, zStart: 0, length: 0.5, step: 0.05, finishAllow: 0.01, roughFeed: 3, finishFeed: 1.5, rpm: 30 };

describe('prepareCycle', () => {
  it('refuses until the machine rpm limit is known', () => {
    expect(prepareCycle('face', faceP, ctx({ maxRpm: null }))).toEqual({ ok: false, error: 'Waiting for machine settings ($30): try again in a moment' });
  });

  it('applies the chosen tool offset', () => {
    const r = prepareCycle('face', { ...faceP, tool: 2 }, ctx());
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('G1 X0.1000 F2'); // X0 + 0.1 offset
  });

  it('refuses an overtravel', () => {
    const r = prepareCycle('turn', { ...turnP, length: 5 }, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^OVERTRAVEL Z- at line/);
  });

  it('dry run lifts Z, skips the spindle and is labelled', () => {
    const r = prepareCycle('face', faceP, ctx({ dryRun: true }));
    expect(r.ok).toBe(true);
    expect(r.lines[0]).toBe('(DRY RUN: Z +0.52, spindle off)');
    expect(r.lines.some((l) => /^M3/.test(l))).toBe(false);
    expect(r.lines).toContain('G0 Z0.5100');
  });

  it('checks limits on the dry-run path too', () => {
    const s = setup();
    s.limits.zMax = 0.3;
    const r = prepareCycle('face', faceP, ctx({ setup: s, dryRun: true }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^OVERTRAVEL Z\+ .*\(dry run\)$/);
  });
});

describe('prepareProgram', () => {
  const prog = { name: 'p', steps: [{ cycle: 'face', params: { ...faceP, tool: 1 } }, { cycle: 'turn', params: { ...turnP, tool: 2 } }] };

  it('stops for a manual tool change between steps (M5, message, M0)', () => {
    const r = prepareProgram(prog, ctx());
    expect(r.ok).toBe(true);
    const i = r.lines.indexOf('(MSG, CHANGE TO T2 parting)');
    expect(i).toBeGreaterThan(0);
    expect(r.lines[i - 1]).toBe('M5');
    expect(r.lines[i + 1]).toBe('M0');
    expect(r.lines.at(-1)).toBe('M30');
  });

  it('asks for the first tool when it is not the active one', () => {
    const s = setup();
    s.activeTool = 2;
    const r = prepareProgram(prog, ctx({ setup: s }));
    expect(r.lines.slice(1, 4)).toEqual(['M5', '(MSG, CHANGE TO T1 T1 reference)', 'M0']);
  });

  it('offsets each step by its own tool', () => {
    const r = prepareProgram(prog, ctx());
    expect(r.lines).toContain('G1 X0.0000 F2');     // face step, T1
    expect(r.lines).toContain('G0 X1.0000');        // turn rough 0.9 + 0.1 for T2
  });

  it('names the failing step', () => {
    const bad = { name: 'p', steps: [prog.steps[0], { cycle: 'turn', params: { ...turnP, rpm: 99 } }] };
    expect(prepareProgram(bad, ctx())).toEqual({ ok: false, stepIndex: 1, error: 'Step 2: RPM above machine limit (40)' });
  });

  it('refuses until the rpm limit is known', () => {
    expect(prepareProgram(prog, ctx({ maxRpm: null })).ok).toBe(false);
  });
});

describe('review fixes: programs', () => {
  it('g-code steps get the tool offset and a tool change', () => {
    const p = { name: 'p', steps: [{ cycle: 'gcode', params: { text: 'G0 X1 Z0', tool: 2 } }] };
    const r = prepareProgram(p, ctx());
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('(MSG, CHANGE TO T2 parting)');
    expect(r.lines).toContain('G0 X1.1000 Z-0.0500');
  });
  it('refuses imported code with homing / offset commands', () => {
    for (const bad of ['G28', 'G53 G0 X0', 'G10 L2 P1 X0', 'G92 X0', 'G30']) {
      const r = prepareProgram({ name: 'p', steps: [{ cycle: 'gcode', params: { text: bad } }] }, ctx());
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^Step 1: .* not allowed in a program/);
    }
  });
  it('strips parentheses from tool descriptions in the change message', () => {
    const s = setup();
    s.tools[1].desc = '1/2 (HSS) bit';
    const r = prepareCycle('face', { ...faceP, tool: 2 }, ctx({ setup: s }));
    expect(r.lines).toContain('(MSG, CHANGE TO T2 1/2 HSS bit)');
  });
  it('dry run of a long turn stays clear of the part', () => {
    const r = prepareCycle('turn', { ...turnP, length: 1.5 }, ctx({ dryRun: true }));
    expect(r.ok).toBe(true);
    const zs = r.lines.filter((l) => !l.startsWith('(')).join(' ').match(/Z(-?[0-9.]+)/g).map((w) => Number(w.slice(1)));
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
});

// Rev 2026-11-09: every program and cycle ends with C back at 0 (the nearest whole turn, so at most half a
// turn of travel and the DRO reads 0.00). Spindle-mode turns do not count in C, so the end C is known.
describe('C returns to 0 at the end', () => {
  const gprog = (text, more = []) => ({ name: 'p', steps: [{ cycle: 'gcode', params: { text } }, ...more] });
  const tail = (r) => r.lines.slice(-4);

  it('a program ends with M5 and G0 C to the nearest whole turn, before M30', () => {
    const r = prepareProgram(gprog('G90 G0 C725'), ctx());
    expect(r.ok).toBe(true);
    expect(tail(r)).toEqual(['(RETURN C TO 0)', 'M5', 'G90 G0 C720.0000', 'M30']);
  });

  it('counts incremental C moves and the starting C', () => {
    const r = prepareProgram(gprog('G91 G1 C500 F100\nG1 C-100 F100\nG90'), ctx({ c0: 30 }));
    expect(r.lines.at(-2)).toBe('G90 G0 C360.0000'); // 30 + 500 - 100 = 430 -> 360
  });

  it('rounds the other way when that is closer', () => {
    const r = prepareProgram(gprog('G90 G0 C-200'), ctx());
    expect(r.lines.at(-2)).toBe('G90 G0 C-360.0000');
  });

  it('a cycle that never moves C still brings C back from where it started', () => {
    const r = prepareCycle('face', faceP, ctx({ c0: 90 }));
    expect(r.lines.slice(-3)).toEqual(['(RETURN C TO 0)', 'M5', 'G90 G0 C0.0000']);
  });

  it('adds nothing when C already ends on 0', () => {
    const r = prepareCycle('face', faceP, ctx({ c0: 720 }));
    expect(r.lines.some((l) => /RETURN C/.test(l))).toBe(false);
  });

  it('the thread cycle (C turns many times) only goes to the nearest whole turn', () => {
    const r = prepareCycle('thread', { tpi: 12, majorDia: 1.5, zStart: 0, length: 0.5, passes: 2, springPasses: 0, rpm: 30 }, ctx());
    const last = r.lines.at(-1);
    const c = Number(last.match(/C(-?[0-9.]+)/)[1]);
    expect(c % 360).toBe(0);
    const prev = Math.max(...r.lines.slice(0, -3).map((l) => Number(l.match(/C(-?[0-9.]+)/)?.[1] ?? -Infinity)));
    expect(Math.abs(c - prev)).toBeLessThanOrEqual(180);
  });

  it('INDEX is left where it was sent, alone or as the last program step', () => {
    expect(prepareCycle('index', { angle: 90 }, ctx()).lines.some((l) => /RETURN C/.test(l))).toBe(false);
    const r = prepareProgram(gprog('G90 G0 C10', [{ cycle: 'index', params: { angle: 45 } }]), ctx());
    expect(r.lines.some((l) => /RETURN C/.test(l))).toBe(false);
  });

  it('with the rotary wrap on, ends with G91 G28 C0 (firmware unwinds C and resets its count)', () => {
    const r = prepareProgram(gprog('G90 G0 C18725'), ctx({ cWrap: true }));
    expect(r.lines.slice(-5)).toEqual(['(RETURN C TO 0)', 'M5', 'G91 G28 C0', 'G90', 'M30']);
  });

  it('with the rotary wrap on, a program that never moves C and starts on 0 adds nothing', () => {
    const r = prepareCycle('face', faceP, ctx({ cWrap: true, c0: 720 }));
    expect(r.lines.some((l) => /RETURN C|G28/.test(l))).toBe(false);
  });

  it('dry run returns C too', () => {
    const r = prepareProgram(gprog('G90 G0 C725'), ctx({ dryRun: true }));
    expect(r.lines.at(-2)).toBe('G90 G0 C720.0000');
  });
});
