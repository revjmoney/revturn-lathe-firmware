"""REVTURN lathe: whole-machine assembly (Rev 2026-11-10).

Run with FreeCAD's python:  "C:/Program Files/FreeCAD 1.1/bin/python.exe" build_lathe_assembly.py

Real printed parts come from their STEP files; hardware (rails, screws, bearings, nut, coupler, motors) comes from the
design dimensions; parts we have no CAD for (AliExpress headstock, 3 in chuck, NEMA 23 spindle motor and its belt, the
off-the-shelf Z motor mount) are simple STAND-INS, named that way, sized from what is known.

Frame (same as D:/lathe-axis-bases/assembly_check.py): Y runs along the bed, Y=0 is the tailstock frame's inboard face,
the headstock frame's inboard face is at Y=-clear. X is across the bed, Z is up, the bench top is Z=0.
"""
import json, math
from pathlib import Path
import FreeCAD as App
import Part
from FreeCAD import Vector as V

OUT = Path(__file__).resolve().parent
BASES = Path(r'D:/lathe-axis-bases')
STEPS = BASES / 'out'
MOUNT = Path(r'F:/micro-lathe/cad/codex-x-motor-mount/split-rail-mount-no-side-tie')
IN = 25.4

# the R9 (long X) build module: constants and travel math, the same way the mount builds use it
src = (BASES / 'build_axis_bases.py').read_text().replace('\nmain()\n', '\n')
g = {'__name__': 'r9', '__file__': str(BASES / 'build_axis_bases.py'), 'P_OVERRIDE': {'long_x': True}}
exec(compile(src, 'build_axis_bases.py', 'exec'), g)
P = g['P']
travel = g['travel_math']()
clear = travel['clear_between_inboard_faces_mm']
REAL_Z_TRAVEL = 5.0 * 25.4                      # Rev 2026-11-10: the real lathe's Z travel
_design_z = clear - g['COLLAR_STACK'] - g['SADDLE_Y']   # design bed, no tailstock carrier
EXTRA_Z = max(0.0, REAL_Z_TRAVEL - _design_z)
clear += EXTRA_Z                               # headstock frame, chuck and headstock move out by this much
RAIL_X, ZA, RAIL_D, PLATE_T, SCREW_D = g['RAIL_X'], g['ZA'], g['RAIL_D'], g['PLATE_T'], g['SCREW_D']

def step(name, folder=STEPS):
    s = Part.Shape(); s.read(str(folder / (name + '.step'))); return s
def cyl(r, h, base, d): return Part.makeCylinder(r, h, V(*base), V(*d))
def box(x0, x1, y0, y1, z0, z1): return Part.makeBox(x1 - x0, y1 - y0, z1 - z0, V(x0, y0, z0))
def moved(s, dx=0, dy=0, dz=0):
    t = s.copy(); t.translate(V(dx, dy, dz)); return t

parts = []  # (name, shape, colour, kind)
def add(name, shape, colour, kind): parts.append((name, shape, colour, kind))
PRINT, METAL, BRASS, MOTOR, STAND = '#e09942', '#6f7b84', '#c9a227', '#2f3740', '#6c8aa8'

# ---------------- bed: printed R4 frames and caps (real parts)
tail = step('tailstock_frame_belt')
_tv = tail.Volume
tail = tail.cut(box(-400, 400, PLATE_T + 0.5, 400, -100, 400))   # Rev sawed the belt motor mount off
SAWN_OFF_CM3 = (_tv - tail.Volume) / 1000.0
head = step('headstock_frame'); head.rotate(V(), V(0, 0, 1), 180); head.translate(V(0, -clear, 0))
add('tailstock_frame_belt (printed, belt motor mount sawn off as on the real lathe)', tail, PRINT, 'printed')
add('headstock_frame (printed)', head, PRINT, 'printed')
cap = step('rail_clamp_cap_x4')
for sx in (-1, 1):
    add(f'rail_clamp_cap tail {sx:+d} (printed)', moved(cap, sx * RAIL_X, 0, ZA), PRINT, 'printed')
    add(f'rail_clamp_cap head {sx:+d} (printed)', moved(cap, sx * RAIL_X, -clear - PLATE_T, ZA), PRINT, 'printed')

# ---------------- bed: Z rails, Z screw, bearings (hardware, design dimensions)
rail_len = P['rail_len_in'] * IN
rail_y1 = PLATE_T + travel['rail_overhang_tail_max_mm']
for sx in (-1, 1):
    add(f'Z rail {sx:+d}, 0.470 in x 11.5 in', cyl(RAIL_D / 2, rail_len, (sx * RAIL_X, rail_y1 - rail_len, ZA), (0, 1, 0)), METAL, 'hardware')
