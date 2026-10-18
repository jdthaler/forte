# Storage Ring

A particle accelerator as a keyboard. Every key is a storage ring holding one
bunch of particles, and what you hear is a beam pickup: two small electrodes
in the vacuum pipe that feel the bunch's charge go past once a turn. The
revolution frequency is the note. Injection never puts the bunch exactly on
its orbit, so it arrives oscillating from side to side (betatron motion), and
the pickup hears that oscillation as extra lines between the harmonics. The
particles in the bunch do not all oscillate at the same rate, so the
oscillation fades as they drift out of step, and then, because the particles'
energies swing round and back in the RF bucket, they fall back into step and
the oscillation returns: **decoherence and recoherence**, a pulse at the
synchrotron frequency that you can hear in every note. Nothing is sampled: the
signal is the bunch's Gaussian pulse train, turn by turn, with the centroid
given by the closed forms of Meller, Chao, Peterson, Peggs and Furman (1987),
which the tests check against thousands of particles tracked turn by turn.

The rings are scaled to sound. A real ring goes round about a million times a
second (the LHC 11 245 times); here middle C goes round 262 times a second, and
everything else (tunes, chromaticity, bunch length) is in the proportions a
real ring has.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/ring/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): inject a bunch into that key's ring |
| `←` `→` | octave |
| `↑` `↓` | velocity: the bunch's charge |
| `Space` | keep the beams stored after the keys come up (the scrapers stay open) |
| MIDI | notes, velocity (charge), sustain pedal (CC64), **mod wheel = chromaticity**, **aftertouch = RF voltage** (channel for every ring, polyphonic for its own) |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch: more RF voltage on that ring |

## The physics

### 1. The bunch and the pickup

