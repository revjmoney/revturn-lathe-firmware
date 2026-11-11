# REVTURN Lathe Control Screen: Design

Date: 2026-11-08. Owner: Rev. J. Money. Status: draft for Rev's approval.

## 1. Intent and why

Rev wants his mini CNC lathe to feel like a classic shop **conversational control**: a dark
screen with big readouts, mode keys along the bottom, a keypad beside it. Rev showed photos
of one as the reference. He wants to use it from a **phone, a tablet mounted by the machine,
or the PC**. At the machine he will use it to **set up and run a part program**, run **canned
cycles**, and do **conversational programming** (answer prompts, the screen writes the g-code).

The reference is a look and feel only. **The screen must not use the ProtoTRAK name,
logo or trade dress literally**: our own design in that style, branded REVTURN.

Approved mockup: `F:\micro-lathe\.superpowers\brainstorm\1848-1794160108\content\dro-screen-v2.html`.

## 2. The machine (facts, from `D:\brain\Projects\Micro Lathe CNC.md`)

- Controller: **grblHAL on an ESP32** (DevKit in a screw-terminal breakout), board name
  "REVTURN lathe ESP32". Firmware source `F:\micro-lathe\firmware\ESP32`, build with
  `F:\micro-lathe\firmware\pio-venv\Scripts\pio.exe run -e revturn_lathe`.
- Axes: `AXS:4:XYZC`. **The machine is X (cross slide), Z (along bed), C (chuck).** Y exists
  only because grbl always has X, Y, Z; it is parked and must never appear in this UI.
- Lathe mode on (`$32=2`). Boots in **G8 radius** mode; in **G7** grblHAL doubles X in the
  status report and adds `|D:1`. C arrives as the 4th value in MPos/WPos.
- **Spindle is a stepper** that is either a spindle or the C axis (stepper-spindle plugin,
  `$677=7`, default spindle `$395=1`): **M3/M4 Sxx** spins it (S = chuck rpm, currently max
  40 rpm, `$30=40`), **M5** hands the motor back as the C axis (degrees). A PWM spindle also
  exists as spindle 0 (`$395=0`), unused for now.
- **Threading needs no encoder**: a thread is a coordinated `G1 Z.. C..` move (pitch = Z
  travel per 360 deg of C). Rotary fix is on. Keep C absolute and monotonically increasing
  across passes so each pass starts at the same angle.
- Network: home WiFi, **http://revturn.local**, hotspot fallback 192.168.5.1. Flash file
  system (LittleFS) is mounted at `/`; files upload by FTP (`curl -T file ftp://revturn.local/`)
  or HTTP POST `/files`. The ESP3D WebUI 3.0 is installed as `/index.html.gz` and stays.
- WebSocket: `ws://<ip>:81/`, subprotocol **`webui-v3`**. In this protocol the grbl stream
  travels in **binary frames** (both directions); text frames are claimed by the WebUI plugin
  for `PING:` only. HTTP `GET /command?cmd=...` also sends a line. Verified 2026-11-08: a Node
  WebSocket client opens with `webui-v3` and receives the grblHAL banner. **The Claude desktop
  app's built-in browser pane fails this WebSocket (code 1006)**; test in a real browser.
- **Directions (Rev, 2026-11-08):** tool on the **front** of the cross slide; **X+ moves the tool
  away from the centerline**; **Z+ moves away from the chuck**; **Z0 = part face**, cuts run toward Z-.
  Every cycle retracts to +X then +Z.
- **C after spindle use:** M5 folds the spindle's step count back into the C position (sync
  position flag of `$677`; seen 2026-11-01: C read 74.048 deg after `M3 S20` / `M5`), so C stays a
  real absolute position. The 0-360 display is display-only; commanded C stays absolute.
- **Program runner already in firmware:** `[PLUGIN:FS stream v1.16]` is present, so grblHAL runs a
  saved `.nc` file **from its own flash** (no line streaming from the browser; a sleeping phone or
  dropped WiFi cannot starve a cut). Clients only poll status.
- Units Rev uses: **inches**. Steps: X 400/mm, Z 2000/mm (unmeasured), C 48.889 steps/deg
  (20T:110T belt, unconfirmed).

## 3. Goals (first version)

1. **DRO screen** (always visible): X (diameter by default), Z, and the **spindle line**:
   - spindle running (M3/M4): `S <rpm> RPM FWD|REV`
   - spindle off / C axis (M5): `C <angle>°` (0-360 display)
   - plus a status bar (machine state IDLE/RUN/HOLD/ALARM, units, DIA/RAD, plane), feed,
     feed override, tool number, and a message line for alarms/errors.
