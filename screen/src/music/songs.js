// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
//
// The REVTURN song book: public-domain pieces arranged by JMSCNC for two stepper motors (X melody, Z bass), from
// the old scores. Notation, one voice per string:  NOTE:units  (C4 = middle C, # for sharp), r:units = rest,
// a trailing ~ slides into the next note (the motor bends its pitch like a guitar slide), | is just a bar line.
// drone = one note the chuck (spindle) holds under the whole song: it can spin fast, so it takes a high note, and it
// never changes (a spindle speed change makes grblHAL pause all motion). unit = seconds per unit at tempo 100%; tempo = [[unit position, speed factor], ...] for speed-ups (accelerando).

export const SONGS = [
  {
    id: 'gymnopedie',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie, 1888',
    drone: 'D5', // in both chords it rocks between (G and D)
    unit: 0.6, // one quarter note; "lent et douloureux"
    note: 'Slow and dreamy: long notes are what steppers do best. Melody an octave down (the score tops out above X max).',
    x: `r:13 | F#4:1 A4:1 G4:1 F#4:1 C#4:1 B3:1 C#4:1 D4:1~ A3:3 F#3:12 r:1
        F#4:1 A4:1 G4:1 F#4:1 C#4:1 B3:1 C#4:1 D4:1~ A3:3 C#4:3 F#4:3 E3:9
        A3:1 B3:1 C4:1 E4:1 D4:1 B3:1 D4:1 C4:1 B3:1 D4:3 r:2 D4:1 E4:1 F4:1 G4:1 A4:1 C4:1 D4:1 E4:1 D4:1 B3:1
        D4:3 D4:2 D4:1 G4:3 F#4:3 B3:1 A3:1 B3:1 C#4:1 D4:1 E4:1 C#4:1 D4:1 E4:1~ F#3:9`,
    z: `G2:3 D2:3 G2:3 D2:3 G2:3 D2:3 G2:3 D2:3 G2:3 D2:3 G2:3 D2:3 G2:3 D2:3 G2:3 D2:3
        F#2:3 B2:3 A2:6 D2:3 A2:3 D2:12 D2:6 D2:6 D2:3 E2:3 F#2:3 B2:3 E2:9 A2:3 D2:12`,
  },
  {
    id: 'fur-elise',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven, 1810',
    drone: 'A5',
    unit: 0.18, // one 16th note
    note: 'The A section twice, the middle bit, and A again.',
    x: `E5:1 D#5:1 | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 G#4:1 B4:1 | C5:2 r:1 E4:1 E5:1 D#5:1
        | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 C5:1 B4:1 | A4:2 r:2 E5:1 D#5:1
        | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 G#4:1 B4:1 | C5:2 r:1 E4:1 E5:1 D#5:1
        | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 C5:1 B4:1 | A4:2 r:1 B4:1 C5:1 D5:1
        | E5:3 G4:1 F5:1 E5:1 | D5:3 F4:1 E5:1 D5:1 | C5:3 E4:1 D5:1 C5:1 | B4:2 r:1 E4:1 E5:1 D#5:1
        | E5:1 D#5:1 E5:1 D#5:1 E5:1 D#5:1 | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 G#4:1 B4:1
        | C5:2 r:1 E4:1 E5:1 D#5:1 | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:2 r:1 C4:1 E4:1 A4:1 | B4:2 r:1 E4:1 C5:1 B4:1 | A4:6`,
    z: `r:2 | r:6 | A2:6 | E2:6 | A2:6 | r:6 | A2:6 | E2:6 | A2:6
        | r:6 | A2:6 | E2:6 | A2:6 | r:6 | A2:6 | E2:6 | A2:6
        | C3:6 | G2:6 | A2:6 | E2:6 | r:6 | r:6 | A2:6 | E2:6 | A2:6 | r:6 | A2:6 | E2:6 | A2:6`,
  },
  {
    id: 'mountain-king',
    title: 'In the Hall of the Mountain King',
    composer: 'Edvard Grieg, 1875',
    drone: 'B4',
    unit: 0.3, // one 8th note at the start; every time round it gets faster
    note: 'Six times round, faster every time, then a slide down to the end. Z doubles the tune two octaves down.',
    tempo: [[0, 1], [32, 1.18], [64, 1.4], [96, 1.66], [128, 1.98], [160, 2.35]],
    x: `B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:2 | F4:1 C#4:1 F4:2 E4:1 C4:1 E4:2 | B3:1 C#4:1 D4:1 E4:1 F#4:1 D4:1 F#4:1 B4:1 | A4:1 F#4:1 D4:1 F#4:1 A4:4
        B4:2 r:1 B4:3~ B3:6`,
    z: `B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:2 | F2:1 C#2:1 F2:2 E2:1 C2:1 E2:2 | B1:1 C#2:1 D2:1 E2:1 F#2:1 D2:1 F#2:1 B2:1 | A2:1 F#2:1 D2:1 F#2:1 A2:4
        B1:3 r:3 B1:6`,
  },
  {
    id: 'moonlight',
    title: 'Moonlight Sonata (1st movement)',
    composer: 'Ludwig van Beethoven, 1801',
    drone: 'C#5',
    unit: 0.36, // one triplet 8th
    note: 'The rolling triplets on X with the melody stepping in on top, deep octaves on Z (an octave up so Z can sound them).',
    x: `G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 | G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1
        | A3:1 C#4:1 E4:1 A3:1 C#4:1 E4:1 A3:1 D4:1 F#4:1 A3:1 D4:1 F#4:1 | G#3:1 C4:1 F#4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 D#4:1 F#3:1 C4:1 D#4:1
        | G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#3:1 C#4:1 E4:1 G#4:2 G#4:1 | G#4:5 G#4:1 G#4:5 G#4:1
        | A4:6 G#4:6 | F#4:3 B4:3 E4:3~ G#3:1 B3:1 E4:1 | G#3:1 B3:1 E4:1 G#3:1 B3:1 E4:1 G3:1 B3:1 E4:1 G4:2 E4:1 | G4:5 G4:1 G4:5 G4:1 | C#4:12`,
    z: `C#3:12 | B2:12 | A2:6 F#2:6 | G#2:6 G#2:6 | C#3:12 | C3:12 | C#3:6 F#2:6 | B2:6 B2:6 | E3:12 | E3:12 | C#3:12`,
  },
  {
    id: 'beethoven-5',
    title: 'Symphony No. 5 (opening)',
    composer: 'Ludwig van Beethoven, 1808',
    drone: 'C5',
    unit: 0.15, // one 8th note; the second time round is faster
    note: 'Da-da-da-DUM with every long note sliding down, the bass doubling it low on Z (under 4 ipm, below the rough Z band).',
    tempo: [[0, 1], [112, 1.2]],
    x: `r:1 G5:1 G5:1 G5:1 | D#5:4~ | C5:4 | r:1 F5:1 F5:1 F5:1 | D5:4~ | B4:4 |
        r:1 G5:1 G5:1 G5:1 | G#5:1 G#5:1 G#5:1 G5:1~ | D#5:1 D#5:1 D#5:1 D5:1~ | C5:1 C5:1 C5:1 B4:1~ | G4:2~ G5:2~ | G4:2~ G5:2 |
        r:1 G5:1 G5:1 G5:1 | D#5:1 G#5:1 G#5:1 G#5:1 | G5:1 D#5:1 D#5:1 D#5:1 | D5:1 F5:1 F5:1 F5:1 | D#5:1 C5:1 C5:1 C5:1 | B4:1 D5:1 D5:1 D5:1 |
        C5:4~ | G5:4~ | D#5:4~ | C5:4~ | G4:4 | r:1 G5:1 G5:1 G5:1 | D#5:4~ | C5:4~ | C4:8 |
        r:1 G5:1 G5:1 G5:1 | D#5:4~ | C5:4 | r:1 F5:1 F5:1 F5:1 | D5:4~ | B4:4 |
        r:1 G5:1 G5:1 G5:1 | G#5:1 G#5:1 G#5:1 G5:1~ | D#5:1 D#5:1 D#5:1 D5:1~ | C5:1 C5:1 C5:1 B4:1~ | G4:2~ G5:2~ | G4:2~ G5:2 |
        r:1 G5:1 G5:1 G5:1 | D#5:1 G#5:1 G#5:1 G#5:1 | G5:1 D#5:1 D#5:1 D#5:1 | D5:1 F5:1 F5:1 F5:1 | D#5:1 C5:1 C5:1 C5:1 | B4:1 D5:1 D5:1 D5:1 |
        C5:4~ | G5:4~ | D#5:4~ | C5:4~ | G4:4 | r:1 G5:1 G5:1 G5:1 | D#5:4~ | C5:4~ | C4:8`,
    z: `r:1 G2:1 G2:1 G2:1 | D#2:4~ | C2:4 | r:1 F2:1 F2:1 F2:1 | D2:4~ | B1:4 |
        r:1 C2:1 C2:1 C2:1 | G#1:4 | G2:4 | C2:4 | G2:2~ G#1:2~ | G2:2~ C2:2 |
        r:1 G2:1 G2:1 G2:1 | C2:4 | D#2:4 | G2:4 | C2:4 | G2:4 |
        C2:4~ | G2:4~ | D#2:4~ | C2:4~ | G2:4 | r:1 G2:1 G2:1 G2:1 | D#2:4~ | D2:4~ | C2:8 |
        r:1 G2:1 G2:1 G2:1 | D#2:4~ | C2:4 | r:1 F2:1 F2:1 F2:1 | D2:4~ | B1:4 |
        r:1 C2:1 C2:1 C2:1 | G#1:4 | G2:4 | C2:4 | G2:2~ G#1:2~ | G2:2~ C2:2 |
        r:1 G2:1 G2:1 G2:1 | C2:4 | D#2:4 | G2:4 | C2:4 | G2:4 |
        C2:4~ | G2:4~ | D#2:4~ | C2:4~ | G2:4 | r:1 G2:1 G2:1 G2:1 | D#2:4~ | D2:4~ | C2:8`,
  },
  {
    id: 'turkish-march',
    title: 'Turkish March (The Ruins of Athens)',
    composer: 'Ludwig van Beethoven, 1811',
    drone: 'E5',
    unit: 0.12, // one 16th note; second half faster
    note: 'In E so the high notes sit on the smoothest X top notes (F#5-G#5); every grace note is a slide. Bass on Z under 4 ipm.',
    tempo: [[0, 1], [256, 1.15]],
    x: `A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 A4:3 r:1 | G#4:3 r:1 A4:3 r:1 | B4:6 r:2 |
        A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 C5:3 r:1 | C#5:8 | C#5:7~ D#5:1~ |
        E5:4 C#5:3 r:1 | C#5:3 r:1 C#5:3 r:1 | D#5:1~ E5:1~ F#5:2 D#5:3 r:1 | D#5:3 r:1 D#5:3 r:1 | D#5:1~ E5:1~ F#5:2 D#5:3 r:1 | D#5:1~ E5:1~ F#5:4 r:2 | E5:1~ F#5:1~ G#5:3 r:1 E5:2 | E5:1~ F#5:1~ G#5:3 r:1 E5:2 |
        A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 A4:3 r:1 | G#4:3 r:1 A4:3 r:1 | B4:6 r:2 |
        A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 A4:3 r:1 | G#4:3 r:1 A4:3 r:1 | B4:6 r:2 |
        A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 C5:3 r:1 | C#5:8 | C#5:7~ D#5:1~ |
        E5:4 C#5:3 r:1 | C#5:3 r:1 C#5:3 r:1 | D#5:1~ E5:1~ F#5:2 D#5:3 r:1 | D#5:3 r:1 D#5:3 r:1 | D#5:1~ E5:1~ F#5:2 D#5:3 r:1 | D#5:1~ E5:1~ F#5:4 r:2 | E5:1~ F#5:1~ G#5:3 r:1 E5:2 | E5:1~ F#5:1~ G#5:3 r:1 E5:2 |
        A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 E4:1~ G#4:2 r:1 | A#4:1~ B4:3 G#4:3 r:1 | E4:1~ G#4:2 r:1 G#5:3 r:1 | F#5:2~ C#5:2~ D#5:2~ C#5:2 | B4:3 r:1 A4:3 r:1 | G#4:3 r:1 A4:3 r:1 | B4:6 r:2 |
        E4:1~ G#4:1~ B4:1~ E5:5`,
    z: `E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:3 r:1 B1:3 r:1 | E2:4 B1:4 | B1:7~ E2:1 |
        E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:4~ G#1:4~ | C#2:8 | G#1:7~ C#2:1 |
        C#2:8 | G#1:4 C#2:4 | B1:8 | D#2:4 B1:4 | B1:8 | B1:6~ E2:2 | E2:8 | E2:6~ B1:2 |
        E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:3 r:1 B1:3 r:1 | E2:4 B1:4 | B1:7~ E2:1 |
        E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:3 r:1 B1:3 r:1 | E2:4 B1:4 | B1:7~ E2:1 |
        E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:4~ G#1:4~ | C#2:8 | G#1:7~ C#2:1 |
        C#2:8 | G#1:4 C#2:4 | B1:8 | D#2:4 B1:4 | B1:8 | B1:6~ E2:2 | E2:8 | E2:6~ B1:2 |
        E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4~ B1:2 r:2 | B1:2 r:2 B1:2 r:2 | E2:4 B1:4 | B1:3 r:1 B1:3 r:1 | E2:4 B1:4 | B1:7~ E2:1 |
        E2:8`,
  },
];

