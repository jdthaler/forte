// telharmonium-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const pct = (v) => `${(v * 100).toFixed(0)} %`;
const time = (v) => (v < 1 ? `${(v * 1000).toFixed(v < 0.01 ? 1 : 0)} ms` : `${v.toFixed(1)} s`);
const hz = (v) => (v < 1000 ? `${v.toFixed(0)} Hz` : `${(v / 1000).toFixed(2)} kHz`);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// The eight harmonic buses of a manual, each with its stop: an impedance rheostat of induction coils
// that the player cuts in or out with knife switches (0: the bus open; 8: the full switch).
const HARMONICS = ['ground tone', 'octave', 'twelfth', 'fifteenth', 'seventeenth', 'nineteenth', 'flat twenty-first', 'twenty-second'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const stops = (prefix, defs, manual) => defs.map((def, i) => ({
  id: `${prefix}${i + 1}`, label: `${ORD[i]} harmonic (${HARMONICS[i]})`, min: 0, max: 8, def, step: 1,
  fmt: (v) => (v < 0.5 ? 'off' : `${v.toFixed(0)} of 8`),
  hint: i === 0
    ? `The stop on ${manual}'s bus of ground tones: every key's own alternator flows through it. Each step cuts out induction coils, 3 dB louder a step; 8 is the full switch. With the ground tone off, the harmonics above still make the note's pitch heard, and the receivers' magnets put some of it back: the difference tones of neighbouring harmonics, the phantom low note the organ builder Robert Hope-Jones heard in it.`
    : `The stop on ${manual}'s bus of ${ORD[i]} harmonics: the alternators turning ${i + 1} times as fast as each key's own (${i === 2 || i === 4 || i === 6 ? 'a just interval above it, from the same pitch-shaft' : 'its octaves'}), all through one coil. Each step is 3 dB; 0 opens the bus. The softer the stop, the more each note on the bus robs the others.`,
}));

export const GROUPS = [
  {
    title: 'Pitch-shafts',
    params: [
      { id: 'shafts', label: 'Pitch-shafts', type: 'select', def: 'twelve', options: [['twelve', 'Twelve, as Cahill designed'], ['eight', 'Eight, as built in 1906 (no C♯, F♯, G♯, B shafts)']],
        hint: 'Every key\'s alternators sit on one of twelve steel shafts, one a pitch class, geared to the motor. Only eight were ever built (C, D, E♭, E, F, G, A, B♭): the missing notes were played from the alternators that make the just major thirds of A, D, E and G, so C♯, F♯, G♯ and B sound 13.7 ¢ flat of equal temperament.' },
      { id: 'intonation', label: 'Intonation', type: 'select', def: 'tempered', perform: true, options: [['tempered', 'Equal temperament: each key its own shaft'], ['pierce', 'Pierce\'s just thirds: from the held key\'s shaft']],
        hint: 'The twelve shafts are geared in equal temperament, but each also carries its note\'s 5th and 7th harmonics, a just major third and a just minor seventh above. Edwin Hall Pierce played thirds and sevenths on the keybanks wired to those: here a key a major third (or a minor seventh) above a key already held sounds from that key\'s shaft, 5 : 4 (or 7 : 4), 13.7 ¢ flatter (31 ¢) than tempered. Fifths stay tempered, as Cahill and Pierce left them.' },
      { id: 'top', label: 'Highest harmonic alternator', min: 1000, max: 16000, def: 4000, log: true, fmt: hz,
        hint: 'The fastest alternator a shaft carries for the harmonics. Harmonics above it don\'t exist, so high notes have fewer of them and the top octave is a bare sine (each key keeps its own alternator): the 1906 machine reached about 4 kHz (McAllister). Carry the shafts on to hear every key with all eight.' },
      { id: 'tooth', label: 'Rotor-tooth error', min: 0, max: 0.1, def: 0.02, step: 0.001, fmt: (v) => `${(v * 100).toFixed(1)} %`,
        hint: 'How far the alternators\' rotor teeth are from the curve that makes a pure sine: the flux\'s third harmonic, as a fraction of its fundamental. Cahill milled the teeth until the waves were "very nearly sinusoidal"; a little is left, and it adds a faint twelfth above every alternator.' },
      { id: 'voicing', label: 'Field voicing', min: 0, max: 1, def: 0.9, step: 0.01, fmt: pct,
        hint: 'How far the rheostats on the alternators\' field coils make up for the receivers: Cahill set each alternator\'s output "to compensate for the tendency of receiver diaphragms to produce some tones at different volumes". The 1906 diaphragm rings near 1 kHz and answers the bass weakly, and a horn\'s mouth lets little bass out; at 100 % its response is undone, at 0 the bass is thin and the notes near 1 kHz stand out.' },
      { id: 'droop', label: 'Motor\'s speed droop', min: 0, max: 60, def: 6, step: 0.1, fmt: (v) => `${v.toFixed(1)} ¢`,
        hint: 'How much the 185 hp motor slows under the alternators\' electrical load, at ten notes with every stop out. All the shafts are geared to it, so the whole instrument sags flat in tune with itself under big chords and comes back when they let go: "frequently the whole machine ran too slow, drifting down in pitch."' },
      { id: 'flywheel', label: 'Flywheel time constant', min: 0.2, max: 30, def: 3, log: true, fmt: time,
        hint: 'How quickly the massive shafts follow a change in the motor\'s torque: their inertia over the motor\'s drooping torque. The pitch sags and recovers this slowly, and pitch bend, which turns the motor\'s field rheostat, takes as long to arrive.' },
    ],
  },
  {
    title: 'Keys',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2), hint: 'How fast the computer keys go down. It counts as far as the key touch lets it.' },
      { id: 'keyTouch', label: 'Key touch', min: 0, max: 1, def: 0.5, step: 0.01, fmt: pct,
        hint: 'How much a key\'s speed sets its loudness, through an induction coil in each key\'s circuit (the third Telharmonium\'s touch control, 1911). At 0 every key switches its alternators in at full strength, as the relays of 1906 did; aftertouch presses a key further in.' },
      { id: 'split', label: 'Melody manual from', min: 36, max: 96, def: 60, step: 1, fmt: (v) => noteName(v),
        hint: 'Keys from here up play Manual II, the melody: its own eight stops, its own line and its own receivers. The keys below play Manual I, the accompaniment. In New York the two went out on separate lines, which let each be louder and balanced on its own.' },
      { id: 'tau', label: 'Circuit time constant (L/R)', min: 0.5, max: 40, def: 4, log: true, fmt: (v) => `${v.toFixed(1)} ms`,
        hint: 'The inductance over the resistance of the alternators\' windings and the buses. Switching a sine into such a circuit leaves a decaying offset, as large as the wave at the instant the relay closes: the "explosive puffs" with which every note began. Longer is a heavier thump and less bass below 1/(2π L/R).' },
      { id: 'contact', label: 'Relay contacts (closing time)', min: 0, max: 20, def: 6, step: 0.1, fmt: (v) => (v < 0.05 ? 'instant' : `${v.toFixed(1)} ms`),
        hint: 'How long a relay\'s knife blades take to slide fully into their jaws, and to part again. While they engage the winding\'s circuit follows them; faster than its time constant, the switch leaves the offset at full size and its edge rings the receivers\' diaphragms like "the rap of a metal mallet". Instant is a perfect switch.' },
      { id: 'robbing', label: 'Bus load (robbing)', min: 0, max: 1, def: 0.15, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'The impedance of a bus\'s transformer coil over one alternator winding\'s. Every key on a bus shares that coil, so each note added takes current from the others: a many-toned chord can be softer than a single note. Cahill called it robbing. A soft stop adds to the coil, so it robs more.' },
    ],
  },
  { title: 'Manual I stops (accompaniment)', params: stops('a', [8, 5, 3, 2, 1, 0, 0, 0], 'Manual I') },
  { title: 'Manual II stops (melody)', params: stops('m', [6, 8, 7, 6, 5, 4, 2, 3], 'Manual II') },
  {
    title: 'Line',
    params: [
      { id: 'cable', label: 'Line', type: 'select', def: 'cable', options: [['cable', 'Telephone cable under the streets (#19 gauge)'], ['open', 'Open wire on poles (long distance)']],
        hint: 'What carries the music from the switchboards to the listener. A city cable is mostly resistance and capacitance, so it loses the highs quickly with distance; open wire on poles is heavy copper far apart, and carries them almost as well as the lows.' },
      { id: 'distance', label: 'Distance', perform: true, min: 0, max: 250, def: 0, step: 0.1, fmt: (v) => (v < 0.05 ? 'in the hall' : `${v.toFixed(1)} km`),
        hint: 'How far the receivers are down the line: 0 is in Telharmonic Hall. The line is the telegrapher\'s line, solved exactly: resistance and inductance along it, capacitance across it. The output transformer\'s tap makes up the loss at 300 Hz (lifting nothing more than 6 dB), so a short line changes the tone, and a long city cable fades the music away, as it did. Cahill sent music over more than 160 km of open wire in 1904.' },
    ],
  },
  {
    title: 'Receivers',
    params: [
      { id: 'receiver', label: 'Receiver', type: 'select', def: 'telephone', options: [['telephone', 'Telephone receiver, Cahill\'s thin diaphragm (1906)'], ['arthur', 'Arthur T. Cahill\'s receiver (1911)']],
        hint: 'A telephone receiver: a soft-iron diaphragm pulled by a coil around a permanent magnet. Cahill thinned it to 1/100 inch: a 5 cm disc of it rings near 1 kHz, so it is soft above. Arthur Cahill\'s had a diaphragm ten times the area and three times as thick, near 300 Hz, and a stronger magnet.' },
      { id: 'magnet', label: 'Receiver magnet', min: 10, max: 2000, def: 200, log: true, fmt: (v) => `${v.toFixed(0)}×`,
        hint: 'The permanent magnet\'s flux, as the coil current that would match it, in units of one harmonic at a full stop. The pull goes as the square of the total flux, so the signal adds its own square: sum and difference tones that grow with the music, the "growling" of loud bass chords. A strong magnet keeps it linear.' },
      { id: 'horn', label: 'Horn length', min: 0, max: 3, def: 1.8, step: 0.01, fmt: (v) => (v < 0.005 ? 'no horn' : `${v.toFixed(2)} m`),
        hint: 'The paper horn on each receiver: a cone five or six feet long, which loads the diaphragm and carries the bass. It resonates on every multiple of c/2L (a complete cone, like a pipe open at both ends), and lets the highs out of its mouth. 0 is the bare receiver.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'swell', label: 'Swell pedal', perform: true, strip: true, min: 0, max: 1, def: 0.6, step: 0.01, fmt: pct,
        hint: 'The electrical swell: a brush on a foot pedal that cuts 48 induction coils in or out of the circuit (MIDI CC11; the mod wheel opens it from here).' },
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: pct },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

const both = (v) => Object.fromEntries(v.flatMap((x, i) => [[`a${i + 1}`, x], [`m${i + 1}`, x]]));

export const PRESETS = [
  { name: 'Telharmonic Hall, 1906: flute and oboe', p: {} },
  { name: 'As built: eight shafts at A = 435 Hz', p: { shafts: 'eight', pitch: 435, keyTouch: 0 } },
  { name: 'Pierce\'s just thirds and sevenths', p: { intonation: 'pierce' } },
  { name: 'Pure ground tone (sine alternators)', p: { ...both([8, 0, 0, 0, 0, 0, 0, 0]), tooth: 0 } },
  { name: 'Clarinet: the odd harmonics', p: both([8, 0, 7, 0, 5, 0, 4, 0]) },
  { name: 'Horn, with the seventh harmonic (1907)', p: both([7, 8, 8, 7, 6, 5, 5, 4]) },
  { name: 'Cello: every harmonic, falling', p: both([6, 8, 7, 7, 6, 6, 5, 5]) },
  { name: 'Harmonics without the ground tone (Hope-Jones\'s resultant)', p: { ...both([0, 8, 7, 6, 5, 4, 0, 3]), magnet: 40 } },
  { name: 'Robbing: soft stops, many notes', p: { ...both([6, 6, 5, 5, 4, 0, 0, 0]), robbing: 0.5 } },
  { name: 'Down Broadway to the Café Martin (2 km of cable)', p: { distance: 2 } },
  { name: '160 km of open wire (Cahill, 1904)', p: { cable: 'open', distance: 160 } },
  { name: 'Far down a city cable (25 km)', p: { distance: 25 } },
  { name: 'Growling bass: a weak receiver magnet', p: { magnet: 20, split: 48 } },
  { name: 'Arthur Cahill\'s receiver (1911)', p: { receiver: 'arthur', magnet: 1000 } },
  { name: 'The bare receiver (no horn)', p: { horn: 0 } },
  { name: 'A struggling motor: big droop, light flywheel', p: { droop: 40, flywheel: 0.8 } },
  { name: 'Heavy thumps: a long L/R', p: { tau: 25, keyTouch: 0 } },
];
