// Render Timpani and Tabla demos, each isolating one physical effect, to examples/drums/*.wav
// Usage: node tools/render-drums.mjs        (then node tools/encode-examples.mjs drums)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../drums/src/drums-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const DrumEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'drums';
const P = (o = {}) => ({ ...DEFAULTS, ...o });
const preset = (name, o = {}) => P({ ...PRESETS.find((p) => p.name.startsWith(name)).p, ...o });
const play = (p, seconds, events) => { const e = new DrumEngine(FS); e.setParams(p); return renderEngine(e, seconds, events, FS); };
const hit = (t, k, vel = 0.6) => [[t, 'on', k, vel]];
const msg = (t, type, value, key = -1) => [t, 'msg', { type, value, key }];
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
const mix = (...parts) => { const n = Math.max(...parts.map((p) => p[0].length)); return [0, 1].map((c) => { const o = new Float64Array(n); for (const p of parts) p[c].forEach((v, i) => { o[i] += v; }); return o; }); };

// Timpani: tonic and dominant (D3, A2), a roll on the A that swells, and the pedal gliding it up to
// the D (a pedal range of 5 semitones, the wheel from 0 to full).
function timpani() {
  const ev = [], q = 0.42;
  [[50, 0, 0.7], [45, 1, 0.55], [45, 1.5, 0.55], [50, 2, 0.75], [45, 3, 0.6], [50, 4, 0.85]].forEach(([k, b, v]) => ev.push(...hit(0.15 + b * q, k, v)));
  const r0 = 0.15 + 6 * q;
  for (let i = 0; i < 28; i++) ev.push(...hit(r0 + i * 0.075, 45, 0.2 + 0.6 * (i / 27) ** 1.5));
  const g0 = r0 + 28 * 0.075 + 0.25;
  ev.push(...hit(g0, 45, 0.9));
  for (let i = 0; i <= 40; i++) ev.push(msg(g0 + 0.35 + i * 0.03, 'bend', i / 40));
  return play(P({ pedal: 5 }), g0 + 4.5, ev);
}

// A cycle of teentaal (sixteen beats: dha dhin dhin dha, dha dhin dhin dha, dha tin tin ta, ta dhin
// dhin dha), twice, on two drums: the dayan plays Na (dha, ta) and Tin (dhin, tin) with the ring
// finger on its syahi's edge; the bayan's Ge joins it on every beat but the four in the middle of
// the third, the khali, and on the last beats its player leans in for the swoop. One instance of
// the instrument for each drum, as two would be in a DAW.
function teentaal() {
  const bols = 'dha dhin dhin dha dha dhin dhin dha dha tin tin ta ta dhin dhin dha'.split(' ');
  const beat = 0.3, na = preset('Dayan: Na'), tin = preset('Dayan: Tin'), dayan = [], bayan = [];
  for (let c = 0; c < 2; c++) bols.forEach((b, i) => {
    const t = 0.15 + (16 * c + i) * beat, soft = i % 4 === 0 ? 0 : 0.1;
    dayan.push([t - 0.002, 'params', /^(dha|ta)$/.test(b) ? na : tin], ...hit(t, 61, 0.7 - soft));
    if (b.startsWith('dh')) {
      bayan.push(...hit(t, 48, 0.55 - soft));
      if (c === 1 && i >= 13) { bayan.push(msg(t + 0.04, 'pressure', 0.8, 48), msg(t + beat - 0.02, 'pressure', 0, 48)); }
    }
  });
  const end = 0.15 + 32 * beat;
  dayan.push(...hit(end, 61, 0.8));
  bayan.push(...hit(end, 48, 0.7), msg(end + 0.08, 'pressure', 1, 48), msg(end + 1.4, 'pressure', 0, 48));
  return mix(play(na, end + 2.4, dayan), play(preset('Bayan: Ge'), end + 2.4, bayan));
}

const phrase = (keys = [50, 45, 50]) => keys.flatMap((k, i) => hit(0.15 + i * 0.9, k, 0.7));

const demos = [
  ['01-timpani-with-a-roll-and-a-pedal-glide', timpani],
  ['02-a-cycle-of-teentaal-on-dayan-and-bayan', teentaal],
  // the air rides on the head and pulls its overtones to a fifth and an octave; without it, the
  // bare Bessel ratios clang, and ring on, since the air was also carrying their energy away
  ['03-timpani-in-air-then-in-a-vacuum', () => cat(play(P(), 3.6, phrase()), play(P({ air: 0 }), 4.4, phrase()))],
  // a quarter of the way in from the rim the note; at the centre, only the round modes: the thud
  ['04-struck-near-the-rim-then-at-the-centre', () => cat(play(P(), 3.2, phrase([50, 50])), play(P({ strike: 0 }), 2.8, phrase([50, 50])))],
  ['05-felt-mallets-then-wooden', () => cat(play(P(), 3.6, phrase([45, 50, 57])), play(P({ beater: 3 }), 4, phrase([45, 50, 57])))],
  // Raman's drum: the syahi's weight puts the overtones on the harmonics; without it they scatter
  ['06-dayan-with-its-syahi-then-without', () => {
    const tun = (o) => play(preset('Dayan: Tun', o), 3, [61, 61, 66, 61].flatMap((k, i) => hit(0.15 + i * 0.6, k, 0.65)));
    return cat(tun({}), tun({ syahi: 0 }));
  }],
  // the heel presses into the bayan's head as it rings: its tension rises, and the pitch with it
  ['07-bayan-ge-pressed-for-the-swoop', () => {
    const ev = [];
    [0.15, 1.65, 3.15].forEach((t, i) => {
      ev.push(...hit(t, 48, 0.75));
      for (let j = 0; j <= 20; j++) ev.push(msg(t + 0.1 + j * 0.03, 'pressure', (i === 2 ? 1 - j / 20 : j / 20) * (i ? 1 : 0.6), 48));
      ev.push(msg(t + 1.4, 'pressure', 0, 48));
    });
    return play(preset('Bayan: Ge'), 5.2, ev);
  }],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.25, FS), FS);
