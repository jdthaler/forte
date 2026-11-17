// midi.js — Web MIDI for every page.
//
//   startMIDI({ onMIDI, status, button }) asks for MIDI access, listens to every input (and to any
//   plugged in later), and remembers the choice: the next page turns MIDI on by itself when the
//   browser still grants it (resumeMIDI). Each input's messages are cleaned on the way to onMIDI:
//   - a note-on for a note already down on that channel first lets it go (a re-strike, never two
//     presses that one note-off can't undo);
//   - a note-off for a note that isn't down is dropped;
//   - a device that goes away lets go of its notes and of its pedals (CC64, 66 and 67);
//   - until the page has had a click or a key press, notes are dropped with a toast saying so:
//     a MIDI key is not a user gesture, so the browser would not let it start the sound (and
//     MIDI turned on by resumeMIDI comes before any click).
//   wheelValue(p, cc, max?) maps the mod wheel onto a parameter: at rest (0) its default, fully up
//   its maximum, so a wheel at rest never drags the instrument to the bottom of its range.
//   touch() is the velocity curve the player chose (every page shares it: touchControl, in the
//   Velocity section of the page's Global settings drawer, shared/layout.js), touched(v) a MIDI
//   velocity (0..1) through it; SOFT_PEDAL scales the velocity of keys struck under CC67;
//   createSostenuto() keeps the keys CC66 holds.
//   mpeMode() is MPE's mode (shared/mpe.js: 'auto', 'on' or 'off'; every page shares it), which
//   the MPE switch at the top of the page's MIDI devices drawer turns on (Auto) and off (mpeSwitch;
//   a 'forte-mpe' event on document says so); pageMpe() decodes it for a page. That drawer is the
//   MIDI status too: midiDevices lists the devices plugged in, each with a lamp (or why there are
//   none: MIDI off, with its button, or not allowed), and says how far the keys are moved, and
//   midiLamp() lights on its rail as any of them plays (shared/layout.js puts it there).
//   keyShift() is how far the MIDI keys are moved: the player's Octave (±4) and Transpose (±12
//   semitones), from the MIDI settings at the bottom of the same drawer (midiSettings), which every
//   page shares (setShift). startMIDI moves
//   each note as it comes in, and its note-off and poly pressure by as much as its note-on was
//   moved, so a note held while the menus change ends as it began. The on-screen and computer
//   keys play what they show (the ◀ ▶ buttons and arrow keys move the computer keys).
//   FADERS are a controller's five touch controls (a Seaboard RISE's three faders and XY pad):
//   controllersOf(I) is the descriptor's controllers with its `faders` among them, controlled(…)
//   what one of them sets, ccValue(p, v) a controller across a parameter's whole range.
//   A Seaboard plays as MPE from the start: startMIDI announces its zone for it, and shows its
//   panel in the MIDI devices drawer while it is plugged in (shared/rise.js: its faders, its pad and
//   each finger's Strike, Glide, Slide, Press and Lift, with what each does on the instrument).
//   A foot controller (a Roland FC-300 as it comes) works on every page, in startMIDI:
//   - SWITCHES: its general-purpose switches CC80, 81 and 82 are the sustain, sostenuto and soft
//     pedals (CC64, 66, 67), so they do whatever those do on each instrument;
//   - a device's volume pedal (CC7) moves the page's Volume control (volumePedal, pedalVolume:
//     its top toe down, silent heel down); the expression pedal (CC11), and CC7 on a page
//     without a Volume control or from a song, turn the page's output down (pedalGain, which
//     shared/chain.js applies after the limiter): full until a pedal moves, silent heel down;
//     an instrument that maps CC11 itself (an organ's swell) keeps it;
//   - a program change n plays the menu's preset n + 1 (pedal 1 the first preset, then your own
//     after the instrument's): choosePreset; a Seaboard's, from its preset arrows, steps from
//     the preset playing instead (riseProgram), so it keeps in step with the pedals and the menu;
//   - it gets a section of the page's MIDI devices drawer (shared/fc300.js), which can drive it over
//     SysEx, and its EXP 2 moves the page's Morph, once the page knows which device it is: it comes
//     through a MIDI interface (a UM-ONE), whose name says nothing of it. One is known by its
//     switches (CC80–83) once one is pressed, by its answer over SysEx where the browser already
//     allows that, by the interface it came by before, or because the player says so, in the
//     list of devices plugged in (midiDevices: each one's "what it is").
//   The plugins do the same, but for CC7, which stays a gain after the limiter there (the host has a
//   volume of its own to show it on) (native/plugin/plugin.cpp: kTouchGamma, kSoftPedal, sostenutoPedal,
//   kMpeId, kTransposeId, kOctaveId, moveOn, controller, footSwitch, levels, programChange; the
//   faders reach them as the descriptor's controllers).

import { unfocus } from './focus.js';
import { MODES, createMpe, bendRatio } from './mpe.js';

const KEY = 'forte/midi/v1';
const TOUCH_KEY = 'forte/touch/v1';
const MPE_KEY = 'forte/mpe/v1';
const SHIFT_KEY = 'forte/shift/v1';

