# Star Keyboard

Every key is a star. Sun-like stars ring all the time: the turbulent
convection just below their surfaces kicks their acoustic modes at random,
and each mode, damped within days, is kicked again before it dies. So a
star does not sound like a struck bell but like a comb of pure tones that
breathe, each swelling and fading on its own. This keyboard plays them
sped up a fixed 510,800 times. The keys follow one star through its life:
young dwarfs like the Sun on the top keys, subgiants in the middle, and
red giants down the keyboard, whose dipole modes mix with gravity waves in
their cores. The Sun itself is G6. Hold a key and the convection drives
the star; let go and every mode rings down at its own linewidth. You can
spin the stars up, tilt them toward you, thin or thicken their
linewidths, strike them with a flare, and swap in δ Scuti stars, which
drive a few modes themselves and hold them steady. It is a companion to
the [Black-Hole Keyboard](../blackhole/README.md): astrophysics played at
audio rates, with the mapping stated.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/stars/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61 stars, C2–C7) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the convection drives the star, and the size of the flare |
| `Space` | sustain: the convection stays on after the keys come up |
| MIDI | notes, velocity, sustain pedal (CC64), aftertouch (the convection drives harder, up to twice the amplitude); the mod wheel (CC1) spins the stars up |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: the convection drives harder |

## The physics

### 1. Stars that ring by themselves

The Sun's surface heaves up and down with periods of about five minutes
(Leighton, Noyes & Simon 1962). Ulrich (1970) and Leibacher & Stein
(1971) explained them as sound waves trapped inside the Sun, and in light integrated over the whole disc
the low-degree modes show up as a comb of equally spaced peaks (Claverie
et al. 1979; Grec, Fossat & Pomerantz 1980). Each is a standing acoustic
wave of radial order n and spherical-harmonic degree l and order m. Nothing
strikes them. The convection near the surface drives every mode at random
and also damps it (Goldreich & Keeley 1977), so each mode is a damped
oscillator kicked by noise:

  ẍ + 2ηẋ + ω₀²x = f(t),        η = πΓ

with f(t) white noise. Its power spectrum is a Lorentzian of full width Γ
at half maximum (the shape fitted to solar spectra, e.g. Anderson, Duvall
& Jefferies 1990); its amplitude wanders on the timescale 1/η, the mode's
lifetime. For the Sun near the middle of its comb Γ is about 1 μHz, a
lifetime of 3.7 days. That is the sound here: every mode an oscillator,
kicked by noise for as long as a key is down.

### 2. The scaling relations

Two numbers set a solar-like star's comb. The large separation Δν, the
spacing of modes of the same degree, is the inverse of the sound's round
trip through the star and scales with its mean density (Ulrich 1986;
Kjeldsen & Bedding 1995). The modes are strongest around ν_max, which
follows the acoustic cut-off frequency and so the surface gravity and
temperature (Brown et al. 1991; Kjeldsen & Bedding 1995). With the Sun's
values of Huber et al. (2011):

  Δν = 135.1 μHz · √(M/R³),        ν_max = 3090 μHz · (M/R²)(T_eff/5777 K)^(−½)

in solar units. Mode power is spread under a Gaussian envelope about
ν_max of full width at half maximum

  δν_env = 0.66 ν_max^0.88  (μHz)

the scaling Mosser et al. (2012a) measured in Kepler red giants, used here
for every star: 777 μHz for the Sun, 48 μHz for the red giant on C2.

### 3. One speed-up

μHz become Hz by one factor for every key:

  f_sound = K · ν_star,        K = 510,800

chosen so that the Sun's heard pitch (section 9) lands on G6 (1568 Hz).
Kosovichev's solar sounds used 42,000, the ESO recording of the giant
ξ Hya 10⁶. A day of the star's life passes in 0.17 s. The Sun's Δν
becomes 69 Hz, its 1 μHz linewidth 0.51 Hz, a lifetime of 0.62 s: the
breathing you hear. **Speed-up K** (350,000 to 1,000,000) changes it: a
larger K puts an older, larger star on every key, whose modes ring for
fewer seconds.

### 4. The keyboard is an evolutionary track

ν_max falls by less than two octaves along the whole main sequence, so a
keyboard of dwarfs alone would be short. Instead each key is the same star
at a different age. The path through the stars, one coordinate s:

- **Zero-age main sequence**, from the analytic fits of Tout, Pols,
  Eggleton & Han (1996) at Z = 0.02 (1 M☉: 0.698 L☉, 0.888 R☉, 5602 K).
- **Main sequence**, R from R_ZAMS to 1.52 R_ZAMS (1.52 + 0.35(M − 1) for
  other masses): T_eff = T_ZAMS + ΔT(1 − e^(−s/0.09)), with s = ln(R/R_ZAMS)
  and ΔT = 239 K for 1 M☉, so that the track passes through the Sun
  (R = 1, 5777 K), and 1900 K less per solar mass above (heavier stars cool
  on the main sequence). The model's choice of shape.
- **Subgiants**: T_eff ∝ R^(−b) from the end of the main sequence, b = 0.26
  for 1 M☉ (low-mass subgiants brighten as they grow) up to 0.5 (constant
  luminosity) by 1.6 M☉. The model's choice.
- **Red giants**: the Hayashi line of a convective envelope under H⁻
  opacity, T_eff ∝ M^(7/51) L^(1/102) (after Hayashi 1961), here 4800 K for
  1 M☉ at 10 L☉. The real branch cools slowly as a star climbs it, where
  this limit warms by about 1 % over this keyboard's stretch; an error of
  150 K in T_eff moves Δν by about 1 %.

