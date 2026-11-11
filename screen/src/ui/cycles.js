// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// CYCLES screen: pick a cycle, fill the form, GO = preview, GO again = upload cycle.nc and run it.
// renderForm / readForm are reused by the program editor.
import { prepareCycle } from '../run.js';
import { uploadFile, runLine } from '../files.js';
import { toolpath, drawPreview } from './preview.js';
import { SKETCHES } from './sketches.js';
import { h, on, esc } from './dom.js';

export const NAMES = { face: 'FACE', turn: 'TURN', bore: 'BORE', thread: 'THREAD', groove: 'GROOVE', drill: 'DRILL', polygon: 'POLYGON', index: 'INDEX' };
const TOOL = ['tool', 'Tool (T1-T8, blank = active)', '', 'opt'];

// [name, label, default, kind] kind: 'num' (default) | 'opt' (optional number) | 'bool'
export const FIELDS = {
  face: [['startDia', 'Start dia (in)', 1], ['endDia', 'End dia (in)', 0, 'opt'], ['zStart', 'Z start (in)', 0],
    ['depth', 'Total depth (in)', 0.02], ['step', 'Depth per pass (in)', 0.01], ['feed', 'Feed (in/min)', 2], ['rpm', 'RPM', 30], TOOL],
  turn: [['startDia', 'Start dia (in)', 1], ['finishDia', 'Finish dia (in)', 0.75], ['endDia', 'Taper end dia (in, blank = straight)', '', 'opt'],
    ['zStart', 'Z start (in)', 0], ['length', 'Length (in)', 0.5], ['step', 'Depth per pass (in)', 0.02],
    ['finishAllow', 'Finish allowance (in)', 0.005], ['roughFeed', 'Rough feed (in/min)', 2], ['finishFeed', 'Finish feed (in/min)', 1], ['rpm', 'RPM', 30],
    ['chamfer', 'End chamfer (in, blank = none)', '', 'opt'], ['radius', 'End radius (in, blank = none)', '', 'opt'], TOOL],
  bore: [['startDia', 'Hole dia now (in)', 0.5], ['finishDia', 'Finish dia (in)', 0.625], ['zStart', 'Z start (in)', 0], ['length', 'Depth (in)', 0.5],
    ['step', 'Depth per pass (in)', 0.01], ['finishAllow', 'Finish allowance (in)', 0.003], ['roughFeed', 'Rough feed (in/min)', 1.5], ['finishFeed', 'Finish feed (in/min)', 0.8], ['rpm', 'RPM', 30], TOOL],
  thread: [['tpi', 'TPI (blank = use pitch)', 20, 'opt'], ['pitch', 'Pitch (in)', '', 'opt'], ['majorDia', 'Major dia (in)', 0.25],
    ['depth', 'Thread depth (in, blank = auto)', '', 'opt'], ['zStart', 'Z start (in)', 0], ['length', 'Length (in)', 0.5],
    ['passes', 'Passes', 6], ['springPasses', 'Spring passes', 1], ['leadIn', 'Lead-in (in)', 0.1], ['internal', 'Internal', false, 'bool'], ['rpm', 'RPM', 20], TOOL],
  groove: [['dia', 'Diameter (in)', 0.5], ['z', 'Z of +Z wall (in)', -0.5], ['width', 'Width (in)', 0.1], ['depth', 'Depth (in, = radius parts off)', 0.05],
    ['peck', 'Peck (in)', 0.02], ['toolWidth', 'Tool width (in)', 0.08], ['feed', 'Feed (in/min)', 0.5], ['rpm', 'RPM', 20], TOOL],
  drill: [['zStart', 'Z start (in)', 0], ['depth', 'Depth (in)', 0.5], ['peck', 'Peck (in, 0 = none)', 0.1], ['feed', 'Feed (in/min)', 0.5], ['rpm', 'RPM', 30], TOOL],
  // X-C interpolation: chuck turns slowly in C mode, X follows the flats, Z feeds; normal lathe tool (Rev 2026-11-09)
  polygon: [['sides', 'Sides', 6], ['flats', 'Across flats (in)', 0.5], ['stockDia', 'Stock dia (in)', 0.625],
    ['zStart', 'Z start (in)', 0], ['length', 'Length (in)', 0.25], ['step', 'Depth per pass (in)', 0.02],
    ['feedRev', 'Z feed per C turn (in)', 0.01], ['cRpm', 'C RPM (slow)', 10], ['perSide', 'Points per side', 6],
    ['startAngle', 'Start angle (deg)', 0, 'opt'], TOOL],
  index: [['angle', 'Angle (deg)', 90, 'opt'], ['divisions', 'Divisions (blank = use angle)', '', 'opt'], ['step', 'Position number', '', 'opt']],
};

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function renderForm(cycle, values = {}) {
  const fields = FIELDS[cycle].map(([name, label, def, kind]) => {
    const v = values[name] ?? def;
    if (kind === 'bool') return `<label>${esc(label)}<select name="${name}"><option value="0"${v ? '' : ' selected'}>No</option><option value="1"${v ? ' selected' : ''}>Yes</option></select></label>`;
    return `<label>${esc(label)}<input name="${name}" inputmode="decimal" value="${esc(v ?? '')}"></label>`;
  });
  return h(`<div>${SKETCHES[cycle]}<div class="form" data-form="${cycle}">${fields.join('')}</div></div>`);
}

