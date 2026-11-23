/*
  revturnd: REVTURN (grblHAL) on the Antminer S9 control board, Orphan Linux + the REVTURN FPGA step generator.
  by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later (grblHAL is GPL-3.0).

  grblHAL's core runs unchanged as a Linux process. Its step interrupt (stepper.c) is called by a real-time pump
  thread as fast as the FPGA queue has room; every call is one timer tick and becomes one FIFO word
  {step bits, dir bits, delay}. The FPGA (revturn_stepgen.v, tick-stream mode) plays the ticks back with 10 ns
  timing, so every grblHAL motion feature is kept and Linux only has to keep a 2048-tick queue topped up.
  Also in the FPGA: debounced inputs with an instant hard stop, a probe position latch, the spindle-1 PWM and the
  C spindle stepper (a ramped NCO for M3/M4).

  Axis map: grblHAL X Y Z C (N_AXIS 4, Y idle) -> FPGA axis 0 X, 1 Z, 2 C, 3 W (W is phase 2).
  Streams: TCP port 23 (telnet style, what gSender and ioSender use); several clients may connect, output goes to all.
  Settings: /var/lib/revturn/settings.bin (grblHAL's own NVS image).
*/
#define _GNU_SOURCE
// grblHAL first: <sys/stat.h> defines st_mtime as a macro, which breaks grbl/vfs.h if it comes first
#include "grbl/hal.h"
#include "grbl/grbllib.h"
#include "grbl/protocol.h"
#include "grbl/state_machine.h"
#include "grbl/stream.h"
#include "grbl/system.h"
#include "grbl/settings.h"
#include "grbl/spindle_control.h"

#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <pthread.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <time.h>
#include <sys/time.h>
#include <unistd.h>

#define FPGA_BASE    0x43C00000u
#define SLOT         1
#define F_TIMER      10000000u          // grblHAL step timer: 10 MHz (0.1 us), the FPGA's tick-mode unit
#define FIFO_WORDS   2048
#define LEAD_US      10000        // how far (time) the step "interrupt" may run ahead of the FPGA
#define TELNET_PORT  23
#define MAX_CLIENTS  4
#define NVS_FILE     "/var/lib/revturn/settings.bin"

// FPGA registers (word index, see revturn_stepgen.v)
enum { R_CTRL = 0, R_STATUS, R_PULSE, R_INVERT, R_FIFO, R_ENABLE, R_MODE, R_POS = 8, R_TICKS = 12,
       R_IN_LIVE = 16, R_IN_LATCH, R_IN_CFG, R_PROBE, R_PPOS = 20, R_HWSTOP = 24, R_PWM_PER, R_PWM_DUTY,
       R_NCO, R_NCO_INC, R_NCO_RAMP, R_NCO_CUR, R_ID = 127 };
// input bits (FPGA)
enum { IN_LIM_X = 0, IN_LIM_Z, IN_PROBE, IN_ESTOP, IN_HOLD, IN_START, IN_RESET, IN_LIM_W };

static volatile uint32_t *R;
static inline uint32_t rd (int i) { return R[i]; }
static inline void wr (int i, uint32_t v) { R[i] = v; }
static inline uint32_t fifo_count (void) { return (rd(R_STATUS) >> 16) & 0xFFF; }

// grblHAL axis bit -> FPGA axis bit (X->0, Y->none, Z->1, C->2)
static uint8_t to_fpga (uint32_t grbl_bits)
{
    return (grbl_bits & 1) | ((grbl_bits >> 1) & 2) | ((grbl_bits >> 1) & 4);
}

// ---------------------------------------------------------------- time
static struct timespec t_start;
static uint64_t now_us (void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)(t.tv_sec - t_start.tv_sec) * 1000000u + (t.tv_nsec - t_start.tv_nsec) / 1000;
}
static uint32_t get_elapsed_ticks (void) { return (uint32_t)(now_us() / 1000); }
static uint64_t get_micros (void) { return now_us(); }

