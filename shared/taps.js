// taps.js — the places a note reaches a page, where shared/layer.js's second instrument takes its
// share first: MIDI (shared/midi.js), the keys on screen (shared/keyboard.js) and the computer's
// keys (each page's own). On its own, a page plays everything, as before. Kept apart, with no
// imports, so midi.js and keyboard.js need nothing of layer.js.

const taps = { midi: null, key: null };
export function tap(kind, fn) { taps[kind] = fn; }

// A MIDI message, as it reaches the page: false when the page's instrument isn't to have it (a
// key the second instrument plays alone, in a split).
export const midiTap = (data) => taps.midi?.(data) ?? true;

// A key down (on) or up, from 'screen' (value: how far down the key it was struck, 0..1) or 'keys'
// (the computer's): true when the page's instrument plays it, or let go of it.
export const keyTap = (key, on, from, value) => taps.key?.(key, on, from, value) ?? true;

// The computer's keys, as every page plays them: computerKey(key, true) before the page's own
// note-on, computerKey(key, false) before its note-off; false: not the page's.
export const computerKey = (key, on) => keyTap(key, on, 'keys');
