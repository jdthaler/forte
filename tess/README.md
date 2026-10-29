# TESS

Every key is a planet crossing its star, heard as NASA's Transiting
Exoplanet Survey Satellite (TESS) sees it: as the star's light. Once every
orbit the planet passes in front of its star and blocks a little of it, a
dip in the light curve, and TESS finds planets by watching hundreds of
thousands of stars for those dips. Here the light is played as sound, sped
up until the planet's year is the key's note: at the default speed-up of 38
million, a planet whose year is a day plays A4, one with a 16-day year plays
A0, and each dip is one cycle of the waveform. The shape of the dip is the
timbre. A planet far from its star crosses it in a small share of its year,
a short sharp pulse with many harmonics, so the low keys buzz; one close in
spends a large share of its year in front, and the top keys are round. The
star's darker rim rounds each dip's corners, a planet whose path crosses
near the star's edge makes shorter, shallower, V-shaped dips, and a faint
star's photons arrive few enough to hiss.

The presets are real planets TESS found, each with its own year on A4: π
Mensae c, its first; LHS 3844 b, a hot rock round a red dwarf; TOI-700 d, an
Earth-sized planet in its star's habitable zone; and WD 1856+534 b, a giant
planet round a white dwarf seven times smaller than it.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/tess/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 planets, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how bright the star is |
| `Space` | sustain: TESS keeps watching after the keys come up |
| MIDI | notes, velocity (the star's brightness), sustain pedal (CC64); the mod wheel (CC1) moves the planets' path from the star's centre to its edge and off it |

## The physics

### 1. A transit

A planet of radius R_p crossing a star of radius R★ hides a disc of radius
k = R_p / R★ in units of the star's. With its centre a distance z from the
star's (in stellar radii), it blocks the light from where the two discs
overlap. A uniform star would lose the lens-shaped overlap's area over π,
about k² when the planet is wholly in front: a hot Jupiter (k ≈ 0.1) dims a
Sun-like star by 1 %, the Earth (k = 0.0092) by 84 parts in a million.

Stars are not uniform. Looking at the rim of the disc we see into higher,
cooler layers, so the rim is darker than the centre (limb darkening). With
μ the cosine of the angle between the line of sight and the star's surface,
μ = √(1 − r²) at a distance r from the centre,

  I(μ) / I(1) = 1 − u₁ (1 − μ) − u₂ (1 − μ)²

and the whole disc gives π (1 − u₁/3 − u₂/6). The model integrates the
intensity over the overlap ring by ring: the ring at r has an arc of
2 r arccos((r² + z² − k²) / 2rz) inside the planet's disc, and the share
of light blocked is

  δ(z) = ∫ I(r) · 2 r arccos((r² + z² − k²) / 2rz) dr / π (1 − u₁/3 − u₂/6)

over the rings the planet touches (a whole ring, 2πr I(r), where it covers
the star's centre). Mandel & Agol (2002) give this in closed form with
elliptic integrals; the numerical integral, tabulated over z for the voices,
agrees with their uniform-star lens area to a part in 10⁴ (the tests check
it, and the small-planet limit k² I(z) / (1 − u₁/3 − u₂/6)).

The coefficients u₁ and u₂ for TESS's band (600–1000 nm) come from Claret
(2017)'s PHOENIX models, as Patel & Espinoza (2022) tabulate them for four
host stars from 3216 K to 6230 K; the Temperature control interpolates
between them. A cool red dwarf (u₁ = 0.12, u₂ = 0.53) is much darker at its
rim than the Sun (0.34, 0.24), so its dips are rounder.

### 2. The orbit

Every key's planet is on a circular orbit of period P, and Kepler's third
law, with the star's mass M★ (the planet's neglected), gives its radius:

  a³ = G M★ P² / 4π²

A one-year planet round the Sun is at 1 au, 215 solar radii; a one-day one
at 4.2. Seen from the Earth the orbit is nearly edge-on, tilted by an
inclination i, and the planet's path crosses the star's disc at an impact
parameter b = (a / R★) cos i from its centre. With θ = 2π t / P the orbital
angle from mid-transit, the planet's centre is

  z(θ) = (a / R★) √(sin² θ + cos² i cos² θ)

from the star's (in front only while cos θ > 0). The transit lasts from first
to last contact, where z = 1 + k (Seager & Mallén-Ornelas 2003; Winn 2010):

  T₁₄ = (P / π) arcsin( √((1 + k)² − b²) / ((a / R★) sin i) )

so a planet twice as far from the same star spends half the share of its
year in front. The impact parameter control is b as a share of the grazing
one, 1 + k: at 0 the planet crosses the centre, at 1 it only touches the
rim, and past 1 it misses. The presets' orbits come out where their
discoverers measured them: a/R★ = 13.4 for π Mensae c, 7.11 for LHS 3844 b,
84 for TOI-700 d.

A key whose year would put its planet inside its star (a/R★ < 1 + k; the
top keys round a large star) keeps it just touching the surface.

### 3. The sound

The speed-up S is the A4 planet's year times 440 Hz, the same for every
key. A key of frequency f is a planet of year P = S / f: one cycle of the
note is one orbit, and the waveform is the star's light, 1 − δ(z(θ)), the
light falling in each transit (the steady part, the light's mean, is no
sound). The keyboard's tuning moves the note, and so the year, with it.

The light curve is periodic and even about mid-transit, so it is a cosine
series:

  δ(θ) = c₀ + 2 Σ cₙ cos nθ,        cₙ = (1/π) ∫₀^θ₁₄ δ(θ) cos nθ dθ

over the half of the transit after its middle. The engine computes cₙ up
to 20 kHz (727 harmonics on A0, 4 on C8), builds one year of the
band-limited light curve from them with an inverse FFT, and reads it at the
note's frequency. A short dip in a long year has harmonics of nearly equal
strength up to about 1/T₁₄ (a buzz); a long dip in a short year, only the
first few (a round tone). The darker rim and a grazing path round off the
corners, which takes the highest harmonics away.

At full level a dip as deep as the Full scale control plays 0.2; the control
is the light curve's vertical zoom, so a small planet can be brought up to be
heard, and its noise comes up with it.

### 4. The light TESS collects

TESS's four cameras, each 10.5 cm across behind a red filter, collect
1.514 × 10⁶ photons per second per square centimetre from a star of TESS
magnitude T = 0, through an effective area of 69 cm² (Sullivan et al.
2015): about 10⁴ photons a second from T = 10. Counting photons is a
Poisson process, so over a time t the light's relative noise is

  σ² = (Γ + B) / Γ² t + σ_floor² (1 hour / t)

with Γ the star's photon rate. B is the background in the star's aperture
(taken as 3 × 3 pixels): the read noise, 10 e⁻ a pixel in each 2 s
frame, and the zodiacal light, 180 e⁻ a pixel a frame (95–270 by ecliptic
latitude). σ_floor is the 60 ppm in an hour TESS was designed to reach on the
brightest stars, everything else together. A sample of sound covers S / 48000
seconds of the star's light (790 s at the default speed-up), so each voice
adds white noise of that σ to its light curve. For the Sun-like default
(T = 9) that is about 190 ppm a sample.

Velocity is the star's brightness: a harder key is a star with more light
(Γ ∝ velocity, the magnitude 2.5 log₁₀ of it brighter), its dips louder in
proportion and its photon noise only as the square root, so a hard note
stands clearer of the hiss. Where the background or the floor dominates,
the hiss stays and the dips grow out of it.

The light-curve view shows what TESS would record of the focus key's planet
in one 27.4-day sector: two-minute points with this noise, folded on the
planet's year, and the signal-to-noise of the folded transit,
√(Σ δ²) / σ over the points in transit. TESS's pipeline flags a candidate
at 7.1; the view asks for 7.3.

### 5. Playing

A key starts its planet just before ingress, so the first dip is the
attack, and a let-go key's planet finishes the dip it is in and stops while
the light is steady, which neither clicks. (A top key, whose planet spends
nearly all its year crossing the star, has no steady stretch; it fades in
over 5 ms and out over 10 ms.) A change to any parameter rebuilds the
voices' light curves one a block (2.7 ms), each crossfaded over its block,
so the mod wheel sweeps the path smoothly. Each key's star sits in its own
place in the stereo field, low keys to the left.

## What to listen for

- **Low keys buzz, high keys are round**: the share of its year a planet
  spends crossing its star.
- **The mod wheel**: the path moves toward the star's edge, and each note
  gets quieter and thinner until the planet misses and only the hiss is
  left.
- **Earth, Neptune, Jupiter**: change the planet's radius; the note grows
  as its area.
- **A red dwarf**: the same planet round a small cool star is far louder
  (the star is small) and rounder (its rim is dark).
- **Velocity and the hiss**: soft notes are faint stars, their dips buried
  in photon noise; hard ones stand out of it. Turn the TESS magnitude up
  past 13 and only a big planet is left audible.
- **Fifths**: keys a fifth apart are years in the ratio 3 : 2, the
  resonance that holds planets in chains like TOI-178's (Leleu et al. 2021).

## Files

```
tess/index.html, style.css                page
tess/src/tess-params.js                   parameters and presets
tess/src/tess-instrument.js               the descriptor: everything but the page
tess/src/tess-main.js                     page wiring and views
tess/src/tess-wasm.js                     the engine and model, the C++ as WebAssembly (tess/wasm/tess.wasm)
native/instruments/tess/                  the physics in C++: model, engine, reference (plugins and WebAssembly)
test/tess-tests.mjs                       node test/tess-tests.mjs (20 tests, about 10 s)
tools/render-tess.mjs                     node tools/render-tess.mjs → examples/tess/
```

## Simplifications

* **Circular orbits**, with the planet's mass left out of Kepler's law, and
  no transit-timing variations: every key's planet keeps exact time.
* **The planet is dark.** Its own light (the reflected and thermal phase
  curve, and the secondary eclipse when it goes behind the star) and the
  star's own variability (spots, flares, oscillations) are left out; for a
  hot Jupiter they are a few hundred ppm at most.
* **Four tabulated stars** set the limb darkening; the Temperature control
  interpolates between them and holds the ends. A white dwarf's atmosphere
  is not a main-sequence star's, so WD 1856's dips use a 4710 K dwarf's
  coefficients.
* **The noise** is white, with a fixed 3 × 3-pixel aperture, a mid-sky
  zodiacal light and the 60 ppm floor as white noise too; real light curves
  have red noise from the spacecraft's pointing and the star itself, and
  very bright stars (T < 6.8) saturate TESS's pixels. The cadence (20 s,
  2 min, 10 or 30 min) and its smoothing of the dips are not modelled: at
  the default speed-up a two-minute cadence is 3 μs of sound.
