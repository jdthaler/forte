// make-songs.mjs — write Forte's own songs, the ones ♪ Songs offers on every page
// (shared/songs.js), as Standard MIDI Files: songs/<file>.mid and songs/index.json.
// Usage: node tools/make-songs.mjs
//
// Every piece is in the public domain; the arrangements (the left hands and the hymn's inner
// voices) are Forte's own and as plain as the tunes. Each is written here in beats (a quarter
// note is 1) as voices of tokens: a note name and how many beats it lasts ('E5:1.5'), notes
// joined by '+' for a chord ('C3+E3+G3:3'), and 'r' for a rest ('r:1').

import { writeFileSync, mkdirSync } from 'node:fs';
import { writeMIDI } from '../shared/midifile.js';
import { midi } from '../shared/tour.js';

const OUT = new URL('../songs/', import.meta.url);
const DIV = 480;

// a voice: its notes [{ at, dur, key, vel }] from tokens, from beat `at`, with a velocity
// (0..1) that leans on each bar's first beat
function voice(tokens, { at = 0, vel = 0.6, bar = 4, legato = 0.96 } = {}) {
  const out = [];
  let t = at;
  for (const tok of tokens.trim().split(/\s+/)) {
    const [what, d] = tok.split(':');
    const dur = +d;
    if (!(dur > 0)) throw new Error(`no length: ${tok}`);
    if (what !== 'r') {
      const accent = Math.abs(t / bar - Math.round(t / bar)) < 1e-6 ? 1.08 : 1;
      for (const n of what.split('+')) out.push({ at: t, dur: dur * legato, key: midi(n), vel: Math.min(1, vel * accent) });
    }
    t += dur;
  }
  return out;
}
const repeat = (s, n) => Array(n).fill(s).join(' ');

// ---- the pieces --------------------------------------------------------------------------------

// J. S. Bach, The Well-Tempered Clavier I, Prelude in C major, BWV 846 (1722). Each bar is a
// chord of five notes broken the same way twice: the lowest held for the half bar, the next held
// from the second sixteenth, the top three in sixteenths. The last three bars as Bach wrote them.
function prelude() {
  const bars = `C4 E4 G4 C5 E5 | C4 D4 A4 D5 F5 | B3 D4 G4 D5 F5 | C4 E4 G4 C5 E5 | C4 E4 A4 E5 A5 |
    C4 D4 F#4 A4 D5 | B3 D4 G4 D5 G5 | B3 C4 E4 G4 C5 | A3 C4 E4 G4 C5 | D3 A3 D4 F#4 C5 |
    G3 B3 D4 G4 B4 | G3 Bb3 E4 G4 C#5 | F3 A3 D4 A4 D5 | F3 Ab3 D4 F4 B4 | E3 G3 C4 G4 C5 |
    E3 F3 A3 C4 F4 | D3 F3 A3 C4 F4 | G2 D3 G3 B3 F4 | C3 E3 G3 C4 E4 | C3 G3 Bb3 C4 E4 |
    F2 F3 A3 C4 E4 | F#2 C3 A3 C4 Eb4 | Ab2 F3 B3 C4 D4 | G2 F3 G3 B3 D4 | G2 E3 G3 C4 E4 |
    G2 D3 G3 C4 F4 | G2 D3 G3 B3 F4 | G2 Eb3 A3 C4 F#4 | G2 E3 G3 C4 G4 | G2 D3 G3 C4 F4 |
    G2 D3 G3 B3 F4 | C2 C3 G3 Bb3 E4`.split('|').map((b) => b.trim().split(/\s+/).map(midi));
  const notes = [];
  const n = (at, dur, key, vel) => notes.push({ at, dur, key, vel });
  bars.forEach((c, i) => {
    for (const h of [0, 2]) {
      const at = 4 * i + h, swell = 0.5 + 0.08 * Math.sin((Math.PI * i) / 8);
      n(at, 2, c[0], swell + 0.05);
      n(at + 0.25, 1.75, c[1], swell);
      [2, 3, 4, 2, 3, 4].forEach((k, j) => n(at + 0.5 + 0.25 * j, 0.25, c[k], swell - 0.04 + (j % 3 === 0 ? 0.05 : 0)));
    }
  });
  // bars 33 and 34: the bass held under one figure that runs the whole bar; then the last chord
  const run = (at, held, tune) => {
    for (const [i, k] of held.entries()) n(at + 0.25 * i, 4 - 0.25 * i, midi(k), 0.55);
    tune.split(' ').forEach((k, j) => n(at + 0.5 + 0.25 * j, 0.25, midi(k), 0.5 - 0.01 * j));
  };
  run(128, ['C2', 'C3'], 'F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3');
  run(132, ['C2', 'B2'], 'G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 E4 D4');
  for (const [i, k] of ['C2', 'C3', 'E4', 'G4', 'C5'].entries()) n(136 + 0.03 * i, 6, midi(k), 0.5);
  return { notes, tempos: [{ beat: 0, bpm: 72 }, { beat: 124, bpm: 66 }, { beat: 132, bpm: 58 }, { beat: 135, bpm: 50 }] };
}

