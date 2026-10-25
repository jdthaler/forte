# Project 8

A neutrino-mass experiment as a keyboard. Project 8 weighs the neutrino by
listening to single electrons: an electron from a tritium decay, caught in a
magnetic bottle in a field of about 1 tesla, circles the field lines 26 billion
times a second and broadcasts that frequency as a faint microwave whistle,
**cyclotron radiation**. Because the electron is relativistic, its frequency,
eB / 2πγm, tells its energy to a few parts in a million, and the experiment
reads the energy off the frequency: Cyclotron Radiation Emission Spectroscopy
(CRES), proposed by Monreal and Formaggio in 2009 and first heard by Project 8
in 2015. Here every key is a CRES cell holding one electron. The 26 GHz is
moved down to the key's note, every frequency by the same factor, but **time is
not touched**: everything the electron does happens when it would in the real
trap. As it radiates it loses energy, its relativistic mass falls and its note
**chirps upward**, about 21 cents in the first second, while it fades. It
**bounces** along the field in the bottle, and the bounce's Doppler shift is a
vibrato. A collision with the **gas** left in the trap nudges it, or knocks it
out, and the note stops. And if nothing knocks it out, its own radiation
narrows its pitch angle until the bottle can no longer hold it, a few seconds
in. Nothing is sampled: the radiation reaction is Landau and Lifshitz's in
closed form, the radiation is Larmor's and Schott's, and the tests check them,
with the electron's frequency matching Project 8's measured krypton line to a
part in ten million.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/project8/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): an electron in that key's trap |
| `←` `→` | octave |
| `↑` `↓` | velocity: how loud the electron plays |
| `Space` | keep the traps closed after the keys come up |
| MIDI | notes, velocity, sustain pedal (CC64), **mod wheel = gas pressure**, **pitch bend = the magnetic field** (±2 semitones), MPE (each key's own field and gas) |
| Touch | as the keys |

## The physics

### 1. The cyclotron frequency

An electron of kinetic energy K in a field B circles it at

  f = eB / 2π(m + K/c²) = 27.992 GHz/T × B / γ

with γ = 1 + K / mc² (mc² = 511.0 keV). Project 8's calibration electrons, the
K-shell conversion line of krypton-83m at 17 824.23 eV, circle at
25.940 625 GHz in Phase II's 0.959 T: the model gives that to a part in ten
million. A slower electron is lighter, so it circles faster: a keV less energy
is 3.3 cents higher. That is the whole method: the frequency is the energy.

**The keyboard's scale.** Each key's trap is the same; its note is the
reference electron's starting frequency (the krypton line, or for tritium the
endpoint, or the energy you choose), divided down onto the key. Every other
frequency in the sound, the harmonics and the bounce's sidebands, is divided
by the same factor, so the sound is the real spectrum, moved. Times are left
alone: the chirp, the bounce's effects on the pitch, the collisions and the
escape run at their real speed.

### 2. Radiation, and the chirp

A circling electron radiates (Larmor):

  P = e⁴ B² γ² β⊥² / 6π ε₀ m² c = (mc² / 2τ) (γβ⊥)²

  τ = 3π ε₀ m³ c³ / e⁴ B² = 2.58 s × (1 T / B)²

about a femtowatt at 18 keV. The tests check τ against 3 / 4(r_e/c)ω² with the
classical electron radius. The energy drains out in a few times τ (2.80 s in
0.959 T; **Magnetic field** sets it), so the frequency rises:

  (1/f) df/dt = P / γmc²

which for the krypton line at 89.5° in 0.959 T is 317 MHz a second. Project 8
measured 352 ± 55 MHz/s (mean and spread) in its Phase II waveguide, which
radiates a little more than free space does. On the keyboard that is 21 cents in
the first second, slowing as the energy falls, towards a ceiling: the note an
electron at rest would sound, γ times the start, 60 cents up from 17.8 keV.
The radiated field, and so the note's amplitude, goes as γβ⊥, so it fades as
it climbs: the energy e-folds in τ and the amplitude in 2τ.

**The radiation reaction exactly.** In a uniform field, Landau and Lifshitz's
radiation reaction leaves the velocity along the field alone, so in the frame
that moves along the field with the electron it simply spirals in, with
dγ′/dt′ = −(γ′² − 1) / 2τ, which is solved by

  γ′ = coth(t′ / 2τ + const),  γ = γ∥ γ′,  t′ = t / γ∥

