# REVTURN Lathe Control Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single web page served from the lathe (`http://revturn.local/lathe.html`) that gives Rev a classic conversational-control screen: big DRO, keypad + MDI, jog, zeroing, five conversational cycles, saved programs.

**Architecture:** Plain ES-module JavaScript. Pure logic (status parsing, DRO formatting, keypad, jog, cycle g-code generators, program model) lives in small modules with Vitest unit tests. A thin UI layer binds them to the DOM. esbuild bundles everything into one gzipped HTML file that is FTP-uploaded to the lathe's LittleFS root. The page talks to grblHAL over the WebUI v3 WebSocket (binary frames) and runs programs from the lathe's flash with `$F=`.

**Tech Stack:** Node 26 (installed), npm (cache `F:\micro-lathe\.cache\npm`), Vitest, esbuild, plain HTML/CSS/JS, git (local repo in `F:\micro-lathe\lathe-ui`).

**Spec:** `F:\micro-lathe\lathe-ui\docs\2026-11-08-lathe-control-screen-design.md` (approved by Rev 2026-11-08). Mockup: `F:\micro-lathe\.superpowers\brainstorm\1848-1794160108\content\dro-screen-v2.html`.

## Global Constraints

- Branding: **REVTURN**. Never the ProtoTRAK name, logo or wording.
- Axes shown: **X, Z, and the spindle line (S rpm or C angle)**. **Y never appears.**
- Every generated program starts with `G7 G18 G20 G90 G94` (diameter, XZ plane, inches, absolute, IPM).
- Feeds entered and generated in **inches per minute**; forms also show IPR = IPM / rpm for reference.
- Directions: X+ away from centerline (tool on the front), Z+ away from chuck, Z0 = part face. Cycles retract **+X first, then +Z**.
- Spindle rpm ceiling: read `$30` from the machine (currently 40); forms refuse rpm above it.
- Generated motion only ever starts from **GO** (preview first, second GO runs). Nothing auto-runs.
- **HOLD** (feed hold `!`, resume `~`; during jog sends `0x85`) and **STOP** (soft reset `0x18`) are visible on every screen, phone layout included.
- grbl input goes over **binary** WebSocket frames on `ws://<host>:81/`, subprotocol `webui-v3`. Text frames are for `PING:` only.
- Reports arrive in **mm** (`$13=0`); the UI converts to inches. In G7 grblHAL already reports X as diameter (`|D:1` present): **do not double it again**.
- C is degrees, commanded absolute; the 0-360 value is display only.
- Deploy target: LittleFS root via `curl -T dist/lathe.html.gz ftp://revturn.local/`. Do not touch `/index.html.gz` (ESP3D WebUI).
- No firmware changes.
- npm commands run with `npm_config_cache=F:\micro-lathe\.cache\npm` (the sandbox blocks the AppData cache).

## Review Focus

1. A status report split across two WebSocket frames, or two reports in one frame: the DRO must show complete reports only, never garbage. (Test in Task 1.)
2. Units: a mm report shown in inches, and X in G7 not doubled twice. A wrong factor of 25.4 or 2 must be caught. (Test in Task 2.)
3. Thread passes when the current C is negative, fractional or very large: every pass must start at the same angle, and C must only ever increase. (Test in Task 3.)
4. Bad form input (empty, `-`, `1..2`, depth larger than the radius, rpm above `$30`, zero passes): GO refuses with a plain message and generates nothing. (Test in Task 3 and Task 6.)
5. Connection lost mid-use: the screen shows DISCONNECTED in red and stops accepting GO, jog and zero, but STOP stays live once reconnected. Reconnect is automatic. (Test in Task 1.)

---

### Task 1: Project scaffold and lathe link (WebSocket transport)

**Files:**
- Create: `F:\micro-lathe\lathe-ui\package.json`, `.gitignore` (`node_modules`, `dist`)
- Create: `src/link.js`
- Create: `tools/probe.mjs` (live check against the lathe)
- Test: `test/link.test.js`

**Interfaces:**
- Produces: `class LatheLink extends EventTarget` with `constructor(url, {WebSocketImpl = globalThis.WebSocket, reconnectMs = 2000} = {})`, `connect()`, `sendLine(text: string)` (appends `\n`, binary frame), `sendRealtime(byte: number)` (one-byte binary frame), `get connected(): boolean`. Events: `line` (`detail: string`, one complete line without CR/LF), `status` (`detail: string`, a complete `<...>` report), `connection` (`detail: {connected: boolean}`).
- Produces: `splitLines(buffer: string, chunk: string) -> {lines: string[], rest: string}`.