// The velocity curve: v^γ. Soft makes a light touch louder, Hard asks for a firmer one.
export const TOUCH = [{ name: 'Soft', gamma: 0.6 }, { name: 'Normal', gamma: 1 }, { name: 'Hard', gamma: 1.6 }];
export const SOFT_PEDAL = 0.6;
let touchIndex = 1;
try { const t = localStorage.getItem(TOUCH_KEY); if (t !== null && TOUCH[+t]) touchIndex = +t; } catch { /* storage blocked, or Node */ }
export const touch = () => touchIndex;
export function setTouch(i) {
  if (!TOUCH[i]) return;
  touchIndex = i;
  try { localStorage.setItem(TOUCH_KEY, String(i)); } catch { /* storage blocked */ }
}
export const touched = (v) => v ** TOUCH[touchIndex].gamma;
let mpe = 'auto';
try { const m = localStorage.getItem(MPE_KEY); if (MODES.some(([id]) => id === m)) mpe = m; } catch { /* storage blocked, or Node */ }
export const mpeMode = () => mpe;
export function setMpeMode(m) {
  if (!MODES.some(([id]) => id === m) || m === mpe) return;
  mpe = m;
  try { localStorage.setItem(MPE_KEY, m); } catch { /* storage blocked */ }
  if (typeof document !== 'undefined' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('forte-mpe', { detail: m }));
}
// Octave and Transpose: how far the MIDI keys are moved, an octave and a semitone at a time
export const OCTAVES = 4, SEMITONES = 12;
const shift = { octave: 0, transpose: 0 };
const within = (v, n) => (Number.isInteger(v) && Math.abs(v) <= n ? v : 0);
try {
  const s = JSON.parse(localStorage.getItem(SHIFT_KEY) || 'null');
  if (s) { shift.octave = within(s.octave, OCTAVES); shift.transpose = within(s.transpose, SEMITONES); }
} catch { /* storage blocked, corrupt, or Node */ }
export const keyShift = () => 12 * shift.octave + shift.transpose;
export const shiftOf = () => ({ ...shift });
export function setShift({ octave = shift.octave, transpose = shift.transpose } = {}) {
  shift.octave = within(octave, OCTAVES); shift.transpose = within(transpose, SEMITONES);
  try { localStorage.setItem(SHIFT_KEY, JSON.stringify(shift)); } catch { /* storage blocked */ }
  showShift();
}
// "+2", "0", "−1" (a minus sign, not a hyphen)
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const shiftText = ({ octave: o, transpose: t } = shift) => {
  const parts = [];
  if (o) parts.push(`${Math.abs(o)} octave${Math.abs(o) > 1 ? 's' : ''} ${o > 0 ? 'up' : 'down'}`);
  if (t) parts.push(`${Math.abs(t)} semitone${Math.abs(t) > 1 ? 's' : ''} ${t > 0 ? 'up' : 'down'}`);
  return parts.join(' and ');
};

// A note the instrument doesn't play: what the page says when one is struck (shared/shell.js, the
// Combinations page, and the plugins' window, native/plugin/editor.html). lo…hi: the keys that
// play; name: the instrument's, where there is more than one; open: the label of the checkbox that
// would play it (a historical compass's Full range); octave and transpose: how far Octave and
// Transpose moved it, a MIDI key's (shiftOf())
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const keyName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export function rangeWarning(key, lo, hi, { name = '', open = '', octave = 0, transpose = 0 } = {}) {
  const moved = shiftText({ octave, transpose });
  return `${name ? `${name}: ` : ''}${keyName(key)} is out of range (${keyName(lo)}–${keyName(hi)}).`
    + (open ? ` Tick ${open} to play it.` : '')
    + (moved ? ` MIDI keys play ${moved}: Octave and Transpose are in the MIDI settings.` : '');
}

// Without the User Activation API (older browsers), let the notes through as before.
const mayPlay = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
// (shell.js is imported here only when needed: the tools import this module in Node)
const needClick = () => import('./shell.js').then(({ toast }) => toast('MIDI is on: click the page once to let the browser make sound'));

/**
 * A foot controller's switches as the pedals Forte knows: CC80 (General Purpose 5) is the
 * sustain pedal, CC81 the sostenuto, CC82 the soft pedal. A Roland FC-300 sends them from its
 * CTL 1 and CTL 2 pedals and the toe switch of its EXP 1 pedal.
 */
export const SWITCHES = { 80: 64, 81: 66, 82: 67 };

/**
 * The volume (CC7) and expression (CC11) pedals: one gain on the output, (v/127)² for each
 * (General MIDI's 40·log10), so both at the top (127, and before either moves) leave the
 * instrument as it is and a pedal heel down silences it.
 */
const levels = { 7: 127, 11: 127 };
const gainListeners = new Set();
export const levelGain = (v7, v11) => (v7 / 127) ** 2 * (v11 / 127) ** 2;
export const pedalGain = () => levelGain(levels[7], levels[11]);
/** fn(gain) now and whenever a pedal moves; returns a function that stops it. */
export function onPedalGain(fn) { gainListeners.add(fn); fn(pedalGain()); return () => gainListeners.delete(fn); }
export function setLevel(cc, v) {
  if (!(cc in levels)) return;
  v = Math.min(127, Math.max(0, v | 0));
  if (levels[cc] === v) return;
  levels[cc] = v;
  const g = pedalGain();
  for (const fn of gainListeners) fn(g);
}

/**
 * Program change n: the page's preset menu (#preset) plays its preset n + 1, counting the
 * instrument's presets and then your own (shared/user-presets.js), as the menu lists them. A
 * toast says which, or that there is no such preset.
 */
