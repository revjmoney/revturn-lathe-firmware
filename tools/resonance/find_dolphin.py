# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
# find the dolphin squeal (first burst of 450..900 Hz sound after quiet) in a clip's audio. Usage: python -I find_dolphin.py clip.mp4
import subprocess, sys, numpy as np
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, "<i2").astype(float)
hop, n = 160, 1024                                   # 20 ms steps
f = np.fft.rfftfreq(n, 1 / 8000); band = (f > 450) & (f < 900); low = (f > 60) & (f < 450)
e, el = [], []
for i in range(0, len(x) - n, hop):
    s = np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n)))
    e.append(s[band].sum()); el.append(s[low].sum())
e = np.array(e); el = np.array(el); t = np.arange(len(e)) * hop / 8000
base = np.median(e[: int(3 / (hop / 8000))])           # first 3 s
ratio = e / (el + 1e-9)
hit = np.where((e > 6 * base) & (ratio > 1.0))[0]
# need it to last: 0.3 s of the next 0.5 s loud
for h in hit:
    w = e[h:h + 25]
    if (w > 6 * base).mean() > 0.6:
        print(f"{sys.argv[1]} dolphin at {t[h]:.2f} s"); break
else:
    print(f"{sys.argv[1]} no dolphin found")
