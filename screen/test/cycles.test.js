// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import * as face from '../src/cycles/face.js';
import * as turn from '../src/cycles/turn.js';
import * as thread from '../src/cycles/thread.js';
import * as groove from '../src/cycles/groove.js';
import * as index from '../src/cycles/index.js';
import { fmt } from '../src/cycles/common.js';

const ctx = { maxRpm: 40, c0: 0 };
const HEADER = 'G7 G18 G20 G90 G94';
const words = (line, letter) => {
  const m = line.match(new RegExp(`${letter}(-?[0-9.]+)`));
  return m ? Number(m[1]) : null;
};

const faceP = { startDia: 1, zStart: 0, depth: 0.02, step: 0.01, feed: 2, rpm: 30 };
const turnP = { startDia: 1, finishDia: 0.8, zStart: 0, length: 0.5, step: 0.05, finishAllow: 0.01, roughFeed: 3, finishFeed: 1.5, rpm: 30 };
const threadP = { tpi: 20, majorDia: 0.25, zStart: 0, length: 0.5, passes: 4, springPasses: 1, rpm: 30 };
const grooveP = { dia: 0.5, z: -1, width: 0.1, depth: 0.25, peck: 0.05, feed: 0.5, rpm: 20, toolWidth: 0.1 };

describe('fmt', () => {
  it('formats 4 decimals and never -0', () => {
    expect(fmt(1.23456)).toBe('1.2346');
    expect(fmt(-0.00001)).toBe('0.0000');
  });
});

describe('every spindle cycle', () => {
  const cases = [
    ['face', face, faceP], ['turn', turn, turnP], ['groove', groove, grooveP],
  ];
  for (const [name, mod, p] of cases) {
    it(`${name}: header first, M3 before the first G1, ends with M5`, () => {
      const r = mod.generate(p, ctx);
      expect(r.ok).toBe(true);
      expect(r.lines[0]).toBe(HEADER);
      const m3 = r.lines.findIndex((l) => l === `M3 S${p.rpm}`);
      const g1 = r.lines.findIndex((l) => l.startsWith('G1'));
      expect(m3).toBeGreaterThan(0);
      expect(m3).toBeLessThan(g1);
      expect(r.lines.at(-1)).toBe('M5');
    });
  }
});

describe('validation', () => {
  it('requires rpm', () => {
    expect(face.generate({ ...faceP, rpm: undefined }, ctx)).toEqual({ ok: false, error: 'RPM is required' });
  });
  it('refuses rpm above the machine limit', () => {
    expect(turn.generate({ ...turnP, rpm: 50 }, ctx)).toEqual({ ok: false, error: 'RPM above machine limit (40)' });
  });
  it('refuses a zero face depth', () => {
    expect(face.generate({ ...faceP, depth: 0 }, ctx).ok).toBe(false);
  });
  it('refuses a turn whose finish diameter is not smaller than the start', () => {
    expect(turn.generate({ ...turnP, finishDia: 1 }, ctx).ok).toBe(false);
  });
  it('refuses zero thread passes', () => {
    expect(thread.generate({ ...threadP, passes: 0 }, ctx).ok).toBe(false);
  });
  it('refuses non-numbers', () => {
    expect(face.generate({ ...faceP, step: NaN }, ctx).ok).toBe(false);
    expect(groove.generate({ ...grooveP, depth: 0.3 }, ctx).ok).toBe(false); // deeper than radius
  });
});

describe('face', () => {
  const r = face.generate(faceP, ctx);
  it('cuts two passes to center at Z-0.01 and Z-0.02', () => {
    const cuts = r.lines.filter((l) => l.startsWith('G1') && l.includes('X0.0000'));
    expect(cuts.length).toBe(2);
    const zs = r.lines.filter((l) => /^G0 Z-0\.0[12]00$/.test(l));
    expect(zs).toEqual(['G0 Z-0.0100', 'G0 Z-0.0200']);
  });
  it('lifts +Z off the face before retracting to X1.1000', () => {
    const cut = r.lines.findIndex((l) => l.startsWith('G1') && l.includes('X0.0000'));
    expect(r.lines[cut + 1]).toMatch(/^G0 Z/);
    expect(words(r.lines[cut + 1], 'Z')).toBeGreaterThan(-0.01);
    expect(r.lines[cut + 2]).toBe('G0 X1.1000');
  });
});

