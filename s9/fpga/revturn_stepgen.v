`timescale 1ns / 1ps
// [orphan] REVTURN on the S9: the FPGA step generator. grblHAL's step interrupt in hardware: it runs the segments
// grblHAL's st_prep_buffer() makes, with the same Bresenham, so the motion matches grblHAL on an MCU exactly.
// by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later.
//
// 4 axes: 0 X, 1 Z, 2 C (the spindle stepper), 3 W (tailstock).
// The driver pushes 32-bit words into a FIFO (register 4). A segment is:
//   word 0  {new_block[31], amass[30:28], dir_bits[27:24], n_step[23:0]}     n_step ticks of this segment
//   word 1  period: clocks per tick (100 MHz: 100 = 1 MHz step rate, 10000 = 10 kHz)
//   and only when new_block = 1:
//   word 2  step_event_count (the block's Bresenham denominator)
//   word 3..6  steps[X], steps[Z], steps[C], steps[W] of the block
// Per tick, per axis (like grblHAL's ISR): counter += steps >> amass; if counter > step_event_count: step,
// counter -= step_event_count. A new block starts every counter at step_event_count >> 1.
//
// Registers (word index, slot SLOT):
//   0 CTRL    write [0] run  [1] stop + flush the FIFO  [2] clear underrun   read: the run bit
//   1 STATUS  [0] busy (a segment is running) [1] underrun (FIFO ran dry while running) [2] FIFO empty [3] full
//             [27:16] FIFO words
//   2 PULSE   [15:0] step pulse width (clocks), [31:16] dir setup (clocks before the first tick after a dir change)
//   3 INVERT  [3:0] step polarity, [11:8] dir polarity, [19:16] enable polarity per axis
//   4 FIFO    write: push a word
//   5 ENABLE  [3:0] driver enabled per axis (one enable pin each; grblHAL's $4 polarity via INVERT[19:16])
//   6 MODE    [0] 1 = tick-stream mode (below), 0 = segment mode (above)
// Tick-stream mode: grblHAL's own step interrupt runs on the ARM; every interrupt tick becomes one FIFO word
//   {step_bits[31:28], dir_bits[27:24], delay[23:0]}: wait <delay> step-timer counts (10 MHz, 0.1 us) after the
//   previous tick, set the dir bits (with the dir setup time when they change), then pulse the step bits.
//   So every grblHAL feature (backlash, spindle sync, AMASS...) is kept and only the timing moves to the FPGA.
//   8..11     position of axis 0..3 (signed steps; write to set)
//   12        ticks executed since the last flush
//   13        segments executed since the last flush
// More of grblHAL in hardware (Rev 2026-11-22: "any parts of grblhal left that could be in the fpga"):
//   Inputs, bit: 0 limit X, 1 limit Z, 2 probe, 3 e-stop, 4 feed hold, 5 cycle start, 6 reset, 7 limit W.
//   16 IN_LIVE   (read) the 8 inputs after sync, debounce and invert (1 = active)
//   17 IN_LATCH  (read) [7:0] inputs that changed, [15:8] inputs that were active, since the last clear; write 1s to clear
//   18 IN_CFG    [7:0] invert mask, [15:8] hard-stop mask (active = freeze steps + flush at once), [31:16] debounce (us)
//   19 PROBE     write [0] arm  [1] trigger on inactive (probe away); read [0] armed [1] triggered
//   20..23       probe latch: the axis positions at the clock the probe triggered
//   24 HWSTOP    read [0] a hard stop fired, [15:8] the inputs that fired it; write 1 to clear (run stays off until re-armed)
//   25 PWM_PER   spindle 1 PWM period (clocks; 0 = output off)   26 PWM_DUTY  high time (clocks)
//   27 NCO       C spindle-stepper velocity mode: [0] on, [1] direction (1 = negative)
//   28 NCO_INC   target phase increment per clock (step rate = INC * 100 MHz / 2^32)
//   29 NCO_RAMP  max change of the increment per microsecond (acceleration)   30 NCO_CUR (read) the current increment
//   While the NCO is on it owns axis 2 (C): its pulses and position counter; tick/segment steps on C are ignored.
//   127 ID "RVT1"
module revturn_stepgen #(parameter [3:0] SLOT = 4'd1) (
    input  wire        clk,
    input  wire        rstn,
    input  wire [15:0] bus_addr,
    input  wire [31:0] bus_wdata,
    input  wire        bus_we,
    input  wire        bus_re,
    output reg  [31:0] bus_rdata = 32'd0,
    output wire [3:0]  step,
    output wire [3:0]  dir,
    output wire [3:0]  enable,
    input  wire [7:0]  inputs,                // raw input pins (see the input bit list above)
    output reg         spindle_pwm = 1'b0,
    output wire        led_busy
);
    reg [15:0] a_r = 16'd0;
    reg [31:0] wd = 32'd0;
    reg        we_r = 1'b0, re_r = 1'b0;
    always @(posedge clk) begin a_r <= bus_addr; wd <= bus_wdata; we_r <= bus_we; re_r <= bus_re; end
    wire sel = (a_r[15:12] == SLOT);
    wire [9:0] idx = a_r[11:2];
    wire wr = we_r && sel;

    // ---- settings
    reg        run = 1'b0;
    reg [3:0]  en = 4'd0;
    reg [15:0] pw = 16'd200;          // 2 us
    reg [15:0] dsetup = 16'd500;      // 5 us
    reg [3:0]  sinv = 4'd0, dinv = 4'd0;
    reg [3:0]  einv = 4'd0;
    reg        tick = 1'b0;           // tick-stream mode
    // inputs: 2-flop sync, debounce (a change must hold for the debounce time), invert
    reg [7:0]  in1 = 8'd0, in2 = 8'd0, inst = 8'd0, inlive = 8'd0, inchg = 8'd0, inact = 8'd0;
    reg [7:0]  ininv = 8'd0, stopmask = 8'd0;
    reg [15:0] deb_us = 16'd0;
    reg [23:0] debc = 24'd0;
    reg        hwstop = 1'b0;
    reg [7:0]  hwwhy = 8'd0;
    reg        parm = 1'b0, ppol = 1'b0, ptrig = 1'b0;
    reg signed [31:0] ppos [0:3];
    reg [31:0] pwm_per = 32'd0, pwm_duty = 32'd0, pwm_cnt = 32'd0;
    reg        nco_on = 1'b0, nco_dir = 1'b0;
    reg [31:0] nco_tgt = 32'd0, nco_ramp = 32'd0, nco_cur = 32'd0, nco_acc = 32'd0;
    reg [6:0]  nco_us = 7'd0;
    wire       hw_trip = (inlive & stopmask) != 8'd0;
    wire cmd_flush = (wr && idx == 10'd0 && wd[1]) || hw_trip;
    wire cmd_clr = wr && idx == 10'd0 && wd[2];
    always @(posedge clk) if (hw_trip) run <= 1'b0; else if (wr) begin
        if (idx == 10'd0) run <= wd[0] & ~wd[1];
        if (idx == 10'd2) begin pw <= wd[15:0]; dsetup <= wd[31:16]; end
        if (idx == 10'd3) begin sinv <= wd[3:0]; dinv <= wd[11:8]; einv <= wd[19:16]; end
        if (idx == 10'd5) en <= wd[3:0];
        if (idx == 10'd6) tick <= wd[0];
    end
    always @(posedge clk) begin
        in1 <= inputs; in2 <= in1;
        if (in2 == inst) debc <= 24'd0;
        else if (debc >= {deb_us, 6'd0} + {deb_us, 5'd0} + {deb_us, 2'd0}) begin inst <= in2; debc <= 24'd0; end   // deb_us * 100 clocks
        else debc <= debc + 1'b1;
        inlive <= inst ^ ininv;
        if (wr && idx == 10'd17) begin inchg <= inchg & ~wd[7:0]; inact <= inact & ~wd[15:8]; end
        else begin inchg <= inchg | ((inst ^ ininv) ^ inlive); inact <= inact | inlive; end
        if (wr && idx == 10'd18) begin ininv <= wd[7:0]; stopmask <= wd[15:8]; deb_us <= wd[31:16]; end
        if (hw_trip) begin hwstop <= 1'b1; hwwhy <= hwwhy | (inlive & stopmask); end
        else if (wr && idx == 10'd24 && wd[0]) begin hwstop <= 1'b0; hwwhy <= 8'd0; end
        if (wr && idx == 10'd25) pwm_per <= wd;
        if (wr && idx == 10'd26) pwm_duty <= wd;
        if (pwm_per == 32'd0) begin pwm_cnt <= 32'd0; spindle_pwm <= 1'b0; end
        else begin
            pwm_cnt <= (pwm_cnt >= pwm_per - 1'b1) ? 32'd0 : pwm_cnt + 1'b1;
            spindle_pwm <= pwm_cnt < pwm_duty;
        end
        if (wr && idx == 10'd27) begin nco_on <= wd[0]; nco_dir <= wd[1]; end
        if (hw_trip) nco_on <= 1'b0;
        if (wr && idx == 10'd28) nco_tgt <= wd;
        if (wr && idx == 10'd29) nco_ramp <= wd;
        // ramp the increment toward the target once per microsecond. Off stops at once: for a gentle stop the driver
        // ramps the target to 0 first (M5), then turns it off.
        nco_us <= (nco_us == 7'd99) ? 7'd0 : nco_us + 1'b1;
        if (!nco_on) nco_cur <= 32'd0;
        else if (nco_us == 7'd0) begin
            if (nco_cur < nco_tgt) nco_cur <= (nco_tgt - nco_cur > nco_ramp) ? nco_cur + nco_ramp : nco_tgt;
            else if (nco_cur > nco_tgt) nco_cur <= (nco_cur - nco_tgt > nco_ramp) ? nco_cur - nco_ramp : nco_tgt;
        end
    end

    // ---- the FIFO: 2048 x 32 block RAM
    (* ram_style = "block" *) reg [31:0] fifo [0:2047];
    reg [10:0] wp = 11'd0, rp = 11'd0;
    reg [11:0] cnt = 12'd0;
    wire push = wr && idx == 10'd4 && cnt != 12'd2048;
    wire pop;                         // the engine takes a word (F_LAT), same clock
    reg [31:0] fq = 32'd0;
    always @(posedge clk) begin
        if (push) fifo[wp] <= wd;
        fq <= fifo[rp];
    end
    always @(posedge clk) begin
        if (cmd_flush) begin wp <= 11'd0; rp <= 11'd0; cnt <= 12'd0; end
        else begin
            if (push) wp <= wp + 1'b1;
            if (pop) rp <= rp + 1'b1;
            cnt <= cnt + (push ? 12'd1 : 12'd0) - (pop ? 12'd1 : 12'd0);
        end
    end

    // ---- the engine
    // fetching: F_CHK waits for a word, F_WAIT lets the block RAM catch up, F_LAT takes the word and pops it
    localparam E_IDLE = 4'd0, F_CHK = 4'd1, F_WAIT = 4'd2, F_LAT = 4'd3, E_BEGIN = 4'd4, E_SETUP = 4'd5, E_RUN = 4'd6,
               T_DLY = 4'd7, T_FIRE = 4'd8;
    reg [3:0]  st = E_IDLE;
    reg [31:0] tw = 32'd0;            // tick mode: the current word
    reg [27:0] tdly = 28'd0;          // tick mode: clocks left before the tick
    reg [2:0]  wi = 3'd0;                 // word of the segment: 0 header, 1 period, 2 sec, 3..6 steps
    reg [31:0] hdr = 32'd0, period = 32'd100, sec = 32'd0;
    reg [31:0] steps [0:3];
    reg [32:0] acc [0:3];
    reg signed [31:0] pos [0:3];
    reg [23:0] left = 24'd0;
    reg [31:0] pcnt = 32'd0;
    reg [3:0]  dirs = 4'd0;
    reg [15:0] setup = 16'd0;
    reg [15:0] pwc [0:3];
    reg        busy = 1'b0, under = 1'b0;
    reg [31:0] ticks = 32'd0, segs = 32'd0;
    integer k;
    initial for (k = 0; k < 4; k = k + 1) begin steps[k] = 0; acc[k] = 0; pos[k] = 0; pwc[k] = 0; ppos[k] = 0; end
    wire [2:0] amass = hdr[30:28];
    // Bresenham, pipelined: acc only changes on a tick and ticks are >= 8 clocks apart, so the next sum, the
    // compare and the remainder are worked out over the clocks in between (2 register stages), not in one clock.
    reg [31:0] seff [0:3];
    reg [32:0] sum [0:3], rem [0:3];
    reg [3:0]  over = 4'd0;
    always @(posedge clk) for (k = 0; k < 4; k = k + 1) begin
        seff[k] <= steps[k] >> amass;
        sum[k] <= acc[k] + seff[k];
        over[k] <= sum[k] > {1'b0, sec};
        rem[k] <= sum[k] - {1'b0, sec};
    end
    wire have = cnt != 12'd0;
    assign pop = (st == F_LAT) && rstn && !cmd_flush;

    wire [32:0] nco_next = {1'b0, nco_acc} + {1'b0, nco_cur};
    always @(posedge clk) begin
        for (k = 0; k < 4; k = k + 1) if (pwc[k] != 16'd0) pwc[k] <= pwc[k] - 1'b1;
        if (cmd_clr) under <= 1'b0;
        // probe: arm, then latch every position on the clock the probe input reaches the wanted state
        if (wr && idx == 10'd19) begin parm <= wd[0]; ppol <= wd[1]; if (wd[0]) ptrig <= 1'b0; end
        else if (parm && (inlive[2] ^ ppol)) begin
            parm <= 1'b0; ptrig <= 1'b1;
            for (k = 0; k < 4; k = k + 1) ppos[k] <= pos[k];
        end
        // C spindle stepper in velocity mode
        nco_acc <= nco_on ? nco_next[31:0] : 32'd0;
        if (nco_on && nco_next[32]) begin
            pwc[2] <= pw;
            pos[2] <= nco_dir ? pos[2] - 1 : pos[2] + 1;
        end
        if (cmd_flush || !rstn) begin
            st <= E_IDLE; busy <= 1'b0; ticks <= 32'd0; segs <= 32'd0; wi <= 3'd0;
        end else if (wr && idx >= 10'd8 && idx < 10'd12) begin
            pos[idx[1:0]] <= wd;
        end else case (st)
            E_IDLE:  begin busy <= 1'b0; wi <= 3'd0; if (run && have) st <= F_CHK; end
            F_CHK:   if (have) st <= F_WAIT;
            F_WAIT:  st <= F_LAT;
            F_LAT: if (tick) begin
                tw <= fq;
                // delay counts are 10 MHz (x10 clocks); 6 clocks of fetch overhead come off so ticks do not drift
                tdly <= ({fq[23:0], 3'b0} + {fq[23:0], 1'b0} > 28'd7) ? {fq[23:0], 3'b0} + {fq[23:0], 1'b0} - 28'd6 : 28'd1;
                st <= T_DLY;
            end else begin
                case (wi)
                    3'd0: hdr <= fq;
                    3'd1: period <= (fq < 32'd8) ? 32'd8 : fq;
                    3'd2: sec <= fq;
                    default: steps[wi - 3'd3] <= fq;
                endcase
                if ((wi == 3'd1 && !hdr[31]) || wi == 3'd6) begin wi <= 3'd0; st <= E_BEGIN; end
                else begin wi <= wi + 1'b1; st <= F_CHK; end
            end
            T_DLY: if (tdly > 28'd1) tdly <= tdly - 1'b1;
                   else if (tw[27:24] != dirs) begin dirs <= tw[27:24]; setup <= dsetup; st <= E_SETUP; end
                   else st <= T_FIRE;
            T_FIRE: begin
                busy <= 1'b1;
                ticks <= ticks + 1'b1;
                for (k = 0; k < 4; k = k + 1) if (tw[28 + k] && !(nco_on && k == 2)) begin
                    pwc[k] <= pw;
                    pos[k] <= dirs[k] ? pos[k] - 1 : pos[k] + 1;
                end
                if (run && have) st <= F_CHK;
                else begin st <= E_IDLE; if (run) under <= 1'b1; end
            end
            E_BEGIN: begin
                if (hdr[31]) begin                       // a new block: grblHAL starts every counter at sec / 2
                    for (k = 0; k < 4; k = k + 1) acc[k] <= {2'b0, sec[31:1]};
                    if (dirs != hdr[27:24]) setup <= (dsetup < 16'd4) ? 16'd4 : dsetup;
                    dirs <= hdr[27:24];
                end
                if (!hdr[31] || dirs == hdr[27:24]) setup <= 16'd4;   // let the Bresenham pipeline settle
                st <= E_SETUP;
            end
            E_SETUP: if (setup != 16'd0) setup <= setup - 1'b1;
                     else if (tick) st <= T_FIRE;
                     else begin st <= E_RUN; pcnt <= period; left <= hdr[23:0]; busy <= 1'b1; segs <= segs + 1'b1; end
            E_RUN: begin
                if (pcnt > 32'd1) pcnt <= pcnt - 1'b1;
                else begin
                    pcnt <= period;
                    ticks <= ticks + 1'b1;
                    for (k = 0; k < 4; k = k + 1) begin
                        if (over[k]) begin
                            acc[k] <= rem[k];
                            if (!(nco_on && k == 2)) begin
                                pwc[k] <= pw;
                                pos[k] <= dirs[k] ? pos[k] - 1 : pos[k] + 1;
                            end
                        end else acc[k] <= sum[k];
                    end
                    if (left <= 24'd1) begin
                        if (run && have) st <= F_CHK;
                        else begin st <= E_IDLE; if (run) under <= 1'b1; end
                    end else left <= left - 1'b1;
                end
            end
            default: st <= E_IDLE;
        endcase
    end

    always @(posedge clk) if (re_r) begin
        if (!sel) bus_rdata <= 32'd0;
        else case (idx)
            10'd0: bus_rdata <= {31'd0, run};
            10'd1: bus_rdata <= {4'd0, cnt, 12'd0, cnt == 12'd2048, cnt == 12'd0, under, busy};
            10'd2: bus_rdata <= {dsetup, pw};
            10'd3: bus_rdata <= {12'd0, einv, 4'd0, dinv, 4'd0, sinv};
            10'd5: bus_rdata <= {28'd0, en};
            10'd6: bus_rdata <= {31'd0, tick};
            10'd16: bus_rdata <= {24'd0, inlive};
            10'd17: bus_rdata <= {16'd0, inact, inchg};
            10'd18: bus_rdata <= {deb_us, stopmask, ininv};
            10'd19: bus_rdata <= {30'd0, ptrig, parm};
            10'd20: bus_rdata <= ppos[0];
            10'd21: bus_rdata <= ppos[1];
            10'd22: bus_rdata <= ppos[2];
            10'd23: bus_rdata <= ppos[3];
            10'd24: bus_rdata <= {16'd0, hwwhy, 7'd0, hwstop};
            10'd25: bus_rdata <= pwm_per;
            10'd26: bus_rdata <= pwm_duty;
            10'd27: bus_rdata <= {30'd0, nco_dir, nco_on};
            10'd28: bus_rdata <= nco_tgt;
            10'd29: bus_rdata <= nco_ramp;
            10'd30: bus_rdata <= nco_cur;
            10'd8: bus_rdata <= pos[0];
            10'd9: bus_rdata <= pos[1];
            10'd10: bus_rdata <= pos[2];
            10'd11: bus_rdata <= pos[3];
            10'd12: bus_rdata <= ticks;
            10'd13: bus_rdata <= segs;
            10'd127: bus_rdata <= 32'h52565431;          // "RVT1"
            default: bus_rdata <= 32'd0;
        endcase
    end
    assign step = sinv ^ {pwc[3] != 0, pwc[2] != 0, pwc[1] != 0, pwc[0] != 0};
    assign dir = dinv ^ {dirs[3], nco_on ? nco_dir : dirs[2], dirs[1:0]};
    assign enable = einv ^ en;          // 4 pins: X, Z, C, W
    assign led_busy = busy;
endmodule
