# REVTURN: a touch-screen CNC lathe controller on an ESP32

A mini CNC lathe running **grblHAL** on a $5 ESP32, with a **ProtoTRAK / Fanuc style control screen built into
the firmware**. Open `http://<lathe>/lathe.html` on a phone, a tablet by the machine, or a PC. No app, no
sender, no cloud.

![DRO with zero bar and backplot](docs/screenshots/revturn-dro.png)

## The screen

| | |
|---|---|
| ![Thread cycle with preview](docs/screenshots/revturn-cycles-thread.png) **Conversational cycles**: face, turn (with chamfer / radius), bore, thread, groove, peck drill, index. Fill in the form, GO previews the toolpath, GO again runs it. | ![RUN with live backplot](docs/screenshots/revturn-run-backplot.png) **Programs and live backplot**: chain cycles and raw g-code into a program, import Fusion lathe posts, watch the tool trace over the planned path with a live tool marker. |
| ![Tool table and stroke limits](docs/screenshots/revturn-setup.png) **SET UP**: T1 to T8 tool table with touch-off (offsets from T1) and stored stroke limits, saved on the lathe so every screen shares them. | ![Jog](docs/screenshots/revturn-jog.png) **JOG**: step or continuous jog, respecting the stroke limits. |

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
| Multi-screen | `main/networking/websocketd.c/.h` | Output copied to every WebUI client; non-owners may send reset / feed hold / jog cancel / status. |
| WebUI server | `main/webui/server.c` | Reports the STA IP, serves the embedded `lathe.html.gz`, broadcasts the controlling client. |
| Machine | `main/my_machine.h`, `main/boards/my_machine_map.h`, `platformio.ini`, `main/CMakeLists.txt` | Lathe pin map, PWM spindle 1, WebUI v3, LittleFS, embedded screen. |

The screen itself (plain JS, 214 tests) lives in a separate repo; its built, gzipped page is
`main/embedded/lathe.html.gz`.

## Credits
[grblHAL](https://github.com/grblHAL) by Terje Io and contributors (GPL v3, see `README-grblHAL.md` and `COPYING`).
