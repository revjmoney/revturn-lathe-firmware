// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// POLYGON: non-circular turning. C turns slowly (C-axis mode) while X follows the polygon outline and Z feeds,
// so a fixed lathe tool cuts flats (hex etc). Rev 2026-11-09, "method 2".
import { describe, it, expect } from 'vitest';
import { generate } from '../src/cycles/polygon.js';
import { CYCLES } from '../src/program.js';
import { HEADER } from '../src/cycles/common.js';

const P = { sides: 6, flats: 0.5, stockDia: 0.625, zStart: 0, length: 0.25, step: 0.02, feedRev: 0.01, cRpm: 10, perSide: 6, startAngle: 0 };
const ctx = { maxRpm: 150, c0: 0 };

// replay the moves: absolute X/Z/C with G91 never used; G93 lines carry inverse-time F
function moves(lines) {
  let x = null, z = null, c = null, inv = false;
  const out = [];
  for (const l of lines) {
    if (l.startsWith('(')) continue;
    if (/G93/.test(l)) inv = true;
    if (/G94/.test(l)) inv = false;
    const g = (k) => { const m = l.match(new RegExp(String.raw`\b${k}(-?[0-9.]+)`)); return m ? Number(m[1]) : null; };
    const nx = g('X'), nz = g('Z'), nc = g('C'), f = g('F');
    if (nx === null && nz === null && nc === null) continue;
    const prev = { x, z, c };
    if (nx !== null) x = nx; if (nz !== null) z = nz; if (nc !== null) c = nc;
    out.push({ x, z, c, f, inv, prev, line: l });
  }
  return out;
}

describe('polygon cycle', () => {
  it('is registered and runs in C-axis mode (spindle off, no M3/M4)', () => {
    expect(CYCLES.polygon).toBeDefined();
    const r = generate(P, ctx);
    expect(r.ok).toBe(true);
    expect(r.lines[0]).toBe(HEADER[0]);
    expect(r.lines).toContain('M5');
    expect(r.lines.some((l) => /\bM[34]\b/.test(l))).toBe(false);
    expect(r.lines.some((l) => /G93/.test(l))).toBe(true);
    expect(r.lines.at(-1)).not.toMatch(/G93/);
  });

  it('final pass reaches the flats and never cuts outside the stock', () => {
    const m = moves(generate(P, ctx).lines).filter((v) => v.inv);
    const xs = m.map((v) => v.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(P.stockDia + 1e-9);
    expect(Math.min(...xs)).toBeCloseTo(P.flats, 4);
  });

  it('corners of the last pass sit on the polygon (across corners = flats / cos(180/n))', () => {
    const r = generate({ ...P, stockDia: 0.7 }, ctx);
    const lastPass = r.lines.slice(r.lines.lastIndexOf('G93'));
    const xs = moves(lastPass).filter((v) => v.inv).map((v) => v.x);
    expect(Math.max(...xs)).toBeCloseTo(0.5 / Math.cos(Math.PI / 6), 3);
  });

  it('C turns at the asked rpm and Z advances feedRev per C turn', () => {
    const m = moves(generate(P, ctx).lines).filter((v) => v.inv && v.prev.c !== null);
    for (const v of m.slice(0, 50)) {
      const dc = Math.abs(v.c - v.prev.c);
      expect((dc / 360) * v.f).toBeCloseTo(P.cRpm, 1);       // rev per minute
    }
    // Z per C turn over the whole first pass (single 10 deg steps are below the 4-decimal Z resolution)
    const lines = generate(P, ctx).lines;
    const pass = moves(lines.slice(lines.indexOf('G93') - 3, lines.indexOf('G94'))).filter((v) => v.inv);
    const dz = Math.abs(pass.at(-1).z - pass[0].prev.z), turns = Math.abs(pass.at(-1).c - pass[0].prev.c) / 360;
    expect(dz / turns).toBeCloseTo(P.feedRev, 4);           // inch per rev
  });

  it('cuts to the full length and no deeper', () => {
    const zs = moves(generate(P, ctx).lines).map((v) => v.z).filter((z) => z !== null);
    expect(Math.min(...zs)).toBeCloseTo(-P.length, 4);
  });

  it('C only ever moves forward from the current C', () => {
    const cs = moves(generate(P, { ...ctx, c0: 725 }).lines).map((v) => v.c).filter((c) => c !== null);
    for (let i = 1; i < cs.length; i++) expect(cs[i]).toBeGreaterThanOrEqual(cs[i - 1] - 1e-9);
    expect(cs[0]).toBeGreaterThanOrEqual(725 - 1e-9);
  });

  it('refuses bad input', () => {
    expect(generate({ ...P, flats: 0.7 }, ctx).error).toMatch(/smaller than the stock/);
    expect(generate({ ...P, sides: 2 }, ctx).error).toMatch(/Sides/);
    expect(generate({ ...P, sides: 6.5 }, ctx).error).toMatch(/whole/);
    expect(generate({ ...P, cRpm: 200 }, ctx).error).toMatch(/limit/);
    expect(generate({ ...P, feedRev: 0.00001, length: 3 }, ctx).error).toMatch(/Too many moves|too small/);
  });
});
