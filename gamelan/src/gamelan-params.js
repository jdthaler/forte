// gamelan-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const s = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`;
const BARS = ['gangsa', 'saron', 'ensemble'], GONGS = ['bonang', 'gong', 'ensemble'];

export const GROUPS = [
  {
    title: 'Gamelan',
    params: [
      { id: 'instrument', label: 'Instrument', type: 'select', def: 'gangsa',
        options: [
          ['gangsa', 'Gangsa: bronze bars over bamboo tubes'],
          ['saron', 'Saron: thick bars on a wooden trough'],
          ['bonang', 'Bonang: kettle gongs on cords'],
          ['gong', 'Gong ageng and kempul: hanging gongs'],
          ['ensemble', 'The whole gamelan, by register'],
        ],
        hint: 'Which instrument the keys play. The whole gamelan gives each octave its own, as the ensemble does: the great gong and the kempul at the bottom, then the slenthem, demung, saron and peking, an octave apart.' },
      { id: 'laras', label: 'Tuning (laras)', type: 'select', def: 'gamelan',
        options: [['gamelan', 'Pélog on the white keys, sléndro on the black'], ['keyboard', 'The keyboard’s twelve notes']],
        hint: 'A gamelan has two sets of instruments in two scales: pélog, seven unequal steps an octave, and sléndro, five nearly equal ones. Here pélog’s seven are the white keys (1 on C) and sléndro’s five the black, the two sharing a tone (pélog 6 = sléndro 6, on A and G♯). Neither fits twelve equal notes.' },
      { id: 'ombak', label: 'Paired tuning (ombak)', perform: true, min: 0, max: 15, def: 5, step: 0.1, fmt: (v) => (v === 0 ? 'off: one instrument' : `${v.toFixed(1)} Hz beats`),
        hint: 'In Bali every metallophone and kettle-gong row comes in a pair, one tuned a little low and its partner a little high, so each note beats: the shimmer, ombak (“wave”). The beat is the same number of hertz all the way up, so low notes’ partners lie many cents apart and high notes’ only a few. Off: one instrument, as in Java. The mod wheel sets it.' },
    ],
  },
  {
    title: 'Bars',
    empty: 'Choose a gangsa, a saron or the whole gamelan to see the bars.',
    params: [
      { id: 'thick', label: 'Bar thickness (× the smith’s)', min: 0.25, max: 3, def: 1, log: true, step: 0.01, fmt: (v) => `${v.toFixed(2)} ×`, showIf: (P) => BARS.includes(P.instrument),
        hint: 'How thick the bronze is (a gangsa’s 7 mm, a saron’s 12 mm); each bar is then cut to the length that gives its note. A thick, short bar is no longer a thin beam: shear and the turning of its slices lower its overtones, and the second partial falls from 2.76 times the note towards 2.5.' },
      { id: 'along', label: 'Strike point (centre → end)', perform: true, min: 0, max: 0.9, def: 0.12, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-length`, showIf: (P) => BARS.includes(P.instrument),
        hint: 'Where the mallet lands along the bar. At the centre the second bending mode (2.76) has a node and stays silent, and the note is pure; towards the end every mode speaks.' },
      { id: 'across', label: 'Off the long axis', min: 0, max: 0.9, def: 0.15, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} % of the half-width`, showIf: (P) => BARS.includes(P.instrument),
        hint: 'Struck to one side of the bar’s centre line, it twists: its torsional modes, which have nothing to do with the note, ring along (on the centre line they are silent).' },
      { id: 'tubes', label: 'Tube resonators', min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)} %`), showIf: (P) => P.instrument === 'gangsa' || P.instrument === 'ensemble',
        hint: 'How much air the bamboo tube under each bar moves, closed at the bottom and a quarter-wave long at the bar’s note. A bar alone radiates its fundamental badly (air slips round its edges); the tube takes it up, louder and shorter. Off: the bar alone, as a saron.' },
      { id: 'tubeTune', label: 'Tube tuning', min: -300, max: 300, def: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)} ¢ off the note`, showIf: (P) => (P.instrument === 'gangsa' || P.instrument === 'ensemble') && P.tubes > 0,
        hint: 'A tube cut too long or too short. Off the note, it takes less of the bar’s energy and the two ring apart, beating.' },
    ],
  },
  {
    title: 'Gongs',
    empty: 'Choose a bonang, the gongs or the whole gamelan to see the gongs.',
    params: [
      { id: 'gongStrike', label: 'Strike point (boss → face)', perform: true, min: 0, max: 1, def: 0.1, step: 0.01, fmt: (v) => (v === 0 ? 'on the boss' : `${(v * 100).toFixed(0)} % of the way out`), showIf: (P) => GONGS.includes(P.instrument),
        hint: 'A gong is struck on its boss, the knob at the centre: there only the round (axisymmetric) modes move, the note among them. Out on the face, the modes with nodal diameters come in, in split pairs, and the gong clangs.' },
      { id: 'gongBeat', label: 'The gong’s own ombak (2f₁ − f₂)', min: 0, max: 8, def: 2.25, step: 0.05, fmt: (v) => `${v.toFixed(2)} Hz on a 61.75 Hz gong`, showIf: (P) => P.instrument === 'gong' || P.instrument === 'ensemble',
        hint: 'How far the smith leaves the gong’s second round mode below twice its note (2.25 Hz on the Balinese gong measured by Krueger and colleagues, 61.75 and 121.25 Hz). The face’s curvature makes the note’s second harmonic, which beats against that mode: the great gong’s slow throb. Higher gongs, the same shape, beat faster in proportion.' },
      { id: 'curvature', label: 'Face curvature (nonlinearity)', min: 0, max: 3, def: 1, step: 0.01, fmt: (v) => (v === 0 ? 'flat: linear' : `${v.toFixed(2)} ×`), showIf: (P) => GONGS.includes(P.instrument),
        hint: 'A curved face pushes back harder one way than the other: struck hard, the note makes its own second harmonic (a quadratic nonlinearity), and the gong blooms. Flat: a linear gong, the same colour at every strength, and no beat from the harmonic.' },
    ],
  },
  {
    title: 'Mallets',
    params: [
      { id: 'mallet', label: 'Mallet softness (× the instrument’s)', min: 0.25, max: 4, def: 1, log: true, step: 0.01, fmt: (v) => `${v.toFixed(2)} ×`,
        hint: 'How long the mallet stays on: a gangsa’s and saron’s hard wooden mallets 0.3 ms at C4, a bonang’s cord-wound sticks 1 ms, a gong’s padded beater 2.5 ms (longer on lower notes, a bigger gong’s beater bigger, and on softer strokes). The longer the contact, the fewer overtones it reaches.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Damping',
    params: [
      { id: 'damping', label: 'Damping hand', perform: true, type: 'select', def: 'next',
        options: [['next', 'Each stroke stops the last note'], ['release', 'Letting go of a key stops it'], ['ring', 'Nothing stops a note']],
        hint: 'A metallophone rings for seconds, so its player stops each bar with the other hand as the next is struck (a chord, struck together, rings on). Space or the pedal lifts the hand. Gongs are left to ring.' },
      { id: 't60', label: 'Ring time at C4', min: 0.5, max: 20, def: 6, log: true, fmt: s,
        hint: 'How long C4’s note takes to fall 60 dB, in bronze. Lower notes ring longer (as 1/√f); a bonang’s kettles ring shorter, a gong’s longer.' },
      { id: 'rolloff', label: 'Damping vs frequency', min: 0, max: 2, def: 1, step: 0.01, fmt: (v) => `σ ∝ f^${v.toFixed(2)}`,
        hint: 'How much faster the overtones die than the note: most of a gamelan’s overtones are gone within a second, leaving the note to hum.' },
      { id: 'hand', label: 'Hand damping', min: 0.03, max: 1, def: 0.12, log: true, fmt: (v) => `T₆₀ ${s(v)}`,
        hint: 'How fast a hand on the bar or a stick on the gong stops it.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Gangsa pair: the shimmer', p: {} },
  { name: 'Javanese saron (no pairs)', p: { instrument: 'saron', ombak: 0 } },
  { name: 'The whole gamelan, by register', p: { instrument: 'ensemble', ombak: 0 } },
  { name: 'Bonang: kettle gongs on cords', p: { instrument: 'bonang', ombak: 0, damping: 'ring' } },
  { name: 'Paired bonang (reyong)', p: { instrument: 'bonang', damping: 'ring' } },
  { name: 'Gong ageng: its own slow beat', p: { instrument: 'gong', damping: 'ring' } },
  { name: 'A flat gong: no curvature, no beat', p: { instrument: 'gong', damping: 'ring', curvature: 0 } },
  { name: 'Fast shimmer (8 Hz)', p: { ombak: 8 } },
  { name: 'Slow shimmer (2 Hz)', p: { ombak: 2 } },
  { name: 'Struck at the centre: no 2.76', p: { along: 0, across: 0 } },
  { name: 'Struck off the axis: the bar twists', p: { across: 0.8, along: 0.4 } },
  { name: 'Thick bars: overtones flatten', p: { thick: 2.5 } },
  { name: 'Bars without tubes', p: { tubes: 0 } },
  { name: 'Let every note ring', p: { damping: 'ring' } },
  { name: 'Twelve notes (the keyboard’s tuning)', p: { laras: 'keyboard' } },
];
