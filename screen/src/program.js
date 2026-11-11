// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// A program is an ordered list of cycle steps (or raw g-code), compiled into one .nc file.
import * as face from './cycles/face.js';
import * as turn from './cycles/turn.js';
import * as thread from './cycles/thread.js';
import * as groove from './cycles/groove.js';
import * as index from './cycles/index.js';
import * as bore from './cycles/bore.js';
import * as drill from './cycles/drill.js';
import * as polygon from './cycles/polygon.js';
import { HEADER } from './cycles/common.js';
import { applyTool, forbiddenWord } from './transform.js';
import { toolById } from './setup.js';

export const CYCLES = { face, turn, bore, thread, groove, drill, polygon, index };

// Manual tool change (QCTP): spindle off, say which tool, program stop. GO resumes.
export function toolChange(tool) {
  // parentheses inside the message would end the comment early and run the rest as g-code
  const desc = String(tool.desc ?? '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  return ['M5', `(MSG, CHANGE TO T${tool.n}${desc ? ' ' + desc : ''})`, 'M0'];
}

// Clean a Fusion (or other) lathe post file for a PROG g-code step.
export function sanitizeImport(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && l !== '%' && !/^O\d+/i.test(l));
  if (!lines.length) return { error: 'The file has no g-code' };
  const all = lines.join(' ').toUpperCase();
  const warnings = [];
  if (!/\bG0?7\b/.test(all)) warnings.push('No G7: X may be radius, not diameter');
  if (!/\bG20\b/.test(all)) warnings.push('Not G20 inches: check the post units');
  return { text: lines.join('\n'), warnings };
}

// Review 2026-11-10: a program opened from the lathe is data from the network. Its name goes into file names and a
// "$F=/<name>.nc" line, so it is reduced to safe characters; steps must be a list of { cycle, params }.
export function checkProgram(obj, fallbackName) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.steps)) return { ok: false, error: 'Not a REVTURN program file (no steps)' };
  for (const [i, st] of obj.steps.entries()) {
    if (!st || typeof st.cycle !== 'string' || (st.params !== undefined && (typeof st.params !== 'object' || st.params === null))) {
      return { ok: false, error: `Program file step ${i + 1} is damaged` };
    }
  }
  return { ok: true, program: { ...obj, name: safeName(typeof obj.name === 'string' ? obj.name : fallbackName) } };
}

export function safeName(name) {
  const s = String(name ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return s || 'program';
}

const lastC = (lines, c) => {
  for (const l of lines) {
    const m = l.match(/\bC(-?[0-9.]+)/);
    if (m && !l.startsWith('(')) c = Math.max(c, Number(m[1]));
  }
  return c;
};

export function compileProgram(program, ctx) {
  if (!program?.steps?.length) return { ok: false, error: 'Program has no steps' };
  const out = [...HEADER];
  let c = ctx.c0 ?? 0;
  const setup = ctx.setup;
  let current = setup?.activeTool ?? null;
  for (let i = 0; i < program.steps.length; i++) {
    const { cycle, params } = program.steps[i];
    let lines;
    if (cycle === 'gcode') {
      lines = String(params?.text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const bad = forbiddenWord(lines);
      if (bad) return { ok: false, stepIndex: i, error: `Step ${i + 1}: ${bad} not allowed in a program (no homing, machine coordinates or offset changes)` };
    } else {
      const mod = CYCLES[cycle];
      if (!mod) return { ok: false, stepIndex: i, error: `Step ${i + 1}: unknown cycle ${cycle}` };
      const r = mod.generate(params ?? {}, { ...ctx, c0: c });
      if (!r.ok) return { ok: false, stepIndex: i, error: `Step ${i + 1}: ${r.error}` };
      lines = r.lines.filter((l) => !HEADER.includes(l));
    }
    if (setup && cycle !== 'index') { // imported g-code runs in the chosen tool's frame too
      const tool = toolById(setup, params?.tool ?? current ?? 1);
      if (tool.n !== current) { out.push(...toolChange(tool)); current = tool.n; }
      lines = applyTool(lines, tool);
    }
    c = lastC(lines, c);
    out.push(`(STEP ${i + 1}: ${cycle})`, ...lines);
    // Review 2026-11-10: imported g-code may leave G21 / G91 / G8 / G93 behind; cycles assume the header modes
    if (cycle === 'gcode' && i < program.steps.length - 1) out.push(...HEADER);
  }
  if (out.at(-1) !== 'M5') out.push('M5');
  out.push('M30');
  return { ok: true, lines: out };
}
