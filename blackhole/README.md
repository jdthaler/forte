# Black-Hole Keyboard

Every key is a Kerr black hole. Pressing it perturbs the hole, and you hear
it settle back down by radiating gravitational waves in its **quasinormal
modes**, the "ringdown" LIGO observes after a merger. Mass sets the pitch;
spin sets the timbre. Everything else is general relativity.

Play it at <https://forte.jthaler.net/blackhole/> (or locally — see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/`, `Q…]` rows | play (61 keys, C2–C7) |
| `↑` `↓` | spin |
| `←` `→` | octave |
| MIDI | notes and velocity; **mod wheel = spin** |

## The physics

**Quasinormal modes, computed exactly.** Perturbations of a Kerr hole obey the
Teukolsky equation (spin weight s = −2 for gravitational waves), which
separates into angular and radial ODEs coupled through ω and the spheroidal
constant A. `src/qnm.js` solves them by **Leaver's continued-fraction
method**:
- both boundary-value problems become three-term recurrences;
- a mode exists where the two continued fractions vanish;
- overtone n uses Leaver's n-th inversion;
- modes are tracked from their Schwarzschild values up in spin, adaptively
  halving the step if a solution jumps branches.

`node tools/qnm-table.mjs` precomputes all 63 modes with l = 2–4, every m and
n = 0–2, from a = 0 to a = 1 − 10⁻⁶, in about three minutes. The radial
fraction converges more slowly as a → 1, slowest for the counter-rotating
overtones: (2,−2,2) at a = 1 − 10⁻⁶ needs about 10⁵ terms. The browser
interpolates the table with cubic Hermite polynomials in u = −log₁₀(1 − a), on
Re Mω and log(−Im Mω), with slopes from the parabola through neighbouring
nodes. Against fresh solves at a quarter, half and three quarters of every
grid interval, the error is under 0.021 ¢ in pitch and 0.002 % in damping
for every mode, the end intervals included, with one exception: near
a = 0.995 the overtones (2,1,1) and (2,1,2) pass close to each other and turn
sharply, and there the error reaches 0.11 ¢ and 0.03 %. The tests check the
solver against:

* Schwarzschild modes (Leaver; Berti, Cardoso & Starinets) to 10⁻⁶;
* Kerr (2,2,0) at a = 0.9: 0.671613 − 0.064869i;
* Berti, Cardoso & Will (2006), Tables II and V, to their four digits:
  counter-rotating modes, such as (2,−2,0) at a = 0.9, 0.2972 − 0.0883i;
  overtones up to (2,−2,2) at a = 0.98; and the separation constants A of
  (2,±2,0) at a = 0.9;
* the small-spin slope of the spheroidal eigenvalue, −2s²m/(l(l+1));
* the near-extremal limit, ω → mΩ_H − 2πiT_H(n + ½) (Hod 2008), for
  (2,2,0), (3,3,0) and the (2,2,1) overtone;
* convergence: doubling the continued-fraction depth changes nothing, for
  (2,2,2) at a = 1 − 10⁻⁵ and for (2,−2,2) and (2,−1,2) at a = 1 − 10⁻⁶.

**Tuning.** Each key's hole has the mass that puts its (2,2,0) mode on the key's
pitch: M = Re(Mω₂₂₀)/(2πf). At a = 0.69, middle C is a **65 M☉** hole with a
166 km horizon. That is close to the remnant of GW150914, LIGO's first
detection: 62 M☉ with a ≈ 0.67, which rang at about 271 Hz in its own frame
and 249 Hz as observed (redshifted by 1 + z ≈ 1.09), either side of middle C
(262 Hz). The keyboard spans 261 M☉ (C2) to 8 M☉ (C7).

**What spin does to the sound** (middle C):

| spin a | (2,2,0) Q | decay time τ | (3,3,0) / (2,2,0) | (4,4,0) / (2,2,0) |
|---|---|---|---|---|
| 0 (Schwarzschild) | 2.1 | 2.6 ms: a thud | 1.604 | 2.165 |
| 0.69 | 3.3 | 4 ms | 1.59 | 2.15 |
| 0.99 | 14.8 | 18 ms | 1.52 | 2.04 |
| 1 − 10⁻⁴ | 142 | 173 ms | 1.502 | 2.004 |
| 1 − 10⁻⁶ | 1415 | 1.7 s | 1.5002 | 2.0004 |

