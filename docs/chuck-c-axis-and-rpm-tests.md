# Chuck (C axis) tuning and webcam rpm tests

REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com). GPL-3.0-or-later with attribution
(see `NOTICE.md`). Tests run 2026-11-12 on the REVTURN lathe.

On REVTURN the chuck is driven by a stepper. With the spindle off (`M5`) it is a normal rotary **C axis**, so it can
index, follow X and Z in coordinated moves, and even play notes. These tests found how hard it can be pushed, and
how to check its speed with a cheap webcam.

## What we set (and why)

| Setting | Was | Now | Why |
|---|---|---|---|
| `$123` C acceleration (deg/s2) | 240 | **3000** | 240 was set low on purpose. Swept 240 to 3400 with hard reversals: no lost steps anywhere. At 240 the chuck needs about a second to reach a musical speed and drags X and Z down in mixed moves. |
| `$113` C max rate (deg/min) | 99000 (275 rpm) | **108000 (300 rpm)** | Speed tests to 300 rpm clean. |

Everything else unchanged (X accel 50, Z accel 12, X max 40 ipm, Z max 22 ipm). Change them while Idle with
`$123=3000` and `$113=108000`, or `node tools/resonance/set-setting.mjs 123=3000 113=108000`.

## How the C axis behaves (measured)

- **Inch mode does not scale C.** `G20 G91 G1 C1` turns the chuck 1 degree (C words are always degrees).
- **C alone:** `F` is degrees per minute. `G21 G91 G1 C360 F3600` takes 6.0 s (10 rpm). rpm = F / 360.
- **C with X or Z in the same move:** `F` is the X/Z path speed, and C just rides along so all axes start and stop
  together. To get a chuck speed, pick the C distance: `C degrees = C speed (deg/min) x linear distance / F`.
  Example: `G1 Z-20 C600 F300` takes 4 s, so C runs 150 deg/min, locked to Z the whole way.
