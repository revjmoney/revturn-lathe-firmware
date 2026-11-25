# REVTURN lathe screen: feature log

## 2026-11-24
- **Gang plate** (SET UP screen, for lathes with every tool on one plate): with "Gang plate ON", a tool change in
  a cycle or program no longer stops (no `M5`, no `M0`). It emits `G0 X<clearance dia>` (T1 frame) so the slide backs
  out and the other tools clear the part, then `(MSG, GANG TOOL Tn desc)`; the new tool's offsets do the rest and
  the DRO follows the message. Clearance X defaults to 3 in, and stroke limits check it like any other move. Off by
  default, saved in `/setup.json` (`gang {enabled, clearX}`); old files load with it off. Asked for by the first
  outside REVTURN builder (servo spindle, gang tooling). Also fixed `tools/build.mjs` (duplicate import broke builds).

## 2026-11-15
- **Taper correction** (SET UP screen): if a straight cut comes out tapered, enter the diameter change per inch of Z
  (plus = fatter toward the tailstock) and the Z where it is zero. Every cycle and program then shifts X slightly as
  Z moves so the cut comes out straight. Off by default, saved in `/setup.json`. Rev's lathe measured 0.030 in
  over 2.25 in (0.0133 per inch). Arcs are shifted as a whole; G91, G8 and G21 are handled. MDI lines are corrected too
  (from where the DRO says the tool is; the console shows the corrected line). Z jogs are corrected too (step and CONT:
  each Z jog carries the matching small X move, so the X DRO creeps a little as Z moves). X and C jogs are plain.
  `.nc` files run straight from the file list are not corrected.
- **Insert key** starts the spindle at the spindle slider speed, and stops it if it is turning. Works on every
  screen, same safety checks as the SPINDLE ON / STOP buttons.
- **Fractional jog feeds:** the X/Z jog slider goes down to 0.1 in/min in 0.1 steps (cycle feed boxes already
  took fractions like 0.5).
- **Tap the DRO to set it:** tap the big X or Z number, type the measured diameter (X) or Z, and it is set with
  the same G10 L20 line as ABS SET (active tool offset included). Only when Idle and in control.
