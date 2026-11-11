# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
# REVTURN song graphs for video, from a phyphox "Audio Spectrum" run recorded by record.mjs --poll fft,df,recording.
# Makes: song_spectrogram.png (spectrum over time with the program's notes drawn on top), song_pitch.png (the pitch
# the phone heard vs the note asked for), song_chunks.wav (the raw audio frames phyphox exposed, in order; it has
# gaps, it is for reference, not for the video soundtrack), song_frames/ (one PNG per video frame for an overlay).
# Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).
# Usage: python -I song_graphs.py <run folder> [--frames]
import csv, json, sys, wave
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

run = Path(sys.argv[1])
meta = json.loads((run / "meta.json").read_text())
sched = json.loads(next(run.glob("*.schedule.json")).read_text())["steps"]
phone = json.loads((run / "phone.json").read_text())
pp = run / "phone-poll.json"
poll = json.loads(pp.read_text()) if pp.exists() else []
t_phone0 = meta["tPhoneStartMs"] / 1000.0

# when each note really started on the lathe (first status showing its N), on the recorder clock
first = {}
for r in csv.DictReader(open(run / "lathe.csv")):
    if r["line_n"] and r["line_n"] not in first:
        first[r["line_n"]] = int(r["t_ms"]) / 1000.0
notes = [(first[str(s["n"])], s) for s in sched if str(s["n"]) in first]
song0 = (first["4800"] if "4800" in first else notes[0][0]) - 1.0 if notes else 0.0  # start 1 s before the dolphin intro
song1 = notes[-1][0] + notes[-1][1]["seconds"] + 1.5 if notes else None

BG, FG, ACC, DIM = "#0b0f0c", "#9dff9d", "#ffb347", "#3a5a3a"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "axes.edgecolor": DIM, "text.color": FG,
                     "axes.labelcolor": FG, "xtick.color": FG, "ytick.color": FG, "font.family": "monospace"})
FMAX = 1000

