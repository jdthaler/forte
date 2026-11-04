# Pulsars

Spinning neutron stars as a keyboard. A pulsar is the collapsed core of a
massive star, as heavy as the Sun and the size of a city, whose magnetic
field beams radio out along its poles. As the star turns, a beam sweeps
past the Earth once a turn, and a radio telescope sees a **pulse** every
turn, as steady as an atomic clock. Most pulsars turn about once a second,
but the **millisecond pulsars**, spun up by a companion star, turn hundreds
of times a second: their pulses are a tone. Every key here is a pulsar
spinning at the note, and the sound is what radio astronomers have long
played through a loudspeaker: the telescope's power, pulse after pulse.
Nothing is sampled. The pulse's shape comes from the beam's geometry (how
far the magnetic axis tilts, where our sightline cuts the beam, how high
up the radio comes from), and on its way here the Galaxy's plasma **delays
and smears** each pulse: low radio frequencies arrive last, as in the
Whistlers next door, and turbulence gives every pulse a scattered tail. The
telescope can take some of that out again (a filterbank, or coherent
dedispersion) and you hear the difference.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/pulsars/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): switch on the pulsar spinning at that key |
| `←` `→` | octave |
| `↑` `↓` | velocity: how bright the pulsar is |
| `Space` | latch the keys down: the pulsars keep spinning after the keys come up |
| MIDI | notes, velocity, hold (CC64), **mod wheel = dispersion measure** (from the DM set up to 400 pc/cm³); MPE: **slide (CC74) = each pulsar's own DM** |

## The physics

**The beam.** A pulsar's radio comes from its open magnetic field lines,
the ones that reach out past the **light cylinder**, R_LC = c / 2πf, where
anything turning with the star would have to move at the speed of light.
In a dipole field the last open line at a height r leaves the axis at
sin²θ = r / R_LC, and the field there points at

  ρ = θ + atan(½ tan θ)

from the magnetic axis (3θ/2 for a narrow beam): the beam's radius. The
emission height is a parameter (200 km at the default, which with Rankin's
measured cone of 5.75° P^−½ at 1 GHz is about where slow pulsars beam
from), capped at 30 % of the light cylinder. At the bottom of the keyboard
(A0, 27.5 Hz) the light cylinder is 1735 km out and the beam is 30° wide;
from about D2 up the cap holds, and every beam is 51° wide. That is why
millisecond pulsars have wide pulses, a third of a turn or more, while the
slow ones' are a few percent.

