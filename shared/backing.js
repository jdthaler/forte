// backing.js — "PI Requests": a 1980s home keyboard's rhythm box and auto-accompaniment, under
// an instrument's own controls. Preset rhythms (drums, a bass line and chord stabs), Start/Stop,
// Synchro start (the rhythm waits for the first key), Fill in, a tempo and the backing's own
// volume; the bass and chords follow the chord the left hand holds below middle C, one key
// for its major chord, and keep it after the keys come up, as those keyboards did.
//
// Asked for by the PI of ABRACADABRA and CUORE, whose experiments come with backing tracks of
// their own: a pulse-tube cooler's thump and hiss, 1.4 times a second, and (CUORE) the
// Mediterranean, whose waves the crystals hear as microseisms. Those are rhythms here too.
//
// Page only: the sound is made with Web Audio nodes on the page's AudioContext, straight into the
// output's limiter (after the instrument's volume and room), and its settings are kept in this
// browser, in no preset or link. The plugins have no rhythm box; a DAW has its own drums.
//
//   const backing = attachBacking(shell, { id, styles: ['pulsetube', …], about: { pulsetube: '…' } })
//   backing.noteOn()   from the page's onNoteOn: Synchro start waits for it
//   backing.stop()     from the page's onPanic
//
// The pure parts (the rhythms, chordOf, voicing, stepLength) are exported for test/backing-tests.mjs.

// ---- the rhythms ------------------------------------------------------------------------------
// A rhythm is steps of a bar: `bar` steps to a bar, `beat` to a beat, `bpm` beats a minute.
// Each drum track is a string of steps ('.' rest, 'o' soft, 'x' a hit, 'X' an accent), repeated
// to the longest track. bass: R root, 3 the chord's third, 5 its fifth, 6 a sixth, 7 its seventh
// (or a flat one), 8 the octave. chords: x a stab, L held to the next. fill: the drums of the
// bar's end when Fill in is pressed (its first hit to the bar's end). swing: the share of a pair
// of steps the first takes.
export const STYLES = {
  pulsetube: {
    name: 'Pulse tube', bpm: 84, bar: 16, beat: 4,
    drums: {
      thunk:  'X...x...X...x...',
      inhale: 'x...x...x...x...',
      exhale: '..x...x...x...x.',
      valve:  '.o.o.o.o.o.o.o.o',
      clap:   '....x.......x...',
    },
    bass:   'R.....R.5.....5.',
    chords: '..x...x...x...x.',
    fill: { tomHi: '........x.x.....', tomLo: '............x.x.', clap: '..............xX' },
  },
  sea: {
    name: 'Mediterranean weather', bpm: 126, bar: 6, beat: 3, sea: true,
    drums: {
      tamb:  'XxxXxx',
      kick:  'x..o..',
    },
    bass:   'R..5..R..3..',
    chords: '.xx.xx',
    fill: { tomHi: '...xx.', tomLo: '.....X' },
  },
  rock: {
    name: 'Rock', bpm: 120, bar: 16, beat: 4,
    drums: {
      kick:  'X.....x.X.x.....',
      snare: '....X.......X...',
      hat:   'x.x.x.x.x.x.x.x.',
    },
    bass:   'R...R.R.5...5.R.',
    chords: 'L.......L.......',
    fill: { tomHi: '........xx......', tomLo: '..........xx....', snare: '............xxxX' },
  },
  disco: {
    name: 'Disco', bpm: 118, bar: 16, beat: 4,
    drums: {
      kick:  'X...X...X...X...',
      clap:  '....x.......x...',
      hat:   'x...x...x...x...',
      ohat:  '..x...x...x...x.',
    },
    bass:   'R.8.R.8.R.8.R.8.',
    chords: '..x...x...x...x.',
    fill: { snare: '........x.x.xxxx', tomLo: '..............x.' },
  },
  beat16: {
    name: '16 Beat', bpm: 100, bar: 16, beat: 4,
    drums: {
      kick:  'X.....x.X..x....',
      snare: '....X.......X...',
      hat:   'xoxoxoxoxoxoxoxo',
    },
    bass:   'R..R..R.5..5..R.',
    chords: 'x..x..x.....x...',
    fill: { tomHi: '........x.x.....', tomLo: '............x.x.', snare: '.........x.x...X' },
  },
  swing: {
    name: 'Swing', bpm: 132, bar: 8, beat: 2, swing: 0.64,
    drums: {
      ride:  'x.xxx.xx',
      hat:   '..o...o.',
      kick:  'o...o...',
    },
    bass:   'R.3.5.6.8.6.5.3.',
    chords: '..x...x.',
    fill: { snare: '....x.xx', tomLo: '.......X' },
  },
  slowrock: {
    name: 'Slow Rock', bpm: 66, bar: 12, beat: 3,
    drums: {
      kick:  'X.....x.x...',
      snare: '...X.....X..',
      hat:   'xooxooxooxoo',
    },
    bass:   'R..5..8..5..',
    chords: 'x..x..x..x..',
    fill: { tomHi: '......xxx...', tomLo: '.........xxX' },
  },
  waltz: {
    name: 'Waltz', bpm: 150, bar: 6, beat: 2,
    drums: {
      kick:  'X.....',
      hat:   '..o.o.',
    },
    bass:   'R.....5.....',
    chords: '..x.x...x.x.',
    fill: { tomHi: '..xx..', tomLo: '....xx' },
  },
  bossa: {
    name: 'Bossa Nova', bpm: 130, bar: 16, beat: 4,
    drums: {
      kick:   'X..xX..xX..xX..x',
      rim:    'x..x..x...x..x..',
      shaker: 'oxoooxoooxoooxoo',
    },
    bass:   'R.....5.R.....5.',
    chords: 'x..x..x...x..x..',
    fill: { conga: '........xx.x.x..', congaLo: '..............xx' },
  },
  samba: {
    name: 'Samba', bpm: 112, bar: 16, beat: 4,
    drums: {
      kick:    'x.......x.......',
      congaLo: '....X.......X...',
      tamb:    'xoxxxoxxxoxxxoxx',
      cow:     'x.x.x..x.x.x.x..',
    },
    bass:   'R..5R..5R..5R..5',
    chords: 'x..x..x...x.x...',
    fill: { tomHi: '........xxx.....', tomLo: '...........xxxX.' },
  },
};
export const GENERIC = ['rock', 'disco', 'beat16', 'swing', 'slowrock', 'waltz', 'bossa', 'samba'];

