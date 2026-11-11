// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// SET UP (also the old TOOL screen, merged 2026-11-11): tool select + tool table (ProtoTRAK-style, offsets relative to T1) with touch-off, and stroke limits.
// Saved to the lathe as /setup.json so every screen uses the same table.
import { touchOffset, normalizeSetup } from '../setup.js';
import { h, on, esc } from './dom.js';

const f4 = (n) => Number(n).toFixed(4);

export function registerSetup(app) {
  let view = null;

  const mount = (panel) => {
    const s = app.state.setup;
    // Rev 2026-11-11: TOOL and SET UP are one screen: the big T button on each row makes that tool active
    const rows = s.tools.map((t) => `<div class="trow">
      <button class="tsel${t.n === s.activeTool ? " on" : ""}" data-tool="${t.n}" title="Make T${t.n} the active tool">T${t.n}</button>
      <input name="t${t.n}desc" value="${esc(t.desc)}" placeholder="description"${t.n === 1 ? ' readonly' : ''}>
      <label>X dia off<input name="t${t.n}dx" inputmode="decimal" value="${f4(t.dx)}"${t.n === 1 ? ' readonly' : ''}></label>
      <label>Z off<input name="t${t.n}dz" inputmode="decimal" value="${f4(t.dz)}"${t.n === 1 ? ' readonly' : ''}></label>
      ${t.n === 1 ? '<span class="soon">reference tool</span>' : `<button class="btn" data-touch="${t.n}:X" data-needs-link>TOUCH X</button><button class="btn" data-touch="${t.n}:Z" data-needs-link>TOUCH Z</button>`}
    </div>`).join('');
    const L = s.limits;
    view = h(`<div>
      <div class="lbl2">TOOLS: tap a T to make it the active tool (lit). Offsets from T1, inches: tip reads T1 position minus offset</div>
      <div class="ttable">${rows}</div>
      <div class="lbl2">STROKE LIMITS (work coordinates, X as diameter; used only when the LIMITS switch is ON)</div>
      <div class="form">
        <label>X max (dia)<input name="xMax" inputmode="decimal" value="${L.xMax}"></label>
        <label>X min (dia)<input name="xMin" inputmode="decimal" value="${L.xMin}"></label>
        <label>Z max<input name="zMax" inputmode="decimal" value="${L.zMax}"></label>
        <label>Z min (toward chuck)<input name="zMin" inputmode="decimal" value="${L.zMin}"></label>
      </div>
      <div class="picker" style="margin-top:8px"><button class="go" data-setup-save data-needs-link>SAVE SET UP</button></div>
    </div>`);
    panel.appendChild(view);

    on(view, '[data-touch]', 'click', (e, b) => {
      const [n, axis] = b.dataset.touch.split(':');
      const tool = app.state.setup.tools[Number(n) - 1];
      const what = axis === 'X' ? 'Measured DIAMETER at this tool tip (in)' : 'Z of this tool tip (in, face = 0)';
      const raw = window.prompt(`T${n} touch-off: ${what}`);
      if (raw === null) return;
      const v = Number(raw);
      if (!Number.isFinite(v)) { app.msg('Touch-off cancelled: not a number'); return; }
      const off = touchOffset(app.t1Reading(axis), v);
      if (axis === 'X') tool.dx = off; else tool.dz = off;
      view.querySelector(`[name="t${n}d${axis.toLowerCase()}"]`).value = f4(off);
      app.msg(`T${n} ${axis} offset ${f4(off)}: SAVE SET UP to keep it`);
    });

    on(view, '[data-setup-save]', 'click', async () => {
      const read = (name) => view.querySelector(`[name="${name}"]`).value.trim();
      const raw = {
        tools: app.state.setup.tools.map((t) => ({ n: t.n, desc: read(`t${t.n}desc`), dx: Number(read(`t${t.n}dx`)), dz: Number(read(`t${t.n}dz`)) })),
        limits: { enabled: app.state.setup.limits.enabled === true, xMax: Number(read('xMax')), xMin: Number(read('xMin')), zMax: Number(read('zMax')), zMin: Number(read('zMin')) },
        activeTool: app.state.setup.activeTool,
      };
      for (const t of raw.tools.slice(1)) {
        if (!Number.isFinite(t.dx) || read(`t${t.n}dx`) === '') { app.msg(`T${t.n} X offset must be a number`); return; }
        if (!Number.isFinite(t.dz) || read(`t${t.n}dz`) === '') { app.msg(`T${t.n} Z offset must be a number`); return; }
      }
      const L = raw.limits;
      if (![L.xMax, L.xMin, L.zMax, L.zMin].every(Number.isFinite) || L.xMax <= L.xMin || L.zMax <= L.zMin) {
        app.msg('Stroke limits: max must be more than min'); return;
      }
      app.state.setup = normalizeSetup(raw);
      app.renderDro();
      await app.persistSetup();
      app.msg('Set up saved to the lathe');
    });
  };

  app.registerMode('SET UP', { mount });
}
