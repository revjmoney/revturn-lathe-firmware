// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// SETTINGS (Rev 2026-11-11): every grblHAL setting in the REVTURN look, built from the controller's own
// description ($EG groups, $ES settings, $$ values, $SED=n help, $I machine info), so nothing is left out.
// The stock WebUI stays one tap away (footer link) for anything else.
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
import { T, parseGroup, parseSetting, parseValue, parseDescr, parseAxes, checkValue, sameValue, inchHint, groupTree } from '../settings.js';
import { h, on, esc } from './dom.js';

const INFO = -1; // the MACHINE INFO page in the group list

export function registerSettings(app, { webuiUrl = '/webui/#/settings/machine' } = {}) {
  const groups = new Map(), meta = new Map(), values = new Map(), descr = new Map();
  const edits = new Map(); // id -> typed / picked value (string), not saved yet
  let axes = 'XYZC', info = [], infoOpen = false, group = null, search = '', view = null, loaded = false, timer = null;

  // ---------- lathe output ----------
  const onLine = (e) => {
    const line = e.detail;
    let r;
    if ((r = parseGroup(line))) groups.set(r.id, r);
    else if ((r = parseSetting(line))) meta.set(r.id, r);
    else if ((r = parseValue(line))) values.set(r.id, r.value);
    else if ((r = parseDescr(line))) { descr.set(r.id, r.text); showDescr(r.id); return; }
    else if ((r = parseAxes(line))) { axes = r; if (infoOpen) info.push(line); }
    else if (infoOpen && /^\[.*\]$/.test(line)) info.push(line);
    else if (infoOpen && line === 'ok') { infoOpen = false; }
    else return;
    later();
  };
  app.link.addEventListener('line', onLine);
  // opened before the link was up (or it dropped and came back): read everything once connected
  const onConn = (e) => { if (e.detail?.connected && view?.isConnected) load(false); else render(); };
  app.link.addEventListener('connection', onConn);
  const later = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

  const load = (full) => {
    if (full || !loaded) { app.send('$EG'); app.send('$ES'); loaded = true; }
    info = []; infoOpen = true;
    app.send('$I');
    app.send('$$');
  };

  // ---------- screen ----------
  const mount = (panel) => {
    view = h(`<div class="setwin">
      <div class="setcols">
        <div class="setnav">
          <input class="setsearch" data-set-search placeholder="Search: name or $ number" value="${esc(search)}">
          <div data-set-groups></div>
        </div>
        <div class="setmain" data-set-main><div class="soon">Reading settings from the lathe…</div></div>
      </div>
      <div class="setfoot">
        <button class="go" data-set-save data-needs-link>SAVE CHANGES</button>
        <button data-set-undo>UNDO</button>
        <button data-set-reload data-needs-link>RELOAD</button>
        <button data-set-backup>BACKUP</button>
        <button class="hold" data-set-reboot data-needs-link>REBOOT</button>
        <span class="setnote" data-set-note></span>
        <a class="setwebui" data-webui href="${webuiUrl}" title="The stock grblHAL WebUI (files, console, everything else)">grblHAL WebUI ↗</a>
      </div></div>`);
    panel.appendChild(view);

    on(view, '[data-set-group]', 'click', (e, b) => { group = Number(b.dataset.setGroup); search = ''; view.querySelector('[data-set-search]').value = ''; render(); });
    view.querySelector('[data-set-search]').addEventListener('input', (e) => { search = e.target.value.trim(); render(); });
    on(view, '[data-set-pick]', 'click', (e, b) => { const [id, v] = b.dataset.setPick.split(':'); edit(Number(id), v); });
    on(view, '[data-set-bit]', 'click', (e, b) => {
      const [id, bit] = b.dataset.setBit.split(':').map(Number);
      const cur = Number(current(id)) || 0;
      edit(id, String(cur ^ (1 << bit)));
    });
    view.addEventListener('input', (e) => {
      const id = e.target.dataset?.setInput;
      if (id === undefined) return;
      const s = meta.get(Number(id));
      if (s.type === T.PASS && e.target.value === '') edits.delete(s.id); else edits.set(s.id, e.target.value);
      markRow(s.id); renderFoot();
    });
    on(view, '[data-set-help]', 'click', (e, b) => {
      const id = Number(b.dataset.setHelp);
      const box = view.querySelector(`[data-set-descr="${id}"]`);
      if (!box) return;
      box.hidden = !box.hidden;
      if (!box.hidden && !descr.has(id)) { box.textContent = 'Asking the lathe…'; app.send(`$SED=${id}`); }
      showDescr(id);
    });
    on(view, '[data-set-save]', 'click', save);
    on(view, '[data-set-undo]', 'click', () => { edits.clear(); render(); app.msg('Changes undone'); });
    on(view, '[data-set-reload]', 'click', () => { edits.clear(); load(true); app.msg('Reading settings from the lathe'); });
    on(view, '[data-set-backup]', 'click', backup);
    on(view, '[data-set-reboot]', 'click', reboot);

    if (app.link.connected) load(false);
    render();
  };

  const current = (id) => (edits.has(id) ? edits.get(id) : values.get(id) ?? '');
  const edit = (id, v) => { edits.set(id, v); if (sameValue(meta.get(id), v, values.get(id))) edits.delete(id); renderRow(id); renderFoot(); };
  const changed = () => [...edits].filter(([id, v]) => {
    const s = meta.get(id);
    return s && !(s.type === T.PASS && v === '') && !sameValue(s, v, values.get(id));
  });

  // ---------- drawing ----------
  const render = () => {
    if (!view?.isConnected) return;
    const tree = groupTree([...groups.values()], [...meta.values()]);
    if (group === null && tree.length) group = tree[0].id;
    view.querySelector('[data-set-groups]').innerHTML = tree.map((g) => `<button class="setg${g.depth ? ' sub' : ''}${g.id === group && !search ? ' on' : ''}" data-set-group="${g.id}">${esc(g.name)}${dirty(g.id) ? ' •' : ''}</button>`).join('')
      + `<button class="setg info${group === INFO && !search ? ' on' : ''}" data-set-group="${INFO}">MACHINE INFO</button>`;
    const main = view.querySelector('[data-set-main]');
    if (!meta.size) { main.innerHTML = `<div class="soon">${app.link.connected ? 'Reading settings from the lathe…' : 'Not connected to the lathe'}</div>`; renderFoot(); return; }
    let list, title;
    if (search) {
      const q = search.toLowerCase().replace(/^\$/, '');
      list = [...meta.values()].filter((s) => String(s.id).startsWith(q) || s.name.toLowerCase().includes(q));
      title = `${list.length} found for "${esc(search)}"`;
    } else if (group === INFO) {
      main.innerHTML = `<div class="sethead">MACHINE INFO <small>what the lathe reports about itself ($I)</small></div>
        <div class="setinfo">${info.map((l) => `<div>${esc(l.replace(/^\[|\]$/g, '').replace(':', ': '))}</div>`).join('') || '<div class="soon">Reading…</div>'}</div>`;
      renderFoot();
      return;
    } else {
      list = [...meta.values()].filter((s) => s.group === group);
      title = esc(groups.get(group)?.name ?? '');
    }
    list.sort((a, b) => a.id - b.id);
    main.innerHTML = `<div class="sethead">${title}</div>` + list.map(rowHtml).join('');
    renderFoot();
  };
  const dirty = (gid) => changed().some(([id]) => meta.get(id)?.group === gid);

  const rowHtml = (s) => `<div class="srow${isChanged(s.id) ? ' changed' : ''}" data-set-row="${s.id}">${rowInner(s)}</div>`;
  const isChanged = (id) => changed().some(([i]) => i === id);
  const rowInner = (s) => {
    const v = current(s.id);
    const ck = edits.has(s.id) ? checkValue(s, edits.get(s.id)) : { ok: true };
    return `<div class="shead"><span class="snum">$${s.id}</span><span class="sname">${esc(s.name)}</span>
        ${s.reboot ? '<span class="sreb" title="Takes effect after a REBOOT">REBOOT</span>' : ''}
        <button class="shelp" data-set-help="${s.id}" title="What this does">?</button></div>
      <div class="sedit">${editor(s, v)}</div>
      ${ck.ok ? '' : `<div class="serr">${esc(ck.error)}</div>`}
      <div class="sdesc" data-set-descr="${s.id}" hidden>${esc(descr.get(s.id) ?? '')}</div>`;
  };
  const editor = (s, v) => {
    const pick = (val, label, on) => `<button class="schip${on ? ' on' : ''}" data-set-pick="${s.id}:${val}">${esc(label)}</button>`;
    const bits = (labels) => labels.map((l, i) => (l === 'N/A' ? '' : `<button class="schip${(Number(v) >> i) & 1 ? ' on' : ''}"${s.type === T.XBITS && i > 0 && !(Number(v) & 1) ? ' disabled' : ''} data-set-bit="${s.id}:${i}">${esc(l)}</button>`)).join('');
    switch (s.type) {
      case T.BOOL: return pick(0, 'OFF', v === '0') + pick(1, 'ON', v === '1');
      case T.RADIO: return s.labels.map((l, i) => (l === 'N/A' ? '' : pick(i, l, Number(v) === i))).join('');
      case T.BITS: case T.XBITS: return bits(s.labels);
      case T.AXES: return bits(axes.split(''));
      case T.PASS: return `<input type="password" class="sinput" data-set-input="${s.id}" placeholder="(unchanged)" value="${esc(edits.get(s.id) ?? '')}" autocomplete="new-password">`;
      default: {
        const hint = inchHint(s.unit, v);
        return `<input class="sinput${s.type === T.STR || s.type === T.IP ? ' wide' : ''}" data-set-input="${s.id}" value="${esc(v)}"${s.type === T.INT || s.type === T.DEC ? ' inputmode="decimal"' : ''}>
          <span class="sunit">${esc(s.unit)}</span>${hint ? `<span class="shint">= ${hint}</span>` : ''}`;
      }
    }
  };
  const renderRow = (id) => {
    const row = view?.querySelector(`[data-set-row="${id}"]`);
    const s = meta.get(id);
    if (!row || !s) return;
    const open = !row.querySelector('[data-set-descr]')?.hidden;
    row.innerHTML = rowInner(s);
    row.classList.toggle('changed', isChanged(id));
    if (open) { row.querySelector('[data-set-descr]').hidden = false; }
  };
  // a typed value: only the marks change (re-drawing the row would steal the cursor)
  const markRow = (id) => {
    const row = view?.querySelector(`[data-set-row="${id}"]`);
    const s = meta.get(id);
    if (!row || !s) return;
    row.classList.toggle('changed', isChanged(id));
    const ck = edits.has(id) ? checkValue(s, edits.get(id)) : { ok: true };
    let err = row.querySelector('.serr');
    if (ck.ok) err?.remove();
    else { if (!err) { err = document.createElement('div'); err.className = 'serr'; row.querySelector('.sedit').after(err); } err.textContent = ck.error; }
    const hint = row.querySelector('.shint'), hv = inchHint(s.unit, current(id));
    if (hint) hint.textContent = hv ? `= ${hv}` : '';
  };
  const renderFoot = () => {
    if (!view) return;
    const n = changed().length;
    view.querySelector('[data-set-save]').textContent = n ? `SAVE CHANGES (${n})` : 'SAVE CHANGES';
    view.querySelector('[data-set-note]').textContent = n ? `${n} not saved yet` : '';
  };
  const showDescr = (id) => {
    const box = view?.querySelector(`[data-set-descr="${id}"]`);
    if (box && descr.has(id)) box.textContent = descr.get(id).replace(/\\n/g, '\n');
  };

  // ---------- actions ----------
  const idle = () => {
    const st = app.state.machine?.state;
    if (st !== 'Idle') { app.msg(`Settings can only change while the lathe is Idle (now ${st ?? 'unknown'})`); return false; }
    return true;
  };
  const save = () => {
    const list = changed();
    if (!list.length) { app.msg('Nothing to save'); return; }
    for (const [id, v] of list) {
      const ck = checkValue(meta.get(id), v);
      if (!ck.ok) { app.msg(`$${id} ${meta.get(id).name}: ${ck.error}`); return; }
    }
    if (!idle()) return;
    let sent = 0;
    for (const [id, v] of list) { if (app.send(`$${id}=${checkValue(meta.get(id), v).value}`)) sent++; }
    if (!sent) return;
    const reboot = list.some(([id]) => meta.get(id).reboot);
    edits.clear();
    app.send('$$'); // read back what the lathe kept
    app.msg(`${sent} setting${sent === 1 ? '' : 's'} sent${reboot ? ': some need a REBOOT to take effect' : ''}`);
    render();
  };
  const reboot = () => {
    if (!idle()) return;
    if (!window.confirm('Restart the lathe controller now? The screen reconnects by itself.')) return;
    app.send('$REBOOT');
    app.msg('Restarting the lathe controller…');
  };
  const backup = () => {
    if (!values.size) { app.msg('No settings read yet'); return; }
    const lines = [...values].sort((a, b) => a[0] - b[0])
      .filter(([id]) => meta.get(id)?.type !== T.PASS) // passwords never leave the lathe
      .map(([id, v]) => `$${id}=${v}${meta.get(id) ? ` ; ${meta.get(id).name}` : ''}`);
    const text = `; REVTURN by JMSCNC settings backup ${new Date().toISOString()}\n; paste lines into MDI to restore (without the ; notes)\n${lines.join('\n')}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `revturn-settings-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    app.msg(`Backup saved (${lines.length} settings, passwords left out)`);
  };

  app.registerMode('SETTINGS', { mount });
  return { stop() { app.link.removeEventListener('line', onLine); app.link.removeEventListener('connection', onConn); clearTimeout(timer); }, state: { meta, values, edits } };
}
