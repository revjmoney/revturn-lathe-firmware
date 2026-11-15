# REVTURN lathe screen: feature log

## 2026-11-15
- **Taper correction** (SET UP screen): if a straight cut comes out tapered, enter the diameter change per inch of Z
  (plus = fatter toward the tailstock) and the Z where it is zero. Every cycle and program then shifts X slightly as
  Z moves so the cut comes out straight. Off by default, saved in `/setup.json`. Rev's lathe measured 0.030 in
  over 2.25 in (0.0133 per inch). Arcs are shifted as a whole; G91, G8 and G21 are handled. MDI lines are corrected too
  (from where the DRO says the tool is; the console shows the corrected line). Jogs are not corrected, and neither
  are `.nc` files run straight from the file list.
- **Insert key** starts the spindle at the spindle slider speed, and stops it if it is turning. Works on every
  screen, same safety checks as the SPINDLE ON / STOP buttons.
- **Fractional jog feeds:** the X/Z jog slider goes down to 0.1 in/min in 0.1 steps (cycle feed boxes already
  took fractions like 0.5).
- **Tap the DRO to set it:** tap the big X or Z number, type the measured diameter (X) or Z, and it is set with
  the same G10 L20 line as ABS SET (active tool offset included). Only when Idle and in control.
