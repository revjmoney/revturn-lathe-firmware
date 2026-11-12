# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
#
# Read the chuck rpm from the webcam: Rev's green X on the chuck rim passes a fixed spot once per turn. For every
# frame, how green that spot is; for each commanded speed (N600..N609 in the lathe log), the repeat rate of that
# signal by FFT = turns per second. 30 fps can count up to 15 turns/s (900 rpm) in theory; blur sets the real limit.
# Usage: python -I spin_read.py <run folder> [roi x0,y0,x1,y1 in the flipped full frame]
import csv, json, subprocess, sys
from pathlib import Path
import numpy as np

run = Path(sys.argv[1])
x0, y0, x1, y1 = map(int, (sys.argv[2] if len(sys.argv) > 2 else "240,370,620,690").split(","))
w, h = x1 - x0, y1 - y0
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(run / "camera-raw.mp4"), "-vf", f"fps=30,hflip,vflip,crop={w}:{h}:{x0}:{y0}",
                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(float)
fps = 30.0
# green or teal (Rev's dot is teal; spinning fast it smears into a pale teal streak): G and B both well above R
gr = (fr[..., 1] > fr[..., 0] + 18) & (fr[..., 2] > fr[..., 0] - 10) & (fr[..., 1] > 60)
g = gr.sum(axis=(1, 2)).astype(float)   # green pixels on the chuck (the X is the only green there)
tv = np.arange(len(g)) / fps

# commanded speeds and their windows from the lathe log (t_ms counted from when the camera was started)
rows = list(csv.DictReader(open(run / "lathe.csv")))
first = {}
for r in rows:
    if r["line_n"] and r["line_n"] not in first: first[r["line_n"]] = int(r["t_ms"]) / 1000
RPM = [10, 20, 30, 60, 90, 120, 150, 200, 250, 275, 300]
# camera files start a little after the camera command: find the shift that best lines up motion with the log
motion = np.abs(np.diff(g, prepend=g[0]))
best, shift = -1, 0.0
FIXSHIFT = next((float(x.split('=')[1]) for x in sys.argv if x.startswith('--shift=')), None)
for s in ([FIXSHIFT] if FIXSHIFT is not None else np.arange(-0.5, 4.0, 0.1)):
    score = sum(motion[(tv >= first[str(600 + i)] - s + 1) & (tv <= first[str(600 + i)] - s + 7)].mean() for i in range(len(RPM)) if str(600 + i) in first)
    if score > best: best, shift = score, s
out = ["| commanded rpm | camera rpm | error | mark contrast |", "|---|---|---|---|"]
for i, rpm in enumerate(RPM):
    k = str(600 + i)
    if k not in first: continue
    nxt = first.get(str(601 + i), first[k] + 9.5)
    a, b = first[k] - shift + 1.0, nxt - shift - 2.5             # skip the speed-up and the pause before the next speed
    sel = (tv >= a) & (tv <= b)
    # only the BIG green blob (Rev's X + dot) counts; the thin dashes on the other side of the chuck stay under 60%
    big = (g[sel] > 0.6 * np.percentile(g[sel], 99)).astype(float)
    s = g[sel] - g[sel].mean()            # one mark on the chuck (Rev 2026-11-12): the plain green count is enough
    if len(s) < 30: continue
    n = 8192
    spec = np.abs(np.fft.rfft(s * np.hanning(len(s)), n))
    f = np.fft.rfftfreq(n, 1 / fps)
    band = (f > 0.08) & (f < 14.5)
    # a short mark gives a pulse train: its harmonics can be as strong as the fundamental, so take the LOWEST strong
    # peak (at least half the biggest), not simply the biggest (no peeking at the commanded speed)
    # harmonic product spectrum: the true turn rate is where the spectrum AND its 2nd and 3rd harmonics are all strong
    hps = spec.copy()
    for k in (2, 3):
        dec = spec[::k]; hps[: len(dec)] *= dec; hps[len(dec):] = 0
    band = (f > 0.1) & (f < 14.5 / 3)
    f_hps = f[band][np.argmax(hps[band])]
    b2 = (f > 0.1) & (f < 14.5)
    sb, fb = spec[b2], f[b2]
    pk = [j for j in range(1, len(sb) - 1) if sb[j] >= sb[j - 1] and sb[j] >= sb[j + 1] and sb[j] >= 0.5 * sb.max()]
    f_low = fb[pk[0]] if pk else fb[np.argmax(sb)]
    # third check, no FFT: count the passes (the green count rising through halfway between quiet and peak)
    lvl = np.percentile(g[sel], 50) + 0.5 * (np.percentile(g[sel], 97) - np.percentile(g[sel], 50))
    up = np.nonzero((g[sel][1:] > lvl) & (g[sel][:-1] <= lvl))[0]
    f_cnt = (len(up) - 1) / ((up[-1] - up[0]) / fps) if len(up) > 2 else None
    up2 = np.nonzero(np.diff(big) > 0)[0]
    f_cnt = (len(up2) - 1) / ((up2[-1] - up2[0]) / fps) if len(up2) > 2 else None
    # one mark (Rev 2026-11-12): the strongest repeat is the turn rate. The LifeCam drops to 15 real fps in dim
    # light (every frame sent twice), so the honest limit is 7.5 turns/s = 450 rpm.
    b3 = (f > 0.1) & (f < 14.5)
    fk = f[b3][np.argmax(spec[b3])]
    # one mark cannot make a half-rate repeat: a strong peak at half the frequency means the big one was the 2nd harmonic
    half = (f > fk / 2 * 0.97) & (f < fk / 2 * 1.03)
    if half.any() and fk / 2 >= 0.9 and spec[half].max() > 0.3 * spec[b3].max(): fk = f[half][np.argmax(spec[half])]  # slow wobbles live below 1 turn/s
    cam = fk * 60
    contrast = (np.percentile(g[sel], 95) - np.percentile(g[sel], 50))
    out.append(f"| {rpm} | {cam:.1f} | {cam - rpm:+.1f} | {contrast:.1f} |")
(run / "spin_report.md").write_text("\n".join(out) + f"\n\ncamera shift {shift:.1f} s\n")
print("\n".join(out)); print(f"(camera shift {shift:.1f} s)")
