# REVTURN lathe screen v2: Fanuc / ProtoTRAK behaviour

Rev 2026-11-08: "1-11 are go… make it work like a fanuc/prototrak lathe in theory and make decisions based
on that. flash when done." Decisions below are Claude's calls on that basis.

| # | Feature | Behaviour (and the control it copies) |
|---|---|---|
| 1 | DRY RUN | Toggle key. ProtoTRAK-style air cut: every generated/imported program runs with **Z shifted +0.500 in** and **M3/M4 removed** (spindle stays off; thread C sync still runs, in air). Red **DRY RUN** badge in the status bar while on. |
| 2 | Stroke limits | Fanuc stored stroke limit, in work coordinates of tool 1 (SET UP > LIMITS: X max dia, X min dia, Z max, Z min). GO refuses a program that leaves them with `OVERTRAVEL X+ (line n)`; jog steps that would leave them are refused. Limits checked on the real (not dry-run) path and on the dry-run path. |
| 3 | Alarm / unlock | Fanuc alarm display: on `Alarm` the message line shows the alarm text and a red **RESET/UNLOCK** key appears (sends `$X`). |
| 4 | Overrides | Fanuc panel: FEED −10 / 100% / +10, SPINDLE −10 / 100% / +10, RAPID 25 / 50 / 100, always visible, live `Ov:` values shown. |
| 5 | Run progress | RUN screen: % done (grblHAL `|SD:pct,file`), elapsed, estimated remaining, current step, live tool dot on the preview. |
| 6 | Tool table | ProtoTRAK tool table T1–T8: description, X (dia) and Z offsets **relative to T1**. Active tool chosen on DRO; DRO shows the active tool tip; ABS SET applies to the active tool. Each cycle/step has a Tool field; generated moves are shifted by that tool's offsets. A step whose tool differs from the previous one inserts `M5`, `(MSG, CHANGE TO Tn <desc>)`, `M0` (manual QCTP tool change: program holds, GO resumes). Stored on the lathe as `/setup.json` so every screen shares it. |
| 7 | Review leftovers | Programs compile at RUN time with the current C; CYCLES regenerate at the second GO; `$13` read on connect (inch reports handled); GO refused until `$30` is known; pass caps on Face/Thread/Bore/Drill. |
| 8 | Pass caps | 500 passes per cycle, like Turn. |
| 9 | Cycles | Turn gets **end chamfer** or **end radius** (at the Z start end, finish pass; radius as 8 line segments). New **BORE** (ID turning, retract −X then +Z) and **DRILL** (Z only at X0, peck with full retract, G83-style). |
| 10 | Import | PROG > IMPORT: pick a `.nc/.tap/.ngc` from Fusion's lathe post; becomes a program with one G-code step (`%`, `O` lines stripped). Warns if the file has no `G7` (radius vs diameter) or no `G20`. Limits and dry run apply. |
| 11 | All screens see status | Firmware: every WebUI WebSocket client receives the same output (status, replies). Only the controlling screen sends programs; others show **VIEW ONLY**. **HOLD, STOP (reset), jog-cancel and `?` are accepted from any screen** (E-stop principle). Each client is told the controlling `activeID`. |

Order of transforms for a run: generate → tool offsets → stroke-limit check → (dry run: Z+0.5, no M3/M4 → limit check again) → upload → `$F=`.