Z_SCREW_END = rail_y1 + 18.0                     # screw runs past the rail ends so the big pulley clears the rails
z_screw_len = Z_SCREW_END + clear + PLATE_T
add('Z leadscrew, 8 mm T8 (length to suit the real bed)', cyl(SCREW_D / 2, z_screw_len, (0, -clear - PLATE_T, ZA), (0, 1, 0)), METAL, 'hardware')
for i, y in enumerate((-clear - PLATE_T, -clear - P['bearing_w'], 0.0, PLATE_T - P['bearing_w'])):
    brg = cyl(P['bearing_od'] / 2, P['bearing_w'], (0, y, ZA), (0, 1, 0)).cut(cyl(SCREW_D / 2 + 0.05, P['bearing_w'] + 2, (0, y - 1, ZA), (0, 1, 0)))
    add(f'688ZZ bearing {i + 1}', brg, METAL, 'hardware')

# ---------------- cross slide (R9 long X), mid Z travel: Codex's reference assembly is already in the R9 frame
Z_TAIL = -g['COLLAR_STACK'] - g['SADDLE_Y'] / 2.0   # no tailstock carrier on the real lathe
Z_HEAD = -clear + g['SADDLE_Y'] / 2.0
Z_MID = (Z_HEAD + Z_TAIL) / 2.0
saddle = moved(step('cross_slide_saddle_r9'), dy=Z_MID)
slide = moved(step('cross_slide_top_plate_r9'), dy=Z_MID)
add('cross_slide_saddle_r9 (printed)', saddle, PRINT, 'printed')
add('cross_slide_top_plate_r9 (printed)', slide, PRINT, 'printed')
ref = Part.Shape(); ref.read(str(MOUNT / 'inline_no_side_tie_assembly.step'))
# Codex's compound order: [mount, motor, coupler, motor shaft, X screw, rail -, rail +, saddle, slide]
labels = [('x_motor_inline_rail_mount, no side tie (printed)', PRINT, 'printed'),
          ('X motor, StepperWorld NEMA 17', MOTOR, 'motor'),
          ('X coupler, Ender 3 Pro Z coupler 5-8 mm', METAL, 'hardware'),
          ('X motor shaft', METAL, 'hardware'),
          ('X leadscrew, 8 mm T8', METAL, 'hardware'),
          ('X rail -, 10 mm', METAL, 'hardware'),
          ('X rail +, 10 mm', METAL, 'hardware')]
solids = ref.childShapes() if ref.ShapeType == 'Compound' else [ref]
XRAIL_CUT = float(g.get('XRAIL_CUT', 198.8)); XSCREW_CUT = float(g.get('XSCREW_CUT', 245.0))
for (name, col, kind), s in zip(labels, solids):
    if name.startswith('X rail') or name.startswith('X leadscrew'):
        b = s.BoundBox; yc, zc, r = (b.YMin + b.YMax) / 2, (b.ZMin + b.ZMax) / 2, b.YLength / 2
        L = XSCREW_CUT if name.startswith('X leadscrew') else XRAIL_CUT
        full = cyl(r, L, (b.XMax - L, yc, zc), (1, 0, 0))     # same end at the mount, full length back across
        nm = name.replace(', 10 mm', ', 10 mm x %.1f mm' % L).replace('8 mm T8', '8 mm T8 x %.0f mm' % L)
        add(nm, moved(full, dy=Z_MID), col, kind)
    else:
        add(name, moved(s, dy=Z_MID), col, kind)
# brass T8 nut under the saddle on the Z screw (flange nut, 22 mm flange, 10.2 mm barrel)
# brass T8 flange nut: flange buried in the recess on the saddle's head-end face, body into the 11.2 mm bore
fl_t, fl_y = P['brass_flange_t'], Z_MID - g['SADDLE_Y'] / 2.0 + g['REC_T'] - P['brass_flange_t']
nut = cyl(P['brass_flange_od'] / 2, fl_t, (0, fl_y, ZA), (0, 1, 0)).fuse(cyl(P['brass_body_od'] / 2, P['brass_body_len'], (0, fl_y + fl_t, ZA), (0, 1, 0)))
nut = nut.cut(cyl(SCREW_D / 2 + 0.05, 40, (0, fl_y - 5, ZA), (0, 1, 0)))
add('Z nut, brass T8 flange', nut, BRASS, 'hardware')