- [ ] **Step 1:** `git init` in `F:\micro-lathe\lathe-ui`, create `package.json` with scripts `test: vitest run`, `build: node tools/build.mjs`, devDependencies `vitest`, `esbuild`; run `npm install` with the cache env var.
- [ ] **Step 2: Write failing tests** in `test/link.test.js`:
  - `splitLines('', '<Idle|MPos:0,0,0,0>\r\nok\r\n<Ru')` returns `lines` `['<Idle|MPos:0,0,0,0>', 'ok']`, `rest` `'<Ru'`.
  - feeding `'<Ru'` then `'n|MPos:1,0,0,0>\r\n'` yields one `status` event `'<Run|MPos:1,0,0,0>'`.
  - status reports go to `status`, everything else to `line`; empty lines dropped.
  - with a fake WebSocket, `sendLine('G0 X1')` sends a binary payload equal to bytes of `'G0 X1\n'`; `sendRealtime(0x85)` sends `Uint8Array([0x85])`.
  - fake socket closes: `connection` fires `{connected:false}`, and a new socket is created after `reconnectMs`.
- [ ] **Step 3:** run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 4:** implement `src/link.js`. Open with protocols `['webui-v3']`, `binaryType = 'arraybuffer'`, decode with `TextDecoder`, ignore text frames (they are `PING:`/`currentID:` noise).
- [ ] **Step 5:** run `npm test`. Expected: PASS.
- [ ] **Step 6: Live probe.** `tools/probe.mjs` connects with Node's WebSocket, sends realtime `?` (0x3F) and prints the first `status` line. Run `node tools/probe.mjs ws://revturn.local:81/`. Expected: a line starting `<Idle|` (or `<Alarm|`). If no status arrives, stop and report: the transport assumption is wrong.
- [ ] **Step 7:** commit `feat: lathe link over webui-v3 websocket`.

### Task 2: Status parser and DRO model

**Files:**
- Create: `src/status.js`, `src/dro.js`
- Test: `test/status.test.js`, `test/dro.test.js`

**Interfaces:**
- Consumes: status strings from Task 1.
- Produces: `parseStatus(report: string, prev?: MachineState) -> MachineState` where `MachineState = {state: string, sub: string|null, mpos: number[4], wco: number[4], wpos: number[4], feed: number, rpm: number, spindle: 'off'|'cw'|'ccw', diameter: boolean, ov: number[3]|null}` (positions in mm/deg, index 0 X, 1 Y, 2 Z, 3 C; WCO persists from `prev` when the report omits it; wpos = mpos − wco when only MPos is given).
- Produces: `droView(s: MachineState, units: 'in'|'mm') -> {x: string, z: string, spindleLabel: 'S'|'C', spindleValue: string, spindleTag: string, xTag: 'DIA'|'RAD', state: string}`.

