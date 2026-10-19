# Black-Hole Keyboard

Every key is a Kerr black hole. Pressing it perturbs the hole, and you hear
it settle back down by radiating gravitational waves in its **quasinormal
modes**, the "ringdown" LIGO observes after a merger. Mass sets the pitch;
spin sets the timbre. Everything else is general relativity.

Play it at <https://forte.jthaler.net/blackhole/> (or locally — see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/`, `Q…]` rows | play (88 keys, A0–C8) |
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
overtones: (2,−2,2) at a = 1 − 10⁻⁶ needs about 10⁵ terms. The C++
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
(262 Hz). The keyboard spans 621 M☉ (A0) to 4 M☉ (C8).

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
mode amplitudes follow fits to the numerical-relativity amplitudes of
Kamaretsos, Hannam, Husa & Sathyaprakash (2012), in the form Gossan, Veitch
& Sathyaprakash (2012) gave them in the symmetric mass ratio ν = q/(1+q)²:

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

**Seen through spheroidal harmonics.** Written above with ₋₂Y_lm, the angular
pattern of a Kerr mode is really the spin-weighted *spheroidal* harmonic
₋₂S_lm(ι; aω), the angular half of the Teukolsky equation the solver's
separation constants come from. It mixes in the spherical harmonics of the same
m and the other l as aω grows, and since ω is complex, so is S. The model
computes it by the spectral method (Hughes 2000; Cook & Zalutskiy 2014): in the
basis ₋₂Y_jm, the angular equation is the eigenproblem
A b = (j(j + 1) − s(s + 1) − c² cos²θ + 2cs cos θ) b, with c = aω, a banded
complex-symmetric matrix of 14 harmonics. The mode's eigenvector is followed from
c = 0 by Rayleigh-quotient inverse iteration, normalised on the sphere with its
₋₂Y_lm part real and positive, so it is ₋₂Y_lm at a = 0. Its eigenvalue matches
the continued fraction's A to better than 10⁻¹² for every mode in the table. The mirror
partner's function is the mode's turned over:
₋₂S_l,−m(θ; −aω*) = (−1)^l ₋₂S_lm(π − θ; aω)*.

Mixing matters at high spin. At a = 1 − 10⁻⁶, seen at 30°, the (2,2) mode is
about a tenth stronger than its spherical harmonic says, (3,3) a third and
(4,4) a half; (2,1) gains a fifth. Each key's voice computes the angular
functions once per spin and inclination and shares them with every key.

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

## In C++