typedef struct { uint32_t ms; delay_callback_ptr cb; } delay_job_t;
static void irq_disable (void);
static void irq_enable (void);
static void *delay_thread (void *arg)
{
    delay_job_t *j = arg;
    usleep(j->ms * 1000);
    irq_disable();
    j->cb();
    irq_enable();
    free(j);
    return NULL;
}
static void delay_ms (uint32_t ms, delay_callback_ptr callback)
{
    if(!callback) {
        if(ms) usleep(ms * 1000);
        return;
    }
    if(ms == 0) { callback(); return; }
    delay_job_t *j = malloc(sizeof(delay_job_t));
    j->ms = ms; j->cb = callback;
    pthread_t t;
    pthread_create(&t, NULL, delay_thread, j);
    pthread_detach(t);
}

// ---------------------------------------------------------------- "interrupts": one recursive lock
static pthread_mutex_t irq_lock;
static void irq_disable (void) { pthread_mutex_lock(&irq_lock); }
static void irq_enable (void) { pthread_mutex_unlock(&irq_lock); }
static void set_bits_atomic (volatile uint_fast16_t *p, uint_fast16_t bits) { __atomic_fetch_or(p, bits, __ATOMIC_SEQ_CST); }
static uint_fast16_t clear_bits_atomic (volatile uint_fast16_t *p, uint_fast16_t bits) { return __atomic_fetch_and(p, ~bits, __ATOMIC_SEQ_CST); }
static uint_fast16_t set_value_atomic (volatile uint_fast16_t *p, uint_fast16_t v) { return __atomic_exchange_n(p, v, __ATOMIC_SEQ_CST); }

// ---------------------------------------------------------------- the stepper: grblHAL's ISR -> FPGA ticks
static volatile bool pumping = false, step_busy = false;
static uint32_t cur_period = F_TIMER / 500, next_period = F_TIMER / 500;
static uint8_t tick_steps = 0, dir_bits = 0;
static pthread_mutex_t pump_m = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t pump_c = PTHREAD_COND_INITIALIZER;

// grblHAL disables the drivers $1 ms after it thinks motion ended, but the FPGA may still be playing queued ticks:
// a disable waits (input thread) until the queue is empty and the engine idle.
static volatile bool disable_pending = false;
static inline bool fpga_idle (void) { uint32_t st = rd(R_STATUS); return !(st & 1) && ((st >> 16) & 0xFFF) == 0; }
static volatile uint32_t en_want = 0;      // FPGA enable bits grblHAL asked for: [0] X, [1] Z, [2] C, [3] W

// One enable pin per driver. Turning a driver off waits until the FPGA queue has played out (grblHAL disables the
// motors as soon as it has handed over the last steps), and C stays on while the spindle generator runs it.
static void apply_enable (void)
{
    uint32_t want = en_want;
    if(rd(R_NCO) & 1)
        want |= 4;
    uint32_t cur = rd(R_ENABLE) & 0xF;
    if((cur & ~want) && !fpga_idle()) {
        wr(R_ENABLE, cur | want);
        disable_pending = true;
    } else {
        wr(R_ENABLE, want);
        disable_pending = false;
    }
}

static void stepperEnable (axes_signals_t enable, bool hold)
{
    (void)hold;
    // W has no grblHAL axis yet: its driver follows "any axis on"
    en_want = to_fpga(enable.mask) | (enable.mask ? 8u : 0u);
    apply_enable();
}

static void stepperWakeUp (void)
{
    hal.stepper.enable((axes_signals_t){AXES_BITMASK}, false);
    wr(R_HWSTOP, 1);                       // clear an old hard-stop flag (the input itself must be released)
    wr(R_CTRL, 1);                         // run
    cur_period = next_period = F_TIMER / 500;   // ~2 ms for the drivers to wake up
    pthread_mutex_lock(&pump_m);
    pumping = true;
    pthread_cond_signal(&pump_c);
    pthread_mutex_unlock(&pump_m);
}

// Called at the END of motion (clear_signals false) and also at the START of every motion (st_wake_up, true).
// Neither may flush: the FPGA may still be playing the previous move. Only a real reset flushes (driver_reset).
static void stepperGoIdle (bool clear_signals)
{
    (void)clear_signals;
    pumping = false;
}

static void stepperCyclesPerTick (uint32_t cycles_per_tick)
{
    next_period = cycles_per_tick < 20 ? 20 : cycles_per_tick;     // at most 500 kHz ticks
}

static void stepperPulseStart (stepper_t *stepper)
{
    if(stepper->dir_changed.bits) {
        stepper->dir_changed.bits = 0;
        dir_bits = to_fpga(stepper->dir_out.bits);
    }
    if(stepper->step_out.bits)
        tick_steps = to_fpga(stepper->step_out.bits);
}