export function choosePreset(n) {
  const sel = typeof document !== 'undefined' && document.querySelector('#preset');
  if (!sel) return;
  const presets = presetChoices();
  const o = presets[n];
  import('./shell.js').then(({ toast }) => toast(o ? `Preset ${n + 1}: ${o.text}` : `No preset ${n + 1} here (there are ${presets.length})`), () => {});
  if (!o) return;
  sel.value = o.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * A Seaboard RISE's preset arrows send program change n, a number they count up and down by
 * themselves (0–127) and that nothing here can set, so it soon disagrees with the preset playing
 * (a foot controller, the menu or a preset link moved it). So a Seaboard's program change steps from
 * the preset playing: up from its last number, the next preset; down, the one before (the list's
 * ends hold; at its own ends, 0 and 127, should the RISE send its number again, that goes on the
 * same way). Its last number is kept across pages and visits (the RISE keeps counting while it is
 * on). Without one, or with one more than a step away (it counted elsewhere, or was turned off):
 * in step, the RISE's number is the playing preset's own, so a number past it is a step forward,
 * one below a step back, and the same one leaves it; after that one press it goes by its steps.
 * With no preset playing (a control moved), the number's own preset, as any device's.
 *   riseProgram(last, n, index, count) → the preset to play (0-based, as choosePreset), or index
 */
export function riseProgram(last, n, index, count) {
  if (index < 0 || index >= count) return n;
  const dir = typeof last !== 'number' || Math.abs(n - last) > 1 ? Math.sign(n - index)
    : n > last ? 1 : n < last ? -1 : n === 0 ? -1 : n === 127 ? 1 : 0;
  return Math.max(0, Math.min(count - 1, index + dir));
}

/** The presets a program change counts (the menu's options, the instrument's then your own), and
 *  which of them is chosen now (−1: none, as after a control is moved). */
export function presetChoices() {
  const sel = typeof document !== 'undefined' && document.querySelector('#preset');
  if (!sel) return [];
  return [...sel.options].filter((o) => o.value !== '' && (!o.value.startsWith('__') || o.value.startsWith('__user:')));
}
export const presetIndex = () => { const sel = typeof document !== 'undefined' && document.querySelector('#preset'); return sel ? presetChoices().findIndex((o) => o.value === sel.value) : -1; };

/**
 * A device's volume pedal (CC7) on the page's Volume control, where the page has one
 * (shared/shell.js gives it: volumePedal(fn), fn(v) for each move), so the control moves with
 * the pedal; without one, or from a song, CC7 turns the output down after the limiter (setLevel).
 */
let volumeTo = null;
export function volumePedal(fn) { volumeTo = fn; }
/** The Volume control p at a volume pedal's v (0..127): its top with the toe down, silent heel down,
 *  (v/127)² between (General MIDI's 40·log10, as setLevel), so the pedal sweeps the control's whole
 *  range as its slider does; in dB for a control in dB. */
export function pedalVolume(p, v) {
  const u = Math.min(1, Math.max(0, v / 127));
  let x = p.min < 0 ? (u <= 0 ? p.min : p.max + 40 * Math.log10(u)) : p.max * u * u;
  if (p.step) x = Math.round(x / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, x));
}

// The page's Morph slider (shared/morph.js gives it: morphControl(fn), fn(v) for v 0..127), which an
// FC-300's EXP 2 moves, as it comes (its CC1) and driven alike; a keyboard's mod wheel stays the mod wheel
let morphTo = null;
export function morphControl(fn) { morphTo = fn; }
/** An FC-300's EXP 2 at v (0..127) on the page's Morph: false when the page has none. */
export function footMorph(v) { if (!morphTo) return false; morphTo(v); return true; }

// A Roland FC-300's section of the drawer (shared/fc300.js), loaded the first time one is seen:
// an input that sends its switches (CC80–83), one with the name the last one came by, one that
// answers as an FC-300 over SysEx (seekFoot), or one the player says it is on
let footPanel = null;
function foot(fn) {
  footPanel ??= import('./fc300.js').then((m) => m.fc300Panel());
  footPanel.then(fn, () => {});
}
// What is kept of it in this browser (with shared/fc300.js, which keeps `drive`): name, the
// interface it came by; not, the one the player said it isn't on (its switches are left alone there)
const FOOT = 'forte/fc300/v1';
let footKept = {}; // as kept, where the browser has no storage
const footPrefs = () => { try { return { ...footKept, ...(JSON.parse(localStorage.getItem(FOOT) || '{}') || {}) }; } catch { return footKept; } };
const footRemember = (o) => {
  footKept = { ...footKept, ...o };
  try { localStorage.setItem(FOOT, JSON.stringify({ ...(JSON.parse(localStorage.getItem(FOOT) || '{}') || {}), ...o })); } catch { /* storage blocked */ }
};
// Where the browser already lets this page talk SysEx (the player allowed it before), ask every
// port for an FC-300 (shared/fc300.js seek): the input that answers, { id, name }, or null
async function seekFoot() {
  try {
    if ((await navigator.permissions.query({ name: 'midi', sysex: true })).state !== 'granted') return null;
    footPanel ??= import('./fc300.js').then((m) => m.fc300Panel());
    return await (await footPanel).seek();
  } catch { return null; }
}

// A device playing the page (a channel message: not its clock or active sensing) tells
// shared/boot.js, which holds back a reload into a new release of Forte while someone plays,
// even from another window; at most four times a second
let stirred = -Infinity;
function stir() {
  const t = performance.now();
  if (t - stirred < 250) return;
  stirred = t;
  document.dispatchEvent?.(new Event('forte-activity'));
}

// A Seaboard's panel (shared/rise.js), loaded the first time one connects; fn(panel) once it is
// there, each in the order it came (a message is drawn after the connection that brought it)
let risen = null;
function rise(fn) {
  risen ??= import('./rise.js').then((m) => m.risePanel());
  risen.then(fn, () => {});
}

/**
 * startMIDI({ onMIDI, status, button, controllers }): controllers is the page's map of the
 * controllers its instrument takes (controllersOf): one it maps (an organ's CC11) is the
 * instrument's and not the shared one's.
 */
