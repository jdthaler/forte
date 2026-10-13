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
n = 0–2, from a = 0 to a = 1 − 10⁻⁶, in about a minute. The browser
interpolates that table, accurate to under 0.1 ¢. The tests check the solver
against:

* Schwarzschild modes (Leaver; Berti, Cardoso & Starinets) to 10⁻⁶;
* Kerr (2,2,0) at a = 0.9: 0.671613 − 0.064869i;
* the small-spin slope of the spheroidal eigenvalue, −2s²m/(l(l+1));
* the near-extremal limit, ω → mΩ_H − 2πiT_H(n + ½) (Hod 2008), for
  (2,2,0), (3,3,0) and the (2,2,1) overtone;
* convergence: doubling the continued-fraction depth changes nothing.

**Tuning.** Each key's hole has the mass that puts its (2,2,0) mode on the key's
pitch: M = Re(Mω₂₂₀)/(2πf). At a = 0.69, A4 is a **39 M☉** hole with a
99 km horizon, essentially the remnant of GW150914, LIGO's first detection.
The keyboard spans 260 M☉ (C2) to 8 M☉ (C7).

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
2 : 3 : 4, like the 2nd–4th harmonics of a note an octave below. Modes with
l ≠ m stay damped (Q ≈ 8–28): the near-extremal "branching" of Yang et al.
(2013). The quasinormal-spectrum plot shows all of this as spin moves.

**How it's struck.** The perturbation is a binary merger, and the remnant's
mode amplitudes follow numerical-relativity fits (Kamaretsos, Hannam, Husa &
Sathyaprakash 2012) in the symmetric mass ratio ν = q/(1+q)²:

  A₂₂ = 0.864ν,  A₂₁ = 0.52(1−4ν)^0.71 A₂₂,  A₃₃ = 0.44(1−4ν)^0.45 A₂₂,
  A₄₄ = [5.4(ν−0.22)² + 0.04] A₂₂

Equal masses leave the odd-m modes silent; lopsided mergers switch them on.
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
  runs up to the innermost stable circular orbit (ISCO), then rises through a
  short phenomenological merger bridge and hands over to the ringdown: the
  LIGO "whoop".

## Simplifications

* The angular pattern uses spin-weighted *spherical* harmonics, not the
  spheroidal ones, so mode mixing at high aω is neglected. The solver computes
  A, so the spheroidal functions are a natural next step.
* Mode phases are fixed rather than taken from NR. The merger bridge is
  phenomenological.
* Above about 0.999 no numerical-relativity merger produces such spins; the
  excitation model there is an extrapolation. The QNMs themselves are exact.

`examples/blackhole/` has six renders: one note as spin rises from 0 to
1 − 10⁻⁶; a phrase on GW150914-like holes and the same phrase near-extremal;
equal vs lopsided mergers; face-on vs edge-on (listen in stereo); and full
inspiral–merger–ringdown chirps. Regenerate with
`node tools/render-blackhole.mjs`. Tests: `node test/blackhole-tests.mjs`.
