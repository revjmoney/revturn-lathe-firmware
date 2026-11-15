// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Rev 2026-11-12: PROG shows a glowing flash gauge and a DOS DIR /W style list.
import { describe, it, expect } from 'vitest';
import { sizeBytes, listFilesInfo } from '../src/files.js';
import { gaugeHtml, dirwHtml, dirFooterHtml, dosDate } from '../src/ui/dirw.js';

describe('flash info', () => {
  it('reads the WebUI size text', () => {
    expect(sizeBytes('960.00 KB')).toBe(983040);
    expect(sizeBytes('500 B')).toBe(500);
    expect(sizeBytes('1.50 MB')).toBe(1572864);
    expect(sizeBytes(undefined)).toBe(0);
  });
  it('lists files with sizes plus the flash total, used and percent', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ total: '960.00 KB', used: '508.00 KB', occupation: '52', files: [{ name: 'a.json', size: '1.00 KB' }] }) });
    const info = await listFilesInfo('lathe', fetchImpl);
    expect(info).toEqual({ files: [{ name: 'a.json', bytes: 1024, time: null }], total: 983040, used: 520192, pct: 52 });
  });
});

describe('gauge and DIR /W', () => {
  it('the gauge shows the percent and turns amber, then red, as the flash fills', () => {
    expect(gaugeHtml({ total: 1000, used: 520, pct: 52 })).toMatch(/52%/);
    expect(gaugeHtml({ pct: 52 })).toMatch(/#7fffb0/);
    expect(gaugeHtml({ pct: 80 })).toMatch(/#ffb347/);
    expect(gaugeHtml({ pct: 95 })).toMatch(/#ff5a4a/);
  });
  it('DIR lines: the full long name, its size with commas, the selection marked', () => {
    document.body.innerHTML = dirwHtml([{ name: 'shaft', bytes: 1234 }, { name: 'a_very_long_part_name_v2', bytes: 45312 }], 'shaft');
    const cells = [...document.querySelectorAll('[data-prog-item]')];
    expect(cells.map((c) => c.querySelector('.dwn').textContent)).toEqual(['shaft', 'a_very_long_part_name_v2']);
    expect(cells.map((c) => c.querySelector('.dws').textContent)).toEqual(['1,234', '45,312']);
    expect(cells[0].classList.contains('sel')).toBe(true);
    expect(dirwHtml([], null)).toMatch(/No programs/);
  });
  it('the save date shows DOS style, the full time on hover', () => {
    expect(dosDate('2026-11-11T18:18:05')).toBe('11-11-26');
    expect(dosDate('1970-01-01T00:00:12')).toBe('--------');   // saved before the clock was set
    document.body.innerHTML = dirwHtml([{ name: 'shaft', bytes: 10, time: '2026-11-11T18:18:05' }], null);
    expect(document.querySelector('.dwd').textContent).toBe('11-11-26');
    expect(document.querySelector('.dw').title).toMatch(/saved 2026-11-11 18:18:05/);
  });
  it('the DOS footer counts programs, bytes and free space', () => {
    const f = dirFooterHtml(12, 45312, 460800);
    expect(f).toMatch(/12 program\(s\)\s+45,312 bytes/);
    expect(f).toMatch(/460,800 bytes free/);
  });
});

describe('lathe clock', () => {
  it('local time for $RTC= in the form grblHAL reads', async () => {
    const { localIso } = await import('../src/app.js');
    expect(localIso(new Date(2026, 10, 12, 9, 5, 7))).toBe('2026-11-12T09:05:07');
  });
});