// Ludwig van Beethoven, Bagatelle in A minor, WoO 59, "Für Elise" (1810): its opening, twice.
// In quarter-note beats: a bar of 3/8 is 1.5, a sixteenth 0.25.
function elise() {
  const v = (s, at, vel) => voice(s, { at, vel, bar: 1.5, legato: 1 });
  const turn = 'E5:.25 D#5:.25';
  // `end`: how long the last A rings, to the repeat's E–D♯ or to the end
  const a = (at, end) => [
    ...v(`${turn} E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25`, at, 0.5),
    // the right hand's answers over the left's broken chords
    ...v('A4:.75 C4:.25 E4:.25 A4:.25 B4:.75 E4:.25 G#4:.25 B4:.25 C5:.75 E4:.25 E5:.25 D#5:.25', at + 2, 0.48),
    ...v('E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.75 C4:.25 E4:.25 A4:.25', at + 6.5, 0.5),
    ...v(`B4:.75 E4:.25 C5:.25 B4:.25 A4:${end}`, at + 9.5, 0.48),
    ...v('A2:.25 E3:.25 A3:.75 r:.25 E2:.25 E3:.25 G#3:.75 r:.25 A2:.25 E3:.25 A3:.75 r:.25', at + 2, 0.38),
    ...v(`A2:.25 E3:.25 A3:.75 r:.25 E2:.25 E3:.25 G#3:.75 r:.25 A2:.25 E3:.25 A3:${end - 0.5}`, at + 8, 0.38),
  ];
  return { notes: [...a(0, 1), ...a(12, 3)], tempos: [{ beat: 0, bpm: 76 }, { beat: 21, bpm: 62 }] };
}

// Christian Petzold, Minuet in G major (the Anna Magdalena Bach notebook, 1725, BWV Anh. 114):
// its first half, played twice, over a plain bass.
function minuet() {
  const tune = `D5:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 G4:1 G4:1 E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 G5:1 G4:1 G4:1
    C5:1 D5:.5 C5:.5 B4:.5 A4:.5 B4:1 C5:.5 B4:.5 A4:.5 G4:.5 F#4:1 G4:.5 A4:.5 B4:.5 G4:.5 A4:3
    D5:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 G4:1 G4:1 E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 G5:1 G4:1 G4:1
    C5:1 D5:.5 C5:.5 B4:.5 A4:.5 B4:1 C5:.5 B4:.5 A4:.5 G4:.5 A4:1 B4:.5 A4:.5 G4:.5 F#4:.5`;
  const bass = `G3+B3+D4:2 A3:1 B3:3 C4:3 B3:3 A3:3 G3:3 D3:3 D3:1 E3:1 F#3:1
    G3+B3+D4:2 A3:1 B3:3 C4:3 B3:3 A3:3 G3:3 D3:3`;
  const once = (at, end) => [
    ...voice(`${tune} G4:${end}`, { at, vel: 0.56, bar: 3 }),
    ...voice(`${bass} G2+G3:${end}`, { at, vel: 0.42, bar: 3 }),
  ];
  return { notes: [...once(0, 3), ...once(48, 4)], tempos: [{ beat: 0, bpm: 132 }, { beat: 90, bpm: 112 }] };
}

