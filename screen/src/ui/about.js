// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// REVTURN by JMSCNC: brand art and the ABOUT window.
// Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
import chuckIcon from '../brand/icon-48.png';
import header from '../brand/header-120.png';
import monkeyBig from '../brand/monkey-320.png';
import { h } from './dom.js';

export const BRAND = {
  name: 'REVTURN',
  by: 'JMSCNC',
  site: 'https://jmscnc.com',
  chuckIcon,
  header,
  monkeyBig,
  // set by the build (tools/build.mjs); plain "dev" when running from source
  version: typeof __REVTURN_VERSION__ === 'string' ? __REVTURN_VERSION__ : 'dev',
  built: typeof __REVTURN_BUILT__ === 'string' ? __REVTURN_BUILT__ : '',
};

// top bar lockup: monkey, REVTURN, by JMSCNC
export const BRAND_HTML = `<span class="brand"><img src="${chuckIcon}" alt="" class="brandimg"><b>REVTURN</b><small>by JMSCNC</small></span>`;

export const aboutHtml = () => `<div class="about">
  <img src="${monkeyBig}" alt="JMSCNC monkey" class="aboutimg">
  <div class="abouttext">
    <img src="${header}" alt="REVTURN by JMSCNC" class="aboutheader">
    <p>CNC lathe control: the REVTURN screen, firmware and printed parts.</p>
    <p class="aboutver">Screen ${BRAND.version}${BRAND.built ? ` · built ${BRAND.built}` : ''}</p>
    <p>© 2026 JMSCNC · Rev. J. Money · <a href="${BRAND.site}" target="_blank" rel="noopener">jmscnc.com</a></p>
    <a class="coffee" href="https://buymeacoffee.com/revjmoney" target="_blank" rel="noopener">☕ BUY ME A COFFEE</a>
    <p class="aboutlinks">REVTURN on <a href="https://github.com/revjmoney/revturn-lathe-firmware" target="_blank" rel="noopener">GitHub</a>
      · <a href="https://revjmoney.github.io/revturn-lathe-firmware/" target="_blank" rel="noopener">website</a>
      · <a href="https://jmscnc.com/revturn/" target="_blank" rel="noopener">jmscnc.com/revturn</a></p>
    <div class="lbl2">BUILT ON</div>
    <ul>
      <li><b>grblHAL</b> motion controller firmware, © Terje Io and contributors, GNU GPL v3.
        REVTURN's firmware changes © 2026 JMSCNC, same license.
        <a href="https://github.com/grblHAL" target="_blank" rel="noopener">github.com/grblHAL</a></li>
      <li><b>ESP3D-WebUI</b> (the settings page behind WEBUI), © Luc Lebosse, GNU GPL v3.
        <a href="https://github.com/luc-github/ESP3D-WEBUI" target="_blank" rel="noopener">github.com/luc-github/ESP3D-WEBUI</a></li>
      <li>Printed parts by Rev. J. Money, CC BY-SA 4.0.</li>
    </ul>
  </div></div>`;

export function openAbout(popup) {
  if (popup.kind === 'about') { popup.close(); return; } // the ABOUT button toggles it
  popup.open('about', 'ABOUT REVTURN').appendChild(h(aboutHtml()));
}
