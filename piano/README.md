# Ribbon Piano

A playable piano whose strings are physical models — and whose strings you can
swap for square bars, triangular bars, flat ribbons or tapered ("triangular")
ribbons, then hit wherever you like.

Runs in the browser with no build step: Web Audio for sound, your computer
keyboard (or a MIDI keyboard) for input.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/piano/>.

## Play it

| Input | |
|---|---|
| `Z S X D C V G B H N J M , L . ; /` | lower octave (starts on C) |
| `Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ]` | upper octave and a half |
| `←` `→` | shift octave |
| `↑` `↓` | hammer velocity (m/s) |
| hold `Space` | sustain pedal |
| mouse on the on-screen keys | play; click lower on a key = harder |
| **Enable MIDI** button | any connected MIDI keyboard: velocity → hammer speed, CC64 = sustain, CC67 = una corda (soft pedal) |

Settings persist in the browser (localStorage). Double-click a slider to reset it.
The string, hammer and damping sliders rebuild a key's modes, so you hear
them from the next note. The output gains and the stereo spread act at once,
gliding over about 10 ms so they don't click.

## What is being simulated

Each key is a member of length *L* under tension *T*, pinned at the agraffe and
the bridge. For a cross-section whose centroid and shear centre coincide, small
motions split into three independent families:

```
bending, principal axis i   (ρA + μ_w) u_tt = T u_xx − (E I_i u_xx)_xx        i = 1, 2
torsion                     (ρI_p + Θ_w) θ_tt = ((G J + T I_p/A) θ_x)_x
```

* `I_1, I_2` are the principal second moments of area, `J` the Saint-Venant
  torsion constant, `I_p` the polar moment, `μ_w, Θ_w` the mass and rotational
  inertia of the bass winding.
* `T I_p / A` is tension stiffening of torsion: a twisted member's fibres tilt,
  so tension makes a restoring torque. It gives the neat result
  **c_θ² = G J /(ρ I_p) + c_T²** — a torsional wave is never slower than a
  transverse one (without winding).

These are solved **modally**: closed form for uniform members, and by
**Rayleigh–Ritz in a sine basis** (generalized symmetric eigenproblem) for
tapered ones. Every mode becomes an exactly discretized damped oscillator in an
AudioWorklet, so the result is tuned correctly at every frequency, with no
numerical dispersion.

The pieces that couple to the modes:

* **Hammer**: a mass on a nonlinear, hysteretic felt spring,
  `F = K [δ^p + α d(δ^p)/dt]₊` (Chaigne–Askenfelt / Stulov-style), with
  per-key mass, stiffness, exponent and contact width. The contact is solved
  *implicitly* each sample (scalar Newton), so even very hard felt stays
  stable. The force is spread over the contact width, which naturally filters
  out high partials. Re-striking a ringing string hits it where it currently is.
  The felt values are per string, after Chaigne & Askenfelt (1994) at C2 and
  C4. Their single C7 set, extrapolated upwards, kept the hammer on the string
  for about 1.1 ms all the way to C8, several periods of a top-octave note, so
  C7–C8 came out 16–34 dB below C4. Real treble hammers are voiced much
  harder and touch the string for well under 1 ms (Askenfelt & Jansson 1990),
  so the treble felt is refitted: at a medium blow (1.2 m/s) the contact
  lasts about 1.2 ms at C6, 0.7 ms at C7 and 0.4 ms at C8. Mass and exponent
  level off above C7 instead of being extrapolated. Every key from C6 to C8 is
  now within 7 dB of C4 at MIDI velocity 64 (both channels summed). Soft notes
  are still weaker in the treble (down to −11 dB at velocity 40), because the
  felt there is more nonlinear (p = 3 against 2.5 at C4). The top notes start
  loud and decay fast, so a fortissimo there peaks near 1.8, against 0.5 at C4.
* **Strike geometry**: position along the string, *roll angle ψ* (the
  section's rotation relative to the hammer, which splits the blow between the
  two bending axes), and *lateral offset* (an off-centre hit on a flat face
  exerts a torque, which drives torsion). On a tapered member the lever of
  that torque is the half-width under the hammer.
* **Una corda** (the soft pedal: MIDI CC 67, or the checkbox under *Hammer*)
  shifts the action so each hammer misses one string of its unison (2 of 3,
  or 1 of 2). The struck strings share the blow, and the felt touches one
  string fewer. The missed string is driven only through the bridge, so the
  unison starts out of phase and more of its energy sits in the slowly
  decaying antisymmetric motion: softer, with more aftersound. Three seconds
  after a C3 strike, 3 dB more of the attack remains than without the pedal.
  It applies to the next strikes, as on a real piano.
* **Bridge**: a resistive termination of conductance *G*, shared by every
  mode of every unison string and both polarizations. In modal form it is the
  rank-one damping matrix `c cᵀ` with `c_n = √G F_bridge,n / ω_n`. This one
  matrix gives frequency-dependent bridge losses (σ = G(T + EIk²)/L), and also
  Weinreich's **double decay** and aftersound: in-phase unison motion drains
  fast, while the detuned remainder rings on. The audio output is the bridge
  velocity. The engine applies the bridge one sample late. On its own that
  would damp the high partials too little (by a factor sinc(ωΔt): 9 % at
  5.7 kHz, 35 % at 12 kHz), so each mode's own, exactly discretized decay
  makes up the shortfall. The measured decay of the partials matches
  G(T + EIk²)/L to 0.3 % up to 12 kHz (tested).
* **Torsion pickup**: torsion does not move the bridge's vertical channel. It
  is heard as the edge force of its torque at the bridge, the torque divided
  by the half-width there (*Torsion pickup* sets its level).
