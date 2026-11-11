// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// REVTURN lathe control screen: shell, DRO, keypad, MDI, HOLD/GO/STOP, overrides, alarms, tools,
// dry run, view-only, run progress. Modes other than DRO are registered by their own modules.
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
import { parseStatus } from './status.js';
import { droView } from './dro.js';
import { Keypad, zeroLine } from './keypad.js';
import { describe as explain } from './errors.js';
import { defaultSetup, loadSetup, saveSetup, toolById, N_TOOLS } from './setup.js';
import { mountMdi } from './ui/mdi.js';
import { createBackplot } from './backplot.js';
import { drawPreview } from './ui/preview.js';
import { createPopup } from './ui/popup.js';
import { createRunLog } from './runlog.js';
import { readFile } from './files.js';
import { h, on, esc } from './ui/dom.js';
import { BRAND_HTML, openAbout } from './ui/about.js';

// Rev 2026-11-11: the lathe boots to REVTURN; the stock grblHAL WebUI (settings only) lives here, behind WEBUI
export const WEBUI_URL = '/webui/#/settings/machine'; // opens straight on the grblHAL settings

// Rev 2026-11-10: JOG became TOOL (the jog pad is beside the DRO on every screen anyway)
// Rev 2026-11-11: TOOL merged into SET UP (tool select is the T button on each tool row)
// Rev 2026-11-11: SETTINGS = every grblHAL setting in the REVTURN look (the stock WebUI is a link inside it)
export const MODES = ['DRO', 'PROG', 'EDIT', 'SET UP', 'RUN', 'CYCLES', 'SETTINGS'];
// Rev 2026-11-11: these modes open in the full window like EDIT and BACKPLOT (value = window title)
export const WINDOWED = { PROG: 'PROGRAMS', 'SET UP': 'SET UP', CYCLES: 'CYCLES', RUN: 'RUN', SETTINGS: 'SETTINGS' };
const RT = { STATUS: 0x3f, HOLD: 0x21, RESUME: 0x7e, RESET: 0x18 };
// grbl realtime override bytes (Fanuc-style panel)
export const OV = {
  'feed-': 0x92, feed100: 0x90, 'feed+': 0x91,
  'spin-': 0x9b, spin100: 0x99, 'spin+': 0x9a,
  rapid25: 0x97, rapid50: 0x96, rapid100: 0x95,
};
const KEYS = ['+/-', 'CLEAR', 'X', '7', '8', '9', 'Z', '4', '5', '6', 'C', '1', '2', '3', '.'];
const STATUS_TIMEOUT_MS = 1500;
const VIEW_POLL_MS = 450; // a VIEW ONLY screen asks for status itself after this long without a broadcast
const SPIN_THROTTLE_MS = 200; // live spindle slider: at most one speed change per 200 ms

const ovBtn = (k, label) => `<button data-ov="${k}">${label}</button>`;
// the override row: on the LCD, and again inside the RUN window (Rev 2026-11-11: no way to set overrides in RUN)
export const OVR_HTML = `<div class="ovr"><span data-ov-show>FEED 100% · RAPID 100% · SPINDLE 100%</span>
      <span class="ovk">FEED ${ovBtn('feed-', '−')}${ovBtn('feed100', '100')}${ovBtn('feed+', '+')}</span>
      <span class="ovk">SPINDLE ${ovBtn('spin-', '−')}${ovBtn('spin100', '100')}${ovBtn('spin+', '+')}</span>
      <span class="ovk">RAPID ${ovBtn('rapid25', '25')}${ovBtn('rapid50', '50')}${ovBtn('rapid100', '100')}</span></div>`;