The branches join smoothly. R then follows from the key: each key's star
is the one on the path whose pitch lands on the note (section 9), and Δν
follows from M/R³. Above the track's own zero-age main sequence the path
continues down the zero-age main sequence to lighter dwarfs, so the top
keys play younger, cooler K-type stars rather than nothing. Linewidths
follow T_eff: a power law over a lower bound, the form Appourchaux et al.
(2012) fitted to Kepler dwarfs and subgiants (they found an index of about
13 for the linewidth at maximum mode height), with the model's numbers,

  Γ = 0.05 μHz + 0.95 μHz · (T_eff/5777 K)^13

1.0 μHz for the Sun, 3.6 μHz at 6400 K, 0.13 μHz on the red-giant branch
(red giants' radial modes are about 0.1 μHz wide), and held at its 6600 K
value above that, where the relation stops and stars hardly oscillate this
way. Along the 1 M☉ track:

| key | star | M (M☉) | R (R☉) | T_eff (K) | L (L☉) | ν_max (μHz) | Δν (μHz) | Δν·K (Hz) | Γ (μHz) | lifetime | modes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C2 | red giant | 1.00 | 5.11 | 4811 | 12.5 | 130 | 11.7 | 6.0 | 0.14 | 4.5 s | 340 |
| C3 | red giant | 1.00 | 3.62 | 4777 | 6.1 | 259 | 19.6 | 10.0 | 0.13 | 4.8 s | 316 |
| C4 | subgiant | 1.00 | 2.54 | 4955 | 3.5 | 517 | 33.4 | 17.1 | 0.18 | 3.5 s | 230 |
| C5 | subgiant | 1.00 | 1.75 | 5454 | 2.5 | 1033 | 58.1 | 29.7 | 0.50 | 1.3 s | 216 |
| C6 | dwarf | 1.00 | 1.22 | 5834 | 1.6 | 2064 | 100.2 | 51.2 | 1.13 | 0.55 s | 215 |
| G6 | the Sun | 1.00 | 1.00 | 5777 | 1.0 | 3090 | 135.1 | 69.0 | 1.00 | 0.62 s | 225 |
| C7 | dwarf | 0.98 | 0.87 | 5515 | 0.6 | 4123 | 165.8 | 84.7 | 0.57 | 1.1 s | 248 |

"Lifetime" is 1/(πΓK), the radial modes' in the sound; "modes" counts the
m components played. A **heavier track** (Mass, 0.9–1.8 M☉) puts a slightly
denser comb on every key (Δν ∝ M^(−¼) at fixed ν_max: 10.8 μHz instead of
11.7 on C2 at 1.5 M☉), and its upper keys are hot F-type dwarfs with broad,
short-lived modes (6900 K and 5.4 μHz on C6).

### 5. The pattern of modes

The frequencies follow the asymptotic relation to second order (Tassoul
1980) with a curvature about ν_max, in the form of Mosser et al.'s
universal red-giant pattern (2011, 2013):

  ν_nl = Δν [n + l/2 + ε − l(l+1)D + (α/2)(n − n_max)²],        n_max = ν_max/Δν − ε

The second-order term gives the small separations δν_0l = l(l+1)D·Δν:
δν₀₂ = 6DΔν puts each l = 2 mode just below an l = 0 mode, δν₀₁ = δν₀₂/3
pulls the l = 1 modes a little below halfway, and δν₀₃ = 2δν₀₂. The model's
choices of the three parameters (the Sun's are the anchors):

  ε = 1.457 + 0.227 log₁₀(Δν/135.1 μHz),    δν₀₂/Δν = 0.064 (Δν ≥ 100 μHz) … 0.12 (Δν ≤ 15 μHz),    α = 0.015 Δν^(−0.32)

so the Sun's l = 0, n = 21 mode sits at 3034 μHz with δν₀₂ = 8.6 μHz.
Each degree is seen with its own visibility in power, relative to the
radial modes,

  V_l² = 1, 1.5, 0.6, 0.05        (l = 0, 1, 2, 3)

close to what Kepler sees in red giants (V₁² ≈ 1.5, V₂² ≈ 0.6; Mosser et al.
2012a; the visibilities come from limb darkening in the passband, Ballot,
Barban & van 't Veer-Menneret 2011), l = 3 the model's choice. Every
multiplet within four standard deviations of ν_max is computed; those more
than 27 dB below the strongest are left out, and at most 340 m components
are played (the strongest), which a red giant's mixed modes reach.

The **échelle diagram** cuts the spectrum into strips Δν wide and stacks
them. Without curvature every degree lies on a vertical ridge (the tests
check this to 10⁻⁹ Δν); with it the ridges bend.

### 6. Mixed modes in subgiants and red giants

When a star leaves the main sequence its core contracts and gravity waves
in it reach the frequencies of the envelope's sound waves. The dipole
modes become mixed: part p mode, part g mode. Their frequencies follow the
asymptotic condition (Shibahashi 1979), as Mosser et al. (2012b) use it:

  tan θ_p = q tan θ_g,        θ_p = π(ν − ν_p)/Δν,        θ_g = π/(ν ΔΠ₁)

with ν_p the nominal dipole p modes, ΔΠ₁ the period spacing of the dipole
g modes and q the coupling. The engine finds every root by bisection on
J(ν) = θ_g/π − arctan(tan θ_p/q)/π (with the arctangent continued across
its branches), which falls monotonically through an integer at every mode.
Each mode's share of its inertia in the core (Mosser et al. 2015),

  ζ = [1 + (q/N)/(q² cos²θ_p + sin²θ_p)]⁻¹,        N = Δν/(ν² ΔΠ₁)

sets its period spacing to its neighbours, ζΔΠ₁: ΔΠ₁ midway between p
modes, bunched near them, down to ζ_min = [1 + 1/(qN)]⁻¹ (0.54 on C2, where
N = 9.1 g modes share each order). It also sets the mode's linewidth and
power. A heavier mode is driven and damped more slowly, and the p mode's
power is shared among its mixed modes (Dupret et al. 2009: lifetimes go
with inertia, and resolved mixed modes stand as high as radial ones):

  Γ = Γ₀ · max(1 − ζ, 1/30),        power ∝ 1 − ζ,        Σ(1 − ζ) = 1 per order

The floor of 1/30 stands in for the radiative damping that limits the
core-trapped modes higher up the branch (Dupret et al. 2009). So in a red
giant the p-like dipole modes near each nominal p mode carry most of the
power, and the g-dominated ones around them are quiet but ring up to 30
times longer. ΔΠ₁ and q are the model's choices, in the ranges measured in
Kepler red giants (Vrard, Mosser & Samadi 2016: ΔΠ₁ of roughly 60–90 s on the
red-giant branch; Mosser et al. 2017: the coupling strongest at the
transition from subgiants to red giants and weak only high on the branch):

  ΔΠ₁ = 60 s · (Δν/4 μHz)^0.22  (Δν ≤ 20 μHz),  rising as (Δν/20 μHz)^1.3 above;    q = 0.10 … 0.25 (Δν = 8 … 30 μHz)

ramped in over the first stretch beyond the main sequence (dwarfs have no
mixed modes in this band). On C2, ΔΠ₁ = 76 s and q = 0.13; on C4 the
subgiant has ΔΠ₁ = 166 s, q = 0.25 and fewer than one g mode per order, so
its dipole ridge shows the avoided crossings of a bumped mode. The l = 2
and l = 3 modes stay pure p modes. Kepler's discovery of these period
spacings (Beck et al. 2011) and their use to tell hydrogen-shell from
helium-core burning giants (Bedding et al. 2011) are what this models.

### 7. Rotation and inclination

Rotation splits each mode into its 2l + 1 components. To first order
(Ledoux 1951)

  δν_nlm = m (Ω/2π)(1 − C_nl)

with C_nl ≈ 0 for high-order p modes. A mixed dipole mode feels the core
through its inertia there and the envelope through the rest (Goupil et
al. 2013):

  δν = m [ζ (1 − C_g) Ω_core/2π + (1 − ζ) Ω_env/2π],        C_g = 1/(l(l+1)) = ½

**Rotation period** sets Ω_env for every key (the Sun's 25.4 days,
0.46 μHz, by default; from 0.85 d to no rotation at all), and **Core spins
faster by** sets Ω_core/Ω_env (5 by default; Beck et al. 2012 found red
giants' cores turning at least ten times faster than their surfaces, which
turn more slowly than this). At the Sun's rate a p mode's components sit
0.23 Hz apart in the sound: slow beats. Thirty times faster they split into
a chorus. The mod wheel spins the stars up.

How much of each component you see depends on the inclination i of the
rotation axis to your line of sight. The components of a multiplet share
its power as (Gizon & Solanki 2003)

  E_lm(i) = [(l − |m|)!/(l + |m|)!] [P_l^|m|(cos i)]²,        Σ_m E_lm = 1

so each m component is heard with gain √(V_l² E_lm(i)). Pole-on (i = 0) only
the m = 0 components are seen; equator-on (90°) the dipole shows only
m = ±1 and the quadrupole m = 0, ±2. **Inclination** moves this live: the
star is the same, only your view of it changes.

### 8. Driving, damping and the sound

**The convection.** Each m component is an exact two-pole recursion (the
impulse-invariant discretisation of a damped oscillator) at its frequency
and amplitude damping rate η = πΓ. Once a block (128 samples) it is pushed
by a Gaussian random impulse of force: the push changes the mode's velocity,
not its displacement, so the sound stays continuous. The pushes are white
in frequency, so each mode's spectrum is the Lorentzian of its own
damping, and their variance fixes its mean power exactly: for a mode of
mean power p (|C|² of its complex amplitude) and a block of length T,

  σ² = p D² (1 − e^(−2ηT))

with D the drive: **Convective driving** × velocity × aftertouch. The test
fits a Lorentzian to 240 s of one mode and finds the set width within
1 % and the set power within 3 %. The mode powers p follow sections 5 and
6, scaled so that every star has the same mean power: a real red giant's
modes are ten times and more larger than the Sun's (amplitudes grow with
L/M, Kjeldsen & Bedding 1995), which no keyboard could play evenly. A
voicing adds 1.5 dB an octave down the keyboard.

**Damping** multiplies every linewidth (×0.1 to ×10) at fixed mode power:
broader modes breathe faster and their peaks are lower and wider; narrow
ones become near-steady tones.

**Key-up** stops the driving, and every mode rings down at its own
linewidth: e^(−πΓt) in amplitude, the radial modes of the Sun in about
0.6 s, a red giant's in about 5 s, its g-dominated mixed modes up to 30 times
longer. The pedal keeps the convection on.

**The flare.** Pressed from silence, a star driven only by noise would take
a mode lifetime to sound. Wolff (1972) proposed that solar flares could
excite the Sun's free oscillations. Here every key-down is such a flare (a
modelling choice): an impulse of force at a random point (θ₀, φ₀) on the
star, which pushes every mode at once, each by its spherical harmonic
there (in the real basis P_l^|m|(cos θ₀) cos mφ₀ and P_l^|m|(cos θ₀) sin |m|φ₀),
by **Flare kick** × velocity × its own rms, and by its share of the p mode,
√(1 − ζ) relative to its power (a heavy core-trapped mode barely moves).
The push is the same for every radial order, so the modes start in step
and the wave packet comes back to the surface every 1/Δν, the time sound
takes to cross the star and return: a buzz at Δν·K (69 Hz for the Sun) that
fades as the comb's curvature and small separations put the modes out of
step. With the convection off (driving 0), the stars are struck instead of
driven and simply ring.

### 9. Tuning: the pitch of a star

Which star sits on a key? Its modes are unresolved by the ear: a Sun-like
star's l = 0 and l = 1 modes alternate about 0.2 equivalent rectangular
bandwidths (ERB) apart on its key, a red giant's 0.1. So the star sounds
as a narrow band of tones whose pitch is near the centre of its power, not
on any one mode (the strongest are the dipoles, either side of the radial
mode nearest ν_max). This model's estimate of that pitch is the
power-weighted mean of the log frequency of every mode,

  f_heard = K · exp(Σ P_k ln ν_k / Σ P_k)

with P_k each multiplet's power (envelope × V_l² × (1 − ζ)). Each key's
star is the one on the track whose f_heard is the note, solved for s by
regula falsi to 10⁻⁷. Rotation and inclination split the multiplets
symmetrically and leave f_heard alone. Because a log-centroid falls below a
Gaussian's peak, ν_max ends up 10–24 ¢ above the note along the default
track (8–32 ¢ over all masses and K), and the radial mode nearest ν_max
anywhere within ±Δν/2 of it (between −45 and +91 ¢ from the note). Choosing the stars by
their radial mode instead would put that mode on the note but move the
centre of the band by up to half a large separation: 38 ¢ for the Sun, 76 ¢
for the giant on C2.

The tests check every key at the defaults (and samples at other masses
and K) within 0.02 ¢, and measure the engine's own output: the log-power
centroid of 40 s of C2, C3, C4, C5, C6 and C7 lands within 10 ¢ of the note
(at the time of writing 0.3, −5.2, −1.0, 2.3, −2.0 and −1.2 ¢; the breathing
of the modes makes the estimate wander, by about ±15 ¢ over 20 s for a giant).

### 10. δ Scuti stars

**Kind of star** swaps the keyboard for δ Scuti stars: A- and F-type stars
in the classical instability strip, driven by the κ-mechanism in their He II
ionisation zone (Pamyatnykh 1999). Their modes are not driven by noise:
each is unstable and grows by itself until a nonlinearity stops it, and
then it holds a steady amplitude. Each mode follows a Landau equation,

  dA/dt = (γ − βA²) A        →        A_sat = √(γ/β)

stepped once a block on the mode's own recursion. The fundamental radial
mode is on the note; the first and second overtones sit at the period
ratios of double- and triple-mode high-amplitude δ Scuti stars,
P₁/P₀ = 0.773 and P₂/P₁ = 0.802 (Yang et al. 2021 find 0.761–0.787 and
0.802 ± 0.004), with saturated amplitudes 1, 0.42 and 0.22; four nonradial
modes (l = 1, 1, 2, 1) are placed between 1.06 and 1.66 times the note and
sized per key from a seeded generator, each split by rotation with a
Ledoux constant of 0.05. A_sat scales with velocity and driving (a playable choice).

Real growth times are of order years: at this K a year lasts a minute. The
**δ Scuti growth time** compresses them to 0.05–2 s (0.25 s by default),
so that a key speaks: the flare starts each radial mode at 0.3 × **Flare
kick** of its final amplitude (the nonradial ones by their spherical
harmonics at the flare), and every key reaches half its level within half a
second at the default touch. On key-up the modes decay at 2 s⁻¹ × damping
(the model's choice: a δ Scuti star cannot be switched off). The star on
each key has the density that the period–density relation, Q = P √(ρ/ρ☉)
= 0.033 d for the fundamental (the model's choice), gives its period: from
0.13 ρ☉ on C2 (a period of 0.09 d). Real δ Scuti stars pulsate with periods
from about half an hour to six hours (23–280 Hz at this K), but with the
fundamental on the note only the bottom octave, up to about B2, holds stars
as tenuous as real ones (ρ below about 0.5 ρ☉). Above that the family is
extrapolated to stars denser than any δ Scuti star: a playable choice
rather than a physical one.

### 11. The engine

- **Stars built on the page.** A red giant's few hundred mixed modes, found
  by bisection, and the tuning take up to 50 ms; the page builds each key's
  star when needed, keeps them, works through the keyboard in spare
  moments, and sends each star with its note. Without one (in Node, or a
  plugin) the engine builds its own.
- **Voices.** One per key: pressing a sounding key drives the same star
  again (and adds a flare). Beyond 14 stars the quietest older one (a
  released one first, never one younger than 50 ms) fades out over 50 ms.
  After key-up, a mode 70 dB below its star's loudest moment is let go, and
  the star when its whole power is 65 dB down.
- **Knobs glide** over 30 ms: rotation and core rotation (each mode's
  frequency, per block), damping (per block), inclination (each mode's
  gain, per sample), driving (the pushes). No allocation in `process()`.
  Before the first note the engine plays a small made-up star through
  every path, so the first real notes run compiled.
- **The views.** The engine posts the focus star's mode amplitudes 16 times
  a second; the page draws them on the échelle diagram, the spectrum and
  the sphere.
- **Level.** A forte note peaks at 0.11–0.42 (the flare included), chords of
  six stars at 0.52.
- **Cost.** Ten stars across the keyboard, held and driven (2585 modes),
  take about 12–15 % of one core at 48 kHz; ten red giants (3386 modes)
  about 15–20 %.
- **In C++** (`native/instruments/stars`): the engine and the model, run as
  WebAssembly on this page and as plugins (CLAP, VST3, AU and a standalone
  app), where CC64 is the sustain pedal, the mod wheel spins the stars up
  and aftertouch drives them harder. The page builds each key's star with
  its WebAssembly model and sends it with the note; a plugin builds every
  key's star on a worker thread as soon as the kind, mass or speed-up
  changes, and a note whose star isn't ready waits the few milliseconds for
  it. The C++ was ported from the JavaScript this page first ran, with V8's
  own `exp`, `log`, `tan`… (fdlibm) and the same seeded generators, and
  played it bit for bit, its random convection, flares and stars included.

## What to listen for

`examples/stars/` (regenerate with `node tools/render-stars.mjs`):

1. **01-a-slow-chord-progression**: Dm9, G13, Cmaj9 and Fmaj7♯11 on
   subgiants over red-giant basses. Every note is a band of
   tones swelling and fading at random; the basses growl, their combs only
   6–8 Hz apart.
2. **02-the-sun-held-then-released**: the Sun itself on G6, held for four
   seconds: a shimmer of modes 35 Hz apart, each breathing on a 0.6 s
   lifetime. On release the convection stops and it rings down, 14 dB a
   second (2πΓK).
3. **03-a-walk-down-the-track-from-dwarf-to-red-giant**: C7 to C2, one
   octave a step: a cool dwarf, a dwarf older than the Sun, two subgiants
   and two red giants. The combs close up (Δν·K from 85 Hz to 6 Hz) and
   their breathing slows from about one second to five.
4. **04-rotation-slow-then-fast**: the dwarf on C6 turning at the Sun's
   rate, then 25 times faster: each multiplet splits into components
   5.8 Hz apart, and the note beats and shimmers.
5. **05-inclination-pole-on-then-equator-on**: a fast rotator on G5 seen
   pole-on, where only the m = 0 components show (single lines), then
   equator-on, where the dipoles show only their split outer components
   and the quadrupoles m = 0 and ±2.
6. **06-a-red-giant-rings-in-its-mixed-modes**: a red giant on F2 struck by a
   flare with the convection off (linewidths × 2.5, so that it happens
   within the demo). The p-like modes fade first; after about five seconds
   the core's g-dominated mixed modes, narrower and closely spaced, are
   louder, and they ring on.
7. **07-delta-scuti-against-a-solar-like-star**: a δ Scuti star on A3: its
   modes grow in about a third of a second and then hold steady, a fixed
   chord with rotational beats; then the solar-like star on the same key, a
   young red giant, breathing.

On the page, the **échelle diagram** shows the focus star's modes, each dot
sized by its power at that moment: the ridges of l = 0, 1, 2 and 3 for a
dwarf; for a red giant the dipole modes scatter off their ridge, the mixed
modes. Click a mode to show it on **the star**, which draws its surface
pattern on a sphere, turning with the rotation and tilted by the
inclination. The **power spectrum** shows every multiplet's power now
against the model's Gaussian envelope, with the live output's spectrum.
**The track** is a Hertzsprung–Russell diagram with the star on every key.

## Files

```
stars/index.html, style.css          page
stars/src/stars-instrument.js        the descriptor: parameters, presets, key range, the engine
stars/src/stars-params.js            parameters and presets
stars/src/stars-main.js              page wiring, building the stars for each note, and views
stars/src/stars-wasm.js              the C++ engine and model as WebAssembly (stars/wasm/stars.wasm)
native/instruments/stars/            the C++: scaling relations, ZAMS and the track, the asymptotic pattern, mixed modes,
                                     linewidths, visibilities, rotation, tuning, δ Scuti, and the engine (plugins and WebAssembly)
test/stars-tests.mjs                 node test/stars-tests.mjs (21 tests, about 16 s)
tools/render-stars.mjs               node tools/render-stars.mjs → examples/stars/
```

## Simplifications

- **Scaling relations, not stellar models.** Every star is the Sun scaled by
  Δν and ν_max; the track's temperatures are a simple shape with cited ends,
  not a stellar-evolution code. Huber et al. (2011) tested the scaling
  relations from the main sequence to red giants, and T_eff enters ν_max
  only as its square root.
- **One linewidth per star** (and per mixed mode). Real linewidths grow
  steeply with frequency across the envelope; here every p mode of a star
  has Γ₀.
- **Mode power is levelled across the keyboard.** Real red giants oscillate
  with amplitudes ten times the Sun's and more; every star here has the same
  mean power, with a gentle voicing.
- **The pattern's parameters** (ε, δν₀₂, α, ΔΠ₁, q and the l = 3 visibility)
  are the model's choices, with the Sun as the anchor; the l = 2 modes are
  never mixed; a glitch-free asymptotic pattern; ε_g = 0.
- **The same rotation on every key.** Real stars spin down as they age and
  expand, and their cores spin down more slowly; here one surface period
  and one core ratio serve every star, and C_nl = 0 for the p modes.
- **The flare is a modelling choice,** after Wolff's proposal: it is here so
  that a note starts at once, not because flares are known to ring stars
  this way.
- **The pitch is one estimate's.** The power-weighted mean log frequency is
  a simple model of the pitch of a band of unresolved tones, not a
  listening test.
- **δ Scuti stars** are a sketch: three radial modes at fixed period ratios
  and a few placed nonradial ones, self-saturating independently (no mode
  coupling), with compressed growth times and a density-from-period
  relation that leaves the upper keys' stars unphysically dense.

## Prior art and references

**History and discovery.**
- R. B. Leighton, R. W. Noyes & G. W. Simon (1962). "Velocity fields in
  the solar atmosphere. I. Preliminary report." *ApJ* 135, 474–499.
  [doi:10.1086/147285](https://doi.org/10.1086/147285). Discovery of the
  five-minute oscillations (period about 296 s).
- R. K. Ulrich (1970). "The five-minute oscillations on the solar
  surface." *ApJ* 162, 993–1002.
  [doi:10.1086/150731](https://doi.org/10.1086/150731). Standing acoustic
  waves trapped below the photosphere, on discrete ridges in the
  wavenumber–frequency diagram.
- J. W. Leibacher & R. F. Stein (1971). "A new description of the solar
  five-minute oscillation." *Astrophys. Lett.* 7, 191–192.
  [ADS](https://ui.adsabs.harvard.edu/abs/1971ApL.....7..191L/abstract).
  Independently, the same interpretation as trapped acoustic modes.
- F.-L. Deubner (1975). "Observations of low wavenumber nonradial
  eigenmodes of the Sun." *A&A* 44, 371–375.
  [ADS](https://ui.adsabs.harvard.edu/abs/1975A%26A....44..371D/abstract).
  The predicted ridges, resolved.
- A. Claverie, G. R. Isaak, C. P. McLeod, H. B. van der Raay & T. Roca
  Cortes (1979). "Solar structure from global studies of the 5-minute
  oscillation." *Nature* 282, 591–594.
  [doi:10.1038/282591a0](https://doi.org/10.1038/282591a0). Equally
  spaced low-degree global modes in integrated sunlight.
- G. Grec, E. Fossat & M. Pomerantz (1980). "Solar oscillations: full disk
  observations from the geographic South Pole." *Nature* 288, 541–544.
  [doi:10.1038/288541a0](https://doi.org/10.1038/288541a0).
- H. Kjeldsen, T. R. Bedding, M. Viskum & S. Frandsen (1995). "Solarlike
  oscillations in η Boo." *AJ* 109, 1313–1319.
  [doi:10.1086/117363](https://doi.org/10.1086/117363). The first reported
  solar-like oscillations in another star, later confirmed.
- F. Bouchy & F. Carrier (2001). "P-mode observations on α Cen A." *A&A*
  374, L5–L8. [doi:10.1051/0004-6361:20010792](https://doi.org/10.1051/0004-6361:20010792).
- J. De Ridder, C. Barban, F. Baudin et al. (2009). "Non-radial
  oscillation modes with long lifetimes in giant stars." *Nature* 459,
  398–400. [doi:10.1038/nature08022](https://doi.org/10.1038/nature08022).
  CoRoT red giants.
- P. G. Beck, T. R. Bedding, B. Mosser et al. (2011). "Kepler detected
  gravity-mode period spacings in a red giant star." *Science* 332, 205.
  [doi:10.1126/science.1201939](https://doi.org/10.1126/science.1201939).
- T. R. Bedding, B. Mosser, D. Huber et al. (2011). "Gravity modes as a way
  to distinguish between hydrogen- and helium-burning red giant stars."
  *Nature* 471, 608–611.
  [doi:10.1038/nature09935](https://doi.org/10.1038/nature09935).
- P. G. Beck, J. Montalban, T. Kallinger et al. (2012). "Fast core rotation
  in red-giant stars as revealed by gravity-dominated mixed modes."
  *Nature* 481, 55–57.
  [doi:10.1038/nature10612](https://doi.org/10.1038/nature10612). Cores
  turning at least ten times faster than the surface.

**The physics.**
- P. Ledoux (1951). "The nonradial oscillations of gaseous stars and the
  problem of Beta Canis Majoris." *ApJ* 114, 373–384.
  [doi:10.1086/145477](https://doi.org/10.1086/145477). Rotational
  splitting and the constant C_nl.
- C. Hayashi (1961). "Stellar evolution in early phases of gravitational
  contraction." *PASJ* 13, 450–452.
  [ADS](https://ui.adsabs.harvard.edu/abs/1961PASJ...13..450H/abstract).
  The Hayashi line of fully convective stars, the red-giant branch here.
- C. L. Wolff (1972). "Free oscillations of the Sun and their possible
  stimulation by solar flares." *ApJ* 176, 833–842.
  [doi:10.1086/151680](https://doi.org/10.1086/151680). The flare kick.
- P. Goldreich & D. A. Keeley (1977). "Solar seismology. II. The
  stochastic excitation of the solar p-modes by turbulent convection."
  *ApJ* 212, 243–251. [doi:10.1086/155043](https://doi.org/10.1086/155043).
- H. Shibahashi (1979). *PASJ* 31, 87.
  [ADS](https://ui.adsabs.harvard.edu/abs/1979PASJ...31...87S/abstract).
  The asymptotic analysis of nonradial oscillations behind the mixed-mode
  condition.
- M. Tassoul (1980). "Asymptotic approximations for stellar nonradial
  pulsations." *ApJS* 43, 469–490.
  [doi:10.1086/190678](https://doi.org/10.1086/190678). The asymptotic p-
  and g-mode relations.
- R. K. Ulrich (1986). "Determination of stellar ages from
  asteroseismology." *ApJ* 306, L37–L40.
  [doi:10.1086/184700](https://doi.org/10.1086/184700). Δν and mean
  density; the small separation as an age diagnostic.
- E. R. Anderson, T. L. Duvall Jr. & S. M. Jefferies (1990). "Modeling of
  solar oscillation power spectra." *ApJ* 364, 699.
  [doi:10.1086/169452](https://doi.org/10.1086/169452).
- T. M. Brown, R. L. Gilliland, R. W. Noyes & L. W. Ramsey (1991).
  "Detection of possible p-mode oscillations on Procyon." *ApJ* 368,
  599–609. [doi:10.1086/169725](https://doi.org/10.1086/169725). ν_max
  scaling with the acoustic cut-off frequency.
- H. Kjeldsen & T. R. Bedding (1995). "Amplitudes of stellar oscillations:
  the implications for asteroseismology." *A&A* 293, 87–106.
  [ADS](https://ui.adsabs.harvard.edu/abs/1995A%26A...293...87K/abstract).
  The scaling relations for Δν and ν_max.
- C. A. Tout, O. R. Pols, P. P. Eggleton & Z. Han (1996). "Zero-age
  main-sequence radii and luminosities as analytic functions of mass and
  metallicity." *MNRAS* 281, 257–262.
  [ADS](https://ui.adsabs.harvard.edu/abs/1996MNRAS.281..257T/abstract).
  The start of every track.
- A. A. Pamyatnykh (1999). "Pulsational instability domains in the upper
  main sequence." *Acta Astron.* 49, 119–148.
  [ADS](https://ui.adsabs.harvard.edu/abs/1999AcA....49..119P/abstract).
  κ-mechanism instability strips, including δ Scuti.
- L. Gizon & S. K. Solanki (2003). "Determining the inclination of the
  rotation axis of a Sun-like star." *ApJ* 589, 1009–1019.
  [doi:10.1086/374715](https://doi.org/10.1086/374715).
- M.-A. Dupret et al. (2009). "Theoretical
  amplitudes and lifetimes of non-radial solar-like oscillations in red
  giants." *A&A* 506, 57–67.
  [doi:10.1051/0004-6361/200911713](https://doi.org/10.1051/0004-6361/200911713).
  Lifetimes with mode inertia; radiative damping of core-trapped modes.
- C. Aerts, J. Christensen-Dalsgaard & D. W. Kurtz (2010).
  *Asteroseismology*. Astronomy and Astrophysics Library, Springer.
  [doi:10.1007/978-1-4020-5803-5](https://doi.org/10.1007/978-1-4020-5803-5).
- J. Ballot, C. Barban & C. van 't Veer-Menneret (2011). "Visibilities and
  bolometric corrections for stellar oscillation modes observed by Kepler."
  *A&A* 531, A124.
  [doi:10.1051/0004-6361/201016230](https://doi.org/10.1051/0004-6361/201016230).
- D. Huber, T. R. Bedding, D. Stello et al. (2011). "Testing scaling
  relations for solar-like oscillations from the main sequence to red
  giants using Kepler data." *ApJ* 743, 143.
  [doi:10.1088/0004-637X/743/2/143](https://doi.org/10.1088/0004-637X/743/2/143).
  The solar reference values ν_max = 3090 ± 30 μHz and
  Δν = 135.1 ± 0.1 μHz.
- B. Mosser, K. Belkacem, M.-J. Goupil et al. (2011). "The universal
  red-giant oscillation pattern. An automated determination with CoRoT
  data." *A&A* 525, L9.
  [doi:10.1051/0004-6361/201015440](https://doi.org/10.1051/0004-6361/201015440).
- T. Appourchaux, O. Benomar, M. Gruberbauer et al. (2012). "Oscillation
  mode linewidths of main-sequence and subgiant stars observed by Kepler."
  *A&A* 537, A134.
  [doi:10.1051/0004-6361/201118496](https://doi.org/10.1051/0004-6361/201118496).
  Linewidths as a power law of T_eff (index about 13) over a lower bound.
- B. Mosser, Y. Elsworth, S. Hekker et al. (2012a). "Characterization of the
  power excess of solar-like oscillations in red giants with Kepler."
  *A&A* 537, A30.
  [doi:10.1051/0004-6361/201117352](https://doi.org/10.1051/0004-6361/201117352).
  The envelope width 0.66 ν_max^0.88 and the visibilities of nonradial modes.
- B. Mosser, M. J. Goupil, K. Belkacem et al. (2012b). "Probing the core
  structure and evolution of red giants using gravity-dominated mixed
  modes observed with Kepler." *A&A* 540, A143.
  [doi:10.1051/0004-6361/201118519](https://doi.org/10.1051/0004-6361/201118519).
- M. J. Goupil, B. Mosser, J. P. Marques et al. (2013). "Seismic
  diagnostics for transport of angular momentum in stars. II. Interpreting
  observed rotational splittings of slowly rotating red giant stars."
  *A&A* 549, A75.
  [doi:10.1051/0004-6361/201220266](https://doi.org/10.1051/0004-6361/201220266).
  The splitting of mixed modes, weighted by ζ.
- B. Mosser, E. Michel, K. Belkacem et al. (2013). "Asymptotic and measured
  large frequency separations." *A&A* 550, A126.
  [doi:10.1051/0004-6361/201220435](https://doi.org/10.1051/0004-6361/201220435).
  The curvature of the ridges.
- W. J. Chaplin & A. Miglio (2013). "Asteroseismology of solar-type and
  red-giant stars." *Annu. Rev. Astron. Astrophys.* 51, 353–392.
  [doi:10.1146/annurev-astro-082812-140938](https://doi.org/10.1146/annurev-astro-082812-140938).
- B. Mosser et al. (2015).
  "Period spacings in red giants. I. Disentangling rotation and revealing
  core structure discontinuities." *A&A* 584, A50.
  [doi:10.1051/0004-6361/201527075](https://doi.org/10.1051/0004-6361/201527075).
  The share ζ of a mixed mode's inertia in the core, and ΔP = ζΔΠ₁.
- M. Vrard, B. Mosser & R. Samadi (2016). "Period spacings in red giants.
  II. Automated measurement." *A&A* 588, A87.
  [doi:10.1051/0004-6361/201527259](https://doi.org/10.1051/0004-6361/201527259).
- B. Mosser, C. Pinçon, K. Belkacem, M. Takata & M. Vrard (2017). "Period
  spacings in red giants. III. Coupling factors of mixed modes." *A&A*
  600, A1. [doi:10.1051/0004-6361/201630053](https://doi.org/10.1051/0004-6361/201630053).
- T.-Z. Yang, Z.-Y. Zuo, X.-Y. Wang, X.-Y. Sun & R.-X. Tang (2021). "A
  catalogue of double-mode high amplitude δ Scuti stars in the Galaxy and
  their statistical properties." [arXiv:2110.13594](https://arxiv.org/abs/2110.13594).
  The period ratios P₁/P₀ and P₂/P₁.

**Earlier sonifications and models.**
- [The Singing Sun / Solar Sounds](https://solar-center.stanford.edu/singing/)
  (A. G. Kosovichev, Stanford Solar Oscillations Investigation, 1997): 40
  days of disc-averaged SOHO/MDI Doppler data, filtered to keep the
  l = 0–3 modes and sped up 42,000 times.
- E. J. Rhodes Jr., A. G. Kosovichev, J. Schou, P. H. Scherrer &
  J. Reiter (1997). "Measurements of frequencies of solar oscillations
  from the MDI medium-l program." *Sol. Phys.* 175, 287–310.
  [doi:10.1023/A:1004963425123](https://doi.org/10.1023/A:1004963425123).
  Its CD-ROM carried solar sound files illustrating the stochastic modes.
- [ESO: ultrabass sounds of the giant star ξ Hya](https://www.eso.org/public/news/eso0215/)
  (ESO press release eso0215, 2002; data from S. Frandsen, F. Carrier,
  C. Aerts et al.): the 16 strongest observed oscillation frequencies of
  a red giant, multiplied by 10⁶.
- Z. Kolláth & J. Keuler (2006). "Stellar acoustics as input for music
  composition." *Musicae Scientiae* 10(1 suppl.), 161–183.
  [doi:10.1177/1029864906010001081](https://doi.org/10.1177/1029864906010001081).
  Csound synthesis from models of variable stars, for the composition
  "Stellar Music No. 1".
- Z. Kolláth (2006). "Public outreach in asteroseismology." *ASP Conf.
  Ser.* 349, 421–433.
  [ADS](https://ui.adsabs.harvard.edu/abs/2006ASPC..349..421K/abstract).
  Stellar sounds as sums of transposed model frequencies.
- B. Ulaş (2009). "Musical scale estimation for some multiperiodic
  pulsating stars." *Commun. Asteroseismol.* 159, 131–134.
  [doi:10.1553/cia159s131](https://doi.org/10.1553/cia159s131).
- [Kepler listens to an orchestra of solar-type stars](https://www.birmingham.ac.uk/news-archive/2011/kepler-listens-to-an-orchestra-of-solar-type-stars)
  (University of Birmingham, 2011): sounds made from Kepler's Sun-like
  stars.
- S. J. Hale, [BiSON — Sounds of the Sun](https://epapers.bham.ac.uk/id/eprint/2090/)
  (University of Birmingham, 2015): the Sun's low-degree modes from the
  Birmingham Solar Oscillations Network, as sound.
- B. Ulaş (2015). "The multiperiodic pulsating star Y Cam A as a musical
  instrument." arXiv:1507.07307.
  [doi:10.48550/arXiv.1507.07307](https://doi.org/10.48550/arXiv.1507.07307).
  Chords and a composition from a δ Scuti star's observed frequencies.
- B. Carey & B. Ulaş (2016). "VR 'Space Opera': mimetic spectralism in an
  immersive starlight audification system." arXiv:1611.03081.
  [doi:10.48550/arXiv.1611.03081](https://doi.org/10.48550/arXiv.1611.03081).
- [SoSH: Sonification of Solar Harmonics](https://solar-center.stanford.edu/sosh/)
  (T. P. Larson, S. Shafer & E. diFalco; Stanford and University of
  Nebraska Omaha): Pure Data tool that isolates SOHO/MDI and SDO/HMI
  global modes and transposes them to audio, keeping frequency ratios.
  Described in T. P. Larson, S. Shafer & E. diFalco (2019), *AAS Meeting*
  234, 307.06 ([ADS](https://ui.adsabs.harvard.edu/abs/2019AAS...23430706L/abstract)).
- D. Huppenkothen, J. Pampin, J. R. A. Davenport & J. Wenlock (2023). "The
  sonified Hertzsprung–Russell diagram." *Proc. ICAD 2023*, 268–275.
  [doi:10.21785/icad2023.6263](https://doi.org/10.21785/icad2023.6263).
  Audified Kepler light curves, including pulsating stars, on an
  interactive HR diagram.
- [AstroSounds](https://www.astrosounds.be/en/) (K. Kolenberg, KU Leuven
  and UAntwerp, with partners): citizen-science project in which
  participants listen to sonified Kepler light curves of pulsating stars.
