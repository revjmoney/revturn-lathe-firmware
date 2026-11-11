# REVTURN cycle test card

Goal: prove every conversational cycle on the REVTURN lathe before the BETA note comes off.
Each cycle goes through the same four gates: **preview, DRY RUN, soft stock, measure.** Stop at the first surprise.

REVTURN by JMSCNC. Copyright 2026 JMSCNC / Rev. J. Money.

---

## 0. Before anything moves

- [ ] **Hand near HOLD and STOP** the whole time. HOLD pauses, STOP resets.
- [ ] Machine limits as they are now: X and Z max **25 ipm** (`$110` / `$112` = 635), spindle max **275 rpm**.
- [ ] **Stock:** a hardwood dowel, wax, or a delrin / HDPE rod. About 1 in diameter, sticking out **1.5 in** from the jaws.
      No metal until a cycle has passed on soft stock.
- [ ] **Tool:** sharp, on center height (tip lines up with a center in the chuck, or face a piece and look for a nub).
- [ ] **Measure the stock** with calipers and write it down: stock dia = ______ in.

### Zero the tool
1. Jog the tool tip until it just kisses the end face. Press **ZERO Z**. The face is now Z0.
2. Take a light skim along the outside by hand (jog with the spindle running), back out in Z only, stop the spindle,
   measure the skimmed diameter. Press **X**, type that diameter, press **ABS SET**. X now reads diameter.
3. Check: jog toward the work. **X should get smaller as the tool moves toward the center.** Jog toward the chuck:
   **Z should go negative.** If either is backwards, stop here and fix the direction setting first.

### Set the stroke limits (this is what saves the jaws)
In **SET UP**, under stroke limits:
- [ ] Z min = **-(stickout - 0.25)**. For 1.5 in out: **Z min = -1.25**. The tool can never get within 0.25 in of the jaws.
- [ ] Z max = **1.0**, X max = stock dia + 0.5, X min = **-0.05**.
- [ ] SAVE SET UP, then press **LIMITS** so it reads **LIMITS ON**.
- [ ] Test it: try to jog Z past -1.25. The screen must refuse.

---

## 1. Direction checks (no cutting)

These two have never been checked. Do them first.

- [ ] **Spindle forward:** MDI `M3 S30`. Looking from the tailstock end, the **front of the stock (your side) must move
      down into the tool**. Note which way: __________. `M5` to stop.
- [ ] **C axis direction:** MDI `M5`, then `G91 G0 C90`, then `G90`. Put a marker line on a jaw first.
      The chuck must turn **the same way as M3** did. Same way? **YES / NO**
      If NO: threading and polygons will drag the tool backwards. Stop and tell Claude before testing THREAD or POLYGON.

### Other tools (drill, boring bar, parting blade)
Put each one in **SET UP** as its own T number (T2, T3...) and touch it off on X and Z there, then pick it in the
cycle's **Tool** box. A wrong offset is the most likely way to hit something, so DRY RUN each tool's first cycle.

---

## 2. The cycles

For **every** cycle below:
1. Fill in the form with the numbers given (change them to fit your stock).
2. Press **GO once.** Check the preview: the path stays in front of the jaws, the cut is where you expect, the code ends
   with the tool in front of the face.
3. Turn **DRY RUN on**, press **GO, GO.** The tool cuts air in front of the stock, the spindle stays off.
   Watch every move. Nothing should come near the jaws or the tailstock.
4. Turn **DRY RUN off**, press **GO, GO**, hand on HOLD. Cut the soft stock.
5. Measure and fill in the result.

Stock in the examples is a measured **1.000 in** dowel. Re-zero Z on the new face after FACE.