A bunch of rms length σ (here a share of the ring's circumference) passes the
pickup once every turn, T = 1/f_rev. A Gaussian bunch makes a train of
Gaussian pulses, whose harmonics n·f_rev are weighed by the bunch's form
factor:

  F(n) = exp(−(2π n σ)² / 2)

so a short bunch is bright and a long one soft. The pickup's cable and
amplifier add their own Gaussian response of 20 µs, which keeps the top keys
from aliasing: up to C7 nothing folds back, and at C8 what does (its sixth
harmonic, 25 kHz) comes back above 18 kHz, more than 40 dB down.

A button pickup is a small disc in the pipe wall, a capacitor into a
resistor: it passes the harmonics above 1/(2πRC) and weakens the ones below
(**Pickup cutoff**). Each button also sees more of the bunch when the bunch
passes closer to it: to first order its signal is the pulse train times
(1 ± x̄/b), x̄ the bunch's centroid on that turn and b the pipe's half-aperture
(Shafer 1990). **Two buttons** put the left and right electrodes on the two
channels; the betatron oscillation moves between them. **Difference** is
left minus right, which is what an accelerator's position monitor reads: only
the oscillation. Like a position monitor, its gain is set to the beam it
watches: the difference is read in units of the injected oscillation (beam
size times kick, at least one σ), so every note starts at the same height
whatever the kick and the beam size, near the other pickups' loudness.

### 2. Betatron oscillation and its sidebands

The ring's quadrupoles focus the particles, so a particle off orbit oscillates
about it, Q times a turn (the tune; Courant & Snyder 1958). The pickup samples
that oscillation once a turn, so only the fractional part q of the tune is
heard, aliased into sidebands at (n ± q)·f_rev beside every harmonic. Near
q = ½ (the half-integer resonance, where a real ring loses its beam) the
sidebands close in on the half-way points; near 0 or 1, on the harmonics.

### 3. Decoherence: why the oscillation fades

Kick the whole bunch Z beam sizes off orbit and every particle starts in step.
They do not stay in step, because their tunes differ:

* **Chromaticity.** A particle with momentum error δ is focused a little less
  and oscillates at Q + Q′δ. But δ is not fixed: in the RF bucket every
  particle's energy swings at the synchrotron tune Qs. The betatron phase a
  particle gains from its momentum therefore comes back to zero every 1/Qs
  turns, and the whole bunch comes back into step. For a Gaussian beam
  (Meller et al. 1987):

  |x̄(N)| / x̄(0) = exp(−2 (Q′σδ/Qs)² sin²(π Qs N))

  The signal falls by exp(−2D²), D = Q′σδ/Qs, half way through each
  synchrotron period, and recovers completely at its end: a slow pulse in every
  note, at the **Synchrotron frequency**.
* **Amplitude detuning.** Octupoles make the tune depend on the amplitude:
  Q + μ(a/σ)². That dephasing never comes back. For a Gaussian beam kicked by
  Z σ (the same report), with θ = 4πμN:

  x̄(N) / x̄₀ = exp(−Z²θ² / (2(1 + θ²))) / (1 + θ²)

  and the oscillation's phase runs ahead by 2 atan θ + (Z²/2) θ/(1 + θ²): the
  sidebands fade for good and slide in pitch as they go. A bigger kick puts
  particles further out where the detuning is stronger, so a harder injection
  fades faster.

The two dephasings are independent, so the centroid is the product of the
two factors, and radiation damping (synchrotron radiation, Sands 1970) takes
the rest away in τx. The **Phase space** view shows the same particles the
formulas average over: chromaticity smears them round the circle and gathers
them up again; the octupoles wind them into a spiral.

### 4. The RF bucket: vibrato and key pressure

The bunch sits in the RF cavity's voltage wave. A bunch injected early or late
(**Injection phase error**) swings about the synchronous phase at the
synchrotron frequency: its arrival time wobbles, and the harmonics with it, a
vibrato that radiation damps in τs = τx/2 (an isomagnetic ring's damping
partition, J_x = 1, J_s = 2).

Pressing harder on a key raises its ring's RF voltage V, up to four times. The
synchrotron frequency grows as √V, so the vibrato and the recoherence come
faster. Changed faster than the beam damps, the bunch's longitudinal emittance
σt·σδ is an adiabatic invariant: the bunch shortens as V^(−¼) (brighter) and
its momentum spread grows as V^(¼).

### 5. One lattice, many rings

The rings are one lattice cell repeated, more cells in a bigger (lower) ring.
Tune, chromaticity and amplitude detuning all add up cell by cell, so they
grow with the circumference; the parameters give them for the C4 ring. The
synchrotron frequency is the same in every ring. Then D = Q′σδ/Qs and the
detuning per second are the same on every key, and every key pulses alike.

### 6. The beam's life

Velocity is the bunch's charge, and the signal is proportional to it. While a
key is down the beam decays slowly with the **Beam lifetime** (Touschek
scattering and the residual gas). Letting go closes the scrapers, and the beam
is gone in the **Scraper time**; the pedal keeps it stored.

## What to listen for

* **Kicked beam, recohering** (default): every note shimmers with sidebands
  that fade and return four times a second, fading for good over a few seconds.
* **Clean injection**: no kick and no phase error, the bare pulse train, an
  organ-like buzz whose brightness is the bunch length.
* **Difference signal**: only the oscillation: each note a pulse train of
  recoherences, deeper with more chromaticity (the mod wheel).
* **Octupoles on**: little chromaticity, strong detuning: the sidebands glide
  and die away without coming back.
* **Near the half-integer**: the sidebands sit almost half way between the
  harmonics, a sound an octave down.
* Lean on a key: the pulse quickens and the note brightens.

## Files

```
ring/index.html, style.css            page
ring/src/ring-model.js                the constants (no audio, no DOM)
ring/src/ring-params.js               parameters and presets
ring/src/ring-main.js                 page wiring and views
ring/src/ring-wasm.js                 the engine and model, the C++ as WebAssembly (ring/wasm/ring.wasm)
native/instruments/ring/              the physics in C++: model, engine, generated tables, reference (plugins and WebAssembly)
test/ring-tests.mjs                   node test/ring-tests.mjs (19 tests, about 2 s)
tools/render-ring.mjs                 node tools/render-ring.mjs → examples/ring/
```

## Simplifications

* One bunch per ring, and the centroid from the closed forms rather than by
  tracking particles. The closed forms assume the parameters stay put; when
  the mod wheel or the pressure changes them during a note, the engine follows
  them turn by turn (the phases are accumulated, not recomputed), which is
  what a slowly changing ring does, not an exact solution.
* The chromatic formula assumes a matched bunch; the injection phase error's
  coherent synchrotron oscillation does not feed back into the betatron tune.
* Radiation damps the centroid but the beam's spread is held at equilibrium;
  the filamented beam's emittance growth is left out.
* The adiabatic bunch length under pressure ignores the damping's slow pull
  back to the equilibrium length.
* Pickups are linear in x̄/b (a real button is not, far off centre), and
  nothing radiates: the electrodes' signal goes to the speakers as it is.
* The rings are audio-scaled: the bunch is a few per cent of the ring, where
  a real one is a millionth.

## Prior art and references

**The physics**

* E. D. Courant and H. S. Snyder, "Theory of the alternating-gradient
  synchrotron", *Annals of Physics* 3, 1–48 (1958),
  <https://doi.org/10.1016/0003-4916(58)90012-5>: betatron oscillations and the
  tune.
* M. Sands, *The Physics of Electron Storage Rings: An Introduction*, SLAC-121
  (1970), <https://www.slac.stanford.edu/pubs/slacreports/reports02/slac-r-121.pdf>:
  synchrotron oscillations, radiation damping and the damping partition.
* R. E. Meller, A. W. Chao, J. M. Peterson, S. G. Peggs and M. Furman,
  "Decoherence of kicked beams", SSC Central Design Group, SSC-N-360 (1987):
  the chromatic and amplitude-detuning decoherence of a kicked Gaussian beam,
  the formulas this instrument plays.
* R. E. Shafer, "Beam position monitoring", *AIP Conference Proceedings* 212,
  26 (1990), <https://doi.org/10.1063/1.39710>: button and stripline pickups.

**Sonification of accelerators and detectors**

* J. Cherston, E. Hill, S. Goldfarb and J. A. Paradiso, "Musician and
  Mega-Machine: Compositions Driven by Real-Time Particle Collision Data from
  the ATLAS Detector", NIME 2016, <https://nime.org/proc/cherston2016>
  (Quantizer): live ATLAS collision data mapped to music.
