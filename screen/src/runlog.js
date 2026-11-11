// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Stream the running program's g-code into the console (Rev 2026-11-09). grblHAL runs the file from flash
// ($F=) and puts the executing line number in status reports (Ln:). The screen reads that same file back
// from the lathe once per run, so it works on any screen, also VIEW ONLY or after a reload mid-run.
// Every line up to Ln is printed in order, none skipped (Rev: "don't skip anything"); only empty lines,
// which hold nothing, are left out.
// emit(text, kind): kind 'note' for messages, undefined for a program line "N  text".

export function createRunLog({ fetchLines, emit }) {
  let file = null;      // file of the current run
  let lines = null;     // its lines once read, or [] if it could not be read
  let loading = null;   // promise while reading
  let shown = 0;        // last line number printed
  let pendingLn = 0;    // highest Ln seen while the file was still loading
  let failed = false;

  const printUpTo = (ln) => {
    const last = Math.min(ln, lines.length);
    for (let n = shown + 1; n <= last; n++) {
      const t = lines[n - 1].trim();
      if (t) emit(`${n}  ${t}`);
    }
    if (last > shown) shown = last;
  };

  const start = (name) => {
    file = name; lines = null; shown = 0; pendingLn = 0; failed = false;
    emit(`(running ${name})`, 'note');
    loading = fetchLines(name).then(
      (ls) => { lines = ls.map((l) => l.replace(/\r$/, '')); loading = null; if (pendingLn) printUpTo(pendingLn); },
      () => { lines = []; loading = null; failed = true; emit(`(could not read ${name} to show its lines)`, 'note'); },
    );
  };

  return {
    onStatus(s) {
      if (!s?.sd) {
        if (file) { emit('(program ended)', 'note'); file = null; lines = null; }
        return;
      }
      const name = s.sd.file.replace(/^\//, '');
      if (name !== file) start(name);
      if (!Number.isInteger(s.ln) || failed) return;
      if (loading || !lines) { pendingLn = Math.max(pendingLn, s.ln); return; }
      printUpTo(s.ln);
    },
  };
}