describe('turn', () => {
  it('roughs at 0.9 and 0.82 then finishes at 0.8 with the finish feed', () => {
    const r = turn.generate(turnP, ctx);
    const starts = r.lines.filter((l) => /^G0 X0\.\d+$/.test(l)).map((l) => l.slice(4));
    expect(starts).toEqual(['0.9000', '0.8200', '0.8000']);
    const cutEnds = r.lines.filter((l) => l.startsWith('G1') && l.includes('Z-0.5000'));
    expect(cutEnds.length).toBe(3);
    expect(r.lines.some((l) => l.startsWith('G1') && l.includes('F1.5'))).toBe(true);
  });
  it('finishes a taper to X0.7000 at Z-0.5000', () => {
    const r = turn.generate({ ...turnP, endDia: 0.7 }, ctx);
    expect(r.lines).toContain('G1 X0.7000 Z-0.5000 F1.5');
  });
  it('retracts +X before +Z after each cut', () => {
    const r = turn.generate(turnP, ctx);
    r.lines.forEach((l, i) => {
      if (l.startsWith('G1') && l.includes('Z-0.5000')) {
        expect(r.lines[i + 1]).toBe('G0 X1.1000');
        expect(r.lines[i + 2]).toMatch(/^G0 Z0\.0500$/);
      }
    });
  });
});

describe('thread', () => {
  const synced = (r) => r.lines.filter((l) => l.startsWith('G1') && l.includes('C'));
  const startsC = (r) => r.lines.filter((l) => /^G0 C/.test(l)).map((l) => words(l, 'C'));

  it('runs in C-axis mode: M5 before motion, no M3', () => {
    const r = thread.generate(threadP, { ...ctx, c0: -37.5 });
    expect(r.ok).toBe(true);
    expect(r.lines[0]).toBe(HEADER);
    expect(r.lines.some((l) => l.startsWith('M3'))).toBe(false);
    expect(r.lines.indexOf('M5')).toBeLessThan(r.lines.findIndex((l) => l.startsWith('G1')));
  });

  it('uses F = pitch x rpm and 4320 degrees of C per pass', () => {
    const r = thread.generate(threadP, { ...ctx, c0: -37.5 });
    const cuts = synced(r);
    expect(cuts.length).toBe(5); // 4 passes + 1 spring
    const starts = startsC(r);
    cuts.forEach((l, i) => {
      expect(l).toMatch(/F1\.5000$/);
      expect(words(l, 'Z')).toBeCloseTo(-0.5, 6);
      expect(words(l, 'C') - starts[i]).toBeCloseTo(4320, 6);
    });
  });

  it('starts every pass at the same angle and C only increases', () => {
    for (const c0 of [-37.5, 12.3, 1e6 + 12.3]) {
      const r = thread.generate(threadP, { ...ctx, c0 });
      const starts = startsC(r);
      const ends = synced(r).map((l) => words(l, 'C'));
      expect(starts[0]).toBeGreaterThanOrEqual(c0);
      starts.forEach((s, i) => {
        expect(((s % 360) + 360) % 360).toBeCloseTo(0, 6);
        if (i > 0) expect(s).toBeGreaterThanOrEqual(ends[i - 1]);
      });
    }
  });

  it('reaches X0.1887 on the last real pass and repeats it as a spring pass', () => {
    const r = thread.generate(threadP, ctx);
    const plunges = r.lines.filter((l) => /^G0 X/.test(l) && words(l, 'X') < 0.25).map((l) => l.slice(4));
    expect(plunges.at(-1)).toBe('0.1887');
    expect(plunges.at(-2)).toBe('0.1887');
    expect(plunges.length).toBe(5);
  });
});

describe('groove', () => {
  it('parts off to X0.0000', () => {
    const r = groove.generate(grooveP, ctx);
    expect(r.ok).toBe(true);
    expect(r.lines.some((l) => l.startsWith('G1 X0.0000'))).toBe(true);
  });
});

describe('index', () => {
  it('goes forward to the next 120 deg position', () => {
    const r = index.generate({ divisions: 6, step: 2 }, { ...ctx, c0: 10 });
    expect(r.ok).toBe(true);
    expect(r.lines).toEqual([HEADER, 'M5', 'G0 C120.0000']);
  });
  it('goes forward to an absolute angle on the next turn', () => {
    const r = index.generate({ angle: 45 }, { ...ctx, c0: 400 });
    expect(r.lines.at(-1)).toBe('G0 C405.0000');
  });
  it('refuses a missing target', () => {
    expect(index.generate({}, ctx).ok).toBe(false);
  });
});

describe('review fixes', () => {
  const lastZBeforeM5 = (lines) => {
    const zs = lines.filter((l) => /^G0 Z/.test(l));
    return words(zs.at(-1), 'Z');
  };
  it('every moving cycle ends with the tool in front of the face (Z >= +0.05)', () => {
    expect(lastZBeforeM5(face.generate(faceP, ctx).lines)).toBeGreaterThanOrEqual(0.05);
    expect(lastZBeforeM5(turn.generate({ ...turnP, zStart: -0.5 }, ctx).lines)).toBeGreaterThanOrEqual(0.05);
    expect(lastZBeforeM5(groove.generate(grooveP, ctx).lines)).toBeGreaterThanOrEqual(0.05);
    expect(lastZBeforeM5(thread.generate(threadP, ctx).lines)).toBeGreaterThanOrEqual(0.05);
  });
  it('turn refuses a job that needs more than 500 roughing passes', () => {
    const r = turn.generate({ ...turnP, startDia: 2, finishDia: 0.25, step: 0.001 }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Too many passes \(\d+\): use a bigger depth per pass$/);
  });
});

