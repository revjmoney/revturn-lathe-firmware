// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect } from 'vitest';
import { toolpath } from '../src/ui/preview.js';

describe('toolpath', () => {
  it('turns G0/G1 lines into points with modal X and Z', () => {
    expect(toolpath(['G0 X1 Z0.1', 'G1 Z-0.5'])).toEqual([
      { x: 1, z: 0.1, rapid: true },
      { x: 1, z: -0.5, rapid: false },
    ]);
  });

  it('ignores C, comments, and lines without X or Z', () => {
    const pts = toolpath(['G7 G18 G20 G90 G94', '(STEP 1: face)', 'M3 S30', 'G0 X1', 'G0 Z0', 'G1 Z-0.5 C4320 F1.5', 'G0 C120']);
    expect(pts).toEqual([
      { x: 1, z: 0, rapid: true },
      { x: 1, z: 0, rapid: true },
      { x: 1, z: -0.5, rapid: false },
    ]);
  });
});
