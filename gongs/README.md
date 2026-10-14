# Gong Keyboard

Every key is a thin bronze plate, or a shallow dome, hanging free and struck
by a mallet. Its vibrations are **geometrically nonlinear**: once the plate
bends by a fraction of its thickness, it has to stretch as well as bend, and the
stretching couples its modes. Struck softly it rings like a bell, one clear
strike tone and a few inharmonic partials. Struck hard, energy cascades from the
few modes the mallet excites into dozens of higher ones (the wave turbulence
behind a tam-tam's crash), and the pitch moves: a flat plate stiffens and its
note slides down as it rings out, while a dome softens and its note slides up,
like the two Chinese opera gongs. None of it is recorded. It is the von Kármán
shallow-shell equations, integrated live.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/gongs/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (49 keys, C2–C6) |
| `←` `→` | octave |
| `↑` `↓` | velocity (the mallet's speed goes as velocity²) |
| `Space` | sustain: keeps your hand off the gongs after key-up |
| MIDI | notes, velocity, sustain pedal (CC64); **mod wheel = strike point**; aftertouch = a hand pressed on the gong |

## The physics

### 1. The plate and its modes

A Kirchhoff plate of radius a, thickness h, Young's modulus E, density ρ,
Poisson ratio ν = 0.33, with bending stiffness D = Eh³/12(1−ν²). Lengths are
measured in a, the deflection w in thicknesses h, and time in
τ = a²√(ρh/D) = √12 a²/(h c_p), with c_p = √(E/ρ(1−ν²)) (3680 m/s for bell
bronze). The linear modes are

  Φ_ms(r, θ) = [J_m(λr) + C I_m(λr)] cos mθ,   ω = λ²/τ,

with C and λ fixed by the rim. A gong hangs on cords, so its rim is **free**
(no bending moment, no Kirchhoff shear: W″ + ν(W′ − m²W) = 0 and
(∇²W)′ − (1−ν)m²(W′ − W) = 0 at r = 1). The page also offers a **clamped** rim
(W = W′ = 0). `src/plate.js` finds the roots of the characteristic
determinants, with Bessel functions from their power series and, for large
arguments, from the periodic integral (1/2π)∫cos(mτ − x sin τ)dτ, where the
trapezoidal rule converges exponentially.

The first free-edge modes, λ² (ν = 0.33), labelled (nodal diameters, nodal circles):

| (2,0) | (0,1) | (3,0) | (1,1) | (4,0) | (5,0) | (2,1) | (0,2) |
|---|---|---|---|---|---|---|---|
| 5.262 | 9.069 | 12.244 | 20.513 | 21.527 | 33.062 | 35.243 | 38.507 |

The tests check the ν = 0.3 values against Leissa's *Vibration of Plates*
(5.358, 9.003, 12.439, 20.475, 21.835, 33.495, 35.260, 38.443, all to 2×10⁻⁴),
and the clamped values (10.2158, 21.2604, 34.8770, 39.7711, …).

The mallet always lands on the line θ = 0, so by mirror symmetry it never
excites the sin mθ companion of any mode, and the coupling cannot create them.
Only the cos mθ family is simulated: 41 modes up to λ² = 260 (m ≤ 14) for the
free plate, 35 for the clamped one.

### 2. Von Kármán: bending that has to stretch

In these units the von Kármán equations for a plate with an initial shape w₀ are

  ẅ + ∇⁴w = 12(1−ν²) L(w + w₀, F) + p,     ∇⁴F = −½ [L(w, w) + 2L(w, w₀)],

where F is the Airy stress function of the in-plane (membrane) forces and
L(f, g) = f_xx g_yy + f_yy g_xx − 2 f_xy g_xy is the Monge–Ampère bracket. In-plane
inertia is neglected: the disc's lowest in-plane resonance (ωa/c_p ≈ 1.4) lies
above every bending mode kept, about twice the top one at C2 and eight times it at C6.

The hanging gong's rim is also free in its own plane (N_rr = N_rθ = 0), which is
F = ∂F/∂r = 0. The eigenfunctions of ∇⁴Ψ = ζ⁴Ψ under those conditions are the
clamped-plate modes, and with them ∫ Φ_k L(Φ_p, Ψ) dA = ∫ Ψ L(Φ_p, Φ_k) dA for
any Φ (Touzé, Thomas & Chaigne 2002; Thomas & Bilbao 2008). Expanding
w = Σ x_k Φ_k and F = Σ η_n Ψ_n then gives a **conservative** modal system,

  ẍ_k + ω_k² x_k = −∂V/∂x_k + φ_k F_mallet,
  V = ½ Σ_n C_n s_n²,   C_n = 3(1−ν²)/ζ_n⁴,   s_n = Σ_pq H^n_pq x_p x_q + 2κ Σ_p E^n_p x_p,
  H^n_pq = ∫ Ψ_n L(Φ_p, Φ_q) dA,   E^n_p = ∫ Ψ_n ∇²Φ_p dA.

V ≥ 0 is the stretching energy. The angular integrals vanish unless
j_n = m_p + m_q or |m_p − m_q| (j_n is Ψ_n's angular index), so H is sparse.
`tools/gongs-modes.mjs` computes H with 200-point Gauss–Legendre radial
quadrature against 68 in-plane modes (ζ² ≤ 600), giving 6492 nonzero
couplings for the free plate, and stores the strongest 4000 in
`data/gong-modes.js`.

Two independent checks are in the tests. The bracket's symmetry, computed both
ways round, agrees to 10⁻⁶. For an axisymmetric deflection the compatibility
equation integrates once, (∇²F)′ = −w_r²/2r, so the stretching energy can be found
by 1-D quadrature with no modes at all. The modal tensor reproduces it to 3×10⁻⁵.

For one mode alone, V = Γx⁴/4 with Γ = 2ΣC_n(H^n_pp)²: a hardening (Duffing)
spring. For the strike tone (0,1) of the free plate, the pitch rises by
3Γa²/8ω² ≈ 0.42 a² (relative): +7 ¢ at a modal amplitude of a tenth of the
thickness, and roughly a third at one thickness (where the expansion is already
stretched). Axisymmetric modes stiffen far more than the others because they
cannot bend without stretching.

### 3. Curvature: the shallow dome

The **Dome rise** knob turns the plate into a shallow spherical cap,
w₀ = κr²/2 in these units, where κ = a²/(Rh) = 2 × (rise at the rim in
thicknesses). This is the imperfect-plate treatment of Camier, Touzé & Thomas
(2009), projected on the flat plate's modes. Curvature does two things:

* **Membrane stiffness.** The part of V that is quadratic in x,
  K_c = 4ΣC_n E^n E^nᵀ κ², stiffens the plate. It is diagonalised per angular
  block into "shell modes" (`shell()` in `gongs-model.js`; K_c is summed over about
  200 in-plane modes, ζ² ≤ 3000, which converges it to 10⁻⁵). For the free plate's
  axisymmetric modes the result is **exactly Reissner's (1955)** shallow-shell
  formula ω² = ω_plate² + E/(ρR²), that is ω̄² = λ⁴ + 12(1−ν²)κ². These modes have
  zero mean, so they are Laplacians of clamped functions, and the bound
  K_c ≤ 12(1−ν²)κ² is attained. The tests check this to 10⁻⁴. The (2,0) mode
  can bend without stretching and takes only 0.19 % of that stiffening. So a dome's
  strike tone rises well above its lowest modes: at a rise of 2.5 h, (0,1) moves
  from 1.72× to 3.5× the (2,0) frequency.
* **Quadratic nonlinearity**, the cross term 2C_n Q_n ℓ_n between the quadratic
  and linear parts of s_n. It always softens. To leading order (Lindstedt; Touzé,
  Thomas & Chaigne 2004), for x_p = a cos ωt,

  ω² = Ω_p² + a² [ ¾Γ_p − Σ_k δ_k² (1/Ω_k² + 1/2(Ω_k² − 4Ω_p²)) ],
  δ_k = Σ_n 2C_n (H̃^n_pp Ẽ^n_k + 2H̃^n_pk Ẽ^n_p).

For the free plate's strike tone the bracket changes sign at a **rise of
0.70 h** (1.03 h for the clamped plate). Flatter gongs harden: their pitch
starts sharp and **glides down** as the note dies away (the big opera gong). Domed
ones soften and **glide up** (the small one; Fletcher 1985 found this crossover
for quasi-spherical caps). d(ω/Ω)/d(a²) is +0.42 flat, −0.19 at 1 h, −0.33 at
1.5 h, −0.29 at 2.5 h. The mode table on the page shows it, mode by mode, as
the shift at a = 0.3 h.

The dome also brings **internal resonances**, as Thomas, Touzé & Chaigne
(2005) found for free spherical shells. Near a rise of 0.8 h the strike tone
sits at twice the (2,0) frequency, and the quadratic term pumps (2,0) even at
pp, giving a hum an octave down. At 1.5 h, struck harder, the softened (0,1)
pumps (3,0) parametrically within 0.1 s. Both are physical and left in. The
default gong has a 0.4 h dome: its strike tone hardens a little more than half
as much as a flat plate's (0.24 against 0.42) and is 10 % clear of the 1:2
resonance.

### 4. One gong, every key: the scaling

In these units the equations contain no size at all. Every key is therefore the
same gong scaled: radius a ∝ 1/f at a fixed thickness ratio h/a, with the mallet
scaled with it (mass a fixed fraction of the gong's, head radius 0.08 a). Then
the Hertz contact constant K̄ = K h^½ a²/D is the same at every key too, and the
motion in thicknesses is identical: only the clock runs faster. All keys share
one table. Each key keeps the modes below a third of its sample rate (below), so
only the top keys lose some.

The key's frequency fixes its size, a = (h/a) c_p Ω_tuned/(√12 · 2πf). With the
default h/a = 1 % in bronze and the default 0.4 h dome:

| key | strike tone | diameter | thickness | mass | modes kept | strike tone T₆₀ |
|---|---|---|---|---|---|---|
| C2 | 65 Hz | 49 cm | 2.4 mm | 4.0 kg | 41, to 1.7 kHz | 68 s |
| C3 | 131 Hz | 24 cm | 1.2 mm | 500 g | 41, to 3.5 kHz | 22 s |
| A3 | 220 Hz | 15 cm | 0.73 mm | 100 g | 41, to 5.8 kHz | 8.7 s |
| A4 | 440 Hz | 7 cm | 0.36 mm | 13 g | 27, to 7.3 kHz | 2.5 s |
| C6 | 1047 Hz | 3 cm | 0.15 mm | 1 g | 12, to 7.0 kHz | 0.7 s |

What sets the regime is the impact speed in these units,
v̄ = vτ/h = √12 v/(c_p (h/a)²). The deflection in thicknesses grows with v̄, and
the nonlinear energy with v̄². **Thinner is wilder**, as (a/h)²: at the
same strike a 0.4 % tam-tam crashes where a 2 % plate just rings (demo 04).
Steel, with its higher c_p, is tamer than bronze at the same speed.

### 5. The mallet

The mallet is a Hertzian sphere, F = K δ^{3/2} with K = (4/3)E* √R. Its head
modulus runs from yarn (0.3 MPa) through felt (2 MPa) and rubber (10 MPa) to wood
(2 GPa). Its mass is a fraction μ of the gong's, and it moves as
ẍ_m = −F̄/(πμ) in these units. The contact force is the discrete gradient of the
contact potential, (Φ(δ⁺) − Φ(δ⁻))/(δ⁺ − δ⁻), solved by a safeguarded Newton
iteration together with the plate (Bilbao 2009, ch. 4). The contact therefore
conserves energy, and the mallet bounces off naturally. At A3, mf, the default
4 MPa head touches for about 1.7 ms (the readout under the mode table). The
contact excites the modes in proportion to their shape at the strike point.
At the centre only the axisymmetric modes respond: they form an invariant
subspace, and the test checks that every other coordinate stays exactly zero.
Towards the rim the asymmetric modes join in, the low (2,0) among them.
Velocity sets the impact speed, v = v_max·vel² (v_max = 9 m/s by default).

### 6. Time stepping that cannot blow up

Each mode follows the exact damped recursion, written in energy form,

  (1+σ̃h) x⁺ − 2c̃ x + (1−σ̃h) x⁻ = h² [ φ F − g (ψ⁺ + ψ⁻)/2 ],

so its frequency and decay are exact at any step h. The nonlinear force uses a
**scalar auxiliary variable** (SAV; Shen, Xu & Yang 2018; for musical systems
Bilbao, Ducceschi & Zama 2023). ψ ≈ √(2V_nl + ε₀) is advanced by
ψ⁺ = ψ⁻ + g·(x⁺ − x⁻)/2 with g = ∇V_nl/√(2V_nl + ε₀) taken at xⁿ. For any g at
all, Σ½(δx)² + ½ω̃²x⁺x + ψ²/2 + mallet + contact is conserved exactly when σ = 0.
x⁺ comes from a rank-one (Sherman–Morrison) solve, so a step costs one gradient,
two passes over the sparse coupling list, and O(modes) more. The tests check
energy to 10⁻⁹ through a fortissimo strike.

The SAV is only second-order accurate, and a drifting ψ lets the ε₀ "reservoir"
leak into the modes. So:

* **Consistency projection.** Each step ψ is reset to √(V(xⁿ) + V(xⁿ⁻¹) + ε₀),
  and the plate velocity (with the mallet's, so the contact is untouched) is
  rescaled by s ≈ 1 to keep the scheme's energy unchanged. This is in the spirit
  of relaxed and generalised SAV schemes.
* **Adaptive substeps.** The size of that correction is the error estimate.
  Above 2 % per step the voice halves its step, down to 8 substeps per sample,
  and comes back once it has been below 0.2 % for 20 ms. At the strike, the step
  is also chosen to resolve the Hertz contact with at least 12 points. State
  changes between step sizes are exact for modal motion under a constant
  contact force.
* **Snap-through.** A dome hit hard can invert. The cubic part of V_nl then goes
  far below zero (in the shell-mode split, the stretching energy is carried by
  the linear stiffness), and ε₀ is raised as needed. It is only a reference level.
* **Passivity guard**, the last resort: the gong may not hold more energy than
  its mallets gave it. The guard has fired only at absurd settings (a 3 ‰ steel
  dome hit at 12 m/s), and the tests check that it never acts for any preset.

Against an RK4 integration of the same modal equations at a quarter of the step,
the free-vibration frequency agrees to 0.1 ¢, and both match the normal-form
backbone at small amplitude, for the flat plate and for the dome.

**Rates and cost.** Each voice runs at fs/R (R = 2, 4 or 8), the lowest rate
that holds all its modes below fs/3R (where Ωh ≤ 2, the SAV stays accurate). It
uses its 600 strongest couplings: H̃ in shell coordinates, ranked by the weight
√C_n|H̃|/(Ω_iΩ_j), which measures each term's share of V when the modes share
energy equally. A polyphase Kaiser-windowed sinc interpolates each rate back
to fs. A voice drops the nonlinear part once V_nl is below 10⁻⁸ of its energy,
because its pitch is then linear to far better than 0.01 ¢. On this machine (Apple M2 Max, Node),
four gongs struck fff at once take **25 % of real time**, and ten take 60 %.

### 7. Damping

Each mode loses energy at σ = ωη/2, with the loss factor η the sum of three terms:

* **internal friction** η_int (a knob, default 1.5×10⁻⁴);
* **thermoelastic relaxation** (Zener): Δ ωτ_th/(1 + ω²τ_th²), with
  Δ = Eα²T/(ρc)·(1+ν)/(1−ν) = 6×10⁻³ for bronze and τ_th = h²/(π²D_th). Heat flows
  across the thickness between the compressed and the stretched face. This is
  the term that does not scale with size: it peaks at 3 Hz for the 2.4 mm C2
  gong, at 36 Hz at A3, and at 810 Hz for the 0.15 mm C6 one;
* **radiation**: ρ₀c₀σ_rad/(ρhω). The radiation efficiency σ_rad below coincidence
  (here f_c = 7–115 kHz) is Maidanik's edge-mode result for a baffled plate,
  rolled off by (ka)²/(1 + (ka)²) where the gong is smaller than the wavelength,
  since a free disc moves no net air.

At A3 that gives T₆₀ = 8.7 s for the strike tone, 4.5 s at 770 Hz and 1.8 s at
2.9 kHz (the table above has the strike tone across the keyboard). The decay test
measures it in the output to within 3 %. Key-up applies a hand (extra modal
damping, T₆₀ = 2.5 s by default); Space or the pedal keeps it off.

### 8. What you hear

The output is each mode's surface velocity, weighted by (σ_rad/σ_rad,tone)^(far/2),
and by its shape at two points near the rim (r = 0.9a and 0.75a, off the strike
line), which makes a decorrelated stereo pair. The **Microphone distance** knob
sets "far". A close microphone (far = 0) hears the plate's own motion, dominated by
the strike tone. In the room (far = 1) each mode is heard by the power it
radiates, ∝ σ_rad⟨v²⟩. These gongs are smaller than the wavelength of their
strike tone (ka ≈ 0.3), which they therefore radiate poorly, so the room hears the
upper modes, and the crash, more strongly. The default is 0.6.

### Tuning

Each key's **strike tone** is tuned to 12-TET at small amplitude. This is the
first axisymmetric mode, the one a centre strike excites and the gong's
pitch. Its frequency is exact in the scheme, so tuning only sets the time
scale. The test measures it from the output of a soft centre strike at all
49 keys: every one is within ±3 ¢. Louder notes start sharp (flat plate) or flat
(dome) and glide into tune. That is the physics, and the bottom trace of the
*Energy cascade* view shows it in cents.

## What to listen for

`examples/gongs/` (regenerate with `node tools/render-gongs.mjs`):

1. **01-slow-gong-melody**: a pentatonic phrase on soft strikes over two low
   gongs, every note left to ring. Nearly linear: bells.
2. **02-pp-mf-fff-bell-to-crash**: one gong (A3) at 0.7, 3.2 and 9 m/s. The
   strike tone and its (1,1) partial; then a shimmer; then the crash, whose
   spectral centroid jumps from 240 Hz to about 1 kHz for half a second before
   the energy drains back down.
3. **03-flat-glides-down-dome-glides-up**: the same opera-gong strike on E4. The
   flat plate starts +220 ¢ sharp and falls into tune within a second; the
   2.5 h dome starts −195 ¢ flat and rises over two.
4. **04-thick-stays-a-bell-thin-crashes**: the same 4.4 m/s strike on h/a = 2 %
   (a bell) and on 0.4 % (a crash: 30 % of the energy above 2 kHz).
5. **05-centre-then-rim-strike**: dead centre gives one clean tone. Near the rim
   the (2,0) mode an octave and a half below, and the other asymmetric modes,
   join in.
6. **06-tam-tam-roll-swells-to-crash**: a thin tam-tam rolled with a soft
   beater. A hum swells and, past a threshold, the cascade switches on (half the
   energy above 2 kHz), then sinks back into the hum.
7. **07-hanging-then-clamped**: the same strike on the free gong and on the
   plate clamped in a frame. Different mode ratios, no (2,0) below the
   fundamental, a stiffer and less nonlinear plate.

On the page, the **gong** view draws the struck gong's displacement from its
live mode amplitudes, with the motion slowed. The **spectrogram** shows the
cascade filling in upwards. The **energy cascade** view plots the energy in
octave bands of mode frequency and the strike tone's pitch. The mode table lists
each mode's frequency, T₆₀, how strongly the current strike point excites it, and
its normal-form pitch shift.

## Files

```
gongs/index.html, style.css          page
gongs/src/plate.js                   circular plate: Bessel functions, modes, von Kármán couplings
gongs/src/gongs-model.js             shell modes, coupling selection, scaling per key, damping, normal form
gongs/src/gongs-engine.js            real-time engine: SAV scheme, mallet, substeps, rates (AudioWorklet and Node)
gongs/src/gongs-params.js            parameters and presets
gongs/src/gongs-main.js              page wiring and views
gongs/data/gong-modes.js             generated tables (node tools/gongs-modes.mjs, ~1 s)
test/gongs-tests.mjs                 node test/gongs-tests.mjs (20 tests, ~11 s)
tools/render-gongs.mjs               node tools/render-gongs.mjs → examples/gongs/
```

## Simplifications

* **A few dozen modes.** A real tam-tam's crash spreads over thousands of
  modes to 20 kHz. Here 41 modes reach 28× the strike tone, so the low gongs
  are band-limited (C2 stops at 1.8 kHz), and the cascade is a caricature
  of wave turbulence: it shows the transition and the broadening, not the
  Kolmogorov–Zakharov spectrum. The 600 couplings kept are the strongest
  (equipartition-weighted) of about 6000; the cascade's look barely changes
  between 300 and 4000 of them, but the details are chaotic anyway.
* **No companion modes.** Only the cos mθ family is simulated. A real gong's
  imperfections couple each mode to its sin mθ twin: nodal lines then drift,
  the sound beats, and travelling waves appear. A perfectly round model struck
  on one line cannot do any of that.
* **Truncations.** The in-plane basis (68 modes, ζ² ≤ 600) converges the
  low modes' couplings to 10⁻⁴ but not the highest ones'. In-plane inertia is
  neglected.
* **The integrator.** Against RK4 it is accurate at moderate amplitude. At
  deflections of several thicknesses it is an energy-correct, structure-correct
  approximation driven by the projection and the substeps, not a converged
  solution.
* **Geometry.** A uniform flat plate or spherical cap. Real gongs have
  bosses, turned rims, hammered thickness variations, and (opera gongs) a
  flat centre with a conical shoulder. ν is fixed at 0.33 for the mode shapes of
  every material, and the dome's sign (struck on its convex side) is fixed.
* **Mallet.** An elastic Hertz sphere, without the hysteresis of felt.
* **Losses and sound.** Maidanik's formula is for baffled plates; the
  small-gong roll-off is a dipole-like estimate; the microphones are points
  plus a room-power weighting, not a radiation calculation. Thermoelastic loss
  has a single relaxation time.
* **Scaling.** h/a is the same at every key, so the top keys are centimetre-wide
  foils with few modes and short rings (C6: T₆₀ 0.7 s), while real small gongs
  are thicker and domed. The Thickness, Dome and Thermoelastic loss knobs show
  why.

### Sources

A. W. Leissa, *Vibration of Plates*, NASA SP-160 (1969). · C. Touzé, O. Thomas,
A. Chaigne, "Asymmetric non-linear forced vibrations of free-edge circular
plates, part 1: theory", *J. Sound Vib.* 258 (2002). · C. Touzé, O. Thomas,
A. Chaigne, "Hardening/softening behaviour in non-linear oscillations of
structural systems using non-linear normal modes", *J. Sound Vib.* 273 (2004).
· O. Thomas, C. Touzé, A. Chaigne, "Non-linear vibrations of free-edge thin
spherical shells: modal interaction rules and 1:1:2 internal resonance",
*Int. J. Solids Struct.* 42 (2005). · O. Thomas, S. Bilbao, "Geometrically
nonlinear flexural vibrations of plates: in-plane boundary conditions and some
symmetry properties", *J. Sound Vib.* 315 (2008). · C. Camier, C. Touzé,
O. Thomas, "Non-linear vibrations of imperfect free-edge circular plates and
shells", *Eur. J. Mech. A/Solids* 28 (2009). · M. Ducceschi, C. Touzé, "Modal
approach for nonlinear vibrations of damped impacted plates: application to
sound synthesis of gongs and cymbals", *J. Sound Vib.* 344 (2015). ·
S. Bilbao, *Numerical Sound Synthesis*, Wiley (2009), ch. 4 and 13. ·
J. Shen, J. Xu, J. Yang, "The scalar auxiliary variable (SAV) approach for
gradient flows", *J. Comput. Phys.* 353 (2018). · S. Bilbao, M. Ducceschi,
F. Zama, "Explicit exactly energy-conserving methods for Hamiltonian systems",
*J. Comput. Phys.* 472 (2023). · E. Reissner, "On transverse vibrations of thin,
shallow elastic shells", *Q. Appl. Math.* 13 (1955). · N. H. Fletcher,
"Nonlinear frequency shifts in quasispherical-cap shells: pitch glide in Chinese
gongs", *J. Acoust. Soc. Am.* 78 (1985). · A. Chaigne, C. Lambourg, "Time-domain
simulation of damped impacted plates", *J. Acoust. Soc. Am.* 109 (2001). ·
G. Maidanik, "Response of ribbed panels to reverberant acoustic fields",
*J. Acoust. Soc. Am.* 34 (1962).