static void push_tick (uint32_t delay, uint8_t steps)
{
    while(delay > 0xFFFFFFu) {             // a gap longer than 1.67 s: filler ticks without steps
        wr(R_FIFO, (uint32_t)dir_bits << 24 | 0xFFFFFFu);
        delay -= 0xFFFFFFu;
    }
    wr(R_FIFO, (uint32_t)steps << 28 | (uint32_t)dir_bits << 24 | delay);
}

static void *pump_thread (void *arg)
{
    (void)arg;
    for(;;) {
        pthread_mutex_lock(&pump_m);
        while(!pumping)
            pthread_cond_wait(&pump_c, &pump_m);
        pthread_mutex_unlock(&pump_m);
        step_busy = true;
        while(pumping) {
            // Run grblHAL's step interrupt at most LEAD_US ahead of the FPGA, like a real timer interrupt that is only a
            // little early. Running the whole 2048-word queue ahead at slow feeds used up grblHAL's segment buffer
            // (about 100 ms of motion) at once: if the main loop was a moment late refilling it, the "interrupt" found
            // it empty, ended the cycle in the middle of a block and the stream hung (seen in $F= file runs).
            uint32_t lead = (uint32_t)((uint64_t)F_TIMER * LEAD_US / 1000000u) / (cur_period ? cur_period : 1);
            if(lead < 16) lead = 16;
            if(lead > FIFO_WORDS - 64) lead = FIFO_WORDS - 64;
            uint32_t queued = fifo_count();
            if(queued + 8 > lead) {
                struct timespec t = { 0, 200000 };
                nanosleep(&t, NULL);
                continue;
            }
            for(uint32_t n = lead - queued; n && pumping; n--) {
                irq_disable();
                uint32_t delay = cur_period;
                tick_steps = 0;
                hal.stepper.interrupt_callback();       // grblHAL's step ISR: pulse_start / cycles_per_tick / go_idle
                push_tick(delay, tick_steps);
                cur_period = next_period;
                irq_enable();
            }
        }
        step_busy = false;
    }
    return NULL;
}

// ---------------------------------------------------------------- inputs: limits, control, probe (FPGA)
static limit_signals_t limitsGetState (void)
{
    limit_signals_t s = {0};
    uint32_t in = rd(R_IN_LIVE);
    s.min.x = !!(in & (1 << IN_LIM_X));
    s.min.z = !!(in & (1 << IN_LIM_Z));
    return s;
}

static bool hard_limits = false;
static void limitsEnable (bool on, axes_signals_t homing_cycle)
{
    hard_limits = on && !homing_cycle.mask;
    uint32_t cfg = rd(R_IN_CFG);
    uint32_t stop = 1u << IN_ESTOP;                                   // e-stop always freezes the steps in hardware
    if(hard_limits) stop |= (1u << IN_LIM_X) | (1u << IN_LIM_Z) | (1u << IN_LIM_W);
    wr(R_IN_CFG, (cfg & 0xFFFF00FFu) | stop << 8);
}

static control_signals_t systemGetState (void)
{
    control_signals_t s = {0};
    uint32_t in = rd(R_IN_LIVE);
    s.reset = !!(in & (1 << IN_RESET));
    s.feed_hold = !!(in & (1 << IN_HOLD));
    s.cycle_start = !!(in & (1 << IN_START));
    s.e_stop = !!(in & (1 << IN_ESTOP));
    return s;
}

static probe_state_t probeGetState (void)
{
    probe_state_t s = {0};
    s.connected = On;
    s.triggered = !!(rd(R_IN_LIVE) & (1 << IN_PROBE));
    return s;
}

static void *input_thread (void *arg)
{
    (void)arg;
    uint32_t last = rd(R_IN_LIVE);
    for(;;) {
        usleep(1000);
        if(disable_pending && fpga_idle()) apply_enable();
        uint32_t in = rd(R_IN_LIVE);
        uint32_t chg = (in ^ last) | (rd(R_IN_LATCH) & 0xFF);
        if(chg) {
            wr(R_IN_LATCH, 0xFFFF);
            irq_disable();
            if((chg & ((1 << IN_LIM_X) | (1 << IN_LIM_Z) | (1 << IN_LIM_W))) && hard_limits && hal.limits.interrupt_callback)
                hal.limits.interrupt_callback(limitsGetState());
            if((chg & ((1 << IN_ESTOP) | (1 << IN_HOLD) | (1 << IN_START) | (1 << IN_RESET))) && hal.control.interrupt_callback)
                hal.control.interrupt_callback(systemGetState());
            irq_enable();
            last = in;
        }
    }
    return NULL;
}

