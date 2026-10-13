// tonewheels.js — the Hammond B-3 tone generator as numbers.
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

export const GEAR = [ // [driving, driven] teeth for C, C♯, … B
  [85, 104], [71, 82], [67, 73], [105, 108], [103, 100], [84, 77],
  [74, 64], [98, 80], [96, 74], [88, 64], [67, 46], [108, 70],
];
export const PC_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NUM_WHEELS = 91;
export const SHAFT_RPS = 20;        // main shaft, 60 Hz mains
export const KEY_LO = 36, KEY_HI = 96; // 61-key manual, C2–C7 at 8'
export const NUM_KEYS = KEY_HI - KEY_LO + 1;

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

export function wheelSpec(w) {
  if (w <= 84) {
    const pc = (w - 1) % 12, oct = Math.floor((w - 1) / 12);
    return { w, pc, octave: oct + 1, teeth: 2 << oct, gear: GEAR[pc], shaftPc: pc };
  }
  const pc = w - 85, shaftPc = pc + 5; // C8 on the F shaft, … F♯8 on the B shaft
  return { w, pc, octave: 8, teeth: 192, gear: GEAR[shaftPc], shaftPc };
}

export const etFreq = (w) => 440 * 2 ** ((w - 46) / 12);           // wheel 46 = A4
export const gearFreq = (w) => { const s = wheelSpec(w); return (SHAFT_RPS * s.teeth * s.gear[0]) / s.gear[1]; };
export const centsOff = (w) => 1200 * Math.log2(gearFreq(w) / etFreq(w));
export const wheelName = (w) => { const s = wheelSpec(w); return `${PC_NAMES[s.pc]}${s.octave}`; };

// Wheel tapped by drawbar d of a key (MIDI note), with the B-3's foldback.
export function keyWheel(key, d) {
  let w = key - 23 + DRAWBARS[d].offset; // key 36 (C2) → wheel 13 at 8'
  while (w > NUM_WHEELS) w -= 12;
  while (w < 1) w += 12;
  return w;
}
export function percWheel(key, third) {
  let w = key - 23 + (third ? 19 : 12);
  while (w > NUM_WHEELS) w -= 12;
  return w;
}

export const drawbarGain = (n) => (n <= 0 ? 0 : 10 ** ((-3 * (8 - n)) / 20)); // ~3 dB per step

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Everything the audio engine needs to know about the generator.
export function buildGenerator(P, fs) {
  const r = rng(91);
  const wheelHz = new Float64Array(NUM_WHEELS + 1);
  const level = new Float64Array(NUM_WHEELS + 1);
  const a2 = new Float64Array(NUM_WHEELS + 1), a3 = new Float64Array(NUM_WHEELS + 1);
  const partner = new Int16Array(NUM_WHEELS + 1), xtalk = new Float64Array(NUM_WHEELS + 1);
  const leak = new Float64Array(NUM_WHEELS + 1);
  const mains = P.mains / 60;
  const xt = P.crosstalk <= -79 ? 0 : 10 ** (P.crosstalk / 20);
  const lk = P.leakage <= -89 ? 0 : 10 ** (P.leakage / 20);
  for (let w = 1; w <= NUM_WHEELS; w++) {
    wheelHz[w] = (P.tuning === 'et' ? etFreq(w) : gearFreq(w)) * mains;
    // pickup output is close to a sine; low wheels (few, broad teeth) less so
    const low = 1 - (w - 1) / 90;
    level[w] = 1 + 0.06 * (r() - 0.5);
    a2[w] = wheelHz[w] * 2 < 0.45 * fs ? P.wheelHarm * 0.04 * (0.3 + low) : 0;
    a3[w] = wheelHz[w] * 3 < 0.45 * fs ? P.wheelHarm * 0.10 * (0.2 + low * low) : 0;
    // wheels sharing a compartment are four octaves apart
    partner[w] = w + 48 <= NUM_WHEELS ? w + 48 : w - 48 >= 1 ? w - 48 : 0;
    xtalk[w] = partner[w] ? xt * (0.6 + 0.8 * r()) : 0;
    leak[w] = lk * (0.3 + 0.7 * r());
  }
  const keyMap = new Int16Array(NUM_KEYS * 9);
  const perc2 = new Int16Array(NUM_KEYS), perc3 = new Int16Array(NUM_KEYS);
  const keyHz = new Float64Array(NUM_KEYS);
  for (let k = 0; k < NUM_KEYS; k++) {
    const key = KEY_LO + k;
    for (let d = 0; d < 9; d++) keyMap[k * 9 + d] = keyWheel(key, d);
    perc2[k] = percWheel(key, false);
    perc3[k] = percWheel(key, true);
    keyHz[k] = wheelHz[keyWheel(key, 2)];
  }
  return {
    wheelHz, level, a2, a3, partner, xtalk, leak, keyMap, perc2, perc3, keyHz,
    harmonic: P.tuning === 'harmonic',
  };
}

// For the analysis table: the nine tones a key actually sounds vs. the ideal
// harmonic series of its 8′ pitch.
export function keyAnalysis(key, P) {
  const mains = P.mains / 60;
  const f = (w) => (P.tuning === 'et' ? etFreq(w) : gearFreq(w)) * mains;
  const f8 = f(keyWheel(key, 2));
  return DRAWBARS.map((db, d) => {
    const w = keyWheel(key, d);
    const ideal = f8 * db.harmonic;
    const actual = P.tuning === 'harmonic' ? ideal : f(w);
    return { d, name: db.name, w, actual, ideal, cents: 1200 * Math.log2(actual / ideal), folded: key - 23 + db.offset > NUM_WHEELS };
  });
}
