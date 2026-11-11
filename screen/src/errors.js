// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// Plain-language text for grbl / grblHAL error and alarm codes shown in the MDI log.
const ERRORS = {
  1: 'G-code word without a letter', 2: 'Bad number format', 3: 'Invalid $ command',
  4: 'Negative value not allowed', 5: 'Homing is not enabled', 6: 'Step pulse too short',
  7: 'Settings read failed', 8: 'Needs Idle state', 9: 'Locked (alarm or jog): send $X to unlock',
  10: 'Soft limits need homing', 11: 'Line too long', 12: 'Step rate too high',
  13: 'Safety door open', 14: 'Startup line too long', 15: 'Jog past travel limit',
  16: 'Invalid jog command', 17: 'Laser mode needs PWM output', 18: 'Reset asserted',
  19: 'Non-idle setting change', 20: 'Unsupported command', 21: 'Two commands from the same modal group',
  22: 'Feed rate not set', 23: 'Command needs a whole number', 24: 'Two commands use the same axis',
  25: 'Repeated word in line', 26: 'No axis words for this command', 27: 'Line number out of range',
  28: 'Missing a required value', 29: 'G59.x work offsets not supported', 30: 'G53 needs G0 or G1',
  31: 'Axis words not used by this command', 32: 'Arc has no axis in the plane', 33: 'Invalid motion target',
  34: 'Arc radius error', 35: 'Cutter compensation error', 36: 'Unused words in line',
  37: 'Tool offset axis error', 38: 'Tool number too large', 39: 'Value out of range',
  60: 'File system mount failed', 61: 'File read failed', 62: 'Could not open directory',
  63: 'Directory not found', 64: 'File empty', 65: 'File not found', 66: 'Could not open file',
  79: 'Check the spindle',
};

const ALARMS = {
  1: 'Hard limit', 2: 'Soft limit', 3: 'Reset during motion: re-zero', 4: 'Probe fail',
  5: 'Probe fail', 6: 'Homing reset', 7: 'Homing door', 8: 'Homing pull-off failed',
  9: 'Homing switch not found', 10: 'E-stop', 11: 'Homing required', 14: 'Spindle at speed timeout',
  17: 'Motor fault',
};

export function describe(line) {
  const m = /^(error|ALARM):(\d+)$/.exec(line);
  if (!m) return line;
  const text = (m[1] === 'error' ? ERRORS : ALARMS)[Number(m[2])];
  return text ? `${line} ${text}` : line;
}