export const ABOUT = {
  rock: 'A rock beat: kick, a snare on two and four, eighths on the hi-hat, and power chords.',
  disco: 'Four on the floor, the hi-hat open on the off-beats and the bass jumping octaves.',
  beat16: 'The 1980s pop beat in sixteenths, the hi-hat ticking every one.',
  swing: 'Swung eighths on the ride, the hi-hat on two and four, and a walking bass.',
  slowrock: 'A slow 12/8: triplets on the hi-hat and an arpeggio in the bass. Its tempo counts dotted quarters.',
  waltz: 'Oom-pah-pah: the bass on one, the chord on two and three.',
  bossa: 'Bossa nova: the kick\'s dotted rhythm, the rim\'s clave and a shaker.',
  samba: 'Samba: the surdo on two, a tambourine in sixteenths and the agogô.',
};

// The sea states (the Douglas scale's): the waves' height, in metres, and the swell's period. Sea
// waves run at 0.1–0.4 Hz, longer as they grow; CUORE's noise near 0.6 Hz grows with their height.
export const SEA = [
  { id: 'calm', name: 'Calm (0.1 m)', height: 0.1, period: 3 },
  { id: 'slight', name: 'Slight (1 m)', height: 1, period: 5 },
  { id: 'moderate', name: 'Moderate (2 m)', height: 2, period: 6.5 },
  { id: 'rough', name: 'Rough (3.5 m)', height: 3.5, period: 8 },
  { id: 'storm', name: 'Storm (5 m)', height: 5, period: 10 },
];

// A rhythm's length in steps: its longest track.
export function lengthOf(s) {
  return Math.max(s.bar, s.bass?.length ?? 0, s.chords?.length ?? 0, ...Object.values(s.drums).map((t) => t.length));
}
// The length of step i, in seconds: swing lengthens the first of each pair.
export function stepLength(s, bpm, i) {
  const d = 60 / bpm / s.beat;
  return s.swing ? 2 * d * (i % 2 ? 1 - s.swing : s.swing) : d;
}
const LEVEL = { o: 0.45, x: 0.75, X: 1 };
export const hitAt = (track, i) => LEVEL[track[i % track.length]] ?? 0;
// where a rhythm's fill begins in its bar: its first hit
export const fillFrom = (s) => Math.min(...Object.values(s.fill).map((t) => t.search(/[^.]/)).filter((i) => i >= 0));