- [ ] **Step 1: Write failing tests** with these exact cases:
  - `parseStatus('<Idle|MPos:0.000,0.000,0.000,0.000|Bf:100,1022|FS:0,0,0|S:0|Ov:100,100,100|A:|Sc:|TLR:0>')` gives `state 'Idle'`, `mpos [0,0,0,0]`, `spindle 'off'`, `ov [100,100,100]`.
  - `'<Run|MPos:12.700,0,-25.400,90|WCO:2.540,0,0,0|FS:76.2,40|A:S|D:1>'` gives `wpos[0] 10.16`, `rpm 40`, `spindle 'cw'`, `diameter true`.
  - `A:C` gives `'ccw'`. `'<Hold:0|...>'` gives `state 'Hold'`, `sub '0'`.
  - A later report without `WCO:` keeps the previous WCO.
  - `droView` with wpos X 25.4 mm, Z −12.7, `units 'in'`, `diameter true`: x `'1.0000'`, z `'-0.5000'`, xTag `'DIA'` (no extra doubling).
  - spindle `'cw'` at rpm 40: spindleLabel `'S'`, spindleValue `'40 RPM'`, spindleTag `'FWD'`.
  - spindle `'off'`, C wpos 487.5: spindleLabel `'C'`, spindleValue `'127.50°'`. C −90: `'270.00°'`.
  - mm units: 4 decimals in inches, 3 in mm.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: status parser and DRO view model`.

### Task 3: Conversational cycle generators

**Files:**
- Create: `src/cycles/common.js`, `face.js`, `turn.js`, `thread.js`, `groove.js`, `index.js`
- Test: `test/cycles.test.js`

**Interfaces:**
- Produces: each module exports `generate(params, ctx) -> {ok: true, lines: string[]} | {ok: false, error: string}`. `ctx = {maxRpm: number, c0: number /* current absolute C, deg */}`. All values inches / IPM / rpm / degrees.
- Produces: `common.js`: `HEADER = ['G7 G18 G20 G90 G94']`, `fmt(n) -> string` (4 decimals, no `-0.0000`), `validate(params, schema) -> string|null` where schema entries are `{name, min?, max?, int?, required?}`; also `FOOTER(retract)` = rapid `+X` then `+Z` to `retract`, then `M5`.
- Params:
  - Face: `{startDia, endDia=0, zStart, depth, step, feed, rpm, clearance=0.05}`.
  - Turn: `{startDia, finishDia, zStart, length, step, finishAllow, roughFeed, finishFeed, rpm, endDia?, clearance=0.05}` (endDia set = taper; finish pass goes from finishDia at zStart to endDia at zStart−length).
  - Thread: `{tpi?, pitch?, majorDia, depth?, zStart, length, passes, springPasses=1, internal=false, rpm, leadIn=0.1}`; pitch = 1/tpi if tpi given; default depth = 0.6134 × pitch per side; pass k (1..passes) cumulative depth = depth × sqrt(k / passes).
  - Groove: `{dia, z, width, depth, peck, feed, rpm, toolWidth}`; depth ≥ dia/2 means part-off to center.
  - Index: `{angle}` or `{divisions, step}`; always emits `M5` first.

- [ ] **Step 1: Write failing tests:**
  - every successful result starts with `'G7 G18 G20 G90 G94'`, contains `M3 S<rpm>` before the first `G1` (except Index), and ends with `M5`.
  - Face `{startDia:1, zStart:0, depth:0.02, step:0.01, feed:2, rpm:30}`: two passes, Z values `-0.0100` and `-0.0200`, each a `G1 X0.0000` move, retract to `X1.1000` (startDia + 2×clearance) before `Z`.
  - Turn `{startDia:1, finishDia:0.8, zStart:0, length:0.5, step:0.05, finishAllow:0.01, roughFeed:3, finishFeed:1.5, rpm:30}`: roughing diameters `0.9000`, `0.8200`, finish at `X0.8000` with `F1.5`, every cut ends at `Z-0.5000`; with `endDia:0.7` the finish line ends at `X0.7000 Z-0.5000`.
  - Thread `{tpi:20, majorDia:0.25, zStart:0, length:0.5, passes:4, springPasses:1, rpm:30}`, `ctx.c0 = -37.5`: pitch 0.05; Z feed `F1.5000` (pitch × rpm); every pass's `G1` starts from the same C modulo 360 and each pass's start C ≥ the previous pass's end C; C travel per pass = (length + leadIn) / pitch × 360 = 4320.0000; the last real pass reaches X = 0.25 − 2 × 0.6134 × 0.05 = `0.1887`; one extra pass at the same X (spring).
  - Thread with `ctx.c0 = 1e6 + 12.3` still gives monotonically increasing C.
  - Groove part-off `{dia:0.5, z:-1, width:0.1, depth:0.25, peck:0.05, feed:0.5, rpm:20, toolWidth:0.1}`: plunges to `X0.0000`.
  - Index positions are `step × 360 / divisions` degrees in work coordinates; the generator moves to the smallest absolute C ≥ `c0` with that value mod 360 (C only ever moves forward). `{divisions:6, step:2}`, `c0:10` → `M5` then `G0 C120.0000`. `{angle:45}`, `c0:400` → `G0 C405.0000`.
  - Errors: empty `rpm` → `'RPM is required'`; rpm 50 with maxRpm 40 → `'RPM above machine limit (40)'`; Face `depth` 0 → error; Turn `finishDia >= startDia` → error; Thread `passes: 0` → error.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: conversational cycle generators`.

### Task 4: Keypad, zero/set and jog commands

**Files:**
- Create: `src/keypad.js`, `src/jog.js`
- Test: `test/keypad.test.js`, `test/jog.test.js`

**Interfaces:**
- Produces: `class Keypad` with `press(key: string, ctx?: {current?: number}) -> Action|null`, `get display(): string`, keys `'0'..'9' '.' '+/-' 'X' 'Z' 'C' 'ABS SET' 'INC SET' 'ENTER' 'CLEAR'`. `Action = {type: 'line', line: string}`.
- Produces: `zeroLine(axis: 'X'|'Z'|'C'|'ALL') -> string` and `setLine(axis, value) -> string`.
- Produces: `jogLine({axis, dir: 1|-1, step: number|'cont', feed}) -> string`, `JOG_CANCEL = 0x85`, `CONT_DISTANCE = {X: 2, Z: 10, C: 3600}`.