The engine and model are C++, run as WebAssembly on this page, where the
views (the QNM plane, the strain plot, the black hole's numbers) call them
too, and as plugins (CLAP, VST3, AU and a standalone app): MIDI velocity maps as on the
page, the mod wheel raises the spin from its default toward 1 − 10⁻⁶, and
the ten presets are there. The Leaver table is the same one, converted
number for number to a C++ header (`tools/blackhole-native-table.mjs`); a
key's voice is cheap to build from it (a few microseconds, no solving), so
the engine builds it as a note starts, the same voice the views show. The
Leaver solver (`src/qnm.js`, which makes the table) stays in JavaScript; the
tests check the C++ against it and against the literature. Ten twelve-mode voices take about 1–2 % of a core in C++. The
port is in `native/instruments/blackhole/`, its WebAssembly in
`blackhole/wasm/` (wrapped by `blackhole/src/blackhole-wasm.js`).

## Prior art and references

### The original source: black holes and their ringing

* Regge, T. & Wheeler, J. A. (1957). "Stability of a Schwarzschild
  singularity." *Phys. Rev.* 108, 1063–1069.
  [doi:10.1103/PhysRev.108.1063](https://doi.org/10.1103/PhysRev.108.1063)
* Kerr, R. P. (1963). "Gravitational field of a spinning mass as an example
  of algebraically special metrics." *Phys. Rev. Lett.* 11, 237–238.
  [doi:10.1103/PhysRevLett.11.237](https://doi.org/10.1103/PhysRevLett.11.237)
* Vishveshwara, C. V. (1970). "Scattering of gravitational radiation by a
  Schwarzschild black-hole." *Nature* 227, 936–938.
  [doi:10.1038/227936a0](https://doi.org/10.1038/227936a0). The damped
  ringing of a scattered wave packet.
* Press, W. H. (1971). "Long wave trains of gravitational waves from a
  vibrating black hole." *Astrophys. J.* 170, L105.
  [doi:10.1086/180849](https://doi.org/10.1086/180849)
* Teukolsky, S. A. (1972). "Rotating black holes: separable wave equations
  for gravitational and electromagnetic perturbations." *Phys. Rev. Lett.*
  29, 1114–1118.
  [doi:10.1103/PhysRevLett.29.1114](https://doi.org/10.1103/PhysRevLett.29.1114)
* Teukolsky, S. A. (1973). "Perturbations of a rotating black hole. I.
  Fundamental equations for gravitational, electromagnetic, and
  neutrino-field perturbations." *Astrophys. J.* 185, 635.
  [doi:10.1086/152444](https://doi.org/10.1086/152444)
* Chandrasekhar, S. & Detweiler, S. (1975). "The quasi-normal modes of the
  Schwarzschild black hole." *Proc. R. Soc. Lond. A* 344, 441–452.
  [doi:10.1098/rspa.1975.0112](https://doi.org/10.1098/rspa.1975.0112)
* Abbott, B. P. et al. (LIGO Scientific and Virgo Collaborations) (2016).
  "Observation of gravitational waves from a binary black hole merger."
  *Phys. Rev. Lett.* 116, 061102.
  [doi:10.1103/PhysRevLett.116.061102](https://doi.org/10.1103/PhysRevLett.116.061102)
* Abbott, B. P. et al. (2016). "Properties of the binary black hole merger
  GW150914." *Phys. Rev. Lett.* 116, 241102.
  [doi:10.1103/PhysRevLett.116.241102](https://doi.org/10.1103/PhysRevLett.116.241102).
  The remnant's 62 M☉ and spin 0.67 quoted above.

### The physics

**Computing the modes**

* Detweiler, S. (1980). "Black holes and gravitational waves. III. The
  resonant frequencies of rotating holes." *Astrophys. J.* 239, 292.
  [doi:10.1086/158109](https://doi.org/10.1086/158109)
* Leaver, E. W. (1985). "An analytic representation for the quasi-normal
  modes of Kerr black holes." *Proc. R. Soc. Lond. A* 402, 285–298.
  [doi:10.1098/rspa.1985.0119](https://doi.org/10.1098/rspa.1985.0119). The
  continued-fraction method `src/qnm.js` implements.
* Echeverria, F. (1989). "Gravitational-wave measurements of the mass and
  angular momentum of a black hole." *Phys. Rev. D* 40, 3194–3203.
  [doi:10.1103/PhysRevD.40.3194](https://doi.org/10.1103/PhysRevD.40.3194)
* Kokkotas, K. D. & Schmidt, B. G. (1999). "Quasi-normal modes of stars and
  black holes." *Living Rev. Relativ.* 2, 2.
  [doi:10.12942/lrr-1999-2](https://doi.org/10.12942/lrr-1999-2)
* Nollert, H.-P. (1999). "Quasinormal modes: the characteristic 'sound' of
  black holes and neutron stars." *Class. Quantum Grav.* 16, R159–R216.
  [doi:10.1088/0264-9381/16/12/201](https://doi.org/10.1088/0264-9381/16/12/201)
* Dreyer, O., Kelly, B., Krishnan, B., Finn, L. S., Garrison, D. &
  Lopez-Aleman, R. (2004). "Black-hole spectroscopy: testing general
  relativity through gravitational-wave observations." *Class. Quantum
  Grav.* 21, 787–803.
  [doi:10.1088/0264-9381/21/4/003](https://doi.org/10.1088/0264-9381/21/4/003)
* Berti, E., Cardoso, V. & Will, C. M. (2006). "Gravitational-wave
  spectroscopy of massive black holes with the space interferometer LISA."
  *Phys. Rev. D* 73, 064030.
  [doi:10.1103/PhysRevD.73.064030](https://doi.org/10.1103/PhysRevD.73.064030).
  Tables II and V are the test values above.
* Hod, S. (2008). "Slow relaxation of rapidly rotating black holes."
  *Phys. Rev. D* 78, 084035.
  [doi:10.1103/PhysRevD.78.084035](https://doi.org/10.1103/PhysRevD.78.084035)
* Berti, E., Cardoso, V. & Starinets, A. O. (2009). "Quasinormal modes of
  black holes and black branes." *Class. Quantum Grav.* 26, 163001.
  [doi:10.1088/0264-9381/26/16/163001](https://doi.org/10.1088/0264-9381/26/16/163001)
* Yang, H., Zhang, F., Zimmerman, A., Nichols, D. A., Berti, E. & Chen, Y.
  (2013). "Branching of quasinormal modes for nearly extremal Kerr black
  holes." *Phys. Rev. D* 87, 041502.
  [doi:10.1103/PhysRevD.87.041502](https://doi.org/10.1103/PhysRevD.87.041502)
* Cook, G. B. & Zalutskiy, M. (2014). "Gravitational perturbations of the
  Kerr geometry: High-accuracy study." *Phys. Rev. D* 90, 124021.
  [doi:10.1103/PhysRevD.90.124021](https://doi.org/10.1103/PhysRevD.90.124021)
* Hughes, S. A. (2000). "Evolution of circular, nonequatorial orbits of Kerr
  black holes due to gravitational-wave emission." *Phys. Rev. D* 61, 084004.
  Spheroidal harmonics as sums of spherical ones.
  [doi:10.1103/PhysRevD.61.084004](https://doi.org/10.1103/PhysRevD.61.084004)

**Exciting the modes and the inspiral**

* Peters, P. C. & Mathews, J. (1963). "Gravitational radiation from point
  masses in a Keplerian orbit." *Phys. Rev.* 131, 435–440.
  [doi:10.1103/PhysRev.131.435](https://doi.org/10.1103/PhysRev.131.435)
* Peters, P. C. (1964). "Gravitational radiation and the motion of two point
  masses." *Phys. Rev.* 136, B1224–B1232.
  [doi:10.1103/PhysRev.136.B1224](https://doi.org/10.1103/PhysRev.136.B1224).
  With Peters & Mathews, the leading-order chirp.
* Newman, E. T. & Penrose, R. (1966). "Note on the Bondi-Metzner-Sachs
  group." *J. Math. Phys.* 7, 863–870.
  [doi:10.1063/1.1931221](https://doi.org/10.1063/1.1931221); Goldberg,
  J. N., Macfarlane, A. J., Newman, E. T., Rohrlich, F. & Sudarshan,
  E. C. G. (1967). "Spin-s spherical harmonics and ð." *J. Math. Phys.* 8,
  2155–2161. [doi:10.1063/1.1705135](https://doi.org/10.1063/1.1705135).
  Spin-weighted spherical harmonics.
* Bardeen, J. M., Press, W. H. & Teukolsky, S. A. (1972). "Rotating black
  holes: locally nonrotating frames, energy extraction, and scalar
  synchrotron radiation." *Astrophys. J.* 178, 347.
  [doi:10.1086/151796](https://doi.org/10.1086/151796). Innermost stable
  circular orbits.
* Buonanno, A., Cook, G. B. & Pretorius, F. (2007). "Inspiral, merger, and
  ring-down of equal-mass black-hole binaries." *Phys. Rev. D* 75, 124018.
  [doi:10.1103/PhysRevD.75.124018](https://doi.org/10.1103/PhysRevD.75.124018)
* Kamaretsos, I., Hannam, M., Husa, S. & Sathyaprakash, B. S. (2012).
  "Black-hole hair loss: Learning about binary progenitors from ringdown
  signals." *Phys. Rev. D* 85, 024018.
  [doi:10.1103/PhysRevD.85.024018](https://doi.org/10.1103/PhysRevD.85.024018)
* Gossan, S., Veitch, J. & Sathyaprakash, B. S. (2012). "Bayesian model
  selection for testing the no-hair theorem with black hole ringdowns."
  *Phys. Rev. D* 85, 124056.
  [doi:10.1103/PhysRevD.85.124056](https://doi.org/10.1103/PhysRevD.85.124056).
  The amplitude fits in ν used here (their Eqs. 5–8).
* Kamaretsos, I., Hannam, M. & Sathyaprakash, B. S. (2012). "Is black-hole
  ringdown a memory of its progenitor?" *Phys. Rev. Lett.* 109, 141102.
  [doi:10.1103/PhysRevLett.109.141102](https://doi.org/10.1103/PhysRevLett.109.141102)

**Ringdowns observed**

* Abbott, B. P. et al. (2016). "Tests of general relativity with GW150914."
  *Phys. Rev. Lett.* 116, 221101.
  [doi:10.1103/PhysRevLett.116.221101](https://doi.org/10.1103/PhysRevLett.116.221101)
* Isi, M., Giesler, M., Farr, W. M., Scheel, M. A. & Teukolsky, S. A.
  (2019). "Testing the no-hair theorem with GW150914." *Phys. Rev. Lett.*
  123, 111102.
  [doi:10.1103/PhysRevLett.123.111102](https://doi.org/10.1103/PhysRevLett.123.111102)
* Giesler, M., Isi, M., Scheel, M. A. & Teukolsky, S. A. (2019). "Black hole
  ringdown: the importance of overtones." *Phys. Rev. X* 9, 041060.
  [doi:10.1103/PhysRevX.9.041060](https://doi.org/10.1103/PhysRevX.9.041060)
* Abbott, R. et al. (2021). "Tests of general relativity with binary black
  holes from the second LIGO-Virgo gravitational-wave transient catalog."
  *Phys. Rev. D* 103, 122002.
  [doi:10.1103/PhysRevD.103.122002](https://doi.org/10.1103/PhysRevD.103.122002)
* Abbott, R. et al. (LIGO, Virgo and KAGRA Collaborations) (2025). "Tests of
  general relativity with GWTC-3." *Phys. Rev. D* 112, 084080.
  [doi:10.1103/PhysRevD.112.084080](https://doi.org/10.1103/PhysRevD.112.084080)
* Abac, A. G. et al. (LIGO, Virgo and KAGRA Collaborations) (2025).
  "GW250114: Testing Hawking's area law and the Kerr nature of black
  holes." *Phys. Rev. Lett.* 135, 111403.
  [doi:10.1103/kw5g-d732](https://doi.org/10.1103/kw5g-d732)

### Earlier software, audio and sonifications

**Software for the same computation**

* Stein, L. C. (2019). "qnm: A Python package for calculating Kerr
  quasinormal modes, separation constants, and spherical-spheroidal mixing
  coefficients." *J. Open Source Softw.* 4(42), 1683.
  [doi:10.21105/joss.01683](https://doi.org/10.21105/joss.01683).
  [Code](https://github.com/duetosymmetry/qnm): a Leaver solver with
  Cook and Zalutskiy's spectral treatment of the angular equation.
* [Ringdown data and routines](https://centra.tecnico.ulisboa.pt/network/grit/files/ringdown/)
  (E. Berti, CENTRA, Técnico Lisboa): tabulated Kerr quasinormal
  frequencies and separation constants, accompanying Berti, Cardoso & Will
  (2006) and Berti, Cardoso & Starinets (2009).
* [QNM](https://bhptoolkit.org/modules/qnm-mathematica/) (Black Hole
  Perturbation Toolkit): a Mathematica package for Teukolsky quasinormal
  modes of Schwarzschild and Kerr holes, with a Leaver option.
* [pyRing](https://lscsoft.docs.ligo.org/pyring/) (G. Carullo, W. Del
  Pozzo and J. Veitch): time-domain Bayesian inference for black-hole
  ringdowns.
* [ringdown](https://github.com/maxisi/ringdown) (M. Isi and W. M. Farr):
  Bayesian analysis of black-hole ringdowns in gravitational-wave data;
  Isi & Farr (2021), "Analyzing black-hole ringdowns",
  [arXiv:2107.05609](https://arxiv.org/abs/2107.05609).

**Gravitational waves as sound**

* [The Sound of Two Black Holes Colliding](https://www.ligo.caltech.edu/video/ligo20160211v2)
  (LIGO Lab, Caltech, 2016): GW150914 at its true frequencies and shifted
  up into the audible range.
* [GW250114 vs. GW150914 audio](https://www.ligo.caltech.edu/video/ligo20250910v1)
  (LIGO Lab, Caltech; D. Davis, 2025): both signals at their original
  pitch and raised by 30 %.
* [Audio files](https://gwosc.org/audio/) (Gravitational Wave Open Science
  Center): sound files of detected events, with the matching templates.
* [Sounds of Spacetime](https://www.soundsofspacetime.org/) (M. Favata and
  students, Montclair State University): an audio guide to the
  gravitational waves of coalescing binaries.
* Hughes, S. A. (2003). "Listening to the universe with gravitational-wave
  astronomy." *Ann. Phys.* 303, 142–178.
  [doi:10.1016/S0003-4916(02)00025-8](https://doi.org/10.1016/S0003-4916%2802%2900025-8).
  His [gravitational-wave sounds](https://web.mit.edu/sahughes/www/sounds.html)
  include inspirals into Kerr black holes.
* [Black Hole Hunter](https://www.blackholehunter.org/) (Cardiff University
  Gravitational Physics Group): a game of picking out a black-hole signal
  by ear in detector noise.
* Valle, A. & Korol, V. (2022). "For LISA. A piano-based sonification
  project of gravitational waves."
  [arXiv:2202.04621](https://arxiv.org/abs/2202.04621)
