"""
Lathe-style linear axis end frames, R4: minimal frame, belt drive.

Rev's hardware:
  rails       2 x 0.470" dia round bar, 11.5" long, slide all the way through, clamped
  leadscrew   0.313" dia, 8.6" long, two anti-backlash flange nuts
  motor       NEMA 23, now BEHIND the tail frame on a GT2 belt and two printed
              pulleys, which is what lets the axis drop from 1.50" to 1.00"

R4 rules, from Rev:
  * simple, bare minimum supports, least material that still works
  * no frame section thinner than 0.375" (9.525 mm)
  * 0.375" of material above the rails

Run headless:
  "C:/Program Files/FreeCAD 1.1/bin/FreeCADCmd.exe" build_axis_bases.py
  LEAN=1 ... strips the remaining styling, for comparison.

Everything is mm inside. Inches only appear in the P dict below.
"""

import os
import json
import math

import FreeCAD as App
import Part
import Mesh
import MeshPart
from FreeCAD import Vector as V

IN = 25.4
HERE = os.path.dirname(os.path.abspath(__file__))
LEAN = os.environ.get("LEAN") == "1"
OUT = os.path.join(HERE, "out", "lean") if LEAN else os.path.join(HERE, "out")

# ----------------------------------------------------------------------------
# parameters
# ----------------------------------------------------------------------------
P = {
    # --- given hardware -----------------------------------------------------
    "rail_dia_in": 0.470,
    "rail_len_in": 11.5,
    "screw_dia_in": 0.313,
    "screw_len_in": 8.6,

    # --- Rev's numbers ------------------------------------------------------
    "rail_cc_in": 3.25,           # rail centre-to-centre
    "flat_above_rail_in": 0.375,  # material above the TOP of the rails
    "frame_min_in": 0.375,        # no frame section thinner than this
    "plate_t_in": 1.00,           # frame thickness = rail clamp length

    # --- axis height --------------------------------------------------------
    # with the motor off the back on a belt this is no longer set by the motor
    # body; it is set by the flange nut and bearing boss clearing the table
    "axis_h_in": 1.00,

    # --- fits ---------------------------------------------------------------
    "rail_bore_extra": 0.11,
    "cap_relief": 0.40,
    "screw_bore_extra": 0.85,
    "bearing_od": 16.0,           # 688ZZ: 8 x 16 x 5
    "bearing_w": 5.0,
    "bearing_fit": 0.15,
    "bearing_depth_extra": 0.3,

    # --- inserts / fasteners ------------------------------------------------
    "insert_dia": 7.10,           # M5 heat-set, UNMEASURED, print the coupon
    "insert_depth": 11.0,
    "cap_screw_clear": 5.50,
    "cap_screw_cbore": 9.80,
    "cap_screw_cbore_depth": 7.0,
    "cap_screw_offset": 10.5,
    "wall_side": 12.5,            # outboard of the bore: insert pocket + 4.5 wall

    # --- feet ---------------------------------------------------------------
    "foot_slot_w": 6.90,          # 1/4" clearance
    "foot_slot_len": 13.0,
    "foot_pad_r": 11.0,
    "foot_clear": 8.0,            # pad centre outboard of the frame side
    "corner_r": 6.0,              # rounded plan corners on the frame

    # --- belt drive ---------------------------------------------------------
    "belt_teeth": 30,
    "belt_pitch": 2.0,            # GT2
    "belt_width": 6.0,
    "belt_len": 110.0,            # cheap closed loop, sets the centre distance
    "belt_pld": 0.254,            # GT2 pitch line differential
    "pulley_flange": 1.5,
    "pulley_face": 7.0,           # toothed width
    "pulley_hub": 11.5,
    "pulley_hub_od": 20.0,
    "pulley_bore_screw": 8.10,
    "pulley_bore_motor": 6.45,    # 1/4" NEMA 23 shaft; set 8.10 for an 8 mm shaft
    "pinch_clear": 3.40,          # M3 pinch screw
    "pinch_insert": 4.60,
    "pinch_insert_depth": 6.0,
    "pinch_slit": 1.20,

    # --- NEMA 23 ------------------------------------------------------------
    "motor_body": 57.0,
    "motor_clear": 2.5,           # motor body above the mounting surface
    "nema_bolt_cc": 47.14,
    "nema_bolt_clear": 5.60,
    "nema_slot_travel": 3.0,      # belt tension adjustment, each way
    "nema_pilot_clear": 40.0,
    "bracket_edge": 5.0,
    "wrench_hole": 7.6,

    # --- R5 cross slide: given hardware -------------------------------------
    "xrail_dia_in": 0.393,        # measured, 9.982 mm. NOT 8 mm.
    "xrail_stock_in": 8.0,        # two lengths on hand, cut to suit
    "xscrew_stock_in": 10.0,      # 254 mm on order
    "xscrew_dia_in": 0.315,       # the X screw is its own 8 mm stock, NOT Rev's
                                  # 0.313 in Z screw. One param per piece of steel.
    "xrail_end_clear": 0.6,       # X rail end to the motor plate rib. At 0.0 the
                                  # rail was exactly coplanar with the rib and a
                                  # clash test cannot tell tangency from clearance.
    "saddle_len_in": 2.00,        # Rev's choice: 4.25:1 bushing ratio on the 0.470 bar
    "top_slide_len": 45.0,        # 4.5:1 bushing ratio on the 9.982 rail
    "xrail_y": 19.0,              # X rail spacing 38.0, set independently of saddle length

    # --- R5 fits ------------------------------------------------------------
    "xrail_grip_extra": 0.05,     # tower bore: slides in, then the M3 pinch clamps it
    "shoulder_web": 2.0,          # 8.80 bore between the 688 pocket and the cavity.
                                  # LOAD BEARING: without it the bearing has no shoulder.

    # --- R5 brass flange nut (T8x2) -----------------------------------------
    "brass_flange_od": 22.0,      # MEASURED by Rev 2026-09-27
    "brass_flange_t": 3.5,        # standard T8, unmeasured, on the coupon
    "brass_body_od": 10.2,        # standard T8, unmeasured, on the coupon
    "brass_body_len": 11.5,       # standard T8, unmeasured, on the coupon
    "brass_pcd": 16.0,            # standard T8, unmeasured, on the coupon
    "brass_bolt_clear": 3.40,     # M3 clearance
    "brass_recess_extra": 0.5,    # counterbore is flange_od + this
    "m3_head_h": 1.65,            # BUTTON head M3. A socket head at 3.0 makes the
    "m3_head_d": 5.70,            # top slide recess break into the insert grid.
    # R8. The motor plate used to bolt to the tower through four M5 HEAT-SET
    # inserts. On a 60.792 wide tower there is no (y, z) that clears both the
    # tower edge and the X rail bore with a 7.10 pocket: at the furthest y the
    # inserts fit, they foul the bore by 0.20. Tapped M4 straight into the tower
    # solves it with room to spare (the 3.30 pilot clears the bore by 1.08 with
    # no constraint on z at all), and it is the THIRD time this project has had
    # to substitute a tap for an insert. Plain PLA is brittle: cut these with a
    # real tap, do not drive a screw in dry.
    "mp_tap": 3.30,               # M4 tap pilot, tower side
    "mp_tap_depth": 11.0,
    "mp_screw_clear": 4.50,       # M4 clearance, motor plate side
    "mp_head": 7.00,              # M4 socket head: the FACE has to cover the HEAD,
                                  # not the clearance hole (R5 finding C)
    "m3_tap": 2.50,               # tap the flange screws straight into the plastic:
                                  # a 4.60 insert on a 16.0 PCD around an 11.2 bore
                                  # leaves a 0.10 wall, which cannot be built.
    "m3_insert": 4.60,
    "m3_insert_depth": 6.0,
    "m4_insert": 5.85,
    "m4_insert_depth": 8.5,

    # --- R5 Oldham coupler (D18 x L25, 5 mm to 8 mm) ------------------------
    # NOT a rigid coupler: the screw is trapped, so a rigid link would side-load
    # the motor bearings. NOT a D19/D20 body: the cavity would break the 0.375 rule.
    "oldham_od": 18.0,
    "oldham_hub": 9.0,
    "oldham_disc": 7.0,
    "oldham_clear": 2.0,          # radial room to ORBIT. At 1.0 the disc had
                                  # 0.5 and could not absorb the misalignment
                                  # it is there for. GOVERN_R re-solves the
                                  # stack, so this costs 0.5 mm of height.
    "oldham_screw_inset": 4.5,    # clamp screw, from each hub's outer end

    # --- R5 NEMA 17 ---------------------------------------------------------
    "nema17_body": 42.3,          # 1.665 in, NOT 1.5 in
    "nema17_bolt_cc": 31.0,
    "nema17_bolt_clear": 3.40,
    "nema17_pilot": 22.0,
    "nema17_pilot_clear": 1.5,    # a 22.0 hole on a 22.0 boss is zero clearance
                                  # and prints undersize: the motor would not register
    "nema17_shaft": 5.0,
    "r9_pulley_bore_fit": 0.10,   # on the NEMA 17 shaft; was a bare 5.10 literal
    "nema17_shaft_len": 24.0,     # UNMEASURED on his Cricut donors. 20 also common.
    "nema17_slot_travel": 2.0,    # build tolerance, not belt tension
    "motor_plate_pcd_y": 28.5,    # 28.0 clashed the X rail bore by 0.57
    "grid_y_out": 28.5,           # tool platform grid, outer row; CAPPED by the
                                  # plate edge, see GRID_Y_OUT
    "grid_y_in": 10.0,            # inner row, pinned by the nut body bore
    "set_screw_clear": 3.40,      # M3 set screw, crown down onto the rail
    "topslide_clear": 2.0,        # top slide underside over the saddle top

    # --- R5 shaft collar ----------------------------------------------------
    "collar_od": 16.0,
    "collar_w": 9.0,
    "washer_t": 1.6,              # the existing printed thrust_washer

    # --- R7 saddle reprint (Rev 2026-09-28): lower, leaner, rounder -----------
    # Separate from flat_above_rail_in ON PURPOSE: the frames and caps are
    # already printed and must not move. Keeping x_motor_plate identical locks
    # FRAME + GOVERN_R = 19.525 of the stack, so this is the ONLY height lever
    # left, and the whole budget in it is 3.175 mm. Rev took half.
    # R8 (Rev 2026-09-28): "make the saddle towers less tall and a new slide
    # plate for it, use .250 material there instead of .375". Applies to the X
    # TOWERS and the TOP SLIDE only. The saddle body, the Z frames, the rail caps
    # and the tailstock carrier all stay on frame_min_in.
    #
    # This is the wall under the coupler cavity and the 688 pocket, i.e. the X
    # leadscrew's thrust path. Rev halved it knowingly; it is called out in the
    # README rather than buried.
    "tower_wall_in": 0.250,
    "saddle_above_rail_in": 0.3125,
    "saddle_corner_r": 10.0,      # plan corners, was corner_r 6.0
    "saddle_cove_bottom": 6.0,    # long bottom edges: not a load path
    "saddle_cove_top": 3.0,       # long top edges: this IS the loaded face, stay modest
    "tower_crown_r": 3.0,         # round the crown edges instead of chamfering

    # --- R9 long-X belt variant (Rev 2026-09-28) ----------------------------
    # A VARIANT, not a replacement. long_x False reproduces R8 exactly; the
    # checks assert that, because a shared derived symbol edited in place would
    # move R8 geometry silently.
    #
    # Everything R9 needs is DERIVED from these plus the existing wall rules.
    # R8 was broken three times by constants that were only ever correct for one
    # wall thickness, so nothing here becomes a magic number downstream.
    "long_x": False,
    "r9_half_width": 100.0,       # chosen by Rev: 200.0 overall
    # 190, not 180. The motor's Y offset is no longer a free number: it is
    # derived so a full thickness mounting pad fits between the tower face and
    # the motor body, and the belt then has to close that triangle. 190 also
    # lifts the motor's underside from 1.04 to 3.30 mm over the frame foot pads.
    # 186, and it is a CEILING not a preference. Centres = hypot(motor_y, drop),
    # motor_y is fixed by the mounting pad, so a LONGER belt drops the motor. It
    # has to stay above the frames' hold-down bolt heads, which nothing models.
    "r9_belt_len": 186.0,         # GT2 6 mm closed loop, 93T, X drive
    "r9_tower_t_in": 0.750,       # Rev: thinner towers, +0.5 in of X travel
    "r9_end_plate_in": 0.250,     # flat plate closing each end of the channel
    "r9_rib_count": 3,            # transverse bulkheads per side, inside the C
    "r9_flange_t": 16.0,          # was 12.0: 12 left 0.75 mm behind the M3 taps
    "r9_motor_pulley_hub": 5.5,   # short hub: the NEMA 17 shaft is not long
                                  # enough for the 11.5 hub the screw pulley uses
    "r9_hold_down_head": 8.0,     # 1/4 in socket head + washer standing proud of
                                  # a foot pad. NOT MODELLED anywhere, so the
                                  # motor is kept clear of it by assertion.
    "r9_motor_clear_x": 2.0,      # motor body to the frame body in X
    "r9_fillet_r": 1.2,           # break every edge that will take it

    # --- R6 tailstock carrier (Rev 2026-09-28) ------------------------------
    # His real tailstock: two 0.275 in (6.985 = 7.0, M6 free-fit) holes in a foot
    # he measured at 1.758 in = 44.653 apart. 7.0 says metric, so 45.0 nominal.
    # M6 in a 7.0 hole floats 0.5 per bolt, so 45.0 bolts up to his 44.653 foot.
    "tsc_len_in": 1.00,           # along the bed, same 2.13:1 grip as the frames
    "tsc_above_rail_in": 0.250,   # he cut it from 0.375 to drop under the towers
    "tsc_below_rail_in": 0.250,
    "tsc_bolt_cc": 45.0,          # ACROSS the bed, both bolts at one Y
    "tsc_insert_dia": 8.50,       # M6 heat-set, UNMEASURED, goes on a coupon
    "tsc_insert_depth": 12.0,
    "tsc_clamp_screw": 4.50,      # M4 clearance, vertical, crosses the slit
    "tsc_clamp_head": 8.20,
    "tsc_clamp_head_depth": 4.60,
    "tsc_clamp_nut_af": 7.20,     # M4 hex across flats, captured in the bottom
    "tsc_clamp_nut_t": 3.80,
    "tsc_collar_cbore": True,     # swallow the tail frame's inboard collar
    "tsc_collar_clear": 1.0,      # the collar TURNS in here

    # --- R5 styling ---------------------------------------------------------
    "cove_r": 2.0,                # cove at the top of the tower flare (see cross_slide_saddle)
    "crown_cham": 2.0,            # tower crown chamfer

    # --- mesh ---------------------------------------------------------------
    "mesh_lin": 0.045,
    "mesh_ang": 0.20,
    "bed": (220.0, 220.0, 250.0),
}

