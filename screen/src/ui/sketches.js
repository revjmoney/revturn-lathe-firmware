// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Small side-view sketches of each cut (chuck on the left, cut in green).
const svg = (body) => `<svg class="sketch" viewBox="0 0 150 90" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="10" width="18" height="70" fill="#445"/>${body}
<line x1="18" y1="45" x2="150" y2="45" stroke="#557" stroke-dasharray="3 3"/></svg>`;
const part = '<rect x="18" y="20" width="110" height="50" fill="#2a3440" stroke="#8fa"/>';

export const SKETCHES = {
  // review 2026-11-10: bore and drill had no sketch, so the forms showed the word "undefined"
  bore: svg(`${part}<rect x="88" y="36" width="40" height="18" fill="#11171e" stroke="#8fa"/><rect x="88" y="32" width="40" height="4" fill="#7fffb0" opacity=".7"/><rect x="88" y="54" width="40" height="4" fill="#7fffb0" opacity=".7"/>`),
  drill: svg(`${part}<rect x="88" y="40" width="40" height="10" fill="#11171e" stroke="#8fa"/><path d="M146 45 H128 l-8 -5 v10 z" fill="#ffd84a"/>`),
  face: svg(`${part}<rect x="118" y="20" width="10" height="50" fill="#7fffb0" opacity=".7"/><path d="M140 15 v60" stroke="#ffd84a" marker-end=""/>`),
  turn: svg(`${part}<rect x="60" y="20" width="68" height="8" fill="#7fffb0" opacity=".7"/><rect x="60" y="62" width="68" height="8" fill="#7fffb0" opacity=".7"/>`),
  thread: svg(`${part}<path d="M60 20 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6" stroke="#7fffb0" fill="none" stroke-width="2"/>`),
  groove: svg(`${part}<rect x="80" y="20" width="10" height="14" fill="#7fffb0" opacity=".8"/><rect x="80" y="56" width="10" height="14" fill="#7fffb0" opacity=".8"/>`),
  // end view: round stock with the hex the X-C interpolation leaves
  polygon: svg(`<circle cx="84" cy="45" r="32" fill="#2a3440" stroke="#8fa"/><polygon points="112,45 98,69 70,69 56,45 70,21 98,21" fill="#1b2530" stroke="#7fffb0" stroke-width="2"/><path d="M84 8 v8" stroke="#ffd84a" stroke-width="3"/>`),
  index: svg(`<circle cx="84" cy="45" r="30" fill="#2a3440" stroke="#8fa"/><line x1="84" y1="45" x2="105" y2="24" stroke="#7fffb0" stroke-width="3"/>`),
};
