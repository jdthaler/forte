// fc300-sysex.js — a Roland FC-300 MIDI foot controller in its System Exclusive mode, as Roland's
// owner's manual documents it (FC-300 Owner's Manual, "MIDI Implementation", pp. 59–67:
// static.roland.com/assets/media/pdf/FC-300_OM.pdf). shared/fc300.js draws it in the page's drawer
// and, when asked, lets Forte drive it with these.
//
// Roland's address-mapped messages, on the FC-300's "Foot Controller" model (00 00 20):
//   F0 41 dev 00 00 20 11 aa bb ss tt sum F7   RQ1: ask for `size` bytes at address aa bb
//   F0 41 dev 00 00 20 12 aa bb dd … sum F7    DT1: set (or report) the bytes at aa bb
// where sum makes the address and data bytes add up to a multiple of 128. dev is its Device ID
// (UTILITY › MIDI:Device ID), 00–1F.
//
//   10 00  its mode: 1 in System Exclusive mode (it reports it on power-up, on a mode change and
//          when asked); 10 01 ← 1 puts it in that mode, ← 0 does what its MODE button does
//   20 00–04 the number pedals, 21 00–01 CTL 1 and 2, 22 00–01 the toe switches, 25 00–01 ▲ and ▼:
//          00 up, 7F down, as the foot moves (in that mode, each pedal as it is, never latched)
//   24 00–01 EXP 1 and 2, 0–127
//   30 00–04 the number pedals' red lights, 30 05–09 their green ones, 31 00–01 CTL 1 and 2's,
//   32 00–01 the toe switches', 35 00–01 ▲'s and ▼'s: 00 off, 7F on
//   40 00, 02, 04 the three digits of its BANK/NUMBER display, right to left: two bytes each,
//          0abcdefg (the segments) then 0000000h (the point)
//   60 00, 64 00 its LCD's two lines, 16 characters each (ASCII 20–7D)
//
// In System Exclusive mode it sends no control or program changes: nothing but a page that reads
// these hears it. It starts in Standard mode at every power-up. Nothing here is stored on it:
// its own pedal settings live in a bulk-dump format Roland doesn't document, which this never sends.

export const MODEL = [0x00, 0x00, 0x20];
const RQ1 = 0x11, DT1 = 0x12;
export const checksum = (bytes) => (128 - (bytes.reduce((s, b) => s + b, 0) % 128)) % 128;
export const dt1 = (dev, [a, b], data) => [0xf0, 0x41, dev & 0x1f, ...MODEL, DT1, a, b, ...data, checksum([a, b, ...data]), 0xf7];
export const rq1 = (dev, [a, b], size = 1) => [0xf0, 0x41, dev & 0x1f, ...MODEL, RQ1, a, b, (size >> 7) & 0x7f, size & 0x7f, checksum([a, b, (size >> 7) & 0x7f, size & 0x7f]), 0xf7];

export const ADDR = {
  mode: [0x10, 0x00], setMode: [0x10, 0x01],
  number: (i) => [0x20, i], ctl: (i) => [0x21, i], toe: (i) => [0x22, i], exp: (i) => [0x24, i], updown: (i) => [0x25, i],
  red: (i) => [0x30, i], green: (i) => [0x30, 5 + i], ctlLed: (i) => [0x31, i], toeLed: (i) => [0x32, i], updownLed: (i) => [0x35, i],
  digit: (i) => [0x40, 2 * i], // 0 the right, 2 the left
  line: (i) => [0x60 + 4 * i, 0x00],
};
export const ON = 0x7f, OFF = 0x00;

/** Ask whatever FC-300 is on this port which mode it is in, at every Device ID (it answers at its own). */
export const ASK = Array.from({ length: 32 }, (_, dev) => rq1(dev, ADDR.mode, 1));
/** Into System Exclusive mode, and out of it (as its MODE button: on to its next mode). */
export const enter = (dev) => [dt1(dev, ADDR.setMode, [1])];
export const leave = (dev) => [dt1(dev, ADDR.setMode, [0])];