- [ ] **Step 1: Write failing tests:**
  - `zeroLine('X')` = `'G10 L20 P0 X0'`, `'ALL'` = `'G10 L20 P0 X0 Z0 C0'`.
  - keys `X 1 . 2 5 ABS SET` → `{type:'line', line:'G10 L20 P0 X1.25'}` (X is diameter because the UI runs in G7).
  - `INC SET` adds the typed value to the axis's current work reading: `press('INC SET', {current: 0.5})` after `Z 0 . 1` → `'G10 L20 P0 Z0.6'`.
  - `+/-` toggles the sign; `CLEAR` resets; a second `.` is ignored; `ABS SET` with no number returns `null`.
  - `jogLine({axis:'X', dir:-1, step:0.001, feed:10})` = `'$J=G91 G20 X-0.001 F10'`; `step 'cont'` on Z+ = `'$J=G91 G20 Z10 F<feed>'`; C uses degrees: `'$J=G91 C-15 F<feed>'` (no G20).
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: keypad, zero and jog commands`.

### Task 5: Programs and files on the lathe

**Files:**
- Create: `src/program.js`, `src/files.js`
- Test: `test/program.test.js`, `test/files.test.js`

**Interfaces:**
- Consumes: cycle `generate()` from Task 3.
- Produces: `Program = {name: string, steps: Array<{cycle: 'face'|'turn'|'thread'|'groove'|'index'|'gcode', params: object}>}`; `compileProgram(p: Program, ctx) -> {ok, lines|error, stepIndex?}` (one header at the top, `M5` and `M30` at the end, per-step header lines removed, `(STEP n: <cycle>)` comments between steps); `safeName(name) -> string` (`[a-z0-9_-]`, max 24 chars).
- Produces: `files.js`: `uploadFile(host, path, text, fetchImpl=fetch) -> Promise<void>` (multipart POST to `http://<host>/files` with field `path=/` and the file; verify with a following `GET /files?path=/&action=list`); `listFiles(host, fetchImpl) -> Promise<string[]>`; `runLine(fileName) -> string` = `'$F=/' + fileName`.
- Program files: `<name>.json` (the Program) and `<name>.nc` (compiled), both in `/`.

- [ ] **Step 1: Write failing tests:** compile of [face, turn] has exactly one `G7 G18 G20 G90 G94`, ends with `M30`; an invalid step returns `{ok:false, stepIndex:1}`; `safeName('My Part #1!')` = `'my_part_1'`; `uploadFile` with a mocked fetch posts FormData containing `path` `/` and a file named `x.nc`; `runLine('x.nc')` = `'$F=/x.nc'`.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5: Live check** (lathe idle): upload a 2-line file `probe.nc` (`G4 P0.1`, `M2`) with `tools/probe.mjs --upload`, then list files. Expected: `probe.nc` listed. Delete it after (`GET /files?path=/&action=delete&filename=probe.nc`).
- [ ] **Step 6:** commit `feat: programs and lathe file storage`.

### Task 6: Screen shell: DRO, keypad, MDI, HOLD/STOP, phone layout

**Files:**
- Create: `src/index.html`, `src/style.css`, `src/app.js`, `src/ui/dro.js`, `src/ui/keypad.js`, `src/ui/mdi.js`, `src/errors.js`
- Test: `test/errors.test.js`, `test/app.test.js` (jsdom)

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces: `errors.js`: `describe(line: string) -> string` (`'error:20'` → `'error:20 Unsupported command'`, `'ALARM:1'` → `'ALARM:1 Hard limit'`; unknown codes pass through). `app.js`: `startApp(root: HTMLElement, link: LatheLink)`; mode keys call `showMode(name: 'DRO'|'JOG'|'PROG'|'EDIT'|'SET UP'|'RUN'|'CYCLES')`.
- Look: the mockup (`dro-screen-v2.html`): black screen, white 42px monospace values, yellow mode title, blue soft keys, grey keypad, green GO, **amber HOLD**, red STOP, MDI log under the keypad. Breakpoint 760px: below it the screen, keypad and MDI stack vertically, and HOLD/STOP become a fixed bar along the bottom.
- On connect: send `G7`, read `$30` (via `$$` reply `$30=`), then poll `?` every 200 ms.
- ZERO X / ZERO Z / ZERO C / ZERO ALL buttons sit in the DRO screen.

