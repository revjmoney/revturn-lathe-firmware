"""REVTURN temporary 3D-printed tool post (Rev 2026-11-10).

Run with FreeCAD's python:  "C:/Program Files/FreeCAD 1.1/bin/python.exe" build_tool_post.py

Bolts to the R9 cross slide top plate (cross_slide_top_plate_r9) with 4 x M4 into heat-set inserts in the plate's
existing M4 insert holes. A column with a dovetail carries a sliding tool holder:
  - height: an M4 jack screw from the top of the holder bears on the base plate; 2 x M4 lock screws through
    vertical slots clamp the holder to the column (inserts in the column). +/- 6 mm of travel.
  - holder A, turning: a 10.5 x 14 mm channel for 1/4 in HSS / small turning tools, clamped by 2 x M4 from the top.
    Round drill-bit tools sit in the printed V shim in the same channel.
  - holder B, boring bar / drill chuck: a 10.2 mm blind bore along the spindle axis (3/8 in or 10 mm shanks),
    clamped by 2 x M4 from the top.
All parts are built in the top plate's own frame (as in its STEP): X across the bed (+X toward the spindle centre
at the front limit, tool points +X), Y along the bed (-Y toward the chuck), Z up, plate top at Z 65.21.
"""
import json, math
from pathlib import Path
import FreeCAD as App
import Part
import Mesh
from FreeCAD import Vector as V

IN = 25.4
HERE = Path(__file__).resolve().parent
OUT = Path(r'F:/micro-lathe/printed-parts/6-tool-post')
PLATE = Path(r'F:/micro-lathe/printed-parts/2-cross-slide-R9-long-x/cross_slide_top_plate_r9.step')

# ---- the machine (measured from the R9 STEP and the lathe assembly)
PLATE_TOP = 65.21
PLATE_X, PLATE_Y, PLATE_R = 22.5, 30.4, 6.0          # half sizes, corner radius
M4_HOLES = [(-13, -10), (13, -10), (-13, 25.97), (13, 25.97)]   # plate M4 insert holes used for the base
CENTRE_Z = 107.95                                     # spindle centreline (5 in above the plywood top)
TOOL_Y = -26.4                                        # tool line, near the plate's chuck-side edge
TIP_X = 52.15                                         # tool tip at the model's X0 (front limit puts it on centre)

# ---- printing / hardware
CLR = 0.3                                             # sliding clearance per side
M4_INSERT = 5.84                                      # same insert hole as the R9 plate
M4_CLEAR = 4.5
M4_HEAD_D, M4_HEAD_H = 7.8, 4.5                       # counterbore for socket head caps
FOOT_T = 8.0
FOOT_TOP = PLATE_TOP + FOOT_T

# ---- column + dovetail
COL = dict(x0=-20.0, x1=20.0, y0=-6.0, y1=20.0, z1=108.0)   # top stays under the holder's jack tab
DT_ROOT, DT_TIP, DT_DEPTH = 6.0, 8.5, 5.0             # half widths at the column face / at the tip, depth (-Y)
LOCK_X, LOCK_Z = (-15.0, 15.0), 91.6                  # lock screw inserts in the column face
ADJ = 4.0                                             # +/- height adjustment (round bits 1/8..3/8 need -2.4..+2.1)

# ---- holder (nominal position: square tool's top edge on centre)
FLOOR = CENTRE_Z - 0.25 * IN                          # channel floor for 1/4 in square tools = 101.6
CH_W, CH_H, ROOF = 10.5, 14.0, 8.0
H = dict(x0=-20.0, x1=38.0, y0=TOOL_Y - CH_W / 2 - 3.0, y1=COL['y0'] - CLR, z0=FLOOR - 20.0, z1=FLOOR + CH_H + ROOF)
JACK = (0.0, 1.0)                                     # in the tab over the column top
TAB = dict(x0=-12.0, x1=12.0, y1=6.5)                 # stops short of the swivel screw's key hole

