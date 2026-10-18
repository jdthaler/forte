# Quantum Keyboard

Every key launches a quantum wavepacket in a potential well, and you hear
its dipole oscillate. The packet is a superposition of a few dozen energy
levels. Because the levels are not equally spaced, the packet **collapses**:
it smears out around the well and the note fades. Because they are spaced
by integers, it **revives**: the phases realign and the note comes back.
In between it splits into 2, 3, 5 … copies (**fractional revivals**), and
you hear the note return an octave or a twelfth up. Pitch, rhythm and
timbre all come from the spectrum Eₙ. Nothing is sampled or enveloped: each
voice is an exact sum over eigenstates, and a revival 10⁵ periods later is
sample-accurate.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/quantum/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | sustain pedal (released notes keep their lifetime T₁) |
| MIDI | notes, velocity, sustain pedal (CC64), **mod wheel = dephasing rate** |

## The physics

**The state.** A short pump pulse excites a band of levels around n̄:

  |ψ(t)⟩ = Σₙ cₙ e^(−iEₙt/ħ) |n⟩,  cₙ ∝ exp(−(n − n̄)²/4σₙ²),

so |cₙ|² is a Gaussian of width σₙ (the *Level spread* knob). This is what a
transform-limited Gaussian pulse of duration τ does: its spectrum covers
σₙ = 1/(√2 ω_cl τ) levels. Real, positive cₙ put the packet at a classical
turning point at t = 0, at rest: the Franck–Condon point, where a vertical
optical transition leaves it. All the wells below use one sign convention
(each eigenfunction is positive in its first lobe on the inner side), so
the packet starts at the inner wall: the box wall at x = 0, a molecule's
compressed bond, the electron at the nucleus. The bouncer is dropped from
rest at its top. The sum is exact: no time stepping, no PDE.

**What you hear: a detector on the dipole.** For each pair of levels the
dipole has a Bohr line:

  ⟨x⟩(t) − x̄ = Σ_{m<n} 2 c_m cₙ x_mn cos(ω_mn t),  ω_mn = (Eₙ − E_m)/ħ.

The *Detector* knob picks what you listen to, and each choice is a real way
of picking up an oscillating dipole:

* **Electrode** (near field): ⟨x⟩ itself, AC-coupled. It measures the dipole
  relative to where the pump found the atom, so it starts from zero.
* **Coil** (induction): the current, ⟨ẋ⟩. Each Bohr line is weighted by its
  frequency.
* **Antenna** (far field, the default): the radiated field E ∝ ⟨ẍ⟩
  (Larmor). Weighted by frequency², this is literally what the packet would
  sound like if you could hear its radiation.

Each derivative tilts the spectrum by +6 dB/octave. In the box the dipole is a
triangle wave (harmonics ∝ 1/k²), so the antenna hears an impulse train with
flat odd harmonics. The pump bandwidth band-limits that train: the k-th
harmonic needs pairs n, n+k that are both populated, and their overlap is
Σ cₙcₙ₊ₖ = e^(−k²/8σₙ²). A tight packet (large σₙ) is bright, and a broad
one (small σₙ) is nearly a sine. The detector gain is set per key, so the
launch peaks at ≤ 0.3 with an rms ≤ 0.12 at full velocity. For the electrode
that peak is of what it reads, reference included: the packet swings to one
side of where it started, so for the first tens of milliseconds the reading
reaches about twice the swing, and the electrode's notes are correspondingly
quieter once the reference has faded. Six electrode notes struck together
still add their first swings: such a chord peaks at about 1–1.2.

**Mapping to the keyboard.** A packet's pitch is its classical frequency
(dE/dn)/h. Precisely, the pitch at launch is the instantaneous frequency of
the Δn = 1 lines, Σ|wₙ|ωₙ/Σ|wₙ|, with the detector's weights. One free time
scale per key (a "slow-motion factor") puts that pitch on the 12-TET key.
Measured from the engine output in the tests, the square well is within
0.25 ¢ on all 88 keys, and every well and detector is within 2.2 ¢. The
remaining 2 ¢ is the bouncer's lopsided spectrum, whose
instantaneous frequency drifts as it collapses. Two modes set n̄:

