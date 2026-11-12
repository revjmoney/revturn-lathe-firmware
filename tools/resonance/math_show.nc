(REVTURN MATH SHOW by JMSCNC 2026-11-12 - trig, algebra, exponentials, calculus, Newton, Fourier)
(GPL-3.0-or-later. REVTURN by JMSCNC, Copyright C 2026 Rev. J. Money / JMSCNC jmscnc.com. Keep this credit.)
(The lathe computes every point itself with grblHAL expressions and o-word loops while it runs.)
(ROOM: centre X0 Z-38.1 mm. X real plus or minus 14 mm, written as DIAMETER so twice the real value.)
(Z plus or minus 24 mm. Every move is INCREMENTAL from the last point, so the chuck can turn past 360.)
(PARAMETERS: #1 #2 #3 = new X real, Z, C relative to the centre. #11 #12 #13 = the last ones.)
(#9 = feed mm per min for the X and Z path; the chuck rides along. #20 = the loop variable.)
M5
G21 G7 G90 G94
G1 Z-38.1 F500
G0 X0
G91
#11 = 0
#12 = 0
#13 = 0
#9 = 900

(SECTION 1 - TRIG - SPIROGRAPH, a hypotrochoid: a small wheel of radius r rolling inside a ring of radius R,)
(pen at distance d from its centre. x = R-r times cos t + d times cos of R-r over r times t,)
(z = R-r times sin t - d times sin of R-r over r times t. R=10 r=3 d=5 closes after t = 1080 degrees.)
(Z is stretched 1.8 times to fill the room. The chuck turns with t: 3 full turns.)
#20 = 0
o110 while [#20 LE 1080]
  #1 = [7 * COS[#20] + 5 * COS[7 * #20 / 3]]
  #2 = [1.8 * [7 * SIN[#20] - 5 * SIN[7 * #20 / 3]]]
  #3 = #20
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 4]
o110 endwhile
G4 P0.5

(SECTION 2 - ALGEBRA - POLYNOMIALS. Z walks across the room as the input u from -1 to 1.)
(Pass A, the cubic f = u cubed minus u times 0.75, scaled 48: an S curve with two bumps.)
(Pass B, the parabola g = 2 u squared minus 1, scaled 14, walking back.)
(The chuck angle follows the value of the polynomial, so it rocks with the curve: C = 90 times f.)
#20 = -1
#6 = -0.25
o120 while [#20 LE 1.0001]
  #5 = [#20 * #20 * #20 - 0.75 * #20]
  #1 = [48 * #5]
  #2 = [22 * #20]
  #3 = [#13 + 90 * #5 - 90 * #6]
  #6 = #5
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 0.04]
o120 endwhile
#20 = 1
#6 = 1
o121 while [#20 GE -1.0001]
  #5 = [2 * #20 * #20 - 1]
  #1 = [12 * #5]
  #2 = [22 * #20]
  #3 = [#13 + 60 * #5 - 60 * #6]
  #6 = #5
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 - 0.04]
o121 endwhile
G4 P0.5

(SECTION 3 - EXPONENTIALS - THE GOLDEN SPIRAL: radius grows by phi = 1.618 every quarter turn,)
(r = 2 times e to the power of ln phi times angle over 90. That is phi to the angle over 90 without a power key.)
(One full turn grows the radius 6.85 times. Z is stretched 1.6. The chuck snaps a quarter turn at every quarter.)
#20 = 0
#21 = 0
o130 while [#20 LE 360]
  #7 = [2 * EXP[LN[1.618034] * #20 / 90]]
  #1 = [#7 * COS[#20]]
  #2 = [1.6 * #7 * SIN[#20]]
  #3 = [#13]
  o131 if [FIX[#20 / 90] GT #21]
    #3 = [#13 + 90]
    #21 = FIX[#20 / 90]
  o131 endif
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 5]
o130 endwhile
G4 P0.5

(SECTION 4 - CALCULUS - A DAMPED SPRING, solved live with Euler's method, a differential equation:)
(acceleration = minus k times position minus c times velocity. Each step: v = v + a times dt, then x = x + v times dt.)
(k = 40, c = 0.6, dt = 0.02, start at x = 13. X shows the spring bouncing and dying out as e to the minus 0.3 t,)
(Z walks steadily along like the time axis of a graph, and the chuck turns with the velocity, so it swings too.)
#30 = 13
#31 = 0
#20 = 0
#1 = #30
#2 = -22
G1 X[2 * [#1 - #11]] Z[#2 - #12] F#9
#11 = #1
#12 = #2
o140 while [#20 LT 400]
  #32 = [-40 * #30 - 0.6 * #31]
  #31 = [#31 + #32 * 0.02]
  #30 = [#30 + #31 * 0.02]
  #1 = #30
  #2 = [-22 + 44 * #20 / 400]
  #3 = [#13 + #31 * 0.6]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F1000
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 1]
o140 endwhile
G4 P0.5

(SECTION 5 - CALCULUS - INTEGRAL BY RIEMANN SUM: area under 12 times sin x from 0 to 180 degrees.)
(12 rectangles of 15 degrees, each as tall as the curve at its middle. X steps to the height, Z walks the width.)
(The chuck turns by the running area times 30 degrees per unit. The exact integral is 24, so the chuck should)
(finish 720 degrees on = 2 full turns. The midpoint rule gets 24.07, about 2 degrees over.)
#20 = 0
#40 = 0
#45 = #13
#2 = -22
G1 X[-2 * #11] Z[#2 - #12] F#9
#11 = 0
#12 = #2
o150 while [#20 LT 12]
  #41 = [12 * SIN[15 * #20 + 7.5]]
  #40 = [#40 + #41 * 15 * 3.14159265 / 180]
  #1 = [#41]
  G1 X[2 * [#1 - #11]] F#9
  #11 = #1
  #2 = [-22 + 44 * [#20 + 1] / 12]
  #3 = [#45 + 30 * #40]
  G1 Z[#2 - #12] C[#3 - #13] F600
  #12 = #2
  #13 = #3
  G4 P0.15
  #20 = [#20 + 1]
o150 endwhile
G1 X[-2 * #11] F#9
#11 = 0
G4 P0.8

(SECTION 6 - NEWTON'S METHOD finds the square root of 2 live: guess = guess - guess squared minus 2 over 2 guess.)
(Start at 1. X jumps to 9.5 times each guess: 9.5, 14.25, 13.46, 13.435 ... it settles on 9.5 times 1.41421 = 13.435.)
(Z steps 6 mm per try. The chuck turns by the error times 3600 degrees, so the turns shrink as the answer locks in.)
#50 = 1
#20 = 0
#2 = -18
G1 X[2 * [9.5 * #50 - #11]] Z[#2 - #12] F#9
#11 = [9.5 * #50]
#12 = #2
G4 P0.6
o160 while [#20 LT 6]
  #51 = [#50 - [#50 * #50 - 2] / [2 * #50]]
  #3 = [#13 + 3600 * ABS[#51 - #50]]
  #50 = #51
  #1 = [9.5 * #50]
  #2 = [#12 + 6]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  G4 P0.6
  #20 = [#20 + 1]
o160 endwhile
G4 P0.5

(SECTION 7 - FOURIER SERIES: a square wave built from sines, 4 over pi times the sum of sin of k t over k, odd k.)
(Four passes with 1, 3, 5 and 9 odd harmonics. Z sweeps two periods each pass; X draws the sum, 9 mm tall.)
(Watch the corners get sharper and the little overshoot at each jump stay about 9 percent: the Gibbs effect.)
(The chuck turns with t: one turn per period.)
#60 = 1
o170 while [#60 LE 4]
  #61 = 1
  o171 if [#60 EQ 2]
    #61 = 3
  o171 endif
  o172 if [#60 EQ 3]
    #61 = 5
  o172 endif
  o173 if [#60 EQ 4]
    #61 = 9
  o173 endif
  #20 = 0
  o174 while [#20 LE 720]
    #62 = 0
    #63 = 0
    o175 while [#63 LT #61]
      #64 = [2 * #63 + 1]
      #62 = [#62 + SIN[#64 * #20] / #64]
      #63 = [#63 + 1]
    o175 endwhile
    #1 = [9 * 4 / 3.14159265 * #62]
    #2 = [-22 + 44 * #20 / 720]
    o176 if [FIX[#60 / 2] * 2 EQ #60]
      #2 = [22 - 44 * #20 / 720]
    o176 endif
    #3 = [#13 + 6 * 0.5]
    G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
    #11 = #1
    #12 = #2
    #13 = #3
    #20 = [#20 + 6]
  o174 endwhile
  G4 P0.4
  #60 = [#60 + 1]
o170 endwhile

(SECTION 8 - FINALE - A 7 PETAL ROSE, r = 13 times cos 7 theta, over half a turn of theta.)
(Z stretched 1.6. The chuck spins up as it goes: each step it turns 2 degrees more than the last.)
#20 = 0
#70 = 2
o180 while [#20 LE 180]
  #7 = [13 * COS[7 * #20]]
  #1 = [#7 * COS[#20]]
  #2 = [1.6 * #7 * SIN[#20]]
  #70 = [#70 + 0.6]
  #3 = [#13 + #70]
  G1 X[2 * [#1 - #11]] Z[#2 - #12] C[#3 - #13] F#9
  #11 = #1
  #12 = #2
  #13 = #3
  #20 = [#20 + 1.5]
o180 endwhile
G4 P0.5

(HOME: back to the centre, and the chuck back to a whole turn.)
G1 X[-2 * #11] Z[-#12] F600
#8 = [#13 - 360 * FIX[#13 / 360]]
G1 C[-#8] F18000
G90 G20
M30
