# REVTURN lathe firmware (grblHAL ESP32)

Rev's mini CNC lathe controller: grblHAL on an ESP32 DevKit (WROOM-32), axes X (diameter), Z, C
(stepper spindle that switches between M3/M4 spindle and C axis), TB6600 drivers, WiFi + WebUI v3 with
the REVTURN touch screen embedded at `/lathe.html`.

- `main` = stock grblHAL ESP32 (0b2d3e1) with every submodule flattened in at its pinned commit.
- `revturn-lathe` = Rev's build. Build env: `pio run -e revturn_lathe` (ESP-IDF 4.4, sdkconfig.revturn_lathe).

## Changes from stock
| Area | File | Why |
|---|---|---|
| WiFi | `main/wifi.c` | STA never reconnected after a drop (credentials wiped, retry commented out). Now retries with 1 s to 30 s backoff, reboots after 15 min offline only when Idle. |
| Crash handling | `sdkconfig.revturn_lathe` | `PANIC_PRINT_REBOOT` instead of `PANIC_PRINT_HALT`, so a crash reboots instead of freezing. |
| Multi-screen | `main/networking/websocketd.c/.h` | Output copied to every WebUI client; non-owners may send reset / feed hold / jog cancel / status. |
| WebUI server | `main/webui/server.c` | Reports the STA IP (not the hotspot), serves embedded `lathe.html.gz` fallback, broadcasts active client. |
| Stepper spindle | `main/spindle/stepper.c`, `main/grbl/stepper2.c` | Accel / max rate unit fix in rotary mode (deg vs rev). |
| Machine | `main/my_machine.h`, `main/boards/my_machine_map.h`, `platformio.ini`, `main/CMakeLists.txt` | Lathe board map, PWM spindle 1, WebUI v3, LittleFS, embedded screen. |

## Open problem (2026-11-08)
The controller crashes mid-program (3 times during a test with frequent M3/M4 reversals, spindle speed changes and
spindle to C axis switches). Prime suspects: the experimental stepper spindle plugin (`main/spindle/stepper.c`,
busy-wait on direction change in the spindle set-state path), `main/grbl/stepper2.c`, and the websocketd broadcast.