export function startMIDI({ onMIDI, status = () => {}, button = null, controllers = {} }) {
  if (!navigator.requestMIDIAccess) { status('No Web MIDI in this browser (try Chrome, Edge or Firefox)'); return; }
  navigator.requestMIDIAccess().then((acc) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
    const inputs = new Map(); // input id → its createInput
    const send = (data) => onMIDI({ data });
    const letGo = (id) => { inputs.get(id)?.letGo(); inputs.delete(id); };
    // a device's keys follow Octave and Transpose (shift)
    const input = (id) => { let i = inputs.get(id); if (!i) inputs.set(id, (i = createInput(send, controllers, { shift: true }))); return i; };
    const seaboards = new Set(), feet = new Set();
    const PROGRAM_KEY = 'forte/rise-program/v1'; // a Seaboard's last program change (riseProgram)
    let program; try { program = JSON.parse(localStorage.getItem(PROGRAM_KEY)); } catch { /* none, or storage blocked */ }
    // the devices plugged in, for the drawer's list (midiDevices), each said what it is here
    // (a Seaboard is known by its name; any other may have an FC-300 on it: `is` says whether it has)
    const tell = () => setDevices('on', [...acc.inputs.values()].filter((inp) => inp.state !== 'disconnected')
      .map((inp) => (seaboards.has(inp.id) ? { id: inp.id, name: inp.name, what: 'MPE' } : { id: inp.id, name: inp.name, is: feet.has(inp.id) ? 'fc300' : '' })), choose);
    const footed = (inp) => { if (feet.has(inp.id)) return; feet.add(inp.id); foot((f) => f.input(inp.id, inp.name, true)); tell(); };
    // the player says what a device is, in the list: an FC-300 is on it, or none is
    const choose = (id, is) => {
      const inp = acc.inputs.get(id);
      if (!inp || inp.state === 'disconnected') return;
      if (is === 'fc300') { footRemember({ not: null }); footed(inp); return; }
      if (feet.delete(id)) foot((f) => f.forget(id));
      footRemember({ name: null, not: inp.name ?? null });
      tell();
    };
    const sought = new Set(); // the inputs an FC-300 was asked for over SysEx
    const bind = () => {
      const names = [];
      for (const inp of acc.inputs.values()) {
        if (inp.state === 'disconnected') {
          letGo(inp.id);
          if (seaboards.delete(inp.id)) rise((r) => r.input(inp.id, inp.name, false));
          if (feet.delete(inp.id)) foot((f) => f.input(inp.id, inp.name, false));
          continue;
        }
        names.push(inp.name);
        const board = /seaboard/i.test(inp.name ?? '');
        if (inp.name && inp.name === footPrefs().name) footed(inp); // the FC-300 came by this interface before
        inp.onmidimessage = (ev) => {
          const d = ev.data;
          if (d[0] >= 0x80 && d[0] < 0xf0) stir();
          lamp(inp.id, d);
          if (board) rise((r) => r.midi(inp.id, d));
          if (board && (d[0] & 0xf0) === 0xc0) { // its preset arrows: a step from the preset playing
            const i = presetIndex(), to = riseProgram(program, d[1], i, presetChoices().length);
            program = d[1];
            try { localStorage.setItem(PROGRAM_KEY, String(program)); } catch { /* storage blocked */ }
            if (to !== i) choosePreset(to);
            return;
          }
          // an FC-300's switches, as it comes (unless the player said none is on this one)
          if ((d[0] & 0xf0) === 0xb0 && d[1] >= 80 && d[1] <= 83 && !feet.has(inp.id) && !(inp.name && footPrefs().not === inp.name)) footed(inp);
          if (feet.has(inp.id)) foot((f) => f.midi(inp.id, d));
          if (feet.has(inp.id) && (d[0] & 0xf0) === 0xb0 && d[1] === 1 && footMorph(d[2])) return; // its EXP 2: Morph
          input(inp.id).take(d);
        };
        // A Seaboard sends MPE (notes on channels 2–16, each bending ±48 semitones, ROLI
        // Dashboard's defaults) but may not say so: announce its lower zone of 15 for it, as the
        // MPE Configuration Message would (MPE on Auto then decodes it; Off still ignores it)
        if (board && !seaboards.has(inp.id)) {
          seaboards.add(inp.id);
          rise((r) => r.input(inp.id, inp.name, true)); // its panel in the MIDI devices drawer (shared/rise.js)
          for (const [d1, d2] of [[101, 0], [100, 6], [6, 15], [101, 127], [100, 127]]) send([0xb0, d1, d2]);
        }
      }
      for (const id of [...inputs.keys()]) if (!acc.inputs.has(id)) letGo(id);
      for (const id of [...seaboards]) if (!acc.inputs.has(id)) { seaboards.delete(id); rise((r) => r.input(id, '', false)); }
      for (const id of [...feet]) if (!acc.inputs.has(id)) { feet.delete(id); foot((f) => f.input(id, '', false)); }
      status(names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no devices');
      tell();
      // no FC-300 known, and a device not asked yet: ask, where SysEx is allowed already
      const fresh = [...acc.inputs.values()].filter((inp) => inp.state !== 'disconnected' && !seaboards.has(inp.id) && !sought.has(inp.id));
      for (const inp of fresh) sought.add(inp.id);
      if (fresh.length && !feet.size) {
        seekFoot().then((got) => {
          const inp = got && (acc.inputs.get(got.id) ?? [...acc.inputs.values()].find((i) => i.name === got.name));
          if (inp && inp.state !== 'disconnected' && !(inp.name && footPrefs().not === inp.name)) footed(inp);
        });
      }
    };
    bind();
    acc.onstatechange = bind;
    if (button) button.hidden = true;
    midiMenu();
    if (keyShift()) import('./shell.js').then(({ toast }) => toast(`MIDI keys play ${shiftText()}: Octave and Transpose are in the MIDI settings`), () => {});
  }, () => { status('MIDI: permission denied'); setDevices('denied', []); });
}

/**
 * One source of MIDI (a device, or a song played from a file: shared/songs.js), its messages
 * cleaned on the way to send(data) as startMIDI says: a re-strike lets the note go first, a
 * note-off for a note that isn't down is dropped, a foot controller's switches are the pedals,
 * its volume and expression pedals the page's output level, a program change a preset. With
 * shift (a device's), the keys move by the player's Octave and Transpose (keyShift); a note-off
 * and its poly pressure go where its note-on went. A song has fitted itself to the keys already.
 * A device's (device, as shift by default) volume pedal moves the page's Volume control (volumePedal).
 *   const input = createInput(send, controllers, { shift, device })
 *   input.take(data)   one message
 *   input.letGo()      the source went away: its notes and pedals let go, its levels full again
 */
