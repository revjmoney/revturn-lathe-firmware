// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// DOS-style popup window (Rev 2026-11-09): double-line border, [ TITLE ] bar, big yellow ✕ CLOSE on the right (Rev 2026-11-11), Esc closes.
// It covers the left screen (the LCD) so the backplot and the program editor get room; the right column
// (HOLD / STOP / GO, keypad, MDI) stays live beside it. One window at a time.
import { h } from './dom.js';

export function createPopup(host, { fit } = {}) {
  const el = h(`<div class="dospop" data-pop hidden>
    <div class="dosbox" role="dialog" aria-modal="false">
      <div class="dostitle"><span class="dosleft"></span><span data-pop-title></span>
        <button class="dosclose" data-pop-close title="Close this window (Esc)">✕ CLOSE</button></div>
      <div class="dosbody" data-pop-body></div>
    </div></div>`);
  host.appendChild(el);
  const body = el.querySelector('[data-pop-body]');
  let kind = null, onClose = null;

  const close = () => {
    if (!kind) return;
    el.hidden = true;
    body.innerHTML = '';
    const f = onClose;
    kind = null; onClose = null;
    f?.();
  };
  el.querySelector('[data-pop-close]').addEventListener('click', close);
  const onKey = (e) => { if (e.key === 'Escape' && kind) { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);

  return {
    // opens (or replaces) the window; returns the empty body to fill
    open(newKind, title, close2) {
      if (kind) close();
      kind = newKind; onClose = close2 ?? null;
      el.querySelector('[data-pop-title]').textContent = `[ ${title} ]`;
      body.innerHTML = '';
      el.hidden = false;
      fit?.(el); // the host sizes the window (Rev 2026-11-11: it stops above the mode buttons)
      return body;
    },
    close,
    get kind() { return kind; },
    get open_() { return kind !== null; },
    body,
    el,
    stop() { document.removeEventListener('keydown', onKey); },
  };
}
