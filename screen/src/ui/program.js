// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// PROG (list / new / open / delete), EDIT (steps), RUN (run the saved program from the lathe's flash).
import { compileProgram, safeName, sanitizeImport, checkProgram } from '../program.js';
import { prepareProgram } from '../run.js';
import { toolById } from '../setup.js';
import { listFiles, uploadFile, deleteFile, readFile, runLine } from '../files.js';
import { FIELDS, NAMES, renderForm, readForm, defaults, ctxFrom } from './cycles.js';
import { toolpath } from './preview.js';
import { h, on, esc } from './dom.js';
import { programmedAt, lineAtPct, createSpeedMeter } from '../feeds.js';
import { OVR_HTML } from '../app.js';

const ADD = [...Object.keys(FIELDS), 'gcode'];
const label = (c) => NAMES[c] ?? 'G-CODE';

export function registerProgram(app) {
  const prog = { current: null, saved: false, selected: null };
  app.program = prog;
  const changed = () => { prog.saved = false; };

  // ---------- PROG ----------
  const mountProg = (panel) => {
    const view = h(`<div>
      <div class="form" style="margin-bottom:8px"><label>New program name<input name="progName" placeholder="part name"></label></div>
      <div class="picker"><button data-prog-new>NEW</button><button data-prog-open>OPEN</button><button data-prog-delete>DELETE</button><button data-prog-import>IMPORT</button></div>
      <input type="file" data-import-file accept=".nc,.tap,.ngc,.gcode,.txt" hidden>
      <div class="list" data-prog-list><div class="soon">Loading programs…</div></div></div>`);
    panel.appendChild(view);
    const refresh = async () => {
      const box = view.querySelector('[data-prog-list]');
      try {
        const names = (await listFiles(app.host, app.fetchImpl)).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
        box.innerHTML = names.length ? names.map((n) => `<div class="item${n === prog.selected ? ' sel' : ''}" data-prog-item="${esc(n)}"><span>${esc(n)}</span></div>`).join('') : '<div class="soon">No programs saved yet</div>';
      } catch (err) { box.innerHTML = `<div class="soon">${esc(err.message)}</div>`; }
    };
    on(view, '[data-prog-item]', 'click', (e, el) => {
      prog.selected = el.dataset.progItem;
      for (const it of view.querySelectorAll('[data-prog-item]')) it.classList.toggle('sel', it === el);
    });
    on(view, '[data-prog-import]', 'click', () => view.querySelector('[data-import-file]').click());
    view.querySelector('[data-import-file]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
      const s = sanitizeImport(text);
      if (s.error) { app.msg(s.error); return; }
      prog.current = { name: safeName(file.name.replace(/\.[^.]+$/, '')), steps: [{ cycle: 'gcode', params: { text: s.text } }] };
      prog.saved = false;
      app.showMode('EDIT');
      app.msg(s.warnings.length ? `Imported with warnings: ${s.warnings.join('; ')}` : `Imported ${file.name}: SAVE, then RUN (try DRY RUN first)`);
    });
    on(view, '[data-prog-new]', 'click', () => {
      const name = safeName(view.querySelector('[name="progName"]').value);
      prog.current = { name, steps: [] };
      prog.saved = false;
      app.showMode('EDIT');
      app.msg(`New program ${name}: add steps`);
    });
    on(view, '[data-prog-open]', 'click', async () => {
      if (!prog.selected) { app.msg('Pick a program first'); return; }
      try {
        const checked = checkProgram(JSON.parse(await readFile(app.host, `${prog.selected}.json`, app.fetchImpl)), prog.selected);
        if (!checked.ok) { app.msg(`Could not open ${prog.selected}: ${checked.error}`); return; }
        prog.current = checked.program;
        prog.saved = true;
        app.showMode('EDIT');
      } catch (err) { app.msg(`Could not open ${prog.selected}: ${err.message}`); }
    });
    on(view, '[data-prog-delete]', 'click', async () => {
      const name = prog.selected;
      if (!name) { app.msg('Pick a program first'); return; }
      if (!window.confirm(`Delete program ${name} from the lathe? This cannot be undone.`)) return;
      try {
        await deleteFile(app.host, `${name}.json`, app.fetchImpl);
        await deleteFile(app.host, `${name}.nc`, app.fetchImpl);
        if (prog.current?.name === name) prog.current = null;
        prog.selected = null;
        app.msg(`${name} deleted`);
        refresh();
      } catch (err) { app.msg(err.message); }
    });
    refresh();
  };

  // ---------- EDIT ----------
  let editing = null; // index of the step whose form is open
  const mountEdit = (panel) => {
    if (!prog.current) {
      // Rev 2026-11-11: EDIT goes big even with nothing open
      const host = app.popup?.open('editor', 'PROGRAM EDITOR');
      const note = h('<div><div class="soon">No program open: start or open one in PROG</div><button class="bigopen" data-goto-prog>▣ GO TO PROG</button></div>');
      on(note, '[data-goto-prog]', 'click', () => app.showMode('PROG'));
      (host ?? panel).appendChild(note);
      return;
    }
    // Rev 2026-11-09: the editor opens in its own DOS-style window over the whole screen (no DRO / jog needed while editing)
    // review 2026-11-10: the listener goes on this mount's own element; on the persistent panel it piled up one
    // per EDIT visit, and OPEN EDITOR then built the editor that many times
    const box = h('<div><div class="soon">The program editor is open in its window.</div><button class="bigopen" data-open-editor>▣ OPEN EDITOR</button></div>');
    panel.appendChild(box);
    on(box, '[data-open-editor]', 'click', () => openEditor());
    openEditor();
  };
  const openEditor = () => {
    const host = app.popup ? app.popup.open('editor', `PROGRAM EDITOR: ${prog.current.name}`) : null;
    if (!host) return;
    const view = h(`<div class="editwin">
      <div class="msg" style="color:#8fb3ff">PROGRAM ${esc(prog.current.name)}${prog.saved ? '' : ' (not saved)'}</div>
      <div class="picker">${ADD.map((c) => `<button data-add="${c}">+ ${label(c)}</button>`).join('')}<button class="go" data-save>SAVE</button></div>
      <div class="editcols"><div class="list" data-steps></div>
      <div data-step-form-wrap></div></div></div>`);
    host.appendChild(view);
    const render = () => {
      view.querySelector('[data-steps]').innerHTML = prog.current.steps.map((s, i) => `<div class="item${i === editing ? ' sel' : ''}" data-pstep="${i}">
        <span>${i + 1}. ${label(s.cycle)}</span><button class="btn" data-pstep-up="${i}">▲</button><button class="btn" data-pstep-del="${i}">✕</button></div>`).join('')
        || '<div class="soon">No steps yet</div>';
      const wrap = view.querySelector('[data-step-form-wrap]');
      wrap.innerHTML = '';
      if (editing === null || !prog.current.steps[editing]) return;
      const step = prog.current.steps[editing];
      const form = step.cycle === 'gcode'
        ? h(`<div><div class="form gcodeform"><label>G-code<textarea class="gcodebox" name="text" rows="18" spellcheck="false">${esc(step.params.text ?? '')}</textarea></label></div></div>`)
        : renderForm(step.cycle, step.params);
      form.setAttribute('data-step-form', '');
      wrap.appendChild(form);
      wrap.appendChild(h('<div class="picker" style="margin-top:8px"><button data-step-apply>APPLY STEP</button></div>'));
    };
    on(view, '[data-add]', 'click', (e, b) => {
      const c = b.dataset.add;
      prog.current.steps.push({ cycle: c, params: c === 'gcode' ? { text: '' } : defaults(c) });
      editing = prog.current.steps.length - 1;
      changed(); render();
    });
    on(view, '[data-pstep]', 'click', (e, el) => {
      if (e.target.closest('[data-pstep-up], [data-pstep-del]')) return;
      editing = Number(el.dataset.pstep); render();
    });
    on(view, '[data-pstep-up]', 'click', (e, b) => {
      const i = Number(b.dataset.pstepUp);
      if (i > 0) { const s = prog.current.steps; [s[i - 1], s[i]] = [s[i], s[i - 1]]; editing = i - 1; changed(); render(); }
    });
    on(view, '[data-pstep-del]', 'click', (e, b) => {
      prog.current.steps.splice(Number(b.dataset.pstepDel), 1);
      editing = null; changed(); render();
    });
    const applyStep = () => {
      const form = view.querySelector('[data-step-form]');
      if (editing === null || !form || !prog.current.steps[editing]) return false;
      const step = prog.current.steps[editing];
      step.params = step.cycle === 'gcode' ? { text: form.querySelector('[name="text"]').value } : readForm(form, step.cycle);
      changed();
      return true;
    };
    on(view, '[data-step-apply]', 'click', () => { if (applyStep()) app.msg(`Step ${editing + 1} updated`); });
    on(view, '[data-save]', 'click', async () => {
      applyStep(); // review 2026-11-10: SAVE used to ignore edits not yet applied with APPLY STEP
      const r = compileProgram(prog.current, ctxFrom(app));
      if (!r.ok) { app.msg(r.error); if (r.stepIndex !== undefined) { editing = r.stepIndex; render(); } return; }
      try {
        app.msg('Saving to the lathe…');
        await uploadFile(app.host, `${prog.current.name}.json`, JSON.stringify(prog.current, null, 1), app.fetchImpl);
        await uploadFile(app.host, `${prog.current.name}.nc`, r.lines.join('\n') + '\n', app.fetchImpl);
        prog.saved = true;
        app.msg(`${prog.current.name} saved`);
      } catch (err) { app.msg(err.message); }
    });
    render();
  };

  // ---------- RUN ----------
  let runLines = null, runView = null;
  const stepAt = (pct) => {
    if (!runLines) return '';
    const idx = Math.min(runLines.length - 1, Math.floor((pct / 100) * runLines.length));
    let label = '';
    const total = runLines.filter((l) => /^\(STEP \d+:/.test(l)).length;
    for (let i = 0; i <= idx; i++) {
      const m = /^\(STEP (\d+): (\w+)\)/.exec(runLines[i]);
      if (m) label = `STEP ${m[1]} of ${total}: ${NAMES[m[2]] ?? 'G-CODE'}`;
    }
    return label;
  };
  const mountRun = (panel) => {
    runView = null;
    // no program open: still show the live backplot (jogs, MDI)
    const r = prog.current ? compileProgram(prog.current, ctxFrom(app)) : { ok: false, error: '' };
    runLines = r.ok ? r.lines : null;
    if (runLines) app.setProgramPath?.(toolpath(runLines)); // DRO / JOG backplot shows the open program too
    const title = prog.current ? `RUN ${esc(prog.current.name)}: GO starts, HOLD pauses, GO resumes` : 'No program open: use PROG to open one';
    // Rev 2026-11-11: RUN is a big window too, with the DRO as one line across the top (about 20 % of it),
    // then the live backplot beside the code (app draws every [data-backplot] / [data-dro] / [data-progress])
    const view = h(`<div class="runwin">
      <div class="runbar"><span class="rbi"><span><b>X</b><span data-dro="x">0.0000</span><i data-dro="xt">DIA</i></span><small data-fd="x"></small></span>
        <span class="rbi"><span><b>Z</b><span data-dro="z">0.0000</span><i>ABS</i></span><small data-fd="z"></small></span>
        <span class="rbi rbsp"><span><b data-dro="sl">C</b><span data-dro="sv">0.00°</span><i data-dro="st"></i></span><small data-fd="s"></small></span></div>
      ${OVR_HTML}
      <div class="msg" style="color:#8fb3ff">${title}</div>
      <div class="runstep" data-run-step></div><div class="progress" data-progress></div>
      <div class="runcols"><canvas class="preview bpbig" data-backplot></canvas><div class="code runcode" data-code></div></div></div>`);
    panel.appendChild(view);
    runView = view;
    meter.reset();
    showFeeds(app.state.machine);
    app.renderDro?.();
    requestAnimationFrame?.(() => app.drawBackplot?.()); // after layout, so the canvas has its size
    if (r.ok) view.querySelector('[data-code]').textContent = r.lines.join('\n');
    else view.querySelector('[data-code]').textContent = r.error;
    redrawRun();
  };
  // program path (dim) + traced backplot (bright) + live tool, refreshed on every status report
  const redrawRun = () => {
    if (!runView) return; // the backplot itself is the popup window now (app draws it on every status)
  };
  // Rev 2026-11-11: small set / actual line under each DRO reading. Set = F / S in effect at the running line
  // (times the override); actual = the axis's own speed from position changes (with accel), the spindle's rpm.
  const meter = createSpeedMeter();
  const showFeeds = (s) => {
    if (!runView || !s) return;
    const st = app.state;
    const kIn = st.reportUnits === 'in' ? 1 : 1 / 25.4;
    const xRad = (s.wpos[0] * kIn) / (s.diameter ? 2 : 1); // real slide travel, not diameter
    const v = meter.update([xRad, s.wpos[2] * kIn, s.wpos[3]], Date.now());
    const mm = st.units === 'mm';
    const u = mm ? 'mm/min' : 'ipm', k = mm ? 25.4 : 1, dp = mm ? 0 : 2;
    const fOv = s.ov?.[0] ?? 100, sOv = s.ov?.[2] ?? 100;
    const p = s.sd && runLines ? programmedAt(runLines, lineAtPct(runLines.length, s.sd.pct)) : { f: null, s: null, inverse: false };
    const pct = (o) => (o === 100 ? '' : ` (${o}%)`);
    const setF = p.inverse ? 'inv time' : p.f == null ? '--' : `${((p.f * fOv) / 100 * k).toFixed(dp)}${pct(fOv)}`;
    const put = (key, t) => { const e = runView.querySelector(`[data-fd="${key}"]`); if (e) e.textContent = t; };
    put('x', `set ${setF} · act ${(v.x * k).toFixed(dp)} ${u}`);
    put('z', `set ${setF} · act ${(v.z * k).toFixed(dp)} ${u}`);
    const spinning = s.spindle === 'cw' || s.spindle === 'ccw';
    const setS = p.s == null ? '--' : `${Math.round((p.s * sOv) / 100)}${pct(sOv)}`;
    put('s', `set ${setS} · act ${Math.round(spinning ? s.rpm : v.c)} rpm`);
  };
  const onRunStatus = (s) => {
    if (!runView) return;
    showFeeds(s);
    runView.querySelector('[data-run-step]').textContent = s?.sd ? stepAt(s.sd.pct) : '';
    redrawRun();
  };
  let runBusy = false;
  const runGo = async () => {
    if (runBusy) return; // review 2026-11-10: a double GO used to upload and start twice
    runBusy = true;
    try { await runGoOnce(); } finally { runBusy = false; }
  };
  const runGoOnce = async () => {
    if (!prog.current) { app.msg('No program open'); return; }
    if (!prog.saved) { app.msg('Save the program first (EDIT, SAVE)'); return; }
    if (!(await app.refreshSetup())) return;
    const busy = app.idleCheck();
    if (busy) { app.msg(busy); return; }
    // compile now, with the current C, tools, stroke limits and dry run
    const r = prepareProgram(prog.current, app.runCtx());
    if (!r.ok) { app.msg(r.error); return; }
    const file = `${prog.current.name}${app.state.dryRun ? '_dry' : ''}.nc`;
    try {
      app.msg('Sending program to the lathe…');
      await uploadFile(app.host, file, r.lines.join('\n') + '\n', app.fetchImpl);
      runLines = r.lines;
      app.setProgramPath?.(toolpath(r.lines));
      if (app.send(runLine(file))) app.msg(`${prog.current.name} running${app.state.dryRun ? ' (DRY RUN)' : ''}`);
    } catch (err) { app.msg(err.message); }
  };

  app.registerMode('PROG', { mount: mountProg });
  app.registerMode('EDIT', { mount: (p) => { editing = null; mountEdit(p); } });
  app.registerMode('RUN', { mount: mountRun, onGo: runGo, onStatus: onRunStatus });
}
