// rise-sysex.js — a Seaboard RISE's own settings, over MIDI SysEx, as ROLI Dashboard reads and
// writes them: the protocol GRAB decoded (github.com/demixme/GRAB, RISE-GRAND.md and
// src/common/Rise2Protocol.h, MIT), confirmed on the original RISE 25 and 49 (firmware 1.1.8)
// and on the RISE 2. shared/rise.js shows them in the RISE's panel and sets them from it.
//
//   F0 00 21 10 78 3F F7          identify: the RISE answers 3A with its settings, 224 bytes
//   F0 00 21 10 78 3D <p> <v> F7  set one setting (kept across a power cycle)
//   RPN and NRPN on channel 1     its MIDI mode (MPE zone, bend range), octave, transpose, Press mode
//
// Nothing here builds firmware, factory reset or program messages.

const HEAD = [0xf0, 0x00, 0x21, 0x10, 0x78];
export const sysex = (...body) => [...HEAD, ...body, 0xf7];
export const IDENTIFY = sysex(0x3f);
export const setParam = (p, v) => sysex(0x3d, p, v & 0x7f);
const nrpn = (n, v) => [[0xb0, 0x63, 0], [0xb0, 0x62, n], [0xb0, 0x06, v & 0x7f], [0xb0, 0x26, 0]];
const rpn = (ch, n, v) => { const c = 0xb0 | (ch & 0x0f); return [[c, 0x65, 0], [c, 0x64, n], [c, 0x06, v & 0x7f], [c, 0x26, 0]]; };

// the settings `set` writes, by name: [3D parameter, range]
export const PARAMS = {
  glide: [0x17, 0, 127], slide: [0x18, 0, 127], press: [0x19, 0, 127], strike: [0x1a, 0, 127], lift: [0x1b, 0, 127],
  fader1: [0x1c, 0, 127], fader2: [0x1d, 0, 127], fader3: [0x1e, 0, 127], padX: [0x23, 0, 127], padY: [0x24, 0, 127],
  slideCc: [0x38, 0, 127], slideMode: [0x39, 0, 2],
};
/** The messages that set one setting. */
export function set(name, v) {
  const [p, lo, hi] = PARAMS[name];
  return [setParam(p, Math.max(lo, Math.min(hi, Math.round(v))))];
}
/** MPE on a lower zone of `members` channels (2 …), each bending ±bend: the mode flag, RPN 6, RPN 0, as Dashboard sends them. */
export const mpeMode = (members = 15, bend = 48) => [setParam(0x0e, 1), ...rpn(1, 6, members), ...rpn(0, 6, members), ...rpn(1, 0, bend), ...rpn(0, 0, bend)];
/** Press as channel pressure (the MPE way) or polyphonic aftertouch: NRPN 4 (1, 0). */
export const pressMode = (channel = true) => nrpn(4, channel ? 1 : 0);
export const octave = (o) => nrpn(2, o + 4);
export const transpose = (t) => nrpn(3, t + 64);

/** What Forte expects: MPE on 15 channels, ±48; Slide on CC74, absolute; Press as channel pressure; the faders and pad on the CCs the instruments map. */
export function forForte() {
  return [
    ...mpeMode(15, 48),
    ...set('slideCc', 74), ...set('slideMode', 0), ...pressMode(true),
    ...set('fader1', 107), ...set('fader2', 109), ...set('fader3', 111), ...set('padX', 113), ...set('padY', 114),
  ];
}
export const FORTE = { mpe: true, members: 15, bend: 48, slideCc: 74, slideMode: 0, faders: [107, 109, 111, 113, 114] };

// offsets into the identify reply, counted from F0 (GRAB's offset::)
const O = {
  firmware: 22, firstMember: 79, lastMember: 80, master: 81, mpe: 82, bend: 83, octave: 84, pressTracking: 86,
  faders: [92, 96, 100, 102, 103], glide: 105, slide: 106, press: 107, strike: 108, lift: 148,
  slideCc: 150, slideMode: 151, transpose: 207, battery: 209, size: 224,
};
const text = (d, at, n = 8) => { let s = ''; for (let i = at; i < at + n && d[i]; i++) if (d[i] >= 0x20 && d[i] < 0x7f) s += String.fromCharCode(d[i]); return s.trim(); };
export const isReply = (d) => d.length >= O.size && HEAD.every((b, i) => d[i] === b) && d[5] === 0x3a;
/** The settings in an identify reply, or null when it isn't one. */
export function parse(d) {
  if (!isReply(d)) return null;
  const first = d[O.firstMember], last = d[O.lastMember], master = d[O.master];
  // MPE has its flag; Single Channel is first = last = master; Multi Channel only clears the flag
  const mode = d[O.mpe] !== 0 ? 'mpe' : first === last && last === master ? 'single' : 'multi';
  return {
    firmware: text(d, O.firmware),
    mode,
    members: Math.abs(last - first) + 1,
    channel: (mode === 'mpe' ? master : first) + 1, // MPE: the zone's master; else the first channel
    upper: mode === 'mpe' && master === 15,
    bend: d[O.bend], octave: d[O.octave] - 4, transpose: d[O.transpose] - 64,
    press: d[O.pressTracking] === 0 ? 'poly' : 'channel', // 0 polyphonic aftertouch, else channel pressure (and which note it follows)
    faders: O.faders.map((o) => d[o]),
    glide: d[O.glide], slide: d[O.slide], pressSens: d[O.press], strike: d[O.strike], lift: d[O.lift],
    slideCc: d[O.slideCc], slideMode: d[O.slideMode], battery: d[O.battery],
  };
}
/** What differs from what Forte expects, as short phrases (none: it is set up for Forte). */
export function differences(s) {
  const out = [];
  if (s.mode !== 'mpe') out.push(s.mode === 'single' ? `Single Channel (channel ${s.channel})` : 'Multi Channel');
  else {
    if (s.upper) out.push('MPE on the upper zone');
    if (s.bend !== FORTE.bend) out.push(`bend ±${s.bend}`);
  }
  if (s.press !== 'channel') out.push('Press as polyphonic aftertouch');
  if (s.slideCc !== FORTE.slideCc) out.push(`Slide on CC ${s.slideCc}`);
  if (s.slideMode !== FORTE.slideMode) out.push('Slide relative');
  if (s.faders.some((c, i) => c !== FORTE.faders[i])) out.push(`faders and pad on CC ${s.faders.join(', ')}`);
  return out;
}
