// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Everything between "the form is filled in" and "the file goes to the lathe":
// generate -> tool offset (+ tool-change stops) -> stroke limits -> dry run (+ limits again).
import { CYCLES, compileProgram, toolChange } from './program.js';
import { HEADER } from './cycles/common.js';
import { applyTool, dryRun, checkLimits, dryRunLift, returnC } from './transform.js';
import { toolById } from './setup.js';

const WAIT_RPM = 'Waiting for machine settings ($30): try again in a moment';

function finish(lines, ctx, homeC = true, tipDz = 0) {
  if (homeC) lines = returnC(lines, ctx.c0 ?? 0, ctx.cWrap === true); // C back to 0 at the end (not after INDEX)
  const limits = ctx.setup?.limits;
  const over = checkLimits(lines, limits);
  if (over) return { ok: false, error: over };
  if (!ctx.dryRun) return { ok: true, lines };
  const dz = dryRunLift(lines, tipDz);
  const dry = [`(DRY RUN: Z +${Number(dz.toFixed(4))}, spindle off)`, ...dryRun(lines, dz)];
  const overDry = checkLimits(dry, limits);
  if (overDry) return { ok: false, error: `${overDry} (dry run)` };
  return { ok: true, lines: dry };
}

export function prepareCycle(cycle, params, ctx) {
  if (ctx.maxRpm == null) return { ok: false, error: WAIT_RPM };
  const mod = CYCLES[cycle];
  if (!mod) return { ok: false, error: `Unknown cycle ${cycle}` };
  const r = mod.generate(params, ctx);
  if (!r.ok) return r;
  let lines = r.lines;
  if (ctx.setup && cycle !== 'index') {
    const tool = toolById(ctx.setup, params.tool ?? ctx.setup.activeTool);
    lines = applyTool(lines, tool);
    if (tool.n !== ctx.setup.activeTool) {
      lines = [lines[0], ...toolChange(tool), ...lines.slice(1)];
    }
  }
  const tipDz = ctx.setup && cycle !== 'index' ? toolById(ctx.setup, params.tool ?? ctx.setup.activeTool).dz || 0 : 0;
  return finish(lines, ctx, cycle !== 'index', tipDz);
}

export function prepareProgram(program, ctx) {
  if (ctx.maxRpm == null) return { ok: false, error: WAIT_RPM };
  const r = compileProgram(program, ctx);
  if (!r.ok) return r;
  // largest Z offset of every tool the program uses (steps without a tool use the one before, or the active tool)
  let cur = ctx.setup?.activeTool ?? 1, tipDz = 0;
  for (const st of program.steps ?? []) {
    if (st.cycle === 'index' || !ctx.setup) continue;
    cur = st.params?.tool ?? cur;
    tipDz = Math.max(tipDz, toolById(ctx.setup, cur).dz || 0);
  }
  return finish(r.lines, ctx, program.steps?.at(-1)?.cycle !== 'index', tipDz);
}

export { HEADER };