* **No data gaps**: the sector's mid-orbit downlink gap and the end of a
  sector are not heard; a key watches as long as it is held.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims what plays
at once: 24 planets at Medium and 12 at Low, against 48 at High (the oldest
ending at its next steady stretch), and the light curve's harmonics, cut at 12
kHz at Medium and 8 kHz at Low instead of 20 kHz. Notes on the top half of the
keyboard sound the same at every setting.

## Prior art and references

**The mission.**
* G. R. Ricker et al., "Transiting Exoplanet Survey Satellite (TESS)",
  *J. Astron. Telesc. Instrum. Syst.* 1, 014003 (2015),
  [doi:10.1117/1.JATIS.1.1.014003](https://doi.org/10.1117/1.JATIS.1.1.014003):
  the mission, its cameras and its survey, led by George Ricker at MIT.
* P. W. Sullivan et al., "The Transiting Exoplanet Survey Satellite:
  Simulations of Planet Detections and Astrophysical False Positives",
  *ApJ* 809, 77 (2015),
  [doi:10.1088/0004-637X/809/1/77](https://doi.org/10.1088/0004-637X/809/1/77):
  the photon flux, collecting area, read noise, zodiacal light and noise
  floor used here.

**The physics of a transit.**
* D. Charbonneau, T. M. Brown, D. W. Latham & M. Mayor, *ApJ* 529, L45
  (2000), and G. W. Henry, G. W. Marcy, R. P. Butler & S. S. Vogt, *ApJ*
  529, L41 (2000): the first transits of an exoplanet, HD 209458 b.
* K. Mandel & E. Agol, "Analytic Light Curves for Planetary Transit
  Searches", *ApJ* 580, L171 (2002),
  [doi:10.1086/345520](https://doi.org/10.1086/345520): the light curve with
  quadratic limb darkening in closed form.
* S. Seager & G. Mallén-Ornelas, "A Unique Solution of Planet and Star
  Parameters from an Extrasolar Planet Transit Light Curve", *ApJ* 585, 1038
  (2003), [doi:10.1086/346105](https://doi.org/10.1086/346105), and J. N.
  Winn, "Transits and Occultations", in *Exoplanets*, ed. S. Seager (Univ.
  of Arizona Press, 2010), [arXiv:1001.2010](https://arxiv.org/abs/1001.2010):
  the transit's geometry and durations.
* A. Claret, "Limb and gravity-darkening coefficients for the TESS
  satellite at several metallicities, surface gravities, and
  microturbulent velocities", *A&A* 600, A30 (2017),
  [doi:10.1051/0004-6361/201629705](https://doi.org/10.1051/0004-6361/201629705),
  as tabulated by P. Patel & N. Espinoza, "Empirical limb-darkening
  coefficients & transit parameters of known exoplanets from TESS", *AJ*
  163, 228 (2022), [arXiv:2203.05661](https://arxiv.org/abs/2203.05661).

**The planets in the presets** (parameters from the NASA Exoplanet Archive's
solutions for each paper).
* C. X. Huang et al., "TESS Discovery of a Transiting Super-Earth in the π
  Mensae System", *ApJL* 868, L39 (2018),
  [arXiv:1809.05967](https://arxiv.org/abs/1809.05967).
* R. Vanderspek et al., "TESS Discovery of an Ultra-short-period Planet
  around the Nearby M Dwarf LHS 3844", *ApJL* 871, L24 (2019).
* E. A. Gilbert et al., "The First Habitable-zone Earth-sized Planet from
  TESS. I. Validation of the TOI-700 System", *AJ* 160, 116 (2020).
* A. Vanderburg et al., "A giant planet candidate transiting a white dwarf",
  *Nature* 585, 363 (2020), [arXiv:2009.07282](https://arxiv.org/abs/2009.07282).
* A. Leleu et al., "Six transiting planets and a chain of Laplace
  resonances in TOI-178", *A&A* 649, A26 (2021).

**Planets as music.**
* [SYSTEM Sounds](https://gizmodo.com/make-your-own-space-jams-with-the-sounds-of-the-trappis-1797717176)
  (Matt Russo, Dan Tamayo and others, 2017): TRAPPIST-1's planets sped up
  until their orbits are notes, a piano note each orbit.
* ESA's [TOI-178 animation](https://cheops.unige.ch/posts/artists-animation-of-the-toi-178-orbits-and-resonances-sound-on)
  (CHEOPS, 2021): each planet of the resonant chain a note of a pentatonic
  scale, played at each orbit and half orbit.
* Here the waveform is the light curve itself, rather than a note struck once
  an orbit.
