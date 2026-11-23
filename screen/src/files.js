// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Files on the lathe's flash (LittleFS root), through the WebUI HTTP API.
// Upload: multipart POST /files, field "path" first, then the file part whose filename is the
// full path ("/x.nc") because grblHAL's http_upload opens that name directly.

// The ESP32 serves the screen and the file API on port 80. Served from somewhere else on the same host (the S9's
// revturn_web.py on :8000), the file API is on the page's own port.
const base = (host) => (typeof location !== 'undefined' && location.port && location.hostname === host
  ? `http://${host}:${location.port}` : `http://${host}`);

export async function listFiles(host, fetchImpl = fetch) {
  const r = await fetchImpl(`${base(host)}/files?path=%2F&action=list`);
  if (!r.ok) throw new Error('Could not list files on the lathe');
  const j = await r.json();
  return (j.files ?? []).map((f) => f.name);
}

// "960.00 KB" / "3.12 KB" / "500 B" / "1.20 MB" -> bytes (the WebUI file API reports sizes as text)
export function sizeBytes(text) {
  const m = /([\d.]+)\s*([KMG]?B)/i.exec(String(text ?? ''));
  if (!m) return 0;
  return Math.round(Number(m[1]) * { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[m[2].toUpperCase()]);
}

// the listing plus the flash size (Rev 2026-11-12: show the flash use in PROG): { files: [{ name, bytes, time }], total, used, pct }
export async function listFilesInfo(host, fetchImpl = fetch) {
  const r = await fetchImpl(`${base(host)}/files?path=%2F&action=list`);
  if (!r.ok) throw new Error('Could not list files on the lathe');
  const j = await r.json();
  const total = sizeBytes(j.total), used = sizeBytes(j.used);
  const pct = Number.isFinite(Number(j.occupation)) ? Number(j.occupation) : (total ? Math.round((100 * used) / total) : 0);
  return { files: (j.files ?? []).map((f) => ({ name: f.name, bytes: sizeBytes(f.size), time: f.time ?? null })), total, used, pct };
}

export async function uploadFile(host, name, text, fetchImpl = fetch) {
  const form = new FormData();
  form.append('path', '/');
  form.append('file', new Blob([text], { type: 'text/plain' }), `/${name}`);
  const r = await fetchImpl(`${base(host)}/files`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Upload of ${name} failed`);
  // the reply carries the new listing; a second listing costs the lathe another 2-3 s of silence with many files
  let names = null;
  try { const j = await r.json(); if (Array.isArray(j?.files)) names = j.files.map((f) => f.name); } catch { /* no listing in the reply */ }
  if (!names?.includes(name)) names = await listFiles(host, fetchImpl);
  if (!names.includes(name)) throw new Error(`Upload of ${name} did not reach the lathe`);
}

export async function deleteFile(host, name, fetchImpl = fetch) {
  const r = await fetchImpl(`${base(host)}/files?path=%2F&action=delete&filename=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(`Could not delete ${name}`);
}

export async function readFile(host, name, fetchImpl = fetch) {
  const r = await fetchImpl(`${base(host)}/${encodeURIComponent(name)}`);
  if (!r.ok) { const e = new Error(`Could not read ${name}`); e.status = r.status; throw e; }
  return r.text();
}

export const runLine = (name) => `$F=/${name}`;