# Let a caller re-exec this module with overridden parameters, so the checks can
# REBUILD under a 608 swap or a bigger coupler and assert the constants that come
# out, instead of re-deriving the chain inside the test (which would stay green
# even if this file pinned XA to the wrong surface).
P.update(globals().get("P_OVERRIDE", {}))

# ----------------------------------------------------------------------------
# derived
# ----------------------------------------------------------------------------
FRAME = P["frame_min_in"] * IN
RAIL_D = P["rail_dia_in"] * IN
RAIL_BORE = RAIL_D + P["rail_bore_extra"]
RAIL_CC = P["rail_cc_in"] * IN
RAIL_X = RAIL_CC / 2.0
ZA = P["axis_h_in"] * IN
TOP_Z = ZA + RAIL_D / 2.0 + P["flat_above_rail_in"] * IN
CAP_T = TOP_Z - ZA
PLATE_T = P["plate_t_in"] * IN
SCREW_D = P["screw_dia_in"] * IN
SCREW_BORE = SCREW_D + P["screw_bore_extra"]
BPOCK_D = P["bearing_od"] + P["bearing_fit"]
BPOCK_H = P["bearing_w"] + P["bearing_depth_extra"]
TOWER_R = BPOCK_D / 2.0 + FRAME
BODY_W = RAIL_CC + 2.0 * (RAIL_BORE / 2.0 + P["wall_side"])
CAP_W = 2.0 * (RAIL_BORE / 2.0 + P["wall_side"] - 1.5)
FOOT_X = BODY_W / 2.0 + P["foot_clear"]
TSC_T = P["tsc_len_in"] * IN
TSC_Z1 = ZA + RAIL_D / 2.0 + P["tsc_above_rail_in"] * IN
TSC_Z0 = ZA - RAIL_D / 2.0 - P["tsc_below_rail_in"] * IN
# clamp screw centred in the band between the rail bore and the outer face
TSC_CLAMP_X = ((RAIL_X + RAIL_BORE / 2.0) + BODY_W / 2.0) / 2.0
TSC_CBORE_D = P["collar_od"] + P["tsc_collar_clear"]
TSC_CBORE_L = P["collar_w"] + P["washer_t"] + 2.0   # the 12.6 the saddle cannot reach
CAP_SCREW_Y = (PLATE_T * 0.25, PLATE_T * 0.75)
CAP_SCREW_LEN = max([L for L in (16, 20, 25, 30, 35)
                     if L <= CAP_T + P["cap_relief"] + P["insert_depth"] - 1.5] or [16])

# belt: equal pulleys, so length = 2 x centres + pi x pitch diameter
PULLEY_PD = P["belt_teeth"] * P["belt_pitch"] / math.pi
PULLEY_R = PULLEY_PD / 2.0 - P["belt_pld"]
PULLEY_OR = PULLEY_R + 2.0          # flange outside radius
CENTRES = (P["belt_len"] - math.pi * PULLEY_PD) / 2.0
MOTOR_Z = P["motor_body"] / 2.0 + P["motor_clear"]
MOTOR_DZ = MOTOR_Z - ZA
MOTOR_DX = math.sqrt(max(CENTRES ** 2 - MOTOR_DZ ** 2, 1.0))

# pulleys sit just behind the frame, hubs pointing at the motor
PUL_Y0 = PLATE_T + 0.6
PUL_Y1 = PUL_Y0 + P["pulley_flange"] + P["pulley_face"] + P["pulley_hub"]
BRACKET_Y0 = PUL_Y1 + 1.0
BRACKET_Y1 = BRACKET_Y0 + FRAME

# ---------------------------------------------------------------------------
# R5 cross slide derived geometry
#
# The rule follows the LARGEST bore on a centreline, not the most obvious one.
# On the tower centreline that is the coupler cavity, not the bearing pocket.
# On the top slide centreline it is the nut body bore, not the rail bore.
# ---------------------------------------------------------------------------
XRAIL_D = P["xrail_dia_in"] * IN
XSCREW_D = P["xscrew_dia_in"] * IN
XRAIL_BORE = XRAIL_D + P["rail_bore_extra"]        # sliding, in the top slide
XRAIL_GRIP = XRAIL_D + P["xrail_grip_extra"]       # pinch fit, in the towers
XRAIL_Y = P["xrail_y"]
# Hoisted above SADDLE_Y in R9: SADDLE_Y now derives from TOWER_Y, and TS_BAND_Y
# (further down) derives from SADDLE_Y, so the whole chain has to be in order.
XW = P["tower_wall_in"] * IN
XLOBE_R = XRAIL_BORE / 2.0 + XW                    # top slide bushing lobe
TOWER_Y = 2.0 * (XRAIL_Y + XLOBE_R)

# R9: the lower channel's width in the bed direction must EQUAL the tower width
# or the towers overhang it unsupported, which is the thing Rev asked to remove.
# Derived from TOWER_Y, never typed as a number: TOWER_Y moves with the wall
# thickness, and a constant here would fall off the part the way R8's three did.
# Paid for in Z travel at 1:1, which Rev accepted.
SADDLE_Y = (TOWER_Y if P["long_x"] else P["saddle_len_in"] * IN)
TS_X = P["top_slide_len"]

# R7: no longer TOP_Z. The frames keep 0.375 over the rails; the saddle does not.
SADDLE_Z1 = ZA + RAIL_D / 2.0 + P["saddle_above_rail_in"] * IN
SADDLE_Z0 = ZA - RAIL_D / 2.0 - FRAME              # 0.375 under them

ZF0 = SADDLE_Z1 - 2.0                              # tower base, 2.0 into the saddle
NUTBORE = P["brass_body_od"] + 1.0                 # nut body clearance bore
REC_T = P["brass_flange_t"] + P["m3_head_h"] + 0.1  # deep enough to BURY the heads
FLANGE_FASTENER_D = P["m3_tap"]                    # tap pilot, not a heat-set pocket
# On-axis, not diagonal. The deeper (head-burying) recess put diagonal taps
# 0.496 mm from the top slide M4 grid pocket at (13, -10); on-axis clears it.
FLANGE_BOLTS = ((0, 1), (0, -1), (1, 0), (-1, 0))
TS_GOVERN_R = max(NUTBORE, XRAIL_BORE) / 2.0       # largest bore on the top slide centreline

CAV_D = P["oldham_od"] + P["oldham_clear"]         # coupler cavity
# R9 drives X by belt, so there is no Oldham cavity on the tower centreline and
# the 688 pocket becomes the largest bore. Worth 1.925 mm of height for free.
# GOVERN_R still takes the max of what is actually there.
GOVERN_R = (BPOCK_D / 2.0 if P["long_x"]
            else max(CAV_D, BPOCK_D) / 2.0)

# The X axis plane is the HIGHER of the two things that actually bind, and
# neither of them is the saddle's top face:
#   a) the tower's own cavity wall, measured from the TOWER BASE (which is 2.0
#      down inside the saddle), not from the saddle top;
#   b) the top slide clearing the saddle top as it sweeps across it.
# It used to be written as SADDLE_Z1 + FRAME + GOVERN_R, which measures a wall
# against a surface 2.0 above where the material actually starts and spends
# 2.0 mm of height on nothing.
# R8: the towers and the top slide get their own wall. Introduced as a SYMBOL,
# not by editing FRAME, because FRAME also sets the saddle floor, the bay tie
# plate, the Z boss and the frame feet, none of which Rev asked to thin. The R7
# lesson applies directly: one symbol was carrying two constraints, so give the
# new meaning a new name instead of overloading the old one.
XA = max(ZF0 + XW + GOVERN_R,
         SADDLE_Z1 + P["topslide_clear"] + TS_GOVERN_R + XW)
TOWER_Z1 = XA + GOVERN_R + XW                      # tower crown, tallest point

# R7. Dropping the saddle drops the top slide with it, and the top slide's flat
# underside sweeps over the ALREADY PRINTED Z frame tops at 40.894. It used to
# clear them by 2.4 only because SADDLE_Z1 happened to equal TOP_Z, so the XA
# formula's branch (b) protected the frames by accident. Decoupling the two
# unguarded that constraint and took the clearance to 0.81.
#
# The fix is not to give the height back. Only the 8.17 mm the top slide
# overhangs the saddle in Y can ever be over a frame, and out there the part is
# filler: the X rail lobe's underside is already at 43.74 at y = 25.4. So the
# underside is stepped up to TOP_Z + topslide_clear in that band only. Costs
# nothing structural, lightens the top slide, and keeps the full 2.0.
TS_BAND_Y = SADDLE_Y / 2.0
TS_BAND_Z = TOP_Z + P["topslide_clear"]
TS_Z0 = XA - TS_GOVERN_R - XW
TS_Z1 = XA + TS_GOVERN_R + XW
# Tool platform grid rows. The outer row was a constant 28.5 and now hangs off a
# 60.792 wide slide, so it follows the plate edge. The inner row is pinned by the
# nut body bore below it and does not move.
GRID_Y_OUT = min(P["grid_y_out"],
                 TOWER_Y / 2.0 - max(P["m3_insert"], P["m4_insert"]) / 2.0 - 1.5)
GRID_Y = (-GRID_Y_OUT, -P["grid_y_in"], P["grid_y_in"], GRID_Y_OUT)
MP_R = P["mp_tap"] / 2.0                           # R8: tapped M4, was an M5 insert
# R9 towers are flat welded end plates: full width at the base, no flare, no
# 45 degree rise. That is only printable because SADDLE_Y now equals TOWER_Y, so
# there is no overhang for the flare to have been hiding.
TOWER_W0 = TOWER_Y if P["long_x"] else SADDLE_Y - 4.0
TOWER_FLARE = (TOWER_Y - TOWER_W0) / 2.0           # 45 deg, rise == half the flare
ZF1 = ZF0 + TOWER_FLARE                            # full width from here up

# Angled saddle ends. Outboard of the Z bushing bosses the saddle body carries
# nothing but the tower above it, so that material is cut away on a slope. The
# slope runs from the boss's outer edge at the saddle floor up to the tower base
# at the full half width, which is 37.2 degrees from vertical and so prints
# without support.
Z_BOSS_R = (RAIL_BORE + 2.0 * FRAME) / 2.0
TAPER_X = RAIL_X + Z_BOSS_R

# Tower Y-Z section. It flares out at 45 degrees from a width narrower than the
# saddle, seated 2.0 INTO the saddle top. Three reasons, all found by test:
#   1. A full-height box would interpenetrate the saddle while being wider in Y,
#      giving partly coincident faces that mesh non-manifold from an
#      isValid()-True solid. That is the R4 trap exactly.
#   2. A tower 67.14 wide in Y at every z would reach 8.17 past the saddle BELOW
#      the frame tops, hit the Z frames, and silently cost Z travel.
#   3. An 8.17 square overhang does not print. 45 degrees does.
# Lightening bays. At the 0.375 wall rule the Z bushing bosses (31.10 OD), the
# nut boss (30.25 OD) and the tower pads merge into one solid section, so only
# the two 10.60 gaps between nut boss and bushing boss are free material: 13 per
# cent of the width, and that is the whole budget. A 0.375 tie plate is left over
# each bay, because cutting them full height would sever the saddle into three
# separate solids.
BAY_X0 = (P["brass_body_od"] + 1.0 + 2.0 * FRAME) / 2.0 + 0.5
BAY_X1 = RAIL_X - Z_BOSS_R - 0.5
BAY_Z1 = SADDLE_Z1 - FRAME


# R8 matches the frames' overall width. R9 is set by Rev's 200.0 overall.
XHALF = (P["r9_half_width"] if P["long_x"]
         else FOOT_X + P["foot_pad_r"])
# R9: Rev asked for 0.750 in towers instead of 1.000, which moves each inboard
# face 6.35 outboard and hands back 12.7 mm (0.5 in) of X travel. The two 688
# pockets still leave 8.45 mm of web between them, above XW.
R9_TOWER_T = P["r9_tower_t_in"] * IN
TOWER_T = R9_TOWER_T if P["long_x"] else PLATE_T
TOWER_IN = XHALF - TOWER_T                         # tower inboard face
XSPAN = 2.0 * TOWER_IN                             # clear span between towers
COLLAR_STACK = P["collar_w"] + P["washer_t"]

