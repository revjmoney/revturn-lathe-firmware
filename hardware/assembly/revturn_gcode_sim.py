# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
"""REVTURN g-code to motion timeline, for the FreeCAD animation macro (Rev 2026-11-10).

Pure Python, no FreeCAD: turns a program into straight-line segments in machine terms
(X as RADIUS in mm, Z in mm, C in degrees) with a duration each, the way the REVTURN grblHAL lathe runs it:
  - G7 (default here, the screen always sends it) = X words are DIAMETERS; G8 = radius
  - G20 / G21, G90 / G91, G93 inverse time / G94 units per minute (F applies to the linear axes; C alone uses deg/min)
  - G0 runs each axis at its max rate ($110 / $112 / $113), G1 at F, capped per axis the same way
  - G2 / G3 arcs are drawn as straight lines (the screen's cycles do not use them)
  - M3 / M4 / M5 + S spin the chuck; C words index it; G28 C0 sends C to the nearest whole turn
  - $J= jog lines move like G1; G4 P dwells; everything else (G10, $ settings, comments) is skipped
Acceleration is ignored, so times are a little short.
"""
import json, math, re

MAX_RATE = {'x': 1016.0, 'z': 914.4, 'c': 99000.0}   # mm/min (X real), mm/min, deg/min: Rev's $110 $112 $113
WORD = re.compile(r'([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))')


def program_text(path):
    """A .nc / .gcode file, or a REVTURN screen program (.json) made of g-code steps."""
    raw = open(path, encoding='utf-8', errors='replace').read()
    if path.lower().endswith('.json'):
        prog = json.loads(raw)
        parts = []
        for st in prog.get('steps', []):
            if st.get('cycle') == 'gcode':
                parts.append(st.get('params', {}).get('text', ''))
            else:
                parts.append('(skipped %s cycle: only g-code steps are animated)' % st.get('cycle'))
        return '\n'.join(parts)
    return raw


def strip(line):
    line = re.sub(r'\([^)]*\)', ' ', line)
    return line.split(';', 1)[0].strip().upper()


def build(text):
    """Returns (segments, info). A segment: dict(t0, dt, a=(xr,z,c), b=(xr,z,c), rpm, dir, line, src)."""
    st = {'abs': True, 'mm': False, 'dia': True, 'inv': False, 'motion': 0, 'f': 0.0, 's': 0.0, 'dir': 0}
    pos = [0.0, 0.0, 0.0]              # X radius mm, Z mm, C deg
    segs, t = [], 0.0
    info = {'lines': 0, 'moves': 0, 'x_range': [0.0, 0.0], 'z_range': [0.0, 0.0], 'skipped_arcs': 0}

    for n, src in enumerate(text.splitlines(), 1):
        line = strip(src)
        if not line:
            continue
        info['lines'] += 1
        jog = line.startswith('$J=')
        if line.startswith('$') and not jog:
            continue
        if jog:
            line = line[3:]
        words = WORD.findall(line)
        g = [float(v) for k, v in words if k == 'G']
        m = [float(v) for k, v in words if k == 'M']
        val = {k: float(v) for k, v in words if k not in 'GMN'}
        if any(x in (10, 92, 53) for x in g):            # offsets / machine coordinates: not motion here
            continue
        abs_mode, mm_mode = st['abs'], st['mm']
        for x in g:
            if x == 0: st['motion'] = 0
            elif x == 1: st['motion'] = 1
            elif x in (2, 3): st['motion'] = 1; info['skipped_arcs'] += 1
            elif x == 7: st['dia'] = True
            elif x == 8: st['dia'] = False
            elif x == 20: st['mm'] = False
            elif x == 21: st['mm'] = True
            elif x == 90: st['abs'] = True
            elif x == 91: st['abs'] = False
            elif x == 93: st['inv'] = True
            elif x == 94: st['inv'] = False
        if jog:                                          # $J= words take their own G90/G91 for this line only
            abs_mode = 90 in g or (91 not in g and st['abs'])
        else:
            abs_mode = st['abs']
        mm_mode = st['mm']
        if 'F' in val: st['f'] = val['F']
        if 'S' in val: st['s'] = val['S']
        for x in m:
            if x == 3: st['dir'] = 1
            elif x == 4: st['dir'] = -1
            elif x in (5, 30, 2): st['dir'] = 0
        unit = 1.0 if mm_mode else 25.4
        rpm = st['s'] * st['dir']

        if 4 in g:                                       # dwell
            dt = val.get('P', 0.0)
            segs.append({'t0': t, 'dt': dt, 'a': tuple(pos), 'b': tuple(pos), 'rpm': rpm, 'line': n, 'src': src.strip()})
            t += dt
            continue
        if 28 in g:                                      # G28 C0 (the C unwind): nearest whole turn
            if 'C' in val:
                tgt = list(pos); tgt[2] = round(pos[2] / 360.0) * 360.0
                dt = abs(tgt[2] - pos[2]) / MAX_RATE['c'] * 60.0
                segs.append({'t0': t, 'dt': dt, 'a': tuple(pos), 'b': tuple(tgt), 'rpm': rpm, 'line': n, 'src': src.strip()})
                t += dt; pos = tgt
            continue

        tgt = list(pos)
        if 'X' in val:
            xr = val['X'] * unit / (2.0 if st['dia'] else 1.0)
            tgt[0] = xr if abs_mode else pos[0] + xr
        if 'Z' in val:
            z = val['Z'] * unit
            tgt[1] = z if abs_mode else pos[1] + z
        if 'C' in val:
            tgt[2] = val['C'] if abs_mode else pos[2] + val['C']
        d = [abs(tgt[i] - pos[i]) for i in range(3)]
        if not any(d):
            if rpm != (segs[-1]['rpm'] if segs else 0):  # spindle change on its own line: a short marker
                segs.append({'t0': t, 'dt': 0.05, 'a': tuple(pos), 'b': tuple(pos), 'rpm': rpm, 'line': n, 'src': src.strip()})
                t += 0.05
            continue
        lin = (d[0] ** 2 + d[1] ** 2) ** 0.5
        floor = max(d[0] / MAX_RATE['x'], d[1] / MAX_RATE['z'], d[2] / MAX_RATE['c'])  # minutes, per-axis caps
        if st['motion'] == 0 and not jog:
            minutes = floor
        elif st['inv'] and not jog:
            minutes = max(1.0 / st['f'] if st['f'] > 0 else floor, floor)
        else:
            f = st['f'] * (1.0 if lin == 0 else unit)          # C alone: F is deg/min
            minutes = max((lin if lin > 0 else d[2]) / f if f > 0 else floor, floor)
        dt = minutes * 60.0
        segs.append({'t0': t, 'dt': dt, 'a': tuple(pos), 'b': tuple(tgt), 'rpm': rpm, 'line': n, 'src': src.strip(),
                     'rapid': st['motion'] == 0 and not jog})
        t += dt
        pos = tgt
        info['moves'] += 1
        info['x_range'] = [min(info['x_range'][0], pos[0]), max(info['x_range'][1], pos[0])]
        info['z_range'] = [min(info['z_range'][0], pos[1]), max(info['z_range'][1], pos[1])]
    info['seconds'] = t
    return segs, info