const LAYOUT = `
<div class="ctl">
  <div class="lcd">
    <div class="top">${BRAND_HTML}<span data-units>IN · DIA · G18</span><span data-tooltag>T1</span>
      <span class="drybadge" data-drybadge hidden>DRY RUN</span><span data-conn class="bad">DISCONNECTED</span><span data-state>---</span><button class="webui" data-open-backplot title="Backplot window (Esc closes)">BACKPLOT</button><button class="webui" data-open-about title="About REVTURN">ABOUT</button></div>
    <div class="mode" data-mode-title>DRO</div>
    <div class="drotop"><div class="readout">
      <div class="row"><span class="ax">X</span><span class="val" data-dro="x">0.0000</span><span class="tag" data-dro="xt">DIA</span></div>
      <div class="row"><span class="ax">Z</span><span class="val" data-dro="z">0.0000</span><span class="tag">ABS</span></div>
      <div class="row sp"><span class="ax" data-dro="sl">C</span><span class="val" data-dro="sv">0.00°</span><span class="tag" data-dro="st"></span></div>
    </div><div class="jogpad" data-jogpad></div></div>
    <div class="zeros zerobar">
      <button data-zero="X">ZERO X</button><button data-zero="Z">ZERO Z</button>
      <button data-zero="C">ZERO C</button><button data-zero="ALL">ZERO ALL</button>
      <button class="gozero" data-gozero>GO TO ZERO</button></div>
    <div class="jogctl" data-jogctl></div>
    <div class="spinbar">
      <button data-spin-toggle>SPINDLE ON</button><button class="spinstop" data-spin-stop>SPINDLE STOP</button>
      <input type="range" data-spin-rpm min="1" max="100" step="1" value="30" aria-label="Spindle speed">
      <span data-spin-show>30 RPM</span></div>
    <div class="progress" data-progress></div>
    <div class="panel" data-panel></div>
    ${OVR_HTML}
    <div class="msg"><span data-msg></span><span data-entry></span></div>
    <div class="soft">${MODES.map((m) => `<button data-mode="${m}">${m}</button>`).join('')}</div>
  </div>
  <div class="right">
    <div class="motion"><button class="hold" data-hold>HOLD</button><button class="stop" data-stop>STOP</button></div>
    <div class="aux"><button class="dry" data-dryrun>DRY RUN</button><button class="lim" data-limits title="Stroke (overtravel) limits from SET UP">LIMITS OFF</button><button class="unlock" data-unlock hidden>RESET / UNLOCK</button></div>
    <div class="keys">
      <button class="b" data-key="INC SET">INC SET</button><button class="b" data-key="ABS SET">ABS SET</button>
      ${KEYS.map((k) => `<button data-key="${k}">${k}</button>`).join('')}
      <button class="zero3" data-key="0">0</button>
    </div>
    <button class="go big" data-go>GO</button>
    <div class="mdi">
      <div class="lbl">MDI</div>
      <div class="log" data-mdi-log></div>
      <div class="line"><input data-mdi-input autocomplete="off" spellcheck="false" placeholder="G-code"><button data-mdi-send>SEND</button></div>
    </div>
  </div>
  <div class="stopbar"><button class="hold" data-hold>HOLD</button><button class="go" data-go>GO</button><button class="stop" data-stop>STOP</button></div>
</div>`;

const DRO_PANEL = `<div class="fill">
  <div class="picker tools">${Array.from({ length: N_TOOLS }, (_, i) => `<button data-tool="${i + 1}">T${i + 1}</button>`).join('')}</div>
  <button class="bigopen" data-open-backplot>▣ OPEN BACKPLOT</button>
</div>`;

// Backplot window body (Rev 2026-11-09: the backplot is its own DOS-style popup, with room to breathe)
const BACKPLOT_WIN = `<div class="bpwin">
  <div class="bphead"><span>green = program · blue = where the tool went · yellow = tool</span><button class="btn" data-trail-clear>CLEAR</button></div>
  <canvas class="preview bpbig" data-backplot></canvas>
</div>`;

