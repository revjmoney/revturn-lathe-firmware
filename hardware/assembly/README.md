# REVTURN lathe: FreeCAD assembly + live animation

## Files
- `REVTURN_lathe_assembly.FCStd`: the whole lathe, every part a named object, coloured
  (orange printed, grey hardware, dark motors, translucent blue stand-ins). `.step` is the same for other CAD.
- `REVTURN_animate.FCMacro`: plays a g-code program on the model, live in FreeCAD's 3D view.
- `revturn_gcode_sim.py`: the g-code reader the macro uses (also runs alone: `python revturn_gcode_sim.py program.nc`).
- `animation.json`: which parts move with which axis, the model's travel and the colours. Written by the build.
- `REVTURN_lathe_assembly_views.png`: four views.

## Animate
1. Open FreeCAD 1.1.
2. Macro > Macros... > set the macro folder to this folder (or use the "..." button to browse here),
   pick `REVTURN_animate.FCMacro`, Execute.
3. It opens the assembly and a small panel. Smoke test 4 is loaded already; **Open program...** takes any `.nc`,
   `.gcode` or a lathe-screen `.json` program.
4. **Play / Pause**, **Reset**, **Speed** (0.25x to 30x), and drag the slider to scrub. Orbit and zoom the 3D view
   while it runs. Closing the panel puts every part back.

What moves: Z = the saddle and everything on it along the bed; X = the top slide (X words are diameters, G7);
C = the chuck (C words index it; M3 / M4 with S spin it). The panel shows X, Z, C, the spindle, the time and the
program line being run.

Stock: the panel's **Stock** box shows the bar in the chuck (diameter, stickout, length) and turns with C.
**Auto from program** reads a lathe-screen program's stock entry or a `(STOCK DIA 1.25 LEN 3 STICKOUT 2)` comment;
with neither it estimates from the cuts (biggest turned diameter + 1/16", deepest Z + 1/4"). Type sizes in and
**Apply** to override. The program's X0 Z0 is the stock's centre and face.

The model (Rev 2026-11-10):
- Real travel: X 3.9" (7.8" on diameter), Z 5.0". The bed is lengthened so the model has the full 5".
- Headstock: Rev's AliExpress spindle unit, independent of the bed: flat base plate on the plywood, legs, the
  spindle head, 3" chuck, centreline 5" above the plywood top. Extra-long NEMA 23 drive, 20T:120T belt.
- Z drive: a big GT2 pulley on the outboard end of the Z screw, belt running toward the back to a standard
  NEMA 17 on its own mount on the plywood. The tailstock frame's own belt motor mount is cut off, as on the lathe.
- Tool: a stand-in post on the top slide lifts the tool tip (red) to centre height. A real tool post is being designed.
- 0.75" plywood base with 0.75" risers under each rail base; real metal shaft collars on one end of each axis.

Limits of the model:
- Times ignore acceleration, so they run a little short. Arcs (G2 / G3) are drawn as straight lines.
- The headstock, chuck, NEMA 23 drive, tool post and the Z motor mount are stand-ins: right size, simple shape.

## Rebuild
`F:\micro-lathe\cad\lathe-assembly\build_lathe_assembly.py` (run with FreeCAD's `bin\python.exe`) rebuilds the model,
`animation.json` and runs a collision check of the real parts; `render_views.py` redraws the views.
