# REVTURN macro and expression ideas (research 2026-11-12)

REVTURN by JMSCNC. Collected from grblHAL, LinuxCNC and sender-app sources, checked against what REVTURN's grblHAL
actually did on 2026-11-12 (o-word while/if loops, #parameters, SIN, COS, FIX work from a flash file).

## What grblHAL gives us (wiki: grblHAL/core "Expressions and flow control", "Additional G- and M-codes")
- Operators `** * / MOD + - EQ NE GT GE LT LE AND OR XOR`; functions `ABS ACOS ASIN ATAN[y]/[x] COS EXP FIX FUP LN
  ROUND SIN SQRT TAN`; `EXISTS[#<name>]`; `PRM[n]` reads a $setting.
- **if/else works streamed, but while/do/repeat/sub/call only from a file on the controller** (flash/SD). Every
  looping button must upload a file and run it (the app already does this for cycles).
- **G65 P<n> A.. B.. X.. Z..** calls a macro with words as locals (A=#1 B=#2 C=#3 D=#7 F=#9 Q=#17 R=#18 S=#19 X=#24
  Z=#26). One mechanism for every parameterized button.
- **M70 / M72** save and restore modal state: wrap button macros so they never leave G91 or another F behind.
- `tc.macro` runs on M6 (tool change macro): park + M0.
- User parameters #31..#5000; named `_x`, `_abs_x`, `_call_level`. `(debug,...)` needs $534.
- Measured on REVTURN: C is not scaled by G20; C-only F = deg/min; with X or Z in the move F is the X/Z speed and
  C rides along. **G93 inverse time** would make mixed X/Z/C moves exact (not yet tested here).

## Button candidates for the app
| Button | What | Needs |
|---|---|---|
| SAFE PARK | retract X first, then Z, to a stored safe spot (G53 machine coords) | nothing new |
| TOOL CHANGE | park + M0; or tc.macro on M6 | tc.macro upload ($341) |
| TOUCH OFF BY DIA | type the measured diameter: G10 L20 P0 X<dia> (G7); Z at the face with offset | nothing new |
| C ZERO / INDEX N | zero C here; index 360/N with a pause at each stop | G65 macro |
| RUNOUT CHECK | C slowly round with M0 at 0/90/180/270 for dial readings | G65 macro |
| BACKLASH TEST | approach a point from + and -, pause for the indicator, X Z C | G65 macro |
| CHUCK WARM-UP | stepped C runs up toward 275 rpm (C is a stepper axis) | nothing new |
| HELIX / BARBER POLE | coordinated Z+C helix, n starts offset 360/n (no encoder needed) | expressions |
| POLYGON / CAM TURN | X follows C: X = 2R cos(180/n)/cos(MOD[th,360/n]-180/n) | expressions |
| DIAL SCRIBE | index C N times, short X plunge, long marks every 5 and 10 | expressions |
| WRAP / ENGRAVE | C = s/(pi D) x 360 along Z: text or patterns on a cylinder | expressions |
| MATH SHOW / DANCE | REVTURN's own expression programs (tools/resonance/expr_dance.nc, math_show.nc) | files |

Input idea worth copying: andypugh's LinuxCNC Lathe Macros accept "3in", "75mm", "2 5/64in", tpi.

## Sources
- https://github.com/grblHAL/core/wiki/Expressions-and-flow-control
- https://github.com/grblHAL/core/wiki/Additional-G--and-M-codes
- https://github.com/grblHAL/core/discussions/789
- https://github.com/grblHAL/core/wiki/Manual,-semi-automatic-and-automatic-tool-change
- https://github.com/Sienci-Labs/gsender/issues/515
- https://github.com/andypugh/LatheMacros
- https://forum.linuxcnc.org/10-advanced-configuration/45641-how-to-warp-xy-instruction-around-a-cylinder-to-e-g-engrave-text-on-pens
- https://github.com/LinuxCNC/linuxcnc/tree/master/nc_files (spiral, daisy, flowsnake, polar samples)
