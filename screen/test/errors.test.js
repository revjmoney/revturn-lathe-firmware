// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { describe as explain } from '../src/errors.js';

describe('errors.describe', () => {
  it('explains grbl error and alarm codes', () => {
    expect(explain('error:20')).toBe('error:20 Unsupported command');
    expect(explain('ALARM:1')).toBe('ALARM:1 Hard limit');
    expect(explain('error:9')).toBe('error:9 Locked (alarm or jog): send $X to unlock');
  });
  it('passes unknown codes and other lines through', () => {
    expect(explain('error:999')).toBe('error:999');
    expect(explain('ok')).toBe('ok');
  });
});