Black holes are among the most damped oscillators in nature: a
non-spinning one rings for barely two cycles. As a → 1, though, the l = m
modes slide onto multiples of the horizon's angular frequency, mΩ_H. Their
damping, which is set by the Hawking temperature, goes to zero. A
near-extremal hole becomes a **harmonic bell**: partials in the ratio
2 : 3 : 4, like the 2nd–4th harmonics of a note an octave below.

Most l ≠ m modes stay damped. At a = 1 − 10⁻⁶ the l ≠ m fundamentals with
m > 0 have Q from 6.7 for (3,1,0) to 28 for (3,2,0), and the m ≤ 0 modes
are lower still. But near extremality the spectrum branches into damped modes
and zero-damping modes (Yang et al. 2013), and some l ≠ m modes join the
second family: (4,3,0) and the overtones (2,1,2), (3,2,1), (3,2,2), (4,3,1)
and (4,3,2) also approach mΩ_H, with Q between 146 and 564. Of the modes this
keyboard plays, only (2,1,0) has l ≠ m (Q = 7.6 at a = 1 − 10⁻⁶). The
quasinormal-spectrum plot shows all of this as spin moves.

**How it's struck.** The perturbation is a binary merger, and the remnant's
mode amplitudes follow numerical-relativity fits (Kamaretsos, Hannam, Husa &
Sathyaprakash 2012) in the symmetric mass ratio ν = q/(1+q)²:

  A₂₂ = 0.864ν,  A₂₁ = 0.52(1−4ν)^0.71 A₂₂,  A₃₃ = 0.44(1−4ν)^0.45 A₂₂,
  A₄₄ = [5.4(ν−0.22)² + 0.04] A₂₂

Equal masses leave the odd-m modes silent; lopsided mergers switch them on.
These fits come from mergers of non-spinning holes, whose remnant's spin is
set by the mass ratio: a ≈ 0.69 at q = 1, about 0.3 at q = 8. Here spin and
mass ratio are separate knobs, so at any other pairing the amplitudes are
extrapolated off the curve they were fitted on.

The strain at viewing inclination ι is

  h₊ − i h× = Σ [A e^{−iωt} ₋₂Y_lm(ι) + (−1)^l A* e^{iω*t} ₋₂Y_l,−m(ι)],

including each mode's mirror partner for a non-precessing binary. **Left
channel = h₊, right = h×**. Face-on gives circular polarisation (the channels
are 90° apart), and edge-on is linear (h× from the (2,2) mode vanishes).

* **Ringdown start** (t₀ after the strain peak): overtones (2,2,1) and (2,2,2)
  damp faster, so starting earlier lets them through. Their amplitudes at the
  peak are illustrative, since NR fits give large, phase-alternating values
  that depend on the fit.
* **Inspiral** (optional): the leading-order quadrupole chirp,
  f(t) = f₀(1 − t/τ_c)^(−3/8), with the chirp mass of the progenitors. It
  starts a chosen number of octaves below the wave frequency at the innermost
  stable circular orbit (ISCO), f_ISCO = 1/(6√6 πM) for total mass M, but late
  enough to last at most 2 s. It runs up to the ISCO, rises through a short
  phenomenological merger bridge, and hands over to the ringdown with the
  ringdown's own phase and amplitude, so the strain is continuous through the
  merger: the LIGO "whoop". The amplitude grows as f^(2/3) up to 1.23 f_ISCO
  and then holds. For the lowest keys the whole inspiral is below 20 Hz, and
  you hear the merger.

The page plots each note's strain from the closed-form sum over modes (and
the chirp's closed-form schedule), at about two points per pixel. The tests
check it against the engine's output.

## Simplifications

* The angular pattern uses spin-weighted *spherical* harmonics, not the
  spheroidal ones, so mode mixing at high aω is neglected. The solver's
  separation constants agree with the published ones, so the spheroidal
  functions (Leaver's angular series) are a natural next step.
* Mode phases are fixed rather than taken from NR. The merger bridge is
  phenomenological, and so is the inspiral's amplitude above the ISCO.
* The excitation model is extrapolated wherever spin and mass ratio are off
  the non-spinning curve it was fitted on (see above). Numerical-relativity
  remnants reach spins of about 0.95 at most, so near-extremal holes are far
  outside anything a merger is known to make. The QNMs themselves are exact
  at every spin.

`examples/blackhole/` has six renders: one note as spin rises from 0 to
1 − 10⁻⁶; a phrase on GW150914-like holes and the same phrase near-extremal;
equal vs lopsided mergers; face-on vs edge-on (listen in stereo); and full
inspiral–merger–ringdown chirps. Regenerate with
`node tools/render-blackhole.mjs`. Tests: `node test/blackhole-tests.mjs`.