// Greensleeves (English, 16th century), in A minor: a verse and the refrain, over a bass that
// strikes each bar's chord and two of its notes after.
function greensleeves() {
  const verse = 'C5:2 D5:1 E5:1.5 F5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:2 A4:1 A4:1.5 G#4:.5 A4:1 B4:2 G#4:1 E4:2 A4:1';
  const verse2 = 'C5:2 D5:1 E5:1.5 F5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:1.5 B4:.5 A4:1 G#4:1.5 F#4:.5 G#4:1 A4:6';
  const refrain = 'G5:3 G5:1.5 F#5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:2 A4:1 A4:1.5 G#4:.5 A4:1 B4:2 G#4:1 E4:3';
  const refrain2 = 'G5:3 G5:1.5 F#5:.5 E5:1 D5:2 B4:1 G4:1.5 A4:.5 B4:1 C5:1.5 B4:.5 A4:1 G#4:1.5 F#4:.5 G#4:1 A4:6';
  const tune = voice(`A4:1 ${verse} ${verse2} ${refrain} ${refrain2}`, { vel: 0.56, bar: 3, at: -1 });
  const CH = { Am: ['A2', 'C4', 'E4'], C: ['C3', 'E3+G3', 'C4'], G: ['G2', 'B3', 'D4'], Em: ['E2', 'G3', 'B3'], F: ['F2', 'A3', 'C4'], E: ['E2', 'G#3', 'B3'] };
  const chords = 'Am C G Em Am F E E Am C G Em Am E Am Am C C G Em Am F E E C C G Em Am E Am Am'.split(' ');
  const left = chords.map((c) => { const [b, x, y] = CH[c]; return `${b}:1 ${x}:1 ${y}:1`; }).join(' ');
  const lh = voice(left, { vel: 0.38, bar: 3, legato: 0.9 });
  lh.at(-1).dur = 3; lh.at(-2).dur = 4; lh.at(-3).dur = 5; // the last chord left to ring
  return { notes: [...tune, ...lh].map((n) => ({ ...n, at: n.at + 1 })), tempos: [{ beat: 0, bpm: 100 }, { beat: 91, bpm: 84 }] };
}

// Ludwig van Beethoven, the Ninth Symphony's "Ode to Joy" (1824), in D major, over a walking bass.
function ode() {
  const a = 'F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1';
  const tune = `${a} F#4:1.5 E4:.5 E4:2 ${a} E4:1.5 D4:.5 D4:2
    E4:1 E4:1 F#4:1 D4:1 E4:1 F#4:.5 G4:.5 F#4:1 D4:1 E4:1 F#4:.5 G4:.5 F#4:1 E4:1 D4:1 E4:1 A3:2
    ${a} E4:1.5 D4:.5 D4:2`;
  // a chord each half bar: the bass (the root, then the other note when the chord stays) and three above
  const CH = { D: ['D3', 'A2', 'F#3+A3+D4'], A: ['A2', 'E2', 'E3+A3+C#4'], A7: ['A2', 'C#3', 'E3+G3+C#4'] };
  const halves = `D D A7 A7 D D A A D D A7 A7 D D A D
    A D A D A D D A7 D D A7 A7 D D A D`.trim().split(/\s+/);
  const bass = halves.map((c, i) => CH[c][i % 2 && halves[i - 1] === c ? 1 : 0] + ':2').join(' ').replace(/D3:2$/, 'D2+D3:2');
  const mid = halves.map((c) => `${CH[c][2]}:2`).join(' ');
  const up = (n) => ({ ...n, key: n.key + 12 }); // the tune an octave up, above the chords
  return {
    notes: [...voice(tune, { vel: 0.6 }).map(up), ...voice(bass, { vel: 0.44 }), ...voice(mid, { vel: 0.34 })],
    tempos: [{ beat: 0, bpm: 112 }, { beat: 60, bpm: 96 }],
  };
}