# right tower, along +x: 688 pocket, then the load bearing web, then the cavity
BP_OUT = TOWER_IN + BPOCK_H                        # 58.7, pocket floor and bearing shoulder
WEB_OUT = BP_OUT + P["shoulder_web"]               # 60.7, cavity starts here
HUB1_0 = WEB_OUT                                   # screw hub, inboard end
HUB1_1 = HUB1_0 + P["oldham_hub"]
DISC_1 = HUB1_1 + P["oldham_disc"]
HUB2_1 = DISC_1 + P["oldham_hub"]                  # coupler outer end
XSCREW_R = HUB1_1                                  # screw fully engaged in its hub
XSCREW_L = -(XHALF + COLLAR_STACK + 0.6)           # -90.0, room for washer and collar
XSCREW_CUT = math.ceil(XSCREW_R - XSCREW_L)
XRAIL_CUT = 2.0 * XHALF - 2.0 * P["xrail_end_clear"]
MOTOR17_FACE = DISC_1 + P["nema17_shaft_len"]      # shaft tip sits at the motor hub inboard end
PLATE_X1 = MOTOR17_FACE
PLATE_X0 = PLATE_X1 - FRAME
STANDOFF = PLATE_X0 - XHALF
# Motor plate bolts. Both rows must sit ABOVE the 45 degree flare, or the insert
# breaks out through the sloped face. That is what fixes the Z positions, not a
# free choice of PCD: at y 28.5 and z 46.92 the pocket punched through by 0.14.
# R8. This was a constant 28.5. Thinning the tower walls narrowed TOWER_Y from
# 67.142 to 60.792, and a 7.10 insert at 28.5 then hung 1.65 mm OUT of the tower.
# Same class as GOVERN_R: derive it from what binds instead of pinning a number
# that was only ever correct for one wall thickness.
MP_Y = min(P["motor_plate_pcd_y"], TOWER_Y / 2.0 - MP_R - 1.0)
# The face only has to cover the bolt pattern in Y; in Z the bolt rows are
# close together, so a square face the width of the towers was 16 cm3 of
# plastic to seat four M5 heads.
MP_HALF_FACE_Y = max(P["nema17_body"] / 2.0 + P["bracket_edge"],
                     MP_Y + P["mp_head"] / 2.0 + 1.0)
MP_Z_LO = ZF1 + MP_R + 1.0
MP_Z_HI = 2.0 * XA - MP_Z_LO
MP_HALF_FACE_Z = max(P["nema17_body"] / 2.0 + P["bracket_edge"],
                     (MP_Z_HI - XA) + P["mp_head"] / 2.0 + 1.0)                       # mirrored about the X axis plane

WRENCH_X = HUB1_0 + P["oldham_screw_inset"]        # over the buried screw hub clamp screw
HUB2_SCREW_X = DISC_1 + P["oldham_screw_inset"]    # in the standoff, reached through the flank
R5_WIDTH = (XHALF + COLLAR_STACK + 0.6) + MOTOR17_FACE + P["nema17_body"]

# --- R9 X belt drive --------------------------------------------------------
# The Oldham coupler is gone. The motor sits BEHIND a tower in the bed direction
# and low, driven 1:1 by a GT2 loop running in a Y-Z plane, on the same printed
# 30T pulleys already used for Z.
#
# Why behind and not off the end: hanging it outboard in X would add about 48 mm
# on the chuck side. Behind the tower it adds NOTHING to the X width and costs no
# Z travel, because at y beyond TOWER_Y/2 there is simply nothing else.
#
# The one thing that makes it work is not obvious: the motor RIDES THE SADDLE in
# Y while the Z frames stay put, so it sweeps through them every stroke. It
# clears because where it overlaps a frame in x, the frame is only a foot pad.
# That is asserted in assembly_check, not reasoned about here.
X_BELT_CENTRES = (P["r9_belt_len"] - math.pi * PULLEY_PD) / 2.0
# DERIVED, not chosen. The bracket bolts to the tower's +Y face, so a full
# thickness pad has to fit between that face and the motor body. The first
# version pinned this at 56.0 and the pad had nowhere to go: it ended up 0.55 mm
# inside the tower with no fixings at all, which Rev spotted by eye.
X_MOTOR_Y = TOWER_Y / 2.0 + FRAME + 1.0 + P["nema17_body"] / 2.0
X_MOTOR_Z = XA - math.sqrt(max(X_BELT_CENTRES ** 2 - X_MOTOR_Y ** 2, 1.0))
# The motor hangs INBOARD in x from a bracket face just outboard of the tower,
# so the body occupies span that is empty at this y. Its shaft still points
# outboard, where the screw's pulley is.
# This used to be XHALF + bracket_edge - 1.7. The 1.7 was a magic number whose
# only job was to land X_MOTOR_X0 1.2 mm clear of the frame body, and nothing
# asserted that gap. A volumetric clash reads 0.000 and prints "clear" on an
# exactly coplanar pair, which is the R5 tangency bug, so the constraint is
# derived from BODY_W and asserted as a number instead.
X_MOTOR_X0 = BODY_W / 2.0 + P["r9_motor_clear_x"]
X_MOTOR_X1 = X_MOTOR_X0 + P["nema17_body"]
BRACKET_T = XW                                     # motor face plate
BRACKET_FACE_X1 = X_MOTOR_X1 + BRACKET_T
X_MOTOR_SHAFT_TIP = X_MOTOR_X1 + P["nema17_shaft_len"]

# THE BELT PLANE. Nothing computed this before, so the two pulleys sat 12.8 mm
# apart in X and the belt could not have been fitted. Both toothed faces are
# placed here by construction and the screw pulley is positioned from it.
X_PUL_X0 = BRACKET_FACE_X1 + 1.0
X_PUL_T0 = X_PUL_X0 + P["pulley_flange"]
X_PUL_T1 = X_PUL_T0 + P["pulley_face"]
X_PUL_MOTOR_END = X_PUL_T1 + P["r9_motor_pulley_hub"]
X_PUL_SCREW_END = X_PUL_T1 + P["pulley_hub"]
X_MOTOR_Z_FLOOR = FRAME + P["r9_hold_down_head"] + 1.0 + P["nema17_body"] / 2.0

# Bracket mounting bolts, through the pad and tapped into the tower's +Y face.
# Z positions are derived to clear the X rail GRIP bore, so the taps can run
# full depth; pinning them would be the R8 constants mistake a fourth time.
R9_MOUNT_X = (TOWER_IN + 5.0, XHALF - 5.0)
R9_MOUNT_Z = (XA - XRAIL_GRIP / 2.0 - MP_R - 2.0,
              XA + XRAIL_GRIP / 2.0 + MP_R + 2.0)

X_TRAVEL = XSPAN - TS_X - COLLAR_STACK - 2.0
Z_TRAVEL = (P["screw_len_in"] * IN - 2.0 * PLATE_T
            - (P["pulley_flange"] + P["pulley_face"] + P["pulley_hub"])
            - SADDLE_Y - COLLAR_STACK - 2.0)

LOG = []


def note(msg):
    LOG.append(msg)
    App.Console.PrintMessage(msg + "\n")


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def lin_edges(shape, direction):
    d = V(*direction)
    d.normalize()
    out = []
    for e in shape.Edges:
        if not isinstance(e.Curve, Part.Line):
            continue
        try:
            ed = e.tangentAt(e.FirstParameter)
        except Exception:
            continue
        if abs(abs(ed.dot(d)) - 1.0) < 1e-6:
            out.append(e)
    return out


def edges_at_z(shape, z, tol=1e-6):
    out = []
    for e in shape.Edges:
        zs = [v.Point.z for v in e.Vertexes]
        if zs and all(abs(v - z) < tol for v in zs):
            out.append(e)
    return out


def fillet_safe(shape, r, edges, label):
    if r <= 0 or not edges:
        return shape
    try:
        s = shape.makeFillet(r, edges)
        if s.isValid() and s.Volume > 0:
            return s
        note("  fillet skipped (invalid result): %s" % label)
    except Exception as exc:
        note("  fillet skipped (%s): %s" % (label, exc))
    return shape


def rbox(dx, dy, dz, corner, r=0.0, axis="Z"):
    b = Part.makeBox(dx, dy, dz, V(*corner))
    if r > 0:
        d = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}[axis]
        b = fillet_safe(b, r, lin_edges(b, d), "rbox %s r=%.1f" % (axis, r))
    return b


def cbox(dx, dy, dz, y0, z0, r=0.0, axis="Z"):
    return rbox(dx, dy, dz, (-dx / 2.0, y0, z0), r, axis)


def cyl(r, h, base, direction=(0, 0, 1)):
    return Part.makeCylinder(r, h, V(*base), V(*direction))


def slot(w, length, depth, centre, z0):
    """Slot in plan, elongated along Y, cut downward."""
    x, y = centre
    run = length - w
    body = Part.makeBox(w, run, depth, V(x - w / 2.0, y - run / 2.0, z0))
    a = cyl(w / 2.0, depth, (x, y - run / 2.0, z0))
    b = cyl(w / 2.0, depth, (x, y + run / 2.0, z0))
    return body.fuse(a).fuse(b)


def xslot(w, travel, depth, centre, x0):
    """Slot bored along +X, slotted in Z. Box plus a cylinder on each end."""
    cy, cz = centre
    a = cyl(w / 2.0, depth, (x0, cy, cz - travel), (1, 0, 0))
    b = cyl(w / 2.0, depth, (x0, cy, cz + travel), (1, 0, 0))
    body = Part.makeBox(depth, w, 2.0 * travel, V(x0, cy - w / 2.0, cz - travel))
    return body.fuse(a).fuse(b)


def yslot(w, length, depth, centre, y0):
    """Slot in a vertical wall, elongated along X, bored along +Y."""
    x, z = centre
    run = length - w
    body = Part.makeBox(run, depth, w, V(x - run / 2.0, y0, z - w / 2.0))
    a = cyl(w / 2.0, depth, (x - run / 2.0, y0, z), (0, 1, 0))
    b = cyl(w / 2.0, depth, (x + run / 2.0, y0, z), (0, 1, 0))
    return body.fuse(a).fuse(b)


