// project8-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a CRES cell, as in Project 8: a magnetic bottle in a
// strong field holding one electron, and a receiver listening to its cyclotron radiation. The
// 26 GHz is moved down to the key's note; nothing is slowed down, so the electron chirps, bounces,
// collides and escapes when it would in the real trap.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

// pressures in mbar, as Project 8 quotes them; the lowest setting is no gas at all
const mbar = (v) => { if (v <= 1e-11) return 'none (a perfect vacuum)'; const [m, e] = v.toExponential(1).split('e'); return `${m}×10${e.replace('+', '').replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])} mbar`; };

export const GROUPS = [
  {
    title: 'The electrons',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How loud the computer keys play an electron (a MIDI keyboard\'s velocity does the same).' },
      { id: 'source', label: 'Source', face: 'selector', shortLabels: ['Kr-83m', 'Tritium', 'One E'], type: 'select', def: 'krypton',
        options: [['krypton', 'Krypton-83m: the K line, 17.8 keV'], ['tritium', 'Tritium β decay'], ['energy', 'One energy (below)']],
        hint: 'Where the electrons come from. Krypton-83m gives every electron the same 17.824 keV, the line Project 8 first saw and calibrates with: every note on its key. Tritium gives each electron a random share of 18.6 keV, the rest going to an antineutrino: the slower the electron, the higher its frequency (a lighter relativistic mass), so each note is sharp of its key by 3.3 ¢ for every keV the neutrino took. The key is the endpoint, an electron that left the neutrino nothing.' },
      { id: 'energy', label: 'Energy', min: 1, max: 300, def: 30, log: true, fmt: (v) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} keV`, showIf: (P) => P.source === 'energy',
        hint: 'The electrons\' kinetic energy. A faster electron radiates more and is brighter (its harmonics grow as β^n), and it has more to lose, so its pitch climbs further as it cools: 3.5 % (60 ¢) from 17.8 keV, 59 % (8 semitones) from 300 keV, where its mass is 1.6 times its rest mass.' },
    ],
  },
  {
    title: 'The trap',
    params: [
      { id: 'field', label: 'Magnetic field', face: 'dial', min: 0.75, max: 3, def: 0.959, step: 0.001, fmt: (v) => `${v.toFixed(3)} T`,
        hint: 'The magnet\'s field, 0.959 T in Project 8\'s Phase II. An electron radiates as B², so it cools in a time τ = 2.58 s / B² (2.81 s at 0.959 T, 0.29 s at 3 T): a stronger field makes the notes chirp up and fade faster. The pitch stays on the key; the pitch wheel bends the field itself.' },
      { id: 'depth', label: 'Trap depth', perform: true, min: 0.01, max: 20, def: 0.5, log: true, fmt: (v) => `${v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1)} mT`,
        hint: 'How much stronger the field is at the bottle\'s ends than at its centre (Phase II used 0.01 to 0.72 mT). Only electrons heading within cos θ < √(ΔB/B) of square to the field are held: a deeper trap holds electrons that bounce further, into stronger field, so they sound a little sharp and their Doppler vibrato is deeper; a collision knocks fewer of them out.' },
      { id: 'length', label: 'Trap length', min: 1, max: 100, def: 10, log: true, fmt: (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} cm`,
        hint: 'The bottle\'s length scale L, in B = B₀ (1 + z²/L²). The electron bounces along the field at v⊥ / 2πL, about 120 MHz in Phase II: in the note, a vibrato at about 1/200 of its frequency. A longer trap bounces more slowly and further, so its vibrato is slower and deeper.' },
      { id: 'gas', label: 'Gas pressure', perform: true, min: 1e-11, max: 1e-5, def: 1e-10, log: true, fmt: mbar,
        hint: 'The hydrogen left in the trap. Each collision costs the electron energy (a step up in pitch) or knocks it sideways, often out of the trap, which ends its note. At 10⁻¹⁰ mbar an electron meets a molecule every few seconds; at Phase II\'s 2×10⁻⁶ mbar, every fifth of a millisecond, so each note is a blip. All the way down, there is no gas at all. The mod wheel turns it up.' },
    ],
  },
  {
    title: 'The receiver',
    params: [
      { id: 'receiver', label: 'Receiver', face: 'selector', shortLabels: ['Guide', 'Ring'], perform: true, type: 'select', def: 'guide',
        options: [['guide', 'Waveguide'], ['antennas', 'Antenna ring']],
        hint: 'Waveguide: Phase II\'s, a 10 mm copper pipe along the field that carries the cyclotron frequency alone; the electron\'s bounce along it Doppler-shifts the wave, a vibrato. Antenna ring: antennas around the trap that see the electron side-on, as Project 8\'s later designs do. They hear its harmonics too (a relativistic electron\'s orbit is not quite a sine), and no Doppler shift.' },
      { id: 'noise', label: 'Receiver noise', min: 0, max: 1, def: 0.1, step: 0.01, fmt: (v) => (v ? `${(v * 100).toFixed(0)} %` : 'off'),
        hint: 'The amplifier\'s thermal hiss in each key\'s channel, around its note, while the key is held: Project 8 picks electrons out of noise like this. It stays after the electron has gone, until the key comes up.' },
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
  { name: 'Krypton-83m in a Phase II trap', p: {} },
  { name: 'Phase II\'s gas: tracks a fifth of a millisecond long', p: { gas: 2e-6 } },
  { name: 'Tritium: each electron sharp by its neutrino\'s energy', p: { source: 'tritium' } },
  { name: 'Antenna ring: the harmonics', p: { receiver: 'antennas' } },
  { name: 'A deep trap: wide bounces, deep vibrato', p: { depth: 8 } },
  { name: 'A long trap: a slow bounce', p: { length: 60, depth: 3 } },
  { name: '3 tesla: quick chirps', p: { field: 3 } },
  { name: 'Relativistic: 300 keV electrons', p: { source: 'energy', energy: 300, receiver: 'antennas' } },
  { name: 'Perfect vacuum, quiet amplifier', p: { gas: 1e-11, noise: 0 } },
  { name: 'A shallow trap: hardly any vibrato', p: { depth: 0.02 } },
  { name: 'Tritium in the antenna ring: shifted harmonics', p: { source: 'tritium', receiver: 'antennas' } },
];
