// nmr-params.js — the knobs. Every parameter has a physical meaning and a unit; the hint says
// what it does to the sound. Every key is a tube of a liquid in an NMR magnet: a pulse tips its
// protons' spins over, and the receiver hears them precess, mixed down against the 0 ppm
// reference (TMS) as every spectrometer does, so each chemical group's line sounds at its shift
// times the magnet's Larmor frequency. The key sets the magnet: its field puts the sample's lowest
// line on the note. Nothing is slowed down: the notes fade, echo and beat when the spins would.

import { VENUE } from '../../shared/chain.js';
import { TUNING_GROUP } from '../../shared/tuning.js';

const sec = (v) => (v < 0.1 ? `${(v * 1000).toFixed(0)} ms` : v < 10 ? `${v.toFixed(2)} s` : `${v.toFixed(1)} s`);

export const GROUPS = [
  {
    title: 'The sample',
    params: [
      { id: 'velocity', label: 'Velocity (computer keys)', perform: true, strip: true, min: 0.05, max: 1, def: 0.8, step: 0.01, fmt: (v) => v.toFixed(2),
        hint: 'How hard the computer keys play: the tip angle of the pulse that starts each note (a MIDI keyboard\'s velocity does the same).' },
      { id: 'sample', label: 'Sample', perform: true, face: 'selector', shortLabels: ['EtOH', 'EtOH fast', 'Water', 'EtOAc', 'iPrOH'], type: 'select', def: 'ethanol',
        options: [
          ['ethanol', 'Ethanol in DMSO (its OH coupled)'],
          ['ethanolFast', 'Ethanol in chloroform (its OH exchanging)'],
          ['water', 'Water (HDO in D₂O)'],
          ['ethylAcetate', 'Ethyl acetate in chloroform'],
          ['propanol', '2-Propanol in chloroform'],
        ],
        hint: 'The liquid in every tube: its protons, their chemical shifts and the J couplings between them (Gottlieb, Kotlyar and Nudelman 1997). Each chemical group sounds at its own shift, so a molecule is a chord: ethanol\'s CH₃, CH₂ and OH lines stand 1 : 3.25 : 4.37 apart in DMSO. Couplings split each line into a multiplet a few hertz wide, which beats: a CH₃ triplet throbs at 7 Hz. In DMSO ethanol\'s OH keeps its proton long enough to couple to the CH₂ (5 Hz); in chloroform it trades it with its neighbours so fast that the coupling averages away.' },
    ],
  },
  {
    title: 'The magnet',
    params: [
      { id: 'shim', label: 'Field inhomogeneity (shim)', perform: true, min: 0.2, max: 2000, def: 5, log: true,
        fmt: (v) => (v < 10 ? `${v.toFixed(1)} ppb` : v < 1000 ? `${v.toFixed(0)} ppb` : `${(v / 1000).toFixed(2)} ppm`),
        hint: 'How far the field varies across the sample, in parts per billion of it: the width of every line. Spins in a slightly stronger field precess slightly faster, so they drift out of step and the note fades, in about 1/(π × width): a well-shimmed magnet (1 ppb) rings for a second, a bad one (500 ppb) for milliseconds. The width is a share of the field, so higher keys, in stronger magnets, fade faster. A π pulse (the pedal) brings this dephasing back as an echo. The mod wheel spoils the shim.' },
      { id: 'profile', label: 'Field profile', face: 'selector', shortLabels: ['Lorentz', 'Gauss', 'Gradient'], type: 'select', def: 'lorentz',
        options: [['lorentz', 'Lorentzian (a shimmed magnet)'], ['gauss', 'Gaussian'], ['gradient', 'A linear gradient along the tube']],
        hint: 'How the field is spread over the sample, which shapes how a note fades and its echo swells. Lorentzian: an exponential fade, the classic line shape. Gaussian: a fade that starts slowly and then falls fast. A linear gradient, as an imaging magnet applies, spreads the spins evenly over a band of frequencies, so the fade is a sinc: it dies, comes back weaker, dies again.' },
    ],
  },
  {
    title: 'Relaxation',
    params: [
      { id: 't2', label: 'T₂ (spin–spin)', min: 0.05, max: 20, def: 1, log: true, fmt: sec,
        hint: 'The time over which the spins truly lose their phase, by tumbling molecules\' fields: what no echo can bring back. Every echo is at most e^(−t/T₂) of the first note. Small molecules in a thin liquid have T₂ of a second or more; a viscous or paramagnetic one, milliseconds. It cannot exceed 2 T₁.' },
      { id: 't1', label: 'T₁ (spin–lattice)', min: 0.05, max: 30, def: 1.5, log: true, fmt: sec,
        hint: 'How long the spins take to line up with the field again after a pulse has tipped them over. Strike a key again too soon and there is little left to tip: the note comes back quieter (it saturates), until T₁ has passed. Softer notes tip the spins less and leave more for the next. A π pulse turns the spins upside down, and a key struck then sounds inverted until they recover.' },
    ],
  },
  {
    title: 'Pulses',
    params: [
      { id: 'flip', label: 'Pulse angle at full velocity', min: 10, max: 180, def: 90, step: 1, fmt: (v) => `${v.toFixed(0)}°`,
        hint: 'How far a key\'s pulse tips the spins when struck hardest; softer keys tip them less. The note\'s loudness goes as the sine of the angle, so 90° is loudest, and 180° turns the spins upside down and gives no signal at all; what the pulse leaves along the field (its cosine) is what the next strike of the key can use.' },
      { id: 'train', label: 'Echo train (CPMG)', perform: true, strip: true, type: 'checkbox', def: false,
        hint: 'Off: the pedal fires one π pulse when it goes down, and every sounding note comes back as an echo, as Hahn found in 1950. On: while the pedal is held a π pulse fires every echo time (Carr and Purcell 1954, with Meiboom and Gill\'s phase): the notes pulse back again and again, each echo weaker by T₂ alone, even in a field that diffusion would spoil.' },
      { id: 'spacing', label: 'Echo time (pulse spacing)', perform: true, min: 0.02, max: 2, def: 0.3, log: true, fmt: sec, showIf: (P) => P.train,
        hint: 'The time between the π pulses of the echo train while the pedal is held. Shorter spacing refocuses the spins before diffusion carries them to a different field, so the train lasts longer in a bad magnet; each note\'s echoes fall halfway between its pulses when they are spaced twice as far as the first pulse came after the note.' },
    ],
  },
  {
    title: 'The receiver',
    params: [
      { id: 'acquire', label: 'Receiver open', face: 'selector', shortLabels: ['Key held', 'Until gone'], type: 'select', def: 'held',
        options: [['held', 'While the key is held'], ['ring', 'Until the signal has gone']],
        hint: 'While the key is held: each key\'s receiver listens to its sample until the key comes up, like a key on an organ; hold it and press the pedal for an echo. Until the signal has gone: the receiver stays open after the key comes up, so every note rings out and still answers the pedal.' },
      { id: 'channels', label: 'Receiver channels', face: 'selector', shortLabels: ['Quadrature', 'Real'], type: 'select', def: 'quadrature',
        options: [['quadrature', 'Quadrature: real left, imaginary right'], ['real', 'The real channel alone, in both ears']],
        hint: 'A spectrometer mixes the signal down twice, with references 90° apart, to tell lines above the reference from lines below it. Quadrature puts those two channels in the two ears: each line arrives a quarter of its period later on the right. The real channel alone is mono.' },
      { id: 'noise', label: 'Receiver noise', min: -100, max: -20, def: -70, step: 1, fmt: (v) => (v <= -100 ? 'off' : `${v.toFixed(0)} dB`),
        hint: 'The thermal noise of the probe\'s coil and preamplifier, while a key\'s receiver is open, relative to a full note: its hiss is what a weak sample\'s echoes sink into.' },
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
  { name: 'Ethanol: a chord of three groups', p: {} },
  { name: 'Water: one line', p: { sample: 'water' } },
  { name: 'Hahn\'s echo: hold a key, press the pedal', p: { sample: 'water', shim: 20, t2: 3, t1: 3 } },
  { name: 'Echo train: hold the pedal', p: { train: true, shim: 20, t2: 3, t1: 3 } },
  { name: 'Ethanol with its OH exchanging', p: { sample: 'ethanolFast' } },
  { name: 'Ethyl acetate: a triplet, a singlet and a quartet', p: { sample: 'ethylAcetate' } },
  { name: '2-Propanol: a doublet and a septet', p: { sample: 'propanol' } },
  { name: 'Perfect shim: the couplings beat', p: { shim: 0.3, t2: 4, t1: 5, acquire: 'ring' } },
  { name: 'Early NMR: lines without their fine structure', p: { shim: 200, sample: 'ethanolFast' } },
  { name: 'A gradient: sinc fades', p: { profile: 'gradient', shim: 30, t2: 3 } },
  { name: 'Diffusion steals late echoes', p: { sample: 'water', profile: 'gradient', shim: 1500, t2: 3, t1: 3, acquire: 'ring' } },
  { name: 'Small tip angles: repeat notes freely', p: { flip: 30, t1: 3 } },
  { name: 'Saturated: long T₁, full pulses', p: { flip: 90, t1: 10, t2: 2 } },
  { name: 'Viscous: short T₂', p: { t2: 0.08, t1: 0.3 } },
  { name: 'Noisy probe: dilute sample', p: { noise: -32, shim: 20, t2: 3 } },
];
