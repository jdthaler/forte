// pianet-params.js — the knobs. Every parameter has a physical meaning and
// a unit; the hint says what it does to the sound.

const mm = (v) => `${v.toFixed(2)} mm`;

export const GROUPS = [
  {
    title: 'Pad and bond',
    params: [
      { id: 'tack', label: 'Tack F₀ (static pull-off)', min: 0.005, max: 0.5, def: 0.25, log: true, fmt: (v) => `${(v * 1000).toFixed(v < 0.1 ? 1 : 0)} mN`, hint: 'How hard a slowly lifted pad holds the reed. Fresh pads ≈ 0.2–0.4 N; aged pads lose it, and below ≈ 30 mN notes go quiet or fail to speak.' },
      { id: 'rate', label: 'Rate exponent n', min: 0.1, max: 1, def: 0.6, step: 0.01, fmt: (v) => `G ∝ 1 + (v/v₀)^${v.toFixed(2)}`, hint: 'Viscoelastic tack: how much stronger the bond gets the faster it is peeled (n ≈ 0.6 for elastomers). Across the range, higher n gives more touch response (C4, pp to ff: 3 dB at 0.1, 7 dB at 1), though not at every step. Near 0.1 the bass inverts: ff comes out quieter than pp.' },
      { id: 'padK', label: 'Pad stiffness k_p', min: 0.1, max: 5, def: 0.6, log: true, fmt: (v) => `${v.toFixed(2)} N/mm`, hint: 'The foam behind the face. Stiffer foam loads the bond faster, so the middle and treble get louder; the heavy bass reeds cannot follow a stiff pad, so the bass is loudest near the default. Stiffer foam also grips the reed harder when it lands.' },
      { id: 'padC', label: 'Pad damping c_p', min: 0.01, max: 2, def: 0.25, log: true, fmt: (v) => `${v.toFixed(2)} N·s/m`, hint: 'Foam loss: how fast the landing pad chokes the reed. Too little and released notes ring on; this is the staccato "plink".' },
      { id: 'velocity', label: 'Velocity (computer keys)', min: 0.05, max: 1, def: 0.7, step: 0.01, fmt: (v) => `${v.toFixed(2)} · ${(3 * (40 / 3) ** v).toFixed(0)} cm/s`, hint: 'Key speed at the pad, 3 cm/s (pp) to 40 cm/s (ff). Slow keys also speak later: the pad has further to go.' },
    ],
  },
  {
    title: 'Reed',
    params: [
      { id: 'tipMass', label: 'Solder tip mass', min: 0.1, max: 4, def: 1, log: true, fmt: (v) => `× ${v.toFixed(2)}`, hint: 'Each reed is re-cut to stay in tune. More solder: a shorter, stiffer reed, overtones pushed higher, a smaller swing. Applies to new notes.' },
      { id: 'loss', label: 'Reed loss η', min: 2e-4, max: 2e-2, def: 1.2e-3, log: true, fmt: (v) => `${(v * 1e3).toFixed(2)} × 10⁻³`, hint: 'Clamp and internal friction (thermoelastic loss and air are added). Sets the sustain while the key is held. Applies to new notes.' },
    ],
  },
  {
    title: 'Pickup',
    params: [
      { id: 'pickup', label: 'Pickup', type: 'select', def: 'em', options: [['em', 'Electromagnetic (Pianet T)'], ['es', 'Electrostatic (Pianet N)']], hint: 'T: a magnet pole under each reed tip, output ∝ dΦ/dt. N: each reed tip faces a charged plate, output ∝ change in capacitance.' },
      { id: 'gap', label: 'Pole gap at C4', min: 0.2, max: 3, def: 1.0, log: true, fmt: mm, showIf: (P) => P.pickup === 'em', hint: 'Reed tip to magnet pole, voiced along the keyboard. Every pole has the same magnet, so closer means more flux: louder (∝ 1/(ℓ + g)² for small swings), with more 2nd harmonic (bark) on the downswing. Too close and the bass reeds strike their poles.' },
      { id: 'plateGap', label: 'Plate gap at C4', min: 0.15, max: 2, def: 0.3, log: true, fmt: mm, showIf: (P) => P.pickup === 'es', hint: 'Tip end to plate, voiced ∝ √swing. The plate edge is blurred over about one gap: closer = louder and harsher.' },
      { id: 'offset', label: 'Plate edge height at C4', min: -1, max: 1, def: 0.25, step: 0.01, fmt: mm, showIf: (P) => P.pickup === 'es', hint: 'At 0 the edge is level with the reed: odd harmonics only. Raise it and only the upswing sees the plate: the N\'s fuzzy 2nd harmonic.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { id: 'tone', label: 'Tone (output RC)', min: 500, max: 20000, def: 7000, log: true, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v.toFixed(0)} Hz`), hint: 'Corner of the RC low-pass after the pickup (tone pot and cable).' },
      { id: 'amp', label: 'Amplifier', type: 'select', def: 'off', options: [['off', 'Direct (DI)'], ['combo', 'Valve combo, 10″ speaker']], hint: 'The Pianet had no speaker: it went into whatever amp was at hand.' },
      { id: 'drive', label: 'Amp drive', min: 0, max: 1, def: 0.35, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`, showIf: (P) => P.amp === 'combo', hint: 'Asymmetric valve clipping, then the speaker\'s band-pass.' },
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.2, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %` },
      { id: 'volume', label: 'Volume', min: 0, max: 2, def: 0.8, step: 0.01, fmt: (v) => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB` },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(GROUPS.flatMap((g) => g.params).map((p) => [p.id, p.def]));

export const PRESETS = [
  { name: 'Pianet T: silicone pads, magnetic pickups', p: {} },
  { name: 'Pianet N: leather pads, electrostatic pickup', p: { pickup: 'es', tack: 0.3, rate: 0.5, padC: 0.35, tone: 9000 } },
  { name: 'Aged pads: the tack has gone', p: { tack: 0.03 } },
  { name: 'Very tacky, rate-sensitive pads (poles set back)', p: { tack: 0.4, rate: 1, gap: 2 } },
  { name: 'Rate-blind pads: little touch response', p: { rate: 0.1 } },
  { name: 'Poles set close: louder, bass reeds clack', p: { gap: 0.4 } },
  { name: 'Plate edge level with the reed (odd harmonics)', p: { pickup: 'es', offset: 0, plateGap: 0.36 } },
  { name: 'Heavy solder tips', p: { tipMass: 3 } },
  { name: 'Limp foam: notes ring after release', p: { padC: 0.02, padK: 0.2 } },
  { name: 'Through a valve combo', p: { amp: 'combo', drive: 0.55 } },
];