import * as bore from '../src/cycles/bore.js';
import * as drill from '../src/cycles/drill.js';

describe('turn end chamfer and radius', () => {
  it('chamfers the start-end corner on the finish pass', () => {
    const r = turn.generate({ ...turnP, chamfer: 0.02 }, ctx);
    expect(r.ok).toBe(true);
    const i = r.lines.indexOf('G0 X0.7600');            // finishDia - 2 x chamfer
    expect(i).toBeGreaterThan(0);
    expect(r.lines[i + 1]).toBe('G1 Z0.0000 F1.5');
    expect(r.lines[i + 2]).toBe('G1 X0.8000 Z-0.0200 F1.5');
    expect(r.lines[i + 3]).toBe('G1 Z-0.5000 F1.5');
  });
  it('rounds the corner with a radius as 8 segments ending tangent to the diameter', () => {
    const r = turn.generate({ ...turnP, radius: 0.04 }, ctx);
    expect(r.ok).toBe(true);
    const i = r.lines.indexOf('G0 X0.7200');            // finishDia - 2 x radius
    const arc = r.lines.slice(i + 2, i + 10);
    expect(arc.length).toBe(8);
    expect(arc.at(-1)).toBe('G1 X0.8000 Z-0.0400 F1.5');
  });
  it('refuses chamfer and radius together, or one bigger than the length', () => {
    expect(turn.generate({ ...turnP, chamfer: 0.02, radius: 0.02 }, ctx).ok).toBe(false);
    expect(turn.generate({ ...turnP, chamfer: 0.6 }, ctx).ok).toBe(false);
  });
});

describe('bore', () => {
  const boreP = { startDia: 0.5, finishDia: 0.6, zStart: 0, length: 0.5, step: 0.02, finishAllow: 0.005, roughFeed: 2, finishFeed: 1, rpm: 30 };
  it('opens the hole outward, retracting -X before +Z', () => {
    const r = bore.generate(boreP, ctx);
    expect(r.ok).toBe(true);
    const cuts = r.lines.filter((l) => l.startsWith('G1') && l.includes('Z-0.5000'));
    expect(cuts.length).toBeGreaterThan(1);
    r.lines.forEach((l, k) => {
      if (l.startsWith('G1') && l.includes('Z-0.5000')) {
        expect(r.lines[k + 1]).toBe('G0 X0.4000');          // startDia - 2 x clearance
        expect(r.lines[k + 2]).toMatch(/^G0 Z0\.0500$/);
      }
    });
    expect(r.lines).toContain('G0 X0.6000');                 // finish pass diameter
    expect(r.lines.at(-1)).toBe('M5');
  });
  it('refuses a finish smaller than the hole or a bar that cannot retract', () => {
    expect(bore.generate({ ...boreP, finishDia: 0.4 }, ctx).ok).toBe(false);
    expect(bore.generate({ ...boreP, startDia: 0.08, finishDia: 0.2 }, ctx).ok).toBe(false);
  });
});

describe('drill', () => {
  it('pecks on center with full retracts', () => {
    const r = drill.generate({ zStart: 0, depth: 0.3, peck: 0.1, feed: 1, rpm: 30 }, ctx);
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('G0 X0.0000');
    const plunges = r.lines.filter((l) => l.startsWith('G1 Z')).map((l) => words(l, 'Z'));
    expect(plunges).toEqual([-0.1, -0.2, -0.3]);
    expect(r.lines.filter((l) => l === 'G0 Z0.0500').length).toBeGreaterThanOrEqual(3);
  });
  it('drills in one go when peck is 0', () => {
    const r = drill.generate({ zStart: 0, depth: 0.3, peck: 0, feed: 1, rpm: 30 }, ctx);
    expect(r.lines.filter((l) => l.startsWith('G1 Z'))).toEqual(['G1 Z-0.3000 F1']);
  });
});

describe('pass caps', () => {
  it('face and thread refuse more than 500 passes', () => {
    expect(face.generate({ ...faceP, depth: 1, step: 0.001 }, ctx).error).toMatch(/^Too many passes/);
    expect(thread.generate({ ...threadP, passes: 501 }, ctx).error).toMatch(/^Too many passes/);
  });
});

describe('review fixes: bore approach', () => {
  it('goes to a safe Z in front of the face before moving X into the hole', () => {
    const r = bore.generate({ startDia: 0.5, finishDia: 0.6, zStart: 0, length: 0.5, step: 0.02, finishAllow: 0.005, roughFeed: 2, finishFeed: 1, rpm: 30 }, ctx);
    expect(r.lines[2]).toBe('G0 Z0.0500');
    expect(r.lines[3]).toBe('G0 X0.4000');
  });
});
