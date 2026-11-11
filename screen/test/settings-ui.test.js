// SPDX-License-Identifier: GPL-3.0-or-later
// REVTURN by JMSCNC, Copyright (C) 2026 Rev. J. Money / JMSCNC (jmscnc.com).
// Licensed GPL-3.0-or-later; keep this attribution (GPLv3 section 7(b), see NOTICE.md).
// @vitest-environment jsdom
// Rev 2026-11-11: SETTINGS screen = every grblHAL setting in the REVTURN look, built from the lathe's own list.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { startApp, MODES } from '../src/app.js';
import { registerSettings } from '../src/ui/settings.js';
import { FakeLink } from './helpers/fake-link.js';

const LIST = readFileSync('test/fixtures/grblhal-settings.txt', 'utf8').split(/\r?\n/).filter(Boolean);
let root, link, app, settings;
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };

// what the lathe answers to $EG / $ES / $$ / $I
const answer = () => {
  for (const l of LIST) link.line(l);
  for (const l of ['$13=0', '$32=2', '$110=635.000', '$112=635.000', '$14=64', '$22=0', '$75=********', '$310=revturn-ap', '$76=REVTURN_AP', '$5=7']) link.line(l);
  link.line('[BOARD:REVTURN by JMSCNC (ESP32 lathe)]'); link.line('[AXS:4:XYZC]'); link.line('ok');
  vi.advanceTimersByTime(200);
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app');
  link = new FakeLink();
  app = startApp(root, link, { host: 'lathe', fetchImpl: async () => ({ ok: true, json: async () => ({ files: [] }), text: async () => '{}' }) });
  settings = registerSettings(app);
  link.setConnected(true);
  link.status('<Idle|MPos:0,0,0,0>');
  link.lines.length = 0;
});
afterEach(() => { settings.stop(); app.stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

const open = () => { click($('[data-mode="SETTINGS"]')); answer(); };
const group = (name) => click($$('[data-set-group]').find((b) => b.textContent.replace(' •', '') === name));

describe('SETTINGS screen', () => {
  it('opened while disconnected, it reads everything as soon as the lathe connects', () => {
    link.setConnected(false);
    click($('[data-mode="SETTINGS"]'));
    expect($('[data-set-main]').textContent).toContain('Not connected');
    link.lines.length = 0;
    link.setConnected(true);
    expect(link.lines).toEqual(expect.arrayContaining(['$EG', '$ES', '$I', '$$']));
  });

  it('is a mode in its own window and asks the lathe for its groups, settings, values and info', () => {
    expect(MODES).toContain('SETTINGS');
    click($('[data-mode="SETTINGS"]'));
    expect(app.popup.kind).toBe('mode:SETTINGS');
    expect(link.lines).toEqual(['$EG', '$ES', '$I', '$$']);
  });

  it('lists every group the lathe has, children under their parent, plus MACHINE INFO', () => {
    open();
    const names = $$('[data-set-group]').map((b) => b.textContent);
    expect(names).toContain('WiFi');
    expect(names).toContain('X-axis');
    expect(names.at(-1)).toBe('MACHINE INFO');
    group('MACHINE INFO');
    expect($('[data-set-main]').textContent).toContain('REVTURN by JMSCNC (ESP32 lathe)');
  });

  it('draws each type its own way: choices, bits, numbers with inch hints, passwords', () => {
    open();
    group('General');
    const row32 = $('[data-set-row="32"]');
    expect(row32.querySelector('.schip.on').textContent).toBe('Lathe mode');
    group('X-axis');
    const row110 = $('[data-set-row="110"]');
    expect(row110.querySelector('input').value).toBe('635.000');
    expect(row110.textContent).toContain('= 25.0 ipm');
    group('WiFi');
    const pw = $('[data-set-row="75"] input');
    expect(pw.type).toBe('password');
    expect(pw.value).toBe('');
  });

  it('SAVE sends only what changed, then reads the values back', () => {
    open();
    group('X-axis');
    type($('[data-set-row="110"] input'), '508');
    expect($('[data-set-row="110"]').classList.contains('changed')).toBe(true);
    expect($('[data-set-save]').textContent).toBe('SAVE CHANGES (1)');
    link.lines.length = 0;
    click($('[data-set-save]'));
    expect(link.lines).toEqual(['$110=508', '$$']);
  });

  it('a bad value is refused before anything is sent', () => {
    open();
    group('X-axis');
    type($('[data-set-row="110"] input'), 'fast');
    expect($('[data-set-row="110"] .serr').textContent).toBe('must be a number');
    link.lines.length = 0;
    click($('[data-set-save]'));
    expect(link.lines).toEqual([]);
  });

  it('choice buttons and bit chips edit the value; picking the old value again clears the change', () => {
    open();
    group('General');
    click($('[data-set-pick="32:0"]'));
    expect($('[data-set-save]').textContent).toBe('SAVE CHANGES (1)');
    click($('[data-set-pick="32:2"]'));
    expect($('[data-set-save]').textContent).toBe('SAVE CHANGES');
    group('Control signals');
    click($('[data-set-bit="14:6"]')); // EStop invert off: 64 -> 0
    link.lines.length = 0;
    click($('[data-set-save]'));
    expect(link.lines[0]).toBe('$14=0');
  });

  it('only saves while Idle', () => {
    open();
    group('X-axis');
    type($('[data-set-row="110"] input'), '508');
    link.status('<Run|MPos:0,0,0,0>');
    link.lines.length = 0;
    click($('[data-set-save]'));
    expect(link.lines).toEqual([]);
    expect($('[data-msg]').textContent).toContain('Idle');
  });

  it('search finds settings by name or $ number across groups', () => {
    open();
    type($('[data-set-search]'), 'maximum rate');
    expect($$('[data-set-row]').map((r) => r.dataset.setRow)).toEqual(['110', '111', '112', '113']);
    type($('[data-set-search]'), '$32');
    expect($$('[data-set-row]').map((r) => r.dataset.setRow)).toContain('32');
  });

  it('? asks the lathe for the help text and shows it', () => {
    open();
    group('X-axis');
    link.lines.length = 0;
    click($('[data-set-help="110"]'));
    expect(link.lines).toEqual(['$SED=110']);
    link.line('[SETTINGDESCR:110|Maximum rate. Used as G0 rapid rate.]');
    expect($('[data-set-descr="110"]').textContent).toBe('Maximum rate. Used as G0 rapid rate.');
  });

  it('REBOOT asks first; the stock grblHAL WebUI is one link away', () => {
    open();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    link.lines.length = 0;
    click($('[data-set-reboot]'));
    expect(link.lines).toEqual([]);
    window.confirm.mockReturnValue(true);
    click($('[data-set-reboot]'));
    expect(link.lines).toEqual(['$REBOOT']);
    expect($('[data-pop] [data-webui]').getAttribute('href')).toBe('/webui/#/settings/machine');
  });
});
