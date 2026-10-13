# Tine Piano

A physically modelled Rhodes-style electric piano: steel tines, brass tone
bars, neoprene hammers, and electromagnetic pickups whose nonlinearity *is*
the sound. Play it at <https://forte.jthaler.net/tines/> (or locally — see the
[main README](../README.md)).

Keys: same rows as the piano (`Z…/`, `Q…]`); `←→` octave; `↑↓` velocity; hold
`Space` for sustain; MIDI notes, velocity and CC64 work after **Enable MIDI**.
73 keys, E1–E7.

## The model

**Tine.** A steel cantilever (Euler–Bernoulli, 24 Hermite finite elements)
clamped in a block, with the tuning spring as a point mass. Its overtones
are not harmonic. A bare cantilever's are at 6.27, 17.5, 34.4 × f₁; the
spring lowers f₁ more than the overtones, so with the default spring the
"bell" partial sits at 8.2 × f₁. The geometry is self-similar, so
f₁ ∝ 1/L². Each key's tine length is *solved* to hit its pitch: 16 cm for
E1, 2 cm for E7. The FEM matches the analytic cantilever to 1e-5.

**Tone bar: an asymmetric tuning fork.** Tine, tone bar and mounting block
are coupled through the block's inertia, with participation factors
Γ = ∫ m φ dx. The block sits on a lossy rubber grommet. The coupled
eigenproblem gives:

* an **antisymmetric fork mode** exactly on pitch, in which the shear forces of
  tine and bar cancel at the block. The block stays still, no energy leaks
  into the mount, and the note sustains: A4 T60 ≈ 16 s.
* a **symmetric mode** about +90 ¢ up that shakes the block and dies in tens
  of ms, giving a shimmer in the attack;
* a **mount mode** well below the pitch: a short knock.

Remove the tone bar and A4's sustain collapses to 0.6 s, because the tine now
shakes its own mount. Detune the bar by 40 ¢ and the sustain drops to 5.7 s.
This is the job the tone bar does.

**Hammer.** A mass on a nonlinear, hysteretic tip, F = K[δ^p + α d(δ^p)/dt]₊,
graded softer in the bass. It is solved implicitly against all modes. It
strikes 8 mm from the clamp, where every mode shape goes like x², so the
higher (bell) modes get relatively more energy. Strike closer to the clamp
and the bell gets louder.

**Pickup.** The flux through the coil is modelled as the axial field of a pole
at distance w: Φ(Y) = (1 + (Y/w)²)^(−3/2), where Y is the tip's height relative
to the pole axis and w² = gap² + pole radius². The output is −dΦ/dt,
computed at 2× oversampling and then decimated.

* Soft notes barely move along the curve: nearly a sine.
* Hard notes swing across the steep flank: the "bark". On A3 the 2nd
  harmonic goes from −34 dB to −7 dB re the fundamental between soft and hard.
* A tine **centred** on the pole swings symmetrically over the top of the
  bump, so the fundamental cancels and you hear the octave. Technicians voice a
  Rhodes by moving the pickups (the *Vertical voicing* and *Gap* sliders).

**Electrical and amp.** About 1 H of pickup coils against the cable
capacitance makes a resonant low-pass (≈5 kHz with 1 nF). After that come the
Suitcase-style stereo vibrato (an auto-pan), a soft-clipping power amp, a
speaker roll-off and a room.

`examples/tines/` has short renders, one effect each: velocity → bark,
centred vs off-centre pickup, tone bar matched vs removed vs detuned,
strike point, and stereo vibrato. Regenerate with `node tools/render-tines.mjs`.
Tests: `node test/tines-tests.mjs`.

## Simplifications

The tine moves in one plane. Real tines also whirl a little, and the tip
moves on an arc, slightly changing the gap. The pickup field is an analytic
stand-in, not a magnetostatic solution for the real pole piece. The tone
bar is a single mode. The grommet's resonance is set per register as a
fraction of each note's frequency. The damper is a viscous felt at 60% of
the tine length, and the hammer has no escapement mechanics.