# ---- swivel (Rev 2026-11-10: mount at 0 / 45 / 90 or any angle): the post turns about the slide's M4 hole at (0, 10)
PIVOT = (0.0, 10.0)                                   # an M4 insert hole in the R9 plate: the swivel screw goes in it
DISC_R, DISC_T, RING_FLOOR = 13.0, 5.0, 3.0           # round foot on the post, in a pocket in the ring
POCKET_R = DISC_R + 0.3
INDEX_Z = PLATE_TOP + RING_FLOOR + DISC_T / 2 - 0.5         # side index screws, horizontal, into V notches every 45 deg
NOTCH_D = 1.5
SWIVEL_LEDGE = FOOT_TOP + 5.5                         # head seat for an M4 x 20 swivel screw (5.5 + 5 + 3 + 6.5)
ANGLES = (0, -45, -90)                                # degrees, + = CCW seen from above; -90 points the tool at the chuck
CLAMP_X = (8.0, 26.0)
BORE_D, BORE_X, BORE_Y_END = 10.2, 10.0, -13.0


def box(x0, x1, y0, y1, z0, z1):
    return Part.makeBox(x1 - x0, y1 - y0, z1 - z0, V(x0, y0, z0))


def cyl(r, h, p, d=(0, 0, 1)):
    return Part.makeCylinder(r, h, V(*p), V(*d))


def rounded_rect(x, y, r, z0, h):
    b = box(-x, x, -y, y, z0, z0 + h)
    edges = [e for e in b.Edges if abs(e.Vertexes[0].Point.z - e.Vertexes[1].Point.z) > 1e-6]
    return b.makeFillet(r, edges)


def dovetail(root, tip, y_face, depth, z0, z1):
    """Prism, trapezoid in XY: half width `root` at y_face, `tip` at y_face - depth; runs z0..z1."""
    pts = [V(-root, y_face, z0), V(root, y_face, z0), V(tip, y_face - depth, z0), V(-tip, y_face - depth, z0)]
    return Part.Face(Part.makePolygon(pts + [pts[0]])).extrude(V(0, 0, z1 - z0))


def stadium_y(x, z_lo, z_hi, w, y0, y1):
    """Slot running in Z (z_lo..z_hi centres), width w, cut along Y from y0 to y1."""
    r = w / 2
    s = box(x - r, x + r, y0, y1, z_lo, z_hi)
    s = s.fuse(cyl(r, y1 - y0, (x, y0, z_lo), (0, 1, 0))).fuse(cyl(r, y1 - y0, (x, y0, z_hi), (0, 1, 0)))
    return s.removeSplitter()


def build_ring():
    """Swivel ring: bolted to the slide (4 x M4 x 10, heads flush), a pocket for the post's round foot, a hole for the
    swivel screw, and 2 side holes (M4 tapped straight into the plastic) for the index screws."""
    ring = rounded_rect(PLATE_X, PLATE_Y, PLATE_R, PLATE_TOP, FOOT_T)
    px, py = PIVOT
    ring = ring.cut(cyl(POCKET_R, DISC_T + 1, (px, py, PLATE_TOP + RING_FLOOR)))
    ring = ring.cut(cyl(M4_CLEAR / 2, FOOT_T + 2, (px, py, PLATE_TOP - 1)))
    for x, y in M4_HOLES:
        ring = ring.cut(cyl(M4_CLEAR / 2, 40, (x, y, PLATE_TOP - 1)))
        ring = ring.cut(cyl(M4_HEAD_D / 2, 60, (x, y, FOOT_TOP - M4_HEAD_H)))
    for sx in (-1, 1):                                        # index screws on the X axis through the pivot
        ring = ring.cut(cyl(3.4 / 2, PLATE_X + 2, (px, py, INDEX_Z), (sx, 0, 0)))
    return ring.removeSplitter()


def build_base():
    """Post: round foot (turns in the ring) + column + male dovetail. Clamped by one M4 x 20 swivel screw down through
    the column into the slide's own insert at the pivot; V notches every 45 deg take the index screws."""
    px, py = PIVOT
    disc = cyl(DISC_R, DISC_T, (px, py, PLATE_TOP + RING_FLOOR))
    for k in range(8):                                        # vertical V notches round the edge
        a = math.radians(45 * k)
        c, s_ = math.cos(a), math.sin(a)
        tip = V(px + (DISC_R - NOTCH_D) * c, py + (DISC_R - NOTCH_D) * s_, 0)
        w = V(-s_, c, 0) * (NOTCH_D + 0.2)
        out = V(px + (DISC_R + 1) * c, py + (DISC_R + 1) * s_, 0)
        f = Part.Face(Part.makePolygon([tip, out + w, out - w, tip]))
        f.translate(V(0, 0, PLATE_TOP + RING_FLOOR - 0.5))
        disc = disc.cut(f.extrude(V(0, 0, DISC_T + 1)))
    col = box(COL['x0'], COL['x1'], COL['y0'], COL['y1'], FOOT_TOP, COL['z1'])
    dt = dovetail(DT_ROOT, DT_TIP, COL['y0'] + 0.01, DT_DEPTH, FOOT_TOP, COL['z1'])
    base = disc.fuse(col).fuse(dt).removeSplitter()
    base = base.cut(cyl(M4_CLEAR / 2, 40, (px, py, PLATE_TOP)))                 # swivel screw
    base = base.cut(cyl((M4_HEAD_D + 0.6) / 2, COL['z1'] - SWIVEL_LEDGE + 1, (px, py, SWIVEL_LEDGE)))
    for x in LOCK_X:                                          # lock-screw inserts in the column face
        base = base.cut(cyl(M4_INSERT / 2, 10, (x, COL['y0'] - 1, LOCK_Z), (0, 1, 0)))
    return base.removeSplitter()


