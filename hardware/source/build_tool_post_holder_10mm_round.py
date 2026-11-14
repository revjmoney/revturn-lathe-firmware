"""
v2: simple 10 mm round-bar holder for Jason's micro-lathe tool post.
- Height adjustment = sliding the holder on the post dovetail (no top stop/tab, longer M4 bolt slots).
- Bar in a fixed 10.25 mm slot, two M4 clamp screws from the top into heat-set inserts.
Frame = the original holder's 3MF mesh frame (Z up, -Y = front face, +Y = post side), holder at MID travel.
Post (flipped in use) in this frame: male dovetail Z -29.395..5.395, M4 inserts at X -27/+3, Z -11; swivel ring top Z -29.395.
Run: python holder_10mm_round_v2.py [outdir]
"""
import sys
import cadquery as cq

# ---------------- mounting interface copied from the original (verified vs mesh to <0.05 mm)
BODY_X = (-32.0, 32.0)
BODY_Y = (-19.6125, 6.8125)
DT_CX = -12.0
DT_PROFILE = [(8.80, 1.8125), (8.29, 3.11), (6.94, 6.49), (6.82, 6.8125)]  # half-width vs Y
BOLT_X = (-27.0, 3.0)
BOLT_Z_MID = -11.0          # post insert height in holder frame at mid travel
BOLT_SLOT_R = 2.25          # 4.5 wide (M4 clearance), same as original
BOLT_CB_R = 4.2             # 8.4 wide head pocket, same as original
BOLT_CB_BACK_Y = -2.89      # head seat, same as original

# ---------------- post / machine (measured from the plate, holder frame at mid travel)
POST_DT_Z = (-29.395, 5.395)   # male dovetail = full post block height (34.79 mm)
RING_TOP_Z = -29.395           # swivel ring top (post block sits on it)
RING_BOTTOM_Z = -37.395        # cross-slide top if the ring sits flat on it

# ---------------- v2 parameters
BAR_D = 10.0
BAR_CLEAR = 10.25          # slot width = print clearance
TIP_Z = 5.35               # bar centreline at mid travel (same as v1 / original bit cutting edge)
BAR_Y = -12.2              # 2.29 mm front wall; bar slot back clears M4 SHCS heads
TRAVEL = 6.6               # slot travel each way (>= 6.35 = 1/4")
SLOT_WALL = 2.0            # plastic under the lowest end of the 4.5 mm bolt slot
TOP_Z = 20.0               # body top
CLAMP_X = (13.08, 26.07)   # same X as the original clamp screws
M4_CLEAR_D = 4.5
M4_INSERT_D = 5.84         # same insert bore as the original
INSERT_DEPTH = 8.5         # same as the original

BODY_BOT_Z = BOLT_Z_MID - TRAVEL - BOLT_SLOT_R - SLOT_WALL
BAR_FLOOR_Z = TIP_Z - BAR_D / 2
BAR_TOP_Z = BAR_FLOOR_Z + BAR_CLEAR

def box(x, y, z):
    return cq.Workplane("XY").box(x[1]-x[0], y[1]-y[0], z[1]-z[0], centered=False).translate((x[0], y[0], z[0]))

def stadium_xz(x, zc0, zc1, r, y0, y1):
    return (cq.Workplane("XZ", origin=(0, y1, 0)).center(x, (zc0 + zc1) / 2)
            .slot2D(zc1 - zc0 + 2 * r, 2 * r, angle=90).extrude(y1 - y0))

def dovetail(z0, z1):
    right = [(DT_CX + hw, y) for hw, y in DT_PROFILE]
    left = [(DT_CX - hw, y) for hw, y in reversed(DT_PROFILE)]
    hw = DT_PROFILE[-1][0]
    poly = right + [(DT_CX + hw, BODY_Y[1] + 0.5), (DT_CX - hw, BODY_Y[1] + 0.5)] + left
    return cq.Workplane("XY", origin=(0, 0, z0)).polyline(poly).close().extrude(z1 - z0)

