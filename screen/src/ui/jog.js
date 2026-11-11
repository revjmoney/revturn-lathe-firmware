// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// JOG screen: hold-to-move buttons. A step size sends one jog per press; CONT jogs until release.
import { jogLine, JOG_CANCEL } from '../jog.js';
import { h, on } from './dom.js';

const STEPS = ['0.0001', '0.001', '0.01', '0.1', 'cont'];

export function registerJog(app) {
  let step = '0.001';
  let feedXZ = 10, feedC = 720;
  let jogging = false;

  // Rev 2026-11-09: the pad sits beside the DRO readout and the step / feed row under it, on every screen.
  const mountFixed = () => {
    const root = app.root;
    const padHost = root.querySelector('[data-jogpad]'), ctlHost = root.querySelector('[data-jogctl]');
    padHost.appendChild(h(`<div class="jog">
        <button data-jog="C-">C−</button><button data-jog="X+">X+</button><button data-jog="C+">C+</button>
        <button data-jog="Z-">Z−</button><span class="jogx">JOG</span><button data-jog="Z+">Z+</button>
        <span></span><button data-jog="X-">X−</button><span></span>
      </div>`));
    ctlHost.appendChild(h(`<div class="jogrow">
      <span class="lbl3">JOG STEP</span>
      <span class="picker">${STEPS.map((s) => `<button data-step="${s}">${s === 'cont' ? 'CONT' : s}</button>`).join('')}</span>
      <label>C °/min<input name="feedC" inputmode="decimal" value="${feedC}"></label>
    </div>`));
    // X/Z jog speed slider, styled like the spindle bar right under it (Rev 2026-11-09). Max follows $110/$112.
    ctlHost.appendChild(h(`<div class="xzbar">
      <span class="lbl3">X/Z JOG</span>
      <input type="range" data-xz-feed min="1" max="50" step="1" value="${feedXZ}" aria-label="X and Z jog speed">
      <span data-xz-show>${feedXZ} IPM</span>
    </div>`));
    const xzShow = ctlHost.querySelector('[data-xz-show]');
    const onXz = (e) => { feedXZ = Number(e.target.value); xzShow.textContent = `${feedXZ} IPM`; };
    on(ctlHost, '[data-xz-feed]', 'input', (e) => onXz(e));
    on(ctlHost, '[data-xz-feed]', 'change', (e) => onXz(e));
    const view = root.querySelector('.lcd');

    const mark = () => { for (const b of view.querySelectorAll('[data-step]')) b.classList.toggle('on', b.dataset.step === step); };
    mark();
    on(view, '[data-step]', 'click', (e, b) => { step = b.dataset.step; mark(); });
    ctlHost.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (!(v > 0)) return;
      if (e.target.name === 'feedC') feedC = v;
    });

    on(view, '[data-jog]', 'pointerdown', (e, b) => {
      e.preventDefault?.();
      startJog(b.dataset.jog);
    });
    // Rev 2026-11-11: keyboard jog. Left = Z- (toward the chuck), Right = Z+, Up = X+ (away from the user),
    // Down = X-, Page Up = C+, Page Down = C-. Same step / CONT mode, speed and limits as the buttons: a step
    // mode jogs once per press (key repeat ignored), CONT jogs while the key is held. Ignored while typing.
    view.ownerDocument.addEventListener('keydown', onKeyDown);
    view.ownerDocument.addEventListener('keyup', onKeyUp);
  };

  const KEYS = { ArrowLeft: 'Z-', ArrowRight: 'Z+', ArrowUp: 'X+', ArrowDown: 'X-', PageUp: 'C+', PageDown: 'C-' };
  let keyHeld = null;
  const typing = (t) => !!t?.closest?.('input, textarea, select, [contenteditable="true"]');
  const onKeyDown = (e) => {
    const jog = KEYS[e.key];
    if (!jog || e.ctrlKey || e.altKey || e.metaKey || typing(e.target) || !app.root.isConnected) return;
    e.preventDefault(); // no page scroll
    if (e.repeat) return; // step mode: one jog per press; CONT keeps going until keyup
    const btn = app.root.querySelector(`[data-jog="${jog}"]`);
    if (!btn || btn.disabled) return; // same gate as the button (no link, another screen in control, ...)
    if (keyHeld) stopJog();
    keyHeld = e.key;
    startJog(jog);
  };
  const onKeyUp = (e) => { if (e.key === keyHeld) { keyHeld = null; stopJog(); } };

  const startJog = (jogName) => {
    {
      const axis = jogName[0], dir = jogName[1] === '+' ? 1 : -1;
      const feed = axis === 'C' ? feedC : feedXZ;
      if (step !== 'cont') {
        const dist = axis === 'C' ? cStep(step) : Number(step);
        const over = overtravel(axis, dir, dist);
        if (over) { app.msg(`${over}: jog refused (${limitText(axis, dir)})`); return; }
        app.send(jogLine({ axis, dir, step: dist, feed }));
        return;
      }
      // CONT: short segments re-sent while held, so a dropped link stops the jog within ~1.5 segments.
      // Each segment is rebuilt from the current feed, so moving the X/Z slider changes speed live.
      const segFor = () => {
        const f = axis === 'C' ? feedC : feedXZ;
        const seg = Number(((f / 60) * SEGMENT_S).toFixed(4));
        return { seg, line: jogLine({ axis, dir, step: seg, feed: f }) };
      };
      const first = segFor();
      stopTimer();
      if (overtravel(axis, dir, first.seg)) { app.msg(`${overtravel(axis, dir, first.seg)}: jog refused (${limitText(axis, dir)})`); return; }
      if (!app.send(first.line)) return;
      jogging = true;
      // Review 2026-11-10: each tick used to send 150 ms of travel every 100 ms, so after a long hold seconds of
      // motion sat queued and kept running if the link dropped. Track what is queued and only top it up.
      // X words are diameters (G7): the machine eats X travel at twice the feed in DRO units.
      const eat = (f) => (axis === 'X' ? 2 : 1) * (f / 60) * (REPEAT_MS / 1000);
      let queued = first.seg;
      timer = setInterval(() => {
        queued = Math.max(0, queued - eat(axis === 'C' ? feedC : feedXZ));
        // Review 2026-11-10: never keep feeding a machine that is not jogging (Alarm after STOP, Hold, a program),
        // or from a screen that lost control.
        const st = app.state.machine?.state;
        if ((st && st !== 'Idle' && st !== 'Jog') || !app.inControl()) { stopJog(); return; }
        const { seg, line } = segFor();
        // look two segments ahead (one may still be queued) and stop before the stroke limit
        const over = overtravel(axis, dir, 2 * seg);
        if (over) { stopJog(); app.msg(`${over}: jog stopped (${limitText(axis, dir)})`); return; }
        if (queued > 1.5 * seg) return; // enough queued: wait for the machine
        if (!app.link.sendLine(line)) { stopJog(); return; }
        queued += seg;
      }, REPEAT_MS);
    }
  };
  const mountRelease = (view) => {
    for (const t of ['pointerup', 'pointercancel']) on(view, '[data-jog]', t, stopJog);
    // Review 2026-11-10: pointerleave does not bubble, so the delegated listener above never saw it and a mouse
    // dragged off the button kept jogging. Catch it in the capture phase, and treat a release anywhere, a lost
    // pointer or a window that loses focus as letting go.
    view.addEventListener('pointerleave', (e) => { if (e.target?.matches?.('[data-jog]')) stopJog(); }, true);
    for (const t of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(t, stopJog);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopJog(); });
  };

  // Stroke limits apply to jogging too (T1 work frame, X as diameter). C is unlimited.
  const overtravel = (axis, dir, dist) => {
    const L = app.state.setup.limits;
    if (axis === 'C' || !L.enabled) return null; // C is unlimited; LIMITS switch off
    const target = app.t1Reading(axis) + dir * dist;
    const [max, min] = axis === 'X' ? [L.xMax, L.xMin] : [L.zMax, L.zMin];
    if (dir > 0 && target > max + 1e-9) return `OVERTRAVEL ${axis}+`;
    if (dir < 0 && target < min - 1e-9) return `OVERTRAVEL ${axis}-`;
    return null;
  };
  const limitText = (axis, dir) => {
    const L = app.state.setup.limits;
    return axis === 'X' ? (dir > 0 ? `X max ${L.xMax}` : `X min ${L.xMin}`) : (dir > 0 ? `Z max ${L.zMax}` : `Z min ${L.zMin}`);
  };

  let timer = null;
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const stopJog = () => {
    stopTimer();
    if (jogging) { jogging = false; app.link.sendRealtime(JOG_CANCEL); }
  };

  mountFixed();
  mountRelease(app.root.querySelector('.lcd'));
  // HOLD or STOP on any screen: cancel our jog first; the app then still sends feed hold / reset.
  app.addHoldHook(stopJog);
  // (Rev 2026-11-10: no JOG screen any more, the pad is beside the DRO on every screen)
}

const REPEAT_MS = 100;   // re-send interval while a CONT jog button is held
const SEGMENT_S = 0.15;  // each segment is 150 ms of travel at the jog feed

// C step sizes in degrees for the same buttons: 0.0001 -> 0.1, 0.001 -> 1, 0.01 -> 5, 0.1 -> 15
const cStep = (s) => ({ '0.0001': 0.1, '0.001': 1, '0.01': 5, '0.1': 15 })[s];