* **Soundboard and room**: synthetic impulse responses (dense plate modes and
  a diffuse tail), applied with ConvolverNodes.

The tension of each key is not set by hand. As a piano tuner would, the model
retunes it so the fundamental of whichever bending axis faces the hammer
lands on equal temperament. Lengths, gauges and bass winding follow a
smoothed concert-grand scale (A0 ≈ 2 m … C8 ≈ 5 cm, ~700–1600 N). The info
panel reports what that costs: tension, stress as a fraction of breaking
strength (it tells you if your string would snap), inharmonicity, and wave
speeds.

## What happens when the string becomes a ribbon

All comparisons keep the **same cross-sectional area** (same mass per length),
so the pitch, tension and hammer are unchanged; only the shape differs. The
numbers below are for C4 and come from the model:

| member | B (axis facing hammer) | B (other axis) | 10th partial | torsion f₁ / f₁ |
|---|---|---|---|---|
| round wire | 4.4e-4 | same | +37 ¢ | 9.8 |
| square bar | 4.6e-4 | same | +39 ¢ | 9.0 |
| triangular bar | 5.3e-4 | same | +45 ¢ | 7.6 |
| ribbon 12 : 1, face-on | 3.8e-5 | 5.5e-3 | +3 ¢ | 1.87 |
| ribbon 40 : 1 | 1.2e-5 | 1.8e-2 | +1 ¢ | 1.11 |
| ribbon 12 : 1, tapered 19 : 1 | — | — | +102 ¢ | 1.69 |

1. **Square and triangular bars sound almost exactly like wire.** Any
   cross-section with three-fold or higher rotational symmetry has an
   *isotropic* second-moment tensor (I₁ = I₂, whichever way it is rotated). So
   there is no preferred bending direction and no polarization splitting. The
   only change is the size of the stiffness at equal mass: ×4π/12 = 1.047 for
   the square and ×2π/3√3 = 1.21 for the triangle. That stretches the overtones
   by a few cents. Their torsional modes are a little slower, but sit at
   7–10× f₁, mostly out of the way.
2. **A flat ribbon is two instruments.** Bending across the thin direction is
   ~10× *less* stiff than the wire. Struck face-on, it is purer and more
   harmonic than a piano string, closer to a harp. Bending across the wide
   direction is ~12× *more* stiff: roll the ribbon (ψ ≠ 0) and the hammer also
   drives a second partial series stretched by hundreds of cents, a full
   octave sharp by about the 23rd partial. The result is metallic and
   bell-like. Edge-on (ψ = 90°), it is all bell, and the easy-axis partials,
   which the hammer cannot reach, are not computed at all.
3. **Twisting is where ribbons really differ.** For a thin ribbon,
   `c_θ² ≈ 4(t/w)² G/ρ + c_T²`, so torsional waves slow down toward the
   transverse speed as the ribbon thins. An off-centre strike adds a second,
   harmonic series at an *irrational* ratio to the first: 1.87 for 12:1, which
   sounds clangorous. At 40:1 the ratio approaches 1, so the two families nearly
   coincide and beat against each other, like a chorus. The twist can reach
   tens of degrees (watch the slow-motion view).
4. **A tapered ("triangular") ribbon is inharmonic even with no stiffness.**
   Its mass per length varies along the string, so the partials are no longer
   integer multiples: f₂ is already ~56 ¢ sharp of 2f₁.
5. **Material matters most for torsion.** Unidirectional carbon fibre is stiff
   in tension but soft in shear (G ≈ 5 GPa), so even a 12:1 carbon ribbon
   has its torsion at ~1.3 × f₁.

`examples/piano/` has renders of every preset playing the same phrase
(regenerate with `node tools/render-piano.mjs`).

## Files

```
index.html, style.css     UI (this folder)
src/physics.js            sections, scale design, closed-form + Ritz modes, tuning, voice data
src/engine.js             real-time modal engine: hammer, bridge coupling, dampers (also runs in Node)
src/worklet.js            AudioWorklet wrapper
src/main.js               UI, audio graph, keyboard / MIDI, model cache, focus-key analysis
src/viz.js                slow-motion 3D view, partial spectrum / inharmonicity, cross-section
../shared/impulses.js     synthetic soundboard and room impulse responses
src/params.js             every parameter, with ranges, hints and presets
../test/piano-tests.mjs   physics + engine checks:  node test/piano-tests.mjs
../tools/render-piano.mjs offline renders of the presets
```

## Known simplifications / natural next steps

* **Linear strings.** No tension modulation, so no pitch glide on hard blows
  and no "phantom partials". There are no longitudinal modes either; those
  matter for the real piano bass and would be the next physics to add (they
  also couple to torsion in a ribbon).
* **Bridge coupling stays inside a key.** Unisons and polarizations of the same
  note interact, but there is no sympathetic resonance between different keys
  yet (the engine design allows it; it costs CPU).
* **Symmetric sections only.** For non-equilateral triangles the shear centre
  moves off the centroid, which would couple bending to torsion. Euler–Bernoulli
  bending (no shear or rotary inertia) is fine for these slender members.
* The soundboard is a stand-in impulse response, not a modelled plate.
* **The lowest notes are band-limited.** Each motion family keeps at most 140
  partials, to save CPU. With *Highest partial* at 12 kHz the cap binds from
  A0 to A1: A0's stretched partials stop at 5.6 kHz, C1's at 6.6 kHz. The
  info panel shows the partial count and the highest partial for each key.
* CPU: ~1.7 ns per mode per sample; the engine caps the oscillator count and
  steals the quietest voices. If the CPU pill turns red, lower **Highest
  partial** or **Strings per note**.