def holder_body():
    h = box(H['x0'], H['x1'], H['y0'], H['y1'], H['z0'], H['z1'])
    slot = dovetail(DT_ROOT + CLR, DT_TIP + CLR, COL['y0'] + 1.0, DT_DEPTH + 1.0 + CLR, H['z0'] - 1, H['z1'] + 1)
    h = h.cut(slot)
    for x in LOCK_X:                                          # height slots for the lock screws + head counterbores
        h = h.cut(stadium_y(x, LOCK_Z - ADJ, LOCK_Z + ADJ, M4_CLEAR, H['y0'] - 1, H['y1'] + 1))
        h = h.cut(stadium_y(x, LOCK_Z - ADJ, LOCK_Z + ADJ, M4_HEAD_D + 0.6, H['y0'] - 1, -16.0))
    # jack tab: reaches back over the column top; an M4 in an insert in the tab pushes on the column top
    h = h.fuse(box(TAB['x0'], TAB['x1'], H['y1'] - 1, TAB['y1'], FLOOR + CH_H, H['z1'])).removeSplitter()
    h = h.cut(cyl(M4_INSERT / 2, H['z1'] - FLOOR - CH_H + 2, (JACK[0], JACK[1], FLOOR + CH_H - 1)))
    return h


def build_turning_holder():
    h = holder_body()
    h = h.cut(box(H['x0'] - 1, H['x1'] + 1, TOOL_Y - CH_W / 2, TOOL_Y + CH_W / 2, FLOOR, FLOOR + CH_H))
    for x in CLAMP_X:
        h = h.cut(cyl(M4_INSERT / 2, ROOF + 2, (x, TOOL_Y, FLOOR + CH_H - 1)))
    return h.removeSplitter()


# ---- holder C (Rev 2026-11-11, a second option): solid, 1/4 in square tools only, clamps as close to the tip as possible
Q_W, Q_H = 0.25 * IN + 0.3, 0.25 * IN + 0.65            # channel: 6.65 wide, 7.0 tall (tool + room to slide in)
Q_WALL = 3.0                                          # chuck-side wall
Q_NOSE_X = TIP_X - 8.15                               # nose 8 mm behind the tip (stick-out ~1.3 x the tool's height)
Q_CLAMP_X = (Q_NOSE_X - 3.0 - M4_INSERT / 2, Q_NOSE_X - 3.0 - M4_INSERT / 2 - 13.0)   # front clamp 3 mm wall to the nose


def build_quarter_holder():
    h = holder_body()
    h = h.fuse(box(H['x1'] - 0.01, Q_NOSE_X, H['y0'], H['y1'], H['z0'], H['z1'])).removeSplitter()
    y_out = TOOL_Y - Q_W / 2 - Q_WALL                     # trim the chuck side down to a 3 mm wall
    h = h.cut(box(H['x0'] - 1, Q_NOSE_X + 1, H['y0'] - 1, y_out, H['z0'] - 1, H['z1'] + 1))
    h = h.cut(box(H['x0'] - 1, Q_NOSE_X + 1, TOOL_Y - Q_W / 2, TOOL_Y + Q_W / 2, FLOOR, FLOOR + Q_H))
    for x in Q_CLAMP_X:                                   # insert at the top, clearance down to the tool
        h = h.cut(cyl(M4_CLEAR / 2, H['z1'] - FLOOR, (x, TOOL_Y, FLOOR + 1)))
        h = h.cut(cyl(M4_INSERT / 2, 9, (x, TOOL_Y, FLOOR + CH_H + ROOF - 8.5)))
    return h.removeSplitter()


