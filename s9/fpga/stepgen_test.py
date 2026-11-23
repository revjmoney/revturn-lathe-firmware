#!/usr/bin/env python3
"""REVTURN step generator, hardware test on the board: push grblHAL-style segments into the FPGA and compare its
step counts, ticks and segment count with a Python copy of grblHAL's Bresenham (the same maths as stepper.c).
by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later."""
import random
import sys
import time

import numpy as np

from blocks import Bus, require

SLOT = 1


class StepGen:
    def __init__(self):
        self.bus = Bus()
        require(self.bus, 'RVT1')
        mm = self.bus.m
        self.w = mm._w
        self.base = (mm._off >> 2) + SLOT * 1024

    def wr(self, i, v):
        self.w[self.base + i] = int(v) & 0xFFFFFFFF

    def rd(self, i):
        return int(self.w[self.base + i])

    def pos(self):
        return [int(np.int32(np.uint32(self.rd(8 + a)))) for a in range(4)]

    def push(self, words):
        for x in words:
            while (self.rd(1) >> 16) & 0xFFF >= 2040:     # FIFO nearly full: wait
                pass
            self.wr(4, x)


def segments(block_steps, dirs, chunk, period, amass=0):
    """Split one block into grblHAL-style segments: (words, ticks). step_event_count = max steps."""
    sec = max(block_steps)
    out, done, first = [], 0, True
    while done < sec:
        n = min(chunk, sec - done)
        hdr = (n & 0xFFFFFF) | (dirs & 15) << 24 | (amass & 7) << 28 | (1 << 31 if first else 0)
        w = [hdr, period]
        if first:
            w += [sec] + list(block_steps)
        out.append(w)
        done += n
        first = False
    return out, sec


def model(blocks):
    """grblHAL's Bresenham: per block, counters start at sec >> 1; per tick counter += steps, step when > sec."""
    pos = [0, 0, 0, 0]
    for steps, dirs, _, _ in blocks:
        sec = max(steps)
        acc = [sec >> 1] * 4
        for _ in range(sec):
            for a in range(4):
                acc[a] += steps[a]
                if acc[a] > sec:
                    acc[a] -= sec
                    pos[a] += -1 if dirs >> a & 1 else 1
    return pos


def main():
    sg = StepGen()
    sg.wr(0, 2)                                            # stop + flush
    for a in range(4):
        sg.wr(8 + a, 0)
    sg.wr(2, 100 | 200 << 16)                              # 1 us pulses, 2 us dir setup
    sg.wr(5, 1)
    random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
    blocks = [([1000, 300, 2500, 0], 0b0000, 250, 1000),      # X 1000, Z 300, C 2500 at 100 kHz ticks
              ([0, 1200, 0, 50], 0b0010, 100, 500),           # Z back, W forward, 200 kHz
              ([777, 0, 0, 0], 0b0001, 64, 2000)]             # X back
    blocks += [([random.randint(0, 5000) for _ in range(4)], random.randint(0, 15), random.choice([16, 64, 250]),
                random.choice([200, 500, 1000])) for _ in range(12)]
    want_ticks = want_segs = 0
    t0 = time.time()
    sg.wr(0, 1)                                            # run
    for steps, dirs, chunk, period in blocks:
        if max(steps) == 0:
            continue
        segs, sec = segments(steps, dirs, chunk, period)
        want_ticks += sec
        want_segs += len(segs)
        for w in segs:
            sg.push(w)
    while sg.rd(1) & 1 or (sg.rd(1) >> 16) & 0xFFF:
        time.sleep(0.01)
    dt = time.time() - t0
    blocks = [b for b in blocks if max(b[0])]
    want = model(blocks)
    got = sg.pos()
    print('blocks %d  segments %d/%d  ticks %d/%d  underrun %d  %.2f s' % (
        len(blocks), sg.rd(13), want_segs, sg.rd(12), want_ticks, sg.rd(1) >> 1 & 1, dt))
    print('position FPGA ', got)
    print('position model', want)
    print('MATCH' if got == want and sg.rd(12) == want_ticks and sg.rd(13) == want_segs else 'MISMATCH')
    sg.wr(0, 0)
    sg.wr(5, 0)


if __name__ == '__main__':
    main()
