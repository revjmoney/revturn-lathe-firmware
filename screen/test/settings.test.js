// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { T, parseGroup, parseSetting, parseValue, parseDescr, parseAxes, checkValue, sameValue, inchHint, groupTree } from '../src/settings.js';

// the lathe's own $EG + $ES output (2026-11-11)
const lines = readFileSync(new URL('./fixtures/grblhal-settings.txt', import.meta.url), 'utf8').split(/\r?\n/).filter(Boolean);
const groups = lines.map(parseGroup).filter(Boolean);
const settings = lines.map(parseSetting).filter(Boolean);

describe('parsing the lathe\'s own setting list', () => {
  it('reads every group and setting', () => {
    expect(groups.length).toBe(19);
    expect(settings.length).toBe(128);
    expect(groups.find((g) => g.id === 16)).toEqual({ id: 16, parent: 15, name: 'WiFi' });
  });
  it('reads types, units, limits and choice labels', () => {
    const s = (id) => settings.find((x) => x.id === id);
    expect(s(110)).toMatchObject({ group: 44, name: 'X-axis maximum rate', unit: 'mm/min', type: T.DEC });
    expect(s(32)).toMatchObject({ type: T.RADIO, labels: ['Normal', 'Laser mode', 'Lathe mode'] });
    expect(s(75)).toMatchObject({ type: T.PASS, min: 8, max: 32 });
    expect(s(395)).toMatchObject({ reboot: true });
    expect(s(14).labels.at(-1)).toBe('EStop');
  });
  it('reads values, help text and the axis letters', () => {
    expect(parseValue('$110=635.000')).toEqual({ id: 110, value: '635.000' });
    expect(parseValue('$74=My Net')).toEqual({ id: 74, value: 'My Net' });
    expect(parseDescr('[SETTINGDESCR:110|Maximum rate. Used as G0 rapid rate.]')).toEqual({ id: 110, text: 'Maximum rate. Used as G0 rapid rate.' });
    expect(parseAxes('[AXS:4:XYZC]')).toBe('XYZC');
    expect(parseValue('ok')).toBe(null);
  });
  it('orders groups with children under their parent and drops empty ones', () => {
    const tree = groupTree(groups, settings);
    const names = tree.map((g) => g.name);
    expect(names.indexOf('WiFi')).toBe(names.indexOf('Networking') + 1);
    expect(tree.find((g) => g.name === 'X-axis').depth).toBe(1);
    expect(names).not.toContain('Root');
    // every setting has a group on the list
    const shown = new Set(tree.map((g) => g.id));
    expect(settings.every((s) => shown.has(s.group))).toBe(true);
  });
});

describe('checking typed values', () => {
  const dec = { type: T.DEC, min: 2, max: null };
  it('numbers, ranges and on/off', () => {
    expect(checkValue(dec, ' 5.5 ')).toEqual({ ok: true, value: '5.5' });
    expect(checkValue(dec, '1').ok).toBe(false);
    expect(checkValue(dec, 'abc').ok).toBe(false);
    expect(checkValue({ type: T.BOOL }, '1').ok).toBe(true);
    expect(checkValue({ type: T.BOOL }, '2').ok).toBe(false);
    expect(checkValue({ type: T.INT, min: null, max: 65535 }, '70000').ok).toBe(false);
  });
  it('text, passwords and IP addresses', () => {
    expect(checkValue({ type: T.PASS, min: 8, max: 32 }, 'short').ok).toBe(false);
    expect(checkValue({ type: T.STR, min: null, max: 64 }, 'a\nb').ok).toBe(false);
    expect(checkValue({ type: T.IP }, '192.168.1.10').ok).toBe(true);
    expect(checkValue({ type: T.IP }, '192.168.1.300').ok).toBe(false);
  });
  it('treats 635 and 635.000 as the same, and gives inch hints', () => {
    expect(sameValue({ type: T.DEC }, '635', '635.000')).toBe(true);
    expect(inchHint('mm/min', '635')).toBe('25.0 ipm');
    expect(inchHint('mm', '25.4')).toBe('1.0000 in');
    expect(inchHint('microseconds', '5')).toBe('');
  });
});