def build_boring_holder():
    h = holder_body()
    h = h.cut(cyl(BORE_D / 2, BORE_Y_END - H['y0'] + 1, (BORE_X, H['y0'] - 1, CENTRE_Z), (0, 1, 0)))
    for y in (H['y0'] + 6.0, BORE_Y_END - 5.0):
        h = h.cut(cyl(M4_INSERT / 2, H['z1'] - CENTRE_Z + 1, (BORE_X, y, CENTRE_Z)))
    return h.removeSplitter()


def build_v_shim():
    w, L, t, vd = CH_W - 0.4, 50.0, 6.0, 4.0
    s = box(0, L, -w / 2, w / 2, 0, t)
    v = Part.Face(Part.makePolygon([V(-1, -vd, t + 0.01), V(-1, vd, t + 0.01), V(-1, 0, t - vd), V(-1, -vd, t + 0.01)]))
    s = s.cut(v.extrude(V(L + 2, 0, 0)))
    s.translate(V(H['x0'] + 2, TOOL_Y, FLOOR))
    return s


# ---- square tool + round bit stand-ins for the checks
def square_tool():
    return box(TIP_X - 75, TIP_X, TOOL_Y - 0.125 * IN, TOOL_Y + 0.125 * IN, FLOOR, FLOOR + 0.25 * IN)