const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function startApp(root, link, opts = {}) {
  const host = opts.host ?? location.host;
  const fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
  root.innerHTML = '';
  root.appendChild(h(LAYOUT));
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => root.querySelectorAll(s);

  const state = {
    machine: null, maxRpm: null, mode: 'DRO', units: 'in', reportUnits: 'mm', live: false, lastStatus: 0,
    setup: defaultSetup(), setupError: false, dryRun: false, myId: null, activeId: null, run: null,
  };
  const modes = new Map();
  const holdHooks = [];
  const keypad = new Keypad();
  const mdi = mountMdi($('.mdi'), { send: (l) => (locked() ? false : link.sendLine(l)) });
  const runLog = createRunLog({
    fetchLines: async (name) => (await readFile(host, name, app.fetchImpl)).split('\n'),
    emit: (text, kind) => (kind === 'note' ? mdi.note(text) : mdi.run(text)),
  });

  const viewOnly = () => !!(state.myId && state.activeId && state.myId !== state.activeId);
  // Shared control (Rev 2026-11-10): every screen can drive the lathe while no program is running. A screen that
  // does not hold the lathe's stream is locked (VIEW ONLY: watch, HOLD / STOP, overrides) only while the lathe is
  // doing something else than Idle / Jog / Alarm, or before the first status says what it is doing.
  const FREE_STATES = ['Idle', 'Jog', 'Alarm'];
  const locked = () => viewOnly() && !FREE_STATES.includes(state.machine?.state);
  const inControl = () => state.live && !locked();

  const msg = (text) => { $('[data-msg]').textContent = text ?? ''; };
  const send = (line) => {
    if (locked()) { msg('View only: a program is running from another screen'); return false; }
    if (!link.sendLine(line)) { msg('Not connected'); return false; }
    return true;
  };

  // Status bar + which keys work. HOLD and STOP always stay live (E-stop principle).
  const refreshControls = (label) => {
    const el = $('[data-conn]');
    const vo = state.live && locked();
    el.textContent = label ?? (vo ? 'VIEW ONLY' : state.live ? 'CONNECTED' : 'DISCONNECTED');
    el.className = vo ? 'warn' : state.live ? 'good' : 'bad';
    $('.lcd').classList.toggle('stale', !state.live);
    const ok = inControl();
    for (const b of $$('[data-zero], [data-gozero], [data-jog], [data-needs-link], [data-mdi-send], [data-unlock], [data-key], [data-tool], [data-spin-toggle], [data-spin-stop], [data-spin-rpm]')) b.disabled = !ok;
    // feed / rapid / spindle overrides work from every screen, also while a program runs; GO resumes a held one
    for (const b of $$('[data-ov]')) b.disabled = !state.live;
    const held = ['Hold', 'Tool'].includes(state.machine?.state);
    for (const b of $$('[data-go]')) b.disabled = !(ok || (state.live && held));
    $('[data-limits]').disabled = locked(); // shared setting: not changed from a locked screen
    state.wasLocked = locked();
  };
  const renderLimits = () => {
    const on = state.setup.limits.enabled === true;
    const b = $('[data-limits]');
    b.textContent = on ? 'LIMITS ON' : 'LIMITS OFF';
    b.classList.toggle('on', on);
  };
  const setConnected = (c, label) => { state.live = c; refreshControls(label); };

  // G28 unwind is safe only with C in the $538 wrap mask and the stored G28 C on a C zero (mod 360)
  const cWrapReady = () => {
    const wco = state.machine?.wco?.[3];
    if (!((state.wrapMask ?? 0) & 1) || !Number.isFinite(state.g28C) || !Number.isFinite(wco)) return false;
    const d = (((state.g28C - wco) % 360) + 360) % 360;
    return d < 0.05 || d > 359.95;
  };
  const activeTool = () => toolById(state.setup, state.setup.activeTool);

  // T1-frame reading in inches (X as diameter)
  const t1Reading = (axis) => {
    if (!state.machine) return 0;
    const k = state.reportUnits === 'in' ? 1 : 1 / 25.4;
    return axis === 'X' ? state.machine.wpos[0] * k : state.machine.wpos[2] * k;
  };
  // where the active tool's tip is (what the DRO shows)
  const tipPosition = () => {
    if (!state.machine) return null;
    const t = activeTool();
    return { x: t1Reading('X') - t.dx, z: t1Reading('Z') - t.dz };
  };
  const backplot = createBackplot();
  const drawBackplot = () => {
    for (const c of root.querySelectorAll('[data-backplot]')) drawPreview(c, state.programPts ?? [], tipPosition(), backplot.points); // last compiled program too
  };
  // Rev 2026-11-11: windows sit between the top status bar and the message line, so the mode buttons stay
  // visible and tapping one is how you leave a window (no close button needed except on phones)
  const fitPopup = (el) => {
    const lcd = $('.lcd'), top = $('.top'), msgEl = $('.msg');
    if (!lcd || !top || !msgEl || !lcd.clientHeight) return; // not laid out (tests): keep the CSS inset
    el.style.top = `${top.offsetTop + top.offsetHeight}px`;
    el.style.bottom = `${Math.max(0, lcd.clientHeight - msgEl.offsetTop)}px`;
  };
  const popup = createPopup($('.lcd'), { fit: fitPopup });
  const onResize = () => { if (popup.kind) fitPopup(popup.el); };
  window.addEventListener('resize', onResize);
  const openBackplot = () => {
    if (popup.kind === 'backplot') { popup.close(); return; } // the BACKPLOT button toggles it
    popup.open('backplot', 'BACKPLOT').appendChild(h(BACKPLOT_WIN));
    requestAnimationFrame?.(drawBackplot); // after layout, so the canvas has its size
    drawBackplot();
  };

  const renderDro = () => {
    $('[data-tooltag]').textContent = `T${state.setup.activeTool}`;
    for (const b of $$('[data-tool]')) b.classList.toggle('on', Number(b.dataset.tool) === state.setup.activeTool);
    const spinOn = !!state.machine && state.machine.spindle !== 'off';
    $('[data-spin-toggle]').classList.toggle('on', spinOn); // lit while turning
    if (!state.machine) return;
    const s = state.machine;
    const v = droView(s, state.units, { reportUnits: state.reportUnits, tool: activeTool() });
    // every copy of the readout (the main DRO and the RUN window's one-line strip)
    const put = (k, t) => { for (const e of $$(`[data-dro="${k}"]`)) e.textContent = t; };
    put('x', v.x); put('z', v.z); put('xt', v.xTag);
    put('sl', v.spindleLabel); put('sv', v.spindleValue); put('st', v.spindleTag);
    $('[data-state]').textContent = v.state.toUpperCase();
    $('[data-units]').textContent = `${state.units.toUpperCase()} · ${v.xTag} · G18`;
    $('[data-unlock]').hidden = s.state !== 'Alarm';
    if (s.ov) for (const e of $$('[data-ov-show]')) e.textContent =`FEED ${s.ov[0]}% · RAPID ${s.ov[1]}% · SPINDLE ${s.ov[2]}%`;
    renderProgress(s);
  };

  const renderProgress = (s) => {
    const el = { set textContent(t) { for (const e of $$('[data-progress]')) e.textContent = t; } }; // LCD + RUN window
    if (!s.sd) { state.run = null; el.textContent = ''; return; }
    const pct = s.sd.pct;
    // Review 2026-11-10: the estimate uses the progress THIS screen has seen (a screen that joins at 50 % used to
    // divide its own few minutes by the whole 50 % and promise a fraction of the real time left)
    if (!state.run || state.run.file !== s.sd.file || pct < state.run.pct0) state.run = { file: s.sd.file, start: Date.now(), pct0: pct };
    const elapsed = Date.now() - state.run.start;
    const seen = pct - state.run.pct0;
    const left = seen > 0 ? `~${mmss((elapsed * (100 - pct)) / seen)} left` : 'estimating';
    el.textContent = `${s.sd.file.replace(/^\//, '')} ${Math.round(pct)}% · ${mmss(elapsed)} elapsed · ${left}`;
  };

  // The panel keeps a note and an OPEN button so a closed window can come back; leaving the mode closes it.
  const winKind = (name) => `mode:${name}`;
  const openModeWindow = (name) => {
    const m = modes.get(name);
    if (!m) return;
    m.mount(popup.open(winKind(name), WINDOWED[name]));
    refreshControls();
  };
  const mountWindowed = (name, panel) => {
    const box = h(`<div><div class="soon">${esc(WINDOWED[name])} is open in its window.</div><button class="bigopen" data-open-modewin>▣ OPEN ${esc(WINDOWED[name])}</button></div>`);
    panel.appendChild(box);
    on(box, '[data-open-modewin]', 'click', () => openModeWindow(name));
    openModeWindow(name);
  };

  const showMode = (name) => {
    state.mode = name;
    $('[data-mode-title]').textContent = name;
    for (const b of $$('[data-mode]')) b.classList.toggle('on', b.dataset.mode === name);
    const panel = $('[data-panel]');
    panel.innerHTML = '';
    if (popup.kind) popup.close(); // tapping a mode leaves any window (Rev 2026-11-11: no close button)
    const m = modes.get(name);
    if (name === 'DRO') { panel.appendChild(h(DRO_PANEL)); drawBackplot(); } // jog pad is always beside the DRO
    else if (m && WINDOWED[name]) mountWindowed(name, panel);
    else if (m) m.mount(panel);
    else panel.innerHTML = `<div class="soon">${esc(name)}: not set up yet</div>`;
    renderDro();
    refreshControls();
  };

  // current reading of an axis for the active tool tip, in display units (for INC SET)
  const current = (axis) => {
    if (!state.machine) return 0;
    const k = state.reportUnits === state.units ? 1 : state.units === 'in' ? 1 / 25.4 : 25.4;
    const t = activeTool();
    if (axis === 'X') return state.machine.wpos[0] * k - t.dx;
    if (axis === 'Z') return state.machine.wpos[2] * k - t.dz;
    return state.machine.wpos[3];
  };
  const offsetFor = (axis) => (axis === 'X' ? activeTool().dx : axis === 'Z' ? activeTool().dz : 0);

  const persistSetup = async () => {
    if (locked()) return;
    try { await saveSetup(host, state.setup, app.fetchImpl); } catch (err) { msg(`Setup not saved: ${err.message}`); }
  };
  // Read the shared tool table / limits from the lathe. On failure keep what we have and block runs.
  const refreshSetup = async () => {
    try {
      state.setup = await loadSetup(host, app.fetchImpl);
      state.setupError = false;
      renderDro();
      renderLimits();
      return true;
    } catch {
      state.setupError = true;
      msg('Tool table could not be read from the lathe: check the connection and try again');
      return false;
    }
  };

  on(root, '[data-mode]', 'click', (e, b) => showMode(b.dataset.mode));
  on(root, '[data-open-backplot]', 'click', () => openBackplot());
  on(root, '[data-open-about]', 'click', () => openAbout(popup));
  on(root, '[data-trail-clear]', 'click', () => {
    backplot.clear();
    backplot.add(tipPosition());
    drawBackplot();
    modes.get(state.mode)?.onStatus?.(state.machine ?? {});
    msg('Backplot cleared');
  });
  // The zero bar is on every screen; zeroing only while Idle (never mid-program or mid-jog).
  // Manual spindle (like the machine's spindle keys): ON = M3 at the slider speed, OFF = M5. Moving the slider while
  // it turns changes the speed in the same direction. Only at Idle or while jogging; a running program owns the spindle.
  const spinRpm = () => Number($('[data-spin-rpm]').value);
  const spinAllowed = () => {
    const st = state.machine?.state;
    if (st && st !== 'Idle' && st !== 'Jog') { msg('A program is running: use SPINDLE override, HOLD or STOP'); return false; }
    return true;
  };
  on(root, '[data-spin-toggle]', 'click', () => {
    if (!spinAllowed()) return;
    const dir = state.machine?.spindle;
    send(`${dir === 'ccw' ? 'M4' : 'M3'} S${spinRpm()}`); // already turning: just re-sends the slider speed
    spinSent = spinRpm(); spinLast = Date.now();
  });
  on(root, '[data-spin-stop]', 'click', () => { if (spinAllowed()) { send('M5'); spinSent = null; } });
  // Live speed while dragging: first move goes at once, then at most every SPIN_THROTTLE_MS, always ending on the
  // final value. While stopped, the slider only sets the speed for the next ON.
  let spinSent = null, spinLast = 0, spinTimer = null;
  const spinTurning = () => state.machine?.spindle === 'cw' || state.machine?.spindle === 'ccw';
  const pushSpeed = () => {
    if (!spinTurning() || !spinAllowed()) return;
    const v = spinRpm();
    if (v === spinSent) return;
    send(`${state.machine.spindle === 'ccw' ? 'M4' : 'M3'} S${v}`);
    spinSent = v; spinLast = Date.now();
  };
  const onSlide = () => {
    $('[data-spin-show]').textContent = `${spinRpm()} RPM`;
    if (!spinTurning()) return;
    const wait = SPIN_THROTTLE_MS - (Date.now() - spinLast);
    if (wait <= 0) pushSpeed();
    else if (!spinTimer) spinTimer = setTimeout(() => { spinTimer = null; pushSpeed(); }, wait);
  };
  on(root, '[data-spin-rpm]', 'input', onSlide);
  on(root, '[data-spin-rpm]', 'change', onSlide);

  on(root, '[data-zero]', 'click', (e, b) => {
    const st = state.machine?.state;
    if (st && st !== 'Idle') { msg(`Zero only when Idle (machine is ${st})`); return; }
    send(zeroLine(b.dataset.zero, activeTool()));
    // C unwind (Rev 2026-11-09): G28 must sit on C zero, so store it at the new zero and re-read it
    if (b.dataset.zero === 'C' || b.dataset.zero === 'ALL') { send('G28.1'); send('$#'); }
  });
  // Rev 2026-11-10: no home switches yet, so "home" is the work zero he set. Z first (back away from the chuck),
  // then X to the front, both at rapid.
  on(root, '[data-gozero]', 'click', () => {
    // Review 2026-11-10: Idle only (also refused while the state is not known yet), the ACTIVE tool tip goes to
    // zero (T1 position = tool offset), modes forced so a leftover G91 / G21 / G8 cannot move it elsewhere, and
    // X is only sent if the Z line was.
    const st = state.machine?.state;
    if (st !== 'Idle') { msg(`Go to zero only when Idle (machine is ${st ?? 'not known yet'})`); return; }
    const t = activeTool(), r = (v) => String(Number((v || 0).toFixed(6)));
    if (!send(`G7 G20 G90 G0 Z${r(t.dz)}`)) return;
    send(`G0 X${r(t.dx)}`);
    msg(`Going to zero (T${t.n} tip): Z first, then X`);
  });
  on(root, '[data-tool]', 'click', (e, b) => {
    state.setup.activeTool = Number(b.dataset.tool);
    renderDro();
    persistSetup();
  });
  on(root, '[data-key]', 'click', (e, b) => {
    const axis = keypad.axis;
    const action = keypad.press(b.dataset.key, { current: current(axis), offset: offsetFor(axis) });
    $('[data-entry]').textContent = keypad.display;
    if (action?.type === 'line') {
      // review 2026-11-10: like ZERO, only when Idle (a G10 typed during a Hold ran on resume)
      const st = state.machine?.state;
      if (st !== 'Idle') { msg(`Set only when Idle (machine is ${st ?? 'not known yet'})`); return; }
      send(action.line); mdi.note(`> ${action.line}`);
    }
  });
  on(root, '[data-ov]', 'click', (e, b) => { if (state.live) link.sendRealtime(OV[b.dataset.ov]); });
  on(root, '[data-unlock]', 'click', () => { if (send('$X')) msg('Unlocked: check zeros before running'); });
  on(root, '[data-limits]', 'click', () => {
    state.setup.limits.enabled = !state.setup.limits.enabled;
    renderLimits();
    msg(state.setup.limits.enabled ? 'LIMITS ON: jogs and programs stop at the SET UP stroke limits' : 'LIMITS OFF: no stroke-limit checks');
    persistSetup();
  });
  on(root, '[data-dryrun]', 'click', () => {
    state.dryRun = !state.dryRun;
    $('[data-drybadge]').hidden = !state.dryRun;
    for (const b of $$('[data-dryrun]')) b.classList.toggle('on', state.dryRun);
    msg(state.dryRun ? 'DRY RUN on: programs run clear of the part (deepest point 0.5 in above the face), spindle off' : 'DRY RUN off');
    modes.get(state.mode)?.onDryRun?.(); // e.g. CYCLES drops a preview made in the other mode
  });
  on(root, '[data-hold]', 'click', () => {
    for (const f of holdHooks) f(); // the jog pad cancels a continuous jog first (any screen)
    modes.get(state.mode)?.onHold?.();
    if (!link.sendRealtime(RT.HOLD)) msg('Not connected: nothing sent');
  });
  on(root, '[data-go]', 'click', () => {
    const st = state.machine?.state;
    if (state.live && (st === 'Hold' || st === 'Tool')) { link.sendRealtime(RT.RESUME); return; } // from any screen
    if (!inControl()) return;
    // a windowed mode whose window was closed: GO brings the window back first (its form lives there)
    if (WINDOWED[state.mode] && popup.kind !== winKind(state.mode)) { openModeWindow(state.mode); msg(`${WINDOWED[state.mode]} window reopened: GO again`); return; }
    modes.get(state.mode)?.onGo?.();
  });
  on(root, '[data-stop]', 'click', () => {
    for (const f of holdHooks) f(); // Review 2026-11-10: STOP must also end a continuous jog's repeat timer
    state.needModes = true; // the reset puts grblHAL back in G8 / power-on units
    if (link.sendRealtime(RT.RESET)) msg('Reset sent: press RESET / UNLOCK if alarmed, check zeros');
    else msg('Not connected: nothing sent');
  });

  const onConn = async (e) => {
    state.lastStatus = Date.now();
    setConnected(e.detail.connected);
    if (!e.detail.connected) { state.myId = state.activeId = null; msg('Connection lost: reconnecting'); return; }
    state.needModes = true; // again at the first Idle status, in case the lathe is in Alarm right now
    link.sendLine('G7 G20'); link.sendLine('$30'); link.sendLine('$G'); link.sendLine('$13');
    link.sendLine('$538'); link.sendLine('$#'); // C unwind: rotary wrap mask and the stored G28 position
    link.sendLine('$110'); link.sendLine('$112'); // X / Z max rate: top of the X/Z jog slider
    msg('');
    await refreshSetup();
  };
  const onStatus = (e) => {
    const s = parseStatus(e.detail, state.machine);
    if (!s) return;
    state.lastStatus = Date.now();
    if (!state.live && link.connected) setConnected(true);
    state.machine = s;
    if (locked() !== state.wasLocked || ['Hold', 'Tool'].includes(s.state) !== state.wasHeld) {
      state.wasHeld = ['Hold', 'Tool'].includes(s.state);
      refreshControls(); // the lock follows what the lathe is doing
    }
    // Review 2026-11-10: after a reset the lathe is in G8 radius and power-on units, and grblHAL refuses g-code
    // while in Alarm, so G7 G20 sent on the banner was lost. Send it at the first Idle status instead.
    if (state.needModes && s.state === 'Idle' && inControl()) {
      state.needModes = false;
      link.sendLine('G7 G20'); link.sendLine('$G');
    }
    renderDro();
    backplot.add(tipPosition()); // traced in every mode: jogs, MDI and programs
    drawBackplot(); // only draws when the backplot window is open
    runLog.onStatus(s); // running program's lines into the console
    modes.get(state.mode)?.onStatus?.(s);
  };
  const onLine = (e) => {
    const line = e.detail;
    // grblHAL restarted (STOP / reset): it is back in G8 radius, maybe G21. Put it back.
    if (/^GrblHAL /.test(line)) state.needModes = true; // sent at the next Idle status (refused while in Alarm)
    let m;
    if ((m = /^\$30=([0-9.]+)/.exec(line))) {
      state.maxRpm = Number(m[1]);
      const r = $('[data-spin-rpm]');
      r.max = String(Math.round(state.maxRpm));
      if (Number(r.value) > state.maxRpm) { r.value = r.max; $('[data-spin-show]').textContent = `${r.value} RPM`; }
    }
    if ((m = /^\$11([02])=([0-9.]+)/.exec(line))) {
      // X/Z jog slider tops out at the faster of the X and Z max rates, in ipm (grblHAL caps each axis itself)
      state[m[1] === '0' ? 'maxRateX' : 'maxRateZ'] = Number(m[2]);
      const s = $('[data-xz-feed]');
      if (s) {
        const top = Math.max(1, Math.floor(Math.max(state.maxRateX ?? 0, state.maxRateZ ?? 0) / 25.4));
        s.max = String(top);
        if (Number(s.value) > top) { s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    }
    if ((m = /^\$538=(\d+)/.exec(line))) state.wrapMask = Number(m[1]);
    if ((m = /^\[G28:([^\]]*)\]$/.exec(line))) state.g28C = Number(m[1].split(',')[3]);
    if ((m = /^\$13=(\d)/.exec(line))) { state.reportUnits = m[1] === '1' ? 'in' : 'mm'; renderDro(); }
    if (/^ALARM:\d+/.test(line)) msg(`${explain(line)}: press UNLOCK after checking the machine`);
    if ((m = /^\[MSG:(.*)\]$/.exec(line))) {
      msg(m[1].trim());
      // a program's manual tool change: the DRO and later cycles now use that tool
      const t = /CHANGE TO T(\d+)/.exec(m[1]);
      if (t && Number(t[1]) >= 1 && Number(t[1]) <= N_TOOLS) { state.setup.activeTool = Number(t[1]); renderDro(); persistSetup(); }
    }
    const gc = /^\[GC:(.*)\]$/.exec(line);
    if (gc) {
      const words = gc[1].split(/\s+/);
      const dia = words.includes('G7') ? true : words.includes('G8') ? false : null;
      if (dia !== null) {
        state.machine = { ...(state.machine ?? parseStatus('<Idle|MPos:0,0,0,0>')), diameter: dia };
        renderDro();
      }
    }
    // the SETTINGS screen's setting descriptions ($ES / $EG / $SED) would bury the console: keep them out of it
    if (/^\[SETTING(GROUP|DESCR)?:/.test(line)) return;
    mdi.reply(line);
  };
  const onSession = (e) => {
    if (e.detail.currentID) state.myId = e.detail.currentID;
    if (e.detail.activeID) {
      state.activeId = e.detail.activeID;
      // a screen joined or control changed: the controller repeats $13 so watchers learn the report units
      if (state.activeId === state.myId && link.connected) { link.sendLine('$13'); link.sendLine('$G'); } // $G: watchers learn G7 (DIA)
    }
    refreshControls();
  };

  // grblHAL gives its stream to ONE WebSocket client. Let go cleanly when this page is hidden or closed
  // (phone locked, tab switched or swiped away) so another screen can take over; reconnect on return.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') link.close?.();
    else if (document.visibilityState === 'visible') link.connect?.();
  };
  const onPageHide = () => link.close?.();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  link.addEventListener('connection', onConn);
  link.addEventListener('status', onStatus);
  link.addEventListener('line', onLine);
  link.addEventListener('session', onSession);

  const timer = setInterval(() => {
    if (!link.connected) return;
    // the screen in control polls; others see the broadcast, and ask themselves once it goes quiet
    // (an owner that never polls, like a stock WebUI tab, left VIEW ONLY screens reconnecting every 3.6 s)
    if (!viewOnly() || Date.now() - state.lastStatus > VIEW_POLL_MS) link.sendRealtime(RT.STATUS);
    if (state.live && Date.now() - state.lastStatus > STATUS_TIMEOUT_MS) {
      setConnected(false, 'NO DATA');
      msg('No reply from the lathe: reconnecting');
      link.reconnectNow?.();
    }
  }, 200);

  showMode('DRO');
  setConnected(link.connected);
  renderLimits();

  const app = {
    // runs may only start from Idle; returns an error message or null
    idleCheck() {
      if (state.setupError) return 'Tool table could not be read from the lathe: check the connection and try again';
      const st = state.machine?.state ?? 'Unknown';
      return st === 'Idle' ? null : `Machine must be Idle to start (now ${st})`;
    },
    // context for the run pipeline (src/run.js)
    runCtx() {
      return { maxRpm: state.maxRpm, c0: state.machine?.wpos?.[3] ?? 0, setup: state.setup, dryRun: state.dryRun, cWrap: cWrapReady() };
    },
    // T1-frame reading in inches (for touch-off)
    t1Reading,
    tipPosition, backplot, drawBackplot,
    persistSetup, refreshSetup, renderDro, inControl, viewOnly,
    state, link, host, fetchImpl, msg, send, mdi, showMode, // fetchImpl is read through app.fetchImpl
    registerMode(name, impl) { modes.set(name, impl); if (state.mode === name) showMode(name); },
    root,
    addHoldHook(f) { holdHooks.push(f); },
    // program path for the DRO / JOG backplot (set when a program is opened in RUN or started)
    setProgramPath(pts) { state.programPts = pts; drawBackplot(); },
    popup, openBackplot,
    stop() {
      clearInterval(timer);
      popup.stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      link.removeEventListener('connection', onConn);
      link.removeEventListener('status', onStatus);
      link.removeEventListener('line', onLine);
      link.removeEventListener('session', onSession);
    },
  };
  return app;
}
