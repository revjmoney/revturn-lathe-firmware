# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
#
# C accel sweep report: per $123 level, the phone's shake (RMS and peak during the workout), the LifeCam's sound
# level, and a skip check (did the chuck come back to the same angle? the before/after camera frames are compared
# in the chuck area; a lost step leaves the jaws rotated). Usage: python -I c_accel_report.py <sweep run folder>
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

run = Path(sys.argv[1])
marks = json.loads((run / "marks.json").read_text())
cam = run / "camera.mp4"

# sound from the camera, 8 kHz mono is plenty for loudness
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(cam), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True).stdout
a = np.frombuffer(raw, "<i2").astype(float) / 32768
def db(seg): return 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
quiet = db(a[: int(3 * 8000)])

# phone shake
ph = None
pj = run / "phone.json"
if pj.exists() and marks.get("phoneStartS") is not None:
    d = json.loads(pj.read_text())
    t = np.array([v or 0 for v in d["acc_time"]["buffer"]], float) + marks["phoneStartS"]
    acc = np.sqrt(sum(np.array([v or 0 for v in d[k]["buffer"]], float) ** 2 for k in ("accX", "accY", "accZ")))
    n = min(len(t), len(acc)); ph = (t[:n], acc[:n])

def chuck_roi(img):  # lower-left quarter of the fixed frame is the chuck
    g = np.asarray(Image.open(img).convert("L"), float)
    h, w = g.shape
    return g[int(h * 0.55):, : int(w * 0.5)]

rows = []
for m in marks["levels"]:
    b, e = m["before"] + 1.5, m["after"] - 1.5          # the workout itself
    seg = a[int(b * 8000): int(e * 8000)]
    shake = peak = None
    if ph:
        sel = (ph[0] >= b) & (ph[0] <= e)
        if sel.any(): shake, peak = float(np.sqrt(np.mean(ph[1][sel] ** 2))), float(ph[1][sel].max())
    diff = None
    fb, fa = run / f"frame_{m['accel']}_before.jpg", run / f"frame_{m['accel']}_after.jpg"
    if fb.exists() and fa.exists():
        diff = float(np.mean(np.abs(chuck_roi(fb) - chuck_roi(fa))))
    rows.append((m["accel"], m.get("result", ""), e - b, db(seg) - quiet if len(seg) else None, shake, peak, diff))

lines = ["| C accel (deg/s2) | workout | seconds | sound over quiet (dB) | shake RMS (m/s2) | shake peak | chuck frame change |", "|---|---|---|---|---|---|---|"]
for r in rows:
    lines.append("| " + " | ".join("" if v is None else (f"{v:.2f}" if isinstance(v, float) else str(v)) for v in r) + " |")
(run / "report.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
