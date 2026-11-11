// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { compileProgram, safeName } from '../src/program.js';

const ctx = { maxRpm: 40, c0: 0 };
const faceStep = { cycle: 'face', params: { startDia: 1, zStart: 0, depth: 0.02, step: 0.01, feed: 2, rpm: 30 } };
const turnStep = { cycle: 'turn', params: { startDia: 1, finishDia: 0.8, zStart: 0, length: 0.5, step: 0.05, finishAllow: 0.01, roughFeed: 3, finishFeed: 1.5, rpm: 30 } };

describe('compileProgram', () => {
  it('has exactly one header, step comments, and ends with M30', () => {
    const r = compileProgram({ name: 'part', steps: [faceStep, turnStep] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.lines.filter((l) => l === 'G7 G18 G20 G90 G94').length).toBe(1);
    expect(r.lines[0]).toBe('G7 G18 G20 G90 G94');
    expect(r.lines).toContain('(STEP 1: face)');
    expect(r.lines).toContain('(STEP 2: turn)');
    expect(r.lines.at(-1)).toBe('M30');
    expect(r.lines.at(-2)).toBe('M5');
  });

  it('reports which step is invalid', () => {
    const bad = { cycle: 'turn', params: { ...turnStep.params, rpm: 99 } };
    const r = compileProgram({ name: 'p', steps: [faceStep, bad] }, ctx);
    expect(r).toEqual({ ok: false, stepIndex: 1, error: 'Step 2: RPM above machine limit (40)' });
  });

  it('passes raw g-code steps through line by line', () => {
    const r = compileProgram({ name: 'p', steps: [{ cycle: 'gcode', params: { text: 'G0 X1\n\nG0 Z0.1' } }] }, ctx);
    expect(r.lines).toContain('G0 X1');
    expect(r.lines).toContain('G0 Z0.1');
  });

  it('refuses an empty program', () => {
    expect(compileProgram({ name: 'p', steps: [] }, ctx).ok).toBe(false);
  });

  it('carries the C position forward so a later thread still starts ahead of earlier C moves', () => {
    const idx = { cycle: 'index', params: { angle: 90 } };
    const thr = { cycle: 'thread', params: { tpi: 20, majorDia: 0.25, zStart: 0, length: 0.5, passes: 2, rpm: 30 } };
    const r = compileProgram({ name: 'p', steps: [idx, thr] }, { ...ctx, c0: 0 });
    const firstThreadC = r.lines.filter((l) => /^G0 C/.test(l)).map((l) => Number(l.slice(4)))[1];
    expect(firstThreadC).toBeGreaterThanOrEqual(90);
  });
});

describe('safeName', () => {
  it('lowercases and strips to a safe file name', () => {
    expect(safeName('My Part #1!')).toBe('my_part_1');
    expect(safeName('a'.repeat(40)).length).toBe(24);
    expect(safeName('***')).toBe('program');
  });
});