# ---------------- base (Rev 2026-11-10): 0.75 in plywood, 0.75 in risers under each rail base plate
T34 = 0.75 * IN
PLY_TOP = -T34
for nm, fr in (('tailstock', tail), ('headstock', head)):
    bb = fr.BoundBox
    add(f'riser under {nm} frame, 0.75 in', box(bb.XMin - 6, bb.XMax + 6, bb.YMin - 6, bb.YMax + 6, -T34, 0), '#c8a879', 'base')
add('plywood base, 0.75 in', box(-200, 200, -clear - 330, 200, PLY_TOP - T34, PLY_TOP), '#d8c49a', 'base')

# ---------------- spindle centre height (Rev 2026-11-10): about 5 in above the top of the plywood base
spindle_z = PLY_TOP + 5.0 * IN

# tool tip marker (the cutting point the program describes), on a tool post that lifts it to centre height
TIP_X = g['X_TRAVEL'] / 2.0                      # slide at its front limit puts the tip on the centreline (X0)
TIP_Y = slide.BoundBox.YMin + 4.0                # head-side edge of the top slide
TIP_Z = spindle_z
slide_top = slide.BoundBox.ZMax
TP = Path(r'F:/micro-lathe/printed-parts/6-tool-post')       # Rev's temporary printed tool post (build_tool_post.py)
add('tool post swivel ring (printed)', moved(Part.read(str(TP / 'tool_post_swivel_ring.step')), dy=Z_MID), PRINT, 'printed')
add('tool post base (printed)', moved(Part.read(str(TP / 'tool_post_base.step')), dy=Z_MID), PRINT, 'printed')
add('tool post holder, turning (printed)', moved(Part.read(str(TP / 'tool_post_holder_turning.step')), dy=Z_MID), PRINT, 'printed')
tool_bar = box(TIP_X - 66, TIP_X - 3, TIP_Y - 3.2, TIP_Y + 3.2, TIP_Z - 3.2, TIP_Z + 3.2)
tool_tip = Part.makeCone(3.2, 0.2, 3, V(TIP_X - 3, TIP_Y, TIP_Z), V(1, 0, 0))
add('tool tip marker (cutting point)', tool_bar.fuse(tool_tip), '#d02a2a', 'hardware')

def belt_spans(y, x1, z0, R, x2, r, name):
    """the two straight runs of an open belt, outside the pulleys (no solid web through them)"""
    for sgn in (1, -1):
        pts = [V(x1, y, z0 + sgn * R), V(x2, y, z0 + sgn * r), V(x2, y, z0 + sgn * (r + 1.5)), V(x1, y, z0 + sgn * (R + 1.5))]
        add(f'{name} ({"top" if sgn > 0 else "bottom"} run)', Part.Face(Part.makePolygon(pts + [pts[0]])).extrude(V(0, 6, 0)), '#222222', 'hardware')

# ---------------- STAND-INS (no CAD exists). Shapes are simple; the sizes and positions are Rev's.
# Headstock: Rev's AliExpress spindle unit, independent of the lathe bed: a flat base plate on the plywood, legs, the
# spindle head on top, 3 in chuck, centreline 5 in above the plywood. Extra-long NEMA 23 drive, 20T:120T.
NEMA17_BODY = 48.0                              # standard NEMA 17 (Rev: the X and Z motors are standard NEMA 17)
CHUCK_IN = 3.0                                  # Rev: 3 or 4 in, not sure (notes say 3)
chuck_r, chuck_l = CHUCK_IN / 2 * IN, 0.47 * CHUCK_IN * IN
chuck_y0 = -clear - 2.0                         # chuck face just inboard of the headstock frame
add(f'STAND-IN {CHUCK_IN:g} in 3-jaw chuck', cyl(chuck_r, chuck_l, (0, chuck_y0 - chuck_l, spindle_z), (0, 1, 0)), METAL, 'stand-in')
for k in range(3):
    ang = 90 + 120 * k
    j = box(-4, 4, 0, 10, 0, 0.42 * chuck_r)
    j.rotate(V(), V(0, 1, 0), 90 - ang)
    add(f'STAND-IN chuck jaw {k + 1}', moved(j, 0.5 * chuck_r * math.cos(math.radians(ang)), chuck_y0, spindle_z + 0.5 * chuck_r * math.sin(math.radians(ang))), METAL, 'stand-in')
