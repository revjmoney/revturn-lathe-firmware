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
  the Z leadscrew, with the Z motor behind the tailstock frame on a short belt.
- **The cross slide (R9, "long X"):** a saddle that rides the Z rails and carries its own X rails and leadscrew,
  a top plate that rides X, and an **inline X motor mount**: the NEMA 17 sits in line with the X screw, 1:1 through a
  coupler, on split clamps that grip the X rail ends. (The original R9 belt-drive bracket is still here as an option.)

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
These printed parts (STL, STEP, drawings) are licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [`LICENSE.md`](LICENSE.md).

## Support
These parts are free. If they saved you some design time, **[buy me a coffee](https://buymeacoffee.com/revjmoney)**.
More from the same shop: **[RotatoCAM](https://rotatocam.com)**.
