# REVTURN resonance + stepper music: findings (2026-11-11)

Phone (A14, phyphox, ~403 Hz) on the cross slide; full quarter-tone sweeps of X, Z and C from C2 up, then 19 chords.
Shake = vibration rms in m/s^2 (still phone = 0.026). Pitch = the motor full-step rate (A4 = 440 Hz).

## The short version

- **Z is the scary one.** It shakes ~3 m/s^2 across a whole plateau from about **4 to 10 ipm** (C3..A#3), at its own pitch.
  Smooth from **12.2 ipm up** (D#4..C#5). 32x microstepping did not change this (TB6600 + motor at its full-step rate).
- **X** shakes mostly at **half its pitch** (TB6600 coil-current mismatch). Worst band **22.7 to 25 ipm** (B4, 3.3 m/s^2), also
  **11.7 ipm** (B3). Smoothest: 3.4-3.7 ipm and **8.7 to 11 ipm** (F#3..A#3), and above 32 ipm (but the phone cannot see
  the pitch up there). (The smeared rows at F#3..G3 in the waterfall are QUIET steps: each row is scaled to its own peak.)
- **C (spindle)** is quiet (Rev agrees by ear): median 0.13 m/s^2, vs X 0.81 and Z 1.84. Above ~18 rpm it excites the **frame / base at ~25-30, ~50-55 and ~90-110 Hz**
  (fixed frequencies, not the motor). Quiet rows at 26 and 52 rpm.
- **Chords:** running motors together shakes about as hard as the loudest motor alone (x0.88 to x1.19). The scary sound is a
  single motor at a bad speed, not the motors fighting each other. Beats show as a 20-50 % wobble, not more shake.

## What each axis can play (every note tested)

### X: C2 to G#5 (45 notes, 3.8 octaves). Smooth notes: D2, D#2, D3, F#3, G3, G#3, A3, A#3, F#5, G5, G#5

| Note | Pitch Hz | ipm | Shake | Verdict |
|---|---|---|---|---|
| C2 | 65.4 | 3.090 | 0.71 | ok RING |
| C#2 | 69.3 | 3.274 | 0.68 | ok RING |
| D2 | 73.4 | 3.469 | 0.59 | smooth |
| D#2 | 77.8 | 3.675 | 0.61 | smooth |
| E2 | 82.4 | 3.893 | 0.75 | ok |
| F2 | 87.3 | 4.125 | 0.80 | ok |
| F#2 | 92.5 | 4.370 | 0.73 | ok |
| G2 | 98.0 | 4.630 | 0.70 | ok |
| G#2 | 103.8 | 4.905 | 0.84 | ok |
| A2 | 110.0 | 5.197 | 0.93 | ok |
| A#2 | 116.5 | 5.506 | 0.89 | ok |
| B2 | 123.5 | 5.833 | 1.19 | rough |
| C3 | 130.8 | 6.180 | 1.16 | rough |
| C#3 | 138.6 | 6.548 | 0.78 | ok |
| D3 | 146.8 | 6.937 | 0.61 | smooth |
| D#3 | 155.6 | 7.349 | 0.81 | ok |
| E3 | 164.8 | 7.787 | 0.81 | ok |
| F3 | 174.6 | 8.249 | 0.70 | ok |
| F#3 | 185.0 | 8.740 | 0.54 | smooth |
| G3 | 196.0 | 9.260 | 0.49 | smooth |
| G#3 | 207.7 | 9.810 | 0.51 | smooth |
| A3 | 220.0 | 10.394 | 0.58 | smooth |
| A#3 | 233.1 | 11.012 | 0.63 | smooth |
| B3 | 246.9 | 11.666 | 1.29 | rough LOUD |
| C4 | 261.6 | 12.360 | 0.82 | ok |
| C#4 | 277.2 | 13.095 | 0.67 | ok |
| D4 | 293.7 | 13.874 | 0.70 | ok |
| D#4 | 311.1 | 14.699 | 0.83 | ok |
| E4 | 329.6 | 15.573 | 1.07 | rough |
| F4 | 349.2 | 16.499 | 1.13 | rough |
| F#4 | 370.0 | 17.480 | 0.87 | ok |
| G4 | 392.0 | 18.520 | 1.07 | rough |
| G#4 | 415.3 | 19.621 | 1.19 | rough |
| A4 | 440.0 | 20.787 | 1.44 | rough |
| A#4 | 466.2 | 22.023 | 1.67 | rough |
| B4 | 493.9 | 23.333 | 3.29 | rough LOUD |
| C5 | 523.3 | 24.721 | 2.00 | rough |
| C#5 | 554.4 | 26.191 | 1.16 | rough |
| D5 | 587.3 | 27.748 | 1.03 | ok |
| D#5 | 622.3 | 29.398 | 1.32 | rough |
| E5 | 659.3 | 31.146 | 1.10 | rough |
| F5 | 698.5 | 32.998 | 0.72 | ok |
| F#5 | 740.0 | 34.960 | 0.50 | smooth |
| G5 | 784.0 | 37.039 | 0.36 | smooth |
| G#5 | 830.6 | 39.241 | 0.30 | smooth |

### Z: C2 to C#5 (38 notes, 3.2 octaves). Smooth notes: C2, D#4, E4, F4, F#4, G4, G#4, A4, A#4, B4, C5, C#5

| Note | Pitch Hz | ipm | Shake | Verdict |
|---|---|---|---|---|
| C2 | 65.4 | 2.559 | 1.42 | smooth |
| C#2 | 69.3 | 2.711 | 1.64 | ok |
| D2 | 73.4 | 2.872 | 1.73 | ok |
| D#2 | 77.8 | 3.043 | 1.63 | ok |
| E2 | 82.4 | 3.224 | 1.57 | ok |
| F2 | 87.3 | 3.416 | 1.54 | ok |
| F#2 | 92.5 | 3.619 | 1.63 | ok |
| G2 | 98.0 | 3.834 | 1.78 | ok |
| G#2 | 103.8 | 4.062 | 2.11 | ok |
| A2 | 110.0 | 4.304 | 2.51 | rough |
| A#2 | 116.5 | 4.560 | 2.79 | rough |
| B2 | 123.5 | 4.831 | 2.87 | rough |
| C3 | 130.8 | 5.118 | 3.03 | rough |
| C#3 | 138.6 | 5.423 | 2.97 | rough |
| D3 | 146.8 | 5.745 | 2.85 | rough |
| D#3 | 155.6 | 6.087 | 2.62 | rough |
| E3 | 164.8 | 6.448 | 2.76 | rough |
| F3 | 174.6 | 6.832 | 2.54 | rough |
| F#3 | 185.0 | 7.238 | 2.48 | rough |
| G3 | 196.0 | 7.668 | 3.06 | rough |
| G#3 | 207.7 | 8.124 | 3.07 | rough |
| A3 | 220.0 | 8.608 | 3.03 | rough |
| A#3 | 233.1 | 9.120 | 2.91 | rough |
| B3 | 246.9 | 9.662 | 2.37 | ok |
| C4 | 261.6 | 10.236 | 2.03 | ok |
| C#4 | 277.2 | 10.845 | 2.01 | ok |
| D4 | 293.7 | 11.490 | 2.90 | rough |
| D#4 | 311.1 | 12.173 | 1.45 | smooth |
| E4 | 329.6 | 12.897 | 0.75 | smooth |
| F4 | 349.2 | 13.664 | 1.02 | smooth |
| F#4 | 370.0 | 14.476 | 0.55 | smooth |
| G4 | 392.0 | 15.337 | 0.63 | smooth |
| G#4 | 415.3 | 16.249 | 0.60 | smooth |
| A4 | 440.0 | 17.215 | 0.79 | smooth |
| A#4 | 466.2 | 18.239 | 0.46 | smooth |
| B4 | 493.9 | 19.323 | 0.45 | smooth |
| C5 | 523.3 | 20.473 | 0.51 | smooth |
| C#5 | 554.4 | 21.690 | 0.68 | smooth |

### C: C2 to E7 (65 notes, 5.4 octaves). Smooth notes: C2, C#2, F3, F#3, G3, G#3, A3, A#3, B3, C4, D4, E4, F4, F#4, G4, G#4, A4, A#4, B4, C5, D5

| Note | Pitch Hz | rpm | Shake | Verdict |
|---|---|---|---|---|
| C2 | 65.4 | 6.541 | 0.07 | smooth |
| C#2 | 69.3 | 6.930 | 0.09 | smooth |
| D2 | 73.4 | 7.342 | 0.17 | rough |
| D#2 | 77.8 | 7.778 | 0.29 | rough |
| E2 | 82.4 | 8.241 | 0.25 | rough |
| F2 | 87.3 | 8.731 | 0.20 | rough |
| F#2 | 92.5 | 9.250 | 0.13 | ok |
| G2 | 98.0 | 9.800 | 0.19 | rough |
| G#2 | 103.8 | 10.383 | 0.20 | rough |
| A2 | 110.0 | 11.000 | 0.15 | ok |
| A#2 | 116.5 | 11.654 | 0.21 | rough |
| B2 | 123.5 | 12.347 | 0.12 | ok |
| C3 | 130.8 | 13.082 | 0.25 | rough |
| C#3 | 138.6 | 13.860 | 0.26 | rough |
| D3 | 146.8 | 14.684 | 0.19 | rough |
| D#3 | 155.6 | 15.557 | 0.18 | rough |
| E3 | 164.8 | 16.482 | 0.14 | ok |
| F3 | 174.6 | 17.462 | 0.09 | smooth |
| F#3 | 185.0 | 18.500 | 0.07 | smooth |
| G3 | 196.0 | 19.600 | 0.09 | smooth |
| G#3 | 207.7 | 20.766 | 0.09 | smooth |
| A3 | 220.0 | 22.001 | 0.07 | smooth |
| A#3 | 233.1 | 23.309 | 0.07 | smooth |
| B3 | 246.9 | 24.695 | 0.05 | smooth |
| C4 | 261.6 | 26.163 | 0.08 | smooth |
| C#4 | 277.2 | 27.719 | 0.12 | ok |
| D4 | 293.7 | 29.367 | 0.10 | smooth |
| D#4 | 311.1 | 31.113 | 0.11 | ok |
| E4 | 329.6 | 32.964 | 0.10 | smooth |
| F4 | 349.2 | 34.924 | 0.07 | smooth |
| F#4 | 370.0 | 37.000 | 0.06 | smooth |
| G4 | 392.0 | 39.200 | 0.07 | smooth |
| G#4 | 415.3 | 41.532 | 0.07 | smooth |
| A4 | 440.0 | 44.001 | 0.07 | smooth |
| A#4 | 466.2 | 46.617 | 0.09 | smooth |
| B4 | 493.9 | 49.390 | 0.07 | smooth |
| C5 | 523.3 | 52.326 | 0.08 | smooth |
| C#5 | 554.4 | 55.438 | 0.13 | ok |
| D5 | 587.3 | 58.734 | 0.09 | smooth |
| D#5 | 622.3 | 62.227 | 0.11 | ok |
| E5 | 659.3 | 65.927 | 0.11 | ok RING |
| F5 | 698.5 | 69.847 | 0.13 | ok |
| F#5 | 740.0 | 74.001 | 0.10 | ok RING |
| G5 | 784.0 | 78.401 | 0.12 | ok RING |
| G#5 | 830.6 | 83.063 | 0.10 | ok |
| A5 | 880.0 | 88.002 | 0.12 | ok RING |
| A#5 | 932.3 | 93.235 | 0.17 | rough RING |
| B5 | 987.8 | 98.779 | 0.13 | ok RING |
| C6 | 1046.5 | 104.653 | 0.13 | ok RING |
| C#6 | 1108.7 | 110.876 | 0.11 | ok RING |
| D6 | 1174.7 | 117.469 | 0.13 | ok RING |
| D#6 | 1244.5 | 124.454 | 0.13 | ok RING |
| E6 | 1318.5 | 131.854 | 0.17 | rough RING |
| F6 | 1396.9 | 139.695 | 0.20 | rough RING |
| F#6 | 1480.0 | 148.001 | 0.25 | rough RING |
| G6 | 1568.0 | 156.802 | 0.20 | rough RING |
| G#6 | 1661.2 | 166.126 | 0.17 | rough RING |
| A6 | 1760.0 | 176.004 | 0.21 | rough RING |
| A#6 | 1864.7 | 186.470 | 0.16 | ok RING |
| B6 | 1975.5 | 197.558 | 0.20 | rough RING |
| C7 | 2093.0 | 209.306 | 0.20 | rough RING |
| C#7 | 2217.5 | 221.752 | 0.21 | rough RING |
| D7 | 2349.3 | 234.938 | 0.23 | rough RING |
| D#7 | 2489.0 | 248.908 | 0.28 | rough RING |
| E7 | 2637.0 | 263.709 | 0.25 | rough RING |

## Chords vs the loudest motor alone

| Chord | Together | Loudest alone | Ratio | Beat wobble |
|---|---|---|---|---|
| X+Z both at their resonance, 1 Hz beat | 3.16 | 2.97 | 1.06 | 0.28 |
| X+Z near unison, 2 Hz beat | 2.86 | 3.03 | 0.94 | 0.23 |
| X+Z 10 Hz beat | 3.02 | 2.91 | 1.04 | 0.21 |
| X+Z minor second, a clash | 2.58 | 2.91 | 0.88 | 0.25 |
| X+Z perfect fifth | 1.18 | 0.75 | 1.57 | 0.42 |
| X+Z octave | 0.83 | 0.79 | 1.06 | 0.53 |
| X + spindle, 2 Hz beat | 0.54 | 0.58 | 0.93 | 0.18 |
| Z + spindle, 2 Hz beat | 2.91 | 3.03 | 0.96 | 0.23 |
| X + spindle, X at resonance | 1.43 | 1.21 | 1.18 | 0.11 |
| all three near unison: 2, 3, 5 Hz beats | 2.86 | 3.03 | 0.94 | 0.23 |
| all three at their resonance | 3.36 | 2.97 | 1.13 | 0.23 |
| all three in tune: A4 unison | 1.31 | 1.44 | 0.90 | 0.41 |
| C major chord: X C4, Z E4, C G4 | 1.33 | 0.82 | 1.61 | 0.36 |
| A minor chord: X A3, Z C4, C E4 | 2.07 | 2.03 | 1.02 | 0.27 |
| low rumble | 2.01 | 1.87 | 1.07 | 0.27 |
| spread | 2.77 | 2.33 | 1.19 | 0.32 |
| mid | 1.04 | 1.16 | 0.90 | 0.44 |
| X+Z fast, spindle 2 octaves up | 0.99 | 1.04 | 0.96 | 0.50 |
| everything fast | 0.79 | 0.68 | 1.17 | 0.51 |

## Data

**Full raw data set** (every phone reading and lathe log, 14 MB zip): https://github.com/revjmoney/revturn-lathe-firmware/releases/tag/resonance-2026-11-11

- X: `runs\scale_x-2026-11-11T18-37-28` (report.csv, notes.csv, summary.md, rms.png, waterfall.png)
- Z: `runs\scale_z-2026-11-11T18-43-09` (report.csv, notes.csv, summary.md, rms.png, waterfall.png)
- C: `runs\scale_c-2026-11-11T18-59-36` (report.csv, notes.csv, summary.md, rms.png, waterfall.png)
- chords: `runs\chords-2026-11-11T19-04-08` (report.csv, notes.csv, summary.md, rms.png, waterfall.png)
- Earlier simple sweeps: spindle_sweep, x_sweep, x_sweep_long, z_sweep (16x and 32x) in `runs/`.
- C run: 34 steps (96..253 rpm) are timed from their neighbours (a second lathe connection took the status stream); marked `timed` in report.csv.
- Failed first chords run kept in `runs/_failed/` (error:1 from brackets inside a comment).