// ---------------------------------------------------------------- coolant: none on the lathe (the core requires handlers)
static coolant_state_t coolant_now = {0};
static void coolantSetState (coolant_state_t state) { coolant_now = state; }
static coolant_state_t coolantGetState (void) { return coolant_now; }

// ---------------------------------------------------------------- spindle 0: the C stepper on the FPGA NCO
static spindle_id_t c_spindle_id = -1;
static spindle_state_t c_state = {0};
static int32_t c_pos_at_start = 0;

static float c_steps_per_rev (void)
{
    float spd = settings.axis[3].steps_per_mm;                       // C is in degrees: steps per degree
    return (spd > 0.0f ? spd : 13.333f) * 360.0f;
}

static void c_set_rate (float rpm)
{
    double sps = (double)rpm * c_steps_per_rev() / 60.0;            // steps per second
    wr(R_NCO_INC, (uint32_t)(sps * 4294967296.0 / 100e6));
    // ramp: C acceleration (deg/s^2) as steps/s per microsecond, in phase-increment units
    double acc = (settings.axis[3].acceleration > 0.0f ? settings.axis[3].acceleration : 240.0f * 3600.0f) / 3600.0;
    double sps_per_us = acc * (c_steps_per_rev() / 360.0) / 1e6;
    uint32_t ramp = (uint32_t)(sps_per_us * 4294967296.0 / 100e6);
    wr(R_NCO_RAMP, ramp ? ramp : 1);
}

static void cSpindleSetState (spindle_ptrs_t *spindle, spindle_state_t state, float rpm)
{
    (void)spindle;
    if(state.on && rpm > 0.0f) {
        if(!c_state.on)
            c_pos_at_start = (int32_t)rd(R_POS + 2);
        c_set_rate(rpm);
        wr(R_NCO, 1 | (state.ccw ? 2 : 0));
        apply_enable();                                              // the C driver must be on while it spins
    } else if(c_state.on) {
        wr(R_NCO_INC, 0);                                            // ramp down, then hand C back to grblHAL
        for(int i = 0; i < 5000 && rd(R_NCO_CUR); i++) usleep(1000);
        wr(R_NCO, 0);
        apply_enable();                                              // C off again if grblHAL has it off
        int32_t moved = (int32_t)rd(R_POS + 2) - c_pos_at_start;
        sys.position[3] += moved;                                    // fold the spindle's steps back into C
        wr(R_POS + 2, (uint32_t)sys.position[3]);
    }
    c_state = state;
    c_state.on = state.on && rpm > 0.0f;
}

static spindle_state_t cSpindleGetState (spindle_ptrs_t *spindle)
{
    (void)spindle;
    return c_state;
}

static void cSpindleUpdateRPM (spindle_ptrs_t *spindle, float rpm)
{
    (void)spindle;
    if(c_state.on) c_set_rate(rpm);
}

// ---------------------------------------------------------------- the TCP stream (port 23)
static stream_rx_buffer_t rxbuf;
static enqueue_realtime_command_ptr enqueue_realtime_command = protocol_enqueue_realtime_command;
// Several senders can be connected at once (the screen, gSender, a telnet window). Each one's text is assembled into
// whole lines before it goes into grblHAL's one input buffer (no spliced lines), and every line remembers who sent
// it: its replies (ok / error / $ output) go back to that sender only. Status reports, alarms and the welcome
// message go to everyone.
typedef struct { int fd; uint32_t id; } conn_t;
static conn_t clients[MAX_CLIENTS];
static uint32_t next_conn_id = 1;
static pthread_mutex_t cl_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t rx_lock = PTHREAD_MUTEX_INITIALIZER;
#define OWNERS 1024                            // >= the most lines that fit in the 1024 byte input buffer
static uint32_t owner[OWNERS];
static volatile uint32_t own_head = 0, own_tail = 0;   // written under rx_lock (head) / by the main loop (tail)