The engine follows that closed form; the tests integrate the Larmor loss
directly and compare.

### 3. The trap

The bottle is a field that rises away from the centre:

  B(z) = B₀ (1 + z² / L²)

up to walls a **Trap depth** above B₀ (Phase II used 0.01 to 0.72 mT on
0.959 T; here 0.5 mT). An electron's magnetic moment p⊥² / B is kept as it
moves, so the field turns it back where B = B₀ / sin²θ, θ its pitch angle at
the centre (the angle between its velocity and the field): only electrons with
cot²θ < ΔB / B₀ are held, θ > 88.69° here, and since the decays send them in
every direction, cos θ is uniform up to that. The mirror force is linear in z,
so the bounce is exactly harmonic:

  z = L cot θ sin ψ,  f_a = v⊥ / 2πL

123 MHz in Phase II's proportions (**Trap length** L = 10 cm), 1/211 of the
cyclotron frequency: on the keyboard, 2.1 Hz at A4. The electron sees more
field away from the centre, f (1 + cot²θ sin²ψ): a mean of B₀ (1 + cot²θ / 2),
which makes an electron that bounces further a little sharp (less than half a
cent here), and a wobble at twice the bounce. The tests integrate the bounce
from the mirror force and check both.

**Radiating out.** Radiation takes p⊥ and leaves the velocity along the field,
so the pitch angle closes, tan θ ∝ e^(−t/2τ): the bounce widens (its vibrato
deepens and its pitch creeps up) until the electron reaches the walls and
leaves. With cos θ uniform at the start, that takes a time that is
exponentially distributed with mean 2τ, 5.6 s, whatever the depth.

### 4. The receiver

* **Waveguide** (Phase II): a copper pipe 10.03 mm across along the field,
  whose TE₁₁ mode (cutoff 1.8412 c / 2πa = 17.5 GHz) carries the cyclotron
  frequency alone. As the electron bounces, the wave it launches up the guide
  is Doppler-shifted by its axial velocity: a phase modulation of index

  h = k_g z_max = (2π f / v_φ) L cot θ = βc f cos θ / v_φ f_a

  Project 8's own expression, with v_φ the guide's phase velocity. At the
  walls h = 0.92 here: Project 8 kept h below about 1 so the carrier, which
  holds J₀(h)² of the power, stays visible. On the keyboard the sidebands are a
  vibrato at the bounce frequency, h f_a deep: a few cents, deeper for
  electrons near the walls and as each one cools.
* **Antenna ring**: antennas around the trap that see the electron side-on, as
  Project 8's later free-space designs do. A relativistic electron's orbit
  seen edge-on is not a sine but a pulse train, with harmonics whose fields
  are (Schott)

  Eₙ ∝ n β⊥ Jₙ′(nβ⊥) × ω

  at 17.8 keV the second is 6 dB under the fundamental and the third 13 dB;
  at 300 keV they fall off slowly. They fade faster than the fundamental as the
  electron cools, so the note grows purer as it rises. Seen side-on there is
  no first-order Doppler shift, so no vibrato, only the field's wobble. The
  tests check Schott's powers, summed over all directions and harmonics,
  against Larmor's total, and their small-β limit against Landau and Lifshitz.
* **Receiver noise**: the amplifier's thermal noise in the key's channel, a
  band a quarter of the note wide around it, at a level relative to the
  electron (the real signal-to-noise depends on a bandwidth and a time this
  scale changes, so it is a choice here). It hisses while the key is held,
  after the electron has gone too.

### 5. The gas

The trap is never empty. The electron meets the hydrogen left in it at a rate

  Γ = n σ v,  n = p / kT

