// hurdygurdy-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint
// says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

export const RANGE = [67, 91];  // the keys: the open chanterelles (G4) and the 24 tangents above, to G6
export const WHEEL_D = 0.15;    // m: the wheel's diameter (hurdygurdy-model.h)
// the coups a turn, as the select's keys (hurdygurdy-model.h COUPS)
export const COUPS = [['none', 'None', 0], ['one', '1', 1], ['two', '2', 2], ['three', '3', 3], ['four', '4', 4], ['six', '6', 6], ['eight', '8', 8]];

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const ms = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(2)} s`);
const speed = (v) => `${v.toFixed(2)} turns/s · ${(Math.PI * WHEEL_D * v * 100).toFixed(0)} cm/s`;

export const GROUPS = [
  {
    title: 'Crank',
    params: [
      { id: 'crank', label: 'Crank speed', perform: true, strip: true, min: 0.2, max: 4, def: 1.2, log: true, fmt: speed,
        hint: 'How fast the hand turns the crank: the rosined wheel (15 cm across) bows every string at π·D times this. Faster is louder and brighter, and past the tirant\'s threshold the chien starts to buzz. Too slow and the top notes crunch, since the force a string can take falls with the wheel\'s speed. MIDI mod wheel: rest = 1.2 turns/s, up to 4.' },
      { id: 'coups', label: 'Coups per turn', perform: true, type: 'select', def: 'none', options: COUPS.map(([k, name]) => [k, name]),
        hint: 'The coup de poignet: the wrist jerks the crank this many times a turn, each a quick surge of the wheel that lifts the chien for a burst of buzz. The rhythm of the buzz is the rhythm of the hand: two a turn for a bourrée, three for a mazurka; players manage eight or twelve.' },
      { id: 'coup', label: 'Coup strength', perform: true, min: 0, max: 1.5, def: 0.6, step: 0.01, fmt: (v) => `+${(v * 100).toFixed(0)} % speed`,
        hint: 'How much a coup speeds the wheel at its peak. The same surge comes from Space or the sustain pedal (held), from key pressure (aftertouch: as hard as you press), and from a key struck hard (once, at its start).' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'A key struck harder than about 0.55 gives the crank a coup as its tangent lands, the harder the bigger: a buzz on the note\'s start.' },
      { id: 'uneven', label: 'Hand unevenness', min: 0, max: 0.2, def: 0.03, step: 0.005, fmt: pct,
        hint: 'A hand turns the crank a little faster on the down stroke than on the way back up: the wheel\'s speed swings this much, once a turn.' },
      { id: 'start', label: 'Start-up', min: 0.02, max: 0.6, def: 0.15, log: true, fmt: ms,
        hint: 'How long the hand takes to get the wheel up to speed from rest when you start playing (and a third of it to stop the wheel when you let go). The strings speak as the wheel gathers speed.' },
      { id: 'keep', label: 'Keep turning between notes', perform: true, type: 'checkbox', def: false,
        hint: 'The crank keeps turning with no key down, as a player\'s does: the open chanterelles sound G4 under the drones. Off, the hand stops the wheel when you let go of the last key, the last tangent held until it stops.' },
    ],
  },
  {
    title: 'Strings',
    params: [
      { id: 'chanterelles', label: 'Chanterelles (G4)', type: 'checkbox', def: true,
        hint: 'The two melody strings, tuned in unison to G4 and stopped by the tangents of the keys: the highest key held sets the note (its tangent is nearest the bridge), and with none held they sound open.' },
      { id: 'trompette', label: 'Trompette (on the chien)', perform: true, type: 'checkbox', def: true,
        hint: 'The drone that rides on the chien, the loose bridge that buzzes. Off, it is hooked away from the wheel and rings out.' },
      { id: 'tromNote', label: 'Trompette tuning', type: 'select', def: 'd4', options: [['c4', 'C4 (to play in C)'], ['d4', 'D4 (to play in G)']],
        hint: 'Its peg: D4, the fifth of G, or a tone lower to C4 for tunes in C.' },
      { id: 'mouche', label: 'Mouche (G3)', perform: true, type: 'checkbox', def: true,
        hint: 'The drone an octave below the chanterelles.' },
      { id: 'petit', label: 'Petit bourdon (C3)', type: 'checkbox', def: false,
        hint: 'The drone an octave below a trompette in C: for tunes in C.' },
      { id: 'gros', label: 'Gros bourdon (G2)', perform: true, type: 'checkbox', def: true,
        hint: 'The deepest drone, an octave below the mouche: for tunes in G.' },
      { id: 'unison', label: 'Chanterelle unison', min: 0, max: 15, def: 1.5, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢ apart`,
        hint: 'The two chanterelles are tuned together by ear and never quite agree: the second is this much sharp, a slow beat that thickens the melody.' },
      { id: 'pressure', label: 'Wheel pressure (string height)', min: 0.1, max: 5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`,
        hint: 'How hard the strings bear on the wheel, set by the cotton wound on them and the paper shims under them: × 1 puts the chanterelles at 60 % of what their top note can take at the default speed (Schelleng\'s maximum), the drones at half or less. Less: airy and whistly. More: a raucous crunch, first in the treble.' },
      { id: 'wheelPos', label: 'Wheel from the bridge', min: 0.015, max: 0.05, def: 0.028, step: 0.001, fmt: (v) => `${(v * 1000).toFixed(0)} mm`,
        hint: 'Where the wheel meets the strings. The tangents stop the chanterelles from the far side, so a high note puts the wheel further along its shorter string: at 28 mm, 8 % of the open string and a third of G6\'s. Nearer the bridge is brighter and needs more pressure.' },
    ],
  },
  {
    title: 'Chien',
    params: [
      { id: 'tirant', label: 'Tirant (chien pressure)', perform: true, min: 0.3, max: 8, def: 2.7, log: true, fmt: (v) => `${v.toFixed(2)} N`,
        hint: 'The tirant is a peg whose cord pulls the trompette across, pressing the chien\'s foot onto the soundboard. The wheel\'s drag on the string has to beat it to lift the chien: tight (sec) needs a hard coup and buzzes dry; loose (gras) buzzes at the slightest surge, fat and long.' },
      { id: 'chienMass', label: 'Chien mass', min: 0.0003, max: 0.005, def: 0.0012, log: true, fmt: (v) => `${(v * 1000).toFixed(1)} g`,
        hint: 'The little hardwood bridge and the string over it. Lighter: it lifts and lands within each period, a bright snarl. Heavier: it lingers in the air and buzzes lower.' },
      { id: 'bounce', label: 'Bounce on the soundboard', min: 0.05, max: 0.9, def: 0.35, step: 0.01, fmt: (v) => `e = ${v.toFixed(2)}`,
        hint: 'The coefficient of restitution of the chien\'s foot on the board: how much of its speed it keeps as it bounces off. Low: a dry tap each period. High: it rattles, several hits a period.' },
    ],
  },
  {
    title: 'Rosin and strings',
    open: false,
    params: [
      { id: 'mus', label: 'Static friction μs', min: 0.4, max: 1.2, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Grip while stuck to the wheel. A bigger μs − μd narrows the pressures that bow cleanly.' },
      { id: 'mud', label: 'Sliding friction μd', min: 0.1, max: 0.7, def: 0.3, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'Friction at fast sliding (the asymptote of the curve).' },
      { id: 'v0', label: 'Friction curve width v₀', min: 0.01, max: 1, def: 0.1, log: true, fmt: (v) => `${(v * 100).toFixed(1)} cm/s`, hint: 'How fast μ falls from μs to μd as the string slides on the wheel. Cotton on the strings softens the grip: a wider curve, a rounder tone.' },
      { id: 'memory', label: 'Rosin lag τ', min: 0, max: 0.2, def: 0.02, step: 0.005, fmt: (v) => `${(v * 1000).toFixed(0)} µs`, hint: 'Rosin\'s grip follows the sliding speed with this delay (set by the contact\'s temperature). Zero is the classic friction curve.' },
      { id: 'grain', label: 'Rosin grain', min: 0, max: 0.05, def: 0.008, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} %`, hint: 'The rosin on the wheel and the cotton on the strings are not uniform: random fluctuation of the grip (band-limited to ≈ 2 kHz), heard as the wheel\'s hiss.' },
      { id: 'losses', label: 'String losses', min: 0.2, max: 5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Air and the gut\'s internal friction (the wound drones are lossier). Rounds the corner that runs round the string; raises the least pressure that bows cleanly.' },
    ],
  },
  {
    title: 'Body',
    open: false,
    params: [
      { id: 'mobility', label: 'Bridge mobility', min: 0.2, max: 5, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'The soundboard\'s point admittance at the bridge (× 1: the 32 × 24 cm spruce plate\'s). More: louder, the strings ring shorter, and the drones pull on each other more.' },
      { id: 'boardEta', label: 'Soundboard loss factor', min: 0.005, max: 0.1, def: 0.025, log: true, fmt: (v) => `η = ${v.toFixed(3)}`, hint: 'Damping of the board\'s modes (Q ≈ 1/η): low rings and booms, high is dry.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Vielle à roue, drones in G', p: {} },
  { name: 'Drones in C: trompette C4, petit bourdon', p: { tromNote: 'c4', petit: true, gros: false, tirant: 2.4 } },
  { name: 'Bourrée: two coups a turn', p: { coups: 'two' } },
  { name: 'Mazurka: three coups a turn', p: { coups: 'three', crank: 1.1 } },
  { name: 'Une traînée: crank fast, a long buzz', p: { crank: 2.2 } },
  { name: 'Sec: a tight tirant, hard coups', p: { tirant: 3.2, coup: 1.0, coups: 'two' } },
  { name: 'Gras: a loose tirant buzzes at a touch', p: { tirant: 2.1, crank: 1.0, coups: 'two', coup: 0.3 } },
  { name: 'Rattling chien: light and bouncy', p: { chienMass: 0.0005, bounce: 0.75, coups: 'one' } },
  { name: 'Chanterelles alone', p: { trompette: false, mouche: false, gros: false } },
  { name: 'Drones alone, turning', p: { chanterelles: false, keep: true } },
  { name: 'Slow crank: the top notes crunch', p: { crank: 0.35 } },
  { name: 'Wide unison: two chanterelles apart', p: { unison: 9 } },
];
