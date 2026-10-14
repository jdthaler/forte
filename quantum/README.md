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
| `Z…/` and `Q…]` rows | play (61 keys, C2–C7) |
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
0.25 ¢ on all 61 keys, and every well and detector is within 2.2 ¢. The
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
* **Morse** (anharmonic molecule). The spectrum is exactly quadratic, so the
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
  ⟨n|r|n+k⟩ comes from Heisenberg's correspondence principle: the Fourier
  series of a Kepler orbit, r/a = 1 + e²/2 − Σ(2e/k)J′ₖ(ke) cos kM, with
  a = n_c², n_c = (n+n′)/2 and the Langer eccentricity e = √(1 − (l+½)²/n_c²).
  Checked against exact integrals of Laguerre radial functions: 0.14 % at
  n = 20, k = 1; 2.5 % at k = 5; errors fall like (k/n)². The cubic term
  degrades the revivals. At t = T_sr/6, j³ ≡ j (mod 6) turns the cubic phases
  into a time shift. If n̄ is a multiple of 4, T_sr/6 = (n̄/8)T_rev is also a
  full or half revival, and the packet comes back nearly whole: a **super-revival**
  (Bluhm & Kostelecký 1994). The preset (n̄ = 44, σₙ = 1.3, on C3) has
  T_rev = 224 ms and T_sr/6 = 1.23 s. The return probability reaches 0.95 at
  T_sr/6 but only 0.80 near T_sr/4. On this scale a real n = 44 atom (T_cl =
  13 ps, T_rev = 380 ps, T_sr = 12.5 ns) is slowed down 6·10⁸ times.
* **Quantum bouncer** (a neutron or a cold atom bouncing on a mirror in
  gravity: Gea-Banacloche 1999; neutron states seen by Nesvizhevsky et al.
  2002; atoms bounced by Aminoff et al. 1993). Eₙ = mgℓ|aₙ|, with the Airy
  zeros from A&S Table 10.13 for n ≤ 10 and the asymptotic series 10.4.94
  above (agreeing to 10⁻⁸ on the table). The matrix elements −2ℓ/(zₘ−zₙ)²
  and the virial theorem ⟨z⟩ₙ = 2Eₙ/3 are checked against a diagonalisation.
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
  δEₙ ≈ ħξ(t)(n − n̄). For white noise this is the Lindblad operator √(2Γ_φ) n̂,
  and the coherences decay as

    ρ_mn ∝ e^(−Γ_φ (m−n)² t).

  The k-th harmonic dies k² times faster than the fundamental. Since a
  q-copy fractional revival lives on the Δn = q coherences, dephasing
  **erases the fine fractional revivals first, then the half revival, then
  the full one**. The attack, which is over in t_coll ≪ T_φ, is untouched.
  This is the difference between the reversible collapse (the quantised
  analogue of an inhomogeneous T₂*, undone by the revival like a spin echo)
  and irreversible decoherence. The tests check e^(−T_rev/T_φ) for the
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
9 % of real time at the defaults and 28 % in the worst case (hydrogen,
σₙ = 4, antenna: 300 pairs each), on an M2 Max in Node. All voices together
sum at most 3000 pairs: when a new note would take the total past that, the
weakest pairs of all, by their amplitude at that moment (velocity, T₁ decay and
dephasing included), are dropped for good, so faded notes give theirs up
first. 24 such voices struck together then take 31 % of a core instead of
67 %, each keeping its 125 strongest lines (91 % of its power).

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
quantum/src/quantum-model.js           spectra, matrix elements, packets, time scales (no audio, no DOM)
quantum/src/quantum-waves.js           eigenfunctions on a grid (Numerov / closed forms) for the views
quantum/src/quantum-engine.js          real-time engine (AudioWorklet and Node)
quantum/src/quantum-params.js          parameters and presets
quantum/src/quantum-main.js            page wiring and views
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

## References

* I. Sh. Averbukh, N. F. Perelman, Phys. Lett. A 139, 449 (1989): fractional revivals.
* R. W. Robinett, Phys. Rep. 392, 1 (2004): quantum wave packet revivals (time scales, the box, the bouncer).
* M. V. Berry, S. Klein, J. Mod. Opt. 43, 2139 (1996): integer, fractional and fractal Talbot effects; M. V. Berry, I. Marzoli, W. Schleich, Physics World 14(6), 39 (2001): quantum carpets.
* J. A. Yeazell, M. Mallalieu, C. R. Stroud Jr., Phys. Rev. Lett. 64, 2007 (1990): collapse and revival of a Rydberg wave packet.
* R. Bluhm, V. A. Kostelecký, Phys. Rev. A 50, R4445 (1994): super-revivals; R. Bluhm, V. A. Kostelecký, J. A. Porter, Am. J. Phys. 64, 944 (1996).
* S. Vasan, R. J. Cross, J. Chem. Phys. 78, 3869 (1983); J. A. C. Gallas, Phys. Rev. A 21, 1829 (1980): Morse matrix elements.
* M. J. J. Vrakking, D. M. Villeneuve, A. Stolow, Phys. Rev. A 54, R37 (1996): fractional revivals of a molecular wave packet.
* J. Gea-Banacloche, Am. J. Phys. 67, 776 (1999): the quantum bouncing ball. V. V. Nesvizhevsky et al., Nature 415, 297 (2002). C. G. Aminoff et al., Phys. Rev. Lett. 71, 3083 (1993).
* P. F. Naccache, J. Phys. B 5, 1308 (1972): correspondence-principle matrix elements.
* M. Abramowitz, I. A. Stegun, *Handbook of Mathematical Functions*, §10.4: Airy zeros.
