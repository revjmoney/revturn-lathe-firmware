// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// REVTURN by JMSCNC website. Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
// Screen gallery driven by soft keys (like the real control), a zoom window, and the section soft bar.
const SHOTS = [
  ['DRO', 'screen-dro.png', 'The home screen: big X (diameter), Z and C / spindle readout, jog pad, ZERO keys, GO TO ZERO, jog step and speed, spindle on / stop with a live rpm slider, T1 to T8.'],
  ['RUN', 'screen-run.png', 'RUN: a one-line DRO across the top with the programmed and actual feed and rpm under each reading, overrides, the live backplot beside the program.'],
  ['CYCLES', 'screen-cycles-thread.png', 'CYCLES: threading by Z and C sync. Fill in TPI or pitch, length and passes; the first GO previews the toolpath and the g-code, GO again cuts it.'],
  ['TURN', 'screen-cycles-turn.png', 'Turning cycle with taper, chamfer and radius options and a sketch of what the numbers mean.'],
  ['FACE', 'screen-cycles-face.png', 'Facing cycle: start and end diameter, depth per pass, feed and rpm.'],
  ['PROG', 'screen-prog.png', 'PROG: programs saved on the lathe. New, open, delete, or import a Fusion 360 lathe post.'],
  ['EDIT', 'screen-edit.png', 'EDIT: chain cycles and raw g-code steps into one program, reorder them, save to the lathe.'],
  ['SET UP', 'screen-setup.png', 'SET UP: the tool table. Tap a T to make it the active tool; touch off X and Z; stroke limits.'],
  ['SETTINGS', 'screen-settings-x-axis.png', 'SETTINGS: every grblHAL setting, read from the controller itself, with inch conversions next to the metric values.'],
  ['FLAGS', 'screen-settings-general.png', 'Bit settings are chips, choices are buttons, numbers are boxes: the right control for every kind of setting.'],
  ['SPINDLE', 'screen-settings-spindle.png', 'Spindle settings: stepper spindle or PWM router, ramps, at-speed tolerance.'],
  ['SEARCH', 'screen-settings-search.png', 'Search every setting by name or $ number.'],
  ['BACKPLOT', 'screen-backplot.png', 'BACKPLOT: the path the tool tip really took, from live position reports, on any screen.'],
  ['ABOUT', 'screen-about.png', 'ABOUT: REVTURN by JMSCNC, the version, and the credits.'],
];

const keys = document.querySelector('[data-keys]');
const img = document.querySelector('[data-shot]');
const cap = document.querySelector('[data-cap]');
const show = (i) => {
  const [name, file, text] = SHOTS[i];
  img.src = `media/${file}`;
  img.alt = `REVTURN ${name} screen`;
  cap.innerHTML = `<b>${name}</b> ${text}`;
  for (const b of keys.children) b.classList.toggle('on', Number(b.dataset.i) === i);
};
SHOTS.forEach(([name], i) => {
  const b = document.createElement('button');
  b.textContent = name; b.dataset.i = i; b.setAttribute('role', 'tab');
  b.addEventListener('click', () => show(i));
  keys.appendChild(b);
});
show(0);

// a strip of every shot under the big one (all screens at a glance)
const strip = document.createElement('div');
strip.className = 'thumbs';
SHOTS.forEach(([name, file], i) => {
  const t = document.createElement('img');
  t.src = `media/${file}`; t.alt = `REVTURN ${name}`; t.loading = 'lazy';
  t.addEventListener('click', () => { show(i); img.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  strip.appendChild(t);
});
img.closest('.body').appendChild(strip);

// zoom window
const dlg = document.querySelector('[data-zoom]');
const zimg = document.querySelector('[data-zoom-img]');
document.addEventListener('click', (e) => {
  const z = e.target.closest('.zoomable');
  if (!z || !dlg.showModal) return;
  zimg.src = z.currentSrc || z.src; zimg.alt = z.alt;
  document.querySelector('[data-zoom-title]').textContent = `[ ${(z.alt || 'REVTURN').toUpperCase().slice(0, 60)} ]`;
  dlg.showModal();
});
document.querySelector('[data-zoom-close]').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// light up the soft key of the section on screen
const soft = [...document.querySelectorAll('.softbar a[href^="#"]')];
const io = new IntersectionObserver((ents) => {
  for (const en of ents) if (en.isIntersecting) for (const a of soft) a.classList.toggle('on', a.getAttribute('href') === `#${en.target.id}`);
}, { rootMargin: '-45% 0px -50% 0px' });
for (const a of soft) { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); }