AUDIO = phone.get("all", {}).get("buffer", [])
if AUDIO:  # REVTURN Mic 3: the whole recording, 48 kHz, starts at the phone start
    from scipy.signal import spectrogram as _sg
    rate = (phone.get("rate", {}).get("buffer") or [48000])[0] or 48000
    A = np.array([v or 0.0 for v in AUDIO], float)
    with wave.open(str(run / "song.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(rate))
        w.writeframes((A / max(1e-9, np.abs(A).max()) * 32000).astype("<i2").tobytes())
    F, tt, S = _sg(A, fs=rate, nperseg=8192, noverlap=8192 - 1200)
    nb = int(np.searchsorted(F, FMAX)); F = F[:nb]; M = np.sqrt(S[:nb].T); T = tt + t_phone0
    df = F[1] - F[0]; frames = M
else:
    # spectrogram from the polled spectrum frames (stock Audio Spectrum)
    frames = [p for p in poll if p.get("fft") and p.get("df")]
    df = frames[0]["df"][0] if frames else 1.0
    nb = int(FMAX / df)
    T = np.array([(p["t_ms"] + p["t_done_ms"]) / 2000.0 for p in frames])
    M = np.array([np.pad(np.array([v or 0 for v in p["fft"][:nb]], float), (0, max(0, nb - len(p["fft"][:nb])))) for p in frames])
    F = np.arange(nb) * df

def draw_notes(ax, upto=None, lw=1.4):
    if "4800" in first and (upto is None or first["4800"] <= upto):
        ax.text(first["4800"] - song0, 900, "DOLPHIN", color=ACC, fontsize=11)
    for st, s in notes:
        if upto is not None and st > upto: break
        ax.hlines(s["hz"], st - song0, st - song0 + s["seconds"], color=ACC, lw=lw, alpha=0.85)
        ax.text(st - song0, s["hz"] + 14, s["note"], color=ACC, fontsize=8)

def spectro(ax, upto=None):
    keep = (T >= song0) & ((T <= song1) if song1 else True)
    if upto is not None: keep &= T <= upto
    if keep.sum() > 1:
        ax.pcolormesh(T[keep] - song0, F, 20 * np.log10(M[keep].T + 1e-9), shading="nearest", cmap="magma",
                      vmin=np.percentile(20 * np.log10(M + 1e-9), 50), vmax=np.percentile(20 * np.log10(M + 1e-9), 99.7))
    ax.set_ylim(0, FMAX); ax.set_xlim(0, (song1 or T[-1]) - song0)
    ax.set_ylabel("Hz"); ax.set_xlabel("seconds")

fig, ax = plt.subplots(figsize=(16, 9))
spectro(ax); draw_notes(ax)
ax.set_title("REVTURN plays Ode to Joy: what the phone heard (orange = the note the program asked for)", color=FG, fontsize=14)
fig.text(0.99, 0.01, "REVTURN by JMSCNC  |  X motor = melody, " + ("Z motor = bassline" if "zbass" in run.name else "spindle = bass drone"), ha="right", color=DIM)
fig.tight_layout(); fig.savefig(run / "song_spectrogram.png", dpi=120); plt.close(fig)

# pitch track phyphox computed itself (f0 against its own t), on the recorder clock
f0 = phone.get("f0", {}).get("buffer", []); tt = phone.get("t", {}).get("buffer", [])
fig, ax = plt.subplots(figsize=(16, 6))
if AUDIO:
    lo = int(np.searchsorted(F, 180))
    pts = [(T[i] - song0, float(F[lo + np.argmax(M[i, lo:])])) for i in range(len(T))]
else:
    pts = [(t + t_phone0 - song0, f) for t, f in zip(tt, f0) if t is not None and f is not None and 50 < f < FMAX]
if pts: ax.scatter(*zip(*pts), s=6, color=FG, label="peak pitch the phone heard")
draw_notes(ax, lw=3)
ax.set_ylim(0, 600); ax.set_xlim(0, (song1 or 60) - song0); ax.set_xlabel("seconds"); ax.set_ylabel("Hz")
ax.set_title("REVTURN Ode to Joy: heard pitch (green) vs programmed note (orange)", color=FG, fontsize=14)
fig.tight_layout(); fig.savefig(run / "song_pitch.png", dpi=120); plt.close(fig)

# raw audio chunks in order (gappy)
chunks = [np.array([v or 0 for v in p.get("recording", [])], float) for p in poll if p.get("recording")]
if chunks:
    a = np.concatenate(chunks); a = a / max(1e-9, np.abs(a).max())
    with wave.open(str(run / "song_chunks.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes((a * 32000).astype("<i2").tobytes())

# score: how many notes the phone heard within a quarter tone (median pitch over the middle of each note)
hits = []
for st, s in notes:
    a0, a1 = st + 0.25 * s["seconds"] - song0, st + 0.85 * s["seconds"] - song0
    seg = [f for t, f in pts if a0 <= t <= a1]
    near = [f for f in seg if abs(1200 * np.log2(f / s["hz"])) < 50 or abs(1200 * np.log2(f / (2 * s["hz"]))) < 50]
    hits.append((s["note"], s["hz"], float(np.median(seg)) if seg else None, len(near) > len(seg) / 3 if seg else False))
(run / "song_notes.csv").write_text("note,hz,heard_median_hz,in_tune\n" + "\n".join(f"{n},{h},{'' if m is None else round(m,1)},{ok}" for n, h, m, ok in hits) + "\n")
print(f"spectrum frames {len(frames)} (df {df:.2f} Hz), pitch points {len(pts)}, audio chunks {len(chunks)}, notes in tune {sum(1 for *_, ok in hits if ok)}/{len(hits)}")

import subprocess

def video(fig, axes, name):  # the graph draws itself left to right in real time (video overlay, no sound)
    fig.canvas.draw(); H = fig.get_size_inches()[1] * fig.dpi
    bbs = [ax.get_window_extent() for ax in axes]
    x0, x1 = int(bbs[0].x0) + 1, int(bbs[0].x1)
    ytop, ybot = int(H - max(b.y1 for b in bbs)) + 1, int(H - min(b.y0 for b in bbs))
    png = run / f"{name}_base.png"; fig.savefig(png, dpi=fig.dpi); plt.close(fig)
    dur = (song1 or T[-1]) - song0; speed = (x1 - x0) / dur
    flt = (f"[0]format=rgb24[b];color=c=0x0b0f0c:s={x1-x0}x{ybot-ytop}:d={dur}[m];color=c=0x9dff9d:s=2x{ybot-ytop}:d={dur}[c];"
           f"[b][m]overlay=x='{x0}+t*{speed:.4f}':y={ytop}:eval=frame[bm];[bm][c]overlay=x='{x0}+t*{speed:.4f}':y={ytop}:eval=frame,format=yuv420p")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "30", "-i", str(png),
                    "-filter_complex", flt, "-t", f"{dur:.2f}", "-r", "30", "-c:v", "libx264", "-crf", "18", str(run / f"{name}.mp4")], check=True)
    print("video", run / f"{name}.mp4", f"{dur:.1f} s; starts 1.0 s before the first sound")

if "--video" in sys.argv:
    fig, ax = plt.subplots(figsize=(16, 9)); spectro(ax); draw_notes(ax)
    ax.set_title("REVTURN plays Ode to Joy (orange = the note the program asked for)", color=FG, fontsize=14)
    fig.tight_layout(); video(fig, [ax], "song_spectrogram")

# SHAKE: the accelerometer (REVTURN Mic 4 records it with the sound)
ax_ = phone.get("accX", {}).get("buffer", [])
if ax_:
    from scipy.signal import spectrogram as _sg2
    at = np.array([v or 0 for v in phone["acc_time"]["buffer"]], float) + t_phone0 - song0
    acc = np.array([[v or 0 for v in phone[k]["buffer"]] for k in ("accX", "accY", "accZ")], float)
    n = min(len(at), acc.shape[1]); at, acc = at[:n], acc[:, :n]
    mag = np.sqrt((acc ** 2).sum(axis=0))
    fs = (n - 1) / (at[-1] - at[0])
    win = max(1, int(fs * 0.1)); k = len(mag) // win
    rms_t = at[: k * win].reshape(k, win).mean(axis=1); rms = np.sqrt((mag[: k * win].reshape(k, win) ** 2).mean(axis=1))
    fA, tA, SA = _sg2(acc - acc.mean(axis=1, keepdims=True), fs=fs, nperseg=256, noverlap=224)
    SA = SA.sum(axis=0)
    def shake_fig():
        fig, (a1, a2) = plt.subplots(2, 1, figsize=(16, 9), sharex=True, gridspec_kw={"height_ratios": [1, 1.6]})
        a1.fill_between(rms_t, rms, color=FG, alpha=0.35, lw=0); a1.plot(rms_t, rms, color=FG, lw=1)
        a1.set_ylabel("shake m/s2 (RMS)")
        for st, s in notes:
            a1.axvline(st - song0, color=DIM, lw=0.5)
            a1.text(st - song0, rms.max() * 1.02, s["note"], color=ACC, fontsize=7)
        if "4800" in first: a1.text(first["4800"] - song0, rms.max() * 0.85, "DOLPHIN", color=ACC, fontsize=11)
        a2.pcolormesh(tA + at[0], fA, 10 * np.log10(SA + 1e-12), shading="auto", cmap="magma",
                      vmin=np.percentile(10 * np.log10(SA + 1e-12), 40), vmax=np.percentile(10 * np.log10(SA + 1e-12), 99.7))
        a2.set_ylabel("shake Hz (folds above %d)" % int(fs / 2)); a2.set_xlabel("seconds")
        a2.set_xlim(0, (song1 or at[-1]) - song0)
        a1.set_title("REVTURN Ode to Joy: how hard the cross slide shook (phone accelerometer, about %d samples/s)" % round(fs), color=FG, fontsize=14)
        fig.text(0.99, 0.01, "REVTURN by JMSCNC", ha="right", color=DIM); fig.tight_layout()
        return fig, [a1, a2]
    fig, _ = shake_fig(); fig.savefig(run / "song_shake.png", dpi=120); plt.close(fig)
    print(f"shake: {n} samples at {fs:.0f}/s, peak RMS {rms.max():.2f} m/s2, median {np.median(rms):.2f}")
    if "--video" in sys.argv:
        fig, axes = shake_fig(); video(fig, axes, "song_shake")