export function createInput(send, controllers = {}, { shift = false, device = shift } = {}) {
  // notes: 'channel:key' → the key it plays (−1 when moved past MIDI's 0…127); pedals: 'channel:cc'; held: cc
  const notes = new Map(), pedals = new Set(), held = new Set();
  const mine = (cc) => Object.hasOwn(controllers, cc); // the instrument's own
  const moved = () => (shift ? keyShift() : 0);
  return {
    take(data) {
      if (data[0] === 0xf0) return; // SysEx: a RISE's settings, which shared/rise.js reads itself
      // a foot controller's switches are the pedals (SWITCHES), unless the instrument maps them
      if ((data[0] & 0xf0) === 0xb0 && SWITCHES[data[1]] && !mine(data[1])) data = [data[0], SWITCHES[data[1]], data[2]];
      const [st, d1, d2] = data, cmd = st & 0xf0, ch = st & 0x0f, nk = `${ch}:${d1}`;
      const off = (status, vel) => { const k = notes.get(nk); notes.delete(nk); if (k >= 0) send([status, k, vel]); };
      if (cmd === 0xc0) choosePreset(d1);
      if (cmd === 0xb0 && d1 === 7 && device && volumeTo && !mine(7)) volumeTo(d2); // the page's Volume control moves with the pedal
      else if (cmd === 0xb0 && (d1 === 7 || d1 === 11) && !mine(d1)) { setLevel(d1, d2); if (d2 < 127) held.add(d1); else held.delete(d1); }
      if (cmd === 0xb0 && d1 === 121) { for (const cc of [7, 11]) if (!mine(cc)) setLevel(cc, 127); held.clear(); } // Reset All Controllers
      if (cmd === 0x90 && d2 > 0 && !mayPlay()) { needClick(); return; }
      if (cmd === 0x90 && d2 > 0) {
        if (notes.has(nk)) off(0x80 | ch, 0);
        const k = d1 + moved();
        notes.set(nk, k >= 0 && k <= 127 ? k : -1);
        if (k < 0 || k > 127) return;
        data = [st, k, d2];
      } else if (cmd === 0x80 || cmd === 0x90) { if (notes.has(nk)) off(st, d2); return; }
      else if (cmd === 0xa0) {
        const k = notes.has(nk) ? notes.get(nk) : d1 + moved();
        if (k < 0 || k > 127) return;
        data = [st, k, d2];
      }
      else if (cmd === 0xb0 && (d1 === 64 || d1 === 66 || d1 === 67)) { if (d2 >= 64) pedals.add(`${ch}:${d1}`); else pedals.delete(`${ch}:${d1}`); }
      else if (cmd === 0xb0 && (d1 === 120 || d1 === 123)) { notes.clear(); pedals.clear(); }
      send(data);
    },
    letGo() {
      for (const [nk, k] of notes) if (k >= 0) send([0x80 | +nk.split(':')[0], k, 0]);
      for (const pc of pedals) { const [ch, cc] = pc.split(':').map(Number); send([0xb0 | ch, cc, 0]); }
      for (const cc of held) setLevel(cc, 127); // a volume pedal unplugged heel down: full again
      notes.clear(); pedals.clear(); held.clear();
    },
  };
}

/**
 * The page's own MIDI handler, for what plays it besides a device: every page gives it once,
 * as it builds itself (shared/shell.js, and the pages with their own MIDI), whether or not MIDI
 * is turned on. pageMIDI() alone returns it ({ onMIDI, controllers }), or null on a page without.
 */
let page = null;
export function pageMIDI(handler) { if (handler) page = handler; return page; }

