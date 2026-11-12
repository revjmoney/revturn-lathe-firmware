# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
#
# Shake graph + video for a recorded run (camera.mp4 + phone.json from c-accel-sweep.mjs): shake.png (phone X, Y,
# Z and total over time) and shake_video.mp4 (the camera on top, the shake graph underneath with a cursor that
# moves in time). Usage: python -I shake_video.py <run folder> [title]
import json, subprocess, sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

run = Path(sys.argv[1]); title = sys.argv[2] if len(sys.argv) > 2 else run.name
marks = json.loads((run / "marks.json").read_text())
d = json.loads((run / "phone.json").read_text())
t = np.array([v or 0 for v in d["acc_time"]["buffer"]], float) + (marks.get("phoneStartS") or 0)
ax = {k: np.array([v or 0 for v in d[k]["buffer"]], float) for k in ("accX", "accY", "accZ")}
n = min(len(t), *(len(v) for v in ax.values())); t = t[:n]; ax = {k: v[:n] for k, v in ax.items()}
tot = np.sqrt(sum(v ** 2 for v in ax.values()))
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(run / "camera.mp4")], capture_output=True, text=True).stdout)

BG, FG, ACC, DIM = "#0b0f0c", "#9dff9d", "#ffb347", "#3a5a3a"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "axes.edgecolor": DIM, "text.color": FG,
                     "axes.labelcolor": FG, "xtick.color": FG, "ytick.color": FG, "font.family": "monospace"})
COL = {"accX": "#7fc8ff", "accY": FG, "accZ": "#ffd27f"}

def fig_for(w, h, dpi):
    fig, a = plt.subplots(figsize=(w / dpi, h / dpi), dpi=dpi)
    for k, v in ax.items(): a.plot(t, v, lw=0.4, color=COL[k], label=k[-1], alpha=0.8)
    a.plot(t, tot, lw=0.6, color=ACC, label="total")
    for m in marks["levels"]:
        a.axvspan(m["before"] + 1.5, m["after"] - 1.5, color=DIM, alpha=0.25)
    a.set_xlim(0, dur); a.set_ylabel("m/s2"); a.set_xlabel("seconds")
    a.legend(loc="upper right", fontsize=8, facecolor=BG, edgecolor=DIM, labelcolor=FG, ncol=4)
    a.set_title(f"{title}: cross-slide shake (phone)", color=FG, fontsize=11)
    fig.tight_layout()
    return fig, a

fig, _ = fig_for(1600, 500, 100); fig.savefig(run / "shake.png"); plt.close(fig)
fig, a = fig_for(1280, 300, 100); fig.canvas.draw()
bb = a.get_window_extent(); H = 300
x0, x1, yt, yb = int(bb.x0), int(bb.x1), int(H - bb.y1), int(H - bb.y0)
fig.savefig(run / "shake_strip.png"); plt.close(fig)
speed = (x1 - x0) / dur
flt = (f"[1]format=rgb24[g];color=c=0xffb347:s=2x{yb - yt}:d={dur}[c];[g][c]overlay=x='{x0}+t*{speed:.5f}':y={yt}:eval=frame[gc];"
       f"[0:v][gc]vstack=2,format=yuv420p")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(run / "camera.mp4"), "-loop", "1", "-framerate", "30", "-i", str(run / "shake_strip.png"),
                "-filter_complex", flt, "-t", f"{dur:.2f}", "-map", "0:a?", "-c:v", "libx264", "-crf", "21", "-c:a", "copy", "-movflags", "+faststart", str(run / "shake_video.mp4")], check=True)
print(f"saved {run / 'shake.png'} and {run / 'shake_video.mp4'}; peak total {tot.max():.2f} m/s2, RMS {np.sqrt(np.mean(tot ** 2)):.2f}")
