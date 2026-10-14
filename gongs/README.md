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
(W = W′ = 0: the edge cannot move or tilt, but it can still slide in its own
plane; see §2). `src/plate.js` finds the roots of the characteristic
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
  axisymmetric modes the result is **exactly Reissner's (1955b)** shallow-shell
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

The mallet is a Hertzian sphere (Hertz 1882), F = K δ^{3/2} with K = (4/3)E* √R. Its head
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

  (1+σ̃h) x⁺ − 2c̃ x + (1−σ̃h) x⁻ = h² W [ φ F − g (ψ⁺ + ψ⁻)/2 ],   W = sinc²(Ωh),

so its frequency and decay are exact at any step h. The nonlinear force uses a
**scalar auxiliary variable** (SAV; Shen, Xu & Yang 2018; for musical systems
Bilbao, Ducceschi & Zama 2023). ψ ≈ √(2V_nl + ε₀) is advanced by
ψ⁺ = ψ⁻ + g·(x⁺ − x⁻)/2 with g = ∇V_nl/√(2V_nl + ε₀) taken at xⁿ. For any g at
all, Σ(1/W)[½(δx)² + ½ω̃²x⁺x] + ψ²/2 + mallet + contact is conserved exactly when
σ = 0. For a mode oscillating with amplitude a, (1/W)[½(δx)² + ½ω̃²x⁺x] is exactly
its physical energy ½Ω²a², at any step: the weight W is what makes the
conserved quantity the physical energy. (Without it the conserved plate term is
sinc²(Ωh)·½Ω²a², and energy the coupling hands from the low modes to the top
ones, where Ωh ≈ 2 and sinc² ≈ 0.2, could grow up to fivefold; it did, by 1.7×
on real strikes and 2.6× in free vibration.) W = 1 − Ω²h²/3 + … leaves the low
modes alone. x⁺ comes from a rank-one (Sherman–Morrison) solve, so a step costs
one gradient, two passes over the sparse coupling list, and O(modes) more. The
tests check the scheme's energy to 10⁻⁹ through a fortissimo strike, and the
physical energy, from the mode amplitudes, with damping off: it stays within
2 % of what the strike left in the plate, and within 4 % in free vibration of
the C5 gong at full nonlinearity.

The SAV is only second-order accurate, and a drifting ψ lets the ε₀ "reservoir"
leak into the modes. So:

