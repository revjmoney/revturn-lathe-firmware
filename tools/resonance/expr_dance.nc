(REVTURN expression dance by JMSCNC 2026-11-12: the lathe computes every point itself with o-word loops and SIN/COS)
(GPL-3.0-or-later, REVTURN by JMSCNC, Copyright C 2026 Rev. J. Money / JMSCNC jmscnc.com. Keep this credit.)
(Room: centre X0 Z-38.1 mm. X real +-15 mm, written as diameter. Z +-25 mm. All moves incremental from the last)
(point so the chuck can keep turning past 360. #11 #12 #13 = last X real, Z, C relative to the centre.)
M5
G21 G7 G90 G94
G1 Z-38.1 F500
G0 X0
G91
#11 = 0
#12 = 0
#13 = 0
#20 = 0
(PART 1: Lissajous 3:2 knot, chuck turns 4 times in step)
#1 = 0
#2 = [25 * SIN[90]]
#3 = 0
G1 X[2 * [#1 - #11]] Z[#2 - #12] F600
#11 = #1
#12 = #2
o101 while [#20 LE 360]
  #1 = [15 * SIN[3 * #20]]
  #2 = [25 * SIN[2 * #20 + 90]]
  #3 = [4 * #20]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F900
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 4]
o101 endwhile
G4 P0.4
(PART 2: rose curve, 4 petals, chuck turns backward)
#20 = 0
o102 while [#20 LE 360]
  #5 = [15 * COS[2 * #20]]
  #1 = [#5 * COS[#20]]
  #2 = [1.6 * #5 * SIN[#20]]
  #3 = [#13 - 3]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F800
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 3]
o102 endwhile
G4 P0.4
(PART 3: spiral in, 5 turns, circles shrink to the centre, chuck spins faster as it goes)
#20 = 0
o103 while [#20 LE 1800]
  #6 = [15 * [1 - #20 / 1800]]
  #1 = [#6 * COS[#20]]
  #2 = [1.6 * #6 * SIN[#20]]
  #3 = [#13 + 2 + #20 / 150]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F700
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 10]
o103 endwhile
G4 P0.4
(PART 4: pendulum sync, figure 8 on X and Z, the chuck rocks back and forth in time)
#20 = 0
#7 = #13
o104 while [#20 LE 720]
  #1 = [15 * SIN[2 * #20]]
  #2 = [22 * SIN[#20]]
  #3 = [#7 + 120 * SIN[4 * #20]]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F900
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 4]
o104 endwhile
G4 P0.4
(home: back to the centre, chuck back to a whole turn)
G1 X[-2 * #11] Z[-#12] F600
#8 = [#13 - 360 * FIX[#13 / 360]]
G1 C[-#8] F18000
G90 G20
M30