static void send_to (uint32_t id, const char *s, size_t n)
{
    for(int i = 0; i < MAX_CLIENTS; i++)
        if(clients[i].fd >= 0 && clients[i].id == id && send(clients[i].fd, s, n, MSG_NOSIGNAL) < 0) {
            shutdown(clients[i].fd, SHUT_RDWR);      // its thread sees the end and frees the slot
        }
}

static void net_broadcast (const char *s, size_t n)
{
    pthread_mutex_lock(&cl_lock);
    for(int i = 0; i < MAX_CLIENTS; i++)
        if(clients[i].fd >= 0 && send(clients[i].fd, s, n, MSG_NOSIGNAL) < 0)
            shutdown(clients[i].fd, SHUT_RDWR);
    pthread_mutex_unlock(&cl_lock);
}

static void net_write (const char *s, size_t n)
{
    pthread_mutex_lock(&cl_lock);
    if(strstr(s, "GrblHAL ") && n < 120 && memchr(s, '[', n))
        own_tail = own_head;                         // the welcome after a reset: lines still waiting were dropped
    uint32_t tail = own_tail;
    bool pending = tail != own_head;
    if(!pending || s[0] == '<' || !strncmp(s, "ALARM", 5)) {
        pthread_mutex_unlock(&cl_lock);
        net_broadcast(s, n);
        return;
    }
    send_to(owner[tail], s, n);
    if(!strncmp(s, "ok", 2) || !strncmp(s, "error:", 6))
        own_tail = (tail + 1) % OWNERS;              // that line is answered
    pthread_mutex_unlock(&cl_lock);
}
static void streamWriteAll (const char *s) { net_broadcast(s, strlen(s)); }
static void streamWrite (const char *s) { net_write(s, strlen(s)); }
static void streamWriteN (const uint8_t *s, uint16_t len) { net_write((const char *)s, len); }
static bool streamPutC (const uint8_t c) { net_write((const char *)&c, 1); return true; }
static bool streamConnected (void) { return true; }

static uint16_t streamRxFree (void)
{
    uint_fast16_t tail = rxbuf.tail, head = rxbuf.head;
    return (RX_BUFFER_SIZE - 1) - ((head >= tail) ? head - tail : RX_BUFFER_SIZE - tail + head);
}
static uint16_t streamRxCount (void)
{
    uint_fast16_t tail = rxbuf.tail, head = rxbuf.head;
    return (head >= tail) ? head - tail : RX_BUFFER_SIZE - tail + head;
}
static int32_t streamGetC (void)
{
    uint_fast16_t tail = rxbuf.tail;
    if(tail == rxbuf.head) return -1;
    int32_t c = rxbuf.data[tail];
    rxbuf.tail = (tail + 1) & (RX_BUFFER_SIZE - 1);
    return c;
}
static void streamRxFlush (void) { rxbuf.tail = rxbuf.head; own_tail = own_head; }   // a reset: no replies owed
static void streamRxCancel (void)
{
    own_tail = own_head;
    rxbuf.data[rxbuf.head] = ASCII_CAN;
    rxbuf.tail = rxbuf.head;
    rxbuf.head = (rxbuf.tail + 1) & (RX_BUFFER_SIZE - 1);
}
static bool streamSuspendInput (bool suspend) { return stream_rx_suspend(&rxbuf, suspend); }
static bool streamEnqueueRtCommand (uint8_t c) { return enqueue_realtime_command(c); }
static enqueue_realtime_command_ptr streamSetRtHandler (enqueue_realtime_command_ptr handler)
{
    enqueue_realtime_command_ptr prev = enqueue_realtime_command;
    if(handler) enqueue_realtime_command = handler;
    return prev;
}

// one whole line from client <id> into grblHAL's input buffer (waits for room: TCP back-pressure for big senders)
static void push_line (uint32_t id, const uint8_t *line, size_t n)
{
    for(;;) {
        pthread_mutex_lock(&rx_lock);
        if(streamRxFree() >= n + 1 && (own_head + 1) % OWNERS != own_tail)
            break;
        pthread_mutex_unlock(&rx_lock);
        usleep(1000);
    }
    owner[own_head] = id;                        // before the line is visible to the main loop
    own_head = (own_head + 1) % OWNERS;
    uint_fast16_t head = rxbuf.head;
    for(size_t i = 0; i < n; i++) {
        rxbuf.data[head] = line[i];
        head = (head + 1) & (RX_BUFFER_SIZE - 1);
    }
    rxbuf.data[head] = '\n';
    __atomic_store_n(&rxbuf.head, (head + 1) & (RX_BUFFER_SIZE - 1), __ATOMIC_RELEASE);
    pthread_mutex_unlock(&rx_lock);
}