// The MIDI devices plugged in, at the top of the page's MIDI devices drawer (shared/layout.js), which
// is the page's MIDI status: each one's name, what it is here (a Seaboard sends MPE; any other says
// whether a Roland FC-300 is on it, in a menu the player can set: whatIs), and a lamp that lights as it sends (but for the clock and active sensing, which some send
// all the time); with none, why: MIDI off (with a button to turn it on), not allowed, or nothing
// plugged in. At its head the MPE switch (mpeSwitch); under the list, in the accent, how far the
// MIDI keys are moved while they are (Octave and Transpose). midiLamp() is one lamp for them all,
// for the drawer's rail, its title the status. startMIDI keeps them up to date, and says how many
// devices there are with a forte-midi-devices event on document.
const plugged = { box: null, state: 'off', devices: [], lamps: new Map(), any: new Set(), choose: null };
function setDevices(state, devices, choose = null) {
  plugged.state = state; plugged.devices = devices; plugged.choose = choose;
  drawDevices();
  if (typeof document !== 'undefined' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('forte-midi-devices', { detail: devices.length }));
}
// a lamp lit for 120 ms
const flash = (l) => {
  if (!l.lit) { l.lit = true; l.el.classList.add('on'); }
  clearTimeout(l.t);
  l.t = setTimeout(() => { l.lit = false; l.el.classList.remove('on'); }, 120);
};
function lamp(id, d) {
  if (d[0] >= 0xf8) return;
  const l = plugged.lamps.get(id);
  if (l) flash(l);
  for (const a of plugged.any) flash(a);
}
// what the status says: MIDI off, not allowed, nothing plugged in, or the devices by name
const statusText = () => {
  const { state, devices } = plugged;
  return state === 'off' ? 'MIDI off' : state === 'denied' ? 'MIDI: not allowed'
    : devices.length ? `MIDI: ${devices.map((d) => d.name || 'a device').join(', ')}` : 'MIDI: nothing plugged in';
};
const make = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text ? { textContent: text } : {});
export function midiLamp() {
  const l = { el: make('i', 'forte-midi-lamp forte-midi-any'), lit: false, t: 0 };
  l.el.setAttribute('aria-hidden', 'true');
  plugged.any.add(l);
  drawDevices();
  return l.el;
}
export function midiDevices() {
  if (plugged.box) return plugged.box;
  const box = plugged.box = make('div', 'forte-midi-devices');
  const head = make('div', 'forte-midi-devices-head'), list = make('ul');
  head.append(make('h3', '', 'Plugged in'), mpeSwitch());
  list.setAttribute('aria-label', 'MIDI devices plugged in');
  const note = make('p'), on = make('button', '', 'Enable MIDI'), moved = make('p', 'forte-midi-shift');
  for (const e of [list, note, moved]) e.setAttribute('aria-live', 'polite'); // MIDI on, a device plugged in or gone, the keys moved
  on.type = 'button';
  on.title = 'Let this page hear your MIDI devices (the browser asks first)';
  on.addEventListener('click', () => { document.querySelector('#midi-btn')?.click(); unfocus(on); });
  box.append(head, list, note, on, moved);
  plugged.parts = { list, note, on, moved };
  drawDevices();
  showShift();
  return box;
}
// What a device is, in its row: a MIDI interface's name says nothing of what is plugged into it,
// so the player can say a Roland FC-300 is (it then has its panel, and its EXP 2 moves Morph), or
// that none is; the row shows what the page found by itself (startMIDI)
const WHAT = [['', 'MIDI device'], ['fc300', 'Roland FC-300']];
function whatIs(d) {
  const sel = make('select', 'forte-midi-what');
  for (const [v, text] of WHAT) sel.add(new Option(text, v));
  sel.value = d.is ?? '';
  sel.setAttribute('aria-label', `What ${d.name || 'this MIDI device'} is`);
  sel.title = 'What is plugged in here. A Roland FC-300 comes through a MIDI interface, which can\'t say so: it shows by itself once one of its CTL pedals is pressed. If it doesn\'t, choose Roland FC-300 on the interface it is plugged into: it gets its panel below, and its EXP 2 pedal moves Morph';
  sel.addEventListener('change', () => { const { choose } = plugged; unfocus(sel); choose?.(d.id, sel.value); });
  return sel;
}
/** Say what a plugged-in device is, as its row's menu does: 'fc300' (a Roland FC-300 is on it) or '' (none is). */
export function midiDeviceIs(id, is) { plugged.choose?.(id, is); }
function drawDevices() {
  for (const a of plugged.any) a.el.title = statusText();
  if (!plugged.box) return;
  const { list, note, on } = plugged.parts, { state, devices } = plugged;
  for (const l of plugged.lamps.values()) clearTimeout(l.t);
  plugged.lamps.clear();
  list.replaceChildren(...devices.map((d) => {
    const li = make('li'), light = make('i', 'forte-midi-lamp'), name = make('span', '', d.name || 'A MIDI device');
    name.title = d.name || '';
    li.append(light, name);
    if (d.what) li.append(make('small', '', d.what));
    else if (plugged.choose) li.append(whatIs(d));
    plugged.lamps.set(d.id, { el: light, lit: false, t: 0 });
    return li;
  }));
  list.hidden = !devices.length;
  note.textContent = state === 'off' ? 'MIDI is off. Turn it on to play this page from a keyboard, a Seaboard or a foot controller.'
    : state === 'denied' ? 'The browser didn\'t let this page use MIDI. Allow MIDI for this site in the browser\'s settings, then turn it on again.'
    : devices.length ? '' : 'Nothing plugged in. A MIDI device shows here as soon as it is plugged in, and plays at once.';
  note.hidden = !note.textContent;
  on.hidden = state === 'on';
}

// MPE's switch: on, a controller that sends MPE (a Seaboard: startMIDI says so for it) bends, slides
// and presses each note on its own; off, it plays notes and nothing more, on every page (shared/mpe.js
// Off). On is Auto (an ordinary keyboard plays as ever); one chosen On before reads as on, and stays.
export function mpeSwitch() {
  const box = make('div', 'forte-mpe-switch');
  const name = make('span', '', 'MPE'), sw = make('button', 'forte-slide');
  sw.type = 'button';
  sw.setAttribute('role', 'switch');
  sw.title = 'MPE, on every instrument: on, each finger on a controller that sends MPE (a Seaboard) bends, slides and presses its own note, as the instrument’s Expression switches let it; off, the controller plays notes alone, each as hard as it was struck, and its glide, slide and press move nothing';
  sw.setAttribute('aria-label', 'MPE');
  sw.append(make('i'));
  const show = () => {
    const on = mpe !== 'off';
    sw.setAttribute('aria-checked', String(on));
    box.classList.toggle('on', on);
  };
  const flip = () => {
    setMpeMode(mpe === 'off' ? 'auto' : 'off');
    import('./shell.js').then(({ toast }) => toast(mpe === 'off' ? 'MPE off: a controller plays notes alone, its glide, slide and press move nothing'
      : 'MPE on: each finger bends, slides and presses its own note, where the instrument lets it'), () => {});
  };
  sw.addEventListener('click', () => { flip(); unfocus(sw); });
  name.addEventListener('click', () => sw.click());
  document.addEventListener('forte-mpe', show);
  box.append(name, sw);
  show();
  return box;
}

// The MIDI keys' velocity curve (every page shares it): a control as the instrument's are, with the
// computer keys' velocity in the Velocity section of the page's Global settings drawer (shared/layout.js)
export function touchControl() {
  const box = make('div', 'param forte-touch');
  const label = make('label', '', 'Velocity curve (MIDI keys)'), el = make('select');
  el.id = 'touch'; label.htmlFor = el.id;
  TOUCH.forEach((t, i) => el.add(new Option(t.name, i)));
  el.value = String(touchIndex);
  el.addEventListener('change', () => { setTouch(+el.value); unfocus(el); });
  box.append(label, el, make('div', 'hint', 'The velocity curve of every instrument: how hard a MIDI key has to be struck. Soft makes a light touch louder, Hard asks for a firmer one; Normal is the velocity as the keyboard sends it.'));
  return box;
}