- [ ] **Step 1: Write failing tests:** `describe` mappings above; with a fake link, `startApp` renders `DISCONNECTED` until a `connection {connected:true}` event, then sends `G7`; clicking HOLD sends `0x21`, GO while holding sends `0x7E`, STOP sends `0x18` and shows `'Reset sent: send $X to unlock, check zeros'`; while disconnected, GO/ZERO/jog buttons are `disabled`; the MDI SEND posts the typed line and logs `> line` then the replies; Up arrow recalls the previous command.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: control screen shell with DRO, keypad, MDI, hold and stop`.

### Task 7: JOG and CYCLES screens with preview

**Files:**
- Create: `src/ui/jog.js`, `src/ui/cycles.js`, `src/ui/preview.js`, `src/ui/sketches.js` (one small inline SVG per cycle)
- Test: `test/ui-cycles.test.js`, `test/preview.test.js`

**Interfaces:**
- Consumes: Tasks 3, 4, 5, 6.
- Produces: `toolpath(lines: string[]) -> Array<{x, z, rapid: boolean}>` (diameter X, ignores C), drawn on a canvas in the CYCLES screen. Z is horizontal with the chuck on the left, X is vertical.
- JOG: hold-to-jog buttons X±, Z±, C±; step selector 0.0001/0.001/0.01/0.1/CONT; feed field. On pointerdown with a step: one `jogLine`. With CONT: the CONT line, and on pointerup/pointerleave/cancel send `JOG_CANCEL`.
- CYCLES flow: pick a cycle, fill the form (defaults from the last use, kept in `localStorage` wrapped in try/catch), press **GO** to validate, generate and show the preview + code, press **GO** again to upload `cycle.nc` and run it with `$F=/cycle.nc`. **Validation errors show in the message line and nothing is sent.**

- [ ] **Step 1: Write failing tests:** `toolpath` of `['G0 X1 Z0.1','G1 Z-0.5']` = two segments, the second `{x:1, z:-0.5, rapid:false}`; in jsdom, the first GO with an invalid Face form shows the error and sends nothing; a valid form, first GO → no link traffic, preview visible; second GO → `uploadFile` called with `cycle.nc`, then `sendLine('$F=/cycle.nc')`; a CONT jog pointerdown then pointerup sends `$J=...` then `0x85`.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: jog and conversational cycle screens`.

### Task 8: PROG / EDIT / RUN screens

**Files:**
- Create: `src/ui/program.js`
- Test: `test/ui-program.test.js`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7 (the cycle forms are reused for editing a step).
- PROG: list `*.json` programs on the lathe; New, Open, Delete (with a confirm prompt).
- EDIT: ordered steps; add a step (cycle form or raw g-code), edit, move up/down, delete; Save writes `<name>.json` and `<name>.nc`.
- RUN: shows the program and the whole-program preview; GO runs `$F=/<name>.nc`; HOLD/GO pause/resume; status shows Run/Hold/Idle.

- [ ] **Step 1: Write failing tests:** saving a 2-step program uploads both `<name>.json` and `<name>.nc`; a step with an invalid form blocks Save with `'Step 2: <error>'`; RUN GO sends `$F=/<name>.nc`; delete asks for confirmation and only deletes on yes.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit `feat: program list, editor and run screens`.

### Task 9: Build, deploy and verify on the lathe

**Files:**
- Create: `tools/build.mjs` (esbuild bundle of `src/app.js` with CSS inlined into `src/index.html`, output `dist/lathe.html` and `dist/lathe.html.gz`), `tools/deploy.mjs` (FTP upload of `dist/lathe.html.gz` to `ftp://revturn.local/` via `curl -T`), `README.md` (build, deploy, how to open).

- [ ] **Step 1:** `npm test`. Expected: all suites PASS.
- [ ] **Step 2:** `npm run build`. Expected: `dist/lathe.html.gz` exists and is under 200 KB.
- [ ] **Step 3:** `node tools/deploy.mjs`. Expected: curl reports `226`, and `curl -s http://revturn.local/lathe.html -o NUL -w "%{http_code}"` prints `200`. (The server serves `lathe.html` from `lathe.html.gz`. If it does not, upload as `lathe.html` uncompressed instead and record that.)
- [ ] **Step 4: Live check in a real browser** (Edge app window or Rev's Chrome; the Claude desktop browser pane cannot open this WebSocket). Confirm: CONNECTED, DRO values match `?` in the MDI, the spindle line shows `C …°` with the spindle off. **Do not run motion** (the Z/C belt has no tensioner yet): leave GO tests to Rev. Take a screenshot and send it to Rev.
- [ ] **Step 5:** update `D:\brain\Projects\Micro Lathe CNC.md` (what was built, URL, how to redeploy) and commit `feat: build and deploy to the lathe`.
