// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect, vi } from 'vitest';
import { defaultSetup, normalizeSetup, loadSetup, saveSetup, toolById, touchOffset } from '../src/setup.js';

describe('setup', () => {
  it('defaults: 8 tools with T1 as the zero reference, stroke limits OFF', () => {
    const s = defaultSetup();
    expect(s.tools.length).toBe(8);
    expect(s.tools[0]).toEqual({ n: 1, desc: 'T1 reference', dx: 0, dz: 0 });
    expect(s.limits).toEqual({ enabled: false, xMax: 3, xMin: -0.05, zMax: 3, zMin: -4 });
    expect(s.activeTool).toBe(1);
  });

  it('keeps the limits switch only when it is exactly true', () => {
    expect(normalizeSetup({ limits: { enabled: true } }).limits.enabled).toBe(true);
    expect(normalizeSetup({ limits: { enabled: 'yes' } }).limits.enabled).toBe(false);
    expect(normalizeSetup({ limits: { xMax: 2 } }).limits.enabled).toBe(false); // old setup.json files: off
  });

  it('normalizes partial or bad data back to safe values', () => {
    const s = normalizeSetup({ tools: [{ n: 1, dx: 5, dz: 'x' }], limits: { xMax: 'oops' }, activeTool: 99 });
    expect(s.tools[0].dx).toBe(0); // T1 is always the reference
    expect(s.tools.length).toBe(8);
    expect(s.limits.xMax).toBe(3);
    expect(s.activeTool).toBe(1);
  });

  it('finds a tool by number', () => {
    const s = defaultSetup();
    s.tools[2].dx = 0.1;
    expect(toolById(s, 3).dx).toBe(0.1);
    expect(toolById(s, 42)).toEqual(s.tools[0]);
  });

  it('touch-off: offset = what T1 coordinates read now minus the true value', () => {
    // tool 3 tip touching a 1.000 dia part while the DRO (T1 frame) reads 1.120 -> dx 0.12
    expect(touchOffset(1.12, 1.0)).toBeCloseTo(0.12, 9);
  });

  it('loads setup.json from the lathe, or defaults when missing', async () => {
    const f1 = async () => ({ ok: true, text: async () => JSON.stringify({ activeTool: 2 }) });
    expect((await loadSetup('lathe', f1)).activeTool).toBe(2);
    const f2 = async () => ({ ok: false, status: 404 });
    expect((await loadSetup('lathe', f2)).activeTool).toBe(1);
  });

  it('saves setup.json to the lathe', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, opts) => {
      calls.push([url, opts?.method]);
      return opts?.method === 'POST' ? { ok: true, json: async () => ({}) } : { ok: true, json: async () => ({ files: [{ name: 'setup.json' }] }) };
    });
    await saveSetup('lathe', defaultSetup(), fetchImpl);
    expect(calls[0]).toEqual(['http://lathe/files', 'POST']);
  });
});

describe('review fixes: setup loading', () => {
  it('only a missing file (404) means defaults; other failures throw', async () => {
    const missing = async () => ({ ok: false, status: 404 });
    expect((await loadSetup('lathe', missing)).activeTool).toBe(1);
    const broken = async () => ({ ok: false, status: 500 });
    await expect(loadSetup('lathe', broken)).rejects.toThrow();
    const offline = async () => { throw new Error('network'); };
    await expect(loadSetup('lathe', offline)).rejects.toThrow();
  });
});
