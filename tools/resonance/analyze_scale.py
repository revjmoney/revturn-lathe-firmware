# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
"""REVTURN full-sweep / stepper-music analysis. Copyright 2026 JMSCNC / Rev. J. Money (jmscnc.com).

Usage: python -I analyze_scale.py runs/<scale_x|scale_z|scale_c|chords run folder>
Needs the run folder from record.mjs: phone.json, lathe.csv (with line_n), meta.json, <program>.schedule.json.

Per step (one quarter tone, or one chord), using exactly the time the lathe reported that step's N line:
  rms        vibration level (m/s^2, gravity and offsets removed)
  peak_hz    strongest frequency the phone saw (it samples ~403 Hz, so it sees 3..200 Hz)
  motor_hz   the motor's full-step pitch; motor_seen = where that lands in the phone's band (folded above 200 Hz)
  motor_share  how much of the vibration sits at the motor pitch (+-3 Hz, and its fold)
  reached    actual feed / rpm reported by the lathe vs commanded (below 90% = did not get up to speed)
Flags ("weird things"):
  LOUD       rms more than 1.6x the median of the 4 steps on each side (a resonance)
  RING       strongest frequency is not the motor pitch, its fold or a harmonic: something else is ringing
  SLOW       the axis never reached 90% of the commanded speed (stall / skip risk)
Writes report.csv, notes.csv, waterfall.png, rms.png and summary.md into the run folder.
"""
import csv, json, os, sys
import numpy as np

run = sys.argv[1].rstrip('/\\')
meta = json.load(open(os.path.join(run, 'meta.json')))
sched = json.load(open(os.path.join(run, meta['file'].replace('.nc', '.schedule.json'))))
steps = sched['steps']
ph = json.load(open(os.path.join(run, 'phone.json')))
t = np.array(ph['acc_time']['buffer'], float)
acc = np.vstack([ph[k]['buffer'] for k in ('accX', 'accY', 'accZ')]).T.astype(float)
fs = (len(t) - 1) / (t[-1] - t[0]); nyq = fs / 2
t_pc = meta['tPhoneStartMs'] / 1000.0 + t

rows = list(csv.DictReader(open(os.path.join(run, 'lathe.csv'))))
lt = np.array([float(r['t_ms']) / 1000 for r in rows])
ln = np.array([int(r['line_n']) if r['line_n'] else -1 for r in rows])
feed = np.array([float(r['feed_mm_min']) / 25.4 for r in rows])
rpm = np.array([float(r['rpm']) for r in rows])
kind = 'chords' if 'label' in steps[0] else steps[0]['axis']

def fold(f):
    f = f % fs
    return fs - f if f > nyq else f

def windows(n, target, is_spin):
    """time windows (PC clock) when line n ran at >= 90% of its commanded speed; plus the best speed reached"""
    idx = np.where(ln == n)[0]
    if len(idx) == 0:
        return [], 0.0
    live = rpm if is_spin else feed
    best = float(live[idx].max())
    ok = idx[live[idx] >= 0.9 * target] if target else idx
    if is_spin and len(ok):
        ok = ok[lt[ok] >= lt[ok[0]] + 0.6]           # let the spindle settle
    wins, start, prev = [], None, None
    for i in ok:
        if start is None: start = prev = i; continue
        if lt[i] - lt[prev] > 0.25: wins.append((lt[start], lt[prev] + 0.1)); start = i
        prev = i
    if start is not None: wins.append((lt[start], lt[prev] + 0.1))
    return [(a + 0.1, b) for a, b in wins if b - a > 0.35], best

GRID = np.linspace(0, nyq, 512)
def spectrum(wins):
    chunks = [acc[(t_pc >= a) & (t_pc < b)] for a, b in wins]
    chunks = [c - c.mean(axis=0) for c in chunks if len(c) > 48]
    if not chunks: return None
    x = np.vstack(chunks)
    rms = float(np.sqrt((np.linalg.norm(x, axis=1) ** 2).mean()))
    spec = np.zeros_like(GRID)
    for c in chunks:
        w = np.hanning(len(c))[:, None]
        p = (np.abs(np.fft.rfft(c * w, axis=0)) ** 2).sum(axis=1)
        spec += np.interp(GRID, np.fft.rfftfreq(len(c), 1 / fs), p)
    return rms, spec, len(x) / fs

# Steps the lathe log never saw (2026-11-11: a second websocket client during the C run took the status stream for
# 88.7 s) are TIMED from their neighbours: the program is clockwork, so a missing step's start is interpolated
# between the last logged step before it and the first logged step after it. Marked timed=True in the report.
starts = {}
for i, v in enumerate(ln):
    if v >= 0 and v not in starts: starts[int(v)] = lt[i]
