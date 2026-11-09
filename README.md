# REVTURN: a touch-screen CNC lathe controller on an ESP32

A mini CNC lathe running **grblHAL** on a $5 ESP32, with a **ProtoTRAK / Fanuc style control screen built into
the firmware**. Open `http://<lathe>/lathe.html` on a phone, a tablet by the machine, or a PC. No app, no
sender, no cloud.

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

![DRO with zero bar and backplot](docs/screenshots/revturn-dro.png)

## The screen

| | |
|---|---|
| ![Thread cycle with preview](docs/screenshots/revturn-cycles-thread.png) **Conversational cycles**: face, turn (with chamfer / radius), bore, thread, groove, peck drill, **polygon (hex flats by X-C interpolation with the normal lathe tool)**, index. Fill in the form, GO previews the toolpath, GO again runs it. | ![RUN with live backplot](docs/screenshots/revturn-run-backplot.png) **Programs and live backplot**: chain cycles and raw g-code into a program, import Fusion lathe posts, watch the tool trace over the planned path with a live tool marker. |
| ![Tool table and stroke limits](docs/screenshots/revturn-setup.png) **SET UP**: T1 to T8 tool table with touch-off (offsets from T1) and stored stroke limits (switched on and off with the LIMITS key, off by default), saved on the lathe so every screen shares them. | ![Jog](docs/screenshots/revturn-jog.png) **JOG**: step or continuous jog, respecting the stroke limits. |

<img src="docs/screenshots/revturn-phone.png" width="260" align="right" alt="Phone layout">

**Machine-like controls everywhere**
- DRO in diameter (X) and Z, with C shown as **RPM in spindle mode** or **degrees in C-axis mode**.
- ZERO X / Z / C / ALL on every screen (Idle only), ABS SET / INC SET keypad, MDI console.
- HOLD and STOP always on screen. Any connected screen can HOLD or STOP the machine; extra screens show the
  live machine in VIEW ONLY.
- Feed / spindle / rapid overrides, DRY RUN (air cut, spindle off), alarm explain + RESET / UNLOCK.
- Tool changes stop the program with a "CHANGE TO T2" message; GO continues.

<br clear="right">

## The machine
- X (cross slide, diameter), Z (carriage), C (chuck: a NEMA 23 that is either the **spindle** under M3/M4 or a
  **rotary C axis**), TB6600 drivers at 16x microstepping.
- ESP32 DevKit (WROOM-32), WiFi to the shop network, WebUI v3, screen served from flash.
- The lathe screen and the stock WebUI link to each other: **WEBUI** on the lathe screen, a **LATHE** tab in the WebUI
  (upload [`webui-files/`](webui-files/) to the flash file system).

## Printed parts
The bed ends and the cross slide are 3D printed, original designs, STL + STEP in [`hardware/`](hardware/) with a parts
list, hardware list and the printing lessons learned building it.

![R9 cross slide drawings](hardware/drawings/drawings_r9.png)

## Machine settings (calibrated on the real lathe)
grblHAL stores these in flash, not in the source, so after flashing a blank board send them from the MDI or a
serial terminal. Axis values are in mm and degrees (grblHAL's native units); the screen works in inches.

| Setting | Value | What it is |
|---|---|---|
| `$32` | 2 | Lathe mode (X in diameter, G7/G8) |
| `$100` | 400 | X steps/mm: 16x, direct coupler, 8 mm lead (not yet verified by measurement) |
| `$102` | 966 | Z steps/mm: **measured** (0.99 in per commanded inch on calipers); belt to an 8 mm T8 screw |
| `$103` | 26.667 | C steps/deg: **measured** (one commanded turn = exactly one chuck turn); 20T to 120T belt |
| `$110` / `$112` | 1000 / 254 | X / Z max rate, mm/min (Z held to 10 in/min until its belt stops slipping) |
| `$113` | 54000 | C max rate, deg/min = **150 rpm** chuck |
| `$120` / `$122` / `$123` | 50 / 10 / 180 | X / Z accel (mm/s²), C accel (deg/s², about 3 s to 100 rpm) |
| `$30` | 150 | Max spindle rpm (the screen's slider tops out here) |
| `$340` | 10 | Spindle at-speed tolerance %: g-code waits for the stepper spindle to reach speed |
| `$395` | 1 | Default spindle = the stepper spindle (spindle 1 is the PWM output for a live tool) |
| `$677` | 7 | Stepper spindle options |
| `$2` / `$3` / `$5` | 5 / 1 / 7 | Step invert (TB6600 common anode), direction invert, limit invert |

Limits worth knowing: a TB6600 is rated to about 20 kHz of step pulses, which is about 125 chuck rpm at 26.667
steps/deg. Above that, listen for stalls.

## Branches
- `revturn-lathe` (default): the lathe build. Build with `pio run -e revturn_lathe` (ESP-IDF 4.4).
- `main`: stock grblHAL ESP32 (0b2d3e1) with every submodule flattened in at its pinned commit, so the
  difference between the two branches is exactly what this build changes.

## Changes from stock grblHAL
| Area | File | Why |
|---|---|---|
| **Crash fix** | `main/driver.c`, `main/timers.c` | The stepper-spindle step timer ISR is registered IRAM-safe but called functions in flash (`stepperOutputStep`, `timerStart/Stop`, `enable/disable_irq`). A spindle step landing during any flash read (page load, program file read, settings write) crashed the CPU. Now all IRAM_ATTR. |
| Crash handling | `sdkconfig.revturn_lathe` | Panic prints and reboots instead of halting, so a crash never leaves a silent, frozen machine. |
| WiFi | `main/wifi.c` | Stock never rejoined the network after a drop (credentials wiped, retry commented out). Now retries with 1 s to 30 s backoff, closes sockets once per outage, reboots after 15 min offline only when Idle. |
| Stepper spindle | `main/spindle/stepper.c`, `main/grbl/stepper2.c` | Rotary-mode accel / max rate units; direction-change wait yields instead of spinning. |
| Spindle speed changes | `main/grbl/stepper2.c`, `main/grbl/stepper2.h` | Speed set, start and stop now change the step profile with interrupts held off, so the step ISR never sees it half written. Lowering the speed while the spindle is still ramping up now keeps ramping to the new speed (it used to start a deceleration aimed behind the ramp). |
| Multi-screen | `main/networking/websocketd.c/.h` | Output copied to every WebUI client; non-owners may send reset / feed hold / jog cancel / status. |
| WebUI server | `main/webui/server.c` | Reports the STA IP, serves the embedded `lathe.html.gz`, broadcasts the controlling client. |
| Machine | `main/my_machine.h`, `main/boards/my_machine_map.h`, `platformio.ini`, `main/CMakeLists.txt` | Lathe pin map, PWM spindle 1, WebUI v3, LittleFS, embedded screen. |

The screen itself (plain JS, 244 tests) lives in a separate repo; its built, gzipped page is
`main/embedded/lathe.html.gz`.

## Credits and licenses
- **Firmware:** [grblHAL](https://github.com/grblHAL) by Terje Io and contributors, GPL v3 (see `README-grblHAL.md`
  and `COPYING`). The REVTURN changes are under the same license.
- **Printed parts** (`hardware/`): STL, STEP and drawings by Rev. J. Money, licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Remix them, print them, sell parts if you like;
  credit the original and share your changes under the same license. See [`hardware/LICENSE.md`](hardware/LICENSE.md).
