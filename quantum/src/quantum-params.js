// quantum-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const s = (v) => (v < 1 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(v < 10 ? 2 : 1)} s`);
const notHO = (P) => P.potential !== 'harmonic';

export const GROUPS = [
  {
    title: 'Well',
    params: [
      { id: 'potential', label: 'Potential', type: 'select', def: 'box',
        options: [['box', 'Infinite square well (Eₙ ∝ n²)'], ['morse', 'Morse molecule (anharmonic)'], ['hydrogen', 'Hydrogen Rydberg atom (Eₙ ∝ −1/n²)'], ['bouncer', 'Quantum bouncer (gravity + mirror)'], ['harmonic', 'Harmonic oscillator (control)']],
        hint: 'The spectrum Eₙ sets everything: pitch, when the packet collapses, and when it revives.' },
      { id: 'eta', label: 'Height in the Morse well', min: 0.05, max: 0.95, def: 0.5, step: 0.01, fmt: (v) => `E = ${(v * 100).toFixed(0)} % of D`,
        hint: 'Near the bottom the packet swings almost harmonically; near dissociation it slams into the inner wall and lingers outside: brighter, with strong even harmonics.', showIf: (P) => P.potential === 'morse' },
    ],
  },
  {
    title: 'Wavepacket',
    params: [
      { id: 'lock', label: 'Lock the revival time to a tempo', type: 'checkbox', def: true,
        hint: 'Each key gets the n̄ whose revival time is the set number of beats, so every note returns on the beat.', showIf: notHO },
      { id: 'bpm', label: 'Tempo', min: 40, max: 200, def: 90, step: 1, fmt: (v) => `${v.toFixed(0)} BPM`, showIf: (P) => P.lock && notHO(P) },
      { id: 'beats', label: 'Revival time T_rev', min: 0.5, max: 8, def: 2, step: 0.25, fmt: (v) => `${v} beats`,
        hint: 'The packet re-forms (half a period shifted) at T_rev/2, exactly at T_rev; at T_rev/q it is q (or q/2) copies.', showIf: (P) => P.lock && notHO(P) },
      { id: 'nbar', label: 'Mean level n̄', min: 3, max: 1000, def: 40, log: true, fmt: (v) => v.toFixed(v < 10 ? 1 : 0),
        hint: 'How classical the packet is. T_rev = 2n̄ periods in the box, 2n̄/3 in hydrogen, so a chord revives in polyrhythm.', showIf: (P) => !P.lock || !notHO(P) },
      { id: 'sigma', label: 'Level spread σₙ', min: 0.4, max: 4, def: 2, log: true, step: 0.01, fmt: (v) => `${v.toFixed(2)} levels`,
        hint: 'A short pump pulse excites many levels: a tight, bright packet that collapses fast. Below 1 it is a chord of a few Bohr lines.' },
      { id: 'detector', label: 'Detector', type: 'select', def: 'a',
        options: [['x', 'Electrode: dipole ⟨x⟩ (mellow)'], ['v', 'Coil: current ⟨ẋ⟩'], ['a', 'Antenna: radiated field ⟨ẍ⟩ (bright)']],
        hint: 'Each time derivative weights the k-th Bohr harmonic by k more.' },
    ],
  },
  {
    title: 'Decoherence',
    params: [
      { id: 'T1', label: 'Lifetime T₁', min: 0.2, max: 30, def: 4, log: true, fmt: s, hint: 'Population decays out of the packet (to the ground state): the note fades, revivals and all.' },
      { id: 'dephase', label: 'Pure dephasing rate Γ_φ = 1/T_φ', min: 0, max: 10, def: 0, step: 0.01, fmt: (v) => (v > 0 ? `${v.toFixed(2)} s⁻¹ (T_φ ${s(1 / v)})` : 'off'),
        hint: 'Phase noise on the classical motion: coherence between levels k apart decays at k²Γ_φ. Kills revivals (and fractional ones first), keeps the attack. Mod wheel.' },
      { id: 'release', label: 'Release quench', min: 0.02, max: 2, def: 0.3, log: true, fmt: s, hint: 'Lifting the key ionises the packet: its population leaves at 1/T.' },
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, min: 0.05, max: 1, def: 0.75, step: 0.01, fmt: (v) => v.toFixed(2) },
    ],
  },
  {
    title: 'Restrike',
    params: [
      { id: 'ramsey', label: 'Coherent restrike (Ramsey fringes)', perform: true, type: 'checkbox', def: false,
        hint: 'A restruck key sends a second, phase-locked pulse into the packet still ringing there: its amplitudes add to the old ones, so the note can come back twice as strong or vanish, depending on the delay. Off: every strike is a fresh atom.' },
      { id: 'ramseyDetune', label: 'Pump detuning δ', min: -4, max: 4, def: 0, step: 0.01, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} Hz`,
        hint: 'The pump\'s carrier off the line of the packet\'s central level: the second pulse\'s phase turns by 2πδ per second of delay, so restrikes on the revival swing between louder and silent every 1/δ seconds.', showIf: (P) => P.ramsey },
      { id: 'ramseyPhase', label: 'Second pulse\'s phase φ', min: 0, max: 360, def: 0, step: 1, fmt: (v) => `${v.toFixed(0)}°`,
        hint: 'The pulse pair\'s locked phase: at 0° a restrike on a full revival doubles the packet, at 180° it takes it back.', showIf: (P) => P.ramsey },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      VENUE,
      { id: 'volume', label: 'Volume', perform: true, min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
  TUNING_GROUP,
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Square well, revivals on the beat', p: {} },
  { name: 'Morse molecule: octave echoes at T_rev/4', p: { potential: 'morse' } },
  { name: 'Rydberg atom: revivals and a super-revival (C3)', p: { potential: 'hydrogen', lock: false, nbar: 44, sigma: 1.3, detector: 'x', T1: 20 } },
  { name: 'Bouncing atom on a mirror', p: { potential: 'bouncer' } },
  { name: 'Harmonic oscillator: never dephases', p: { potential: 'harmonic' } },
  { name: 'Dephasing: no way back', p: { dephase: 3 } },
  { name: 'Fixed n̄: chords revive in polyrhythm', p: { lock: false, nbar: 60 } },
  { name: 'Three levels: a chord of Bohr lines', p: { sigma: 0.6, detector: 'x' } },
  { name: 'Tight packet: bright, brief, many echoes', p: { sigma: 4 } },
  { name: 'Coherent restrike: Ramsey fringes', p: { ramsey: true } },
];
