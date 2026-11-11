// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { parseStatus } from '../src/status.js';

describe('parseStatus', () => {
  it('parses an idle report from the real lathe', () => {
    const s = parseStatus('<Idle|MPos:0.000,0.000,0.000,0.000|Bf:100,1022|FS:0,0,0|S:0|Ov:100,100,100|A:|Sc:|TLR:0>');
    expect(s.state).toBe('Idle');
    expect(s.sub).toBe(null);
    expect(s.mpos).toEqual([0, 0, 0, 0]);
    expect(s.spindle).toBe('off');
    expect(s.ov).toEqual([100, 100, 100]);
    expect(s.diameter).toBe(false);
  });

  it('computes work position from MPos and WCO, reads rpm, spindle and diameter flag', () => {
    const s = parseStatus('<Run|MPos:12.700,0,-25.400,90|WCO:2.540,0,0,0|FS:76.2,40|A:S|D:1>');
    expect(s.wpos[0]).toBeCloseTo(10.16, 6);
    expect(s.wpos[2]).toBeCloseTo(-25.4, 6);
    expect(s.wpos[3]).toBeCloseTo(90, 6);
    expect(s.feed).toBeCloseTo(76.2, 6);
    expect(s.rpm).toBe(40);
    expect(s.spindle).toBe('cw');
    expect(s.diameter).toBe(true);
  });

  it('reads counter-clockwise spindle', () => {
    expect(parseStatus('<Run|MPos:0,0,0,0|A:C>').spindle).toBe('ccw');
  });

  it('splits a state with a sub-state', () => {
    const s = parseStatus('<Hold:0|MPos:0,0,0,0>');
    expect(s.state).toBe('Hold');
    expect(s.sub).toBe('0');
  });

  it('keeps the previous WCO when a report omits it', () => {
    const a = parseStatus('<Idle|MPos:5,0,0,0|WCO:1,0,2,0>');
    const b = parseStatus('<Idle|MPos:6,0,0,0>', a);
    expect(b.wco).toEqual([1, 0, 2, 0]);
    expect(b.wpos).toEqual([5, 0, -2, 0]);
  });

  it('keeps the diameter flag from earlier reports (grblHAL only sends D: when it changes)', () => {
    const a = parseStatus('<Idle|MPos:0,0,0,0|D:1>');
    expect(parseStatus('<Idle|MPos:0,0,0,0>', a).diameter).toBe(true);
    const b = parseStatus('<Idle|MPos:0,0,0,0|D:0>', a);
    expect(b.diameter).toBe(false);
  });

  it('derives MPos from WPos when only WPos is reported', () => {
    const a = parseStatus('<Idle|MPos:0,0,0,0|WCO:1,0,0,0>');
    const b = parseStatus('<Idle|WPos:3,0,0,0>', a);
    expect(b.wpos[0]).toBe(3);
    expect(b.mpos[0]).toBe(4);
  });

  it('returns null for something that is not a status report', () => {
    expect(parseStatus('ok')).toBe(null);
  });
});

describe('file-run progress', () => {
  it('reads |SD:pct,file while a program runs', () => {
    const s = parseStatus('<Run|MPos:0,0,0,0|SD:42.5,/part.nc>');
    expect(s.sd).toEqual({ pct: 42.5, file: '/part.nc' });
    expect(parseStatus('<Idle|MPos:0,0,0,0>').sd).toBe(null);
  });
});

describe('spindle state (A:) carries over', () => {
  it('keeps the last spindle state when a report has no A: field', async () => {
    const { parseStatus } = await import('../src/status.js');
    const on = parseStatus('<Idle|MPos:0,0,0,0|A:S>');
    expect(on.spindle).toBe('cw');
    expect(parseStatus('<Idle|MPos:0,0,0,0>', on).spindle).toBe('cw');
  });
  it('an empty A: means everything is off', async () => {
    const { parseStatus } = await import('../src/status.js');
    const on = parseStatus('<Idle|MPos:0,0,0,0|A:S>');
    expect(parseStatus('<Idle|MPos:0,0,0,0|A:>', on).spindle).toBe('off');
  });
});