def fillet_every_edge(shape, r, label):
    """
    Break every edge that will take it.

    makeFillet on all 260 edges at once fails at every radius (StdFail_NotDone),
    so this bisects: try the whole set, and on failure split and try each half,
    keeping whatever lands. Two guards matter. A fillet can return a shape that
    is NOT valid, and an ungated version of this produced exactly that while
    quietly eating 47 cm3, so every step is rejected unless isValid() holds AND
    the volume moves less than 2 per cent. A rejected batch is bisected further
    rather than abandoned.

    Edges are matched between shapes by centre of mass, which is stable for the
    edges not yet touched. About 90 boolean ops and 30 seconds on the R9 saddle.
    """
    def key(e):
        p = e.CenterOfMass
        return (round(p.x, 3), round(p.y, 3), round(p.z, 3))

    def run(sh, keys):
        if not keys:
            return sh
        want = set(keys)
        es = [e for e in sh.Edges if key(e) in want]
        if es:
            try:
                f = sh.makeFillet(r, es)
                if f.isValid() and abs(f.Volume - sh.Volume) < 0.02 * sh.Volume:
                    return f
            except Exception:
                pass
        if len(keys) <= 1:
            return sh
        m = len(keys) // 2
        return run(run(sh, keys[:m]), keys[m:])

    def mesh_clean(sh):
        try:
            m = MeshPart.meshFromShape(Shape=sh, LinearDeflection=P["mesh_lin"],
                                       AngularDeflection=P["mesh_ang"],
                                       Relative=False)
            return (m.isSolid() and not m.hasSelfIntersections()
                    and not m.hasNonManifolds())
        except Exception:
            return False

    def chunked(seq, n):
        step = max(1, (len(seq) + n - 1) // n)
        return [seq[i:i + step] for i in range(0, len(seq), step)]

    before = len(shape.Edges)
    keys = [key(e) for e in shape.Edges]
    # Chunk-wise, mesh gated. An all-or-nothing mesh gate on the whole part
    # threw away every fillet because one bad edge somewhere poisoned the lot.
    # Filleting in chunks and reverting only the chunks that break the mesh
    # keeps the rest, which is the difference between "no radius worked" and
    # most of the edges broken.
    cur = shape
    kept = 0
    for chunk in chunked(keys, 12):
        trial = run(cur, list(chunk))
        if len(trial.Edges) != len(cur.Edges) and mesh_clean(trial):
            cur = trial
            kept += 1
    if kept and mesh_clean(cur):
        note("  %s: %d edges -> %d at r=%.2f, %d/12 chunks kept, %.1f -> %.1f cm3"
             % (label, before, len(cur.Edges), r, kept, shape.Volume / 1000.0,
                cur.Volume / 1000.0))
        return cur
    note("  %s: no chunk filleted cleanly, left unfilleted" % label)
    return shape


def _fillet_every_edge_unused(shape, r, label):
    def key(e):
        p = e.CenterOfMass
        return (round(p.x, 3), round(p.y, 3), round(p.z, 3))
    before = len(shape.Edges)
    keys = [key(e) for e in shape.Edges]
    # isValid() is NOT enough and this project has the scar to prove it: the
    # first version of this returned a valid=True shape whose MESH was not
    # solid, which is R1's tangent cylinder trap all over again. Mesh check the
    # result, and step the radius down rather than ship an unprintable part.
    for rr in (r, r * 0.66, r * 0.4):
        out = run(shape, list(keys))
        if mesh_clean(out):
            note("  %s: %d edges -> %d at r=%.2f, %.1f -> %.1f cm3"
                 % (label, before, len(out.Edges), rr, shape.Volume / 1000.0,
                    out.Volume / 1000.0))
            return out
        note("  %s: r=%.2f filleted but the MESH was not clean, backing off"
             % (label, rr))
        r = rr * 0.66 if rr == r else rr
    note("  %s: no radius produced a clean mesh, left unfilleted" % label)
    return shape


def cove_x(r, length, x0, y_edge, z_edge, sy, sz):
    """Quarter-round relief running along X at a (y, z) corner. Cut, not fillet:
    a fillet on an already-cut solid picks its edges by luck, and makeFillet
    fails outright when the radius approaches half the face width (R1 gotcha)."""
    cy = y_edge + sy * r
    cz = z_edge + sz * r
    box = Part.makeBox(length, r, r, V(x0, min(y_edge, cy), min(z_edge, cz)))
    return box.cut(cyl(r, length, (x0, cy, cz), (1, 0, 0)))


def hexprism(af, h, centre, z0, flat_to_x=True):
    """Hex pocket, extruded +Z. flat_to_x puts FLATS on +/-X, which is 0.56 mm
    narrower across the bed than corner-on and is what keeps the M4 nut pocket
    clear of the rail bore."""
    r = af / math.sqrt(3.0)
    x, y = centre
    start = 30.0 if flat_to_x else 0.0
    pts = [V(x + r * math.cos(math.radians(start + 60 * i)),
             y + r * math.sin(math.radians(start + 60 * i)), z0) for i in range(6)]
    pts.append(pts[0])
    return Part.Face(Part.Wire(Part.makePolygon(pts))).extrude(V(0, 0, h))


# ----------------------------------------------------------------------------
# shared end frame
# ----------------------------------------------------------------------------
def end_frame():
    """Plate the thickness of the rail clamp, central bearing boss, one foot each side."""
    s = cbox(BODY_W, PLATE_T, ZA, 0.0, 0.0, P["corner_r"] if not LEAN else 0.0)
    s = fillet_safe(s, 1.5, edges_at_z(s, ZA), "frame top")
    boss = cbox(2.0 * TOWER_R, PLATE_T, TOP_Z - ZA, 0.0, ZA, 6.0 if not LEAN else 0.0)
    boss = fillet_safe(boss, 1.5, edges_at_z(boss, TOP_Z), "boss top")
    s = s.fuse(boss)

    for sx in (-1, 1):
        pad = rbox(2.0 * P["foot_pad_r"], PLATE_T, FRAME,
                   (sx * FOOT_X - P["foot_pad_r"], 0.0, 0.0), P["foot_pad_r"] - 1.5)
        pad = fillet_safe(pad, 1.5, edges_at_z(pad, FRAME), "foot pad top")
        s = s.fuse(pad)

    # rails: half bores open at the split plane, no bridging, they slide through
    for sx in (-1, 1):
        s = s.cut(cyl(RAIL_BORE / 2.0, PLATE_T + 2.0, (sx * RAIL_X, -1.0, ZA), (0, 1, 0)))
    # leadscrew, bearing pocket on each face
    s = s.cut(cyl(SCREW_BORE / 2.0, PLATE_T + 2.0, (0, -1.0, ZA), (0, 1, 0)))
    s = s.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (0, -0.001, ZA), (0, 1, 0)))
    s = s.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (0, PLATE_T + 0.001, ZA), (0, -1, 0)))
    # cap inserts
    for sx in (-1, 1):
        for sox in (-1, 1):
            for y in CAP_SCREW_Y:
                s = s.cut(cyl(P["insert_dia"] / 2.0, P["insert_depth"] + 1.0,
                              (sx * RAIL_X + sox * P["cap_screw_offset"], y, ZA + 1.0),
                              (0, 0, -1)))
    # hold-downs
    for sx in (-1, 1):
        s = s.cut(slot(P["foot_slot_w"], P["foot_slot_len"], FRAME + 2.0,
                       (sx * FOOT_X, PLATE_T / 2.0), -1.0))
    return s


def headstock():
    note("headstock frame")
    return end_frame()


# ----------------------------------------------------------------------------
# tail frame: same plate plus the belt-drive motor mount behind it
# ----------------------------------------------------------------------------
def tailstock():
    note("tail frame with belt drive")
    s = end_frame()

    belt_left = min(0.0, MOTOR_DX) - PULLEY_OR - 1.0
    bolt_max = MOTOR_DX + P["nema_bolt_cc"] / 2.0 + P["nema_slot_travel"] \
        + P["nema_bolt_clear"] / 2.0
    x_left = belt_left - FRAME
    x_right = min(bolt_max + P["bracket_edge"], BODY_W / 2.0)
    bracket_top = MOTOR_Z + P["nema_bolt_cc"] / 2.0 + P["bracket_edge"] \
        + P["nema_bolt_clear"] / 2.0

    plate = rbox(x_right - x_left, FRAME, bracket_top,
                 (x_left, BRACKET_Y0, 0.0), 6.0 if not LEAN else 0.0, "Y")
    s = s.fuse(plate)

    # two side ribs tying the motor plate to the frame, clear of the belt
    for x0 in (x_left, x_right - FRAME):
        pts = [V(x0, PLATE_T, 0.0), V(x0, BRACKET_Y1, 0.0),
               V(x0, BRACKET_Y1, bracket_top - 2.0), V(x0, PLATE_T, ZA + 12.0)]
        wire = Part.makePolygon(pts + [pts[0]])
        rib = Part.Face(wire).extrude(V(FRAME, 0, 0))
        s = s.fuse(rib)

    # feet either side of the motor plate, outboard of the motor body behind it
    pad_y0 = BRACKET_Y0 - 6.0
    pad_len = (BRACKET_Y1 + 6.0) - pad_y0
    for x in (x_left - 8.0, x_right + 8.0):
        pad = rbox(2.0 * P["foot_pad_r"], pad_len, FRAME,
                   (x - P["foot_pad_r"], pad_y0, 0.0), P["foot_pad_r"] - 1.5)
        s = s.fuse(pad)
        s = s.cut(slot(P["foot_slot_w"], P["foot_slot_len"], FRAME + 2.0,
                       (x, pad_y0 + pad_len / 2.0), -1.0))

    # motor: pilot clearance and four slotted bolt holes for belt tension
    s = s.cut(yslot(P["nema_pilot_clear"],
                    P["nema_pilot_clear"] + 2.0 * P["nema_slot_travel"],
                    FRAME + 4.0, (MOTOR_DX, MOTOR_Z), BRACKET_Y0 - 2.0))
    b = P["nema_bolt_cc"] / 2.0
    for sx in (-1, 1):
        for sz in (-1, 1):
            s = s.cut(yslot(P["nema_bolt_clear"],
                            P["nema_bolt_clear"] + 2.0 * P["nema_slot_travel"],
                            FRAME + 4.0, (MOTOR_DX + sx * b, MOTOR_Z + sz * b),
                            BRACKET_Y0 - 2.0))
    # the two lower motor screws hide behind the frame: bore through for a hex key
    for sx in (-1, 1):
        z = MOTOR_Z - b
        if 0 < z < ZA:
            s = s.cut(cyl(P["wrench_hole"] / 2.0, PLATE_T + 2.0,
                          (MOTOR_DX + sx * b, -1.0, z), (0, 1, 0)))
    # clearance for the end of the leadscrew behind its pulley
    s = s.cut(cyl(9.0, FRAME + 4.0, (0, BRACKET_Y0 - 2.0, ZA), (0, 1, 0)))
    note("  motor at x %.1f z %.1f, centres %.1f, belt %.0f mm"
         % (MOTOR_DX, MOTOR_Z, CENTRES, P["belt_len"]))
    return s


# ----------------------------------------------------------------------------
# rail clamp cap (print 4)
# ----------------------------------------------------------------------------
def rail_cap():
    note("rail clamp cap")
    rel = P["cap_relief"]
    s = cbox(CAP_W, PLATE_T, CAP_T - rel, 0.0, rel, 3.0)
    s = fillet_safe(s, 1.5, edges_at_z(s, CAP_T), "cap top")
    s = s.cut(cyl(RAIL_BORE / 2.0, PLATE_T + 2.0, (0, -1.0, 0.0), (0, 1, 0)))
    for sox in (-1, 1):
        for y in CAP_SCREW_Y:
            x = sox * P["cap_screw_offset"]
            s = s.cut(cyl(P["cap_screw_clear"] / 2.0, CAP_T + 2.0, (x, y, -1.0)))
            s = s.cut(cyl(P["cap_screw_cbore"] / 2.0, P["cap_screw_cbore_depth"] + 1.0,
                          (x, y, CAP_T - P["cap_screw_cbore_depth"])))
    return s


# ----------------------------------------------------------------------------
# R6 tailstock carrier (Rev 2026-09-28)
#
# Clamps both rails between the tail frame and the saddle and carries his real
# tailstock on two M6 bolts 45 mm apart ACROSS the bed. Three things set it:
#
#  * CLOSED bores. He chose closed, so it threads on from a rail end during
#    assembly; it does not drop on from above.
#  * The slit is HORIZONTAL and the clamp screw VERTICAL. A slit cut up from the
#    bottom face would need its cross screw at about z = 16, running along X
#    straight through the leadscrew bore (bottom 21.0) and the collar counterbore
#    (bottom 16.9). It cannot exist. This is R5's perpendicular rule again.
#  * A captured HEX NUT, not a heat-set insert. An insert pocket in the lower jaw
#    would open onto the slit face, inside a 1.2 mm slot, with no room for the
#    iron. Steel threads also beat plain PLA on a clamp that gets re-torqued.
#
# The flexure is the 6.35 mm of material over each bore. R1 rejected a pinch slit
# partly for that; Rev specified the pinch in R6, so that is where it bends.
# ----------------------------------------------------------------------------
def tailstock_carrier():
    note("tailstock carrier")
    h = TSC_Z1 - TSC_Z0
    s = cbox(BODY_W, TSC_T, h, 0.0, TSC_Z0, 3.0)
    s = fillet_safe(s, 1.5, edges_at_z(s, TSC_Z1), "carrier top")

    for sx in (-1, 1):
        s = s.cut(cyl(RAIL_BORE / 2.0, TSC_T + 2.0, (sx * RAIL_X, -1.0, ZA), (0, 1, 0)))
    # the Z leadscrew runs straight through the middle
    s = s.cut(cyl(SCREW_BORE / 2.0, TSC_T + 2.0, (0, -1.0, ZA), (0, 1, 0)))
    # y = 0 is the face that butts the tail frame. The counterbore swallows the
    # inboard shaft collar and the printed thrust washer, which is 12.6 mm of bed
    # the saddle could never reach anyway: 71.4 mm of Z travel instead of 58.8.
    if P["tsc_collar_cbore"]:
        s = s.cut(cyl(TSC_CBORE_D / 2.0, TSC_CBORE_L, (0, -0.001, ZA), (0, 1, 0)))

    for sx in (-1, 1):
        # slit from the outboard end face in to the bore centre; the hinge is the
        # inboard wall of the bore
        w = BODY_W / 2.0 + 1.0 - RAIL_X
        x0 = RAIL_X if sx > 0 else -(BODY_W / 2.0 + 1.0)
        s = s.cut(Part.makeBox(w, TSC_T + 2.0, P["pinch_slit"],
                               V(x0, -1.0, ZA - P["pinch_slit"] / 2.0)))
        cx = sx * TSC_CLAMP_X
        s = s.cut(cyl(P["tsc_clamp_screw"] / 2.0, h + 2.0, (cx, TSC_T / 2.0, TSC_Z0 - 1.0)))
        s = s.cut(cyl(P["tsc_clamp_head"] / 2.0, P["tsc_clamp_head_depth"] + 1.0,
                      (cx, TSC_T / 2.0, TSC_Z1 - P["tsc_clamp_head_depth"])))
        s = s.cut(hexprism(P["tsc_clamp_nut_af"], P["tsc_clamp_nut_t"] + 0.2,
                           (cx, TSC_T / 2.0), TSC_Z0 - 0.001))

    # his tailstock foot, two M6 into heat-set inserts down from the top face
    for sx in (-1, 1):
        s = s.cut(cyl(P["tsc_insert_dia"] / 2.0, P["tsc_insert_depth"] + 1.0,
                      (sx * P["tsc_bolt_cc"] / 2.0, TSC_T / 2.0, TSC_Z1 + 1.0),
                      (0, 0, -1)))
    return s


