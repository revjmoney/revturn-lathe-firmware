// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Files on the lathe's flash (LittleFS root), through the WebUI HTTP API.
// Upload: multipart POST /files, field "path" first, then the file part whose filename is the
// full path ("/x.nc") because grblHAL's http_upload opens that name directly.

const base = (host) => `http://${host}`;

export async function listFiles(host, fetchImpl = fetch) {
  const r = await fetchImpl(`${base(host)}/files?path=%2F&action=list`);
  if (!r.ok) throw new Error('Could not list files on the lathe');
  const j = await r.json();
  return (j.files ?? []).map((f) => f.name);
}

export async function uploadFile(host, name, text, fetchImpl = fetch) {
  const form = new FormData();
  form.append('path', '/');
  form.append('file', new Blob([text], { type: 'text/plain' }), `/${name}`);
  const r = await fetchImpl(`${base(host)}/files`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Upload of ${name} failed`);
  const names = await listFiles(host, fetchImpl);
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