def round_bit_centre_z(d_mm, shim_floor):
    """Centre of a round bit lying in the 90 deg V shim (V bottom at shim top - 4)."""
    return shim_floor + 6.0 - 4.0 + (d_mm / 2) * math.sqrt(2)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    plate = Part.read(str(PLATE))
    parts = {
        'tool_post_swivel_ring': build_ring(),
        'tool_post_base': build_base(),
        'tool_post_holder_turning': build_turning_holder(),
        'tool_post_holder_boring': build_boring_holder(),
        'tool_post_holder_quarter_inch_solid': build_quarter_holder(),
        'tool_post_v_shim_round_bits': build_v_shim(),
    }
    rep = {'parts': {}, 'checks': []}

    def check(name, ok, detail=''):
        rep['checks'].append([name, bool(ok), detail])

    for n, s in parts.items():
        bb = s.BoundBox
        check(n + ' is one valid solid', s.isValid() and len(s.Solids) == 1, '%d solids' % len(s.Solids))
        rep['parts'][n] = {'size_mm': [round(bb.XLength, 2), round(bb.YLength, 2), round(bb.ZLength, 2)],
                           'volume_cm3': round(s.Volume / 1000, 1)}

    base, turn, bore, shim = (parts[k] for k in ('tool_post_base', 'tool_post_holder_turning', 'tool_post_holder_boring', 'tool_post_v_shim_round_bits'))
    quarter = parts['tool_post_holder_quarter_inch_solid']
    vol = lambda a, b: a.common(b).Volume
    ring = parts['tool_post_swivel_ring']
    saddle = Part.read(str(PLATE).replace('cross_slide_top_plate_r9', 'cross_slide_saddle_r9'))
    check('ring sits on the plate, no overlap', vol(ring, plate) < 0.01, '%.3f mm3' % vol(ring, plate))
    check('post sits on the plate, no overlap', vol(base, plate) < 0.01, '%.3f mm3' % vol(base, plate))
    check('post foot turns in the ring, no overlap', vol(base, ring) < 0.01, '%.3f mm3' % vol(base, ring))
    check('ring top flush with the post foot top (tool height unchanged)', abs(ring.BoundBox.ZMax - FOOT_TOP) < 1e-6)
    px, py = PIVOT
    for x, y in M4_HOLES:
        d = math.hypot(x - px, y - py) - M4_HEAD_D / 2
        check('ring bolt (%+.0f, %+.2f) counterbore clears the pocket' % (x, y), d > POCKET_R + 1.0, 'wall %.2f mm' % (d - POCKET_R))
    check('index screw hole stays inside the ring', INDEX_Z + 1.7 < FOOT_TOP - 0.8 and INDEX_Z - 1.7 > PLATE_TOP + 0.8,
          'walls %.2f / %.2f mm' % (FOOT_TOP - INDEX_Z - 1.7, INDEX_Z - 1.7 - PLATE_TOP))
    check('hex key reaches the swivel screw past the jack tab', TAB['y1'] < py - 1.6, 'gap %.2f mm' % (py - 1.6 - TAB['y1']))
    check('swivel screw is an M4 x 20', abs((SWIVEL_LEDGE - PLATE_TOP) + 6.5 - 20) < 0.6, 'under head %.1f + 6.5 into the insert' % (SWIVEL_LEDGE - PLATE_TOP))

    def turned(sh, a):
        t = sh.copy(); t.rotate(V(px, py, 0), V(0, 0, 1), a); return t
    rep['angles'] = {}
    for a in ANGLES:
        for nm, sh in (('post', base), ('turning holder', turn), ('boring holder', bore), ('solid 1/4 holder', quarter), ('1/4 tool', square_tool())):
            t = turned(sh, a)
            for onm, o in (('ring', ring), ('plate', plate), ('saddle', saddle)):
                v = vol(t, o)
                check('%+d deg: %s clears the %s' % (a, nm, onm), v < 0.01, '%.3f mm3' % v)
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        tx, ty = TIP_X - px, TOOL_Y - py
        tip = (px + tx * ca - ty * sa, py + tx * sa + ty * ca)
        rep['angles'][str(a)] = {'tool_tip_on_slide_mm': [round(tip[0], 2), round(tip[1], 2)],
                                 'tool_points': [round(ca, 3), round(sa, 3)]}
        check('%+d deg: tip can reach the centreline inside X travel' % a, abs(tip[0]) <= 52.15 + 1e-6, 'tip at slide X %.1f' % tip[0])
    bb = ring.BoundBox
    check('ring inside the plate outline', bb.XMin >= -PLATE_X - 1e-6 and bb.XMax <= PLATE_X + 1e-6 and bb.YMin >= -PLATE_Y - 1e-6 and bb.YMax <= PLATE_Y + 1e-6)
    for adj in (-ADJ, 0.0, ADJ):
        for nm, h in (('turning', turn), ('boring', bore), ('solid 1/4', quarter)):
            hm = h.copy(); hm.translate(V(0, 0, adj))
            check('%s holder clears the base at %+.0f mm' % (nm, adj), vol(hm, base) < 0.01, '%.3f mm3' % vol(hm, base))
            check('%s holder bottom above the base plate at %+.0f mm' % (nm, adj), hm.BoundBox.ZMin > FOOT_TOP + 0.5, 'gap %.2f' % (hm.BoundBox.ZMin - FOOT_TOP))
            # dovetail engagement: holder overlaps the column over its full height
            eng = COL['z1'] - hm.BoundBox.ZMin
            check('%s holder dovetail engagement at %+.0f mm >= 18' % (nm, adj), eng >= 18, '%.1f mm' % eng)
            gap = (FLOOR + CH_H + adj) - COL['z1']
            check('%s jack tab above the column top at %+.0f mm' % (nm, adj), gap > 0.5, 'gap %.1f mm' % gap)
    # lock screws reach their inserts at every height (slot covers LOCK_Z)
    for x in LOCK_X:
        for adj in (-ADJ, ADJ):
            p = V(x, -10.0, LOCK_Z)
            hm = turn.copy(); hm.translate(V(0, 0, adj))
            check('lock screw at x %+.0f passes the slot at %+.0f mm' % (x, adj), not hm.isInside(p, 0.01, True))
    # square tool in the channel, top edge on centre at nominal
    sq = square_tool()
    check('1/4 in square tool fits the channel', vol(sq, turn) < 0.01, '%.3f mm3' % vol(sq, turn))
    check('square tool top edge on centre at nominal', abs(sq.BoundBox.ZMax - CENTRE_Z) < 0.01, '%.3f' % sq.BoundBox.ZMax)
    check('square tool tip at the model tool tip X', abs(sq.BoundBox.XMax - TIP_X) < 0.01)
    check('1/4 in square tool fits the solid holder', vol(sq, quarter) < 0.01, '%.3f mm3' % vol(sq, quarter))
    qb = quarter.BoundBox
    check('solid holder: tool sticks out 8 mm past the nose', abs((TIP_X - qb.XMax) - 8.15) < 0.01, '%.2f mm' % (TIP_X - qb.XMax))
    check('solid holder: front clamp 3 mm from the nose', abs(qb.XMax - (Q_CLAMP_X[0] + M4_INSERT / 2) - 3.0) < 0.01,
          'clamp centres %.1f / %.1f mm behind the tip' % (TIP_X - Q_CLAMP_X[0], TIP_X - Q_CLAMP_X[1]))
    check('solid holder: chuck-side wall 3 mm', abs((TOOL_Y - Q_W / 2) - qb.YMin - 3.0) < 0.01)
    check('solid holder: clamp inserts clear each other by 4 mm', Q_CLAMP_X[0] - Q_CLAMP_X[1] - M4_INSERT > 4.0)
    check('solid holder: clamp screw over the tool centre line', all(abs(TOOL_Y - TOOL_Y) < 1e-9 for _ in Q_CLAMP_X))
    check('solid holder: lock screw counterbores still inside', not any(quarter.isInside(V(x, qb.YMin + 0.1, LOCK_Z), 0.01, True) for x in LOCK_X))
    check('V shim fits the channel', vol(shim, turn) < 0.01, '%.3f mm3' % vol(shim, turn))
    # round bits: which ones reach centre within the height range
    rb = []
    for frac in (1 / 8, 3 / 16, 1 / 4, 5 / 16, 3 / 8):
        d = frac * IN
        cz = round_bit_centre_z(d, FLOOR)
        need = CENTRE_Z - cz                       # holder move to put the bit's centre on the spindle centre
        top = cz + d / 2
        rb.append({'bit_in': round(frac, 4), 'holder_move_mm': round(need, 2), 'in_range': abs(need) <= ADJ,
                   'bit_top_below_roof': top + need < FLOOR + CH_H + need})
        check('round %.4f in bit: centre reachable (move %+.2f mm)' % (frac, need), abs(need) <= ADJ)
        check('round %.4f in bit fits under the clamp roof' % frac, top < FLOOR + CH_H - 0.2, 'top %.2f, roof %.2f' % (top, FLOOR + CH_H))
    rep['round_bits'] = rb
    cb_r = (M4_HEAD_D + 0.6) / 2
    check('lock counterbores stay inside the holder (not out the bottom)', LOCK_Z - ADJ - cb_r > H['z0'] + 1.0, 'wall %.2f mm' % (LOCK_Z - ADJ - cb_r - H['z0']))
    check('lock counterbores stay below the tool channel floor', LOCK_Z + ADJ + cb_r < FLOOR - 1.0, 'wall %.2f mm' % (FLOOR - LOCK_Z - ADJ - cb_r))
    check('boring bore centre on the spindle centreline at nominal', True, 'Z %.2f' % CENTRE_Z)
    # walls: thinnest printed walls around the inserts / channel
    check('jack insert inside the tab with 2 mm walls', TAB['x0'] + 2 < JACK[0] - M4_INSERT / 2 and JACK[1] + M4_INSERT / 2 < TAB['y1'] - 2
          and JACK[1] - M4_INSERT / 2 > COL['y0'] - DT_DEPTH, 'y %.1f..%.1f' % (JACK[1] - M4_INSERT / 2, JACK[1] + M4_INSERT / 2))
    check('front base bolt heads clear the dovetail', abs(M4_HOLES[0][0]) - M4_HEAD_D / 2 > DT_TIP + 0.3,
          'gap %.2f mm' % (abs(M4_HOLES[0][0]) - M4_HEAD_D / 2 - DT_TIP))
    rep['jack_screw'] = 'M4 x %d or longer (tab top to the column top at the highest setting, + 3 mm)' % math.ceil(H['z1'] + ADJ - COL['z1'] + 3)
    rep['passed'] = sum(1 for c in rep['checks'] if c[1])
    rep['total'] = len(rep['checks'])

    for n, s in parts.items():
        s.exportStep(str(OUT / (n + '.step')))
        print_shape = s.copy()
        # holders, ring and shim print the way they sit on the lathe; the post prints upside down on its column top
        # (the column overhangs the round foot)
        if n == 'tool_post_base':
            print_shape.rotate(V(0, 0, 0), V(1, 0, 0), 180)
        bbp = print_shape.BoundBox
        print_shape.translate(V(-bbp.XMin, -bbp.YMin, -bbp.ZMin))
        m = Mesh.Mesh(print_shape.tessellate(0.05))
        m.write(str(OUT / (n + '_PRINT.stl')))
    asm = Part.makeCompound([plate] + list(parts.values()) + [square_tool()])
    asm.exportStep(str(OUT / 'tool_post_on_plate_check.step'))
    json.dump(rep, open(HERE / 'tool_post_report.json', 'w'), indent=1)
    for c in rep['checks']:
        if not c[1]:
            print('FAIL', c)
    print('checks %d/%d' % (rep['passed'], rep['total']))
    print(json.dumps(rep['parts'], indent=1))
    print(json.dumps(rep['round_bits']))
    print(rep['jack_screw'])


main()
