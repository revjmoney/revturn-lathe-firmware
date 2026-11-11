// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Rev 2026-11-09: stream the running program's g-code into the console. grblHAL runs the file from flash
// ($F=) and reports the executing line as Ln: in status reports; the screen reads the same file back.
import { describe, it, expect, vi } from 'vitest';
import { createRunLog } from '../src/runlog.js';
import { parseStatus } from '../src/status.js';

const FILE = ['G7 G20 G90', '(STEP 1: face)', 'M3 S30', 'G1 X1 F5', '', 'G1 Z-1', 'M5', 'M30'];
const setup = (text = FILE.join('\n') + '\n') => {
  const out = [];
  const fetchLines = vi.fn(async () => text.split('\n'));
  const log = createRunLog({ fetchLines, emit: (t, kind) => out.push(kind ? `${kind}:${t}` : t) });
  return { out, fetchLines, log };
};
const run = (ln, file = '/smoke.nc') => ({ sd: { pct: 10, file }, ln });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('status Ln', () => {
  it('parses the executing line number', () => {
    expect(parseStatus('<Run|MPos:0,0,0,0|Ln:8|FS:25,0|SD:10.3,smoke_test_10min.nc>').ln).toBe(8);
    expect(parseStatus('<Idle|MPos:0,0,0,0>').ln).toBe(null);
  });
});

describe('run log', () => {
  it('prints each line once as Ln moves on, skipping blank lines', async () => {
    const { out, log } = setup();
    log.onStatus(run(3)); await flush();
    log.onStatus(run(3)); await flush();
    log.onStatus(run(6)); await flush();
    expect(out).toEqual(['note:(running smoke.nc)', '1  G7 G20 G90', '2  (STEP 1: face)', '3  M3 S30', '4  G1 X1 F5', '6  G1 Z-1']);
  });

  it('reads the file from the lathe once per run', async () => {
    const { log, fetchLines } = setup();
    log.onStatus(run(1)); log.onStatus(run(2)); await flush();
    log.onStatus(run(4)); await flush();
    expect(fetchLines).toHaveBeenCalledTimes(1);
    expect(fetchLines).toHaveBeenCalledWith('smoke.nc');
  });

  it('says when the run ends, and a new run of the same file starts over (re-reading it)', async () => {
    const { out, log, fetchLines } = setup();
    log.onStatus(run(2)); await flush();
    log.onStatus({ sd: null, ln: null }); await flush();
    log.onStatus({ sd: null, ln: null }); await flush();
    expect(out.filter((l) => l === 'note:(program ended)').length).toBe(1);
    out.length = 0;
    log.onStatus(run(1)); await flush();
    expect(out).toEqual(['note:(running smoke.nc)', '1  G7 G20 G90']);
    expect(fetchLines).toHaveBeenCalledTimes(2);
  });

  it('a big jump (reloaded mid-run, or fast lines) still prints every line (Rev: don\'t skip anything)', async () => {
    const text = Array.from({ length: 300 }, (_, i) => `G1 X${i}`).join('\n');
    const { out, log } = setup(text);
    log.onStatus(run(250)); await flush();
    expect(out.length).toBe(1 + 250);
    expect(out[1]).toBe('1  G1 X0');
    expect(out.at(-1)).toBe('250  G1 X249');
  });

  it('cannot read the file: one note, no lines, no retry storm', async () => {
    const out = [];
    const fetchLines = vi.fn(async () => { throw new Error('404'); });
    const log = createRunLog({ fetchLines, emit: (t, kind) => out.push(kind ? `${kind}:${t}` : t) });
    log.onStatus(run(2)); await flush();
    log.onStatus(run(5)); await flush();
    expect(fetchLines).toHaveBeenCalledTimes(1);
    expect(out).toEqual(['note:(running smoke.nc)', 'note:(could not read smoke.nc to show its lines)']);
  });
});