// The MIDI settings: Octave and Transpose (and where a page has no drawer, the velocity curve and
// MPE too), each a labelled dropdown (midiSettings, at the bottom of the page's MIDI devices drawer,
// shared/layout.js). Where there is no drawer, the MIDI status opens them in a menu under it, and
// says how far the keys are moved, in the accent, while they are; in the drawer, midiDevices does.
export function midiSettings(ids = ['octave', 'transpose']) {
  const box = document.createElement('div');
  box.className = 'forte-midi-settings';
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'MIDI settings');
  const steps = (n) => Array.from({ length: 2 * n + 1 }, (_, i) => [i - n, signed(i - n)]);
  for (const [id, name, title, options, value, set] of [
    ['touch', 'Touch', 'The velocity curve: how hard a MIDI key has to be struck. Soft makes a light touch louder, Hard asks for a firmer one.',
      TOUCH.map((t, i) => [i, t.name]), touchIndex, (v) => setTouch(+v)],
    ['mpe'],
    ['octave', 'Octave', 'Plays the MIDI keys up to four octaves higher or lower, so a small keyboard reaches all 88 keys. The keys on the screen and the computer keys play what they show.',
      steps(OCTAVES), shift.octave, (v) => setShift({ octave: +v })],
    ['transpose', 'Transpose', 'Plays the MIDI keys up to twelve semitones higher or lower, so a piece fingered in one key sounds in another. The keys on the screen and the computer keys play what they show.',
      steps(SEMITONES).map(([v, t]) => [v, v ? `${t} semitone${Math.abs(v) > 1 ? 's' : ''}` : t]), shift.transpose, (v) => setShift({ transpose: +v })],
  ]) {
    if (!ids.includes(id)) continue;
    if (id === 'mpe') { const sw = mpeSwitch(); box.append(sw); continue; }
    const row = document.createElement('label');
    row.title = title;
    const el = document.createElement('select');
    el.id = id;
    for (const [v, text] of options) el.add(new Option(text, v));
    el.value = String(value);
    el.addEventListener('change', () => { set(el.value); unfocus(el); });
    row.append(Object.assign(document.createElement('span'), { textContent: name }), el);
    box.append(row);
  }
  return box;
}
function midiMenu() {
  const pill = document.querySelector('#midi');
  // with a MIDI devices drawer (shared/layout.js), that is the status: no pill
  if (!pill || pill.classList.contains('forte-midi-pill') || document.querySelector('#forte-midi')) { showShift(); return; }
  pill.classList.add('forte-midi-pill');
  pill.setAttribute('role', 'button'); pill.tabIndex = 0;
  pill.title = 'MIDI settings: touch, MPE, octave and transpose';
  const menu = midiSettings(['touch', 'mpe', 'octave', 'transpose']);
  menu.id = 'midi-menu'; menu.classList.add('forte-midi-menu'); menu.hidden = true;
  pill.after(menu);
  pill.setAttribute('aria-haspopup', 'true'); pill.setAttribute('aria-controls', menu.id); pill.setAttribute('aria-expanded', 'false');
  const open = (on) => {
    menu.hidden = !on;
    pill.setAttribute('aria-expanded', String(on));
    if (!on) return;
    // below the pill, inside the window
    const r = pill.getBoundingClientRect(), w = menu.offsetWidth;
    menu.style.top = `${Math.round(r.bottom + 6)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  };
  pill.addEventListener('click', () => open(menu.hidden));
  pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(menu.hidden); } });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !pill.contains(e.target)) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { open(false); pill.focus(); } });
  window.addEventListener('resize', () => open(false));
  window.addEventListener('scroll', () => open(false), { passive: true }); // a phone's page: it would float away from the status
  showShift();
}
// the status says how far the keys are moved, while they are: the drawer's line, else the pill
function showShift() {
  if (typeof document === 'undefined' || !document.querySelector) return;
  const moved = plugged.parts?.moved, text = shiftText();
  if (moved) { moved.textContent = text ? `MIDI keys play ${text}` : ''; moved.hidden = !text; }
  const pill = document.querySelector('#midi');
  if (!pill) return;
  const { octave: o, transpose: t } = shift;
  const short = [o && `Octave ${signed(o)}`, t && `Transpose ${signed(t)}`].filter(Boolean).join(', ');
  if (short) pill.dataset.shift = short; else delete pill.dataset.shift;
}

/**
 * The sostenuto pedal (CC66): it holds the keys sounding as it goes down, and only those, until
 * it comes up (a piano's middle pedal).
 *   set(on, sounding)  the pedal; sounding: the keys sounding now. Coming up, it returns the keys
 *                      it was holding: those no hand holds now are the page's to let go
 *   holds(key)         a key let go: true if the pedal keeps it sounding
 *   strike(key)        a key struck again (no longer the pedal's)
 */
export function createSostenuto() {
  let on = false;
  const caught = new Set(), holding = new Set();
  return {
    set(down, sounding) {
      if (down === on) return [];
      on = down;
      if (down) { for (const k of sounding) caught.add(k); return []; }
      const out = [...holding];
      caught.clear(); holding.clear();
      return out;
    },
    holds(key) { if (on && caught.has(key)) { holding.add(key); return true; } return false; },
    strike(key) { holding.delete(key); },
    keys: () => holding,
    clear() { on = false; caught.clear(); holding.clear(); },
  };
}

/**
 * A page's MPE (shared/mpe.js, in the mode the player chose): each note's own bend, slide and
 * pressure as the engine's messages, which shared/shell.js and the pages with their own MIDI post.
 *   const notes = pageMpe({ post, params: () => P, slide, groups })   (slide: what a slide moves,
 *                                shared/expression.js slideOf; or modWheel: the descriptor's; or none)
 *   const r = notes.midi(data)   r.own: MPE's own message (the page does nothing more with it);
 *                                r.with: a note-on's own expression, to post just before its noteOn
 *   notes.strike(key, own)       what to post before a key's noteOn: its own (r.with), or, for a note
 *                                without, a reset if the key had some
 * A bend becomes { type: 'noteBend', key, value: the frequency ratio along the tuning }, a slide
 * { type: 'slide', key, value: the slide's parameter as the wheel would set it (NaN: none) },
 * pressure { type: 'pressure', value, key, own: true } (a note's own, which on the instruments whose
 * notes hold sets the level a note holds at: forte/engine.h notePressure).
 */
export function pageMpe({ post, params, slide, modWheel, groups = [] }) {
  const wheel = slide ?? (modWheel && (typeof modWheel === 'string' ? { param: modWheel } : modWheel));
  const p = wheel && groups.flatMap((g) => g.params).find((q) => q.id === wheel.param);
  const expressed = new Set(); // keys the engine was given their own bend or slide
  let gathering = null;        // a note-on's own, gathered to go with it
  const express = (m) => { expressed.add(m.key); if (gathering) gathering.push(m); else post(m); };
  const mpe = createMpe({
    noteBend: (key, semitones) => express({ type: 'noteBend', key, value: bendRatio(params(), key, semitones) }),
    noteSlide: (key, u) => { if (p) express({ type: 'slide', key, value: Number.isNaN(u) ? NaN : wheelValue(p, u * 127, wheel.max ?? p.max) }); },
    notePressure: (key, value) => post({ type: 'pressure', value, key, own: true }),
  });
  let on = false;
  return {
    mpe,
    midi(data) {
      mpe.mode = mpeMode();
      gathering = (data[0] & 0xf0) === 0x90 && data[2] > 0 ? [] : null;
      const own = mpe.midi(data), got = gathering;
      gathering = null;
      if (mpe.active() !== on) {
        on = mpe.active();
        if (mpe.mode === 'auto') import('./shell.js').then(({ toast }) => toast(on ? `MPE on: each note on a channel of its own (${mpe.members(0) + mpe.members(1)} channels)` : 'MPE off'));
      }
      return { own, with: got?.length ? got : undefined };
    },
    strike(key, own) {
      if (own) return own;
      if (!expressed.has(key)) return [];
      expressed.delete(key);
      return [{ type: 'noteBend', key, value: 1 }, { type: 'slide', key, value: NaN }];
    },
  };
}

/**
 * A controller's five touch controls, as a Seaboard RISE sends them in its MIDI mode (white
 * lights; ROLI Dashboard can move them to other CCs): three faders, then the XY pad's X and Y.
 * An instrument's descriptor gives each a parameter in `faders` ([fader 1, 2, 3, X, Y]).
 */
export const FADERS = [[107, 'Fader 1'], [109, 'Fader 2'], [111, 'Fader 3'], [113, 'Pad X'], [114, 'Pad Y']];

/** The MIDI controllers a descriptor maps (CC → a parameter's id, or a switch): its `controllers` and its `faders`. */
export function controllersOf(I) {
  const out = {};
  (I.faders ?? []).forEach((id, i) => { if (id && FADERS[i]) out[FADERS[i][0]] = id; });
  return { ...out, ...I.controllers };
}

/**
 * A controller (0..127) across parameter p's whole range, as its slider moves it (in log(value)
 * for a log one): a checkbox is on at 64 and above, a choice's options follow in turn.
 */
export function ccValue(p, v) {
  const u = Math.min(1, Math.max(0, v / 127));
  if (p.type === 'checkbox') return v >= 64;
  if (p.type === 'select') return p.options[Math.round(u * (p.options.length - 1))][0];
  let x = p.log ? p.min * (p.max / p.min) ** u : p.min + (p.max - p.min) * u;
  if (p.step) x = Math.round(x / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, x));
}

/**
 * What controller cc at v sets, from the map controllersOf gives: [param id, value], or null.
 * A switch ({ param, values: [a, b] }: b from 64 up; { param, toggle: [a, b] }: flipped by each
 * press) leaves alone a parameter on neither of its values. `last` keeps each controller's last
 * value (a press is a rise through 64); `P` the page's parameters; `params` their descriptions.
 */
export function controlled(map, params, P, cc, v, last) {
  const before = last[cc] ?? 0, c = map[cc];
  last[cc] = v;
  if (c === undefined) return null;
  if (typeof c === 'object') {
    const [a, b] = c.values ?? c.toggle, now = P[c.param];
    if (now !== a && now !== b) return null;
    if (c.values) return [c.param, v >= 64 ? b : a];
    return v >= 64 && before < 64 ? [c.param, now === a ? b : a] : null;
  }
  const p = params.find((q) => q.id === c);
  return p ? [c, ccValue(p, v)] : null;
}

// The first time a fader or the pad moves a control, a toast says which
const told = new Set();
export function tellFader(cc, p) {
  const f = FADERS.find(([n]) => n === cc);
  if (!f || !p || told.has(cc)) return;
  told.add(cc);
  import('./shell.js').then(({ toast }) => toast(`${f[1]} (CC${cc}): ${p.label}`));
}

/** Turn MIDI on without a click when this site turned it on before and the browser still grants it. */
export async function resumeMIDI(start) {
  let wanted = false;
  try { wanted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
  if (!wanted || !navigator.requestMIDIAccess || !navigator.permissions?.query) return;
  try {
    if ((await navigator.permissions.query({ name: 'midi' })).state === 'granted') start();
  } catch { /* 'midi' is not a permission this browser can be asked about: wait for the button */ }
}

/** The mod wheel (CC value 0..127) on parameter p: at rest its default, fully up `top` (its max). */
export function wheelValue(p, cc, top = p.max) {
  if (cc <= 0) return p.def;
  const u = cc / 127;
  let v = p.log ? p.def * (top / p.def) ** u : p.def + (top - p.def) * u;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return Math.min(p.max, Math.max(p.min, v));
}