2. **Mode keys** along the bottom of the screen: **DRO, JOG, PROG, EDIT, SET UP, RUN, CYCLES**.
3. **Keypad** beside the screen: digits, `.`, `+/-`, X, Z, S/C, **ABS SET / INC SET**,
   ENTER, **GO** (green), and **two stop keys (Rev's choice)**:
   - **HOLD** (amber): feed hold `!`; motion pauses, spindle keeps turning; **GO resumes** (`~`).
     During a jog it sends jog-cancel (0x85).
   - **STOP** (red): full stop: soft reset (0x18) which halts motion and the spindle, then the
     screen tells the user grblHAL needs unlock (`$X`) and the zeros should be checked.
   Both keys are on every screen, including on the phone layout.
4. **Zero buttons**: ZERO X, ZERO Z, ZERO C, ZERO ALL (set the current work offset so the
   axis reads 0). **Typed set**: `X 1.250 ABS SET` makes X read Ø1.250 at the current position
   (the usual way to set X after measuring a cut). Uses G10 L20 P0.
5. **JOG mode**: hold-to-move X+/X-/Z+/Z-/C+/C-; step sizes 0.0001 / 0.001 / 0.01 / 0.1 in
   plus continuous; jog feed selectable; uses grblHAL `$J=` jogging; releasing the button or
   STOP sends jog-cancel (realtime 0x85). C jog in degrees.
6. **MDI console** under the keypad: scrolling log of sent lines and replies (`ok`, `error:N`
   with the text meaning, `ALARM`), an input line and SEND. Command history (up/down).
7. **Conversational cycles (CYCLES)**: each cycle is a fill-in form with a small sketch of
   the cut. **GO** generates g-code, shows a toolpath preview and the code, then runs on a
   second GO. Cycles in v1:
   - **Face**: start diameter, end diameter (default 0 = center), Z start, total depth, depth
     per pass, feed, rpm.
   - **Turn (OD)**: start diameter, finish diameter, Z start, length, depth per pass, finish
     allowance, finish feed, roughing feed, rpm; optional end diameter for a **taper**.
   - **Thread**: TPI or pitch, major diameter, thread depth (default computed from pitch),
     Z start, length, number of passes (decreasing depth), spring passes, external/internal,
     rpm. Generated as synchronized `G1 Z.. C..` moves with C absolute and increasing.
   - **Groove**: diameter, Z position, width, depth, peck, feed, rpm; **part-off** =
     groove to center.
   - **Index**: go to angle, or N equal positions (step with GO); always M5 first.
8. **PROG / EDIT / RUN**: a program is an ordered list of cycle steps (and optional raw g-code
   blocks), saved as a file on the lathe's flash. EDIT changes steps; RUN shows the program,
   preview, and runs it with GO / feed hold (STOP) / resume.
9. **Same page on phone, tablet and PC**: landscape tablet/PC as in the mockup; phone stacks
   screen, keypad, then MDI.

## 4. Non-goals (v1)

Bore/ID turning, drilling/peck drilling, taper as its own cycle, tool tables beyond "tool 1",
constant surface speed (G96), G76, firmware changes, replacing the ESP3D WebUI, cloud/accounts.

## 5. Anti-goals (would make it a failure even if it works)

- Any motion Rev did not ask for: GO must always be the trigger for generated moves; no
  auto-run on load; STOP must work from every screen.
- Silently wrong numbers: X must clearly say DIA or RAD; units must always be visible.
- Copying ProtoTRAK branding.
- Needing anything installed on the phone/tablet/PC.

## 6. Decided how (Claude's calls, Rev may override)

- **Diameter mode always**: the screen sends `G7` on connect and every generated program starts
  with `G7 G18 G20 G90 G94`. X is shown and typed as diameter everywhere (DRO, ABS SET, cycles).
- **Feeds are inches per minute (Rev's choice)** in every cycle field (G94). The cycle form also
  shows the matching inches/rev for reference (IPM / rpm).
- **Running**: RUN saves the generated program to flash and starts it with grblHAL's file runner;
  the browser never streams lines. More than one screen may be open (tablet + phone): all of them
  read status; any of them can HOLD/STOP.

- **One static web app served from the lathe** (LittleFS), e.g. `/lathe.html` (gzip), next to
  the WebUI. No build server needed on the machine side. Plain HTML/CSS/JS (no framework
  required; a small bundler is fine if kept to one output file).
- Talks to grblHAL over the **WebUI v3 WebSocket** (binary frames) and/or `/command`. Polls
  status with the realtime `?` and parses `<...>` reports.
- **Cycles are generated in the browser** as plain g-code; nothing new in firmware.
- Program files: JSON (cycle list) + generated `.nc`, stored on the lathe flash.
- Source lives in `F:\micro-lathe\lathe-ui\` (new); deploy = upload the built file by FTP.

## 7. Left to the builder

Exact generated toolpaths per cycle (safe retracts, lead-in), preview drawing, styling details
within the mockup's look, file naming, error-code text table, how jog buttons repeat on touch.