* **Consistency projection.** Each step ψ is reset to √(V(xⁿ) + V(xⁿ⁻¹) + ε₀),
  and the plate velocity (with the mallet's, so the contact is untouched) is
  rescaled by s ≈ 1 to keep the scheme's energy unchanged. This is in the spirit
  of relaxed (Jiang, Zhang & Zhao 2022) and generalised (Cheng, Liu & Shen 2021)
  SAV schemes. Near a turning point, where the plate
  has little motion to give, ψ may lag by a step.
* **Adaptive substeps.** The size of that correction is the error estimate.
  Above 2 % per step the voice halves its step, and comes back once it has
  been below 0.2 % for 20 ms. At the strike the step is also chosen to give the
  Hertz contact at least 6 points. State changes between step sizes are exact
  for modal motion (about each mode's mean, or under a constant contact force),
  and what the modal picture misses is put right by rescaling the velocity, so
  a change of step neither adds nor removes energy. Since the projection already
  keeps the energy right, this is capped at 2 substeps, and at 2 voices
  substepping at once, so that no audio block costs much more than the next.
* **Snap-through.** A dome hit hard can invert. The cubic part of V_nl then goes
  far below zero (in the shell-mode split, the stretching energy is carried by
  the linear stiffness), and ε₀ is raised as needed. It is only a reference level
  (and g is scaled with the raised one).
* **Passivity guard**, the last resort, checked every step: the gong may not
  hold more physical energy (plate, V_nl and mallet) than its mallets gave it,
  by more than 10⁻⁶ (5 % while ψ lags). It acts only when the plate is driven so
  far, tens of thicknesses, that a step no longer resolves its motion: the
  thinnest plates with the deepest domes hit hardest (for example a 3 ‰ clamped
  bronze dome, 4 h, at 12 m/s). Then it takes out what the scheme would invent,
  from the velocity or, if need be, by scaling the whole motion down, and lowers
  the bound by 0.1 % each time, so that such a gong dies away within a fraction
  of a second instead of ringing on in a state the model no longer describes.
  The tests check that it never acts for any preset, and that six such domes
  struck twice each (once a runaway to 34× full scale) now stay under 2.
* **Output.** A soft clip above 2 (towards 4) is the backstop after all that;
  playing at sane settings never reaches it.

Against an RK4 integration of the same modal equations at a quarter of the step,
the free-vibration frequency agrees to 0.1 ¢, and both match the normal-form
backbone at small amplitude, for the flat plate and for the dome.

**Rates and cost.** Each voice runs at fs/R (R = 2, 4 or 8), the lowest rate
that holds all its modes below fs/3R, so Ωh ≤ 2.07. A polyphase Kaiser-windowed
sinc interpolates each rate back to fs. At that step the scheme still conserves
the physical energy (above), but the top modes' response to the coupling is not
converged: near the threshold of the cascade (A3–C5 struck at velocity 0.8) the
share of energy above 4× the pitch comes out about 3 dB higher than with 2, 4 or 8
substeps (which scatter by ±1.5 dB among themselves); well into the crash (velocity 1) all
agree. Two substeps throughout would cost 1.5× on average and push the worst
audio block past half its budget, so the step stays. A voice's
nonlinear cost follows how nonlinear it is, measured by
r = (|V₄| + V₃²/E)/E (the largest value over each audio block, held for about
two periods of the strike tone, since V_nl itself nearly vanishes as the tone
crosses zero):

* r > 10⁻²: the 600 strongest couplings, H̃ in shell coordinates ranked by
  √C_n|H̃|/(Ω_iΩ_j), each term's share of V when the modes share energy equally;
* 2×10⁻⁴ < r < 10⁻²: the 200 strongest only. That is weakly nonlinear motion
  (pitch shift under ~1 %), and the lowest modes' normal-form pitch shifts
  are the same with 200 terms as with 600 (to 6 % for a dome, exactly for a
  flat plate);
* r < 2×10⁻⁴ (a pitch shift of ~0.3 ¢; the nonlinear exchange time 1/(rω)
  outlasts the ring), or r < 10⁻³ for a gong under −60 dB or 30 dB below the
  loudest: exact linear modal decay, about 15× cheaper.

At most **Nonlinear voices** gongs (default 4) run their coupling at once.
Beyond that the least nonlinear one rings on linearly, carrying on from where it
is: each mode keeps the frequency it had (timed from its last few zero crossings
about its mean) and its mean position (a dome that has snapped through stays
snapped), and each shift then fades with that mode's squared amplitude, as a
nonlinear shift would. Its cascade freezes, but its pitch neither jumps nor
stops gliding: cut off at +175 ¢ mid-glide, a flat opera gong measures +174 ¢
over the next four periods, against +169 ¢ left nonlinear; in a six-note chord
at velocity 0.8, a gong cut off at +620 ¢ measures +617 ¢ (+607 ¢ uncut); over
chords, the opera gongs and the tam-tam, the difference stays under 40 ¢ (it
used to drop to 0, up to 600 ¢ at once). Only a gong whose free vibration has
been timed for about 2.5 periods is handed over: at the cap, the two next in
line keep timing theirs (so the cap may be exceeded for those periods). A gong
whose coupling dies away by itself (r below 2×10⁻⁴, a 0.3 ¢ shift) simply goes
on as exact linear modes. The engine also
runs every code path once, on a silent gong, when it is created (about 35 ms,
before the audio starts), so that the JIT has compiled them and no block pays
for that later. The coupling tables for a setting of Dome rise, Coupling terms
and Rim (3–5 ms to build) are built on the page and sent with the parameters,
so moving those sliders never stalls the audio thread.

On this machine (Apple M2 Max, Node), four gongs struck fff at once, all on the
full coupling, take **25 % of real time**. Ten take 25 % under the default cap
(55 % if all ten run nonlinear). A 16-note fff melody, one note every 0.25 s
with the pedal held, averages 19 %, and its worst 128-sample block takes about
half its budget (41–56 % over three runs; 33 % keeping each block's fastest of
three runs, which removes the machine's own hiccups) (`node tools/bench-gongs.mjs`).

### 7. Damping

Each mode loses energy at σ = ωη/2, with the loss factor η the sum of three terms:

* **internal friction** η_int (a knob, default 1.5×10⁻⁴);
* **thermoelastic relaxation** (Zener 1937): Δ ωτ_th/(1 + ω²τ_th²), with
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
   2.5 h dome starts −190 ¢ flat and rises over two.
4. **04-thick-stays-a-bell-thin-crashes**: the same 4.4 m/s strike on h/a = 2 %
   (a bell) and on 0.4 % (a crash: 30 % of the energy above 2 kHz).
5. **05-centre-then-rim-strike**: dead centre gives one clean tone. Near the rim
   the (2,0) mode an octave and a half below, and the other asymmetric modes,
   join in.
6. **06-tam-tam-roll-swells-to-crash**: a thin tam-tam rolled with a soft
   beater. A hum swells and, past a threshold, the cascade switches on (half the
   energy above 2 kHz), then sinks back into the hum.
7. **07-hanging-then-clamped**: the same strike on the free gong and on the
   plate with its rim clamped. Different mode ratios, no (2,0) below the
   fundamental, a stiffer plate. It also sounds less nonlinear, but that is
   because its rim may still slide in its plane (see Simplifications): a rim
   really held in a frame would stretch about three times as much.

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
test/gongs-tests.mjs                 node test/gongs-tests.mjs (26 tests, ~22 s)
tools/render-gongs.mjs               node tools/render-gongs.mjs → examples/gongs/
tools/bench-gongs.mjs                node tools/bench-gongs.mjs: real-time load, block by block
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
  solution: near the cascade's threshold its top modes take a few dB more
  energy than at a finer step (§6). At tens of thicknesses (the thinnest, most
  domed plates hit hardest) it cannot follow the plate, and the guard damps it.
  The weakly nonlinear tail runs on the 200 strongest couplings, and past the
  nonlinear-voice cap a gong rings on linearly from where it is (its pitch glide
  continues, as a decaying per-mode shift; its cascade stops): both are CPU
  savings that change the sound only slightly.
* **The clamped rim slides.** The Airy basis keeps the in-plane edge free
  (F = F′ = 0, N_rr = N_rθ = 0) for both rims, so "clamped" holds the edge's
  position and slope but lets it slide radially. A plate really held in a frame
  is immovable in its plane too, and stretches more: for the axisymmetric
  (0,0) mode, a 1-D finite-element solution for the radial strain gives 2.98×
  the stretching energy (5.8× for the free plate's (0,1)). So the clamped
  plate's weak nonlinearity here (backbone 0.11 for the flat plate, against
  0.42 free) is an artefact of the edge condition: an immovable rim would put it
  near 0.33. An immovable in-plane edge needs a different Airy basis (its
  conditions on F are not local), and is not offered.
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

## Prior art and references

The physics this instrument computes, and the idea of synthesising gongs from
it, come from the work below. Every work cited above is listed here, with its
DOI or a stable link.

### The physics, credited to its originators

**Plate and shell equations**

* Kirchhoff, G. (1850). "Über das Gleichgewicht und die Bewegung einer
  elastischen Scheibe." *J. reine angew. Math.* 40, 51–88.
  [doi:10.1515/crll.1850.40.51](https://doi.org/10.1515/crll.1850.40.51).
  Thin-plate bending and its free-edge conditions (§1).
* Bryan, G. H. (1890). "On the stability of a plane plate under thrusts in its
  own plane, with applications to the 'buckling' of the sides of a ship."
  *Proc. London Math. Soc.* s1-22, 54–67.
  [doi:10.1112/plms/s1-22.1.54](https://doi.org/10.1112/plms/s1-22.1.54).
  Plate bending coupled to in-plane forces.
* Kármán, T. von (1910). "Festigkeitsprobleme im Maschinenbau." In
  *Encyklopädie der Mathematischen Wissenschaften* IV (Mechanik), 311–385.
  Teubner, Leipzig.
  [doi:10.1007/978-3-663-16028-1_5](https://doi.org/10.1007/978-3-663-16028-1_5)
  (reprint). The large-deflection plate equations of §2.
* Reissner, E. (1955a). "On transverse vibrations of thin, shallow elastic
  shells." *Q. Appl. Math.* 13(2), 169–176.
  [doi:10.1090/qam/69715](https://doi.org/10.1090/qam/69715).
* Reissner, E. (1955b). "On axi-symmetrical vibrations of shallow spherical
  shells." *Q. Appl. Math.* 13(3), 279–290.
  [doi:10.1090/qam/91034](https://doi.org/10.1090/qam/91034). The free-edge
  shell's axisymmetric frequencies, obtained from the flat plate's (§3).
* Leissa, A. W. (1969). *Vibration of Plates.* NASA SP-160.
  [NTRS 19700009156](https://ntrs.nasa.gov/citations/19700009156). The
  circular-plate frequencies the tests check.

**Nonlinear vibration of plates and shells, and the sound of gongs**

* Rossing, T. D. & Fletcher, N. H. (1983). "Nonlinear vibrations in plates and
  gongs." *J. Acoust. Soc. Am.* 73(1), 345–351.
  [doi:10.1121/1.388816](https://doi.org/10.1121/1.388816).
* Fletcher, N. H. (1985). "Nonlinear frequency shifts in quasispherical-cap
  shells: pitch glide in Chinese gongs." *J. Acoust. Soc. Am.* 78(6),
  2069–2073. [doi:10.1121/1.392664](https://doi.org/10.1121/1.392664).
  Hardening or softening with dome height (§3).
* Legge, K. A. & Fletcher, N. H. (1989). "Nonlinearity, chaos, and the sound of
  shallow gongs." *J. Acoust. Soc. Am.* 86(6), 2439–2443.
  [doi:10.1121/1.398451](https://doi.org/10.1121/1.398451).
* Fletcher, N. H. & Rossing, T. D. (1998). "Cymbals, gongs, plates, and steel
  drums." Ch. 20 of *The Physics of Musical Instruments*, 2nd ed., 649–674.
  Springer.
  [doi:10.1007/978-0-387-21603-4_20](https://doi.org/10.1007/978-0-387-21603-4_20).
  First edition 1991,
  [doi:10.1007/978-1-4612-2980-3](https://doi.org/10.1007/978-1-4612-2980-3).
* Touzé, C., Thomas, O. & Chaigne, A. (2002). "Asymmetric non-linear forced
  vibrations of free-edge circular plates. Part 1: Theory." *J. Sound Vib.*
  258(4), 649–676.
  [doi:10.1006/jsvi.2002.5143](https://doi.org/10.1006/jsvi.2002.5143). The
  modal von Kármán formulation with free in-plane edges (§2).
* Touzé, C., Thomas, O. & Chaigne, A. (2004). "Hardening/softening behaviour in
  non-linear oscillations of structural systems using non-linear normal modes."
  *J. Sound Vib.* 273(1–2), 77–101.
  [doi:10.1016/j.jsv.2003.04.005](https://doi.org/10.1016/j.jsv.2003.04.005).
  The normal-form pitch shifts of §3.
* Thomas, O., Touzé, C. & Chaigne, A. (2005). "Non-linear vibrations of
  free-edge thin spherical shells: modal interaction rules and 1:1:2 internal
  resonance." *Int. J. Solids Struct.* 42(11–12), 3339–3373.
  [doi:10.1016/j.ijsolstr.2004.10.028](https://doi.org/10.1016/j.ijsolstr.2004.10.028).
* Chaigne, A., Touzé, C. & Thomas, O. (2005). "Nonlinear vibrations and chaos
  in gongs and cymbals." *Acoust. Sci. Tech.* 26(5), 403–409.
  [doi:10.1250/ast.26.403](https://doi.org/10.1250/ast.26.403).
* Thomas, O. & Bilbao, S. (2008). "Geometrically nonlinear flexural vibrations
  of plates: in-plane boundary conditions and some symmetry properties."
  *J. Sound Vib.* 315(3), 569–590.
  [doi:10.1016/j.jsv.2008.04.014](https://doi.org/10.1016/j.jsv.2008.04.014).
* Camier, C., Touzé, C. & Thomas, O. (2009). "Non-linear vibrations of
  imperfect free-edge circular plates and shells." *Eur. J. Mech. A/Solids*
  28(3), 500–515.
  [doi:10.1016/j.euromechsol.2008.11.005](https://doi.org/10.1016/j.euromechsol.2008.11.005).
  The imperfect-plate treatment of the dome (§3).
* Ducceschi, M., Touzé, C., Bilbao, S. & Webb, C. J. (2014). "Nonlinear
  dynamics of rectangular plates: investigation of modal interaction in free
  and forced vibrations." *Acta Mech.* 225(1), 213–232.
  [doi:10.1007/s00707-013-0931-1](https://doi.org/10.1007/s00707-013-0931-1).
* Ducceschi, M. & Touzé, C. (2015). "Modal approach for nonlinear vibrations of
  damped impacted plates: application to sound synthesis of gongs and
  cymbals." *J. Sound Vib.* 344, 313–331.
  [doi:10.1016/j.jsv.2015.01.029](https://doi.org/10.1016/j.jsv.2015.01.029).
  Gongs and cymbals synthesised from struck, damped von Kármán plates in modal
  coordinates.

**Wave turbulence in plates**

* Zakharov, V. E. & Filonenko, N. N. (1967). "Weak turbulence of capillary
  waves." *J. Appl. Mech. Tech. Phys.* 8(5), 37–40.
  [doi:10.1007/BF00915178](https://doi.org/10.1007/BF00915178).
* Zakharov, V. E., L'vov, V. S. & Falkovich, G. (1992). *Kolmogorov Spectra of
  Turbulence I.* Springer.
  [doi:10.1007/978-3-642-50052-7](https://doi.org/10.1007/978-3-642-50052-7).
* Düring, G., Josserand, C. & Rica, S. (2006). "Weak turbulence for a vibrating
  plate: can one hear a Kolmogorov spectrum?" *Phys. Rev. Lett.* 97, 025503.
  [doi:10.1103/PhysRevLett.97.025503](https://doi.org/10.1103/PhysRevLett.97.025503).
* Boudaoud, A., Cadot, O., Odille, B. & Touzé, C. (2008). "Observation of wave
  turbulence in vibrating plates." *Phys. Rev. Lett.* 100, 234504.
  [doi:10.1103/PhysRevLett.100.234504](https://doi.org/10.1103/PhysRevLett.100.234504).
* Mordant, N. (2008). "Are there waves in elastic wave turbulence?"
  *Phys. Rev. Lett.* 100, 234505.
  [doi:10.1103/PhysRevLett.100.234505](https://doi.org/10.1103/PhysRevLett.100.234505).
* Touzé, C., Bilbao, S. & Cadot, O. (2012). "Transition scenario to turbulence
  in thin vibrating plates." *J. Sound Vib.* 331(2), 412–433.
  [doi:10.1016/j.jsv.2011.09.016](https://doi.org/10.1016/j.jsv.2011.09.016).

**Numerics**

* Bilbao, S. (2008). "A family of conservative finite difference schemes for
  the dynamical von Karman plate equations." *Numer. Methods Partial Differ.
  Equ.* 24(1), 193–216.
  [doi:10.1002/num.20260](https://doi.org/10.1002/num.20260).
* Bilbao, S. (2009). *Numerical Sound Synthesis: Finite Difference Schemes and
  Simulation in Musical Acoustics.* Wiley.
  [doi:10.1002/9780470749012](https://doi.org/10.1002/9780470749012). Ch. 4
  (the oscillator in musical acoustics: the mallet's contact, §5) and ch. 13
  (nonlinear plate vibration).
* Bilbao, S. (2010). "Percussion synthesis based on models of nonlinear shell
  vibration." *IEEE Trans. Audio Speech Lang. Process.* 18(4), 872–880.
  [doi:10.1109/TASL.2009.2029710](https://doi.org/10.1109/TASL.2009.2029710).
* Bilbao, S., Thomas, O., Touzé, C. & Ducceschi, M. (2015). "Conservative
  numerical methods for the full von Kármán plate equations." *Numer. Methods
  Partial Differ. Equ.* 31(6), 1948–1970.
  [doi:10.1002/num.21974](https://doi.org/10.1002/num.21974).
* Yang, X. (2016). "Linear, first and second-order, unconditionally energy
  stable numerical schemes for the phase field model of homopolymer blends."
  *J. Comput. Phys.* 327, 294–316.
  [doi:10.1016/j.jcp.2016.09.029](https://doi.org/10.1016/j.jcp.2016.09.029).
  Invariant energy quadratisation, from which SAV grew.
* Shen, J., Xu, J. & Yang, J. (2018). "The scalar auxiliary variable (SAV)
  approach for gradient flows." *J. Comput. Phys.* 353, 407–416.
  [doi:10.1016/j.jcp.2017.10.021](https://doi.org/10.1016/j.jcp.2017.10.021).
* Shen, J., Xu, J. & Yang, J. (2019). "A new class of efficient and robust
  energy stable schemes for gradient flows." *SIAM Rev.* 61(3), 474–506.
  [doi:10.1137/17M1150153](https://doi.org/10.1137/17M1150153).
* Cheng, Q., Liu, C. & Shen, J. (2021). "Generalized SAV approaches for
  gradient systems." *J. Comput. Appl. Math.* 394, 113532.
  [doi:10.1016/j.cam.2021.113532](https://doi.org/10.1016/j.cam.2021.113532).
* Jiang, M., Zhang, Z. & Zhao, J. (2022). "Improving the accuracy and
  consistency of the scalar auxiliary variable (SAV) method with relaxation."
  *J. Comput. Phys.* 456, 110954.
  [doi:10.1016/j.jcp.2022.110954](https://doi.org/10.1016/j.jcp.2022.110954).
* Bilbao, S., Ducceschi, M. & Zama, F. (2023). "Explicit exactly
  energy-conserving methods for Hamiltonian systems." *J. Comput. Phys.* 472,
  111697. [doi:10.1016/j.jcp.2022.111697](https://doi.org/10.1016/j.jcp.2022.111697).
  SAV for musical systems (§6).
* Bilbao, S., Webb, C., Wang, Z. & Ducceschi, M. (2023). "Real-time gong
  synthesis." *Proc. 26th Int. Conf. on Digital Audio Effects (DAFx23)*,
  Copenhagen. [PDF](https://www.dafx.de/paper-archive/2023/DAFx23_paper_19.pdf).
  A Föppl–von Kármán plate in real time, by finite differences with an
  explicit, energy-quadratised nonlinear step.

**Contact, damping and radiation**

* Hertz, H. (1882). "Ueber die Berührung fester elastischer Körper."
  *J. reine angew. Math.* 92, 156–171.
  [doi:10.1515/crll.1882.92.156](https://doi.org/10.1515/crll.1882.92.156).
* Zener, C. (1937). "Internal friction in solids. I. Theory of internal
  friction in reeds." *Phys. Rev.* 52(3), 230–235.
  [doi:10.1103/PhysRev.52.230](https://doi.org/10.1103/PhysRev.52.230).
* Zener, C. (1938). "Internal friction in solids II. General theory of
  thermoelastic internal friction." *Phys. Rev.* 53(1), 90–99.
  [doi:10.1103/PhysRev.53.90](https://doi.org/10.1103/PhysRev.53.90).
* Maidanik, G. (1962). "Response of ribbed panels to reverberant acoustic
  fields." *J. Acoust. Soc. Am.* 34(6), 809–826.
  [doi:10.1121/1.1918200](https://doi.org/10.1121/1.1918200).
* Chaigne, A. & Lambourg, C. (2001). "Time-domain simulation of damped impacted
  plates. I. Theory and experiments." *J. Acoust. Soc. Am.* 109(4),
  1422–1432. [doi:10.1121/1.1354200](https://doi.org/10.1121/1.1354200).
* Chatziioannou, V. & van Walstijn, M. (2015). "Energy conserving schemes for
  the simulation of musical instrument contact dynamics." *J. Sound Vib.* 339,
  262–279.
  [doi:10.1016/j.jsv.2014.11.017](https://doi.org/10.1016/j.jsv.2014.11.017).

### Earlier models and syntheses

* [NESS: Cymbals and Gongs](https://www.ness.music.ed.ac.uk/archives/systems/cymbals-and-gongs.html)
  (University of Edinburgh and EPCC, 2012–2016): the Next Generation Sound
  Synthesis project's nonlinear flat-plate and spherical-shell models of gongs
  and cymbals, with sound examples.
* [VK-Gong](https://vkgong.ensta-paris.fr/) (Aragonès, Camier, Ducceschi,
  Thomas & Touzé, ENSTA Paris, 2017): MATLAB and C++ code, under CC BY-NC-SA
  4.0, for large-amplitude von Kármán vibration of circular and rectangular
  plates and of imperfect plates (shallow shells), by the modal method.
* [Modelling gongs](https://physicalaudio.co.uk/modelling-gongs/) (Physical
  Audio, 2023): sound examples of a real-time Föppl–von Kármán gong with
  energy-quadratisation and SAV numerics, being developed into a playable
  instrument.
* [Physical Audio](https://physicalaudio.co.uk/) (Physical Audio Ltd, plugins
  since 2018): commercial plugins grown out of NESS, among them
  [Modus](https://physicalaudio.co.uk/products/modus/) (strings and plates
  joined by springs and rattles, by modal synthesis) and
  [Dynamic Plate Reverb](https://physicalaudio.co.uk/products/dynamic-plate-reverb/)
  (the modes of a Kirchhoff plate).
* [Modalys](https://forum.ircam.fr/projects/detail/modalys/) (IRCAM; begun as
  MOSAIC, Morrison & Adrien 1993,
  [doi:10.2307/3680569](https://doi.org/10.2307/3680569)): modal synthesis of
  connected objects, among them
  [free and clamped circular plates](https://support.ircam.fr/docs/Modalys/3.6/Objects/ObjectReference/index.html).
* [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/) (Applied
  Acoustics Systems): a synthesiser of physically modelled resonators, plate
  and membrane among them.
* [Collision](https://www.ableton.com/en/manual/live-instrument-reference/)
  (Ableton with Applied Acoustics Systems): mallet-percussion physical
  modelling in Ableton Live, with beam, marimba, string, membrane, plate, pipe
  and tube resonators.
* [Pianoteq Steelpans](https://modartt.com/steelpans) (Modartt, 2012):
  physically modelled steel drum, hand pan, Spacedrum and tank drum, with
  controls for the "blooming" of their overtones.
