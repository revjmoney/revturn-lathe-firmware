`timescale 1ns / 1ps
// [orphan] REVTURN on the S9: slot 0 info ("RVT1"), slot 1 the step generator (revturn_stepgen.v), slot 15 fans.
// Outputs (3.3 V, buffer them to 5 V for the drivers): J6 = X step/dir, Z step/dir; J7 = C step/dir, W step/dir;
// J8 pin 5 = enable. LED D5 = a segment is running.
// by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later. Built on Ardzy (by chryso, GPL-3.0).
module top (
    output wire [3:0] step,
    output wire [3:0] dir,
    output wire       enable,
    input  wire [7:0] lathe_in,           // J9: limit X, limit Z, probe, e-stop; J1: hold, start, reset, limit W
    output wire       spindle_pwm,        // J8 pin 11
    output wire [3:0] leds,
    output wire       fan_pwm,
    input  wire [5:0] fan_tach
);
    wire clk, rstn, we, re;
    wire [15:0] addr;
    wire [31:0] wdata, rd_info, rd_sg, rd_fan;
    wire [3:0]  wstrb, info_leds_n;
    wire        busy;
    ardzy_bus u_bus (.clk(clk), .rstn(rstn), .bus_addr(addr), .bus_wdata(wdata), .bus_wstrb(wstrb),
                     .bus_we(we), .bus_re(re), .bus_rdata(rd_info | rd_sg | rd_fan));
    ardzy_info #(.SLOT(0), .PROJECT("RVT1"), .VERSION(1)) u_info (
        .clk(clk), .rstn(rstn), .bus_addr(addr), .bus_wdata(wdata), .bus_we(we), .bus_re(re),
        .bus_rdata(rd_info), .leds_n(info_leds_n));
    revturn_stepgen #(.SLOT(1)) u_sg (
        .clk(clk), .rstn(rstn), .bus_addr(addr), .bus_wdata(wdata), .bus_we(we), .bus_re(re), .bus_rdata(rd_sg),
        .step(step), .dir(dir), .enable(enable), .inputs(lathe_in), .spindle_pwm(spindle_pwm), .led_busy(busy));
    orphan_fan #(.SLOT(15)) u_fan (
        .clk(clk), .rstn(rstn), .bus_addr(addr), .bus_wdata(wdata), .bus_we(we), .bus_re(re),
        .bus_rdata(rd_fan), .fan_pwm(fan_pwm), .fan_tach(fan_tach));
    assign leds = {info_leds_n[3:2], info_leds_n[1], ~busy};
endmodule
