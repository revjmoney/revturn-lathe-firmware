# REVTURN by JMSCNC: a touch-screen CNC lathe controller on an ESP32

A mini CNC lathe running **grblHAL** on an ESP32, with a **ProtoTRAK / Fanuc style control screen built into
the firmware**. Open `http://revturn.local/` (or the lathe's IP) on a phone, a tablet by the machine, or a PC: it boots
straight to REVTURN. The stock grblHAL WebUI is still there for settings, behind the **WEBUI** button (`/webui/`).
No app, no sender, no cloud.

REVTURN is made by **[JMSCNC](https://jmscnc.com)** (Rev. J. Money). Copyright 2026 JMSCNC / Rev. J. Money.

**🌐 [Website](https://revjmoney.github.io/revturn-lathe-firmware/) · [jmscnc.com/revturn](https://jmscnc.com/revturn/) · [Buy a preflashed board ($125)](https://jmscnc.com/product/revturn-lathe-controller/) · [☕ Buy me a coffee](https://buymeacoffee.com/revjmoney)**

> **⚠ BETA:** the conversational cycles have not been cut-tested on real stock yet. Preview first (the first GO only previews), run DRY RUN in the air, set your stroke limits and turn LIMITS on, and do a scratch pass before threading to check the thread direction. Their g-code is checked by automated tests and every axis has run on the REVTURN lathe, but no cycle has cut material yet.

![REVTURN RUN screen](site/media/screen-run.png)

From the maker of **[RotatoCAM](https://rotatocam.com)**: 4- and 3-axis CAM for DIY CNC. *Spin the stock. Read the signal.*

[![Buy me a coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/revjmoney)

## ▶ Watch it run

**[First test run with all 3 motors linked together (YouTube, 10 min)](https://www.youtube.com/watch?v=2WnQ3KHcuW8)**: X, Z and the
chuck (C) in synced moves, nonstop spindle speed and direction changes, and a C-axis threading cycle.

[![REVTURN first run with all 3 motors linked](https://img.youtube.com/vi/2WnQ3KHcuW8/hqdefault.jpg)](https://www.youtube.com/watch?v=2WnQ3KHcuW8)

☕ Like where this is going? **[Buy me a coffee](https://buymeacoffee.com/revjmoney)** and help keep the junk-bin lathe turning.

> **⚠ This is a junk-bin build, not a kit.** The lathe is 3D printed and put together from whatever was laying
> around the shop:
> - the rails came from a 3018 CNC upgrade and a scrapped 3D printer;
> - the headstock (spindle and chuck) is an AliExpress unit;
> - one stepper came out of a Cricut cutter and one is a StepperOnline motor.
>
> So **the STLs and every machine setting here are tuned to those exact parts.** If you build one, expect to adjust
> the printed parts to your own rails, screws, bearings and motors, and to re-calibrate:
> - steps per mm/degree, measured on your machine (see [the settings table](#machine-settings-calibrated-on-the-real-lathe));
> - driver current for your motors;
> - speeds and acceleration for whatever belts and pulleys you end up with.
>
> Treat this as a starting point to adapt, not a drop-in.

![DRO](site/media/screen-dro.png)

## The screen

| | |
|---|---|
| ![Thread cycle with preview](site/media/screen-cycles-thread.png) **Conversational cycles**: face, turn (with chamfer / radius), bore, thread, groove, peck drill, **polygon (hex flats by X-C interpolation with the normal lathe tool)**, index. Fill in the form, GO previews the toolpath, GO again runs it. | ![RUN with live backplot](site/media/screen-run.png) **Programs and live backplot**: chain cycles and raw g-code into a program, import Fusion lathe posts, watch the tool trace over the planned path with a live tool marker. |
| ![Tool table and stroke limits](site/media/screen-setup.png) **SET UP**: T1 to T8 tool table with touch-off (offsets from T1) and stored stroke limits (switched on and off with the LIMITS key, off by default), saved on the lathe so every screen shares them. | ![Settings](site/media/screen-settings-x-axis.png) **SETTINGS**: every grblHAL setting, read from the controller, with help text, search, backup and reboot. Jog from the pad beside the DRO, the keyboard arrows (Page Up / Down for C) or the WiFi pendant. |

<img src="site/media/screen-phone.png" width="260" align="right" alt="Phone layout">

**Machine-like controls everywhere**
- DRO in diameter (X) and Z, with C shown as **RPM in spindle mode** or **degrees in C-axis mode**.
- ZERO X / Z / C / ALL on every screen (Idle only), ABS SET / INC SET keypad, MDI console.
- HOLD and STOP always on screen. Any connected screen can HOLD or STOP the machine; extra screens show the
  live machine in VIEW ONLY.
- Feed / spindle / rapid overrides, DRY RUN (air cut, spindle off), alarm explain + RESET / UNLOCK.
- Tool changes stop the program with a "CHANGE TO T2" message; GO continues.
- Got a rotary axis on your mill too? **[RotatoCAM](https://rotatocam.com)** turns STL and STEP parts into 4-axis
  rotary toolpaths, with a grblHAL post.

<br clear="right">

## The machine
- X (cross slide, diameter), Z (carriage), C (chuck: a NEMA 23 that is either the **spindle** under M3/M4 or a
  **rotary C axis**), TB6600 drivers at 16x microstepping (8x on the chuck).
- ESP32 DevKit (WROOM-32), WiFi to the shop network, WebUI v3, screen served from flash.
- The lathe boots to the REVTURN screen. **SETTINGS** on the screen shows every grblHAL setting; the stock WebUI is a
  link inside it (at `/webui/`, with a REVTURN tab back; upload [`webui-files/`](webui-files/) to the flash file system).
- The chuck goes back to C zero the short way at the end of every program (grblHAL rotary wrap, `$538`) instead of
  unwinding hundreds of turns, the same rotary problem **[RotatoCAM](https://rotatocam.com)** deals with on 4-axis mills.

## Printed parts
The bed ends and the cross slide are 3D printed, original designs, STL + STEP in [`hardware/`](hardware/) with a parts
list, hardware list and the printing lessons learned building it.

![R9 cross slide drawings](hardware/drawings/drawings_r9.png)

**Option for X:** a direct-drive cross slide (R8) with the motor in line on a 1:1 Oldham coupler, no belt. It has shorter X travel (49 mm). See [hardware/README.md](hardware/README.md#option-direct-drive-x-r8-11-coupler).

Printing a set from these files? **[Buy me a coffee](https://buymeacoffee.com/revjmoney)** ☕ it keeps the designs coming.
Designed in FreeCAD; the rotary CAM side of the shop is **[RotatoCAM](https://rotatocam.com)**.

## Machine settings (calibrated on the real lathe)
grblHAL stores these in flash, not in the source, so after flashing a blank board send them from the MDI or a
serial terminal. Axis values are in mm and degrees (grblHAL's native units); the screen works in inches.

| Setting | Value | What it is |
|---|---|---|
| `$32` | 2 | Lathe mode (X in diameter, G7/G8) |
| `$100` | 800 | X steps/mm: **measured** (X-2 on diameter moved 0.5 in real at 400, so doubled); 8 mm T8 screw |
| `$102` | 1932 | Z steps/mm at **32x** microstepping (Rev 2026-11-11, to cut the Z buzz at cutting feeds; 966 at 16x was **measured**: 0.99 in per commanded inch on calipers); belt to an 8 mm T8 screw |
| `$103` | 13.333 | C steps/deg: C driver at **8x** microstepping (26.667 at 16x, measured: one commanded turn = exactly one chuck turn); 20T to 120T belt |
| `$110` / `$112` | 635 / 558.8 | X / Z max rate, mm/min: X **25 in/min**, Z **22 in/min** (Rev, 2026-11-11: the phone resonance sweep showed Z shaking violently at 25 ipm, about 1900 motor rpm, likely near stalling; 14 to 22 ipm is Z's smooth band). Caps feeds, rapids and jogs |
| `$113` | 99000 | C max rate, deg/min = **275 rpm** chuck (rpm x 360) |
| `$120` / `$122` / `$123` | 50 / 12 / 240 | X / Z accel (mm/s²), C accel (deg/s², about 2.5 s to 100 rpm) |
| `$30` | 275 | Max spindle rpm (the screen's slider tops out here; the stepper spindle is also capped by `$113`) |
| `$538` | 1 | Rotary wrap for C: `G91 G28 C0` goes the short way to the stored G28 angle and resets the C count (no unwinding hundreds of turns). The screen stores G28 on ZERO C and ends every program with it |
| `$340` | 10 | Spindle at-speed tolerance %: g-code waits for the stepper spindle to reach speed |
| `$395` | 1 | Default spindle = the stepper spindle (spindle 1 is the PWM output for a live tool) |
| `$677` | 7 | Stepper spindle options |
| `$2` / `$3` / `$5` | 5 / 1 / 7 | Step invert (TB6600 common anode), direction invert, limit invert |
| `$6` / `$14` | 1 / 64 | Left over from the probe and E-stop inputs, which are **removed for now**: on GPIO 14/13 they made the WiFi crawl (300 to 1500 ms ping). They come back on other pins once they are wired, with a WiFi re-test |
| `$320` | revturn | Hostname: the screen is also at `http://revturn.local/lathe.html` (mDNS) |

Limits worth knowing: a TB6600 is rated to about 20 kHz of step pulses. At 16x (26.667 steps/deg) that is about 125
chuck rpm; at 8x (13.333) about 250. On this lathe the chuck runs 275 fine at 8x (a little over the driver's rating, so 4x is the fallback if it ever skips).
Past that the NEMA 23 (6:1, so 1200 motor rpm at 200 chuck rpm) runs out of torque before the driver runs out of steps;
go to 4x (6.667) or a 48 V driver like a DM542 for more.

## Branches
- `main` (default): the lathe build. Build with `pio run -e revturn_lathe` (ESP-IDF 4.4).
- `revturn-lathe`: kept as an alias of `main` so older links keep working.

## Changes from stock grblHAL
| Area | File | Why |
|---|---|---|
| **Crash fix** | `main/driver.c`, `main/timers.c` | The stepper-spindle step timer ISR is registered IRAM-safe but called functions in flash (`stepperOutputStep`, `timerStart/Stop`, `enable/disable_irq`). A spindle step landing during any flash read (page load, program file read, settings write) crashed the CPU. Now all IRAM_ATTR. |
| Crash handling | `sdkconfig.revturn_lathe` | Panic prints and reboots instead of halting, so a crash never leaves a silent, frozen machine. |
| WiFi | `main/wifi.c` | Stock never rejoined the network after a drop (credentials wiped, retry commented out). Now retries with 1 s to 30 s backoff, closes sockets once per outage, reboots after 15 min offline only when Idle. |
| Stepper spindle | `main/spindle/stepper.c`, `main/grbl/stepper2.c` | Rotary-mode accel / max rate units; direction-change wait yields instead of spinning. |
| Spindle speed changes | `main/grbl/stepper2.c`, `main/grbl/stepper2.h` | Speed set, start and stop now change the step profile with interrupts held off, so the step ISR never sees it half written. Lowering the speed while the spindle is still ramping up now keeps ramping to the new speed (it used to start a deceleration aimed behind the ramp). |
| Multi-screen | `main/networking/websocketd.c/.h` | Output copied to every WebUI client; non-owners may send reset / feed hold / jog cancel / status. |
| Pendant guest | `main/networking/websocketd.c` | A client that connects with `revturn-guest` never takes control from a screen (it does when no client has the stream). Guests may also send cycle start, single block, optional stop and the feed / rapid / spindle overrides (handle-driven program stepping), and whole jog (`$J=`), zero/set (`G10 L20 P0`), spindle (`M3`/`M4`/`M5`/`S`) and query (`$G`, `$#`, `$30`) lines while the lathe is Idle or jogging and the screen has nothing half-sent. |
| Build options | `main/CMakeLists.txt`, `main/boards/my_machine_map.h`, `main/grbl/gcode.c` | g-code expressions (`#` variables, `[math]`, SIN/COS/SQRT..., O-word loops and subroutines, `G65 P6`), acceleration profiles (with a fix: grblHAL left jogs at zero acceleration, so they crawled and hung the planner), backlash compensation, tool nose radius comp (G41/G42, parenthesis fix for `-Werror`), mDNS. Jerk-limited motion was tried and is **off**: grblHAL's version snaps the step rate to full speed at the end of its ramp and stalled the steppers. **Turning these on resets all stored settings**: write your settings down first. |
| WebUI server | `main/webui/server.c` | Reports the STA IP, serves the REVTURN screen at `/` (embedded `lathe.html.gz`, a flash copy wins), moves the stock WebUI to `/webui/`, broadcasts the controlling client. |
| Machine | `main/my_machine.h`, `main/boards/my_machine_map.h`, `platformio.ini`, `main/CMakeLists.txt` | Lathe pin map, PWM spindle 1 (PWM on GPIO4, enable on GPIO13; moved off the GPIO5 boot strap pin so a router never switches on during a reset), WebUI v3, LittleFS, embedded screen. |

The screen itself (plain JS, 283 tests) lives in a separate repo; its built, gzipped page is
`main/embedded/lathe.html.gz`.

## License
**REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).** Everything JMSCNC made here
(firmware changes, screen, tools, test data, website, printed parts and their FreeCAD sources) is licensed
**GPL-3.0-or-later** ([`LICENSE`](LICENSE)) with one added term under GPLv3 section 7(b): **keep the attribution**
"REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com)" in every copy, modified version,
print or product listing, and mark your changes. Details and the list of other people's code in [`NOTICE.md`](NOTICE.md).

## Credits
- **Firmware:** [grblHAL](https://github.com/grblHAL) by Terje Io and contributors, GPL v3 (see `README-grblHAL.md`
  and `COPYING`). The REVTURN changes are Copyright 2026 JMSCNC / Rev. J. Money, under the same license.
- **Settings page:** [ESP3D-WebUI](https://github.com/luc-github/ESP3D-WEBUI) 3.0 by Luc Lebosse, GPL v3 (only its page
  title is changed, to "REVTURN Settings (grblHAL)"). Shipped in `webui-files/`.
- **REVTURN screen, tools, website and branding:** Copyright 2026 JMSCNC / Rev. J. Money, GPL-3.0-or-later with
  attribution. The monkey mascot is JMSCNC's.
- **Printed parts** (`hardware/`): STL, STEP, drawings and FreeCAD sources by Rev. J. Money, GPL-3.0-or-later with
  attribution (they were CC BY-SA 4.0 until 2026-11-11). Print them, remix them, sell parts if you like: keep the
  credit and share your editable design files under the same license. See [`hardware/LICENSE.md`](hardware/LICENSE.md).

## Support
If REVTURN helped you or you just like watching junk turn into a lathe, you can
**[buy me a coffee](https://buymeacoffee.com/revjmoney)**, or check out my CAM software
**[RotatoCAM](https://rotatocam.com)** (free Community Edition on GitHub:
[revjmoney/RotatoCAM](https://github.com/revjmoney/RotatoCAM)). Thank you!

[![Buy me a coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/revjmoney)
