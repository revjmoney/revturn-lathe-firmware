/*
  my_machine_map.h - grblHAL board map for Rev's mini lathe (REVTURN ESP32)

  ESP32-D0WD-V3 DevKit (WROOM-32, 4 MB, CP210x on USB), the former Loklik/iCraft board.
  Pins are the ones REVTURN 0.6.0 used and the motors already turn on:
  revturn_board.h + the REVTURN SETUP wiring table.

    X  cross slide   TB6600   STEP 16  DIR 17
    Z  along bed     TB6600   STEP 21  DIR 22  enable 23 (only Z has an enable wire)
    C  spindle       DM542T   STEP 18  DIR 19  (last axis, so the stepper spindle binds here)
    Y  not used, parked on 25/26 because grblHAL always has X, Y and Z.

  Part of grblHAL, GPL-3.0-or-later.
*/

#if N_ABC_MOTORS != 1
#error "Lathe map expects N_AXIS 4 (X Y Z C)."
#endif

#define BOARD_NAME "REVTURN lathe ESP32"

#define X_STEP_PIN              GPIO_NUM_16
#define X_DIRECTION_PIN         GPIO_NUM_17

#define Y_STEP_PIN              GPIO_NUM_25 // idle, nothing wired
#define Y_DIRECTION_PIN         GPIO_NUM_26 // idle, nothing wired

#define Z_STEP_PIN              GPIO_NUM_21
#define Z_DIRECTION_PIN         GPIO_NUM_22

#define M3_AVAILABLE
#define M3_STEP_PIN             GPIO_NUM_18
#define M3_DIRECTION_PIN        GPIO_NUM_19

// One shared enable output; only the Z TB6600 is wired to it.
#define STEPPERS_ENABLE_PIN     GPIO_NUM_23

// Limit inputs are not wired yet. Pulled-up spare pins, clear of the strapping pins.
#define X_LIMIT_PIN             GPIO_NUM_32
#define Y_LIMIT_PIN             GPIO_NUM_33
#define Z_LIMIT_PIN             GPIO_NUM_27

#undef CONTROL_ENABLE
#define CONTROL_ENABLE 0 // No reset / feed hold / cycle start buttons wired

// --- Added 2026-11-08: PWM spindle (spindle 1, for a router / live tool) and the OLED. ---
// Free, output-capable, non-strapping pins on the DevKit (34-39 are input only, 0/2/12/15 strap,
// 6-11 are flash, 25 was surge damaged on the old iCraft board). REV: check these on your headers.
#define AUXOUTPUT0_PIN          GPIO_NUM_4  // PWM spindle PWM (D23/D22/D4/3V3 row)
#define AUXOUTPUT1_PIN          GPIO_NUM_5  // PWM spindle enable (strap pin, fine as an output)

#if DRIVER_SPINDLE_ENABLE & SPINDLE_PWM
#define SPINDLE_PWM_PIN         AUXOUTPUT0_PIN
#endif
#if DRIVER_SPINDLE_ENABLE & SPINDLE_ENA
#define SPINDLE_ENABLE_PIN      AUXOUTPUT1_PIN
#endif

// I2C for the 4-pin OLED (VCC 3.3 V, GND, SCL, SDA). OLED modules carry their own pull-ups.
#if I2C_ENABLE
#define I2C_PORT                I2C_NUM_1
#define I2C_SDA                 GPIO_NUM_13 // Rev's choice: VIN/GND/D13/D12/D14 row of the screw-terminal breakout
#define I2C_SCL                 GPIO_NUM_14 // same row. That row has no 3V3: power the OLED from the 3V3 pin on the other row
#endif
