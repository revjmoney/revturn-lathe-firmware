# REVTURN license and attribution notice

**REVTURN by JMSCNC**
Copyright (C) 2026 Rev. J. Money / JMSCNC (https://jmscnc.com)

Everything in this repository that Rev. J. Money / JMSCNC made is free software and free hardware, licensed
under the **GNU General Public License version 3, or (at your option) any later version** (GPL-3.0-or-later).
The full license text is in [`LICENSE`](LICENSE). This covers:

- the REVTURN changes to the grblHAL firmware (`main/`, `rev-patches/`, `sdkconfig.revturn_lathe` and the
  REVTURN board map)
- the REVTURN screen: full source in `screen/` and the build that ships inside the firmware, and the WebUI
  branding files (`webui-files/`)
- the printed parts: STL, STEP, drawings and FreeCAD sources and scripts (`hardware/`)
- the tools, test programs, test data, charts and findings (`tools/`, `docs/`)
- the website (`site/`)

## Attribution (additional term under GPLv3 section 7(b))

As permitted by section 7(b) of the GPL v3, the following additional term applies to the REVTURN work:

> You must keep the author attribution **"REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC
> (jmscnc.com)"** intact in every copy and every modified version: in the source file notices, in this
> NOTICE file, and in the about screen, documentation or product listing of anything you build, print, sell
> or share from it. You may add your own notice for your changes next to it, and you must mark your version
> as modified.

The attribution may not be removed, and it may not be used to suggest that JMSCNC endorses a modified
version. (The names REVTURN and JMSCNC identify the original work; changed versions should say they are
changed.)

## Other people's work in this repository

These parts are NOT by JMSCNC and keep their own authors' licenses and notices:

- **grblHAL** by Terje Io and contributors, GPL v3 or later (see `COPYING` and `README-grblHAL.md`)
- **ESP3D-WebUI** 3.0 by Luc Lebosse, GPL v3 (`webui-files/webui/index.html.gz`)
- **littlefs** (`main/littlefs/`), BSD 3-Clause, and any other third-party files with their own headers
- **"Ode to Joy"** (Beethoven, 1824) used in the music tests is in the public domain