| # | Cycle | Numbers to try | What it should do | Measured | Pass |
|---|---|---|---|---|---|
| 1 | **FACE** | Start dia 1.05, End dia 0, Z start 0, Depth 0.02, Depth per pass 0.01, Feed 2, RPM 150 | Two passes to center, face ends at Z-0.020, then the tool backs off +Z before X | Face depth ____ | ☐ |
| | | *Then: touch the new face, ZERO Z* | | | |
| 2 | **TURN** straight | Start 1.0, Finish 0.90, Z start 0, Length 0.5, Depth per pass 0.02, Finish allowance 0.005, Rough feed 3, Finish feed 1.5, RPM 150 | Roughs, then one finish pass. **0.900 dia, 0.500 long.** Backs out +X before +Z every pass | Dia ____ Len ____ | ☐ |
| 3 | **TURN** + chamfer | Same, Finish 0.85, Length 0.3, End chamfer 0.03 | 0.850 dia with a 0.03 chamfer on the corner | Dia ____ | ☐ |
| 4 | **TURN** + radius | Same, Finish 0.80, Length 0.2, End radius 0.05 (chamfer blank) | Smooth round corner, no gouge | Looks right? | ☐ |
| 5 | **TURN** taper | Start 0.9, Finish 0.80, Taper end dia 0.85, Length 0.3 | Taper from 0.80 to 0.85 over 0.3 in | Ends ____ / ____ | ☐ |
| 6 | **DRILL** | Drill or center drill in the boring holder on center. Z start 0, Depth 0.5, Peck 0.1, Feed 1, RPM 250 | Pecks on center with full retracts, 0.5 deep | Depth ____ | ☐ |
| 7 | **BORE** | Boring bar. Hole dia now = drill size, Finish = drill + 0.06, Depth 0.4, Depth per pass 0.01, Rough 1.5, Finish 0.8, RPM 150 | Opens the hole outward; goes to a safe Z in front of the face before it moves X into the hole | Dia ____ | ☐ |
| 8 | **GROOVE** | Diameter 0.9, Z of +Z wall -0.3, Width 0.1, Depth 0.05, Peck 0.02, Tool width = your blade, Feed 0.5, RPM 120 | A 0.100 wide groove, 0.800 dia at the bottom, +Z wall at -0.300 | W ____ Dia ____ | ☐ |
| 9 | **INDEX** | Angle 90 (spindle off) | Chuck turns exactly 90 deg each GO. Use the jaw mark | 4 x 90 lands home? | ☐ |
| 10 | **THREAD** scratch | **Only if the direction check said YES.** TPI 20, Major dia = a turned diameter, Thread depth 0.003, Passes 1, Spring passes 0, Length 0.4, Lead-in 0.1, RPM 20 | A light spiral scratch. Hold a known right-hand bolt beside it: **the lines must lean the same way** | RH? | ☐ |
| 11 | **THREAD** full | Same, Thread depth blank (auto), Passes 6, Spring 1 | A full 20 TPI thread. Check with a thread gauge or a 20 TPI nut on delrin | Gauge fits? | ☐ |
| 12 | **POLYGON** | Sides 6, Across flats 0.75, Stock dia 0.90, Length 0.25, Depth per pass 0.02, Z feed per C turn 0.01, C RPM 10 | A hex, 0.750 across flats. Slow: let it finish | Flats ____ | ☐ |
| 13 | **GROOVE** part-off (last) | Diameter 0.9, Depth 0.45 (= radius, parts off), narrow blade, Feed 0.3, RPM 100 | Parts the piece off. Catch it | Clean? | ☐ |

---

## 3. A program

- [ ] In **EDIT**: new program with FACE, TURN (with chamfer) and GROOVE as steps. SAVE.
- [ ] In **RUN**: DRY RUN on, GO. Then DRY RUN off, GO on fresh stock.
- [ ] Check the RUN window: STEP n of N follows along, set and actual feed show, the backplot traces the cut.
- [ ] Press **HOLD** mid-cut, then **GO** to resume. It must continue cleanly.

## 4. When it is done

- All 13 rows pass on soft stock: run rows 1, 2, 6 and 10/11 once more in **aluminum** at gentler numbers.
- Send Claude the filled-in card (or a photo of it). Anything that failed gets fixed and re-tested, then the BETA
  notes come off the product, the website, the jmscnc.com page and the README.

| Date | Stock | Tester | Notes |
|---|---|---|---|
| | | Rev | |