* **Tempo lock** (default): each key gets the n̄ whose revival time is
  *T_rev* beats at the *Tempo*. T_rev is then exact and n̄ is solved (secant,
  10⁻¹⁰) so that the pitch lands on the key. At 90 BPM with T_rev = 2 beats
  (1.333 s), A3 needs n̄ = 147 in the box, 60 in the Morse well, 440 in
  hydrogen, and 49 for the bouncer. Every note then revives on the beat.
  Since T_rev/T_cl grows with n̄, the longest revivals on the highest keys, and
  the shortest on the lowest, ask for an n̄ outside the well's range (above
  6000, or below 12 for hydrogen): at 40 BPM × 8 beats, C7 would need n̄ ≈ 12 600
  in the box and C5 ≈ 9 400 in hydrogen. Then n̄ stays at its limit, the pitch is
  kept exact, and the revival falls off the beat; the page says so, and the
  carpet shows the actual T_rev in beats.
* **Fixed n̄**: the same n̄ on every key. T_rev = (T_rev/T_cl)/f, so the
  revival time scales as 1/f, and a chord's frequency ratios become ratios of
  revival rates (C–E–G–C at n̄ = 150: half-revivals at 574, 455, 383, 287 ms,
  rates 4 : 5 : 6 : 8, so times 1/4 : 1/5 : 1/6 : 1/8).

**Time scales from the spectrum** (Robinett 2004). Expand Eₙ about n̄:

  T_cl = 2πħ/|E′|,  T_rev = 2πħ/(|E″|/2),  T_sr = 2πħ/(|E‴|/6).

The linear term moves the packet classically. The quadratic term spreads
the phases: the packet **collapses** after t_coll = T_rev/(2√2 π σₙ) (the 1/e
time of the fundamental; 75 ms at the default settings, for every key). At
t = T_rev the quadratic phases are all multiples of 2π, and the packet is
back. At T_rev/2 the phases are (−1)ⁿ: one copy, half a period shifted.
At t = (p/q)T_rev the phase pattern repeats every q levels, and the packet
is q copies spaced T_cl/q apart if q is odd, or q/2 copies spaced 2T_cl/q apart
if q is even (Averbukh & Perelman 1989). The dipole of c equally weighted
copies keeps only the harmonics that are multiples of c. So **at T_rev/q you
hear the q-th harmonic for odd q, the (q/2)-th for even q**: the octave at
T_rev/4, the twelfth at T_rev/3 and T_rev/6, the 5th harmonic at T_rev/5 and
T_rev/10, the double octave at T_rev/8. The return probability |⟨ψ(0)|ψ(t)⟩|²
is then 1/(number of copies); the tests find ½ at T_rev/4, ⅓ at T_rev/3 and
T_rev/6, and ¼ at T_rev/8 in the Morse well.

**The five wells** (natural units, ħ = 1; all spectra and matrix elements exact
unless noted):

| well | Eₙ | x_mn (m ≠ n) | T_rev/T_cl | what you hear |
|---|---|---|---|---|
| infinite square well | n² (E₁ = π²ħ²/2mL²) | −8mn L/π²(m²−n²)², m+n odd | 2n̄, exact | odd harmonics only; **silent at T_rev/4** |
| Morse, V = D(1 − e^(−ax))² | (v+½) − (v+½)²/κ, κ = 4D/ħω | Vasan & Cross 1983 (closed form) | κ − 2n̄ − 1, exact | octave at T_rev/4, twelfth at T_rev/3 |
| hydrogen, radial, l = 1 | −1/2n² hartree | Kepler-orbit Fourier coefficients (semiclassical) | 2n̄/3 | revivals, then **super-revivals** |
| quantum bouncer, V = mgz above a mirror | mgℓ·\|aₙ\| (Airy zeros) | −2ℓ/(zₘ − zₙ)² | ≈ 6n̄ | octave echoes, super-revivals |
| harmonic oscillator | n + ½ | −√(n/2), Δn = 1 only | ∞ | one pure line, forever |

* **Square well.** Eₙ ∝ n² exactly, so the revival is perfect and exact for
  any packet. At T_rev/2 the packet is the mirror image (ψ(x) → −ψ(L−x)). The
  wall-to-wall motion is symmetric, so the dipole has only odd harmonics.
  At T_rev/4 the two copies are mirror images, their dipoles cancel, and
  the note goes **silent** (more than 30 dB down, tested). The twelfth sounds at
  T_rev/6 and T_rev/3, and the fifth harmonic at T_rev/10 and T_rev/5. The carpet
  is the Talbot carpet (Berry & Klein 1996).
