# SPDX-License-Identifier: GPL-3.0-or-later
# REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
# Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
"""
Build the R9 variant: long X, belt drive, channel section.

Separate entry point because R9 is a VARIANT. Running build_axis_bases.py must
keep producing the R8 parts Rev may still print, so R9 parts land under their
own names with an _r9 suffix and their own report.

  "C:/Program Files/FreeCAD 1.1/bin/FreeCADCmd.exe" build_r9.py
"""
import os
import json

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "build_axis_bases.py")).read().replace("\nmain()\n", "\n")
g = {"__name__": "buildmod", "__file__": os.path.join(HERE, "build_axis_bases.py"),
     "P_OVERRIDE": {"long_x": True}}
exec(compile(src, "build_axis_bases.py", "exec"), g)

OUT = os.path.join(HERE, "out")
if not os.path.isdir(OUT):
    os.makedirs(OUT)

parts = [
    ("cross_slide_saddle_r9", g["cross_slide_saddle"]()),
    ("cross_slide_top_plate_r9", g["cross_slide_top_plate"]()),
    ("x_belt_motor_bracket_r9", g["x_belt_motor_bracket"]()),
    ("pulley_30t_motor_bore5_r9",
     g["pulley"](g["P"]["nema17_shaft"] + g["P"]["r9_pulley_bore_fit"], "motor",
                 g["P"]["r9_motor_pulley_hub"])),
]
rows = [g["export"](shape, name) for name, shape in parts]
report = {"parts": rows, "r9": g["r9_geometry"]()}
with open(os.path.join(OUT, "build_report_r9.json"), "w") as fh:
    json.dump(report, fh, indent=1)

print(json.dumps(report["r9"], indent=1))
bad = [r for r in rows if not (r["valid"] and r["mesh_solid"]
                               and not r["mesh_self_intersections"]
                               and not r["mesh_non_manifolds"] and r["fits_bed"])]
print("R9: all parts valid, closed, and inside the bed" if not bad
      else "R9 PROBLEM: %s" % [r["name"] for r in bad])