// ---- chords --------------------------------------------------------------------------------------
// The chord a hand spells. One key: its major chord. More: the chord whose notes they match best,
// a root among them, the lowest note's on a tie.
export const CHORDS = [
  { name: '', tones: [0, 4, 7] }, { name: 'm', tones: [0, 3, 7] }, { name: '7', tones: [0, 4, 7, 10] },
  { name: 'maj7', tones: [0, 4, 7, 11] }, { name: 'm7', tones: [0, 3, 7, 10] }, { name: '6', tones: [0, 4, 7, 9] },
  { name: 'dim', tones: [0, 3, 6] }, { name: 'aug', tones: [0, 4, 8] }, { name: 'sus4', tones: [0, 5, 7] },
];
const PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const chordName = (c) => (c ? PC[c.root] + c.name : '');
export function chordOf(keys) {
  if (!keys.length) return null;
  const low = Math.min(...keys), pcs = [...new Set(keys.map((k) => ((k % 12) + 12) % 12))];
  if (pcs.length === 1) return { root: pcs[0], ...CHORDS[0] };
  let best = null, score = -Infinity;
  for (const root of pcs) {
    const rel = new Set(pcs.map((p) => (p - root + 12) % 12));
    for (const c of CHORDS) {
      const hit = c.tones.filter((t) => rel.has(t)).length, extra = rel.size - hit, missing = c.tones.length - hit;
      const sc = 2 * hit - 2 * extra - 0.6 * missing + (root === low % 12 ? 0.3 : 0) - (c.tones.length > 3 ? 0.1 : 0);
      if (sc > score) { score = sc; best = { root, ...c }; }
    }
  }
  return best;
}
// The bass's note for a degree of the chord, in the octave from C2.
export function bassNote(c, deg) {
  const t = c.tones, third = t.find((x) => x >= 3 && x <= 5) ?? 4, fifth = t.find((x) => x >= 6 && x <= 8) ?? 7;
  const off = { R: 0, 3: third, 5: fifth, 6: 9, 7: t.find((x) => x >= 9) ?? 10, 8: 12 }[deg] ?? 0;
  return 36 + c.root + off;
}
// The chord's notes, each in the octave from G3 (below the melody, above the bass).
export const voicing = (c) => c.tones.map((t) => 55 + ((c.root + t - 55) % 12 + 12) % 12).sort((a, b) => a - b);

// The swell of the sea at time t (s): 0 in a trough, 1 on a crest; two trains of waves, the
// second a little longer, so no two crests are alike.
export function swell(t, period) {
  const a = Math.sin((2 * Math.PI * t) / period), b = Math.sin((2 * Math.PI * t) / (period * 1.37) + 1.1);
  return Math.min(1, Math.max(0, 0.5 + 0.35 * a + 0.15 * b));
}

