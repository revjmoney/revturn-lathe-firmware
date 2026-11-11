// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Connection to the lathe's grblHAL over the ESP3D WebUI v3 WebSocket.
// The grbl stream travels in BINARY frames both ways; text frames are PING/ID noise.

export function splitLines(buffer, chunk) {
  const parts = (buffer + chunk).split(/\r?\n/);
  const rest = parts.pop();
  return { lines: parts.map((l) => l.replace(/\r$/, '')).filter((l) => l.length > 0), rest };
}

export class LatheLink extends EventTarget {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, reconnectMs = 2000 } = {}) {
    super();
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.reconnectMs = reconnectMs;
    this.ws = null;
    this.buffer = '';
    this._connected = false;
    this._timer = null;
    this._closed = false;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
  }

  get connected() { return this._connected; }

  connect() {
    this._closed = false;
    clearTimeout(this._timer);
    // Review 2026-11-10: a second connect() (tab shown again, quick hide / show) used to leave the old socket open,
    // two sockets feeding one buffer. Drop the old one first; its onclose then sees it is no longer this.ws.
    const old = this.ws;
    this.ws = null;
    if (old) { try { old.close(); } catch { /* already gone */ } }
    this._setConnected(false);
    const ws = new this.WebSocketImpl(this.url, ['webui-v3']);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.buffer = '';
    ws.onopen = () => this._setConnected(true);
    ws.onmessage = (e) => this._onData(e.data);
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this._setConnected(false);
      if (!this._closed) this._timer = setTimeout(() => this.connect(), this.reconnectMs);
    };
  }

  // Drop a silent (half-open) socket; onclose then schedules the normal reconnect.
  reconnectNow() {
    this.ws?.close();
  }

  close() {
    this._closed = true;
    clearTimeout(this._timer);
    this.ws?.close();
  }

  sendLine(text) {
    return this._send(this.encoder.encode(text + '\n'));
  }

  sendRealtime(byte) {
    return this._send(new Uint8Array([byte]));
  }

  _send(bytes) {
    // readyState 1 = OPEN; a CONNECTING or CLOSING socket throws on send (STOP / HOLD must never throw)
    if (!this._connected || !this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(bytes); } catch { return false; }
    return true;
  }

  _setConnected(v) {
    if (this._connected === v) return;
    this._connected = v;
    this.dispatchEvent(new CustomEvent('connection', { detail: { connected: v } }));
  }

  _onData(data) {
    if (typeof data === 'string') { // text frames: PING:, currentID:, activeID:
      const m = /^(currentID|activeID):(\S+)/.exec(data);
      if (m) this.dispatchEvent(new CustomEvent('session', { detail: { [m[1]]: m[2] } }));
      return;
    }
    const text = this.decoder.decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data, { stream: true });
    const { lines, rest } = splitLines(this.buffer, text);
    this.buffer = rest;
    for (const line of lines) {
      const type = line.startsWith('<') && line.endsWith('>') ? 'status' : 'line';
      this.dispatchEvent(new CustomEvent(type, { detail: line }));
    }
  }
}