- grblHAL expressions work on REVTURN (o-word `while` / `if`, `#` parameters, `SIN COS EXP LN ABS FIX`). Loops only
  run from a file on the controller, not from streamed lines. Examples: `tools/resonance/expr_dance.nc`,
  `tools/resonance/math_show.nc` (spirograph, polynomials, golden spiral, a damped spring by Euler's method, a
  Riemann integral, Newton's method for root 2, a Fourier square wave, a rose: every point computed by the lathe).
- The stepper drivers whine at about 10.7 kHz and 3.5 kHz whenever the motors are powered for a move. That is
  current chopping, not a mechanical problem, and it does not change with acceleration.

## The test rig

- **Lathe:** REVTURN (grblHAL on ESP32), reachable at `revturn.local`. Air cuts only: no tool near the work, the
  chuck clear to spin.
- **Camera:** any Raspberry Pi with a USB webcam (we used a Microsoft LifeCam Cinema: 720p, mic) and `ffmpeg` +
  `v4l2-utils`. The PC reaches it by SSH with a key. Point `REVTURN_CAM=user@host` and (optionally)
  `REVTURN_CAM_KEY=~/.ssh/yourkey` at it. Videos are recorded on the Pi with its hardware H.264 encoder
  (`h264_v4l2m2m`, about 0.8 MB/s) and copied back.
- **Phone (optional):** a phone on the cross slide running phyphox "Acceleration (without g)" with Remote access
  on: `--phone=http://<phone ip>:8080`. Gives the shake graphs.
- **The mark:** ONE green dot on the chuck rim. Any second green mark (even a faint stroke) is counted as another
  turn and doubles the reading at some speeds.
- **Light:** a lamp on the chuck. Then use manual camera exposure (below).

### Webcam settings that matter (LifeCam Cinema, `v4l2-ctl -d /dev/video0`)

- `auto_exposure=3` (Aperture Priority, the default) **drops to 15 real frames per second in dim light** (each
  frame sent twice). That halves what can be counted and lets the exposure pump.
- `auto_exposure=1` (Manual) with `exposure_time_absolute` (0.1 ms units). At 720p this camera holds a true
  30 fps only at some values: **0.1 to 7.8 ms and 15.6 ms = 30 fps; 10 to 12 ms and 33 ms drop to about 7 fps.**
- **Use manual 3.9 ms (`exposure_time_absolute=39`, `brightness=133`) with a lamp:** crisp frames, true 30 fps,
  the dot clearly visible while spinning. The sweep tool sets this before every take (`--camset=` to change).
- Autofocus must be switched off in its own command before `focus_absolute` (0 to 40) is accepted.
- At 30 fps the counting limit is 15 turns per second = 900 rpm (450 rpm if the camera falls to 15 fps).

## How to run the tests

```
cd tools/resonance
export REVTURN_CAM=pi@yourpi.local          # the camera Pi
node set-setting.mjs 123=3000 113=108000   # or keep yours and pass --accel per run

# 1. C accel sweep: hard workout at each level, camera before/after frames for the skip check
node c-accel-sweep.mjs 400,800,1200,1600,2000,2500,3000 --phone=http://<phone ip>:8080
python c_accel_report.py runs/c_accel_sweep-<time>

# 2. Speed test at a fixed accel (levels are rpm)
node c-accel-sweep.mjs 50,100,150,200,250,300 --accel=3000 --keep

# 3. Webcam rpm: spin 10..300 rpm and read the dot back off the video
node gen-spin.mjs
node c-accel-sweep.mjs 1 --accel=3000 --keep --file=spin_test.nc
python spin_read.py runs/c_accel_sweep-<time> x0,y0,x1,y1     # a box around the chuck face, in the full frame

# any program, filmed (and shake video if the phone ran)
node c-accel-sweep.mjs 1 --accel=3000 --keep --file=yourprogram.nc --phone=http://<phone ip>:8080
python shake_video.py runs/c_accel_sweep-<time> "title"
```

`c-accel-sweep.mjs` always puts `$123` back to what it was at the end, unless `--keep`. `c-accel-reset.mjs` stops
a running program cleanly (feed hold, wait, reset: no alarm) and sets `$123`. `play.mjs` runs a program with no
camera; `stop.mjs` stops one.

**The skip check:** each workout ends with the chuck back at its start angle (net zero). If steps were lost, the
jaws and the dot end up somewhere else. `c_accel_report.py` compares the camera frames before and after each level
in the chuck area (a jump from the usual about 6 means look at the frames: twice it was the camera itself moving).

**The rpm reader:** counts green pixels on the chuck face every frame, then finds the strongest repeat rate for
each commanded speed (window from the lathe's own log of which line was running).

## Results (2026-11-12)

**C acceleration sweep** (workout: 6 half-turn reversals at 44 rpm, one turn at 22 / 44 / 66 rpm, back to start):
every level from 240 to 3400 finished, no lost steps. Workout time 27.5 s at 400 down to 18.8 s at 3400. Sound rose
by a few dB, slide shake stayed 0.34 m/s2 RMS. Data: `tools/resonance/runs/c_accel_*`.

**Speed at accel 3000:** 50 / 100 / 150 / 200 rpm with 3-turn runs and hard reversals, all clean; then 300 rpm.

**Webcam rpm** (one teal dot, manual 3.9 ms exposure, lamp, true 30 fps):

| Commanded rpm | 10 | 20 | 30 | 60 | 90 | 120 | 150 | 200 | 250 | 275 | 300 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Camera rpm | 9.9 | 21.8 | 31.6 | 59.8 | 92.1 | 120.4 | 148.1 | 199.3 | 249.0 | 274.4 | 296.0 |

Within 2 rpm everywhere except 300 (4 rpm, where the dot is a faint streak). Before that, with the camera on auto
exposure (15 real fps) and a second green mark on the chuck, about half the speeds read exactly 2x or 0.5x. Data:
`tools/resonance/runs/c_spin_one_dot_manual_exposure/` (and `c_spin_two_marks/` for the before). Videos of every
run are kept privately.