Across its radius, x = Θ/ρ, the beam is a Gaussian **core** on the axis
(σ = 0.18 ρ, from Rankin's core width of 2.45° P^−½) and a hollow **cone**
peaking at 0.9 ρ (σ = 0.1 ρ), mixed by *Core emission*.

**The sightline.** The magnetic axis is tilted by α (*Magnetic
inclination*) from the spin axis, and our line of sight by ζ = α + β, β the
*Sightline* times ρ. As the star turns by φ, the angle between the
sightline and the magnetic axis is

  cos Θ = cos α cos ζ + sin α sin ζ cos φ

(the rotating vector model, Radhakrishnan & Cooke 1969), and the pulse is
the beam's brightness at Θ, plus the other pole's at π − Θ. A sightline
through the middle of the beam crosses cone, core, cone: a **triple pulse**.
One that grazes the edge crosses the cone once: a single narrow pulse.
With α near 90° the other pole sweeps past half a turn later: an
**interpulse**, and with two equal pulses a turn the odd harmonics cancel
and the note sounds an octave up. With α near 0 the beam hardly moves
across the sky and the pulses fade into a steady glow.

**Dispersion.** The free electrons along the way slow radio waves by an
amount that depends on frequency. A pulse at f MHz arrives

  t = K_DM · DM / f²,   K_DM = 4.148808 × 10³ s MHz² cm³ pc⁻¹

later than it would at infinite frequency, DM (the *Dispersion measure*,
in pc cm⁻³) counting the electrons in a column to the pulsar: a few for a
neighbour, hundreds across the Galaxy. It is the same cold plasma as the
Whistlers', but at radio frequencies far above its plasma frequency, so the
delay is this simple law.

**Scattering.** The plasma is turbulent, so the radio reaches us along many
slightly different paths and each pulse gets a one-sided exponential tail,
e^(−t/τ_s). τ_s is Bhat et al.'s fit to 371 measurements:

  log τ_s(ms) = −6.46 + 0.154 log DM + 1.07 (log DM)² − 3.86 log f(GHz)

times *Scattering*, since real pulsars scatter ten times more or less than
this. At DM 20 and 1.4 GHz it is nanoseconds; at DM 400 and 1.4 GHz,
milliseconds; at 150 MHz everything is a hundred thousand times longer.

**The telescope.** The receiver takes in a band of frequencies (*Observing
frequency* ± half the *Bandwidth*). Its upper half is the left channel and
its lower half the right. What it does with the band's delays is
*Dedispersion*:

* **None**: the total power of the band as it arrives. Each pulse is smeared
  over the band's spread of delays, K_DM DM (f_lo⁻² − f_hi⁻²), and the lower
  half arrives later than the upper. A pulse smeared over a whole turn
  is gone: only its average is left.
* **Filterbank**: the band is cut into channels, and each one's delay is taken
  out. Inside a channel Δf wide the delay still spreads by
  8.3 µs × DM × Δf(MHz) / f(GHz)³.
* **Coherent**: the plasma's effect on the radio wave's phase is undone exactly
  (Hankins & Rickett 1975). Nothing of the dispersion is left.

Scattering stays either way. Each half of the band is summed in pieces (as
many channels as the filterbank has, up to 16 representative ones a half;
for no dedispersion, enough pieces that the delay is nearly straight across
each), and every harmonic n of the spin f is multiplied by the band's
response at ω = 2πnf:

  H(ω) = ⟨ e^(−iωt) · sinc(ω Δt / 2) / (1 + iωτ_s) ⟩

over the pieces: each piece's delay t, the spread Δt across it (a boxcar),
and the scattering tail.

**Switching on and off.** Pressing a key switches its pulsar on (as nulling
pulsars do): undedispersed, the first pulse comes in at the top of the band
and sweeps down it, so a new note starts on the left and fills in on the
right, over the band's spread of delays. Letting go switches it off the
same way. Each half of the band rises and falls with its scattering time,
and never faster than 1.5 ms, so nothing clicks.

**Single pulses.** Each pulse is brighter or fainter than the average,
log-normally, with a spread over its mean of *Pulse-to-pulse jitter* (the
modulation index), cut at five times the mean. A smeared pulse is an
average of several, so the jitter falls as √(P / (P + smear)). The output is
the power less its long-run mean (the receiver's baseline), so a bright
pulse rises above it and a faint one leaves a dip.

**The sound.** One turn of each half of the band is computed into a table
(4096 samples a turn) from the profile's harmonics, cut at 20 kHz, and read
at the spin. The level is set so that a sightline through the beam's middle
plays at the same loudness on every key; other cuts are as much louder or
quieter as their pulses make them. When a knob that shapes the pulses moves
(the mod wheel's DM above all), each sounding pulsar's table is rebuilt in
turn, one every 512 samples, and crossfaded in.

**The fastest stars.** The fastest pulsar known, PSR J1748−2446ad in the
globular cluster Terzan 5, turns 716 times a second, about F5 plus 43 cents.
A neutron star of 1.4 Suns and 12 km would shed mass from its equator at
about 1045 (M/M☉)^½ (R / 10 km)^−3/2 = 940 turns a second (Lattimer &
Prakash 2004), near B♭5. So the keys above F5 are faster than any pulsar
found, and those above B♭5 faster than a star can turn; at B7 and C8 the
light cylinder would be inside the star. The same design carries on to C8. Some
real pulsars on the keyboard: the Crab (29.6 Hz, A♯0), the double pulsar's
PSR J0737−3039A (44 Hz, F1), PSR J0437−4715 (174 Hz, F3), PSR B1937+21
(642 Hz, just under E5).

## What to listen for

* **The beam's shape.** *Emission height* down to 30 km: short pulses, a
  buzzy, brassy tone; up to 1000 km: long pulses, a mellow one. The high
  keys stay mellow whatever you do: their light cylinders are only tens of
  kilometres out.
* **Where we sit.** *Sightline* from 0 (a triple pulse: a nasal, vowel-like
  tone from the gaps between its three humps) to 0.9 (one narrow pulse) and
  past 1 (the beam's faint edge).
* **The interpulse.** *Magnetic inclination* toward 90° at a small
  sightline: the note slides up to its octave as the other pole's pulse
  grows to match the main one.
* **Dispersion.** *Dedispersion* to None and the mod wheel up: the top of
  the tone goes first, then the note itself, high keys before low ones,
  with notches sweeping through the harmonics where the smear is a whole
  number of turns. With headphones a new note starts on the left. A
  filterbank brings it back; coherent dedispersion brings back all of it.
* **Scattering.** The LOFAR preset (150 MHz): the high keys lose their top,
  however you dedisperse; move the frequency up and they sharpen.
* **Single pulses.** *Pulse-to-pulse jitter* up: a rough, crackling tone.

Demos in `examples/pulsars/`.

## Files

```
pulsars/index.html, style.css            page
pulsars/src/pulsars-params.js            parameters and presets
pulsars/src/pulsars-instrument.js        the descriptor: everything but the page
pulsars/src/pulsars-main.js              page wiring and views
pulsars/src/pulsars-tour.js              the guided tour
pulsars/src/pulsars-wasm.js              the engine and model, the C++ as WebAssembly (pulsars/wasm/pulsars.wasm)
native/instruments/pulsars/              the physics in C++: model, engine, reference (plugins and WebAssembly)
test/pulsars-tests.mjs                   node test/pulsars-tests.mjs
tools/render-pulsars.mjs                 node tools/render-pulsars.mjs → examples/pulsars/
```

## Simplifications

* **Too fast.** Most of the keyboard is faster than the millisecond pulsars
  that exist (see above); the model doesn't care.
* **The beam** is a core and one cone with fixed proportions; real pulsars
  have inner and outer cones, patchy beams, and profiles that change with
  frequency (radius-to-frequency mapping). Both halves of the band see the
  same beam here.
* **The emission height cap** at 30 % of the light cylinder is our choice;
  millisecond pulsars' emission heights are poorly known.
* **Aberration and retardation**, which shift the profile's parts at heights
  that are a fair share of the light cylinder, are left out, and so are
  the polarisation and its swing.
* **The pulsar's spectrum** is flat across the band; real ones fall
  steeply with frequency, so the lower half would be brighter.
* **The jitter** is the same across the band and shaped as one log-normal
  amplitude per pulse; no drifting subpulses, nulls or giant pulses. Its
  smoothing by the smear is an estimate.
* **Switching on** scales the whole band's smeared pulse by the share of the
  band that has arrived, rather than smearing over that share alone.
* **No noise.** A real telescope hears a pulsar under the receiver's and the
  sky's noise, often far under it.
* Spin-down, glitches and binary orbits change the pitch by far less than a
  cent over a note, so they are left out.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims what each
pulsar's table holds and how many play: 16 pulsars at Medium and 8 at Low,
against 32 at High (the oldest let-go one fading first); a turn's table of
2048 samples at Medium and 1024 at Low, against 4096, so the lowest keys keep
fewer harmonics; harmonics up to 16 kHz at Medium and 12 kHz at Low, against
20 kHz; and an undedispersed band summed in up to 96 and 32 pieces, against
256. A single pulsar in the middle of the keyboard sounds the same at every
setting.

## Prior art and references

**The pulsars**

* A. Hewish, S. J. Bell, J. D. H. Pilkington, P. F. Scott and R. A. Collins,
  "Observation of a rapidly pulsating radio source", *Nature* 217, 709–713
  (1968), [doi:10.1038/217709a0](https://doi.org/10.1038/217709a0).
* D. C. Backer, S. R. Kulkarni, C. Heiles, M. M. Davis and W. M. Goss, "A
  millisecond pulsar", *Nature* 300, 615–618 (1982),
  [doi:10.1038/300615a0](https://doi.org/10.1038/300615a0): PSR B1937+21.
* J. W. T. Hessels et al., "A radio pulsar spinning at 716 Hz", *Science*
  311, 1901–1904 (2006),
  [arXiv:astro-ph/0601337](https://arxiv.org/abs/astro-ph/0601337):
  PSR J1748−2446ad.

**The physics**

* V. Radhakrishnan and D. J. Cooke, "Magnetic poles and the polarization
  structure of pulsar radiation", *Astrophysical Letters* 3, 225–229
  (1969): the rotating vector model.
* J. M. Rankin, "Toward an empirical theory of pulsar emission. I.
  Morphological taxonomy", *ApJ* 274, 333 (1983); "IV. Geometry of the
  core emission region", *ApJ* 352, 247 (1990); "VI. The geometry of the
  conal emission region", *ApJ* 405, 285 (1993): the core and cones,
  and their sizes.
* D. R. Lorimer and M. Kramer, *Handbook of Pulsar Astronomy* (Cambridge
  University Press, 2005): the dispersion constant, smearing in a channel,
  and dedispersion.
* N. D. R. Bhat, J. M. Cordes, F. Camilo, D. J. Nice and D. R. Lorimer,
  "Multifrequency observations of radio pulse broadening and constraints on
  interstellar electron density microstructure", *ApJ* 605, 759–783 (2004),
  [arXiv:astro-ph/0401067](https://arxiv.org/abs/astro-ph/0401067): the
  scattering time against DM and frequency.
* T. H. Hankins and B. J. Rickett, "Pulsar signal processing", *Methods in
  Computational Physics* 14, 55 (1975): coherent dedispersion.
* J. M. Lattimer and M. Prakash, "The physics of neutron stars", *Science*
  304, 536–542 (2004),
  [arXiv:astro-ph/0405262](https://arxiv.org/abs/astro-ph/0405262): the
  fastest a neutron star can spin.

**Earlier sounds and music**

* [The Sounds of Pulsars](https://www.jb.man.ac.uk/research/pulsar/Education/Sounds/sounds.html)
  (Jodrell Bank Centre for Astrophysics): recordings from the Lovell and
  Parkes telescopes, the radio's intensity played as sound, and simulated
  millisecond pulsars.
* Gérard Grisey, *Le Noir de l'Étoile* (first performed 1991), for six
  percussionists, tape and the Vela pulsar and PSR B0329+54, the latter
  received live from the Nançay radio telescope.
