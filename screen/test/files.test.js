// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect, vi } from 'vitest';
import { uploadFile, listFiles, deleteFile, readFile, runLine } from '../src/files.js';

const listing = (names) => ({ ok: true, json: async () => ({ files: names.map((name) => ({ name, size: '1 B' })), status: 'ok' }) });

describe('files', () => {
  it('uploads as multipart with path / first and the file named /<name>', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, opts) => {
      calls.push({ url, opts });
      return opts?.method === 'POST' ? { ok: true, json: async () => ({ status: 'ok' }) } : listing(['x.nc']);
    });
    await uploadFile('lathe', 'x.nc', 'G0 X1\n', fetchImpl);
    const post = calls[0];
    expect(post.url).toBe('http://lathe/files');
    expect(post.opts.method).toBe('POST');
    const entries = [...post.opts.body.entries()];
    expect(entries[0]).toEqual(['path', '/']);
    expect(entries[1][1].name).toBe('/x.nc');
    expect(await entries[1][1].text()).toBe('G0 X1\n');
    expect(calls[1].url).toContain('/files?path=%2F&action=list');
  });

  it('throws when the file does not show up after upload', async () => {
    const fetchImpl = async (url, opts) => (opts?.method === 'POST' ? { ok: true, json: async () => ({}) } : listing([]));
    await expect(uploadFile('lathe', 'x.nc', 'x', fetchImpl)).rejects.toThrow('x.nc');
  });

  it('lists file names', async () => {
    expect(await listFiles('lathe', async () => listing(['a.json', 'a.nc']))).toEqual(['a.json', 'a.nc']);
  });

  it('deletes by name', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'ok' }) }));
    await deleteFile('lathe', 'a.nc', fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://lathe/files?path=%2F&action=delete&filename=a.nc');
  });

  it('reads a file', async () => {
    expect(await readFile('lathe', 'a.json', async (u) => ({ ok: true, text: async () => `got ${u}` }))).toBe('got http://lathe/a.json');
  });

  it('runs a file from flash', () => {
    expect(runLine('x.nc')).toBe('$F=/x.nc');
  });
});
