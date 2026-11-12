# Files for the lathe's flash file system

The lathe boots straight to the REVTURN screen at `/`. The stock grblHAL WebUI (ESP3D-WebUI 3.0) is only used for
settings, behind the screen's **WEBUI** button.

Upload these to the lathe's flash file system:

- `webui/index.html.gz` → **`/webui/index.html.gz`** (make the `webui` folder first:
  `http://<lathe>/files?path=%2F&action=createdir&filename=webui`, then upload with the WebUI or a POST to `/files`
  with `path=/webui`). This is ESP3D-WebUI 3.0 (grblHAL build) by Luc Lebosse, GPL v3, with only its page title
  changed to "REVTURN Settings (grblHAL)". **Do not put an `index.html.gz` in the root**: the web server serves a
  root `index.html.gz` for `/` before the REVTURN screen gets a chance.
- `preferences.json` → `/preferences.json`: hides the WebUI's jog, spindle, status, override, probe and laser
  panels (REVTURN does those), adds a **REVTURN** tab to its top bar, and picks the REVTURN theme.
- `webui/theme-revturn` → **`/theme-revturn`** (plain CSS, no `.gz`): the REVTURN look for the stock WebUI (logo,
  dark bezel, black panels and inputs, blue soft keys, credit line). `preferences.json` selects it by default
  (`"theme": "theme-revturn"`). Rebuild it with `node make-theme.mjs` from `theme-revturn.src.css`. All the original grblHAL and ESP3D
  branding sits in a **POWERED BY** box at the right of the header (the logos are the WebUI's own artwork, pulled out of
  its build by `node extract-logos.mjs` into `logo-grblhal.svg` / `logo-esp3d.svg`; (c) their owners). It must stay
  uncompressed: the lathe serves a `.gz` file as a raw download, and the WebUI would inject compressed bytes as CSS.
- `golathe.html` → `/golathe.html`: what the REVTURN tab shows, one big **OPEN REVTURN** button back to `/`.

REVTURN by **[JMSCNC](https://jmscnc.com)**. Copyright 2026 JMSCNC / Rev. J. Money.
