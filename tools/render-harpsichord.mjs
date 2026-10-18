// Render harpsichord demos, each isolating one physical effect, to examples/harpsichord/*.wav
// Usage: node tools/render-harpsichord.mjs        (then node tools/encode-examples.mjs harpsichord)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS } from '../harpsichord/src/harpsichord-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const HarpsichordEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'harpsichord';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const play = (p, seconds, events) => { const e = new HarpsichordEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel = 0.7, len = 0.9 * dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));

// J. S. Bach, Prelude in C major, BWV 846, bars 1–4: each half bar holds its two lowest notes
// and repeats a broken chord above them.
function prelude(t0, s16) {
  const bars = [[60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76]];
  const ev = [];
  let t = t0;
  for (const [a, b, c, d, e] of bars) for (let half = 0; half < 2; half++) {
    ev.push([t, 'on', a, 0.72], [t + 8 * s16 - 0.02, 'off', a]);
    ev.push([t + s16, 'on', b, 0.68], [t + 8 * s16 - 0.02, 'off', b]);
    [c, d, e, c, d, e].forEach((k, i) => { const tt = t + (2 + i) * s16; ev.push([tt, 'on', k, i % 3 === 0 ? 0.72 : 0.66], [tt + 0.85 * s16, 'off', k]); });
    t += 8 * s16;
  }
  return ev;
}
const arp = [57, 60, 64, 69, 72, 69, 64, 60];

const demos = [
  // the instrument as it is usually heard: two 8′ choirs coupled
  ['01-bach-prelude-in-c-on-two-8-foot-choirs', () => play(P(), 9.4, prelude(0.05, 0.13))],
  // one phrase on the front 8′ (near the nut), the back 8′, the lute row (by the nut) and the back 8′ with the buff
  ['02-front-back-lute-then-buff', () => cat(
    play(P({ manual: 'upper' }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)),
    play(P({ coupler: false, front8: false }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)),
    play(P({ manual: 'upper', front8: false, lute: true }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)),
    play(P({ coupler: false, front8: false, buff: true }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)))],
  // the 4′ alone sounds an octave up; then 8′ 8′ 4′ together
  ['03-four-foot-alone-then-full', () => cat(
    play(P({ coupler: false, back8: false, front8: false, four: true }), 3.0, [[0.05, 'on', 48, 0.7], [0.05, 'on', 55, 0.7], [0.05, 'on', 64, 0.7], [0.05, 'on', 72, 0.7], [2.6, 'off', 48], [2.6, 'off', 55], [2.6, 'off', 64], [2.6, 'off', 72]]),
    play(P({ four: true }), 3.4, [[0.05, 'on', 48, 0.7], [0.05, 'on', 55, 0.7], [0.05, 'on', 64, 0.7], [0.05, 'on', 72, 0.7], [3.0, 'off', 48], [3.0, 'off', 55], [3.0, 'off', 64], [3.0, 'off', 72]]))],
  // c² on the back 8′, plucked 12, 30, 60, 120 and 178 mm (the middle) from the nut: the comb moves
  ['04-plucking-point-from-nut-to-middle', () => cat(...[12, 30, 60, 120, 178].map((x) => play(P({ coupler: false, front8: false, xBack: x }), 1.5, [[0.05, 'on', 72, 0.7], [1.3, 'off', 72]])))],
  // the same arpeggio with light Delrin, heavy Delrin and quill plectra
  ['05-light-heavy-and-quill-voicing', () => cat(
    play(P({ coupler: false, front8: false, stiff: 1000, overlap: 0.35 }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)),
    play(P({ coupler: false, front8: false, stiff: 4000, overlap: 0.9 }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)),
    play(P({ coupler: false, front8: false, material: 'quill' }), 2.0, notes(0.05, 0.2, arp, 0.7, 0.18)))],
  // touch: G3 pp, mf, ff (almost the same), then let up slowly and quickly (the release thump)
  ['06-touch-pp-ff-then-slow-and-quick-release', () => play(P({ coupler: false, front8: false }), 6.4, [
    [0.05, 'on', 55, 0.1], [0.75, 'off', 55], [0.9, 'on', 55, 0.5], [1.6, 'off', 55], [1.75, 'on', 55, 1], [2.45, 'off', 55],
    [2.8, 'on', 43, 0.7], [3.9, 'off', 43, 0],
    [4.6, 'on', 43, 0.7], [5.7, 'off', 43, 1]])],
  // a cadence in equal temperament, then in ¼-comma meantone at A = 415: the thirds stop beating
  ['07-equal-then-meantone-thirds', () => cat(...['equal', 'meantone'].map((tm) => play(P({ temperament: tm, pitch: 415 }), 4.0, [
    [0.05, 'on', 48, 0.7], [0.05, 'on', 60, 0.7], [0.05, 'on', 64, 0.7], [0.05, 'on', 67, 0.7], [1.8, 'off', 48], [1.8, 'off', 60], [1.8, 'off', 64], [1.8, 'off', 67],
    [1.9, 'on', 41, 0.7], [1.9, 'on', 57, 0.7], [1.9, 'on', 60, 0.7], [1.9, 'on', 65, 0.7], [3.7, 'off', 41], [3.7, 'off', 57], [3.7, 'off', 60], [3.7, 'off', 65]])))],
  // with the soundboard, then the bridge force alone: the board is most of the sound
  ['08-soundboard-then-bridge-force-alone', () => cat(
    play(P(), 2.6, notes(0.05, 0.25, [48, 52, 55, 60, 64, 67, 72], 0.7, 0.22)),
    play(P({ soundboard: false }), 2.6, notes(0.05, 0.25, [48, 52, 55, 60, 64, 67, 72], 0.7, 0.22)))],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), DEFAULTS.room, FS), FS);
