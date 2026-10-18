// tonewheels.js — the Hammond B-3 tone generator's layout, for the page: the keyboard, the
// wheels and the drawbars. Its numbers (wheel frequencies, the keys' taps, the generator's tables)
// are computed by the C++ (native/instruments/organ/organ-model.cpp), built as WebAssembly
// (organ-wasm.js wasmModel).
//
// A synchronous motor (1200 rpm on 60 Hz mains) turns a main shaft at 20 rev/s.
// Twelve gear pairs, one per pitch class, step that speed by ratios chosen to
// approximate 2^(1/12) with small integers. Each driven shaft carries steel
// tonewheels with 2, 4, 8 … 128 teeth (one per octave) spinning in front of a
// magnetic pickup, so
//
//     f_wheel = 20 rev/s × (driving / driven teeth) × wheel teeth.
//
// Wheels 1–84 cover C1–B7. The top seven (85–91, C8–F♯8) have 192 teeth and
// sit on the shafts a fifth lower, so they are pure 3:2 fifths of those
// shafts rather than tempered ones.
//
// A key taps nine wheels (one per drawbar). Because the wheels are shared
// and tuned to the tempered scale, the "harmonics" 5⅓', 2⅔', 1⅗', 1⅓' are
// tempered intervals, not true harmonics, and the top drawbars fold back an
// octave when they run out of wheels.

export const PC_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NUM_WHEELS = 91;
export const KEY_LO = 36, KEY_HI = 96; // the B-3's 61-key manual, C2–C7 at 8'
export const KEY_MIN = 21, KEY_MAX = 108; // what it plays: A0–C8, the wheels folding back an octave where a drawbar runs out

export const DRAWBARS = [
  { name: '16′', label: "16'", offset: -12, harmonic: 0.5, color: 'brown' },
  { name: '5⅓′', label: "5 1/3'", offset: 7, harmonic: 1.5, color: 'brown' },
  { name: '8′', label: "8'", offset: 0, harmonic: 1, color: 'white' },
  { name: '4′', label: "4'", offset: 12, harmonic: 2, color: 'white' },
  { name: '2⅔′', label: "2 2/3'", offset: 19, harmonic: 3, color: 'black' },
  { name: '2′', label: "2'", offset: 24, harmonic: 4, color: 'white' },
  { name: '1⅗′', label: "1 3/5'", offset: 28, harmonic: 5, color: 'black' },
  { name: '1⅓′', label: "1 1/3'", offset: 31, harmonic: 6, color: 'black' },
  { name: '1′', label: "1'", offset: 36, harmonic: 8, color: 'white' },
];
