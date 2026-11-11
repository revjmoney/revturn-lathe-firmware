"""REVTURN resonance analysis: how hard the slide shakes at each spindle rpm or feed, and at what frequency.
Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).

Usage: python -I analyze.py runs/<run folder> [--by rpm|feed]
Reads phone.json (phyphox Acceleration without g) + lathe.csv (the lathe's live status, PC timestamps), cuts one
window per speed (dropping the first 1.2 s of each speed: the ramp), and prints, per speed:
  rms  = vibration level (m/s^2, after removing gravity/offset), x background = how many times the still phone
  peak = the strongest frequency in that window (Hz) and its share of the vibration
Also writes report.csv and report.png (if matplotlib is there) into the run folder.
"""
import csv, json, sys, os
import numpy as np

run = sys.argv[1]
by = sys.argv[sys.argv.index('--by') + 1] if '--by' in sys.argv else None
meta = json.load(open(os.path.join(run, 'meta.json')))
ph = json.load(open(os.path.join(run, 'phone.json')))
t = np.array(ph['acc_time']['buffer'], float)
a = np.vstack([ph[k]['buffer'] for k in ('accX', 'accY', 'accZ')]).T.astype(float)
fs = (len(t) - 1) / (t[-1] - t[0])
t_pc = meta['tPhoneStartMs'] / 1000.0 + t          # phone sample times on the PC clock (s)

rows = list(csv.DictReader(open(os.path.join(run, 'lathe.csv'))))
lt = np.array([float(r['t_ms']) / 1000 for r in rows])
rpm = np.array([float(r['rpm']) for r in rows])
feed_ipm = np.array([float(r['feed_mm_min']) / 25.4 for r in rows])
if by is None:
    by = 'rpm' if rpm.max() > 0 and feed_ipm.max() < 1 else 'feed'

def segments():
    """(label, t_start, t_end) for every stretch where the lathe held one speed."""
    segs = []
    if by == 'rpm':
        vals = rpm
        key = lambda v: int(round(v))
    else:  # feed: group by the commanded feed, read from moving stretches (FS feed is the live rate)
        vals = feed_ipm
        key = lambda v: int(round(v))
    cur, start = None, None
    for i, v in enumerate(vals):
        k = key(v) if v > 0.5 else None
        if k != cur:
            if cur is not None:
                segs.append((cur, start, lt[i]))
            cur, start = k, lt[i]
    if cur is not None:
        segs.append((cur, start, lt[-1]))
    # merge repeats of the same speed (back-and-forth strokes) and keep the long ones
    # rpm: one long hold per speed, drop the 1.2 s ramp. feed: many short strokes per speed (about 1 s at the fast
    # feeds), keep every stroke of 0.5 s or more minus 0.15 s at each end (accel / decel), and add them up.
    out = {}
    for k, s, e in segs:
        if by == 'rpm' and e - s >= 1.5:
            out.setdefault(k, []).append((s + 1.2, e - 0.2))
        elif by != 'rpm' and e - s >= 0.5:
            out.setdefault(k, []).append((s + 0.15, e - 0.15))
    return out

def measure(windows):
    chunks = [a[(t_pc >= s) & (t_pc < e)] for s, e in windows if e > s]
    chunks = [c - c.mean(axis=0) for c in chunks if len(c) > 64]
    if not chunks:
        return None
    x = np.vstack(chunks)
    rms = float(np.sqrt((np.linalg.norm(x, axis=1) ** 2).mean()))
    # spectrum: sum of the three axes' power, Hann window on each chunk
    spec, freqs = None, None
    for c in chunks:
        w = np.hanning(len(c))[:, None]
        p = (np.abs(np.fft.rfft(c * w, axis=0)) ** 2).sum(axis=1)
        f = np.fft.rfftfreq(len(c), 1 / fs)
        grid = np.linspace(0, fs / 2, 400)
        pi = np.interp(grid, f, p)
        spec = pi if spec is None else spec + pi
        freqs = grid
    band = freqs > 3                                  # ignore drift below 3 Hz
    k = np.argmax(spec[band])
    peak = float(freqs[band][k])
    share = float(spec[band][k] / spec[band].sum())
    return rms, peak, share, len(x) / fs

base = measure([(t_pc[0] + 0.1, t_pc[0] + 1.4)])     # the quiet 1.5 s before the program started
segs = segments()
print(f'{run}: {len(t)} samples at {fs:.0f} Hz, by {by}; background rms {base[0]:.3f} m/s^2')
print(f'{"speed":>8} {"rms m/s2":>9} {"x bkgd":>7} {"peak Hz":>8} {"share":>6} {"sec":>5}')
report = []
for k in sorted(segs):
    m = measure(segs[k])
    if not m:
        continue
    rms, peak, share, secs = m
    report.append((k, rms, rms / base[0], peak, share, secs))
med = float(np.median([r[1] for r in report])) if report else 0
for k, rms, xb, peak, share, secs in report:
    flag = '  <== shakes' if rms > 1.8 * med else ''
    unit = 'rpm' if by == 'rpm' else 'ipm'
    print(f'{k:>5} {unit} {rms:9.3f} {xb:7.1f} {peak:8.1f} {share:6.0%} {secs:5.1f}{flag}')
with open(os.path.join(run, 'report.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow([by, 'rms_m_s2', 'x_background', 'peak_hz', 'peak_share', 'seconds'])
    for r in report: w.writerow([r[0], f'{r[1]:.4f}', f'{r[2]:.2f}', f'{r[3]:.1f}', f'{r[4]:.3f}', f'{r[5]:.1f}'])
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(2, 1, figsize=(10, 7), facecolor='#05080a')
    for x_ in ax:
        x_.set_facecolor('#05080a'); x_.tick_params(colors='#cfd8dc'); [s.set_color('#36506a') for s in x_.spines.values()]
    ks = [r[0] for r in report]
    ax[0].bar(ks, [r[1] for r in report], width=(ks[1] - ks[0]) * 0.7 if len(ks) > 1 else 1, color='#ffd84a')
    ax[0].axhline(base[0], color='#8fb3ff', ls='--', lw=1)
    ax[0].set_ylabel('vibration rms (m/s²)', color='#cfd8dc'); ax[0].set_title(f'REVTURN shake by {by}', color='#ffd84a')
    ax[1].scatter(ks, [r[3] for r in report], s=[300 * r[4] + 10 for r in report], color='#7fffb0')
    ax[1].set_ylabel('strongest frequency (Hz)', color='#cfd8dc'); ax[1].set_xlabel('rpm' if by == 'rpm' else 'feed (ipm)', color='#cfd8dc')
    fig.tight_layout(); fig.savefig(os.path.join(run, 'report.png'), dpi=110, facecolor='#05080a')
    print('chart:', os.path.join(run, 'report.png'))
except ImportError:
    pass
