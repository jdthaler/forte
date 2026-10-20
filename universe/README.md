# Early Universe

The first 370,000 years as a keyboard. Before the atoms formed, the universe
was a plasma: photons tied to the electrons by scattering, the electrons to
the nuclei by their charge, one fluid with the light's pressure and the
nuclei's mass. Inflation had left it ripples on every scale, and once a
ripple fitted inside the horizon, gravity pulled the fluid in and the light's
pressure pushed it back out: **sound**. At **recombination** the electrons
joined the nuclei, the light went free, and every wave's phase at that moment
is printed on the sky as the cosmic microwave background (CMB): the waves
caught at a crest or a trough are the **acoustic peaks** that Planck measured,
at wavenumbers k = mπ/r_s, whole multiples of the first. They are a
harmonic series.

So every key is a young universe, and its harmonics are those waves. The m-th
harmonic is the wave of the m-th acoustic peak; pressing the key starts that
universe's clock at the beginning, each harmonic's amplitude follows its wave
through the radiation era, equality and recombination, and then the note holds
what the sky shows. **Baryons** load the fluid, so it falls deeper into
gravity's wells than it climbs out of them: the compressions, the odd
harmonics, ring louder than the even ones. **Silk damping**, the photons'
diffusion through the plasma, fades the upper harmonics. **Dark matter**
decides when the waves are driven by radiation's decaying potentials;
**neutrinos** stream through the waves and pull on them; **helium** takes
electrons away; the **tilt** of inflation's ripples brightens or darkens the
whole series. Nothing is sampled: the waves are Ma and Bertschinger's
equations, integrated in C++ from the beginning to recombination, with
recombination from Saha's and Peebles's equations, and the tests check them
against Planck's measured recombination, sound horizon, damping scale and
equality, the exact solutions of a radiation universe and of the matter era,
and integrals done independently.