// ---- the sounds -------------------------------------------------------------------------------------
// Every hit is a few Web Audio nodes, scheduled at its time, gone when it ends: the analogue drum
// machines' recipes (a falling sine for a kick, filtered noise for a snare's wires and the hi-hats,
// two square waves for the cowbell) and the pulse tube's: the rotary valve's thunk, the helium's
// hiss into the cold head and its sigh out.
function voices(ctx, out) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (t, peak, attack, decay) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 4);
    return g;
  };
  const end = (t, decay) => t + decay * 1.5 + 0.05;
  const hiss = (t, v, { type = 'bandpass', f = 1000, f2 = null, q = 1, attack = 0.001, decay = 0.1, gain = 0.5 }) => {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + attack + decay);
    const g = env(t, gain * v, attack, decay);
    src.connect(flt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(end(t, attack + decay));
  };
  const tone = (t, v, { type = 'sine', f, f2 = null, sweep = 0.05, attack = 0.001, decay = 0.2, gain = 0.5, filter = null }) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + sweep);
    const g = env(t, gain * v, attack, decay);
    if (filter) { const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = filter; flt.Q.value = 3; o.connect(flt).connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(end(t, attack + decay));
  };
  return {
    kick: (t, v) => { tone(t, v, { f: 150, f2: 45, sweep: 0.08, decay: 0.35, gain: 0.9 }); hiss(t, v, { type: 'highpass', f: 3000, decay: 0.008, gain: 0.15 }); },
    snare: (t, v) => { tone(t, v, { type: 'triangle', f: 185, f2: 160, decay: 0.09, gain: 0.35 }); hiss(t, v, { type: 'highpass', f: 1500, decay: 0.18, gain: 0.45 }); },
    rim: (t, v) => tone(t, v, { type: 'square', f: 1700, decay: 0.03, gain: 0.18, filter: 1700 }),
    clap: (t, v) => { for (const d of [0, 0.011, 0.022]) hiss(t + d, v, { f: 1100, q: 1.5, decay: 0.012, gain: 0.5 }); hiss(t + 0.03, v, { f: 1100, q: 1.5, decay: 0.15, gain: 0.4 }); },
    hat: (t, v) => hiss(t, v, { type: 'highpass', f: 7500, decay: 0.045, gain: 0.3 }),
    ohat: (t, v) => hiss(t, v, { type: 'highpass', f: 7000, decay: 0.3, gain: 0.25 }),
    ride: (t, v) => { hiss(t, v, { type: 'highpass', f: 5000, decay: 0.5, gain: 0.12 }); tone(t, v, { type: 'square', f: 3150, decay: 0.4, gain: 0.03, filter: 3150 }); },
    cow: (t, v) => { tone(t, v, { type: 'square', f: 540, decay: 0.22, gain: 0.12, filter: 800 }); tone(t, v, { type: 'square', f: 800, decay: 0.22, gain: 0.12, filter: 800 }); },
    tamb: (t, v) => {
      // the tamburello: its jingles shaken, and its skin struck on the accents
      for (const d of [0, 0.007, 0.016]) hiss(t + d, v, { f: 8500, q: 4, decay: 0.05, gain: 0.45 });
      if (v > 0.9) tone(t, v, { f: 180, f2: 120, decay: 0.12, gain: 0.35 });
    },
    shaker: (t, v) => hiss(t, v, { f: 6000, q: 1.2, attack: 0.012, decay: 0.05, gain: 0.25 }),
    conga: (t, v) => tone(t, v, { f: 360, f2: 330, decay: 0.18, gain: 0.45 }),
    congaLo: (t, v) => tone(t, v, { f: 120, f2: 95, sweep: 0.06, decay: 0.3, gain: 0.7 }),
    tomHi: (t, v) => tone(t, v, { f: 240, f2: 160, sweep: 0.15, decay: 0.28, gain: 0.55 }),
    tomLo: (t, v) => tone(t, v, { f: 150, f2: 95, sweep: 0.18, decay: 0.35, gain: 0.6 }),
    // the pulse tube: the valve turning to high pressure, the cold head's displacer knocked
    thunk: (t, v) => { tone(t, v, { f: 70, f2: 48, sweep: 0.06, decay: 0.22, gain: 0.8 }); hiss(t, v, { type: 'lowpass', f: 900, decay: 0.03, gain: 0.25 }); },
    // the helium rushing in, the pressure rising to ~2 MPa
    inhale: (t, v) => hiss(t, v, { f: 700, f2: 2600, q: 1.2, attack: 0.12, decay: 0.16, gain: 0.35 }),
    // and out to the compressor's low side, a softer, darker sigh
    exhale: (t, v) => hiss(t, v, { type: 'lowpass', f: 1400, f2: 300, attack: 0.03, decay: 0.32, gain: 0.4 }),
    // the rotary valve's motor ticking round
    valve: (t, v) => tone(t, v, { type: 'square', f: 3200, decay: 0.006, gain: 0.07, filter: 3200 }),
    // the bass: a sawtooth through a resonant low-pass that closes, the home keyboards' synth bass
    bass: (t, key, dur, v) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 440 * 2 ** ((key - 69) / 12);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 5;
      flt.frequency.setValueAtTime(1400, t); flt.frequency.setTargetAtTime(280, t, 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.006);
      g.gain.setTargetAtTime(0.2 * v, t + 0.006, 0.12); g.gain.setTargetAtTime(0, t + dur, 0.025);
      o.connect(flt).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.2);
    },
    // the chords: square waves, a little detuned, through a low-pass: stabs or held
    chord: (t, keys, dur, v) => {
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2200; flt.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.055 * v, t + 0.008);
      g.gain.setTargetAtTime(0.035 * v, t + 0.008, 0.1); g.gain.setTargetAtTime(0, t + dur, 0.03);
      flt.connect(g).connect(out);
      for (const k of keys) for (const cents of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 440 * 2 ** ((k - 69) / 12); o.detune.value = cents;
        o.connect(flt); o.start(t); o.stop(t + dur + 0.25);
      }
    },
    // the sea: surf, its loudness and brightness following the swell
    surf: () => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 500; flt.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(flt).connect(g).connect(out); src.start();
      return { flt, g, stop: (t) => { g.gain.setTargetAtTime(0, t, 0.4); src.stop(t + 3); } };
    },
  };
}

