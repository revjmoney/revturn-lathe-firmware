// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// MDI console: type a line, SEND, see it and the replies in a scrolling log. Up/Down = history.
import { describe } from '../errors.js';
import { on, esc } from './dom.js';

const MAX_LOG = 5000; // whole programs stream in here (Rev: don't skip anything)

export function mountMdi(el, { send }) {
  const log = el.querySelector('[data-mdi-log]');
  const input = el.querySelector('[data-mdi-input]');
  const history = [];
  let pos = 0;

  const add = (text, cls) => {
    const row = document.createElement('div');
    row.className = cls;
    row.innerHTML = esc(text);
    log.appendChild(row);
    while (log.children.length > MAX_LOG) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  };

  const submit = () => {
    const line = input.value.trim();
    if (!line) return;
    if (!send(line)) { add(`(not connected) ${line}`, 'err'); return; }
    add(`> ${line}`, 'in');
    history.push(line);
    pos = history.length;
    input.value = '';
  };

  on(el, '[data-mdi-send]', 'click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp' && history.length) { pos = Math.max(0, pos - 1); input.value = history[pos]; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && history.length) { pos = Math.min(history.length, pos + 1); input.value = history[pos] ?? ''; e.preventDefault(); }
  });

  return {
    reply(line) {
      const cls = line === 'ok' ? 'ok' : /^(error|ALARM)/.test(line) ? 'err' : 'msg';
      add(describe(line), cls);
    },
    note(text) { add(text, 'msg'); },
    run(text) { add(text, 'run'); }, // a line of the running program
  };
}