const KEYS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export const keyOf = (name) => { const m = /^([A-G]#?)(-?\d)$/.exec(name); if (!m) throw new Error(`bad note ${name}`); return KEYS[m[1]] + 12 * (Number(m[2]) + 1); };

// unit position -> seconds through the tempo map
function timeMap(song) {
  const map = (song.tempo ?? [[0, 1]]).slice().sort((a, b) => a[0] - b[0]);
  return (u) => {
    let t = 0;
    for (let i = 0; i < map.length; i++) {
      const [u0, f] = map[i], u1 = i + 1 < map.length ? map[i + 1][0] : Infinity;
      if (u <= u0) break;
      t += ((Math.min(u, u1) - u0) * song.unit) / f;
    }
    return t;
  };
}

// one voice of a song -> [{ t, dur, key, hz, slide }] in seconds
export function voiceNotes(song, voice) {
  const at = timeMap(song);
  const out = []; let u = 0;
  for (const tok of (song[voice] ?? '').split(/\s+/).filter((s) => s && s !== '|')) {
    const m = /^(r|[A-G]#?-?\d):(\d+(?:\.\d+)?)(~?)$/.exec(tok);
    if (!m) throw new Error(`${song.id} ${voice}: cannot read "${tok}"`);
    const len = Number(m[2]);
    if (m[1] !== 'r') {
      const key = keyOf(m[1]);
      out.push({ t: at(u), dur: at(u + len) - at(u), key, hz: 440 * 2 ** ((key - 69) / 12), slide: m[3] === '~' });
    }
    u += len;
  }
  return out;
}

// SLIDES: a note marked slide bends into the next note over its last `time` s (at most 60% of the note), in
// `steps` small pitch steps on a log scale. Legato moves change feed without stopping, so it sounds like a slide.
export function expandSlides(notes, { time = 0.35, steps = 7 } = {}) {
  const out = [];
  notes.forEach((n, i) => {
    const next = notes[i + 1];
    if (!n.slide || !next || Math.abs(next.t - (n.t + n.dur)) > 0.01) { out.push(n); return; }
    const st = Math.min(time, n.dur * 0.6), head = n.dur - st;
    out.push({ ...n, dur: head, slide: false });
    for (let k = 1; k <= steps; k++) {
      const f = n.hz * (next.hz / n.hz) ** (k / (steps + 1));
      out.push({ t: n.t + head + ((k - 1) * st) / steps, dur: st / steps, key: n.key, hz: f, sliding: true });
    }
  });
  return out;
}

// the chuck drone as spindle rpm (C Hz per rpm from the machine), or null
export const droneRpm = (song, m) => (song.drone ? (440 * 2 ** ((keyOf(song.drone) - 69) / 12)) / m.hz.C : null);