STOCK_COMMENT = re.compile(r'\(\s*STOCK\b([^)]*)\)', re.I)


def _num(text, keys):
    for k in keys:
        m = re.search(r'\b' + k + r'\s*[=:]?\s*([0-9]*\.?[0-9]+)', text, re.I)
        if m:
            return float(m.group(1))
    return None


def detect_stock(path, segs=None):
    """Stock size in inches: dict(dia, stickout, length, source).
    1. a screen program's "stock" entry, 2. a "(STOCK DIA 1.5 LEN 3 STICKOUT 2)" comment (D / L / S short forms too),
    3. otherwise estimated from the moves: the largest cutting diameter (feed moves) rounded up to 1/16 in, and the
       deepest Z plus 1/4 in of stickout. Anything missing from 1 or 2 is filled in from 3."""
    raw = open(path, encoding='utf-8', errors='replace').read()
    found = {}
    source = None
    if path.lower().endswith('.json'):
        st = json.loads(raw).get('stock') or {}
        for k, alts in (('dia', ('dia', 'diameter', 'd')), ('length', ('length', 'len', 'l')), ('stickout', ('stickout', 'stick_out', 's'))):
            for a in alts:
                if isinstance(st, dict) and a in st:
                    found[k] = float(st[a]); break
        if found: source = 'program stock entry'
    if not found:
        m = STOCK_COMMENT.search(raw)
        if m:
            body = m.group(1)
            v = {'dia': _num(body, ('DIA', 'DIAMETER', 'D')), 'length': _num(body, ('LEN', 'LENGTH', 'L')),
                 'stickout': _num(body, ('STICKOUT', 'STICK', 'S'))}
            found = {k: x for k, x in v.items() if x is not None}
            if found: source = 'program comment'
    if segs is None:
        segs, _ = build(program_text(path))
    cut = [s for s in segs if not s.get('rapid', True)]
    # the diameter of passes that cut along Z (turning), plus 1/16 in; facing / plunges start in the air
    along_z = [2 * s['b'][0] for s in cut if abs(s['b'][1] - s['a'][1]) > 1e-6]
    max_dia = (max(along_z or [2 * max(s['a'][0], s['b'][0]) for s in cut] or [25.4]) / 25.4) + 0.0625
    min_z = min([min(s['a'][1], s['b'][1]) for s in segs] or [0.0]) / 25.4
    up = lambda x: math.ceil(x * 16 - 1e-9) / 16.0
    est = {'dia': up(max_dia), 'stickout': up(abs(min(0.0, min_z)) + 0.25)}
    est['length'] = est['stickout'] + 0.75
    out = {k: found.get(k, est[k]) for k in ('dia', 'stickout', 'length')}
    if 'length' not in found and 'stickout' in found:
        out['length'] = out['stickout'] + 0.75
    out['source'] = source + (' + estimate' if len(found) < 3 else '') if source else 'estimated from the moves'
    return out


def state_at(segs, t):
    """Machine position (xr, z, c), spindle rpm and the segment index at time t (seconds)."""
    if not segs:
        return (0.0, 0.0, 0.0), 0.0, -1
    lo, hi = 0, len(segs) - 1
    while lo < hi:                                       # binary search on t0
        mid = (lo + hi + 1) // 2
        if segs[mid]['t0'] <= t: lo = mid
        else: hi = mid - 1
    s = segs[lo]
    k = 1.0 if s['dt'] <= 0 else min(1.0, max(0.0, (t - s['t0']) / s['dt']))
    p = tuple(s['a'][i] + (s['b'][i] - s['a'][i]) * k for i in range(3))
    return p, s['rpm'], lo


if __name__ == '__main__':
    import sys
    segs, info = build(program_text(sys.argv[1]))
    print(json.dumps(info, indent=1))
    print('segments', len(segs))
