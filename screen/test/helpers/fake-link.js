// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Test double for LatheLink: records what the UI sends and lets tests push lathe output.
export class FakeLink extends EventTarget {
  constructor() {
    super();
    this.connected = false;
    this.lines = [];
    this.realtime = [];
  }
  connect() {}
  sendLine(l) { if (!this.connected) return false; this.lines.push(l); return true; }
  sendRealtime(b) { if (!this.connected) return false; this.realtime.push(b); return true; }
  setConnected(v) { this.connected = v; this.dispatchEvent(new CustomEvent('connection', { detail: { connected: v } })); }
  status(s) { this.dispatchEvent(new CustomEvent('status', { detail: s })); }
  line(s) { this.dispatchEvent(new CustomEvent('line', { detail: s })); }
}
