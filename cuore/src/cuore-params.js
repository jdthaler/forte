// cuore-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is one of CUORE's tellurium dioxide crystals, held at about
// 10 mK under the Gran Sasso and read by a germanium thermistor: its heater fires a pulse of heat
// into the crystal at the key's rate, sped up until the rate is the note, and the thermistor's
// voltage is the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const seconds = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : v < 60 ? `${v.toFixed(2)} s` : `${(v / 60).toFixed(1)} min`);

export const GROUPS = [
  {
    title: 'The heater',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys play (a MIDI keyboard\'s velocity does the same). A harder key fires a bigger pulse of heat: the pulse energy below times the velocity.' },
      { id: 'energy', label: 'Pulse energy (full velocity)', perform: true, min: 0.05, max: 50, def: 2.528, log: true, fmt: (v) => (v < 1 ? `${(v * 1000).toFixed(0)} keV` : v < 10 ? `${v.toFixed(3)} MeV` : `${v.toFixed(2)} MeV`),
        hint: 'The heat each pulse puts into the crystal at full velocity, as the energy of a particle that would stop in it. The default is 2,528 keV, what the two electrons of a neutrinoless double beta decay of ¹³⁰Te would leave, the line CUORE looks for. A few MeV warm the crystal by a tenth of a millikelvin and the note is clean; tens of MeV warm it so far that the thermistor\'s resistance no longer follows in proportion, and the pulses flatten and stretch: the note grows less than the energy and turns mellower. Aftertouch adds up to as much again.' },
      { id: 'periodA4', label: 'Heater period at A4 (speed-up)', min: 0.05, max: 300, def: 3, log: true, fmt: seconds,
        hint: 'How often A4\'s heater fires, in the crystal\'s own time: every key fires at its note\'s rate in that time × 440 Hz / its note, and the sound is played that much faster. At three seconds the speed-up is 1,320: a pulse that rises in 80 ms and fades in a few tenths of a second takes a fifth of a millisecond, so every key\'s note is its pulses through the same filter, the crystal\'s: the low keys\' pulses stand apart and buzz, the high keys\' pile up on one another and round off. Shorter periods slow the pulses down, so the filter falls lower and the top of the keyboard fades. CUORE fires its real heaters every 300 s: there the pulses are clicks.' },
    ],
  },
  {
    title: 'The cryostat',
    params: [
      { id: 'tbase', label: 'Heat sink temperature', perform: true, face: 'dial', min: 7, max: 20, def: 10, step: 0.01, fmt: (v) => `${v.toFixed(2)} mK`,
        hint: 'The temperature of the copper the crystals hang from, held by the dilution refrigerator. Colder, the crystal\'s heat capacity (∝ T³) is smaller, so the same pulse warms it more, and the thermistor\'s resistance climbs steeply: louder, sharper pulses. Warmer, the note fades fast (four times quieter at 12 mK, twenty times at 14 mK) and the pulses linger, so the tone darkens. The mod wheel warms it to 14 mK.' },
      { id: 'clamp', label: 'Teflon holders', min: 1, max: 100, def: 10, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} nW/K`,
        hint: 'The thermal conductance of the PTFE clips that hold each crystal in its copper frame, and of the frame\'s link to the heat sink: the way the heat leaves. Firmer (more conductance) and each pulse drains faster: a shorter pulse, a brighter note with less pile-up. Looser and the heat lingers.' },
      { id: 'side', label: 'Crystal side', min: 1, max: 10, def: 5, step: 0.1, fmt: (v) => `${v.toFixed(1)} cm`,
        hint: 'The edge of the TeO₂ cube: CUORE\'s are 5 cm and 750 g, Cuoricino\'s smaller ones 3 cm. Its heat capacity grows with its volume (Debye\'s T³ law, Θ = 232 K), so a bigger crystal warms less for the same pulse, and is quieter, and holds the heat longer, so its pulses are slower and the note darker.' },
    ],
  },
  {
    title: 'The thermistor',
    params: [
      { id: 'bias', label: 'Bias voltage', perform: true, min: 0.2, max: 30, def: 5, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} V`,
        hint: 'The voltage across the 60 GΩ load resistors and the thermistor in series. The current it drives heats the thermistor\'s electrons above the crystal (Joule heating), and as they warm their resistance falls, which pulls the heating back (electrothermal feedback): more bias, a bigger voltage to read but hotter electrons, so the pulses rise faster and the gain first grows and then falls.' },
      { id: 't0', label: 'Doping (T₀)', min: 2, max: 5, def: 3.4, step: 0.01, fmt: (v) => `T₀ = ${v.toFixed(2)} K`,
        hint: 'The neutron-transmutation-doped germanium\'s characteristic temperature, set by how many neutrons doped it: its resistance is R₀ exp(√(T₀/T)), electrons hopping between impurities. A higher T₀ is a less doped chip, far more resistive (and so more sensitive) at the same temperature.' },
      { id: 'wire', label: 'Wire capacitance', min: 50, max: 5000, def: 500, log: true, fmt: (v) => `${v.toFixed(0)} pF`,
        hint: 'The capacitance of the long wires from the 10 mK stage out to the front-end boards, which the thermistor\'s hundred megohms have to charge: it slows the rise of every pulse. Longer wires, a softer attack and a darker tone.' },
      { id: 'gain', label: 'Amplifier gain', min: 100, max: 100000, def: 5000, log: true, fmt: (v) => `× ${v.toFixed(0)}`,
        hint: 'The front-end amplifier\'s gain before the 18-bit digitiser, whose ±10.5 V is the full scale of the sound. Pulses that would go past it clip, as they would in the experiment.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.25, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, strip: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'A CUORE crystal at 10 mK', p: {} },
  { name: 'The real heater: a pulse every 300 s on A4', p: { periodA4: 300 } },
  { name: 'Warmer: 12.5 mK, quieter and darker', p: { tbase: 12.5, gain: 40000 } },
  { name: 'Colder: 8 mK, hot electrons', p: { tbase: 8, gain: 1500 } },
  { name: 'Big pulses: the thermistor saturates', p: { energy: 40, gain: 700 } },
  { name: 'Cuoricino\'s small crystal (3 cm)', p: { side: 3, gain: 1500 } },
  { name: 'Long wires: a soft attack', p: { wire: 3000 } },
  { name: 'Piled up: a pulse every 0.5 s on A4', p: { periodA4: 0.5, gain: 2500 } },
  { name: 'Firm holders: the heat drains fast, short pulses', p: { clamp: 80 } },
  { name: 'Loose holders: the heat lingers', p: { clamp: 1.5 } },
];