# ----------------------------------------------------------------------------
# printed GT2 pulley, one per shaft
# ----------------------------------------------------------------------------
def pulley(bore, label, hub=None):
    """hub overrides P["pulley_hub"]. R9's motor pulley needs a short one: a
    NEMA 17 shaft is 24 from the motor face and the bracket plate eats 6.35 of
    it, so an 11.5 hub would overhang the shaft end and its pinch screw would
    clamp air."""
    note("pulley %s (bore %.2f)" % (label, bore))
    fl, face = P["pulley_flange"], P["pulley_face"]
    hub = P["pulley_hub"] if hub is None else hub
    r_tip = PULLEY_R
    rg = 0.75                       # groove: 0.76 deep, about 1.5 wide at the tip
    rc = r_tip + rg - 0.76

    s = cyl(r_tip + 2.0, fl, (0, 0, 0))
    s = s.fuse(cyl(r_tip, face, (0, 0, fl)))
    for i in range(P["belt_teeth"]):
        a = 2.0 * math.pi * i / P["belt_teeth"]
        s = s.cut(cyl(rg, face + 2.0, (rc * math.cos(a), rc * math.sin(a), fl - 1.0)))
    s = s.fuse(cyl(P["pulley_hub_od"] / 2.0, hub, (0, 0, fl + face)))
    total = fl + face + hub
    s = s.cut(cyl(bore / 2.0, total + 2.0, (0, 0, -1.0)))

    # pinch clamp in the hub: slit plus an M3 screw into a heat-set insert
    hub_z0 = fl + face + 1.5
    s = s.cut(Part.makeBox(P["pulley_hub_od"], P["pinch_slit"], hub - 3.0,
                           V(0, -P["pinch_slit"] / 2.0, hub_z0)))
    x_screw = bore / 2.0 + 2.6
    z_screw = hub_z0 + (hub - 3.0) / 2.0
    s = s.cut(cyl(P["pinch_clear"] / 2.0, P["pulley_hub_od"],
                  (x_screw, -P["pulley_hub_od"], z_screw), (0, 1, 0)))
    s = s.cut(cyl(P["pinch_insert"] / 2.0, P["pinch_insert_depth"],
                  (x_screw, P["pulley_hub_od"] / 2.0, z_screw), (0, -1, 0)))
    return s


# ----------------------------------------------------------------------------
# thrust washer (print 2)
# ----------------------------------------------------------------------------
def thrust_washer():
    """
    There is no coupler in R4, so nothing locates the leadscrew axially. A shaft
    collar each side of the tail frame traps it, but a 16 mm collar would rub the
    688 shield. This washer sits between collar and bearing inner race: it clears
    the shield and everything on the screw turns together, so nothing rubs.
    """
    note("thrust washer")
    s = cyl(11.4 / 2.0, 1.6, (0, 0, 0))
    return s.cut(cyl(8.3 / 2.0, 4.0, (0, 0, -1.0)))


# ----------------------------------------------------------------------------
# R5 cross slide: saddle body
#
# Rides the Z rails on printed plain bushings and carries the brass flange nut.
# The nut flange is RECESSED FLUSH: a protruding 3.5 flange would cost 3.5 of
# Z travel, and recessing it is free.
# ----------------------------------------------------------------------------
def saddle_body_r9():
    """
    R9 lower channel: open downward, web across the top, two flanges hanging to
    the floor with a Z rail land in each.

    Why a channel rather than R8's slab with bays. The towers now reach x
    +/-100 while the Z rails still carry the part at x +/-41.275, so the
    cantilever goes 37.5 to 58.7 mm a side. A deep open section is the right
    answer to that, and it is also what Rev asked for visually, so the styling
    and the structure want the same thing for once.

    The Z rails get two lands instead of one continuous bore. That is LESS
    bearing area but a LONGER span (60.79 against 50.8), so rock resistance
    improves even though area drops. It is still a real change to the one fit in
    this project that is physically proven, which is why r9_flange_t is a
    parameter and not a number buried here.
    """
    note("R9 channel saddle body")
    y0 = -SADDLE_Y / 2.0
    ft = P["r9_flange_t"]

    s = rbox(2.0 * XHALF, SADDLE_Y, SADDLE_Z1 - SADDLE_Z0,
             (-XHALF, y0, SADDLE_Z0), P["saddle_corner_r"], "Z")

    # Hollow it into a channel, but stop short of each end so a flat plate
    # closes it. Rev asked for 0.250 there. An open ended channel is also much
    # worse in torsion, and torsion is what a 58.7 mm cantilever feeds it.
    ep = P["r9_end_plate_in"] * IN
    # DOMED ceiling, not a flat one. Rev asked for the hollow to be rounded, and
    # it is the right shape three times over: it kills the sharp internal corner
    # where the web meets each flange (a stress riser on a part whose whole job
    # is to resist a 58.7 mm cantilever), it fills those corners with material
    # exactly where bending wants it, and a flat 28.8 mm ceiling is a horizontal
    # bridge on a printer while an arch is very nearly self supporting.
    hw = (SADDLE_Y - 2.0 * ft) / 2.0
    ceil_z = SADDLE_Z1 - XW
    spring = ceil_z - hw
    xlen = 2.0 * (XHALF - ep)
    x_lo = -XHALF + ep
    void = Part.makeBox(xlen, 2.0 * hw, spring - (SADDLE_Z0 - 0.001),
                        V(x_lo, -hw, SADDLE_Z0 - 0.001))
    void = void.fuse(cyl(hw, xlen, (x_lo, 0.0, spring), (1, 0, 0)))
    s = s.cut(void)

    # Transverse bulkheads inside the C, running across the channel from flange
    # to flange. Positions are DERIVED to clear the Z leadscrew at x = 0 and
    # both Z rails at x = +/-RAIL_X, all three of which run the length of the
    # channel in Y and so cross every rib line.
    inner = XHALF - ep
    zone_a = (P["brass_flange_od"] / 2.0 + P["brass_recess_extra"] / 2.0 + XW,
              RAIL_X - RAIL_BORE / 2.0 - XW)
    zone_b = (RAIL_X + RAIL_BORE / 2.0 + XW, inner - XW)
    ribs = []
    for lo, hi in (zone_a, zone_b):
        n = max(1, int(P["r9_rib_count"]) if hi - lo > 40.0 else 1)
        for i in range(n):
            ribs.append(lo + (hi - lo) * (i + 1.0) / (n + 1.0))
    for rx in ribs:
        for sx in (-1, 1):
            # A PLAIN BOX, deliberately wider and taller than the void it
            # fills, so it merges into the flanges and the web as a genuine
            # volume overlap. The obvious version gave each rib the same vault
            # arc as the channel, which put a cylindrical face exactly coincident
            # with the channel's own, and flat rib sides exactly tangent to it.
            # That is R1's tangent-surface trap: the shape stays isValid() and
            # the MESH goes non-manifold, which is what stopped every fillet
            # radius from landing on this part.
            rb = Part.makeBox(XW, 2.0 * hw + 4.0, SADDLE_Z1 - SADDLE_Z0,
                              V(sx * rx - XW / 2.0, -hw - 2.0, SADDLE_Z0))
            s = s.fuse(rb)
    s = s.removeSplitter()

    # Z rail bores, right through both lands
    for sx in (-RAIL_X, RAIL_X):
        s = s.cut(cyl(RAIL_BORE / 2.0, SADDLE_Y + 4.0, (sx, y0 - 2.0, ZA), (0, 1, 0)))

    # Z leadscrew clearance, right through
    s = s.cut(cyl(SCREW_BORE / 2.0, SADDLE_Y + 4.0, (0, y0 - 2.0, ZA), (0, 1, 0)))

    # brass flange nut, on the HEADSTOCK-facing land, same as R8
    rec_d = P["brass_flange_od"] + P["brass_recess_extra"]
    s = s.cut(cyl(rec_d / 2.0, REC_T, (0, y0 - 0.05, ZA), (0, 1, 0)))
    s = s.cut(cyl(NUTBORE / 2.0, P["brass_body_len"] + 0.5,
                  (0, y0 + REC_T - 0.05, ZA), (0, 1, 0)))
    pcd = P["brass_pcd"] / 2.0
    for ax, az in FLANGE_BOLTS:
        s = s.cut(cyl(FLANGE_FASTENER_D / 2.0, P["m3_insert_depth"],
                      (ax * pcd, y0 + REC_T - 0.05, ZA + az * pcd), (0, 1, 0)))

    # coves on the four long edges, as R7. Asymmetric for the same reason: the
    # part HANGS on the Z rails, so the top of each bore is the loaded face.
    for sy in (-1, 1):
        s = s.cut(cove_x(P["saddle_cove_bottom"], 2.0 * XHALF + 4.0, -XHALF - 2.0,
                         sy * SADDLE_Y / 2.0, SADDLE_Z0, -sy, 1))
        s = s.cut(cove_x(P["saddle_cove_top"], 2.0 * XHALF + 4.0, -XHALF - 2.0,
                         sy * SADDLE_Y / 2.0, SADDLE_Z1, -sy, -1))
    return s


def saddle_body():
    y0 = -SADDLE_Y / 2.0
    s = rbox(2.0 * XHALF, SADDLE_Y, SADDLE_Z1 - SADDLE_Z0,
             (-XHALF, y0, SADDLE_Z0), P["saddle_corner_r"], "Z")

    # R7 coves along the four long edges. Rounder to look at and it is real
    # material, but the two are not symmetric: the saddle HANGS on the Z rails,
    # so gravity and cutting load both press the TOP of each bore down onto the
    # rail. The top edges get a modest radius and the bottom edges a generous
    # one, rather than one radius applied for looks.
    for sy in (-1, 1):
        s = s.cut(cove_x(P["saddle_cove_bottom"], 2.0 * XHALF + 4.0, -XHALF - 2.0,
                         sy * SADDLE_Y / 2.0, SADDLE_Z0, -sy, 1))
        s = s.cut(cove_x(P["saddle_cove_top"], 2.0 * XHALF + 4.0, -XHALF - 2.0,
                         sy * SADDLE_Y / 2.0, SADDLE_Z1, -sy, -1))

    # Z rail bores, closed circles, right through. The saddle is threaded onto
    # the rails before the frames' caps go on.
    for sx in (-RAIL_X, RAIL_X):
        s = s.cut(cyl(RAIL_BORE / 2.0, SADDLE_Y + 4.0, (sx, y0 - 2.0, ZA), (0, 1, 0)))

    # leadscrew clearance, right through
    s = s.cut(cyl(SCREW_BORE / 2.0, SADDLE_Y + 4.0, (0, y0 - 2.0, ZA), (0, 1, 0)))

    # brass flange nut, on the HEADSTOCK-facing face (-Y). The tail end is the
    # end with the inboard shaft collar, so the flange must not live there.
    rec_d = P["brass_flange_od"] + P["brass_recess_extra"]
    rec_t = REC_T
    s = s.cut(cyl(rec_d / 2.0, rec_t, (0, y0 - 0.05, ZA), (0, 1, 0)))
    s = s.cut(cyl(NUTBORE / 2.0, P["brass_body_len"] + 0.5,
                  (0, y0 + rec_t - 0.05, ZA), (0, 1, 0)))

    # 4x M3 inserts in the FLOOR of the recess, so the flange bolts down flush
    pcd = P["brass_pcd"] / 2.0
    for ax, az in FLANGE_BOLTS:
        c = (ax * pcd, y0 + rec_t - 0.05, ZA + az * pcd)
        s = s.cut(cyl(FLANGE_FASTENER_D / 2.0, P["m3_insert_depth"], c, (0, 1, 0)))

    # Angled ends. Outboard of the Z bushing bosses the body carries nothing but
    # the tower above it, so that corner is cut away on a slope running from the
    # boss's outer edge at the floor up to the tower base at the full half width.
    m = (ZF0 - SADDLE_Z0) / (XHALF - TAPER_X)
    for sx in (-1, 1):
        far = XHALF + 6.0
        pts = [(TAPER_X, SADDLE_Z0),
               (far, SADDLE_Z0 + (far - TAPER_X) * m),
               (far, SADDLE_Z0 - 6.0),
               (TAPER_X, SADDLE_Z0 - 6.0),
               (TAPER_X, SADDLE_Z0)]
        poly = Part.makePolygon([V(sx * px, y0 - 2.0, pz) for px, pz in pts])
        s = s.cut(Part.Face(poly).extrude(V(0, SADDLE_Y + 4.0, 0)))

    # The two gaps between the nut boss and the Z bushing bosses, kept tied by a
    # 0.375 plate across the top.
    #
    # R7: the bay used to stop at a flat wall 0.5 mm clear of the boss's
    # outermost point (BAY_X1), which left a full-height slab of material in
    # every corner the round boss does not reach. It now runs all the way to the
    # rail centreline and has the boss cylinder ADDED BACK, so its outboard wall
    # is a cove following the boss instead of a plane tangent to it. Same wall
    # rule, same tie plate, less material, and it reads as cast.
    for sx in (-1, 1):
        x0 = BAY_X0 if sx > 0 else -RAIL_X
        bay = Part.makeBox(RAIL_X - BAY_X0, SADDLE_Y + 4.0, BAY_Z1 - SADDLE_Z0,
                           V(x0, y0 - 2.0, SADDLE_Z0))
        bay = bay.cut(cyl(Z_BOSS_R, SADDLE_Y + 4.0,
                          (sx * RAIL_X, y0 - 2.0, ZA), (0, 1, 0)))
        s = s.cut(bay)
    return s