step_ns = [s['n'] for s in steps]
def timed_window(n, is_spin):
    k = step_ns.index(n)
    before = next((step_ns[j] for j in range(k - 1, -1, -1) if step_ns[j] in starts), None)
    after = next((step_ns[j] for j in range(k + 1, len(step_ns)) if step_ns[j] in starts), None)
    if before is None or after is None: return []
    kb, ka = step_ns.index(before), step_ns.index(after)
    per = (starts[after] - starts[before]) / (ka - kb)
    a = starts[before] + (k - kb) * per
    return [(a + (0.8 if is_spin else 0.3), a + per - 0.2)]

base_wins = [(t_pc[0] + 0.1, t_pc[0] + 1.3)]
base = spectrum(base_wins)
results = []
for s in steps:
    n = s['n']
    if kind == 'chords':
        is_spin = not (s['xIpm'] or s['zIpm'])
        target = s['rpm'] if is_spin else s['pathF']
        pitches = [p for p in (s['xHz'], s['zHz'], s['cHz']) if p]
    else:
        is_spin = s['axis'] == 'C'
        target = s['speed']
        pitches = [s['hz']]
    wins, best = windows(n, target, is_spin)
    timed = False
    if not wins and n not in starts:
        wins, timed = timed_window(n, is_spin), True
    m = spectrum(wins)
    r = dict(s, rms=None, peak_hz=None, motor_seen=None, motor_share=None, reached=None if timed else (round(best / target, 3) if target else None), seconds=0, flags=[], timed=timed)
    if m:
        rms, spec, secs = m
        band = GRID > 3
        k = int(np.argmax(np.where(band, spec, 0)))
        # the motor family: 1/4 (one electrical cycle), 1/2 (TB6600 coil-current mismatch shows here), 1x and 2x the
        # full-step pitch, each folded into the phone's band. Found 2026-11-11: X shakes mostly at 1/2 its pitch.
        fam = {}
        for p in pitches:
            for m_, name in ((0.25, '1/4'), (0.5, '1/2'), (1, '1x'), (2, '2x')):
                fam.setdefault(name, []).append(round(fold(m_ * p), 1))
        seen = sorted({f for v in fam.values() for f in v})
        near = np.zeros_like(GRID, bool)
        for f in seen: near |= np.abs(GRID - f) <= 3
        share = float(spec[near & band].sum() / spec[band].sum())
        pk = float(GRID[k])
        match = next((name for name, v in fam.items() if any(abs(pk - f) <= 4 for f in v)), None)
        r.update(rms=round(rms, 4), peak_hz=round(pk, 1), motor_seen=fam.get('1x'), motor_share=round(share, 3), peak_is=match or 'other', seconds=round(secs, 2), _spec=spec)
        if match is None and share < 0.25: r['flags'].append('RING')
    if r['reached'] is not None and r['reached'] < 0.9: r['flags'].append('SLOW')
    results.append(r)

vals = [r['rms'] for r in results]
for i, r in enumerate(results):
    if r['rms'] is None: continue
    nb = [v for v in vals[max(0, i - 4):i] + vals[i + 1:i + 5] if v is not None]
    if nb and r['rms'] > 1.6 * float(np.median(nb)): r['flags'].append('LOUD')