static void *client_thread (void *arg)
{
    int slot = (int)(intptr_t)arg;
    int fd = clients[slot].fd;
    uint32_t id = clients[slot].id;
    uint8_t buf[512], line[512];
    size_t len = 0;
    uint8_t last = 0;
    ssize_t n;
    while((n = recv(fd, buf, sizeof(buf), 0)) > 0)
        for(ssize_t i = 0; i < n; i++) {
            uint8_t c = buf[i];
            if(enqueue_realtime_command(c))          // ?, !, ~, ctrl-x... handled at once
                continue;
            if(c == '\r' || c == '\n') {
                if(!(c == '\n' && last == '\r' && len == 0))   // CR LF = one line
                    push_line(id, line, len);
                len = 0;
            } else if(len < sizeof(line) - 1)
                line[len++] = c;                     // longer lines are cut; grblHAL reports its own overflow
            last = c;
        }
    pthread_mutex_lock(&cl_lock);
    clients[slot].fd = -1;
    pthread_mutex_unlock(&cl_lock);
    close(fd);
    return NULL;
}

static void *listen_thread (void *arg)
{
    (void)arg;
    int s = socket(AF_INET, SOCK_STREAM, 0), one = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
    struct sockaddr_in a = { .sin_family = AF_INET, .sin_port = htons(TELNET_PORT), .sin_addr.s_addr = htonl(INADDR_ANY) };
    if(bind(s, (struct sockaddr *)&a, sizeof(a)) || listen(s, 4)) { perror("revturnd: port 23"); exit(1); }
    for(;;) {
        int c = accept(s, NULL, NULL);
        if(c < 0) continue;
        setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
        pthread_mutex_lock(&cl_lock);
        int slot = -1;
        for(int i = 0; i < MAX_CLIENTS; i++) if(clients[i].fd < 0) { slot = i; break; }
        if(slot >= 0) { clients[slot].fd = c; clients[slot].id = next_conn_id++; }
        pthread_mutex_unlock(&cl_lock);
        if(slot < 0) { close(c); continue; }
        pthread_t t;
        pthread_create(&t, NULL, client_thread, (void *)(intptr_t)slot);
        pthread_detach(t);
        // a new client sees the welcome message, like a fresh serial connection
        grbl.report.init_message(hal.stream.write_all);
    }
    return NULL;
}

static const io_stream_t telnet_stream = {
    .type = StreamType_Telnet,
    .is_connected = streamConnected,
    .read = streamGetC,
    .write = streamWrite,
    .write_n = streamWriteN,
    .write_char = streamPutC,
    .write_all = streamWriteAll,
    .enqueue_rt_command = streamEnqueueRtCommand,
    .get_rx_buffer_free = streamRxFree,
    .get_rx_buffer_count = streamRxCount,
    .reset_read_buffer = streamRxFlush,
    .cancel_read_buffer = streamRxCancel,
    .suspend_read = streamSuspendInput,
    .set_enqueue_rt_handler = streamSetRtHandler
};

// ---------------------------------------------------------------- settings storage: a file
static bool nvsRead (uint8_t *dest)
{
    FILE *f = fopen(NVS_FILE, "rb");
    if(!f) return false;
    size_t n = fread(dest, 1, hal.nvs.size, f);
    fclose(f);
    return n == hal.nvs.size;
}
static bool nvsWrite (uint8_t *source)
{
    mkdir("/var/lib/revturn", 0755);
    FILE *f = fopen(NVS_FILE ".new", "wb");
    if(!f) return false;
    bool ok = fwrite(source, 1, hal.nvs.size, f) == hal.nvs.size;
    fflush(f); fsync(fileno(f)); fclose(f);
    return ok && rename(NVS_FILE ".new", NVS_FILE) == 0;
}