with σ = 3.40 × 10⁻²² m² (inelastic, tritium, at 18.6 keV; Aseev et al. 2000),
elastic collisions a tenth as likely (as Project 8 found), scaled as 1/β² at
other energies (Bethe's leading term), and the gas at the Phase II cell's 85 K.
At 10⁻¹⁰ mbar (**Gas pressure**, the mod wheel) that is one every 3.9 s; at
Phase II's 2 × 10⁻⁶ mbar one every 0.2 ms (Project 8 measured 0.15 to 0.19 ms),
so each note is a blip.

* **Inelastic** (most): the molecule is excited or ionised. The electron loses
  12.6 eV (the peak of hydrogen's energy-loss spectrum) or 15.4 eV plus what
  the freed electron takes, and is turned through a small angle, 0.5° on
  average (KATRIN's). The frequency steps up by a few hundred kHz, which the
  receiver view shows and the ear cannot hear, and the pitch angle shifts: if
  it leaves the trap's acceptance, the electron is gone.
* **Elastic**: the electron glances off the screened protons, turned by about
  ħ / p a_TF = 1.8° (Thomas–Fermi screening), usually out of the shallow trap.

### 6. The sources

* **Krypton-83m** (the default): every electron at the K line's 17.824 keV,
  each note on its key.
* **Tritium β decay**: each electron's energy drawn from the β spectrum

  dN/dK ∝ F(Z = 2, E) p E (E₀ − K)²

  with Fermi's function 2πη / (1 − e^(−2πη)), η = αZ / β, and E₀ = 18 573.7 eV
  (KATRIN). Its mean is 5.69 keV, as the tests check. The key is the endpoint:
  an electron that left the antineutrino nothing. Every other electron is
  lighter, so it is sharp of the key by about 3.3 cents for each keV the
  antineutrino took, 40 cents on average. A neutrino mass m would keep every
  electron at least m c² below the endpoint: with today's limits (under an eV)
  that is a few thousandths of a cent, which is why Project 8 counts electrons
  for months.
* **One energy**: from 1 to 300 keV. Faster electrons are louder and brighter
  and climb further as they cool (8 semitones from 300 keV).

### 7. Playing

Pressing a key puts an electron in its trap, at a random pitch angle the trap
holds and at a random phase of its bounce. Letting go opens the trap: the
electron leaves, and its note stops within a few milliseconds (a note that ends
on its own, an electron radiated or knocked out, also ends over 2 ms, the
receiver's response). The pedal keeps the traps closed. Pitch bend and MPE
bend move the magnet's field, ±2 semitones: the note follows the field, and
the electron cools faster in a stronger one (τ ∝ B⁻²).

## What to listen for

* **The chirp.** Hold a key: the note climbs, quickly at first, slowing, and
  fades as it goes. Hold a chord: every note climbs by the same ratio, so the
  chord stays in tune with itself.
* **The escape.** With no gas, each note stops on its own, after a few seconds
  that differ from note to note: its pitch angle has closed until the bottle
  could not hold it. Watch the trap view: its bounce widens first.
* **The vibrato.** The waveguide's Doppler shift: some electrons wobble, some
  hardly (their pitch angle), and every note's wobble deepens as it cools. A
  deeper trap (**Trap depth**) holds wider bounces and deeper vibrato; a longer
  one (**Trap length**) slows it.
* **The gas.** Turn the mod wheel up: notes end sooner, until at Phase II's
  pressure each is a pitched blip, and in the receiver view the tracks break
  up into the short, stepped segments of Project 8's spectrograms.
* **Tritium.** Each electron its own pitch, sharp of the key by the energy its
  antineutrino took; the energies view fills in the β spectrum.
* **Relativity.** At 300 keV with the antenna ring, a buzzy, harmonic-rich
  pulse train that climbs most of an octave and grows purer as it slows.

## Files

```
project8/index.html, style.css            page
project8/src/project8-params.js           parameters and presets
project8/src/project8-instrument.js       the descriptor: everything but the page
project8/src/project8-main.js             page wiring and views
project8/src/project8-wasm.js             the engine and model, the C++ as WebAssembly (project8/wasm/project8.wasm)
native/instruments/project8/              the physics in C++: model, engine, reference (plugins and WebAssembly)
test/project8-tests.mjs                   node test/project8-tests.mjs (25 tests, about 2 s)
tools/render-project8.mjs                 node tools/render-project8.mjs → examples/project8/
```

## Simplifications

* **The scale.** Only frequencies are scaled, so the real time-bandwidth of a
  measurement is not kept: the receiver's noise is a level you choose, not the
  real signal-to-noise, and the vibrato's rate scales with the note (f/211).
* **Free-space radiation.** The power is the free-space Larmor power; a real
  waveguide or cavity changes it by tens of percent (Project 8's measured
  chirp is 10 % above this one). The waveguide's coupling to the electron does
  not depend on where in the guide it sits, and the guide carries the wave one
  way only.
* **An ideal bottle.** The field is exactly harmonic along the axis and
  uniform across it, and the bounce and the cooling use the centre's values
  (the field changes by less than a part in a thousand over the bounce). The
  electron's guiding centre sits on the axis.
* **The collisions** are simplified: half excite (12.6 eV), half ionise (15.4
  eV and the freed electron's share, drawn as 1/(w + 15.4 eV)²); inelastic
  angles are exponential with KATRIN's mean 0.5°, elastic ones screened
  Rutherford with one angle; the cross section scales as 1/β² without Bethe's
  logarithm; the gas is hydrogen alone.
* **One electron a trap**, with no other electrons, ions or space charge.
* Endings (an escape, a released key) are smoothed over 2 to 5 ms; the real
  signal stops within a bounce.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims what plays
at once: 16 electrons at Medium and 10 at Low, against 24 at High (the quietest
let-go one fading first), and the antenna ring's harmonics, 6 at Medium and 3
at Low against up to 12. A single note with the waveguide sounds the same at
every setting.

## Prior art and references

**The experiment**

* B. Monreal and J. A. Formaggio, "Relativistic cyclotron radiation detection
  of tritium decay electrons as a new technique for measuring the neutrino
  mass", *Phys. Rev. D* 80, 051301 (2009),
  [doi:10.1103/PhysRevD.80.051301](https://doi.org/10.1103/PhysRevD.80.051301):
  the idea of CRES.
* D. M. Asner et al. (Project 8), "Single-electron detection and spectroscopy
  via relativistic cyclotron radiation", *Phys. Rev. Lett.* 114, 162501
  (2015),
  [doi:10.1103/PhysRevLett.114.162501](https://doi.org/10.1103/PhysRevLett.114.162501):
  the first electrons heard, from krypton-83m.
* A. Ashtari Esfahani et al. (Project 8), "Tritium beta spectrum measurement
  and neutrino mass limit from cyclotron radiation emission spectroscopy",
  *Phys. Rev. Lett.* 131, 102502 (2023),
  [doi:10.1103/PhysRevLett.131.102502](https://doi.org/10.1103/PhysRevLett.131.102502).
* A. Ashtari Esfahani et al. (Project 8), "Cyclotron radiation emission
  spectroscopy of electrons from tritium beta decay and ⁸³ᵐKr internal
  conversion", *Phys. Rev. C* 109, 035503 (2024),
  [doi:10.1103/PhysRevC.109.035503](https://doi.org/10.1103/PhysRevC.109.035503):
  Phase II's field, traps, waveguide, krypton line, chirp, collision times
  and modulation index, the numbers this instrument is built from.

**The physics**

* J. Larmor, "On a dynamical theory of the electric and luminiferous medium,
  Part III", *Phil. Trans. R. Soc. A* 190, 205–300 (1897): the radiated power.
* G. A. Schott, *Electromagnetic Radiation* (Cambridge University Press, 1912):
  the harmonics of a circling charge.
* L. D. Landau and E. M. Lifshitz, *The Classical Theory of Fields*, §§74–76:
  magnetic bremsstrahlung, its harmonics at small velocities, and the radiation
  reaction.
* E. Fermi, "Versuch einer Theorie der β-Strahlen. I", *Z. Phys.* 88, 161–177
  (1934): the β spectrum and its Coulomb factor.
* M. Aker et al. (KATRIN), "Improved upper limit on the neutrino mass from a
  direct kinematic method by KATRIN", *Phys. Rev. Lett.* 123, 221802 (2019),
  [doi:10.1103/PhysRevLett.123.221802](https://doi.org/10.1103/PhysRevLett.123.221802):
  E₀ = 18 573.7 eV.
* V. N. Aseev et al., "Energy loss of 18 keV electrons in gaseous T₂ and
  quench condensed D₂ films", *Eur. Phys. J. D* 10, 39–52 (2000),
  [doi:10.1007/s100530050525](https://doi.org/10.1007/s100530050525): the
  inelastic cross section.
* V. Hannen et al., "Deconvolution of the energy loss function of the KATRIN
  experiment", *Astropart. Phys.* 89 (2017),
  [arXiv:1701.08066](https://arxiv.org/abs/1701.08066): the inelastic angles.

**Earlier syntheses**

* We know of no earlier musical instrument built on CRES. Project 8's own
  plots of frequency against time are where the receiver view comes from.