The universes are scaled to sound. Our universe's first peak is the wave
that had time for exactly one compression before recombination, half a
wavelength across the sound horizon: 430,000 light-years then, 470 million
light-years stretched to today. A key's universe is ours with that wave made
the note.
Its ingredients stay counted in the cosmologists' units, ω = Ωh², so every
key's universe is the same universe as far as its waves can tell, and only the
note changes.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/universe/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): start that key's universe |
| `←` `→` | octave |
| `↑` `↓` | velocity: how strong inflation's ripples are |
| `Space` | keep the notes: a released note holds its sky until the pedal comes up |
| MIDI | notes, velocity (the ripples' strength), sustain pedal (CC64), **mod wheel = spectral tilt** |

## The physics

### 1. The expansion

Before z ≈ 200 the universe holds radiation and matter, and dark energy and
curvature are too small to matter. With conformal time τ (the distance light
has travelled since the beginning, in Mpc) Friedmann's equation,
(da/dτ)² = H₁₀₀² (ω_m a + ω_r)/c², has the exact solution

  a(τ) = A τ² + B τ,  A = ω_m / 4(c/H₁₀₀)²,  B = √ω_r / (c/H₁₀₀),

with c/H₁₀₀ = 2997.92458 Mpc. The radiation is the photons of a
T = 2.7255 K black body (Fixsen 2009), ω_γ = 2.473 × 10⁻⁵, and
N_eff neutrino species of (7/8)(4/11)^(4/3) of that each; matter is
ω_m = ω_b + ω_c. **Equality**, when matter overtakes radiation, is at
1 + z_eq = ω_m/ω_r. For Planck's ω_b = 0.02237, ω_c = 0.1200 and
N_eff = 3.044 this gives z_eq = 3402.9 (Planck: 3402 ± 26).

### 2. Recombination

Above z = 8000 every atom is ionised. Then helium takes back its electrons in
two steps (24.6 eV and 54.4 eV) and hydrogen its own (13.6 eV), each by
**Saha's equation**,

  n_{i+1} n_e / n_i = (2π m_e kT / h²)^(3/2) (2g_{i+1}/g_i) e^(−χ/kT),

solved together for the n_e they share. Saha holds while the atoms form slowly.
Once hydrogen is 1 % neutral, **Peebles's (1968) bottleneck** takes over: a
recombination straight to the ground state frees a photon that ionises the
next atom, so atoms form only through the n = 2 level, by the two-photon decay
of 2s (Λ = 8.2246 s⁻¹) or by Lyman-α photons redshifting out of the line,

  dx/dt = −C [α_B n_H x_e x − β (1 − x) e^(−E₂₁/kT)],
  C = (1 + K Λ n_1s) / (1 + K (Λ + β) n_1s),  K = λ_α³ / 8πH,

with Péquignot, Petitjean and Boisson's (1991) case-B coefficient α_B and
RECFAST's fudge of 1.14 on it (Seager, Sasselov & Scott 1999), integrated by
implicit Euler. Hydrogen stays ionised long after Saha would have it neutral,
and a little of it, a few parts in 10⁴, never recombines. The opacity is
κ' = x_e n_H σ_T a, and the **visibility** κ' e^(−κ) peaks at recombination:
z* = 1089.5 (Planck: 1089.92 ± 0.25), 372,000 years after the beginning. The
helium fraction Y_p (24.5 %) sets n_H and the electrons helium holds.

### 3. The waves

Each harmonic is one Fourier mode k of the perturbations, in the conformal
Newtonian gauge of Ma and Bertschinger (1995), ds² = a²[−(1 + 2ψ)dτ² +
(1 − 2φ)dx²]. Before recombination the photons and baryons are one fluid,
tightly coupled:

  δ_γ' = −(4/3)θ + 4φ',  δ_b = (3/4)δ_γ + const,
  θ' = [−ℋRθ + k²δ_γ/4] / (1 + R) + k²ψ,  R = 3ρ_b / 4ρ_γ,

an oscillator whose spring is the light's pressure and whose mass is loaded by
the baryons: its sound speed is c_s = 1/√3(1 + R). Cold dark matter falls
freely (δ_c' = −θ_c + 3φ', θ_c' = −ℋθ_c + k²ψ). The neutrinos stream freely:
their density, velocity and the hierarchy of multipoles F_ℓ up to ℓ = 8, cut
off as Ma and Bertschinger do. Gravity is Einstein's equations: outside the
horizon (kτ < 10) φ is carried by the 0-0 equation, k²φ + 3ℋ(φ' + ℋψ) =
−4πGa²δρ; inside, where that equation is stiff, by the 0-0 and 0-i together,
k²φ = −4πGa²[δρ + 3ℋ(ρ + P)θ/k²]. The neutrinos' shear makes ψ differ from
φ, k²(φ − ψ) = 12πGa²(ρ + P)σ.

Every wave starts outside the horizon in the radiation era with the
**adiabatic** initial conditions (Ma and Bertschinger's eq. 98): the same
primordial curvature for every k, ψ = 20/(15 + 4R_ν), φ = (1 + 2R_ν/5)ψ,
δ_γ = −2ψ, and so the temperature Θ₀ + ψ = ψ/2 for every harmonic at first.
The waves are integrated by fourth-order Runge–Kutta from there to
recombination.

What a wave does on the way is what the peaks measure:

* Inside the horizon the fluid oscillates as cos k r_s(τ), r_s = ∫c_s dτ the
  **sound horizon** (r_s* = 144.5 Mpc at recombination; Planck: 144.43 ±
  0.26), its amplitude falling slowly as (1 + R)^(−1/4) as the baryons pile on.
* The baryons' weight moves the oscillator's zero point to −(1 + R)ψ, so its
  compressions (the odd harmonics, k r_s = π, 3π, 5π …) swing further from
  zero than its rarefactions (the even ones).
* A wave that enters the horizon while radiation rules finds its potential
  decaying just as the fluid falls in, and rebounds harder: **radiation
  driving**. A later equality (less dark matter, more neutrinos) drives the
  waves harder, the lower harmonics most.
* The neutrinos, travelling at the speed of light through waves that travel
  at c/√3, shift the waves' phase and pull their amplitude down a little
  (Bashinsky & Seljak 2004).

### 4. Silk damping

The coupling is not perfect: a photon travels a mean free path 1/κ' between
scatterings, and over the history it random-walks a distance 1/k_D,

  k_D⁻² = ∫ [R²/(1 + R) + 16/15] dτ / 6(1 + R)κ',

(Silk 1968; Kaiser 1983's 16/15 is the photons' viscosity, polarisation
included). Waves shorter than that are smoothed out: the diffusion takes
exp(−k²/k_D²) off the oscillation Θ₀ + (1 + R)ψ and off the fluid's velocity,
and leaves the offset gravity holds it at (Hu & Sugiyama 1995). Here
k_D = 0.1407 Mpc⁻¹ at recombination (Planck: 0.14087 ± 0.00030), which with
r_s* puts the damping at harmonic k_D r_s*/π ≈ 6.5: the third harmonic loses
a fifth, the sixth more than half, the tenth nine-tenths, and by the
fifteenth there is nothing left. The damping grows as the clock runs and
recombination sets in, when κ' falls and the photons' paths grow long.

### 5. What you hear

**The sky** (*Listen to*): each harmonic's temperature as its light reaches us,
**Θ₀ + ψ**, the plasma's temperature with the light's climb out of the
potential well (Sachs & Wolfe 1967), and its **Doppler shift**, the light of
fluid moving toward or away from us, √3 Θ₁ = θ/(√3 k). The Doppler shift
peaks a quarter cycle after the temperature, so it plays as the same
harmonic's sine where the temperature is its cosine, and fills in each
harmonic as its compression passes zero; with no baryons the two would be
equally strong, and baryons shrink it by 1/√(1 + R). Harmonic m's amplitude
is

  a_m = v · (Θ₀ + ψ, √3 Θ₁)_m · m^((n_s − 2)/2),

v the velocity. The last factor is inflation's ripples. Their curvature has
a spectrum k³P(k) ∝ k^(n_s − 1); the harmonics are evenly spaced in k, so the
power in harmonic m goes as m^(n_s − 2), and at n_s = 1 (Harrison 1970,
Zel'dovich 1972) every octave holds the same power, like pink noise. Planck's
0.965 makes the upper harmonics a little quieter.

**Inside the plasma**: the temperature where the wave is, Θ₀. Once the light
is free it streams away from where it was, and what is left at one place is
the monopole of light that left with Θ₀ and the fluid's velocity,
Θ₀ j₀(kΔτ) − (θ/k) j₁(kΔτ): the note fades by itself, the upper harmonics
first, through j₀'s zeros, in the same conformal time the history ran on.

**The clock** (*Time to recombination*): conformal time runs evenly through
the note, from the beginning to recombination. Equality comes 40 % of the way
in (τ_eq = 113 Mpc, τ* = 281 Mpc). The model stores each harmonic's wave at
192 instants and the engine glides between them, every 32 samples.

**Release** (*Free streaming on release*): letting go of the key sets the
light free, recombined or not, and what is left of the sky's pattern streams
away as j₀(m x), x running at π per release time: the fundamental reaches its
first silence (j₀(π) = 0) after one release time, and the note fades out
between its fourth and sixth, six release times on. The pedal holds released notes as the keys do.

## What to listen for

* **Our universe (Planck 2018)**: a strong fundamental, then a series that
  falls in steps of two, the third as loud as the second and the fifth
  nearly as the fourth, fading by the tenth.
  Watch *The waves* draw each harmonic's history, and *The sky* a patch of
  plasma made of the note's waves.
* **Hardly any baryons**: odd and even alike, and the upper harmonics gone
  early, since there are few electrons to hold the light. **Heavy with
  baryons**: the odd harmonics stand well above the even ones, the third
  twice the fourth.
* **Little dark matter**: a late equality, every harmonic driven hard by
  radiation. **Much dark matter**: the wells stay, and the fundamental is
  quieter against the rest.
* **More neutrinos**: radiation lasts longer, the waves are driven harder and
  the upper ones a little damped.
* **Helium-rich**: fewer free electrons, the light diffuses further, a duller
  note.
* **Scale-invariant ripples**: a little brighter than ours. The mod wheel
  sweeps the tilt on a held chord.
* **Inside the plasma**: the note blooms through the history and dissolves on
  its own when the light goes free.
* **Without the Doppler shift**: through the history each harmonic falls
  silent as its wave passes zero, where the Doppler shift had kept it
  sounding; at recombination the harmonics are at their crests and change
  little.
* **A slow universe**: ten seconds to recombination, one harmonic after
  another entering the horizon and starting to ring.

## Files

```
universe/index.html, style.css           page
universe/src/universe-params.js          parameters and presets
universe/src/universe-instrument.js      the descriptor: everything but the page
universe/src/universe-main.js            page wiring and views
universe/src/universe-wasm.js            the engine and model, the C++ as WebAssembly (universe/wasm/universe.wasm)
native/instruments/universe/             the physics in C++: model, engine, generated tables, reference (plugins and WebAssembly)
test/universe-tests.mjs                  node test/universe-tests.mjs (27 tests, about 13 s)
tools/render-universe.mjs                node tools/render-universe.mjs → examples/universe/
```

## Simplifications

* **Each harmonic is one wave**, k = mπ/r_s*, at the last-scattering surface:
  the transfer function behind the peaks, not the angular power spectrum C_ℓ
  itself. There is no projection onto the sky's multipoles (which smears
  each peak and shifts its ℓ), no integrated Sachs–Wolfe effect after
  recombination, no lensing and no reionisation.
* **Recombination is instant** for the waves: tight coupling until the
  visibility's peak, then free light. The width of last scattering adds a
  little damping in a full calculation, which the diffusion integral to τ*
  stands in for.
* The diffusion damps as an envelope, exp(−k²/k_D²), rather than through the
  photons' viscosity and polarisation in the equations; the fluid itself is
  the tight coupling's to all orders in R but none in 1/κ'.
* Hydrogen is Peebles's three-level atom with RECFAST's fudge; helium follows
  Saha throughout (its recombination is delayed in reality, which barely
  moves z*). Dark energy and curvature are left out, being negligible before
  z = 200.
* The neutrinos are massless and their hierarchy stops at ℓ = 8.
* The Doppler shift adds to the temperature in quadrature at full weight;
  projected onto the sky it counts for less.
* Free streaming on release is the light's monopole at one place, a picture of
  the light leaving, not what a telescope would see.

## Quality

The Quality setting (CPU, at the end of the controls) plays fewer harmonics and voices: 16
harmonics and 20 voices at Medium, 10 and 12 at Low, against 24 and 32 at High, the oldest
released voice going first. The harmonics it keeps sound the same; Silk damping has taken most
of what lies past the tenth already.

## Prior art and references

**The physics**

* C.-P. Ma and E. Bertschinger, "Cosmological perturbation theory in the
  synchronous and conformal Newtonian gauges", *Astrophys. J.* 455, 7 (1995),
  [arXiv:astro-ph/9506072](https://arxiv.org/abs/astro-ph/9506072): the
  equations, the neutrino hierarchy and its cut-off, the adiabatic initial
  conditions.
* P. J. E. Peebles, "Recombination of the primeval plasma", *Astrophys. J.*
  153, 1 (1968): the bottleneck at n = 2.
* S. Seager, D. D. Sasselov and D. Scott, "A new calculation of the
  recombination epoch", *Astrophys. J.* 523, L1 (1999),
  [arXiv:astro-ph/9909275](https://arxiv.org/abs/astro-ph/9909275): RECFAST
  and its fudge factor.
* D. Péquignot, P. Petitjean and C. Boisson, "Total and effective radiative
  recombination coefficients", *Astron. Astrophys.* 251, 680 (1991): α_B.
* J. Silk, "Cosmic black-body radiation and galaxy formation",
  *Astrophys. J.* 151, 459 (1968), and N. Kaiser, "Small-angle anisotropy of
  the microwave background radiation in the adiabatic theory", *Mon. Not. R.
  Astron. Soc.* 202, 1169 (1983): the diffusion damping and its 16/15.
* R. A. Sunyaev and Ya. B. Zel'dovich, "Small-scale fluctuations of relic
  radiation", *Astrophys. Space Sci.* 7, 3 (1970), and P. J. E. Peebles and
  J. T. Yu, "Primeval adiabatic perturbation in an expanding universe",
  *Astrophys. J.* 162, 815 (1970): the acoustic oscillations predicted.
* R. K. Sachs and A. M. Wolfe, "Perturbations of a cosmological model and
  angular variations of the microwave background", *Astrophys. J.* 147, 73
  (1967).
* W. Hu and N. Sugiyama, "Anisotropies in the cosmic microwave background: an
  analytic approach", *Astrophys. J.* 444, 489 (1995),
  [arXiv:astro-ph/9407093](https://arxiv.org/abs/astro-ph/9407093): baryon
  loading, radiation driving, the damping envelope; and "Small-scale
  cosmological perturbations: an analytic approach", *Astrophys. J.* 471, 542
  (1996), [arXiv:astro-ph/9510117](https://arxiv.org/abs/astro-ph/9510117):
  the fit to z* the tests use.
* W. Hu and M. White, "The damping tail of cosmic microwave background
  anisotropies", *Astrophys. J.* 479, 568 (1997),
  [arXiv:astro-ph/9609079](https://arxiv.org/abs/astro-ph/9609079); W. Hu and
  S. Dodelson, "Cosmic microwave background anisotropies", *Annu. Rev.
  Astron. Astrophys.* 40, 171 (2002),
  [arXiv:astro-ph/0110414](https://arxiv.org/abs/astro-ph/0110414); and
  W. Hu and M. White, "The cosmic symphony", *Scientific American* 290 (2),
  44 (February 2004), the peaks as a harmonic series.
* H. Kodama and M. Sasaki, "Cosmological perturbation theory", *Prog. Theor.
  Phys. Suppl.* 78, 1 (1984), and S. Dodelson, *Modern Cosmology* (Academic
  Press, 2003; 2nd ed. with F. Schmidt, 2020): the potential through
  equality, 9/10 of it kept, which the tests check.
* S. Bashinsky and U. Seljak, "Signatures of relativistic neutrinos in CMB
  anisotropy and matter clustering", *Phys. Rev. D* 69, 083002 (2004),
  [arXiv:astro-ph/0310198](https://arxiv.org/abs/astro-ph/0310198).
* E. R. Harrison, "Fluctuations at the threshold of classical cosmology",
  *Phys. Rev. D* 1, 2726 (1970), and Ya. B. Zel'dovich, "A hypothesis,
  unifying the structure and the entropy of the Universe", *Mon. Not. R.
  Astron. Soc.* 160, 1P (1972): scale invariance.
* Planck Collaboration (N. Aghanim et al.), "Planck 2018 results. VI.
  Cosmological parameters", *Astron. Astrophys.* 641, A6 (2020),
  [arXiv:1807.06209](https://arxiv.org/abs/1807.06209): the defaults and
  the numbers the tests and the page compare with (TT,TE,EE+lowE+lensing,
  Table 2).
* D. J. Fixsen, "The temperature of the cosmic microwave background",
  *Astrophys. J.* 707, 916 (2009),
  [arXiv:0911.1955](https://arxiv.org/abs/0911.1955); J. J. Bennett et al.,
  "Towards a precision calculation of N_eff in the Standard Model II",
  *JCAP* 04 (2021) 073, [arXiv:2012.02726](https://arxiv.org/abs/2012.02726):
  N_eff = 3.044.
* The codes that do all of it properly: CMBFAST (U. Seljak and M. Zaldarriaga,
  *Astrophys. J.* 469, 437 (1996)), CAMB (A. Lewis, A. Challinor and
  A. Lasenby, *Astrophys. J.* 538, 473 (2000)) and CLASS (D. Blas,
  J. Lesgourgues and T. Tram, *JCAP* 07 (2011) 034).

**The sound of the Big Bang**

* Mark Whittle (University of Virginia), *Big Bang Acoustics*, from 2004:
  the CMB's power spectrum played as sound, and the first million years
  simulated as a descending roar a few seconds long.
* John G. Cramer (University of Washington),
  [*The Sound of the Big Bang*](https://faculty.washington.edu/jcramer/BBSound_2013.html)
  (WMAP, 2003; Planck, 2013): the measured power spectrum turned into sound,
  rising to recombination and falling after it.
* Both play the measured spectrum as a sound; here each note's universe is
  integrated from its ingredients, so turning a knob is changing the
  universe, and the harmonics are its waves one at a time. See
  [docs/PRIOR_ART.md](../docs/PRIOR_ART.md#5-sonification-and-science-outreach-precedents).