// ---------------------------------------------------------------- settings -> FPGA
static void settings_changed (settings_t *s, settings_changed_flags_t changed)
{
    (void)changed;
    uint32_t pw = (uint32_t)(s->steppers.pulse_microseconds * 100.0f);
    uint32_t dsu = (uint32_t)((s->steppers.pulse_delay_microseconds > 0.0f ? s->steppers.pulse_delay_microseconds : 2.0f) * 100.0f);
    wr(R_PULSE, (pw < 50 ? 50 : pw) | (dsu > 0xFFFF ? 0xFFFF : dsu) << 16);
    wr(R_INVERT, to_fpga(s->steppers.step_invert.mask) | to_fpga(s->steppers.dir_invert.mask) << 8 |
                 (uint32_t)(to_fpga(s->steppers.enable_invert.mask) | (s->steppers.enable_invert.mask & 1 ? 8u : 0u)) << 16);   // W follows X's polarity
    // inputs: switches to GND with pull-ups -> active low, inverted here; grblHAL's invert masks flip them back
    uint32_t inv = 0xFF;
    if(s->limits.invert.x) inv ^= 1 << IN_LIM_X;
    if(s->limits.invert.z) inv ^= 1 << IN_LIM_Z;
    if(s->probe.invert_probe_pin) inv ^= 1 << IN_PROBE;
    if(s->control_invert.e_stop) inv ^= 1 << IN_ESTOP;
    if(s->control_invert.feed_hold) inv ^= 1 << IN_HOLD;
    if(s->control_invert.cycle_start) inv ^= 1 << IN_START;
    if(s->control_invert.reset) inv ^= 1 << IN_RESET;
    uint32_t cfg = rd(R_IN_CFG);
    wr(R_IN_CFG, (cfg & 0x0000FF00u) | inv | 500u << 16);            // 500 us debounce
}

static bool driver_setup (settings_t *s)
{
    wr(R_MODE, 1);                                                   // tick-stream mode
    wr(R_CTRL, 2);
    settings_changed(s, (settings_changed_flags_t){0});
    limitsEnable(s->limits.flags.hard_enabled, (axes_signals_t){0});
    pthread_t t;
    pthread_create(&t, NULL, input_thread, NULL);
    pthread_detach(t);
    return true;
}

static void driver_reset (void)            // soft reset / abort: stop at once and drop the queued ticks
{
    pumping = false;
    wr(R_CTRL, 2);
    dir_bits = 0;
}

// ---------------------------------------------------------------- init
/* ---- clock: $RTC (the screen sends $RTC=<its time> on connect) ---- */

static bool rtc_get(struct tm *dt)
{
    time_t t = time(NULL);
    return localtime_r(&t, dt) != NULL;
}

// Linux keeps the time (NTP). The screen's time is only taken when the board's clock was never set (no network
// time yet: year before 2025), so a phone or laptop with a wrong clock cannot move a synced board.
static bool rtc_set(struct tm *dt)
{
    time_t now = time(NULL);
    struct tm cur;
    localtime_r(&now, &cur);
    if (cur.tm_year + 1900 < 2025) {
        struct tm copy = *dt;
        struct timeval tv = { .tv_sec = mktime(&copy), .tv_usec = 0 };
        if (tv.tv_sec != (time_t)-1)
            settimeofday(&tv, NULL);
    }
    return true;
}