def holder_v2():
    Z = (BODY_BOT_Z, TOP_Z)
    b = box(BODY_X, BODY_Y, Z)
    b = b.cut(dovetail(Z[0] - 0.5, Z[1] + 0.5))            # open full height: no top stop
    zc0, zc1 = BOLT_Z_MID - TRAVEL, BOLT_Z_MID + TRAVEL
    r = BAR_CLEAR / 2
    for x in BOLT_X:
        b = b.cut(stadium_xz(x, zc0, zc1, BOLT_SLOT_R, BOLT_CB_BACK_Y - 0.01, BODY_Y[1] + 0.5))
        # head pocket: open through the bottom face (no sliver under it) and squared up into the bar slot
        b = b.cut(stadium_xz(x, zc0 - 10, zc1, BOLT_CB_R, BODY_Y[0] - 0.5, BOLT_CB_BACK_Y))
        b = b.cut(box((x - BOLT_CB_R, x + BOLT_CB_R), (BODY_Y[0] - 0.5, BAR_Y + r), (zc1, BAR_FLOOR_Z + 0.01)))
    # remove the 0.8 mm end fin left in front of the left head pocket (x -32..-31.2) - it would be free-hanging
    b = b.cut(box((BODY_X[0] - 0.5, BOLT_X[0] - BOLT_CB_R), (BODY_Y[0] - 0.5, BOLT_CB_BACK_Y), (Z[0] - 0.5, BAR_FLOOR_Z + 0.01)))
    # bar slot: flat floor (bar seats on it, centre = TIP_Z), round crown
    b = b.cut(cq.Workplane("YZ", origin=(BODY_X[0] - 1, 0, 0))
              .moveTo(BAR_Y - r, BAR_FLOOR_Z).lineTo(BAR_Y + r, BAR_FLOOR_Z).lineTo(BAR_Y + r, BAR_TOP_Z - r)
              .threePointArc((BAR_Y, BAR_TOP_Z), (BAR_Y - r, BAR_TOP_Z - r)).close()
              .extrude(BODY_X[1] - BODY_X[0] + 2))
    for x in CLAMP_X:
        b = b.cut(cq.Workplane("XY", origin=(x, BAR_Y, TOP_Z - INSERT_DEPTH)).circle(M4_INSERT_D / 2).extrude(INSERT_DEPTH + 1))
        b = b.cut(cq.Workplane("XY", origin=(x, BAR_Y, BAR_TOP_Z - r)).circle(M4_CLEAR_D / 2).extrude(TOP_Z - BAR_TOP_Z + r))
    return b

def travel_report():
    up_slot = down_slot = TRAVEL
    down_ring = BODY_BOT_Z - RING_TOP_Z
    down = min(down_slot, down_ring)
    eng = lambda s: min(TOP_Z + s, POST_DT_Z[1]) - max(BODY_BOT_Z + s, POST_DT_Z[0])
    return dict(body_z=(BODY_BOT_Z, TOP_Z), height=TOP_Z - BODY_BOT_Z, bar_floor=BAR_FLOOR_Z, bar_top=BAR_TOP_Z,
                top_wall_over_crown=TOP_Z - BAR_TOP_Z, up=up_slot, down=down, down_ring_limit=down_ring,
                down_crossslide_limit=BODY_BOT_Z - RING_BOTTOM_Z,
                eng_mid=eng(0), eng_full_up=eng(up_slot), eng_full_down=eng(-down),
                eng_at_quarter_up=eng(6.35), eng_at_quarter_down=eng(-6.35),
                ring_clear_at_quarter_down=BODY_BOT_Z - 6.35 - RING_TOP_Z,
                tip_mid=TIP_Z, front_wall=BAR_Y - BAR_CLEAR / 2 - BODY_Y[0])

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for k, v in travel_report().items(): print(k, v if not isinstance(v, float) else round(v, 3))
    h = holder_v2()
    cq.exporters.export(h, f"{out}/tool_post_holder_10mm_round_v2_PRINT.stl", tolerance=0.01, angularTolerance=0.1)
    cq.exporters.export(h, f"{out}/tool_post_holder_10mm_round_v2.step")
    print("ok")