# ----------------------------------------------------------------------------
# R5 cross slide: X bearing towers
#
# side = +1 is the motor end. Its 688 pocket, the 2.0 load bearing web and the
# Oldham cavity run outboard in that order. side = -1 is the fixed end: a 688
# pocket on BOTH faces, with shoulders facing opposite ways, so a shaft collar
# on each side traps the screw in both directions.
#
# The towers are wider in Y than the saddle body (67.14 vs 50.8). That is legal
# because above TS_Z0 they are clear of the Z frame tops and may overhang them,
# and it is what decouples X rail spacing from saddle length.
# ----------------------------------------------------------------------------
def x_tower(side):
    x0 = TOWER_IN if side > 0 else -XHALF

    # The tower is a prism whose Y-Z section flares out at 45 degrees, seated on
    # the saddle with a 2.0 overlap. Three reasons it is not just a box:
    #   1. A box spanning the full saddle height would interpenetrate the saddle
    #      body while being WIDER in Y, giving partly coincident faces at the
    #      fuse. That meshes non-manifold from an isValid()-True solid, the exact
    #      R4 trap.
    #   2. A box 67.14 wide in Y at every z would stick 8.171 past the saddle
    #      BELOW the frame tops, so it would hit the Z frames and silently cost
    #      Z travel the checks claim we have.
    #   3. An 8.171 square overhang does not print. At 45 degrees it does, and
    #      the tower reaches full width by z 49.07, well under the rail bore
    #      lobe bottom at 53.87, so no load path is lost.
    pts = [V(x0, -TOWER_W0 / 2.0, ZF0),
           V(x0, TOWER_W0 / 2.0, ZF0),
           V(x0, TOWER_Y / 2.0, ZF1),
           V(x0, TOWER_Y / 2.0, TOWER_Z1),
           V(x0, -TOWER_Y / 2.0, TOWER_Z1),
           V(x0, -TOWER_Y / 2.0, ZF1),
           V(x0, -TOWER_W0 / 2.0, ZF0)]
    # R9 towers have no flare, so TOWER_W0 == TOWER_Y and ZF1 == ZF0, which makes
    # two pairs of these points coincide. makePolygon rejects a zero length
    # segment, so drop any point equal to the one before it. R8 is unaffected:
    # none of its points coincide.
    dedup = [pts[0]]
    for q in pts[1:]:
        if (q - dedup[-1]).Length > 1e-9:
            dedup.append(q)
    t = Part.Face(Part.makePolygon(dedup)).extrude(V(TOWER_T, 0, 0))

    # X rail bores, right through, each held by an M3 SET SCREW down the crown.
    #
    # The spec called for a pinch slit and a clamping screw. That cannot work as
    # drawn: a slit cut DOWN from the crown cannot be closed by a screw also
    # driven DOWN from the crown, because the screw is then parallel to the slit.
    # Closing it properly needs a screw running in Y, which on a 67 mm wide tower
    # means a 20 mm screw buried in a blind cross-drilling. A set screw bearing
    # on the rail does the whole job the spec asks of it (stop the rail rotating
    # and creeping; it is captive between the towers anyway) with two features
    # instead of four, and no tangency at the bore equator.
    for sy in (-XRAIL_Y, XRAIL_Y):
        t = t.cut(cyl(XRAIL_GRIP / 2.0, PLATE_T + 4.0,
                      (x0 - 2.0, sy, XA), (1, 0, 0)))
        xc = x0 + TOWER_T / 2.0
        # TAPPED, not heat-set. The rail's reaction pushes the screw back toward
        # the open crown face, which is a heat-set insert's weakest direction, and
        # there is 14.5 mm of crown here to take a full-depth M3 thread instead.
        t = t.cut(cyl(P["m3_tap"] / 2.0, TOWER_Z1 + 0.05 - (XA - 1.0),
                      (xc, sy, TOWER_Z1 + 0.05), (0, 0, -1)))

    # X screw bore, right through
    t = t.cut(cyl(SCREW_BORE / 2.0, PLATE_T + 4.0, (x0 - 2.0, 0, XA), (1, 0, 0)))

    if P["long_x"]:
        # R9 is BELT driven, so there is no Oldham cavity, no wrench hole to
        # reach a buried hub screw, and no motor plate fixings on either tower.
        # Cutting them anyway is not cosmetic: GOVERN_R stopped counting the
        # 20.0 cavity when the belt replaced it, so a cavity still cut here
        # leaves 4.42 mm of wall over it against XW 6.35, and the wall check
        # would not notice because it measures GOVERN_R, which is now the 688.
        #
        # Both towers instead get a 688 pocket on each face with the shoulders
        # opposing, exactly like R8's fixed end, so a collar each side seats its
        # own bearing and the screw cannot walk. The screw runs out past the +X
        # tower to its pulley.
        if side > 0:
            # PULLEY END, and it is the FLOATING end: one pocket, on the inboard
            # face only. Giving both towers two pockets read as two fixed ends,
            # which over-constrains the screw axially and would have put a second
            # collar stack in the span that X_TRAVEL does not budget for. The
            # screw runs on through to its pulley.
            t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (TOWER_IN - 0.05, 0, XA), (1, 0, 0)))
            # 4x TAPPED M4 in the +Y FACE for the belt motor bracket. They have
            # to be here and not on the outboard X face: the motor hangs at
            # y = 62 and the tower ends at 30.4, so an X face joint would be a
            # 0.55 mm sliver. Z positions clear the X rail bore so these run
            # full depth without breaking into it.
            for bx in R9_MOUNT_X:
                for bz in R9_MOUNT_Z:
                    t = t.cut(cyl(MP_R, P["mp_tap_depth"],
                                  (bx, TOWER_Y / 2.0 + 0.05, bz), (0, -1, 0)))
        else:
            t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (-TOWER_IN + 0.05, 0, XA), (-1, 0, 0)))
            t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (-XHALF - 0.05, 0, XA), (1, 0, 0)))
    elif side > 0:
        # 688 on the INBOARD face, then the web, then the cavity outboard
        t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (TOWER_IN - 0.05, 0, XA), (1, 0, 0)))
        t = t.cut(cyl(CAV_D / 2.0, XHALF - WEB_OUT + 0.05, (WEB_OUT, 0, XA), (1, 0, 0)))
        # wrench access to the buried screw hub clamp screw
        t = t.cut(cyl(P["wrench_hole"] / 2.0, TOWER_Z1 - XA + 2.0,
                      (WRENCH_X, 0, TOWER_Z1 + 0.05), (0, 0, -1)))
        # 4x TAPPED M4 for the motor plate, in the OUTBOARD face. See mp_tap:
        # a 7.10 insert pocket cannot clear both the tower edge and the X rail
        # bore once the tower wall goes to 0.250.
        for sy in (-MP_Y, MP_Y):
            for sz in (MP_Z_LO, MP_Z_HI):
                t = t.cut(cyl(MP_R, P["mp_tap_depth"],
                              (XHALF + 0.05, sy, sz), (-1, 0, 0)))
    else:
        # fixed end: a pocket on each face. Shoulders face opposite ways, so a
        # collar on each side seats its own bearing and the screw cannot walk.
        t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (-TOWER_IN + 0.05, 0, XA), (-1, 0, 0)))
        t = t.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (-XHALF - 0.05, 0, XA), (1, 0, 0)))

    # styling that is also structure: chamfer the crown so the 688 and coupler
    # housings read as bearing caps. Only the two crown edges that run in X, so
    # the chamfer does not try to walk round the bores.
    if not LEAN:
        def x_edges_at(z):
            return [e for e in lin_edges(t, (1, 0, 0))
                    if all(abs(v.Point.z - z) < 1e-6 for v in e.Vertexes)]
        t = fillet_safe(t, P["tower_crown_r"], x_edges_at(TOWER_Z1),
                        "tower crown %d" % side)
        # R7: also break the flare shoulder, where the 45 degree rise turns
        # vertical. Applied in its own call so that if one radius is refused the
        # other still lands, instead of fillet_safe silently skipping both.
        if TOWER_FLARE > 1e-9:
            t = fillet_safe(t, P["tower_crown_r"], x_edges_at(ZF1),
                            "tower flare shoulder %d" % side)
    return t


def cross_slide_saddle():
    s = saddle_body_r9() if P["long_x"] else saddle_body()
    for side in (-1, 1):
        s = s.fuse(x_tower(side))
    s = s.removeSplitter()
    if not LEAN and TOWER_FLARE > 1e-9:
        # Cove where each tower's 45 degree flare meets its vertical face, so the
        # root reads as a cast transition. Filleting the saddle-top edges instead
        # (z = SADDLE_Z1, where the flare crosses the saddle face) self
        # intersects at r = 1, 2 and 5 and is clean only at r = 3, which is luck
        # rather than geometry: that edge set is degenerate. The ZF1 edges are
        # clean at every radius tried.
        s = fillet_safe(s, P["cove_r"], edges_at_z(s, ZF1), "tower cove")
    if P["long_x"] and not LEAN:
        s = fillet_every_edge(s, P["r9_fillet_r"], "R9 saddle")
    return s


# ----------------------------------------------------------------------------
# R5 cross slide: top slide
#
# Rides the X rails on printed plain bushings, driven by the second brass flange
# nut. Its thickness is set by the NUT BODY bore (11.2), not the rail bore
# (10.092): both are on the X centreline and the 0.375 rule follows the larger.
#
# The tool platform carries an alternating M3 / M4 insert grid. The alternation
# is geometric: over the rail bores there is only 10.08 of plate, enough for an
# M3 pocket (6.0) but not an M4 (8.5), so the M4s live in the full-depth bands.
# ----------------------------------------------------------------------------
def cross_slide_top_plate():
    s = rbox(TS_X, TOWER_Y, TS_Z1 - TS_Z0,
             (-TS_X / 2.0, -TOWER_Y / 2.0, TS_Z0), P["corner_r"], "Z")

    # R7 frame-top relief, outboard of the saddle footprint in Y. See TS_BAND_Z.
    for sy in (-1, 1):
        y0 = sy * TS_BAND_Y if sy > 0 else -TOWER_Y / 2.0 - 2.0
        s = s.cut(Part.makeBox(TS_X + 4.0, TOWER_Y / 2.0 + 2.0 - TS_BAND_Y,
                               TS_BAND_Z - TS_Z0,
                               V(-TS_X / 2.0 - 2.0, y0, TS_Z0 - 0.001)))

    # X rail bores, sliding fit, right through
    for sy in (-XRAIL_Y, XRAIL_Y):
        s = s.cut(cyl(XRAIL_BORE / 2.0, TS_X + 4.0, (-TS_X / 2.0 - 2.0, sy, XA), (1, 0, 0)))

    # X screw clearance, right through
    s = s.cut(cyl(SCREW_BORE / 2.0, TS_X + 4.0, (-TS_X / 2.0 - 2.0, 0, XA), (1, 0, 0)))

    # brass flange nut, recessed flush in the MOTOR-side (+X) face. The left
    # tower is the end carrying the X inboard collar, so the flange goes here.
    rec_d = P["brass_flange_od"] + P["brass_recess_extra"]
    rec_t = REC_T
    s = s.cut(cyl(rec_d / 2.0, rec_t + 0.05, (TS_X / 2.0 - rec_t, 0, XA), (1, 0, 0)))
    s = s.cut(cyl(NUTBORE / 2.0, P["brass_body_len"] + 0.5,
                  (TS_X / 2.0 - rec_t - P["brass_body_len"], 0, XA), (1, 0, 0)))
    pcd = P["brass_pcd"] / 2.0
    for ay, az in FLANGE_BOLTS:
        s = s.cut(cyl(FLANGE_FASTENER_D / 2.0, P["m3_insert_depth"],
                      (TS_X / 2.0 - rec_t + 0.05, ay * pcd, XA + az * pcd), (-1, 0, 0)))

    # tool platform insert grid, 12 points, checkerboarded M3 / M4
    for ci, gx in enumerate((-13.0, 0.0, 13.0)):
        for ri, gy in enumerate(GRID_Y):
            if (ci + ri) % 2:
                d, depth = P["m4_insert"], P["m4_insert_depth"]
            else:
                d, depth = P["m3_insert"], P["m3_insert_depth"]
            s = s.cut(cyl(d / 2.0, depth, (gx, gy, TS_Z1 + 0.05), (0, 0, -1)))
    return s


# ----------------------------------------------------------------------------
# R5 cross slide: NEMA 17 plate
#
# A face plate standing off the right tower on TWO OPEN RIBS, not a solid boss.
# That is deliberate: the Oldham's motor-hub clamp screw sits inside the standoff
# region, and a solid boss would bury it with no way to tighten it. The open Y
# flanks are how you reach it.
# ----------------------------------------------------------------------------
def x_motor_plate():
    s = rbox(FRAME, 2.0 * MP_HALF_FACE_Y, 2.0 * MP_HALF_FACE_Z,
             (PLATE_X0, -MP_HALF_FACE_Y, XA - MP_HALF_FACE_Z), P["corner_r"], "X")

    # Two ribs back to the tower face, one at each bolt column, running in the
    # X-Z plane so the M5s pass straight down them.
    #
    # They were originally two HORIZONTAL ribs spanning the full width at the two
    # bolt rows. The clash suite caught that immediately: the Oldham's motor hub
    # lives at x 76.7 to 85.7 on the same centreline, radius 9, so both ribs ran
    # straight through the coupler (1374 mm3). Vertical ribs at y +/- 28.5 clear
    # it by 14.7 and leave the whole middle open, which is also how the motor
    # hub's clamp screw gets reached.
    rib_z0 = MP_Z_LO - P["insert_dia"] / 2.0 - 2.0
    rib_h = (MP_Z_HI - MP_Z_LO) + P["insert_dia"] + 4.0
    for sy in (-MP_Y, MP_Y):
        s = s.fuse(Part.makeBox(STANDOFF, FRAME, rib_h,
                                V(XHALF, sy - FRAME / 2.0, rib_z0)))
    s = s.removeSplitter()

    # shaft pilot, sized to pass the Oldham hub, not just the shaft
    s = s.cut(cyl((P["nema17_pilot"] + P["nema17_pilot_clear"]) / 2.0, FRAME + 4.0,
                  (PLATE_X0 - 2.0, 0, XA), (1, 0, 0)))

    # NEMA 17 bolts, slotted +/- 2.0 in Z for build tolerance
    nh = P["nema17_bolt_cc"] / 2.0
    for sy in (-nh, nh):
        for sz in (-nh, nh):
            s = s.cut(xslot(P["nema17_bolt_clear"], P["nema17_slot_travel"],
                            FRAME + 4.0, (sy, XA + sz), PLATE_X0 - 2.0))

    # 4x M5 through-holes into the tower's inserts
    for sy in (-MP_Y, MP_Y):
        for sz in (MP_Z_LO, MP_Z_HI):
            s = s.cut(cyl(P["mp_screw_clear"] / 2.0, STANDOFF + FRAME + 4.0,
                          (XHALF - 2.0, sy, sz), (1, 0, 0)))
    return s