bool driver_init (void)
{
    int fd = open("/dev/mem", O_RDWR | O_SYNC);
    if(fd < 0) { perror("revturnd: /dev/mem"); return false; }
    void *m = mmap(NULL, 0x10000, PROT_READ | PROT_WRITE, MAP_SHARED, fd, FPGA_BASE);
    close(fd);
    if(m == MAP_FAILED) { perror("revturnd: mmap"); return false; }
    R = (volatile uint32_t *)((uint8_t *)m + SLOT * 0x1000);
    if(rd(R_ID) != 0x52565431u) {
        fprintf(stderr, "revturnd: the REVTURN FPGA core (ID RVT1) is not loaded: ardzy load orphan_revturn\n");
        return false;
    }

    hal.info = "S9";
    hal.driver_version = "261122";
    hal.driver_url = "https://github.com/revjmoney/revturn-lathe-firmware";
    hal.board = "Antminer S9 + Orphan (REVTURN FPGA)";
    hal.driver_setup = driver_setup;
    hal.f_mcu = 667;
    hal.f_step_timer = F_TIMER;
    hal.rx_buffer_size = RX_BUFFER_SIZE;
    hal.delay_ms = delay_ms;
    hal.get_elapsed_ticks = get_elapsed_ticks;
    hal.get_micros = get_micros;
    hal.irq_enable = irq_enable;
    hal.irq_disable = irq_disable;
    hal.set_bits_atomic = set_bits_atomic;
    hal.clear_bits_atomic = clear_bits_atomic;
    hal.set_value_atomic = set_value_atomic;
    hal.driver_reset = driver_reset;
    hal.step_us_min = 0.5f;

    hal.stepper.wake_up = stepperWakeUp;
    hal.stepper.go_idle = stepperGoIdle;
    hal.stepper.enable = stepperEnable;
    hal.stepper.cycles_per_tick = stepperCyclesPerTick;
    hal.stepper.pulse_start = stepperPulseStart;

    hal.limits.enable = limitsEnable;
    hal.limits.get_state = limitsGetState;
    hal.control.get_state = systemGetState;
    hal.probe.get_state = probeGetState;
    hal.coolant.set_state = coolantSetState;
    hal.coolant.get_state = coolantGetState;
    hal.signals_cap.reset = hal.signals_cap.feed_hold = hal.signals_cap.cycle_start = hal.signals_cap.e_stop = On;
    hal.driver_cap.software_debounce = On;
    hal.driver_cap.step_pulse_delay = On;     // the FPGA waits the dir setup time before a step (PULSE[31:16])
    hal.driver_cap.rtc = On;
    hal.driver_cap.rtc_set = On;
    hal.rtc.get_datetime = rtc_get;
    hal.rtc.set_datetime = rtc_set;

    hal.nvs.type = NVS_Flash;
    hal.nvs.size_max = NVS_SIZE_MAX;
    hal.nvs.memcpy_from_flash = nvsRead;
    hal.nvs.memcpy_to_flash = nvsWrite;

    grbl.on_settings_changed = settings_changed;

    static const spindle_ptrs_t c_spindle = {
        .type = SpindleType_Stepper,
        .cap.variable = On,
        .cap.direction = On,
        .set_state = cSpindleSetState,
        .get_state = cSpindleGetState,
        .update_rpm = cSpindleUpdateRPM
    };
    c_spindle_id = spindle_register(&c_spindle, "C stepper (FPGA)");

    for(int i = 0; i < MAX_CLIENTS; i++) clients[i].fd = -1;
    memset(&rxbuf, 0, sizeof(rxbuf));
    stream_connect(&telnet_stream);

    pthread_t t;
    pthread_create(&t, NULL, listen_thread, NULL);
    pthread_detach(t);

    // the step pump: real-time priority, on CPU 1
    pthread_attr_t at;
    pthread_attr_init(&at);
    pthread_attr_setinheritsched(&at, PTHREAD_EXPLICIT_SCHED);
    pthread_attr_setschedpolicy(&at, SCHED_FIFO);
    struct sched_param sp = { .sched_priority = 80 };
    pthread_attr_setschedparam(&at, &sp);
    cpu_set_t cpus;
    CPU_ZERO(&cpus);
    CPU_SET(1, &cpus);
    pthread_attr_setaffinity_np(&at, sizeof(cpus), &cpus);
    if(pthread_create(&t, &at, pump_thread, NULL)) {
        fprintf(stderr, "revturnd: no real-time priority for the step pump, running it normally\n");
        pthread_create(&t, NULL, pump_thread, NULL);
    }
    pthread_detach(t);

    return hal.version == HAL_VERSION;
}

#include <execinfo.h>
static void on_crash (int sig)
{
    void *bt[32];
    int n = backtrace(bt, 32);
    fprintf(stderr, "revturnd: crashed (signal %d), backtrace:\n", sig);
    backtrace_symbols_fd(bt, n, 2);
    _exit(1);
}

int main (void)
{
    clock_gettime(CLOCK_MONOTONIC, &t_start);
    signal(SIGSEGV, on_crash);
    signal(SIGBUS, on_crash);
    signal(SIGPIPE, SIG_IGN);
    mlockall(MCL_CURRENT | MCL_FUTURE);
    pthread_mutexattr_t ma;
    pthread_mutexattr_init(&ma);
    pthread_mutexattr_settype(&ma, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(&irq_lock, &ma);
    fprintf(stderr, "revturnd: REVTURN (grblHAL) on the S9 | by JMSCNC, makers of RotatoCAM | telnet port %d\n", TELNET_PORT);
    grbl_enter();
    return 0;
}
