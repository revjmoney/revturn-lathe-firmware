// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { sanitizeImport } from '../src/program.js';

describe('sanitizeImport (Fusion lathe post)', () => {
  it('strips % and O-number lines and blank lines, keeps the code', () => {
    const r = sanitizeImport('%\nO1001 (PART)\nG7 G18 G20\n\nG0 X1 Z0.1\nM30\n%\n');
    expect(r.text).toBe('G7 G18 G20\nG0 X1 Z0.1\nM30');
    expect(r.warnings).toEqual([]);
  });
  it('warns when the file is not diameter mode or not inches', () => {
    const r = sanitizeImport('G18 G21\nG0 X1');
    expect(r.warnings).toEqual(['No G7: X may be radius, not diameter', 'Not G20 inches: check the post units']);
  });
  it('refuses an empty file', () => {
    expect(sanitizeImport('%\n%').error).toBe('The file has no g-code');
  });
});