export function readForm(el, cycle) {
  const p = {};
  for (const [name, , , kind] of FIELDS[cycle]) {
    const raw = el.querySelector(`[name="${name}"]`)?.value?.trim() ?? '';
    if (kind === 'bool') p[name] = raw === '1';
    else if (raw === '') p[name] = undefined;
    else p[name] = Number(raw);
  }
  // integer fields arrive as numbers already; NaN flows to validation ("must be a number")
  return p;
}

export function defaults(cycle) {
  const p = {};
  for (const [name, , def, kind] of FIELDS[cycle]) p[name] = kind === 'bool' ? !!def : def === '' ? undefined : def;
  return p;
}

export const ctxFrom = (app) => app.runCtx();

export function registerCycles(app) {
  let cycle = store.get('revturn.cycle') ?? 'face';
  let armed = null; // generated lines waiting for the second GO
  let view = null;

  const mount = (panel) => {
    view = h(`<div>
      <div class="picker">${Object.keys(FIELDS).map((c) => `<button data-cycle="${c}">${NAMES[c]}</button>`).join('')}</div>
      <div data-form-wrap></div>
      <div data-preview-wrap hidden><canvas class="preview" data-preview></canvas><div class="code" data-code></div></div>
    </div>`);
    panel.appendChild(view);
    on(view, '[data-cycle]', 'click', (e, b) => pick(b.dataset.cycle));
    view.addEventListener('input', disarm);
    view.addEventListener('change', disarm);
    pick(cycle);
  };

  const disarm = () => {
    armed = null;
    if (view) view.querySelector('[data-preview-wrap]').hidden = true;
  };

  const pick = (c) => {
    cycle = c;
    store.set('revturn.cycle', c);
    for (const b of view.querySelectorAll('[data-cycle]')) b.classList.toggle('on', b.dataset.cycle === c);
    const wrap = view.querySelector('[data-form-wrap]');
    wrap.innerHTML = '';
    wrap.appendChild(renderForm(c, store.get(`revturn.form.${c}`) ?? {}));
    disarm();
    app.msg(`${NAMES[c]}: fill in, GO to preview`);
  };

  let goBusy = false;
  const onGo = async () => {
    if (goBusy) return; // review 2026-11-10: a double GO re-armed the cycle with the preview hidden
    goBusy = true;
    try { await onGoOnce(); } finally { goBusy = false; }
  };
  const onGoOnce = async () => {
    if (!view) return;
    if (!(await app.refreshSetup())) return; // tool table / limits may have changed on another screen
    if (armed) {
      const busy = app.idleCheck();
      if (busy) { app.msg(busy); return; }
      armed = null;
      // regenerate now: C, tools, limits or dry run may have changed since the preview
      const fresh = prepareCycle(cycle, readForm(view, cycle), ctxFrom(app));
      if (!fresh.ok) { app.msg(fresh.error); view.querySelector('[data-preview-wrap]').hidden = true; return; }
      const lines = fresh.lines;
      try {
        app.msg('Sending cycle to the lathe…');
        await uploadFile(app.host, 'cycle.nc', [...lines, 'M30', ''].join('\n'), app.fetchImpl);
        if (app.send(runLine('cycle.nc'))) app.msg(`${NAMES[cycle]} running`);
      } catch (err) {
        app.msg(err.message);
      }
      view.querySelector('[data-preview-wrap]').hidden = true;
      return;
    }
    const params = readForm(view, cycle);
    const r = prepareCycle(cycle, params, ctxFrom(app));
    if (!r.ok) { app.msg(r.error); return; }
    store.set(`revturn.form.${cycle}`, params);
    const wrap = view.querySelector('[data-preview-wrap]');
    wrap.hidden = false;
    view.querySelector('[data-code]').textContent = r.lines.join('\n');
    drawPreview(view.querySelector('[data-preview]'), toolpath(r.lines));
    armed = r.lines;
    app.msg(`${app.state.dryRun ? 'DRY RUN preview' : 'Preview'} shown: GO again to run, or change the form`);
  };

  app.registerMode('CYCLES', { mount, onGo, onDryRun: () => { disarm(); app.msg(`DRY RUN ${app.state.dryRun ? 'on' : 'off'}: GO to preview again`); } });
}