// ---- the panel ------------------------------------------------------------------------------------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function attachBacking(shell, { id, styles = ['pulsetube'], about = {}, split = 60 } = {}) {
  const list = [...styles, ...GENERIC.filter((s) => !styles.includes(s))];
  const STORE = `forte/${id}/backing/v1`;
  const DEF = { style: list[0], tempo: STYLES[list[0]].bpm, accomp: 'full', volume: 0.6, sea: 'moderate' };
  let S = { ...DEF };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && list.includes(s.style)) S = { ...S, ...s };
  } catch { /* corrupt or unavailable */ }
  S.tempo = Math.min(240, Math.max(30, +S.tempo || DEF.tempo));
  S.volume = Math.min(1, Math.max(0, Number.isFinite(+S.volume) ? +S.volume : DEF.volume));
  if (!['full', 'drums'].includes(S.accomp)) S.accomp = 'full';
  if (!SEA.some((x) => x.id === S.sea)) S.sea = DEF.sea;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* storage unavailable */ } };
  const style = () => STYLES[S.style];
  const describe = (sid) => about[sid] ?? ABOUT[sid] ?? '';

  // the group, built as shell.js builds the instrument's (shared/layout.js gives it its toggle and ⓘs)
  const det = el('details', 'group backing'); det.open = true;
  det.append(el('summary', '', 'PI Requests'));

  const styleWrap = el('div', 'param');
  const styleSel = el('select'); styleSel.id = 'backing-style';
  const styleLab = el('label', '', 'Rhythm'); styleLab.htmlFor = styleSel.id;
  for (const sid of list) styleSel.add(new Option(STYLES[sid].name, sid));
  const styleHint = el('div', 'hint');
  styleWrap.append(styleLab, styleSel, styleHint);

  const transport = el('div', 'param backing-transport');
  const startBtn = el('button', 'backing-start', 'Start'); startBtn.type = 'button'; startBtn.id = 'backing-start';
  const syncBtn = el('button', '', 'Synchro'); syncBtn.type = 'button'; syncBtn.id = 'backing-synchro';
  syncBtn.title = 'Synchro start: the rhythm starts with the next key you play';
  syncBtn.setAttribute('aria-pressed', 'false');
  const fillBtn = el('button', '', 'Fill in'); fillBtn.type = 'button'; fillBtn.id = 'backing-fill';
  fillBtn.title = 'A drum fill at the end of this bar';
  const led = el('span', 'backing-led'); led.setAttribute('aria-hidden', 'true');
  const chordRead = el('span', 'backing-chord'); chordRead.setAttribute('aria-live', 'polite');
  transport.append(startBtn, syncBtn, fillBtn, led, chordRead);

  const slider = (sid, label, hint) => {
    const wrap = el('div', 'param');
    const row = el('div', 'row'), lab = el('label', '', label), val = el('span', 'val');
    const input = el('input'); input.type = 'range'; input.id = sid;
    lab.htmlFor = sid; row.append(lab, val); wrap.append(row, input);
    if (hint) wrap.append(el('div', 'hint', hint));
    return { wrap, input, val };
  };
  const tempo = slider('backing-tempo', 'Tempo', 'Beats a minute (in 6/8 and 12/8, dotted quarters). Each rhythm starts at its own: the pulse tube\'s is 84, its cooler\'s 1.4 cycles a second. Double-click to go back to the rhythm\'s.');
  tempo.input.min = 30; tempo.input.max = 240; tempo.input.step = 1;

  const accWrap = el('div', 'param');
  const accSel = el('select'); accSel.id = 'backing-accomp';
  const accLab = el('label', '', 'Accompaniment'); accLab.htmlFor = accSel.id;
  accSel.add(new Option('Drums, bass and chords', 'full'));
  accSel.add(new Option('Drums only', 'drums'));
  accWrap.append(accLab, accSel, el('div', 'hint', `The bass and the chords follow the chord your left hand holds below middle C: one key plays its major chord, two or more the chord they spell (minor, seventh, …). It stays when you let go, as on a 1980s home keyboard, until you play another; until the first, only the drums play.`));

  const seaWrap = el('div', 'param');
  const seaSel = el('select'); seaSel.id = 'backing-sea';
  const seaLab = el('label', '', 'Sea state'); seaLab.htmlFor = seaSel.id;
  for (const s of SEA) seaSel.add(new Option(s.name, s.id));
  seaWrap.append(seaLab, seaSel, el('div', 'hint', 'How high the waves run, on the Douglas scale, and so how long the swell is: from 3 s when calm to 10 s in a storm (sea waves run at 0.1–0.4 Hz). The higher they are, the more the rhythm rises and falls with them; from Rough on, every big crest brings a fill.'));

  const vol = slider('backing-volume', 'Backing volume');
  vol.input.min = 0; vol.input.max = 1000; vol.input.step = 1;

  det.append(styleWrap, transport, tempo.wrap, accWrap, seaWrap, vol.wrap);
  document.querySelector('#groups')?.appendChild(det);

  const dB = (v) => (v <= 0.001 ? 'off' : `${(20 * Math.log10(v / 0.6)).toFixed(1)} dB`);
  function show() {
    const s = style();
    styleSel.value = S.style; styleHint.textContent = describe(S.style);
    tempo.input.value = S.tempo;
    tempo.val.textContent = S.style === 'pulsetube' ? `${S.tempo} BPM · ${(S.tempo / 60).toFixed(2)} Hz` : `${S.tempo} BPM`;
    tempo.input.setAttribute('aria-valuetext', tempo.val.textContent);
    accSel.value = S.accomp; seaSel.value = S.sea; seaWrap.hidden = !s.sea;
    vol.input.value = Math.round(S.volume * 1000); vol.val.textContent = dB(S.volume);
    vol.input.setAttribute('aria-valuetext', vol.val.textContent);
    startBtn.textContent = running ? 'Stop' : armed ? 'Waiting for a key…' : 'Start';
    startBtn.classList.toggle('running', running);
    startBtn.title = running ? 'Stop the rhythm' : 'Start the rhythm';
    syncBtn.setAttribute('aria-pressed', String(armed));
    chordRead.textContent = S.accomp === 'full' && chord ? chordName(chord) : '';
  }
  const blur = (e) => e.currentTarget.blur(); // the keys go back to the instrument
  styleSel.addEventListener('change', (e) => { S.style = styleSel.value; S.tempo = style().bpm; step %= lengthOf(style()); fill = false; save(); show(); blur(e); });
  tempo.input.addEventListener('input', () => { S.tempo = +tempo.input.value; save(); show(); });
  tempo.input.addEventListener('change', blur);
  tempo.input.addEventListener('dblclick', () => { S.tempo = style().bpm; save(); show(); });
  accSel.addEventListener('change', (e) => { S.accomp = accSel.value; save(); show(); blur(e); });
  seaSel.addEventListener('change', (e) => { S.sea = seaSel.value; save(); show(); blur(e); });
  vol.input.addEventListener('input', () => { S.volume = +vol.input.value / 1000; save(); show(); if (bus) bus.gain.setTargetAtTime(S.volume, bus.context.currentTime, 0.02); });
  vol.input.addEventListener('change', blur);
  vol.input.addEventListener('dblclick', () => { S.volume = DEF.volume; save(); show(); if (bus) bus.gain.setTargetAtTime(S.volume, bus.context.currentTime, 0.02); });
  startBtn.addEventListener('click', (e) => { if (running || armed) stop(); else start(); blur(e); });
  syncBtn.addEventListener('click', (e) => { if (running) { stop(); armed = true; } else armed = !armed; show(); blur(e); });
  fillBtn.addEventListener('click', (e) => { if (running) fill = true; else start(); blur(e); });

  // ---- the sequencer: a look-ahead clock that schedules each step on the audio clock --------------
  let running = false, armed = false, fill = false, inFill = false, chord = null;
  let bus = null, kit = null, surf = null, timer = 0, step = 0, nextT = 0, t0 = 0;
  async function start() {
    if (running) return;
    armed = false;
    let audio;
    try { audio = await shell.startAudio(); } catch { show(); return; }
    if (!bus) {
      bus = audio.ctx.createGain(); bus.gain.value = S.volume;
      bus.connect(audio.chain?.limiter ?? audio.master);
      kit = voices(audio.ctx, bus);
    }
    running = true; step = 0; fill = false; inFill = false;
    nextT = t0 = audio.ctx.currentTime + 0.06;
    timer = setInterval(tick, 25);
    tick(); show();
  }
  function stop() {
    armed = false;
    if (running) {
      running = false; clearInterval(timer);
      surf?.stop(bus.context.currentTime); surf = null;
    }
    chord = null; show();
  }
  function tick() {
    const ctx = bus.context, ahead = document.hidden ? 1.5 : 0.12; // a hidden page's timers run once a second
    if (nextT < ctx.currentTime - 0.2) nextT = ctx.currentTime + 0.02; // the clock was held up: catch up
    while (nextT < ctx.currentTime + ahead) {
      play(step, nextT);
      nextT += stepLength(style(), S.tempo, step);
      step = (step + 1) % lengthOf(style());
    }
  }
  function play(i, t) {
    const s = style(), inBar = i % s.bar, sea = s.sea ? SEA.find((x) => x.id === S.sea) : null;
    // the sea: each step louder on a crest, the surf rising and brightening with it
    let lift = 1;
    if (sea) {
      const w = swell(t - t0, sea.period), depth = Math.min(0.55, 0.1 + 0.09 * sea.height);
      lift = 1 - depth + depth * w;
      if (!surf) surf = kit.surf();
      surf.g.gain.linearRampToValueAtTime(0.04 + 0.05 * sea.height * (0.2 + 0.8 * w), t);
      surf.flt.frequency.linearRampToValueAtTime(300 + 250 * sea.height * w, t);
      if (inBar === 0 && sea.height >= 3 && w > 0.85) fill = true; // a big crest breaks: a fill
    } else if (surf) { surf.stop(t); surf = null; }
    if (inBar === 0) { inFill = fill; fill = false; }
    const from = fillFrom(s), filling = inFill && inBar >= from;
    const tracks = filling ? s.fill : s.drums;
    for (const [name, track] of Object.entries(tracks)) {
      const v = filling ? hitAt(track, inBar) : hitAt(track, i);
      if (v) kit[name]?.(t, v * lift);
    }
    if (inBar % s.beat === 0) beatLight(t, inBar === 0);
    // the bass and the chords, on the left hand's chord (read now, a moment ahead)
    if (S.accomp !== 'full') return;
    const left = shell.activeKeys().filter((k) => k < split), c = chordOf(left);
    if (c && (!chord || c.root !== chord.root || c.name !== chord.name)) { chord = c; queueMicrotask(show); }
    if (!chord) return;
    const n = lengthOf(s), gapTo = (track) => { let g = 1; while (g < n && track[(i + g) % track.length] === '.') g++; return g; };
    const stepSec = 60 / S.tempo / s.beat;
    const b = s.bass[i % s.bass.length];
    if (b && b !== '.') kit.bass(t, bassNote(chord, b), Math.min(gapTo(s.bass) * stepSec * 0.85, 1.2), lift);
    const k = s.chords[i % s.chords.length];
    if (k && k !== '.') kit.chord(t, voicing(chord), k === 'L' ? gapTo(s.chords) * stepSec * 0.95 : Math.min(0.16, gapTo(s.chords) * stepSec * 0.6), lift);
  }
  // the tempo lamp: a flash on each beat, a brighter one on the bar's first
  function beatLight(t, downbeat) {
    const ms = Math.max(0, (t - bus.context.currentTime) * 1000);
    setTimeout(() => {
      if (!running) return;
      led.classList.add(downbeat ? 'down' : 'on');
      setTimeout(() => led.classList.remove('on', 'down'), 90);
    }, ms);
  }

  show();
  return {
    noteOn() { if (armed) start(); },
    stop,
    get running() { return running; },
  };
}