hs_y1 = chuck_y0 - chuck_l                     # spindle head behind the chuck
hs_len = 3.5 * IN
head_bot = spindle_z - 32
add('STAND-IN headstock: spindle head', box(-34, 34, hs_y1 - hs_len, hs_y1, head_bot, spindle_z + 30), STAND, 'stand-in')
add('STAND-IN headstock: spindle nose', cyl(24, 6, (0, hs_y1 - 0.01, spindle_z), (0, 1, 0)).cut(cyl(1, 1, (0, hs_y1 + 10, spindle_z), (0, 1, 0))), STAND, 'stand-in')
leg_y = (hs_y1 - 14, hs_y1 - hs_len + 14)
plate_t = 0.375 * IN
for lx in (-26, 26):
    for ly in leg_y:
        add(f'STAND-IN headstock: leg {lx:+d} {ly:.0f}', box(lx - 8, lx + 8, ly - 8, ly + 8, PLY_TOP + plate_t, head_bot), STAND, 'stand-in')
add('STAND-IN headstock: flat base plate', box(-50, 50, hs_y1 - hs_len - 6, hs_y1 + 6, PLY_TOP, PLY_TOP + plate_t), STAND, 'stand-in')
py = hs_y1 - hs_len - 10                        # spindle pulley plane, outboard end of the spindle
add('STAND-IN spindle pulley, GT2 120T', cyl(38.2, 9, (0, py, spindle_z), (0, 1, 0)), METAL, 'stand-in')
m23_x, m23_z = 80.0, spindle_z - 30.0           # motor beside and below the spindle
add('STAND-IN spindle motor pulley, GT2 20T', cyl(6.4, 9, (m23_x, py, m23_z), (0, 1, 0)), METAL, 'stand-in')
add('spindle motor, extra-long NEMA 23 (57 mm, ~112 mm body)', box(m23_x - 28.5, m23_x + 28.5, py - 4 - 112, py - 4, m23_z - 28.5, m23_z + 28.5), MOTOR, 'motor')
add('STAND-IN NEMA 23 bracket', box(m23_x - 30, m23_x + 30, py - 4, py, PLY_TOP, m23_z + 30), STAND, 'stand-in')
belt_spans(py + 1, 0, spindle_z, 38.2, m23_x, 6.4, 'STAND-IN spindle belt, 20T:120T (6:1)')

# Z drive (Rev 2026-11-10): a big pulley on the Z screw, the belt running toward the back of the lathe to a standard
# NEMA 17 on its own mount on the plywood
zpy = rail_y1 + 6.0                             # pulley plane, just past the rail ends (a 120T pulley is wider than the rail spacing)
ZBIG_R, ZSMALL_R, ZCD = 38.2, 6.4, 85.0         # 120T and 20T GT2, ~85 mm centres
zm_x = ZCD                                      # toward the back (+X)
add('Z screw pulley, big GT2 (100T or 120T)', cyl(ZBIG_R, 8, (0, zpy, ZA), (0, 1, 0)).cut(cyl(SCREW_D / 2 + 0.05, 10, (0, zpy - 1, ZA), (0, 1, 0))), METAL, 'hardware')
add('Z motor pulley, GT2 20T', cyl(ZSMALL_R, 8, (zm_x, zpy, ZA), (0, 1, 0)), METAL, 'hardware')
belt_spans(zpy + 1, 0, ZA, ZBIG_R, zm_x, ZSMALL_R, 'Z belt')
add('Z motor, standard NEMA 17', box(zm_x - 21.15, zm_x + 21.15, zpy + 9 + 4, zpy + 9 + 4 + NEMA17_BODY, ZA - 21.15, ZA + 21.15), MOTOR, 'motor')
add('STAND-IN Z motor mount (independent, on the plywood)', box(zm_x - 23, zm_x + 23, zpy + 9, zpy + 13, PLY_TOP, ZA + 23).fuse(box(zm_x - 23, zm_x + 23, zpy + 9, zpy + 60, PLY_TOP, PLY_TOP + 4)), STAND, 'stand-in')
# Rev 2026-11-10: two real metal 8 mm shaft collars at the fixed end of each screw (not the printed thrust washers)
def collar(y0, axis='y', x0=0.0, z=ZA, y=0.0):
    if axis == 'y':
        return cyl(8, 9, (0, y0, z), (0, 1, 0)).cut(cyl(SCREW_D / 2 + 0.05, 11, (0, y0 - 1, z), (0, 1, 0)))
    return cyl(8, 9, (x0, y, z), (1, 0, 0)).cut(cyl(SCREW_D / 2 + 0.05, 11, (x0 - 1, y, z), (1, 0, 0)))