* **Morse** (anharmonic molecule; Morse 1929). The spectrum is exactly quadratic, so the
  revivals are exact too (up to a classical time shift). The *Height in
  the well* knob, η = E(n̄)/D, sets κ for each key: κ = 2(n̄+½)/(1 − √(1−η)).
  Near the bottom the motion is nearly harmonic (with the antenna, the Δn = 2
  lines are −11 dB re the fundamental at η = 0.1); near dissociation it bangs
  into the inner wall and lingers outside (+2 dB at η = 0.9). The asymmetric
  motion has all harmonics, so the octave appears at T_rev/4. Fractional revivals of
  vibrational packets are seen in pump–probe experiments on diatomics
  (e.g. Br₂: Vrakking, Villeneuve & Stolow 1996). The matrix elements are
  checked against a finite-difference diagonalisation, to 2·10⁻⁴.
* **Hydrogen Rydberg packet.** Radial packets with l = 1 (one-photon
  excitation from an s state, as in Yeazell, Mallalieu & Stroud 1990).
  ⟨n|r|n+k⟩ comes from Heisenberg's correspondence principle (Heisenberg 1925;
  Percival & Richards 1970; Naccache 1972): the Fourier
  series of a Kepler orbit, r/a = 1 + e²/2 − Σ(2e/k)J′ₖ(ke) cos kM, with
  a = n_c², n_c = (n+n′)/2 and the Langer (1937) eccentricity e = √(1 − (l+½)²/n_c²).
  Against exact integrals of Laguerre radial functions: 0.14 % at n = 20,
  k = 1; 2.5 % at k = 5; errors fall like (k/n)² (the tests compare each
  against the n → n+1 element, as the detector's gain leaves them). The cubic term
  degrades the revivals. At t = T_sr/6, j³ ≡ j (mod 6) turns the cubic phases
  into a time shift. If n̄ is a multiple of 4, T_sr/6 = (n̄/8)T_rev is also a
  full or half revival, and the packet comes back nearly whole: a **super-revival**
  (Bluhm & Kostelecký 1995). The preset (n̄ = 44, σₙ = 1.3, on C3) has
  T_rev = 224 ms and T_sr/6 = 1.23 s. The return probability reaches 0.95 at
  T_sr/6 but only 0.80 near T_sr/4. On this scale a real n = 44 atom (T_cl =
  13 ps, T_rev = 380 ps, T_sr = 12.5 ns) is slowed down 6·10⁸ times.
* **Quantum bouncer** (a neutron or a cold atom bouncing on a mirror in
  gravity: Gibbs 1975; Gea-Banacloche 1999; neutron states seen by Nesvizhevsky et al.
  2002; atoms bounced by Aminoff et al. 1993). Eₙ = mgℓ|aₙ|, with the Airy
  zeros from A&S Table 10.13 for n ≤ 10 and the asymptotic series 10.4.94
  above (agreeing to 10⁻⁸ on the table). The levels, the matrix elements
  −2ℓ/(zₘ−zₙ)² and the virial theorem ⟨z⟩ₙ = 2Eₙ/3 are checked against a
  diagonalisation.
  The bouncer is launched from rest at the top: dropped.
* **Harmonic oscillator**, the control. The levels are equally spaced, the
  dipole connects only neighbours, and every Bohr line is at exactly ω. One
  pure line that never collapses and never needs to revive.

**Decoherence.** Notes have to end, and coherence is the point, so two
processes act on the density matrix ρ_mn:

* **Lifetime T₁**: population leaves the packet at the rate 1/T₁ for every
  level, so every coherence ρ_mn and the whole sound decay as e^(−t/T₁),
  revivals and all. This is the right model when decay goes *out* of the band.
  Low-l Rydberg states radiate mostly straight to low n (the ω³ factor
  favours big jumps). A vibrational packet on an excited electronic state
  dies with that state's fluorescence. **Release** switches the rate to
  1/T_q: the packet is quenched (ionised). The sustain pedal holds it off.
* **Pure dephasing Γ_φ = 1/T_φ**: phase noise on the classical motion. To
  leading order in σₙ/n̄, any noisy parameter of the well (its width, its
  depth, a stray field) shifts the levels linearly in n,
  δEₙ ≈ ħξ(t)(n − n̄). For white noise this is the Lindblad operator √(2Γ_φ) n̂
  (Lindblad 1976; Gorini, Kossakowski & Sudarshan 1976), and the coherences decay as

    ρ_mn ∝ e^(−Γ_φ (m−n)² t).

  The k-th harmonic dies k² times faster than the fundamental. Since a
  q-copy fractional revival lives on the Δn = q coherences, dephasing
  **erases the fine fractional revivals first, then the half revival, then
  the full one**. The attack, which is over in t_coll ≪ T_φ, is untouched.
  This is the difference between the reversible collapse (the quantised
  analogue of an inhomogeneous T₂*, undone by the revival like a spin echo,
  Hahn 1950) and irreversible decoherence (Zeh 1970; Zurek 1981; Joos & Zeh
  1985). The tests check e^(−T_rev/T_φ) for the
  fundamental at the revival, < 10⁻⁶ for the 3rd harmonic, and a 97 %
  intact attack.

**The engine.** Each voice keeps one unit phasor per level. At the start of
every 128-sample block its phase is recomputed from the integer sample
count in double precision, and within the block it is rotated sample by
sample. Phases never drift: the box repeats its launch after exactly
48 000 samples to 10⁻⁹. The signal is Σ w_mn Re(a_m* aₙ) over pairs, grouped
by Δn = k, so that dephasing is one multiplier per group per sample. Pairs
weaker than −60 dB of the strongest, above 20 kHz, or beyond the 300
strongest are dropped. The pump builds the coherences as g(t)²,
g = ½(1 + erf(t/√2τ)), with the τ that gives σₙ (at least 0.1 ms). The packet
is computed on the page and sent with the note (about 1 ms). Ten voices take
about 4 % of a core at the defaults and 12 % in the worst case (hydrogen,
σₙ = 4, antenna: 300 pairs each). All voices together
sum at most 3000 pairs: when a new note would take the total past that, the
weakest pairs of all, by their amplitude at that moment (velocity, T₁ decay and
dephasing included), are dropped for good, so faded notes give theirs up
first. 24 such voices struck together each keep their 125 strongest lines
(91 % of their power).

**In C++** (`native/instruments/quantum`): the engine and the model, run as
WebAssembly on this page and as plugins (CLAP, VST3, AU and a standalone
app), where the Space pedal is the damper on CC64 and the mod wheel is the
dephasing rate. The page's packets and the views' eigenfunctions come from
the same C++. Each key's packet is built on a worker thread in the plugins,
for the knobs as they are, and on the page by its WebAssembly model, which
sends it with the note. The C++ was ported from the JavaScript this page
first ran, with V8's own `sin`, `cos`, `exp` and `pow`, and played it bit for
bit, packets, revivals and the pair budget included.

## What to listen for

`examples/quantum/`:

1. **A phrase whose notes return on the beat** (Morse, 84 BPM, T_rev = 2
   beats). Each note comes back on every beat (T_rev/2), an octave up on the
   off-beats (T_rev/4) and a twelfth up on the triplets (T_rev/6, T_rev/3).
   The echoes are the packet's own physics, not a delay line.
2. **One note: square well, then Morse** (T_rev = 2.67 s). The square well
   collapses, sounds the twelfth at T_rev/6, goes silent at T_rev/4 (mirror
   copies cancel), the twelfth again at T_rev/3, and returns at T_rev/2. The
   Morse packet has the octave at T_rev/4.
3. **Harmonic oscillator, then square well**, the same note. One steady
   tone, then a tone that dissolves and reassembles.
4. **A Rydberg atom** (hydrogen, n̄ = 44, electrode, C3). A 4.5 Hz flutter of
   revivals (T_rev = 224 ms) that blurs as the cubic term acts, and comes
   back sharp around T_sr/6 = 1.2 s and 2.5 s.
5. **The same phrase, coherent, then dephased** (T_φ = 0.3 s). Identical
   attacks; in the second half nothing comes back.
6. **A chord at fixed n̄ = 150**: C–E–G–C revive at rates 4 : 5 : 6 : 8 (the
   top C twice as often as the bottom one).
7. **Level spread**: σₙ = 0.6 (three levels: a slow beating chord of Bohr
   lines, no packet at all), 2, then 4 (a tight, bright packet that
   collapses in 37 ms and throws many echoes).
8. **Detectors**: electrode, coil, antenna on the same packet.

Regenerate with `node tools/render-quantum.mjs`, then
`node tools/encode-examples.mjs quantum`.

On the page, the **quantum carpet** shows |ψ(x,t)|² with x up and time
across, over about one revival. It is sampled once per classical period and
slowly advanced in phase, so the bouncing appears as a few slow zigzags,
while the spreading, the copies and the revival are exact. **Wavepacket in
the well** shows the potential, the live |ψ(x)|² (same strobe), the levels
between their turning points and the |cₙ|² ladder. **Return probability**
marks T_rev/4, /3, /2 and T_rev (and T_sr/6 … where it fits), with the
dephased curve when Γ_φ > 0. The **spectrum** marks every Bohr line. Each
Δn = k is a cluster of lines spaced 2k/T_rev apart; the beat between
neighbouring Δn = 1 lines *is* the (half) revival.

## Files

```
quantum/index.html, style.css          page
quantum/src/quantum-instrument.js      the descriptor: parameters, presets, the engine
quantum/src/quantum-params.js          parameters and presets
quantum/src/quantum-main.js            page wiring and views
quantum/src/quantum-waves.js           the views' grid for each well around the eigenfunctions, and |ψ|²
quantum/src/quantum-wasm.js            the C++ engine and model as WebAssembly (quantum/wasm/quantum.wasm)
native/instruments/quantum/            the C++: spectra, matrix elements, packets, time scales, eigenfunctions
                                       (Numerov / closed forms) and the engine (plugins and WebAssembly)
test/quantum-tests.mjs                 node test/quantum-tests.mjs (26 tests, ~15 s)
tools/render-quantum.mjs               node tools/render-quantum.mjs → examples/quantum/
```

## Simplifications

* **Hydrogen** uses semiclassical matrix elements (errors ∝ (k/n)², at most
  2.5 % at n = 20 for the lines that matter, negligible at the n̄ of hundreds
  the tempo lock picks). It has no quantum defects, so it is not an alkali
  atom, and no fine structure. A radial packet with fixed l has ⟨x⟩ = 0, so
  the "dipole" for hydrogen is ⟨r⟩ and its derivatives: a stand-in for
  the pump–probe signal that real experiments record. With the antenna,
  every copy's perihelion passage is a sharp burst. The envelope then hardly
  shows the revivals, so the hydrogen preset uses the electrode.
* **The pump** gives every level the same erf turn-on. Exactly, each level
  turns on with its own detuning-dependent complex error function. The
  difference lasts only the pulse length τ. Very tight packets (σₙ ≥ 3) are
  launched by pulses shorter than 1/30 of a period and start percussively.
  That is physical (a sudden kick), but it is heard as a tick on the lowest
  notes.
* **T₁** removes population uniformly. A real radiative *cascade* (n → n−1)
  would lower n̄ and glide the pitch. Here the decay goes to states outside
  the band, as it mostly does for low-l Rydberg states.
* **Dephasing** is white, Markovian and linear in n (the leading order of
  any parametric noise). Coloured noise would make the decay non-exponential.
* **The electrode** is AC-coupled by a 60 ms raised-cosine fade of the
  Franck–Condon offset rather than an RC filter, so no decaying offset
  lingers under the note.
* **Restriking** a sounding key excites a fresh packet (another atom), which
  adds incoherently. Coherent double-pulse excitation (wavepacket
  interferometry, Ramsey fringes between packets) is not modelled.
* **Pair budget.** At most 300 pairs per voice, down to −60 dB. The antenna
  on hydrogen or the bouncer at σₙ = 4 needs more, and loses its weakest top
  harmonics (about −20 dB of the energy). Past 3000 pairs over all voices the
  weakest go, everywhere. A dropped line stops at once rather than fading, but
  it is weaker than every line still sounding.
* **The bouncer** has the asymptotic Airy series above n = 10 (error
  < 10⁻⁹). T_rev for hydrogen and the bouncer is the local estimate from E″.
  Their true best revival times shift by O(σₙ²/n̄²).
* The views ignore T₁ (the carpet is normalised to the surviving population)
  and are strobed.

## Prior art and references

The physics this instrument plays is that of the work below. Every work cited
above is listed here, with its DOI or a stable link.

### The physics, credited to its originators

**Collapse and revival**

* Jaynes, E. T. & Cummings, F. W. (1963). "Comparison of quantum and
  semiclassical radiation theories with application to the beam maser."
  *Proc. IEEE* 51(1), 89–109.
  [doi:10.1109/PROC.1963.1664](https://doi.org/10.1109/PROC.1963.1664).
* Eberly, J. H., Narozhny, N. B. & Sanchez-Mondragon, J. J. (1980). "Periodic
  spontaneous collapse and revival in a simple quantum model." *Phys. Rev.
  Lett.* 44(20), 1323–1326.
  [doi:10.1103/PhysRevLett.44.1323](https://doi.org/10.1103/PhysRevLett.44.1323).
  Collapse and revival in the Jaynes–Cummings model.
* Parker, J. & Stroud, C. R. (1986). "Coherence and decay of Rydberg wave
  packets." *Phys. Rev. Lett.* 56(7), 716–719.
  [doi:10.1103/PhysRevLett.56.716](https://doi.org/10.1103/PhysRevLett.56.716).
  Revivals predicted for Rydberg wavepackets.
* Alber, G., Ritsch, H. & Zoller, P. (1986). "Generation and detection of
  Rydberg wave packets by short laser pulses." *Phys. Rev. A* 34(2),
  1058–1064.
  [doi:10.1103/PhysRevA.34.1058](https://doi.org/10.1103/PhysRevA.34.1058).
* Rempe, G., Walther, H. & Klein, N. (1987). "Observation of quantum collapse
  and revival in a one-atom maser." *Phys. Rev. Lett.* 58(4), 353–356.
  [doi:10.1103/PhysRevLett.58.353](https://doi.org/10.1103/PhysRevLett.58.353).
* ten Wolde, A., Noordam, L. D., Lagendijk, A. & van Linden van den Heuvell,
  H. B. (1988). "Observation of radially localized atomic electron wave
  packets." *Phys. Rev. Lett.* 61(18), 2099–2101.
  [doi:10.1103/PhysRevLett.61.2099](https://doi.org/10.1103/PhysRevLett.61.2099).
* Averbukh, I. Sh. & Perelman, N. F. (1989). "Fractional revivals:
  universality in the long-term evolution of quantum wave packets beyond the
  correspondence principle dynamics." *Phys. Lett. A* 139(9), 449–453.
  [doi:10.1016/0375-9601(89)90943-2](https://doi.org/10.1016/0375-9601%2889%2990943-2).
  The fractional revivals of p/q copies.
* Nauenberg, M. (1989). "Quantum wave packets on Kepler elliptic orbits."
  *Phys. Rev. A* 40(2), 1133–1136.
  [doi:10.1103/PhysRevA.40.1133](https://doi.org/10.1103/PhysRevA.40.1133).
* Yeazell, J. A., Mallalieu, M. & Stroud, C. R. (1990). "Observation of the
  collapse and revival of a Rydberg electronic wave packet." *Phys. Rev. Lett.*
  64(17), 2007–2010.
  [doi:10.1103/PhysRevLett.64.2007](https://doi.org/10.1103/PhysRevLett.64.2007).
* Yeazell, J. A. & Stroud, C. R. (1991). "Observation of fractional revivals in
  the evolution of a Rydberg atomic wave packet." *Phys. Rev. A* 43(9),
  5153–5156.
  [doi:10.1103/PhysRevA.43.5153](https://doi.org/10.1103/PhysRevA.43.5153).
* Bluhm, R. & Kostelecký, V. A. (1994). "Quantum defects and the long-term
  behavior of radial Rydberg wave packets." *Phys. Rev. A* 50(6),
  R4445–R4448.
  [doi:10.1103/PhysRevA.50.R4445](https://doi.org/10.1103/PhysRevA.50.R4445).
  What quantum defects do to the revivals of an alkali atom.
* Bluhm, R. & Kostelecký, V. A. (1995). "Long-term evolution and revival
  structure of Rydberg wave packets for hydrogen and alkali-metal atoms."
  *Phys. Rev. A* 51(6), 4767–4786.
  [doi:10.1103/PhysRevA.51.4767](https://doi.org/10.1103/PhysRevA.51.4767).
  Super-revivals.
* Bluhm, R., Kostelecký, V. A. & Porter, J. A. (1996). "The evolution and
  revival structure of localized quantum wave packets." *Am. J. Phys.* 64(7),
  944–953. [doi:10.1119/1.18304](https://doi.org/10.1119/1.18304).
* Leichtle, C., Averbukh, I. Sh. & Schleich, W. P. (1996). "Generic structure
  of multilevel quantum beats." *Phys. Rev. Lett.* 77(19), 3999–4002.
  [doi:10.1103/PhysRevLett.77.3999](https://doi.org/10.1103/PhysRevLett.77.3999).
* Vrakking, M. J. J., Villeneuve, D. M. & Stolow, A. (1996). "Observation of
  fractional revivals of a molecular wave packet." *Phys. Rev. A* 54(1),
  R37–R40. [doi:10.1103/PhysRevA.54.R37](https://doi.org/10.1103/PhysRevA.54.R37).
  Half and quarter revivals in the B state of Br₂.
* Aronstein, D. L. & Stroud, C. R. (1997). "Fractional wave-function revivals
  in the infinite square well." *Phys. Rev. A* 55(6), 4526–4537.
  [doi:10.1103/PhysRevA.55.4526](https://doi.org/10.1103/PhysRevA.55.4526).
* Robinett, R. W. (2004). "Quantum wave packet revivals." *Phys. Rep.*
  392(1–2), 1–119.
  [doi:10.1016/j.physrep.2003.11.002](https://doi.org/10.1016/j.physrep.2003.11.002).
  The review behind the time scales, the box and the bouncer here.

**The Talbot effect and quantum carpets**

* Talbot, H. F. (1836). "Facts relating to optical science. No. IV."
  *Phil. Mag.* 9(56), 401–407.
  [doi:10.1080/14786443608649032](https://doi.org/10.1080/14786443608649032).
* Rayleigh, Lord (1881). "On copying diffraction-gratings, and on some
  phenomena connected therewith." *Phil. Mag.* 11(67), 196–205.
  [doi:10.1080/14786448108626995](https://doi.org/10.1080/14786448108626995).
* Kinzel, W. (1995). "Bilder elementarer Quantenmechanik." *Phys. Bl.* 51(12),
  1190–1191.
  [doi:10.1002/phbl.19950511215](https://doi.org/10.1002/phbl.19950511215).
* Berry, M. V. & Klein, S. (1996). "Integer, fractional and fractal Talbot
  effects." *J. Mod. Opt.* 43(10), 2139–2164.
  [doi:10.1080/09500349608232876](https://doi.org/10.1080/09500349608232876).
* Großmann, F., Rost, J.-M. & Schleich, W. P. (1997). "Spacetime structures in
  simple quantum systems." *J. Phys. A* 30(9), L277–L283.
  [doi:10.1088/0305-4470/30/9/004](https://doi.org/10.1088/0305-4470/30/9/004).
* Berry, M. V., Marzoli, I. & Schleich, W. (2001). "Quantum carpets, carpets of
  light." *Physics World* 14(6), 39–46.
  [doi:10.1088/2058-7058/14/6/30](https://doi.org/10.1088/2058-7058/14/6/30).

**The wells and their matrix elements**

* Morse, P. M. (1929). "Diatomic molecules according to the wave mechanics.
  II. Vibrational levels." *Phys. Rev.* 34(1), 57–64.
  [doi:10.1103/PhysRev.34.57](https://doi.org/10.1103/PhysRev.34.57).
* Gallas, J. A. C. (1980). "Some matrix elements for Morse oscillators."
  *Phys. Rev. A* 21(6), 1829–1834.
  [doi:10.1103/PhysRevA.21.1829](https://doi.org/10.1103/PhysRevA.21.1829).
* Vasan, V. S. & Cross, R. J. (1983). "Matrix elements for Morse oscillators."
  *J. Chem. Phys.* 78(6), 3869–3871.
  [doi:10.1063/1.445164](https://doi.org/10.1063/1.445164).
* Gibbs, R. L. (1975). "The quantum bouncer." *Am. J. Phys.* 43(1), 25–28.
  [doi:10.1119/1.10024](https://doi.org/10.1119/1.10024).
* Aminoff, C. G., Steane, A. M., Bouyer, P., Desbiolles, P., Dalibard, J. &
  Cohen-Tannoudji, C. (1993). "Cesium atoms bouncing in a stable gravitational
  cavity." *Phys. Rev. Lett.* 71(19), 3083–3086.
  [doi:10.1103/PhysRevLett.71.3083](https://doi.org/10.1103/PhysRevLett.71.3083).
* Gea-Banacloche, J. (1999). "A quantum bouncing ball." *Am. J. Phys.* 67(9),
  776–782. [doi:10.1119/1.19124](https://doi.org/10.1119/1.19124).
* Nesvizhevsky, V. V. et al. (2002). "Quantum states of neutrons in the Earth's
  gravitational field." *Nature* 415, 297–299.
  [doi:10.1038/415297a](https://doi.org/10.1038/415297a).
* Abramowitz, M. & Stegun, I. A. (eds.) (1964). *Handbook of Mathematical
  Functions.* NBS Applied Mathematics Series 55. §10.4: Airy functions and
  their zeros (10.4.94). Its successor, the NIST DLMF, gives the same in
  [§9.9](https://dlmf.nist.gov/9.9).
* Heisenberg, W. (1925). "Über quantentheoretische Umdeutung kinematischer und
  mechanischer Beziehungen." *Z. Phys.* 33(1), 879–893.
  [doi:10.1007/BF01328377](https://doi.org/10.1007/BF01328377).
* Langer, R. E. (1937). "On the connection formulas and the solutions of the
  wave equation." *Phys. Rev.* 51(8), 669–676.
  [doi:10.1103/PhysRev.51.669](https://doi.org/10.1103/PhysRev.51.669).
* Percival, I. C. & Richards, D. (1970). "A correspondence principle for
  strongly coupled states." *J. Phys. B* 3(8), 1035–1046.
  [doi:10.1088/0022-3700/3/8/005](https://doi.org/10.1088/0022-3700/3/8/005).
* Naccache, P. F. (1972). "Matrix elements and correspondence principles."
  *J. Phys. B* 5(7), 1308–1319.
  [doi:10.1088/0022-3700/5/7/008](https://doi.org/10.1088/0022-3700/5/7/008).

**Decoherence and dephasing**

* Hahn, E. L. (1950). "Spin echoes." *Phys. Rev.* 80(4), 580–594.
  [doi:10.1103/PhysRev.80.580](https://doi.org/10.1103/PhysRev.80.580).
* Zeh, H. D. (1970). "On the interpretation of measurement in quantum theory."
  *Found. Phys.* 1(1), 69–76.
  [doi:10.1007/BF00708656](https://doi.org/10.1007/BF00708656).
* Lindblad, G. (1976). "On the generators of quantum dynamical semigroups."
  *Commun. Math. Phys.* 48(2), 119–130.
  [doi:10.1007/BF01608499](https://doi.org/10.1007/BF01608499).
* Gorini, V., Kossakowski, A. & Sudarshan, E. C. G. (1976). "Completely
  positive dynamical semigroups of N-level systems." *J. Math. Phys.* 17(5),
  821–825. [doi:10.1063/1.522979](https://doi.org/10.1063/1.522979).
* Zurek, W. H. (1981). "Pointer basis of quantum apparatus: into what mixture
  does the wave packet collapse?" *Phys. Rev. D* 24(6), 1516–1525.
  [doi:10.1103/PhysRevD.24.1516](https://doi.org/10.1103/PhysRevD.24.1516).
* Joos, E. & Zeh, H. D. (1985). "The emergence of classical properties through
  interaction with the environment." *Z. Phys. B* 59(2), 223–243.
  [doi:10.1007/BF01725541](https://doi.org/10.1007/BF01725541).
* Zurek, W. H. (1991). "Decoherence and the transition from quantum to
  classical." *Physics Today* 44(10), 36–44.
  [doi:10.1063/1.881293](https://doi.org/10.1063/1.881293).
* Zurek, W. H. (2003). "Decoherence, einselection, and the quantum origins of
  the classical." *Rev. Mod. Phys.* 75(3), 715–775.
  [doi:10.1103/RevModPhys.75.715](https://doi.org/10.1103/RevModPhys.75.715).

### Earlier sonification and music projects

* [Quantum Music](http://quantummusic.org/) (Institute of Musicology SASA,
  Belgrade, with LP Duo and partners, 2015–2018; continued as Beyond Quantum
  Music, 2019–22): new hybrid keyboard instruments and a sound library drawn
  from quantum-physics experiments and formulas, for concerts and an
  installation.
* Miranda, E. R. (ed.) (2022). *Quantum Computer Music: Foundations, Methods
  and Advanced Concepts.* Springer.
  [doi:10.1007/978-3-031-13909-3](https://doi.org/10.1007/978-3-031-13909-3).
* [QuTune](https://github.com/iccmr-quantum) (ICCMR, University of Plymouth):
  open-source tools for making music with quantum computers.
* Miranda, E. R., Thomas, P. & Itaboraí, P. V. (2023). "Q1Synth: a quantum
  computer musical instrument." *Appl. Sci.* 13(4), 2386.
  [doi:10.3390/app13042386](https://doi.org/10.3390/app13042386).
* [Variational Quantum Harmonizer](https://github.com/iccmr-quantum/VQH)
  (Itaboraí, Schwägerl, Aguado Yáñez, Crippa, Jansen, Miranda & Thomas, 2023;
  [doi:10.5281/zenodo.10206731](https://doi.org/10.5281/zenodo.10206731)):
  sonifies the variational quantum eigensolver as it runs, on simulators or
  quantum hardware, for live performance.
* Rocchesso, D. & Mannone, M. (2020). "A quantum vocal theory of sound."
  *Quantum Inf. Process.* 19(9), 292.
  [doi:10.1007/s11128-020-02772-9](https://doi.org/10.1007/s11128-020-02772-9).
* [1-D Quantum Mechanics](https://www.falstad.com/qm1d/) (Paul Falstad): an
  interactive applet of superpositions of bound states evolving in the
  infinite well and other selectable 1-D potentials.
* [Square Well](https://physics.weber.edu/schroeder/software/SquareWell.html)
  (Daniel V. Schroeder, Weber State University): a superposition of the eight
  lowest infinite-well states, set and watched through clock-face phasors.
* [Superposition states in an infinite square well](https://www.st-andrews.ac.uk/physics/quvis/simulations_html5/sims/SuperpositionStates/SuperpositionStates.html)
  (QuVis, University of St Andrews): an interactive simulation of the same.
