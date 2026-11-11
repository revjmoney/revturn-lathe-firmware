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
| `gen-song.mjs` | **REVTURN plays Ode to Joy** (Beethoven, public domain): X plays the melody, spindle drone or **Z bassline**, plus a 3 s **dolphin** squeal intro. Makes `ode_to_joy_take1.nc` (TAKE1=1), `ode_to_joy.nc`, `ode_to_joy_zbass.nc` |
| `phyphox/revturn-mic-4.phyphox` | Custom phyphox experiment: the WHOLE 48 kHz microphone recording plus the accelerometer, pulled over Remote access |
| `song_graphs.py` | Song report: WAV, spectrogram with the programmed notes drawn on, heard pitch vs note, shake graph, notes in tune, and self-drawing MP4 overlays (`--video`) |
| `find_dolphin.py` | Finds the dolphin intro in a camera clip's audio, to sync the overlays to video |

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

## Playing a song

```
node gen-song.mjs .
node record.mjs --phone http://<phone ip>:8080 --file ode_to_joy.nc
python -I song_graphs.py runs/<run folder> --video
```

The phone runs **REVTURN Mic 4** (load `phyphox/revturn-mic-4.phyphox` in phyphox: serve the file over HTTP and
scan a QR of its URL; give each new version a new file name because phyphox caches by URL; re-tick Remote access
after opening it). phyphox's audio input replaces its buffer on every cycle, so the experiment copies each chunk
into a growing buffer with an `append` step. A minute of 48 kHz audio is about 37 MB to download; `record.mjs`
saves the lathe log first and allows 5 minutes for it. With stock "Audio Spectrum" instead, use
`record.mjs --poll fft,df,recording` (coarser: only the live spectrum, 23 Hz resolution).

## Run folders (`runs/`)

Each has: `phone.json` (every phyphox buffer), `lathe.csv` (t_ms, state, feed mm/min, rpm, SD %, line N, machine
position), `settings.txt`, `machine-info.txt` (no IP, MAC or WiFi name), the program and its schedule,
`meta.json`, and after analysis `report.csv`, `notes.csv`, `summary.md`, `rms.png`, `waterfall.png`.

## Findings

See `FINDINGS.md`.

## In this repo

Tools, findings, per-run reports, charts and settings snapshots. The raw phone data is not committed; it is in the
GitHub Releases `resonance-2026-11-11` and `song-2026-11-11`. `record.mjs` imports the REVTURN screen source from
`../../screen/src/` in this repo, so it runs from a plain clone (Node 22 or newer).
