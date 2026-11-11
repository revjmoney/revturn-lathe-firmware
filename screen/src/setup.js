// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Shared machine setup stored on the lathe as /setup.json: tool table (offsets relative to T1),
// stroke limits (work coordinates, X as diameter, inches) and the active tool.
import { readFile, uploadFile } from './files.js';

export const SETUP_FILE = 'setup.json';
export const N_TOOLS = 8;
// enabled: the LIMITS switch. Off by default (Rev 2026-11-09); old setup.json files without it load as off.
const DEFAULT_LIMITS = { enabled: false, xMax: 3, xMin: -0.05, zMax: 3, zMin: -4 }; // Z max leaves room for dry-run lifts

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function defaultSetup() {
  return {
    tools: Array.from({ length: N_TOOLS }, (_, i) => ({ n: i + 1, desc: i === 0 ? 'T1 reference' : '', dx: 0, dz: 0 })),
    limits: { ...DEFAULT_LIMITS },
    activeTool: 1,
  };
}

export function normalizeSetup(raw) {
  const d = defaultSetup();
  const tools = d.tools.map((t, i) => {
    const r = raw?.tools?.find?.((x) => x?.n === t.n) ?? raw?.tools?.[i];
    if (!r || i === 0) return { ...t, desc: (i === 0 ? r?.desc : null) || t.desc };
    return { n: t.n, desc: String(r.desc ?? ''), dx: num(r.dx, 0), dz: num(r.dz, 0) };
  });
  const l = raw?.limits ?? {};
  const limits = { enabled: l.enabled === true, xMax: num(l.xMax, d.limits.xMax), xMin: num(l.xMin, d.limits.xMin), zMax: num(l.zMax, d.limits.zMax), zMin: num(l.zMin, d.limits.zMin) };
  const at = Number.isInteger(raw?.activeTool) && raw.activeTool >= 1 && raw.activeTool <= N_TOOLS ? raw.activeTool : 1;
  return { tools, limits, activeTool: at };
}

export const toolById = (setup, n) => setup.tools.find((t) => t.n === n) ?? setup.tools[0];

// Touch-off: with a tool touching a known diameter (or face), its offset is the T1-frame reading minus
// the true value. Same rule for X (diameter) and Z.
export const touchOffset = (readingT1, trueValue) => readingT1 - trueValue;

export async function loadSetup(host, fetchImpl) {
  // Only a missing file means "first run, use defaults". Any other failure throws, so the caller keeps
  // the setup it has instead of silently zeroing the tool table.
  let text;
  try {
    text = await readFile(host, SETUP_FILE, fetchImpl);
  } catch (err) {
    if (err.status === 404) return defaultSetup();
    throw err;
  }
  return normalizeSetup(JSON.parse(text));
}

export async function saveSetup(host, setup, fetchImpl) {
  await uploadFile(host, SETUP_FILE, JSON.stringify(normalizeSetup(setup), null, 1), fetchImpl);
}
