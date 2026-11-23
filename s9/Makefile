# revturnd: REVTURN (grblHAL) on the Antminer S9 + Orphan. Build ON the board (gcc):  make   (uses ../main/grbl, the same core as the ESP32 build)
# by JMSCNC, makers of RotatoCAM. GPL-3.0-or-later.
GRBL ?= ../main/grbl
DEFS = -DN_AXIS=4 -DN_SPINDLE=1 -DAXIS3_LETTER=67 -DDEFAULT_LATHE_MODE=1 -DDEFAULT_ROTARY_FIX_ENABLE=1 \
       -DNGC_EXPRESSIONS_ENABLE=1 -DENABLE_ACCELERATION_PROFILES=1 -DENABLE_BACKLASH_COMPENSATION=1 \
       -DCUTTER_COMP_ENABLE=1 -DENABLE_JERK_ACCELERATION=0 \
       -DDEFAULT_STEP_SIGNALS_INVERT_MASK=0 -DDEFAULT_DIR_SIGNALS_INVERT_MASK=0 -DDEFAULT_STEP_PULSE_MICROSECONDS=5.0f
CFLAGS = -O1 -g -fno-omit-frame-pointer -funwind-tables -fno-pie -pthread $(DEFS) -I$(GRBL)/.. -I$(GRBL)
OBJ = $(patsubst $(GRBL)/%.c,obj/%.o,$(wildcard $(GRBL)/*.c)) obj/driver.o
revturnd: $(OBJ)
	gcc -no-pie -pthread -o $@ $(OBJ) -lm
obj/%.o: $(GRBL)/%.c | obj
	gcc $(CFLAGS) -c $< -o $@
obj/driver.o: driver.c | obj
	gcc $(CFLAGS) -c $< -o $@
obj:
	mkdir -p obj
clean:
	rm -rf obj revturnd