add('Z shaft collar, inboard (metal, 8 mm)', collar(-9.0), METAL, 'hardware')
add('Z shaft collar, outboard (metal, 8 mm)', collar(PLATE_T), METAL, 'hardware')
# X: collars either side of the far tower (the end away from the motor), approximate position
tw_in, tw_out = g['TOWER_IN'], g['XHALF']
add('X shaft collar, inside far tower (metal, 8 mm, approx.)', collar(0, 'x', -tw_in, g['XA'], Z_MID), METAL, 'hardware')
add('X shaft collar, outside far tower (metal, 8 mm, approx.)', collar(0, 'x', -tw_out - 9, g['XA'], Z_MID), METAL, 'hardware')

# ---------------- collisions among the real parts (stand-ins are approximate, so they are only reported)
real = [(n, s) for n, s, c, k in parts if k in ('printed', 'hardware', 'motor') and 'STAND-IN' not in n]
hits = []
for i in range(len(real)):
    for j in range(i + 1, len(real)):
        a, b = real[i], real[j]
        if not a[1].BoundBox.intersect(b[1].BoundBox): continue
        v = a[1].common(b[1]).Volume
        if v > 1.0: hits.append((a[0], b[0], round(v, 1)))
report = {'parts': len(parts), 'real_part_overlaps_over_1mm3': hits,
          'spindle_centre_height_in': round(spindle_z / IN, 3), 'sawn_off_cm3': round(SAWN_OFF_CM3, 1), 'saddle_y_mm': round(Z_MID, 1),
          'z_travel_mm': round(Z_TAIL - Z_HEAD, 1), 'x_travel_mm': round(g['X_TRAVEL'], 1)}

# ---------------- outputs: FCStd with named objects, one STEP, and a mesh scene for the renderer
doc = App.newDocument('REVTURN_lathe')
scene = []
for name, s, col, kind in parts:
    o = doc.addObject('Part::Feature', ''.join(ch if ch.isalnum() else '_' for ch in name)[:60])
    o.Label = name; o.Shape = s
    v, f = s.tessellate(0.6)
    scene.append({'label': name, 'color': col, 'kind': kind, 'vertices': [[p.x, p.y, p.z] for p in v], 'faces': f})
doc.recompute(); doc.saveAs(str(OUT / 'REVTURN_lathe_assembly.FCStd'))
# ---------------- animation data for REVTURN_animate.FCMacro: which objects move with which axis, and the travel
names = {o.Label: o.Name for o in doc.Objects}
def group(*keys): return [names[l] for l in names if any(k in l for k in keys)]
Z_TAIL_NO_CARRIER = -g['COLLAR_STACK'] - g['SADDLE_Y'] / 2.0   # the real lathe has no tailstock carrier
anim = {
    'z_group': group('cross_slide_saddle', 'cross_slide_top_plate', 'x_motor_inline', 'X motor,', 'X motor shaft', 'X coupler',
                     'X leadscrew', 'X rail', 'Z nut', 'X shaft collar', 'tool tip', 'tool post'),
    'x_group': group('cross_slide_top_plate', 'tool tip', 'tool post'),
    'tool_tip_mm': [TIP_X, TIP_Y, TIP_Z],
    'chuck_face_y_mm': chuck_y0,
    'chuck_diameter_in': CHUCK_IN,
    'real_z_travel_in': REAL_Z_TRAVEL / 25.4, 'bed_lengthened_mm': EXTRA_Z,
    'c_group': group('chuck'),
    'spindle_axis_point_mm': [0.0, 0.0, spindle_z],
    'z_travel_mm': [Z_HEAD - Z_MID, Z_TAIL_NO_CARRIER - Z_MID],     # model dy range around the built position
    'x_travel_mm': [-g['X_TRAVEL'] / 2.0, g['X_TRAVEL'] / 2.0],     # model dx range of the top slide
    'notes': 'Model Y+ = lathe Z+ (toward the tailstock). Model X+ = lathe X+ (motor side taken as the back).',
    'style': {names[n]: [c, k] for n, _, c, k in parts},
}
(OUT / 'animation.json').write_text(json.dumps(anim, indent=2))

Part.makeCompound([s for _, s, _, _ in parts if True]).exportStep(str(OUT / 'REVTURN_lathe_assembly.step'))
(OUT / 'scene.json').write_text(json.dumps(scene))
(OUT / 'assembly_report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
