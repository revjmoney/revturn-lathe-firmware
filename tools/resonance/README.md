# REVTURN resonance and stepper-music tests

How the REVTURN lathe shakes and sings at every speed, measured with a phone on the cross slide over WiFi.
REVTURN by JMSCNC. Copyright 2026 JMSCNC / Rev. J. Money.

## Setup (2026-11-11)

- **Phone:** Samsung Galaxy A14 5G lying on the cross slide (rubber bands), app **phyphox**, experiment
  "Acceleration (without g)", Remote access on, about **403 samples per second** (sees 3 to 200 Hz; anything higher
  shows up folded back into that band).
- **Lathe:** REVTURN (grblHAL ESP32), TB6600 drivers. Settings at test time are copied into every run folder
  (`settings.txt`). Key ones: X 16x `$100=800` max 40 ipm, Z 32x `$102=1932` max 22 ipm accel 12, C 8x
  `$103=13.333` max 275 rpm.
- **Room:** X0 mid travel, +-40 mm. Z0 at the tailstock end, 80 mm toward the chuck. The tests stay inside
  X +-1.4 on the DRO and Z -0.25 to -2.5 in. The C test parks at Z-2.5, X0.

## Tools

| File | What it does |
|---|---|
| `gen-sweep.mjs` | First sweeps: X / Z back and forth at 2 to 25 ipm (and a long X sweep to 40), spindle 20 to 275 rpm |
| `gen-music.mjs` | **Full sweep in quarter tones** for X, Z and C from C2 up (every other step is a note, A4 = 440 Hz), and **chords** (all motors at once) |
| `record.mjs` | Runs one program on the lathe while the phone records; logs the lathe's status 10x a second with the running line number (`N`) and position; saves settings and machine info |
| `analyze.py` | Simple per-speed report for the first sweeps |
| `analyze_scale.py` | Full-sweep report per quarter tone / chord: shake, strongest frequency, which motor harmonic it is, speed reached, flags, note table, waterfall chart |

A motor's pitch is its **full-step rate**: X 21.17 Hz per ipm, Z 25.56 Hz per ipm, C 10 Hz per rpm.

```
node gen-music.mjs .
node record.mjs --phone http://<phone ip>:8080 --check          (phone only, no motion)
node record.mjs --phone http://<phone ip>:8080 --file scale_x.nc
python -I analyze_scale.py runs/<run folder>
```

Rules learned the hard way:
- Run long recordings in the background: a command time limit killed one recorder mid-run (the program kept going,
  the log was lost).
- Never open a second connection to the lathe during a recording: it took the status stream away from the
  recorder for 88.7 s of the C run. Those 34 steps are filled in by timing (`timed=True` in the report).
- No brackets inside a g-code comment: `(... (clash) ...)` ends the comment early and stopped the first chords
  run with error:1.

## Run folders (`runs/`)

Each has: `phone.json` (every phyphox buffer), `lathe.csv` (t_ms, state, feed mm/min, rpm, SD %, line N, machine
position), `settings.txt`, `machine-info.txt` (no IP, MAC or WiFi name), the program and its schedule,
`meta.json`, and after analysis `report.csv`, `notes.csv`, `summary.md`, `rms.png`, `waterfall.png`.

## Findings

See `FINDINGS.md`.

## In this repo

Tools, findings, per-run reports, charts and settings snapshots. The raw phone data (about 40 MB) is not committed;
the full data set is zipped on Rev's PC as `F:\micro-lathe\tools\resonance-dataset-2026-11-11.zip` (sha256 in the
`.sha256` file next to it). `record.mjs` imports the REVTURN screen source (lathe-ui) from `../../../../lathe-ui/src/`:
adjust those three import lines to wherever that repo is on your machine.
