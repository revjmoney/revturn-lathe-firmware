# REVTURN by JMSCNC: lathe control screen

A conversational-control style screen for the REVTURN lathe (grblHAL on an ESP32), served from the lathe itself.
Copyright 2026 JMSCNC / Rev. J. Money ([jmscnc.com](https://jmscnc.com)).

**Open it:** http://revturn.local/ or http://revturn.local/ (phone, tablet or PC on the home WiFi). The lathe boots
straight to REVTURN. The stock grblHAL WebUI (settings) is behind the **WEBUI** button, at `/webui/`.
**ABOUT** shows the version, the JMSCNC copyright and the grblHAL / ESP3D-WebUI credits.

## What it does
- DRO: X (diameter), Z, and the spindle line: `S <rpm> FWD/REV` while the spindle runs, `C <angle>°` when it is off.
- Keypad: `X 1.25 ABS SET` sets the reading; `INC SET` adds to it. ZERO X / Z / C / ALL.
- HOLD (feed hold; GO resumes) and STOP (soft reset; then send `$X`). On a phone they sit in a bar at the bottom.
- MDI console under the keypad (Up/Down for history; errors shown in plain words).
- JOG: step 0.0001 / 0.001 / 0.01 / 0.1 in (C: 0.1 / 1 / 5 / 15 deg) or CONT (hold to move).
- Keyboard jog: Left = Z- (toward the chuck), Right = Z+, Up = X+ (away from you), Down = X-, Page Up / Page Down = C+ / C-. Uses the same step or CONT setting, speed and limits as the jog buttons (step = one jog per press, CONT = moves while held). Ignored while typing in a box.
- CYCLES: Face, Turn (taper option), Thread (Z+C sync, no encoder), Groove / part-off, Index.
  GO previews, GO again uploads `cycle.nc` and runs it from the lathe's flash.
- PROG / EDIT / RUN: programs of several steps saved on the lathe as `<name>.json` + `<name>.nc`.

All feeds are inches per minute. Every generated program starts `G7 G18 G20 G90 G94`.

## Built into the firmware
`lathe.html.gz` is compiled into the grblHAL firmware (`F:\micro-lathe\firmware\ESP32\main\embedded\`,
registered in `esp_webui/fs_embedded.c`; `webui/server.c` falls back to `/embedded/<page>.gz`).
`npm run build` refreshes that copy; rebuild and flash the firmware to ship it.
`npm run deploy` puts a copy on the lathe's flash instead, for quick tests: **a flash copy wins over the
firmware copy**, so delete it afterwards (`/files?path=%2F&action=delete&filename=lathe.html.gz`).

**One screen at a time:** grblHAL hands the grbl stream to the first WebSocket client only. A second
open screen (or the ESP3D WebUI) connects but receives nothing (shows NO DATA) until the first closes.
The page lets go of the connection when it is hidden or closed (phone locked, tab switched) and
reconnects when shown, so another screen can take over. A browser that is killed (not closed) can leave
a stale owner until the lathe times it out.

## Develop
```
npm_config_cache=F:\micro-lathe\.cache\npm npm install
npm test            # vitest, all logic + jsdom UI tests
npm run build       # dist/lathe.html(.gz), one self-contained file
npm run deploy      # FTP upload to revturn.local and check it is served
node tools/probe.mjs            # live: print one status report from the lathe
node tools/files-probe.mjs      # live: upload / read / delete a test file
```
The page talks to grblHAL over `ws://<lathe>:81/` (subprotocol `webui-v3`, binary frames).
To test the page from elsewhere use `lathe.html?host=revturn.local`.
The Claude desktop app's built-in browser pane cannot open that WebSocket; use a real browser.

Design: `docs/2026-11-08-lathe-control-screen-design.md`. Plan: `docs/superpowers/plans/`.