# ---- files ----
cols = ['n', 'label', 'axis', 'note', 'q', 'hz', 'speed', 'xHz', 'zHz', 'cHz', 'xIpm', 'zIpm', 'rpm', 'pathF', 'rms', 'peak_hz', 'motor_seen', 'motor_share', 'peak_is', 'reached', 'timed', 'seconds', 'flags']
cols = [c for c in cols if any(c in r for r in results)]
with open(os.path.join(run, 'report.csv'), 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(cols)
    for r in results: w.writerow([' '.join(r[c]) if c == 'flags' else (r.get(c) if not isinstance(r.get(c), list) else ' '.join(map(str, r[c]))) for c in cols])
med = float(np.median([v for v in vals if v is not None]))
if kind != 'chords':
    unit = 'rpm' if kind == 'C' else 'ipm'
    with open(os.path.join(run, 'notes.csv'), 'w', newline='') as fh:
        w = csv.writer(fh); w.writerow(['note', 'pitch_hz', unit, 'rms', 'verdict', 'flags'])
        for r in results:
            if r.get('note'):
                verdict = '' if r['rms'] is None else ('smooth' if r['rms'] < 0.8 * med else 'rough' if r['rms'] > 1.3 * med else 'ok')
                w.writerow([r['note'], r['hz'], r['speed'], r['rms'], verdict, ' '.join(r['flags'])])

lines = [f"# {meta['file']} ({kind})", '',
         f"Recorded {meta.get('startedAt', '?')}: {len(t)} phone samples at {fs:.0f} Hz, {meta['statusCount']} lathe status lines, "
         f"background {base[0]:.3f} m/s^2, median step {med:.3f} m/s^2.", '']
flagged = [r for r in results if r['flags']]
lines.append(f"## Weird things ({len(flagged)} steps flagged)")
for r in flagged:
    name = r.get('label') or f"{r.get('note') or 'q'} {r['hz']} Hz = {r['speed']} {'rpm' if kind == 'C' else 'ipm'}"
    lines.append(f"- **{' '.join(r['flags'])}** {name}: rms {r['rms']}, strongest {r['peak_hz']} Hz = {r.get('peak_is')} pitch, reached {r['reached']}")
lines.append('')
if kind == 'chords':
    lines.append('## Chords (loudest first)')
    for r in sorted([r for r in results if r['rms'] is not None], key=lambda r: -r['rms']):
        lines.append(f"- {r['rms']:.3f} m/s^2 ({r['rms'] / base[0]:.0f}x background): {r['label']}  [strongest {r['peak_hz']} Hz]")
else:
    good = [r for r in results if r.get('note') and r['rms'] is not None and r['rms'] < 0.8 * med and not r['flags']]
    lines.append(f"## Smooth notes ({len(good)}): " + ', '.join(f"{r['note']} ({r['speed']})" for r in good))
    loud = sorted([r for r in results if r['rms'] is not None], key=lambda r: -r['rms'])[:8]
    lines.append('## Roughest steps: ' + ', '.join(f"{r.get('note') or 'q'} {r['hz']} Hz / {r['speed']} = {r['rms']}" for r in loud))
open(os.path.join(run, 'summary.md'), 'w', encoding='utf8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))

try:
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    def style(ax):
        ax.set_facecolor('#05080a'); ax.tick_params(colors='#cfd8dc'); [s_.set_color('#36506a') for s_ in ax.spines.values()]
    good_r = [r for r in results if r['rms'] is not None]
    # rms by step
    fig, ax = plt.subplots(figsize=(13, 5), facecolor='#05080a'); style(ax)
    xs = range(len(good_r))
    ax.bar(xs, [r['rms'] for r in good_r], color=['#c0392b' if 'LOUD' in r['flags'] else '#e0a100' if r['flags'] else '#ffd84a' for r in good_r])
    ax.axhline(base[0], color='#8fb3ff', ls='--', lw=1)
    lab = [r.get('label', '')[:22] if kind == 'chords' else (r.get('note') or '') for r in good_r]
    ax.set_xticks(list(xs)); ax.set_xticklabels(lab, rotation=90, fontsize=7, color='#cfd8dc')
    ax.set_ylabel('vibration rms (m/s²)', color='#cfd8dc')
    ax.set_title(f"REVTURN {meta['file']}: shake per step (red = LOUD, amber = other flag)", color='#ffd84a')
    fig.tight_layout(); fig.savefig(os.path.join(run, 'rms.png'), dpi=110, facecolor='#05080a'); plt.close(fig)
    # waterfall: one row per step, frequency across
    W = np.array([np.log10(r['_spec'] / r['_spec'].max() + 1e-6) for r in good_r])
    fig, ax = plt.subplots(figsize=(11, 9), facecolor='#05080a'); style(ax)
    ax.imshow(W, aspect='auto', origin='lower', extent=[0, nyq, -0.5, len(good_r) - 0.5], cmap='inferno', vmin=-3, vmax=0)
    if kind != 'chords':
        ax.plot([r['motor_seen'][0] for r in good_r], range(len(good_r)), '.', color='#7fffb0', ms=3, label='motor pitch (folded)')
        ax.legend(facecolor='#05080a', labelcolor='#cfd8dc', loc='upper right')
    ax.set_yticks(list(range(0, len(good_r), max(1, len(good_r) // 30))))
    ax.set_yticklabels([lab[i] or str(good_r[i].get('hz', '')) for i in range(0, len(good_r), max(1, len(good_r) // 30))], fontsize=7, color='#cfd8dc')
    ax.set_xlabel('frequency the phone felt (Hz)', color='#cfd8dc')
    ax.set_title(f"REVTURN {meta['file']}: vibration spectrum per step (bright = strong)", color='#ffd84a')
    fig.tight_layout(); fig.savefig(os.path.join(run, 'waterfall.png'), dpi=110, facecolor='#05080a'); plt.close(fig)
    print('charts: rms.png, waterfall.png')
except ImportError:
    pass