# ----------------------------------------------------------------------------
# fit coupon
# ----------------------------------------------------------------------------
def x_belt_motor_bracket():
    """
    Hangs the X NEMA 17 behind the tower and low, on a belt.

    It bolts to the tower's **+Y face**, not its outboard X face. The motor sits
    at y = 62 and the tower ends at TOWER_Y/2 = 30.4, so there is no face to
    face joint available in X: the first version overlapped the tower by 0.55 mm
    and carried no fixings at all. Rev caught that by eye, and no clash test
    could have, because every one of them asked whether parts COLLIDE and none
    asked whether they are JOINED.

    Three pieces, all printable:
      pad  - lies against the tower's +Y face, takes the four M4s
      web  - runs out in X to reach the motor face
      face - the Y-Z plate the NEMA 17 bolts to, outboard of the tower

    The web sits BESIDE the motor in Y, not over it. X_MOTOR_Y is derived to
    leave exactly the pad thickness plus 1.0 between the tower face and the
    motor body, so the whole y band 30.4 to 39.9 is free at every z. Routing it
    over the top instead would have coupled the bracket to the motor's height,
    and the motor has to sit high enough to clear the frames' hold-down bolt
    heads.
    """
    note("R9 X belt motor bracket")
    t = FRAME
    y_m = TOWER_Y / 2.0
    half = P["nema17_body"] / 2.0
    face_y0 = X_MOTOR_Y - half - P["bracket_edge"]
    face_y1 = X_MOTOR_Y + half + P["bracket_edge"]
    face_z0 = X_MOTOR_Z - half - P["bracket_edge"]

    # motor face, carried up to the tower crown so the web meets it everywhere
    s = Part.makeBox(BRACKET_T, face_y1 - face_y0, TOWER_Z1 - face_z0,
                     V(X_MOTOR_X1, face_y0, face_z0))
    # pad flat on the tower's +Y face, full tower height and thickness
    s = s.fuse(Part.makeBox(TOWER_T, t, TOWER_Z1 - ZF0, V(TOWER_IN, y_m, ZF0)))
    # web out to the face, in the y band the motor does not occupy
    s = s.fuse(Part.makeBox(BRACKET_FACE_X1 - TOWER_IN, t, TOWER_Z1 - face_z0,
                            V(TOWER_IN, y_m, face_z0)))
    s = s.removeSplitter()

    # the four mounting bolts, clearance through the pad
    for bx in R9_MOUNT_X:
        for bz in R9_MOUNT_Z:
            s = s.cut(cyl(P["mp_screw_clear"] / 2.0, t + 4.0,
                          (bx, y_m + t + 2.0, bz), (0, -1, 0)))

    # NEMA 17 pilot and its four bolts
    s = s.cut(cyl((P["nema17_pilot"] + P["nema17_pilot_clear"]) / 2.0,
                  BRACKET_T + 4.0,
                  (X_MOTOR_X1 - 2.0, X_MOTOR_Y, X_MOTOR_Z), (1, 0, 0)))
    nh = P["nema17_bolt_cc"] / 2.0
    for sy in (-nh, nh):
        for sz in (-nh, nh):
            s = s.cut(cyl(P["nema17_bolt_clear"] / 2.0, BRACKET_T + 4.0,
                          (X_MOTOR_X1 - 2.0, X_MOTOR_Y + sy, X_MOTOR_Z + sz),
                          (1, 0, 0)))
    if not LEAN:
        s = fillet_every_edge(s, P["r9_fillet_r"], "R9 bracket")
    return s


def coupon():
    note("fit coupon")
    s = cbox(66.0, 26.0, 14.0, 0.0, 0.0, 3.0)
    for i, d in enumerate((6.80, 7.10, 7.40)):
        s = s.cut(cyl(d / 2.0, P["insert_depth"] + 1.0, (-18.0 + i * 12.0, 8.0, 15.0), (0, 0, -1)))
    s = s.cut(cyl(RAIL_BORE / 2.0, 30.0, (18.0, -1.0, 7.0), (0, 1, 0)))
    s = s.cut(slot(P["foot_slot_w"], P["foot_slot_len"], 20.0, (-18.0, 19.0), -1.0))
    return s


# ----------------------------------------------------------------------------
# R5 fit coupon v2
#
# Print this FIRST. It costs minutes and it decides whether the 5 hour saddle is
# worth starting. The Z rail bore is modelled HORIZONTAL on purpose, in the same
# orientation the saddle prints it: a horizontal printed bore sags at the top,
# and the saddle HANGS on the rails, so the sagging surface is the load surface.
# That is the single most likely reason the big print will not slide.
# ----------------------------------------------------------------------------
def coupon_v2():
    note("fit coupon v2")
    # Sized to be CHEAP, because its whole job is to be the print you do before
    # the 7 hour saddle. At 96 x 30 x 26 solid it measured 1 h 54 m, which defeats
    # the point. 22 mm of bore proves a slide fit as well as 30 does, and the
    # underside relief takes out material no feature uses. The block has to stay
    # 26 tall because the 22.5 brass flange recess sets that.
    L, W, H = 88.0, 22.0, 26.0
    s = rbox(L, W, H, (-L / 2.0, -W / 2.0, 0.0), P["corner_r"], "Z")
    zc = H / 2.0

    # horizontal sliding bores, the way the real parts print them
    s = s.cut(cyl(RAIL_BORE / 2.0, W + 4.0, (-34.0, -W / 2.0 - 2.0, zc), (0, 1, 0)))
    s = s.cut(cyl(XRAIL_BORE / 2.0, W + 4.0, (-12.0, -W / 2.0 - 2.0, zc), (0, 1, 0)))

    # X rail pinch bore, with the set screw insert and its clearance on down to
    # the rail, exactly as the towers do it
    s = s.cut(cyl(XRAIL_GRIP / 2.0, W + 4.0, (8.0, -W / 2.0 - 2.0, zc), (0, 1, 0)))
    s = s.cut(cyl(P["m3_tap"] / 2.0, H + 0.05 - (zc - 1.0),
                  (8.0, 0, H + 0.05), (0, 0, -1)))

    # insert pockets, both sizes
    s = s.cut(cyl(P["m3_insert"] / 2.0, P["m3_insert_depth"],
                  (26.0, -8.0, H + 0.05), (0, 0, -1)))
    s = s.cut(cyl(P["m4_insert"] / 2.0, P["m4_insert_depth"],
                  (26.0, 8.0, H + 0.05), (0, 0, -1)))

    # the brass flange recess and its bolt pattern, so the nut is proved here
    # rather than on a 5 hour print. Flange OD is measured; the 16.0 PCD is not.
    rec_d = P["brass_flange_od"] + P["brass_recess_extra"]
    rec_t = REC_T
    s = s.cut(cyl(rec_d / 2.0, rec_t, (40.0, -W / 2.0 - 0.05, zc), (0, 1, 0)))
    s = s.cut(cyl(NUTBORE / 2.0, W, (40.0, -W / 2.0 + rec_t - 0.05, zc), (0, 1, 0)))
    pcd = P["brass_pcd"] / 2.0
    for ax, az in FLANGE_BOLTS:
        s = s.cut(cyl(FLANGE_FASTENER_D / 2.0, P["m3_insert_depth"],
                      (40.0 + ax * pcd, -W / 2.0 + rec_t - 0.05, zc + az * pcd),
                      (0, 1, 0)))

    # underside relief between the feature columns: no feature uses this material
    for x0, x1 in ((-25.0, -21.0), (-3.0, 1.0), (16.0, 20.0), (30.0, 34.0)):
        s = s.cut(Part.makeBox(x1 - x0, W + 4.0, zc - RAIL_BORE / 2.0 - 2.0,
                               V(x0, -W / 2.0 - 2.0, 0.0)))
    return s

# ----------------------------------------------------------------------------
# R5 bore coupon: the two horizontal precision bores the big coupon cannot carry
#
# The saddle's 688 pocket and Oldham cavity are BOTH horizontal bores that sag at
# the top exactly like the 12.048 rail bore, and both are load bearing in a way
# the rail bore is not: the 16.15 pocket is a press fit AND the thrust shoulder,
# and the 20.0 cavity is what the X stack grew to give the coupler 1.0 mm of
# orbit room. A sagged 20 mm bore eats a good part of that.
#
# Separate from fit_coupon_v2 because it has to be TALL to be representative:
# 0.375 in over a 20.0 bore means a 39 mm block, and making the whole coupon that
# tall would double its print. This one reproduces the right tower exactly:
# pocket, the 2.0 web, then the cavity.
# ----------------------------------------------------------------------------
def coupon_bore():
    note("fit coupon, bores")
    L = PLATE_T + 8.0
    W = PLATE_T + 8.0
    H = CAV_D + 2.0 * FRAME
    zc = H / 2.0
    s = rbox(L, W, H, (-L / 2.0, -W / 2.0, 0.0), P["corner_r"], "Z")
    y_in = -W / 2.0
    s = s.cut(cyl(BPOCK_D / 2.0, BPOCK_H, (0, y_in - 0.05, zc), (0, 1, 0)))
    s = s.cut(cyl(SCREW_BORE / 2.0, W + 4.0, (0, y_in - 2.0, zc), (0, 1, 0)))
    cav0 = y_in + BPOCK_H + P["shoulder_web"]
    s = s.cut(cyl(CAV_D / 2.0, W - (cav0 - y_in) + 0.05, (0, cav0, zc), (0, 1, 0)))
    return s




# ----------------------------------------------------------------------------
# export + verification
# ----------------------------------------------------------------------------
def measure(shape, name):
    bb = shape.BoundBox
    rails = []
    for f in shape.Faces:
        srf = f.Surface
        if isinstance(srf, Part.Cylinder) and abs(srf.Radius - RAIL_BORE / 2.0) < 0.02:
            rails.append(round(srf.Center.x, 3))
    xs = sorted(set(rails))
    bed = P["bed"]
    return {
        "name": name,
        "valid": bool(shape.isValid()),
        "volume_cm3": round(shape.Volume / 1000.0, 1),
        "bbox_mm": [round(bb.XLength, 2), round(bb.YLength, 2), round(bb.ZLength, 2)],
        "bbox_in": [round(bb.XLength / IN, 3), round(bb.YLength / IN, 3), round(bb.ZLength / IN, 3)],
        "rail_bore_dia_mm": round(RAIL_BORE, 3),
        "rail_bore_faces_x": xs,
        "rail_cc_measured_mm": round(max(xs) - min(xs), 3) if len(xs) >= 2 else None,
        "fits_bed": bool(bb.XLength <= bed[0] - 4 and bb.YLength <= bed[1] - 4
                         and bb.ZLength <= bed[2]),
    }


def export(shape, name):
    step = os.path.join(OUT, name + ".step")
    stl = os.path.join(OUT, name + ".stl")
    shape.exportStep(step)
    m = MeshPart.meshFromShape(Shape=shape, LinearDeflection=P["mesh_lin"],
                               AngularDeflection=P["mesh_ang"], Relative=False)
    m.write(stl)
    info = measure(shape, name)
    info.update({
        "facets": m.CountFacets,
        "mesh_solid": bool(m.isSolid()),
        "mesh_self_intersections": bool(m.hasSelfIntersections()),
        "mesh_non_manifolds": bool(m.hasNonManifolds()),
        "stl": os.path.basename(stl),
        "step": os.path.basename(step),
    })
    note("  %-26s valid=%s solid=%s  %s mm  %.1f cm3" %
         (name, info["valid"], info["mesh_solid"], info["bbox_mm"], info["volume_cm3"]))
    return info


def preview(shapes, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    cols = 3
    rows = int(math.ceil(len(shapes) / float(cols)))
    fig = plt.figure(figsize=(5 * cols, 4.4 * rows), facecolor="#1b1b1b")
    for i, (name, shape) in enumerate(shapes, start=1):
        m = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.3,
                                   AngularDeflection=0.5, Relative=False)
        tris = [[tuple(pt) for pt in f.Points] for f in m.Facets]
        ax = fig.add_subplot(rows, cols, i, projection="3d")
        ax.set_facecolor("#1b1b1b")
        ax.add_collection3d(Poly3DCollection(tris, facecolor="#7d8b7a",
                                             edgecolor="#3b463a", linewidth=0.15))
        bb = shape.BoundBox
        span = max(bb.XLength, bb.YLength, bb.ZLength) / 2.0
        ax.set_xlim(bb.Center.x - span, bb.Center.x + span)
        ax.set_ylim(bb.Center.y - span, bb.Center.y + span)
        ax.set_zlim(bb.Center.z - span, bb.Center.z + span)
        try:
            ax.set_box_aspect((1, 1, 1))
        except Exception:
            pass
        ax.view_init(elev=24, azim=-58)
        ax.set_title("%s\n%.0f x %.0f x %.0f mm" % (name, bb.XLength, bb.YLength, bb.ZLength),
                     color="#d8d2c4", fontsize=10)
        ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(path, dpi=110, facecolor="#1b1b1b")
    note("  preview -> %s" % os.path.basename(path))


