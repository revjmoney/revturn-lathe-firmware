// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LatheLink, splitLines } from '../src/link.js';

class FakeSocket {
  static instances = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    this.readyState = 0;
    FakeSocket.instances.push(this);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  // test helpers
  open() { this.readyState = 1; this.onopen?.({}); }
  recv(text) { this.onmessage?.({ data: new TextEncoder().encode(text).buffer }); }
  recvText(text) { this.onmessage?.({ data: text }); }
  drop() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
}

const bytes = (data) => Array.from(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer ?? data));

describe('splitLines', () => {
  it('returns complete lines and keeps the partial rest', () => {
    expect(splitLines('', '<Idle|MPos:0,0,0,0>\r\nok\r\n<Ru')).toEqual({
      lines: ['<Idle|MPos:0,0,0,0>', 'ok'],
      rest: '<Ru',
    });
  });

  it('drops empty lines', () => {
    expect(splitLines('', '\r\n\r\nok\n').lines).toEqual(['ok']);
  });
});

describe('LatheLink', () => {
  beforeEach(() => { FakeSocket.instances = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const link = new LatheLink('ws://lathe:81/', { WebSocketImpl: FakeSocket, reconnectMs: 2000 });
    link.connect();
    const ws = FakeSocket.instances.at(-1);
    return { link, ws };
  };

  it('opens with the webui-v3 subprotocol and binary frames', () => {
    const { ws } = make();
    expect(ws.protocols).toEqual(['webui-v3']);
    expect(ws.binaryType).toBe('arraybuffer');
  });

  it('assembles a status report split across two frames into one status event', () => {
    const { link, ws } = make();
    const got = [];
    link.addEventListener('status', (e) => got.push(e.detail));
    ws.open();
    ws.recv('<Ru');
    expect(got).toEqual([]);
    ws.recv('n|MPos:1,0,0,0>\r\n');
    expect(got).toEqual(['<Run|MPos:1,0,0,0>']);
  });

  it('routes status reports to status and other lines to line', () => {
    const { link, ws } = make();
    const status = [], lines = [];
    link.addEventListener('status', (e) => status.push(e.detail));
    link.addEventListener('line', (e) => lines.push(e.detail));
    ws.open();
    ws.recv('<Idle|MPos:0,0,0,0>\r\nok\r\n<Idle|MPos:1,0,0,0>\r\nerror:20\r\n');
    expect(status).toEqual(['<Idle|MPos:0,0,0,0>', '<Idle|MPos:1,0,0,0>']);
    expect(lines).toEqual(['ok', 'error:20']);
  });

  it('ignores text frames (PING / currentID noise)', () => {
    const { link, ws } = make();
    const lines = [];
    link.addEventListener('line', (e) => lines.push(e.detail));
    ws.open();
    ws.recvText('currentID:123');
    expect(lines).toEqual([]);
  });

  it('sends a line as a binary frame with a newline', () => {
    const { link, ws } = make();
    ws.open();
    link.sendLine('G0 X1');
    expect(bytes(ws.sent[0])).toEqual(bytes(new TextEncoder().encode('G0 X1\n')));
  });

  it('sends a realtime byte as a one-byte binary frame', () => {
    const { link, ws } = make();
    ws.open();
    link.sendRealtime(0x85);
    expect(bytes(ws.sent[0])).toEqual([0x85]);
  });

  it('does not send while disconnected', () => {
    const { link, ws } = make();
    expect(link.sendLine('G0 X1')).toBe(false);
    expect(ws.sent).toEqual([]);
  });

  it('reports connection changes and reconnects after a drop', () => {
    const { link, ws } = make();
    const states = [];
    link.addEventListener('connection', (e) => states.push(e.detail.connected));
    ws.open();
    expect(link.connected).toBe(true);
    ws.drop();
    expect(link.connected).toBe(false);
    expect(states).toEqual([true, false]);
    expect(FakeSocket.instances.length).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.instances.length).toBe(2);
  });
});

describe('session ids (text frames)', () => {
  it('reports currentID and activeID so the page knows who is in control', () => {
    FakeSocket.instances = [];
    const link = new LatheLink('ws://lathe:81/', { WebSocketImpl: FakeSocket });
    const got = [];
    link.addEventListener('session', (e) => got.push(e.detail));
    link.connect();
    const ws = FakeSocket.instances.at(-1);
    ws.open();
    ws.recvText('currentID:111');
    ws.recvText('activeID:222');
    expect(got).toEqual([{ currentID: '111' }, { activeID: '222' }]);
  });
});
