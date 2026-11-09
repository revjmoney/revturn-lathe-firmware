# REVTURN printed parts

The 3D-printed axis parts on the REVTURN lathe, designed from scratch in FreeCAD by Rev. J. Money and
printed on an Ender 3 Pro. Every part ships as **STL** (to print) and **STEP** (to modify in any CAD).

Two families are on the machine:
- **The bed ends (R4):** a headstock-end frame and a tailstock-end frame that clamp two round rails and carry
  the Z leadscrew, with the Z motor behind the tailstock frame on a short belt.
- **The cross slide (R9, "long X"):** a saddle that rides the Z rails and carries its own X rails and leadscrew,
  a top plate that rides X, and a belt-drive bracket for the X motor.

## Parts

| File | Qty | What it is | Size (mm) | Print time* |
|---|---|---|---|---|
| `headstock_frame` | 1 | Chuck-end frame: clamps both rails, 688 bearing for the Z screw | 158 x 25 x 41 | see set total |
| `tailstock_frame_belt` | 1 | Tail-end frame: rail clamps, Z screw bearings + thrust, belt motor mount behind (**sawn off on this lathe**, see below) | 158 x 63 x 62 | see set total |
| `rail_clamp_cap_x4` | 4 | Bolt-down caps that clamp the rails (two M5 each) | 34 x 25 x 15 | see set total |
| `cross_slide_saddle_r9` | 1 | Saddle on the Z rails: brass nut mount, X rail lands, both X towers | 200 wide | 8 h 00 |
| `cross_slide_top_plate_r9` | 1 | Rides the X rails, tool platform grid on top | 45 x 61 x 24 | 2 h 11 |
| `x_belt_motor_bracket_r9` | 1 | NEMA 17 bracket on the tower's back face, belt drive to the X screw | | 1 h 25 |
| `pulley_30t_motor_bore5_r9` | 1 | GT2 30T, 5 mm bore, short hub (X motor) | 23 dia | 21 min |
| `pulley_30t_screw_bore8` | 1+ | GT2 30T, 8 mm bore (leadscrew) | 23 dia | |
| `thrust_washer_x2` | 2 per screw | 11.4 mm washer between shaft collar and bearing inner race | 11 dia x 2 | 4 min (pair) |

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
| GT2 6 mm closed-loop belt | 1 per axis | X (R9): **186 mm** loop, 30T:30T, centres 63.0 mm |
| M5 heat-set inserts + M5 x 25 cap screws | 8 | rail clamp caps |
| M4 screws (tapped) | 4 | X motor bracket to the saddle tower |
| M3 screws (tapped) | 4 per nut | brass nut flanges; tap the threads, don't drive screws into bare PLA |
| NEMA 17 stepper | 1 | X |
| 1/4 in bolts + washers | 10 | frame feet to the bench (slotted pads) |

**As built on this lathe:** the belt motor mount on `tailstock_frame_belt` was **hacksawed off** and the Z motor sits
on a separate off-the-shelf NEMA 17 mount (not part of these files), with its own pulleys. So the lathe as built
uses its own Z belt ratio. Use the measured steps per mm from the
[settings table](../README.md#machine-settings-calibrated-on-the-real-lathe), not the 1:1 design ratio.

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