// "Amazing Grace" (John Newton's hymn, 1779, to the tune New Britain, 1829), in G major, in four
// parts as a hymn is sung: slow, and every chord held.
function grace() {
  const tune = `D4:1 G4:2 B4:.5 G4:.5 B4:2 A4:1 G4:2 E4:1 D4:2 D4:1 G4:2 B4:.5 G4:.5 B4:2 A4:1 D5:3 D5:2 B4:1
    D5:2 B4:.5 D5:.5 B4:2 G4:1 D4:2 E4:.5 G4:.5 G4:2 E4:1 D4:2 D4:1 G4:2 B4:.5 G4:.5 B4:2 A4:1 G4:3`;
  // alto, tenor and bass, each bar one chord (the pickup over the first)
  const alto = `B3:1 D4:3 D4:3 E4:3 D4:3 D4:3 D4:3 F#4:3 F#4:2 G4:1
    G4:3 G4:3 B3:3 E4:3 B3:3 D4:3 F#4:3 D4:3`;
  const tenor = `G3:1 B3:3 B3:3 C4:3 B3:3 B3:3 B3:3 A3:3 C4:2 B3:1
    B3:3 D4:3 G3:3 C4:3 G3:3 B3:3 C4:3 B3:3`;
  const bass = `G2:1 G2:3 G2:3 C3:3 G2:3 G2:3 G2:3 D3:3 D3:2 G2:1
    G2:3 G2:3 G2:3 C3:3 G2:3 G2:3 D3:3 G2:3`;
  const o = { bar: 3, legato: 0.98 };
  const notes = [...voice(tune, { ...o, vel: 0.62 }), ...voice(alto, { ...o, vel: 0.45 }), ...voice(tenor, { ...o, vel: 0.42 }), ...voice(bass, { ...o, vel: 0.5 })];
  return { notes: notes.map((n) => ({ ...n, at: n.at + 2 })), tempos: [{ beat: 0, bpm: 76 }, { beat: 44, bpm: 64 }] };
}

export const SONGS = [
  { file: 'prelude-in-c.mid', title: 'Prelude in C major', by: 'J. S. Bach, BWV 846', make: prelude },
  { file: 'fur-elise.mid', title: 'Für Elise (the opening)', by: 'Beethoven, WoO 59', make: elise },
  { file: 'minuet-in-g.mid', title: 'Minuet in G major', by: 'Petzold, BWV Anh. 114', make: minuet },
  { file: 'greensleeves.mid', title: 'Greensleeves', by: 'English, 16th century', make: greensleeves },
  { file: 'ode-to-joy.mid', title: 'Ode to Joy', by: 'Beethoven, Symphony No. 9', make: ode },
  { file: 'amazing-grace.mid', title: 'Amazing Grace', by: 'New Britain, hymn tune', make: grace },
];

// a song's notes (in beats) and its tempos as a MIDI file: one track, channel 1
export function songFile(s) {
  const { notes, tempos } = s.make();
  const tick = (beat) => Math.round(beat * DIV);
  const v = (x) => Math.max(1, Math.min(127, Math.round(x * 127)));
  const events = notes.flatMap((n) => [
    { tick: tick(n.at), data: [0x90, n.key, v(n.vel)] },
    { tick: tick(n.at + n.dur), data: [0x80, n.key, 64] },
  ]);
  return writeMIDI({ name: s.title, division: DIV, tempos: tempos.map((t) => ({ tick: tick(t.beat), bpm: t.bpm })), tracks: [{ name: s.title, events }] });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  for (const s of SONGS) {
    const bytes = songFile(s);
    writeFileSync(new URL(s.file, OUT), bytes);
    console.log(`songs/${s.file}: ${bytes.length} bytes`);
  }
  writeFileSync(new URL('index.json', OUT), `${JSON.stringify(SONGS.map(({ file: f, title, by }) => ({ file: f, title, by })), null, 1)}\n`);
}
