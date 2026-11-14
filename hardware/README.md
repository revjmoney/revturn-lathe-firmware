# REVTURN printed parts

The 3D-printed axis parts on the REVTURN lathe, designed from scratch in FreeCAD by Rev. J. Money and
printed on an Ender 3 Pro. Every part ships as **STL** (to print) and **STEP** (to modify in any CAD).
Machining parts on a rotary axis instead? See **[RotatoCAM](https://rotatocam.com)**, 4- and 3-axis CAM for DIY CNC.

> **⚠ Built around parts that were laying around, so adapt before you print.**
> - **The rails:** salvaged from a 3018 CNC upgrade and a scrapped 3D printer. The bores are sized to those exact bars:
>   0.470 in for Z, 9.982 mm for X.
> - **The headstock:** an AliExpress unit.
> - **The motors:** a Cricut stepper and a StepperOnline NEMA 17.
>
> Bores, rail centres, motor patterns, belt lengths and pulley bores are all sized to those parts.
> **Use the STEP files** to change them for what you have, and print a small fit test of any bore in your filament
> before committing to the 8-hour saddle.

☕ Printing these? **[Buy me a coffee](https://buymeacoffee.com/revjmoney)** and help keep the designs coming.

Two families are on the machine:
- **The bed ends (R4):** a headstock-end frame and a tailstock-end frame that clamp two round rails and carry
  the Z leadscrew. On this lathe Z is driven by a big GT2 pulley on the outboard end of the screw, belted toward the
  back of the lathe to a NEMA 17 on its own mount (the frame's belt motor mount is sawn off).
- **The cross slide (R9, "long X"):** a saddle that rides the Z rails and carries its own X rails and leadscrew,
  a top plate that rides X, and an **inline X motor mount**: the NEMA 17 sits in line with the X screw, 1:1 through a
  coupler, on split clamps that grip the X rail ends. (The original R9 belt-drive bracket is still here as an option.)

A **tool post** rides on the top plate: a swivel post (stops at 0, 45 and 90 degrees) with height-adjustable,
swap-on holders. See [Tool post](#tool-post) below. The whole lathe is also a FreeCAD assembly you can animate with
your own programs: see [Assembly and animation](#assembly-and-animation).

There is also an **option for X: direct drive (R8)**, with the motor in line with the X screw on a 1:1 Oldham
coupler instead of a belt. See [Option: direct-drive X](#option-direct-drive-x-r8-11-coupler) below.

## Parts

| File | Qty | What it is | Size (mm) | Print time* |
|---|---|---|---|---|
| `headstock_frame` | 1 | Chuck-end frame: clamps both rails, 688 bearing for the Z screw | 158 x 25 x 41 | see set total |
| `tailstock_frame_belt` | 1 | Tail-end frame: rail clamps, Z screw bearings + thrust, belt motor mount behind (**sawn off on this lathe**, see below) | 158 x 63 x 62 | see set total |
| `rail_clamp_cap_x4` | 4 | Bolt-down caps that clamp the rails (two M5 each) | 34 x 25 x 15 | see set total |
| `cross_slide_saddle_r9` | 1 | Saddle on the Z rails: brass nut mount, X rail lands, both X towers | 200 wide | 8 h 00 |
| `cross_slide_top_plate_r9` | 1 | Rides the X rails, tool platform grid on top | 45 x 61 x 24 | 2 h 11 |
| `x_motor_inline_rail_mount_no_side_tie_r9` | 1 | **On the lathe.** NEMA 17 in line with the X screw, 1:1 through an Ender 3 Pro Z coupler (5 to 8 mm). Held by two split clamp collars on the X rail ends (M3 pinch screws) and a rail extension web; nothing bolts to the tower | 54 x 70 x 38 | |
| `x_motor_inline_rail_mount_r9` | 1 | *Option:* the same mount plus a side flange that bolts to the tower's four M4 side holes for extra hold | 54 x 70 x 57 | |
| `x_belt_motor_bracket_r9` | 1 | *Option:* the original R9 belt drive, NEMA 17 on the tower's back face, same four M4 holes | | 1 h 25 |
| `pulley_30t_motor_bore5_r9` | 1 | *Option, belt drive only:* GT2 30T, 5 mm bore, short hub (X motor) | 23 dia | 21 min |
| `pulley_30t_screw_bore8` | 1+ | GT2 30T, 8 mm bore (leadscrew) | 23 dia | |
| `thrust_washer_x2` | 2 per screw | 11.4 mm washer between shaft collar and bearing inner race | 11 dia x 2 | 4 min (pair) |

| `tool_post_*` | | The tool post: see [Tool post](#tool-post) | | |

\*Measured in PrusaSlicer on the build printer's own profile with a 0.4 nozzle. The bed-end set (both frames, four
caps, two pulleys, washers) is **10 h 35** together. A 0.6 nozzle roughly halves the big parts.

Dimensioned drawings: [`drawings/drawings_bases.png`](drawings/drawings_bases.png) (bed ends, caps) and
[`drawings/drawings_r9.png`](drawings/drawings_r9.png) (R9 saddle and X motor bracket).

## Key dimensions
- **Z rails:** two 0.470 in (11.94 mm) round bars, slid through both frames and clamped by the caps. Axis
  height 1.000 in above the bed, rail centres 3.25 in.
- **X rails (R9):** 9.982 mm bars on 38.0 mm centres, cut to **198.8 mm**.
- **Travel:** X 104.3 mm. Z about 74 mm with the R9 saddle.
- **Leadscrews:** 8 mm (T8) with brass flange nuts on both axes. X screw cut to **245 mm**. The anti-backlash
  nuts do not fit under the 1.000 in axis; use the plain brass nuts.

## Hardware (as designed)
| Item | Qty | Notes |
|---|---|---|
| 0.470 in round bar, 11.5 in | 2 | Z rails |
| 10 mm (9.982) round bar, 198.8 mm | 2 | X rails (R9) |
| 8 mm T8 leadscrew + brass flange nut | 2 | Z and X; X cut to 245 mm |
| 688ZZ bearing (8 x 16 x 5) | 4+ | screw supports (16.15 mm press pockets) |
| 8 mm shaft collar | 2 per screw | with the printed thrust washers, takes the axial load |
| Ender 3 Pro style Z coupler, 5 mm to 8 mm, about 25 mm long | 1 | X, inline mount (fits inside a 20 mm envelope) |
| M3 x 20 mm screws + M3 nuts | 4 | inline mount pinch screws (nuts captive underneath) |
| GT2 6 mm closed-loop belt | 1 | Z; X only with the belt bracket option: **186 mm** loop, 30T:30T, centres 63.0 mm |
| M5 heat-set inserts + M5 x 25 cap screws | 8 | rail clamp caps |
| M4 x 16 mm screws (tapped) + thin washers | 4 | X motor mount (inline or belt) to the saddle tower |
| M3 screws (tapped) | 4 per nut | brass nut flanges; tap the threads, don't drive screws into bare PLA |
| NEMA 17 stepper | 1 | X |
| 1/4 in bolts + washers | 10 | frame feet to the bench (slotted pads) |

**As built on this lathe:** the belt motor mount on `tailstock_frame_belt` was **hacksawed off** and the Z motor sits
on a separate off-the-shelf NEMA 17 mount (not part of these files), with its own pulleys. So the lathe as built
uses its own Z belt ratio. Use the measured steps per mm from the
[settings table](../README.md#machine-settings-calibrated-on-the-real-lathe), not the 1:1 design ratio.

## About the inline X mount

Drawings: [`drawings/x_motor_inline_rail_mount_both_options.png`](drawings/x_motor_inline_rail_mount_both_options.png) (both versions) and
[`drawings/x_motor_inline_rail_mount_r9.png`](drawings/x_motor_inline_rail_mount_r9.png). The flange was not needed on this lathe (the rail clamps
hold it), so the version without it is the one in use. Fit notes, in inches:
- Rails 0.393 in on 1.496 in centres; keep both about 1.181 in beyond the tower (shorten the long one to match).
- Bores 0.397 in nominal; collar length 1.093 in; motor plate 1.250 in beyond the tower.
- Coupler envelope 0.787 in diameter, about 0.984 in long.
- Print motor face down with build-plate supports; clean the clamp slits fully so the jaws close. Tighten the pinch
  screws only enough to grip; do not crush the jaws. The screw's own bearings and collars still take the thrust.
- Many NEMA 17s have a 0.200 in D-shaft, not 5 mm: shim it inside the coupler (a few wraps of paper worked here).

## Option: direct-drive X (R8, 1:1 coupler)

Prefer no belt on X? The R8 cross slide drives the X screw straight from the motor through a **recessed Oldham
coupler**, 1:1. It is a matched set: the R8 motor plate only fits the R8 saddle, so print all three instead of the
three R9 cross-slide parts. The bed ends, rail caps and thrust washers are the same for both.

| File | Qty | What it is | Size (mm) | Print time* |
|---|---|---|---|---|
| `cross_slide_saddle_r8_direct` | 1 | Saddle on the Z rails: brass nut mount, X rail lands, both X towers, Oldham cavity on the screw line | 158 x 61 x 60 | 6 h 54 |
| `cross_slide_top_plate_r8_direct` | 1 | Rides the X rails, tool platform grid on top | 45 x 61 x 24 | 2 h 21 |
| `x_motor_plate_r8_direct` | 1 | NEMA 17 plate on the tower, motor in line with the X screw | 22 x 65 x 52 | 1 h 33 |

Drawing: [`drawings/drawings_r8_direct.png`](drawings/drawings_r8_direct.png).

**R8 against R9:**
- **X travel:** 49.2 mm (1.94 in) on R8, against 104.3 mm on R9. R8 is the short cross slide.
- **Z travel:** 84.2 mm with the R8 saddle, against about 74 mm with R9.
- **Drive:** R8 is 1:1 through the coupler, so X stays at 400 steps per mm at 16x microstepping on a 2 mm lead
  screw, same as the R9 30T:30T belt. No belt or pulleys to buy or tension.

**Extra hardware for R8 (instead of the R9 belt parts):**

| Item | Qty | Notes |
|---|---|---|
| Oldham coupler, D18 x L25, 5 mm to 8 mm | 1 | sits recessed in the saddle; a rigid coupler binds here (see below) |
| 10 mm (9.982) round bar, 156.4 mm | 2 | X rails (R8) |
| 8 mm T8 leadscrew, 160 mm | 1 | X screw (R8) |
| M4 screws | 4 | motor plate to the saddle tower (tapped 3.3 mm holes, 11 mm deep) |
| M3 screws | 4 | NEMA 17 to the motor plate |

**Use the Oldham, not a rigid coupler.** The screw is held axially at the saddle end and the motor is bolted at the
other, so a rigid coupler turns any printed misalignment into a cyclic side load on the motor bearings, which you
will not notice until it binds. The plate's ribs sit at the sides so the coupler's hub screw stays reachable.

## Tool post

A temporary, all-printed tool post for the R9 top plate. It puts the tool on the spindle centreline (this lathe:
spindle 5 in above the plywood base, 1.68 in above the top plate), adjusts +/- 4 mm in height, and swivels.

| File | What it is |
|---|---|
| `tool_post_swivel_ring` | Bolts to the top plate (4 x M4 x 10 into heat-set inserts in the plate's M4 holes); pocket the post turns in |
| `tool_post_base` | The post: 26 mm round foot with V notches every 45 deg, column, dovetail. **STL prints upside down** on the column top |
| `tool_post_holder_turning` | 10.5 x 14 mm channel: 1/4 in HSS, or round drill-bit tools in the V shim |
| `tool_post_holder_quarter_inch_solid` | Solid holder for 1/4 in square tools only: snug channel, tool sticks out 8 mm, clamp screws 14 and 27 mm behind the tip |
| `tool_post_holder_boring` | 10.2 mm bore along the tool direction: 3/8 in / 10 mm boring bar or drill chuck shank |
| `tool_post_v_shim_round_bits` | V strip for round bits 1/8 to 3/8 in (all reach centre within the height travel) |
| `tool_post_holder_10mm_round` | 10.25 mm slot for a 10 mm round bar ground into a tool. No height tab: it slides about 6.6 mm (1/4 in) each way on the dovetail, locked by the 2 x M4 bolt slots. 2 x M4 clamp screws on top into inserts. Source: [`source/build_tool_post_holder_10mm_round.py`](source/build_tool_post_holder_10mm_round.py) |

- **Swivel:** one M4 x 20 down the column into an insert in the plate's hole at the swivel centre clamps it; two
  M4 x 12 side screws (tapped into the ring) drop into the notches for positive 0 / 45 / 90 stops toward the chuck.
  Any angle in between holds by the clamp alone.
- **Height:** an M4 x 25 jack screw in the holder's back tab pushes on the column top; 2 x M4 x 16 lock screws through
  slots into inserts in the column.
- **Tool clamps:** 2 x M4 x 16 (M4 x 20 in the solid holder), into inserts.
- Holders print upright, as they sit, no supports. PETG or PLA, 6 walls, 40 % infill or more.

Pictures: [`drawings/tool-post/`](drawings/tool-post/). Source: [`source/build_tool_post.py`](source/build_tool_post.py)
(FreeCAD 1.1 python: builds every part and runs 132 fit checks: every height, every swivel angle, tool and bit fits).

## Assembly and animation

[`assembly/`](assembly/): the whole lathe as built, in FreeCAD 1.1 (`REVTURN_lathe_assembly.FCStd`, `.step` for any
CAD): real printed parts, rails, screws, bearings, collars, the tool post, plus simple stand-ins for the headstock,
chuck and motors. `REVTURN_animate.FCMacro` plays a g-code or lathe-screen program on it live in FreeCAD, with a
stock panel (size from the program, or type it in). See [`assembly/README.md`](assembly/README.md).
`source/build_lathe_assembly.py` is the build script (it reads the part STEPs from Rev's own folders).

## FreeCAD sources (edit and rebuild every part)
Every printed part is built by a FreeCAD 1.1 python script, so you can change a number and rebuild instead of
editing a mesh. Run them with FreeCAD's own python (Windows example):
`"C:/Program Files/FreeCAD 1.1/bin/python.exe" build_r9.py`. Each script checks its own parts (valid closed
solids, fits, clearances) and writes STEP + STL next to itself in `out/`.

| What | Source | Notes |
|---|---|---|
| Bed ends (R4), R8 cross slide, fit coupons, pulleys | [`source/build_axis_bases.py`](source/build_axis_bases.py) | All the numbers are at the top (`P = {...}`); writes `out/` |
| R9 cross slide (long X), belt bracket | [`source/build_r9.py`](source/build_r9.py) | Runs `build_axis_bases.py` with the long-X options; keep both in one folder |
| Tool post | [`source/build_tool_post.py`](source/build_tool_post.py) | 132 fit checks. Set `OUT` near the top to where you want the files |
| Whole-lathe assembly | [`source/build_lathe_assembly.py`](source/build_lathe_assembly.py) | Reads the part STEPs; set its folder paths near the top |
| X motor mount, all four versions | [`freecad/x-motor-mount/`](freecad/x-motor-mount/) | One self-contained folder each: build script, helpers, `parameters.json`, `baseline/` STEP inputs, the `.FCStd` files and `PRINT-AND-FIT.txt`. `split-rail-mount-no-side-tie` is the one on the lathe (107 checks), `split-rail-mount` adds the side flange, plus the earlier `inline-rail-mount` and `solid-half-rail-mount` |

Checked 2026-11-11: `build_r9.py` and the no-side-tie mount build cleanly from these folders and pass their checks.

## Printing notes (learned on the real parts)
- **Frames:** PLA+. **Saddle and top plate:** plain PLA worked; same filament roll for a part and its fit test.
- **Motor bracket:** ABS+ if you can. A NEMA 17 runs 45 to 80 °C at the case and PLA softens around 55 to 60 °C.
- **Horizontal bores print small.** The rail bores carry **+0.11 mm**, measured on this printer: the first saddle
  slid on the Z rails with no rock and no binding. Adjust that allowance for your printer before printing the
  8-hour saddle.
- Printed GT2 teeth are at the limit of a 0.4 nozzle (about 0.45 mm at the tip). Fine for this load; aluminium 30T
  pulleys are a cheap drop-in if one strips.
- Tap the M3 threads with a real tap. Plain PLA is brittle.

## Known limits
- The R9 saddle hangs 58.7 mm out on each side of the Z rails. It is stiff enough for light cuts in plastic, brass
  and aluminium; it is printed plastic, so expect flex under heavy cuts.
- Feet have plain slots with no counterbores, so bolt heads stand about 8 mm proud: keep the motor clear of them.

## License
REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com). These printed parts (STL, STEP,
drawings, FreeCAD sources) are licensed **GPL-3.0-or-later with attribution** (GPLv3 section 7(b)): keep the credit
and share your editable changes under the same license. See [`LICENSE.md`](LICENSE.md) and [`../NOTICE.md`](../NOTICE.md).

## Support
These parts are free. If they saved you some design time, **[buy me a coffee](https://buymeacoffee.com/revjmoney)**.
More from the same shop: **[RotatoCAM](https://rotatocam.com)**.