def travel_math():
    screw = P["screw_len_in"] * IN
    rail = P["rail_len_in"] * IN
    pulley_grip = P["pulley_flange"] + P["pulley_face"] + P["pulley_hub"]
    between = screw - 2.0 * PLATE_T - pulley_grip
    nut = 20.0
    travel = between - nut - 6.0
    outer = between + 2.0 * PLATE_T
    return {
        "leadscrew_mm": round(screw, 1),
        "rail_mm": round(rail, 1),
        "frame_thickness_mm": round(PLATE_T, 1),
        "screw_into_pulley_mm": round(pulley_grip, 1),
        "clear_between_inboard_faces_mm": round(between, 1),
        "assumed_nut_flange_mm": nut,
        "usable_travel_mm": round(travel, 1),
        "usable_travel_in": round(travel / IN, 2),
        "outer_face_to_outer_face_mm": round(outer, 1),
        "rail_overhang_total_mm": round(rail - outer, 1),
        "rail_overhang_tail_max_mm": round(BRACKET_Y0 - PLATE_T - 1.0, 1),
    }


def r5_geometry():
    return {
        "x_rail_dia_mm": round(XRAIL_D, 3),
        "x_rail_bore_sliding_mm": round(XRAIL_BORE, 3),
        "x_rail_bore_pinch_mm": round(XRAIL_GRIP, 3),
        "x_rail_spacing_mm": round(2.0 * XRAIL_Y, 1),
        "saddle_bottom_mm": round(SADDLE_Z0, 3),
        "saddle_top_mm": round(SADDLE_Z1, 3),
        "saddle_len_mm": round(SADDLE_Y, 2),
        "x_axis_plane_mm": round(XA, 3),
        "governing_bore_mm": round(2.0 * GOVERN_R, 2),
        "top_slide_underside_mm": round(TS_Z0, 3),
        "tool_platform_face_mm": round(TS_Z1, 3),
        "tower_crown_mm": round(TOWER_Z1, 3),
        "tower_and_top_slide_y_mm": round(TOWER_Y, 3),
        "clear_span_between_towers_mm": round(XSPAN, 1),
        "x_screw_cut_mm": XSCREW_CUT,
        "x_rail_cut_mm": round(XRAIL_CUT, 1),
        "x_screw_dia_mm": round(XSCREW_D, 3),
        "saddle_taper_x_mm": round(TAPER_X, 3),
        "tower_base_mm": round(ZF0, 3),
        "oldham_outer_end_mm": round(HUB2_1, 3),
        "motor_plate_inner_face_mm": round(PLATE_X0, 3),
        "standoff_mm": round(STANDOFF, 3),
        "wrench_hole_x_mm": round(WRENCH_X, 2),
        "overall_width_with_motor_mm": round(R5_WIDTH, 1),
        "x_travel_mm": round(X_TRAVEL, 1),
        "x_travel_in": round(X_TRAVEL / IN, 2),
        "z_travel_mm": round(Z_TRAVEL, 1),
        "z_travel_in": round(Z_TRAVEL / IN, 2),
    }


def r6_carrier():
    """Every number on the tailstock carrier that someone would otherwise have to
    re-derive, plus the three walls that are thinner than the 0.375 rule."""
    nut_half = P["tsc_clamp_nut_af"] / 2.0          # flats face X
    bore_edge = RAIL_X - RAIL_BORE / 2.0
    ts_x = P["tsc_bolt_cc"] / 2.0
    d = {
        "len_along_bed_mm": round(TSC_T, 3),
        "width_mm": round(BODY_W, 3),
        "top_mm": round(TSC_Z1, 3),
        "bottom_mm": round(TSC_Z0, 3),
        "height_mm": round(TSC_Z1 - TSC_Z0, 3),
        "floats_above_table_mm": round(TSC_Z0, 3),
        "rail_top_mm": round(ZA + RAIL_D / 2.0, 3),
        "screw_bore_mm": round(SCREW_BORE, 3),
        "web_over_screw_bore_mm": round(TSC_Z1 - (ZA + SCREW_BORE / 2.0), 3),
        "web_under_screw_bore_mm": round((ZA - SCREW_BORE / 2.0) - TSC_Z0, 3),
        "collar_cbore": [round(TSC_CBORE_D, 2), round(TSC_CBORE_L, 2)] if P["tsc_collar_cbore"] else None,
        "collar_cbore_recovers_mm": round(COLLAR_STACK, 2) if P["tsc_collar_cbore"] else 0.0,
        "web_over_collar_cbore_mm": round(TSC_Z1 - (ZA + TSC_CBORE_D / 2.0), 3) if P["tsc_collar_cbore"] else None,
        "clamp_screw_x_mm": round(TSC_CLAMP_X, 3),
        "jaw_thickness_mm": round((TSC_Z1 - TSC_Z0) / 2.0 - P["pinch_slit"] / 2.0, 3),
        "flexure_over_bore_mm": round(TSC_Z1 - (ZA + RAIL_BORE / 2.0), 3),
        "nut_pocket_wall_to_bore_mm": round((TSC_CLAMP_X - nut_half) - (RAIL_X + RAIL_BORE / 2.0), 3),
        "nut_pocket_wall_to_face_mm": round(BODY_W / 2.0 - (TSC_CLAMP_X + nut_half), 3),
        "material_under_nut_pocket_mm": round((ZA - P["pinch_slit"] / 2.0) - (TSC_Z0 + P["tsc_clamp_nut_t"]), 3),
        "ts_bolt_x_mm": round(ts_x, 3),
        "ts_bolt_cc_mm": P["tsc_bolt_cc"],
        "ts_bolt_cc_measured_mm": 44.653,
        "ts_insert_to_collar_cbore_mm": round(ts_x - P["tsc_insert_dia"] / 2.0 - TSC_CBORE_D / 2.0, 3),
        "ts_insert_to_rail_bore_mm": round(bore_edge - (ts_x + P["tsc_insert_dia"] / 2.0), 3),
        "ts_insert_floor_mm": round((TSC_Z1 - P["tsc_insert_depth"]) - TSC_Z0, 3),
        "clears_saddle_tower_base_by_mm": round(ZF0 - TSC_Z1, 3),
    }
    # The counterbore recovers COLLAR_STACK (10.6), NOT TSC_CBORE_L (12.6): the
    # 2.0 in the counterbore depth is clearance around the collar, and Z_TRAVEL's
    # own 2.0 margin still has to sit between the saddle face and the carrier
    # face. Caught by the assembly limits, which gave 69.4 against a 71.4 written
    # here first. Do not "simplify" this back.
    tr = Z_TRAVEL - (TSC_T - COLLAR_STACK if P["tsc_collar_cbore"] else TSC_T)
    d["z_travel_with_carrier_mm"] = round(tr, 1)
    d["z_travel_with_carrier_in"] = round(tr / IN, 2)
    d["z_travel_cost_mm"] = round(Z_TRAVEL - tr, 1)
    return d


def r9_geometry():
    """Every R9 number, so the variant has a record that is not a chat message."""
    tr = Z_TRAVEL - (TSC_T - COLLAR_STACK if P["tsc_collar_cbore"] else TSC_T)
    return {
        "half_width_mm": round(XHALF, 3),
        "part_width_mm": round(2.0 * XHALF, 3),
        "x_rail_cut_mm": round(XRAIL_CUT, 1),
        # from the real belt plane, not from a pulley butted against the tower
        "x_screw_cut_mm": int(math.ceil(
            (XHALF + COLLAR_STACK + 0.6) + X_PUL_SCREW_END + 2.0)),
        "belt_plane_tooth_x_mm": [round(X_PUL_T0, 2), round(X_PUL_T1, 2)],
        "motor_pulley_shaft_spare_mm": round(X_MOTOR_SHAFT_TIP - X_PUL_MOTOR_END, 3),
        "motor_over_hold_down_heads_mm": round(
            (X_MOTOR_Z - P["nema17_body"] / 2.0)
            - (FRAME + P["r9_hold_down_head"]), 3),
        "motor_to_frame_body_x_mm": round(X_MOTOR_X0 - BODY_W / 2.0, 3),
        "x_travel_mm": round(X_TRAVEL, 1),
        "z_travel_bare_mm": round(Z_TRAVEL, 1),
        "z_travel_with_carrier_mm": round(tr, 1),
        "x_axis_plane_mm": round(XA, 3),
        "tower_crown_mm": round(TOWER_Z1, 3),
        "tool_platform_face_mm": round(TS_Z1, 3),
        "channel_width_mm": round(SADDLE_Y, 3),
        "tower_width_mm": round(TOWER_Y, 3),
        "tower_overhang_mm": round((TOWER_Y - SADDLE_Y) / 2.0, 6),
        "channel_flange_t_mm": P["r9_flange_t"],
        "channel_web_t_mm": round(XW, 3),
        "cantilever_each_side_mm": round(XHALF - RAIL_X, 3),
        "belt_len_mm": P["r9_belt_len"],
        "belt_centres_mm": round(X_BELT_CENTRES, 3),
        "motor_axis_y_mm": round(X_MOTOR_Y, 3),
        "motor_axis_z_mm": round(X_MOTOR_Z, 3),
        "motor_body_x_mm": [round(X_MOTOR_X0, 1), round(X_MOTOR_X1, 1)],
        "motor_over_foot_pads_mm": round(
            (X_MOTOR_Z - P["nema17_body"] / 2.0) - FRAME, 3),
        "assembly_width_with_screw_mm": round(
            (XHALF + COLLAR_STACK + 0.6) + X_PUL_SCREW_END + 2.0, 1),
    }


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    parts = [
        ("headstock_frame", headstock()),
        ("tailstock_frame_belt", tailstock()),
        ("rail_clamp_cap_x4", rail_cap()),
        ("tailstock_carrier", tailstock_carrier()),
        ("pulley_30t_screw_bore8", pulley(P["pulley_bore_screw"], "leadscrew")),
        ("pulley_30t_motor_bore5" if P["long_x"] else "pulley_30t_motor_bore6_35",
         pulley(P["nema17_shaft"] + P["r9_pulley_bore_fit"] if P["long_x"]
                else P["pulley_bore_motor"], "motor",
                P["r9_motor_pulley_hub"] if P["long_x"] else None)),
        ("thrust_washer_x2", thrust_washer()),
        ("fit_coupon", coupon()),
        ("cross_slide_saddle", cross_slide_saddle()),
        ("cross_slide_top_plate", cross_slide_top_plate()),
        (("x_belt_motor_bracket", x_belt_motor_bracket()) if P["long_x"]
         else ("x_motor_plate", x_motor_plate())),
        ("fit_coupon_v2", coupon_v2()),
        ("fit_coupon_bore", coupon_bore()),
    ]
    report = {
        "parts": [],
        "params": P,
        "derived": {
            "frame_min_mm": round(FRAME, 3),
            "rail_bore_mm": round(RAIL_BORE, 3),
            "rail_cc_mm": round(RAIL_CC, 2),
            "axis_height_mm": round(ZA, 2),
            "top_z_mm": round(TOP_Z, 2),
            "cap_thickness_mm": round(CAP_T, 2),
            "frame_thickness_mm": round(PLATE_T, 2),
            "body_w_mm": round(BODY_W, 2),
            "cap_w_mm": round(CAP_W, 2),
            "tower_r_mm": round(TOWER_R, 2),
            "overall_width_mm": round(2 * (FOOT_X + P["foot_pad_r"]), 2),
            "bearing_pocket_mm": [round(BPOCK_D, 2), round(BPOCK_H, 2)],
            "cap_screw_len_mm": CAP_SCREW_LEN,
            "cap_screw_thread_into_insert_mm": round(CAP_SCREW_LEN - CAP_T - P["cap_relief"], 2),
            "pulley_pitch_dia_mm": round(PULLEY_PD, 2),
            "pulley_tip_dia_mm": round(2 * PULLEY_R, 2),
            "belt_centres_mm": round(CENTRES, 2),
            "motor_offset_x_mm": round(MOTOR_DX, 2),
            "motor_shaft_z_mm": round(MOTOR_Z, 2),
            "motor_body_above_table_mm": round(MOTOR_Z - P["motor_body"] / 2.0, 2),
            "assembly_top_mm": round(MOTOR_Z + P["motor_body"] / 2.0, 2),
        },
        "travel": travel_math(),
        "r5": r5_geometry(),
        "r6": r6_carrier(),
        "r9": r9_geometry() if P["long_x"] else None,
    }
    for name, shape in parts:
        report["parts"].append(export(shape, name))
    preview(parts, os.path.join(OUT, "preview.png"))
    report["log"] = LOG
    with open(os.path.join(OUT, "build_report.json"), "w") as fh:
        json.dump(report, fh, indent=2)
    note("travel: %s" % json.dumps(report["travel"]))
    bad = [p["name"] for p in report["parts"]
           if not (p["valid"] and p["mesh_solid"] and not p["mesh_self_intersections"]
                   and not p["mesh_non_manifolds"] and p["fits_bed"])]
    note("FAILED: %s" % bad if bad else "all parts valid, closed, and inside the bed")


main()
