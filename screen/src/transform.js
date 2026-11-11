// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Program transforms applied before a run: tool offsets, dry run (air cut), stroke-limit check.
// G-code is read robustly: any case, spaces inside words ("Z -1.5"), compact words ("G0X1Z-2"),
// explicit "+" signs; text inside (comments) or after ";" is never touched or read.
import { fmt } from './cycles/common.js';

export const DRY_RUN_DZ = 0.5; // minimum lift, and the clearance kept above the face at the deepest point

const SEGMENTS = /(\([^)]*\)|;.*$)/;       // comments split out of a line
// Review 2026-11-10: also "X1." (Fanuc-style posts); the old pattern stopped before the dot and left it behind
const AXIS_WORD = /([XxZz])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

// Split a line into code / comment pieces; fn edits only code pieces.
const mapCode = (line, fn) => line.split(SEGMENTS).map((part, i) => (i % 2 ? part : fn(part))).join('');
const codeOf = (line) => line.split(SEGMENTS).filter((_, i) => i % 2 === 0).join(' ');

// G words in a code string, as numbers with their decimal part ("91.1" stays 91.1)
const gWords = (code) => [...code.matchAll(/[Gg]\s*0*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
const modeAfter = (code, absolute) => {
  for (const g of gWords(code)) {
    if (g === 91) absolute = false;
    if (g === 90) absolute = true;
  }
  return absolute;
};

// Rewrite the X and/or Z words of absolute moves. fn(axis, value) -> new value.
function mapXZ(lines, fn) {
  let absolute = true;
  return lines.map((line) => {
    absolute = modeAfter(codeOf(line), absolute);
    if (!absolute) return line;
    return mapCode(line, (code) => code.replace(AXIS_WORD, (m, axis, v) => {
      const out = fn(axis.toUpperCase(), Number(v));
      return out === Number(v) ? m : `${axis.toUpperCase()}${fmt(out)}`;
    }));
  });
}

// Tool offsets are relative to T1: offset = what T1 coordinates read when this tool's tip is at a
// known position, minus that position (see setup.touchOffset). To put the tip at v, command v + offset.
export function applyTool(lines, tool) {
  if (!tool || (!tool.dx && !tool.dz)) return lines;
  return mapXZ(lines, (axis, v) => (axis === 'X' ? v + (tool.dx || 0) : v + (tool.dz || 0)));
}

// Deepest absolute Z the program reaches (null if none)
export function minZ(lines) {
  let absolute = true, min = null;
  for (const line of lines) {
    const code = codeOf(line);
    absolute = modeAfter(code, absolute);
    if (!absolute) continue;
    for (const m of code.matchAll(AXIS_WORD)) if (m[1].toUpperCase() === 'Z') min = min === null ? Number(m[2]) : Math.min(min, Number(m[2]));
  }
  return min;
}

// How far a dry run lifts: at least DRY_RUN_DZ, and enough that the deepest point ends DRY_RUN_DZ above the face.
// tipDz (review 2026-11-10): the largest Z tool offset in the program. The lines are already in the T1 frame, so a
// tool whose tip sits tipDz lower would otherwise end tipDz inside the part.
export const dryRunLift = (lines, tipDz = 0) => Math.max(DRY_RUN_DZ, DRY_RUN_DZ - ((minZ(lines) ?? 0) - Math.max(0, tipDz)));

const SPINDLE_START = /[Mm]\s*0*[34](?![\d.])/;

// Air cut: everything moves +Z clear of the part and the spindle never starts.
export function dryRun(lines, dz = dryRunLift(lines)) {
  const shifted = mapXZ(lines, (axis, v) => (axis === 'Z' ? v + dz : v));
  return shifted.map((l) => (SPINDLE_START.test(codeOf(l)) ? `(DRY RUN: ${l.trim().replace(/[()]/g, '')} skipped)` : l));
}

// Commands a program may not contain: homing, machine coordinates, offset changes.
export function forbiddenWord(lines) {
  for (const line of lines) {
    for (const g of gWords(codeOf(line))) if ([28, 30, 53, 10, 92].includes(Math.trunc(g))) return `G${g}`;
  }
  return null;
}

// Fanuc-style stored stroke limits (work coordinates, X as diameter). Returns null or a message.
export function checkLimits(lines, limits) {
  if (!limits?.enabled) return null; // LIMITS switch off
  let absolute = true, x = null, z = null;
  for (let i = 0; i < lines.length; i++) {
    const code = codeOf(lines[i]);
    absolute = modeAfter(code, absolute);
    if (/^\s*\$/.test(code) || gWords(code).some((g) => g === 10 || g === 92 || g === 4)) continue; // not motion
    for (const m of code.matchAll(AXIS_WORD)) {
      const v = Number(m[2]);
      if (m[1].toUpperCase() === 'X') x = absolute ? v : (x ?? 0) + v;
      else z = absolute ? v : (z ?? 0) + v;
    }
    const n = i + 1;
    if (x !== null && x > limits.xMax + 1e-9) return `OVERTRAVEL X+ at line ${n} (X${fmt(x)} > X max ${limits.xMax})`;
    if (x !== null && x < limits.xMin - 1e-9) return `OVERTRAVEL X- at line ${n} (X${fmt(x)} < X min ${limits.xMin})`;
    if (z !== null && z > limits.zMax + 1e-9) return `OVERTRAVEL Z+ at line ${n} (Z${fmt(z)} > Z max ${limits.zMax})`;
    if (z !== null && z < limits.zMin - 1e-9) return `OVERTRAVEL Z- at line ${n} (Z${fmt(z)} < Z min ${limits.zMin})`;
  }
  return null;
}

// Where C ends up after these lines, starting from c0 (work degrees). Spindle-mode turns (M3/M4) do not
// count in C, so only C words move it. G10/G92/G4 and $ lines are not motion.
const C_WORD = /[Cc]\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
export function endC(lines, c0 = 0) {
  let absolute = true, c = c0;
  for (const line of lines) {
    const code = codeOf(line);
    absolute = modeAfter(code, absolute);
    if (/^\s*\$/.test(code) || gWords(code).some((g) => g === 10 || g === 92 || g === 4)) continue;
    for (const m of code.matchAll(C_WORD)) c = absolute ? Number(m[1]) : c + Number(m[1]);
  }
  return c;
}

// Rev 2026-11-09: end every program with C back at 0, the nearest whole turn (at most half a turn of
// travel; the DRO shows C modulo 360 so it reads 0.00). Goes before a trailing M30 / M2.
// wrap: grblHAL rotary wrap is on ($538) and G28 is stored on C zero, so G91 G28 C0 goes the short way AND
// resets the firmware's C count (it never grows). Otherwise G0 to the nearest whole turn.
export function returnC(lines, c0 = 0, wrap = false) {
  const c = endC(lines, c0);
  const home = Math.round(c / 360) * 360 || 0;
  const moved = lines.some((l) => /[Cc]\s*[-+]?\d*\.?\d/.test(codeOf(l)));
  if (Math.abs(c - home) < 1e-6 && !(wrap && moved)) return lines;
  const ret = wrap ? ['(RETURN C TO 0)', 'M5', 'G91 G28 C0', 'G90'] : ['(RETURN C TO 0)', 'M5', `G90 G0 C${fmt(home)}`];
  const last = codeOf(lines.at(-1) ?? '').trim().toUpperCase();
  return /^M0*(30|2)$/.test(last) ? [...lines.slice(0, -1), ...ret, lines.at(-1)] : [...lines, ...ret];
}