/** A DT1 from an FC-300's Foot Controller model: { dev, addr: [a, b], data: [...] }, or null (a bad checksum, another device). */
export function parse(d) {
  if (!d || d.length < 11 || d[0] !== 0xf0 || d[1] !== 0x41 || d[d.length - 1] !== 0xf7) return null;
  if (d[3] !== MODEL[0] || d[4] !== MODEL[1] || d[5] !== MODEL[2] || d[6] !== DT1) return null;
  const body = Array.from(d.slice(7, d.length - 2));
  if (checksum(body) !== d[d.length - 2]) return null;
  return { dev: d[2], addr: [body[0], body[1]], data: body.slice(2) };
}

/**
 * What a DT1 from it says, in words a page acts on: { pedal, value } for a pedal (pedal: 'number1'…
 * 'number5', 'ctl1', 'ctl2', 'toe1', 'toe2', 'up', 'down', down true/false; 'exp1', 'exp2', 0–127), or
 * { mode: 'sysex' | 'other' } for its mode, or null.
 */
export function event(m) {
  if (!m) return null;
  const [a, b] = m.addr, v = m.data[0];
  if (a === 0x10 && b === 0x00) return { mode: v === 1 ? 'sysex' : 'other', dev: m.dev };
  const sw = { 0x20: 'number', 0x21: 'ctl', 0x22: 'toe', 0x25: 'updown' }[a];
  if (sw === 'number' && b <= 4) return { pedal: `number${b + 1}`, down: v >= 0x40, dev: m.dev };
  if (sw === 'updown' && b <= 1) return { pedal: b === 0 ? 'up' : 'down', down: v >= 0x40, dev: m.dev };
  if ((sw === 'ctl' || sw === 'toe') && b <= 1) return { pedal: `${sw}${b + 1}`, down: v >= 0x40, dev: m.dev };
  if (a === 0x24 && b <= 1) return { pedal: `exp${b + 1}`, value: v, dev: m.dev };
  return null;
}

// The BANK/NUMBER display's segments (the manual's p. 65): d the top, c and b the right (upper,
// lower), e and f the left (upper, lower), g the bottom, a the middle; 0abcdefg
const A = 0x40, B = 0x20, C = 0x10, D = 0x08, E = 0x04, F = 0x02, G = 0x01;
export const DIGITS = {
  0: D | C | B | G | F | E, 1: C | B, 2: D | C | A | F | G, 3: D | C | A | B | G, 4: E | A | C | B,
  5: D | E | A | B | G, 6: D | E | A | F | B | G, 7: D | C | B, 8: A | B | C | D | E | F | G, 9: D | E | C | A | B | G,
  '-': A, ' ': 0,
};
/** Three characters (digits, '-' or ' ') on its display, left to right. */
export function display(dev, text) {
  const t = String(text).padStart(3, ' ').slice(-3);
  return [0, 1, 2].map((i) => dt1(dev, ADDR.digit(i), [DIGITS[t[2 - i]] ?? 0, 0])); // the right digit first
}
/** Two lines on its LCD, 16 characters each, in the ASCII it has (20–7D). */
export function lcd(dev, top = '', bottom = '') {
  const line = (s) => Array.from(String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').padEnd(16, ' ').slice(0, 16), (ch) => {
    const c = ch.charCodeAt(0);
    return c >= 0x20 && c <= 0x7d ? c : 0x20;
  });
  return [dt1(dev, ADDR.line(0), line(top)), dt1(dev, ADDR.line(1), line(bottom))];
}
/** Its lights: lit = { red: [5 booleans], green: [5], ctl: [2], toe: [2], up, down }; each one given is set. */
export function lights(dev, lit) {
  const out = [];
  const one = (addr, on) => { if (on !== undefined) out.push(dt1(dev, addr, [on ? ON : OFF])); };
  (lit.red ?? []).forEach((on, i) => one(ADDR.red(i), on));
  (lit.green ?? []).forEach((on, i) => one(ADDR.green(i), on));
  (lit.ctl ?? []).forEach((on, i) => one(ADDR.ctlLed(i), on));
  (lit.toe ?? []).forEach((on, i) => one(ADDR.toeLed(i), on));
  one(ADDR.updownLed(0), lit.up);
  one(ADDR.updownLed(1), lit.down);
  return out;
}
