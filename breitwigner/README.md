# Breit-Wigner Keyboard

Every key is one unstable particle, the plainest resonance there is. It has a **mass**, which is
the note, and a **width** Γ, and nothing else. Struck, its amplitude turns at its mass and dies at
half its width, so the note is a single decaying sine, and the spectrum of that sound is the
**Breit–Wigner line**: a peak at the mass, Γ wide at half its height.

Width times lifetime is ħ. That one relation is the whole instrument: a wide line is a short note
and a narrow line a long one. The presets are real resonances, placed on the keyboard by their
width over their mass. A ρ meson, 19 % wide, is gone in less than one turn: a thud with hardly a
pitch. A Z boson, 2.7 %, is a knock on wood. A φ, 0.42 %, is a soft mallet. A J/ψ, 30 parts per
million wide, is a needle that rings for minutes.

Nothing else is added, and nothing is sampled. There is no hammer, no body, no second partial:
one complex number for each key, turned and shrunk once a sample. What shapes the notes is what
shapes a particle's decay. Letting a key go opens a second **decay channel** (partial widths
add), pitch bend is a **boost** (the state's energy rises and time dilation stretches its life),
and a key struck again adds its amplitude to what still rings.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/breitwigner/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): make that key's state |
| `←` `→` | octave |
| `↑` `↓` | velocity: the amplitude the state is made with |
| `Space` | keep the key-up channel shut: the states live out their own lifetimes |
| MIDI | notes, velocity, sustain pedal (CC64); **mod wheel = the width** (from the width set up to a ρ meson's); **pitch bend up = a boost** (to γ = 1.12); aftertouch opens a third decay channel; release velocity sets how wide the key-up channel opens; MPE: each note's own boost (two octaves, γ = 4), its own width by slide (CC74) and its own press |

## The physics

### 1. An unstable state

A stable state of energy E turns in time as e^(−iEt/ħ). A state that can decay does the same
with a **complex** energy, E = M − iΓ/2 (Gamow, 1928, for a nucleus about to emit an α particle):

  ψ(t) = e^(−iMt/ħ) · e^(−Γt/2ħ)

Its size squared is the chance that the state is still there, and it falls exponentially:

  |ψ(t)|² = e^(−t/τ),  **τ = ħ / Γ**

The state has no memory: in every moment the same share of what is left decays. Weisskopf and
Wigner (1930) derived this law, and the line that goes with it, for an excited atom.

The engine counts energies as frequencies (E = hf, so h = 1, not ħ): a mass is a frequency M in
hertz, the amplitude dies as e^(−πΓt), and a line Γ hertz wide lives

  τ = 1 / (2πΓ)

In one lifetime the state turns M/(2πΓ) times: 38 turns for a φ, less than one for a ρ.

### 2. The Breit–Wigner line

The spectrum of that decaying amplitude is its Fourier transform, 1/(E − M + iΓ/2), whose size
squared is

  L(E) = (Γ/2)² / ((E − M)² + (Γ/2)²)

the line Breit and Wigner (1936) wrote for the capture of slow neutrons by nuclei. It is 1 at
the mass, ½ at M ± Γ/2 (so Γ is its full width at half its height), and far from its peak it
falls only as the square of the distance. The test suite integrates the decaying amplitude
numerically and gets this line, measures the line's width in the engine's sound, and checks
width times lifetime on every preset.

**What is heard** is one real part of the turning amplitude:

  s(t) = 0.3 · v · e^(−πΓt) · sin(2πMt + φ)

with v the velocity and φ the **Phase at birth**. A real signal has a second pole at −M, so
its spectrum is the line and its mirror image, which interfere far from the peak. For a narrow
state that changes nothing; for a ρ on a low key the two overlap, and the model's `heard` is
the exact spectrum (tested against a numerical integral). The phase decides the far tails. Born
at 0° the note starts from nothing, a sine, and its spectrum falls as 1/f⁴ far above the mass.
Born at 90° it starts at its peak, a cosine: the jump is a click, and the spectrum falls as
1/f², the line's own slow tail.

### 3. Real resonances

The **Width Γ/M** control is the line's full width over the mass, from one part per million to
one. The presets take it from the Particle Data Group's masses and widths (2026):

| | M | Γ | Γ/M | real lifetime ħ/Γ | on A4: width, lifetime |
|---|---|---|---|---|---|
| ρ(770) | 775.26 MeV | 147.4 MeV | 19.0 % | 4.5 × 10⁻²⁴ s | 84 Hz, 1.9 ms |
| Δ(1232) | 1232 MeV | 117 MeV | 9.50 % | 5.6 × 10⁻²⁴ s | 42 Hz, 3.8 ms |
| Z boson | 91.1879 GeV | 2.4955 GeV | 2.74 % | 2.6 × 10⁻²⁵ s | 12 Hz, 13 ms |
| ω(782) | 782.66 MeV | 8.68 MeV | 1.11 % | 7.6 × 10⁻²³ s | 4.9 Hz, 33 ms |
| φ(1020), the default | 1019.460 MeV | 4.249 MeV | 0.417 % | 1.5 × 10⁻²² s | 1.8 Hz, 87 ms |
| η′(958) | 957.78 MeV | 0.188 MeV | 196 ppm | 3.5 × 10⁻²¹ s | 0.086 Hz, 1.8 s |
| J/ψ | 3096.9 MeV | 92.6 keV | 29.9 ppm | 7.1 × 10⁻²¹ s | 0.013 Hz, 12 s |
| Higgs boson | 125.13 GeV | 3.0 MeV | 24.0 ppm | 2.2 × 10⁻²² s | 0.011 Hz, 15 s |
| Υ(1S) | 9460.4 MeV | 54.02 keV | 5.71 ppm | 1.2 × 10⁻²⁰ s | 0.0025 Hz, 63 s |

A lifetime is the time in which the note's power falls by e (4.3 dB); a note is 60 dB down
after 13.8 lifetimes, so the φ on A4 is heard for about a second, and the J/ψ for minutes. The
key is the mass, so the keyboard plays each of these at any pitch: the same Γ/M an octave up
is a line twice as wide in hertz and a note half as long.

The Higgs boson's width is the measured one, 3.0 +1.5 −0.7 MeV, far narrower than a detector
can resolve and found from how often the boson is made off its mass. The ρ and the Δ are so
wide that their "mass" and "width" depend on how the line is parametrised; the table has the
Particle Data Group's Breit–Wigner values, and the ρ's pole lies near 763 − 73i MeV.

### 4. From key to key

How should the width change with the mass? **Width grows as Mⁿ** sets it, about A4:

  Γ(key) = (Γ/M)_A4 · M · (M / M_A4)^(n−1)

* **n = 1**, the default: the same Γ/M on every key. Each note lives the same number of turns,
  so the bass, turning slower, lasts longer, and each octave halves the lifetime.
* **n = 0**: the same Γ in hertz, so every key lives as long.
* **n = 3**: as an atom's spontaneous emission, whose rate grows as the cube of the frequency
  for the same dipole.
* **n = 5**: **Sargent's rule**. A weak decay's rate grows as the fifth power of the energy
  it releases (Sargent, 1933, from β-decay lifetimes). It is why the muon lives 2.2 millionths
  of a second and the tau, 16.8 times heavier, 0.29 trillionths: the tau's decay to an
  electron and two neutrinos is 1.35 million times faster than the muon's, and 16.8⁵ is 1.35
  million. On the keyboard each octave up is 32 times wider: the bass would ring for hours
  under a treble of ticks.

The exponent counts along the equal-tempered keyboard, so retuning a key leaves its Γ/M alone.
Γ/M is held at 2 or less.

### 5. Decay channels: partial widths add

A state that can decay in several ways has a **partial width** for each, and the widths add:

  Γ = Γ₁ + Γ₂ + Γ₃

Its lifetime is ħ over the sum, and the share of its decays that go each way is Γᵢ/Γ. The
keyboard uses this for the player's hands:

* **Key-up channel Γ₂.** Letting a key go opens a second channel, the same width in hertz on
  every key (6 Hz by default, which ends a note in about a third of a second). The note's line
  in the Decay law view bends down where the key came up, and its Breit–Wigner line widens as
  it falls. A slow lift (release velocity) opens the channel half as wide, a fast one twice as
  wide.
* **The pedal** (or Space) keeps that channel shut, so every state lives out its own lifetime;
  it opens when the pedal comes up.
* **Press channel Γ₃.** A firm press into a held key (aftertouch, above half pressure) opens a
  third channel, up to its width at full pressure: the note dies while it is pressed.

### 6. A boost

Seen from a frame in which it moves, a state of mass M has the energy γM, and its clock runs
slow: it lives γ times longer. Both come from the same complex mass. With momentum p the pole
is at

  E = √(p² + (M − iΓ/2)²) ≈ γM − iΓ/2γ

so in the lab the line is **sharper**, at γM, and **narrower**, Γ/γ. Pitch bend is that boost:
the wheel goes up to γ = 2^(2/12) = 1.12 (0.45 c), and an MPE note's own bend up to two
octaves, γ = 4 (0.97 c), where the note lives four times as long. Bending down does nothing:
no frame sees a state with less than its rest energy. This is the time dilation that lets
cosmic-ray muons reach the ground (Rossi and Hall, 1941) and that was confirmed to about a part
in a thousand with muons at γ = 29 in a storage ring (Bailey et al., 1977).

### 7. The engine

Each key has one complex number z. Once a sample it is multiplied by

  e^((−πΓ + 2πif)/fs)

with f and Γ the state's frequency and width in the lab at that moment. For a state left alone
this is the exact solution, not a step of an integrator: every sample of a note matches the
closed form of section 2 within two parts in ten million of full scale, at any pitch and any
width (tested), and a note's pitch is right to a hundredth of a cent. The output is 0.3 times z's
imaginary part, the same on both sides.

A key press **adds** v·e^(iφ) to the key's number. Amplitudes add, so a key struck again while
it still rings may be reinforced or cancelled, as its two states fall in or out of step; the
tests strike a key twice, half a turn and a whole turn apart. A width that changes (the mod
wheel, a slide, a channel opening) and a boost move the multiplier, gliding in 20 ms; the
number itself is never touched, so nothing clicks. A state is dropped when it is 100 dB under
a full one. All 128 keys can ring at once, and none is ever stolen.

## What to listen for

The demos in `examples/breitwigner/`, and how to hear each on the page:

* **One state, one line** (`01`). The default φ: a soft, pure mallet note with no attack of
  its own. Watch Lines: each note's line sinks without changing its shape.
* **Wide is short, narrow is long** (`02`). The same phrase as a ρ, a Δ, a Z, an ω, a φ and a
  J/ψ: from thuds with hardly a pitch, through knocks and bars, to tones that ring on.
* **A straight line on a log scale** (`03`). Four octaves of the same Γ/M: in the Decay law
  each is a straight line, twice as steep an octave up.
* **Partial widths add** (`04`). A long note let go: it bends down at the key-up. Then the
  same with the pedal down, which keeps the channel shut until the pedal comes up.
* **Born at its peak** (`05`). The Z as a sine, then as a cosine: the same pitch and length,
  with a click at the start that brightens it.
* **Sargent's rule** (`06`). Γ ∝ M⁵, from the bass up: long tones below, ticks above.
* **A boost** (`07`). A note bent up an octave while it rings: its pitch rises and its decay
  slows to half the rate.
* **A harp of resonances** (`08`). Arpeggios with the pedal down: pure decays, each living out
  its own lifetime.

## Files

```
breitwigner/src/breitwigner-params.js              the parameters and presets
breitwigner/src/breitwigner-instrument.js          the descriptor
breitwigner/src/breitwigner-wasm.js                the engine and model, as WebAssembly
breitwigner/src/breitwigner-main.js                the page's views
breitwigner/src/breitwigner-tour.js                the guided tour
native/instruments/breitwigner/breitwigner-model.*   the state: mass, width, lifetime, boost, line
native/instruments/breitwigner/breitwigner-engine.*  the real-time engine
native/instruments/breitwigner/breitwigner-web.cpp   the model's functions for the page and the tests
test/breitwigner-tests.mjs                         the tests
tools/render-breitwigner.mjs                       the demos
```

## Simplifications

* **A pure exponential.** A real unstable state does not decay exponentially at the very
  start or after very many lifetimes: its energies have a threshold below which there are
  none, and that bends the law at both ends (Fonda, Ghirardi and Rimini's review). For
  anything narrow the bends are far out of reach. Here the law is exact from the first sample
  to the last.
* **A constant width.** For a wide resonance the width itself changes across the line (the
  ρ's grows with the pions' momentum, cubed), so its line is skewed and its mass depends on
  the form chosen. The ρ and Δ presets take one number, Γ/M, and make a plain line of it.
* **One state at a time.** There is no interference between a resonance and a background or
  a neighbour (the ρ–ω mixing that notches the real ρ line), and no production: a key makes
  its state whole, at one instant. Two keys never interfere, being different states; only a
  key struck again does.
* **The key-up and press channels are the player's, not physics**: a real state's channels
  cannot be opened and shut. What is physical is that they add.
* **The boost's width, Γ/γ, is the narrow state's.** The exact pole of section 6 differs in
  second order in Γ/M (tested); even for a ρ that is about a part in a thousand.
* **A boost that changes while the state rings** is an acceleration, which would radiate
  and do more than this; here the energy and the width just follow γ.
* **The sound is one part of the amplitude.** The chance that a state is still there has no
  oscillation in it, and a detector sees the decays, not the amplitude. Hearing the amplitude
  turn is the instrument's one liberty, the same that makes any resonance audible.
* **No room for the particle**: no recoil, no spin, no decay products. The line is the whole
  description.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims nothing here: a state is
one multiplication a sample, and all 128 keys ringing at once cost less than a single voice of
most instruments. High, Medium and Low sound the same (tested).

## Prior art and references

### The line and the decay law

* G. Gamow, "Zur Quantentheorie des Atomkernes", *Z. Phys.* 51, 204–212 (1928),
  [doi:10.1007/BF01343196](https://doi.org/10.1007/BF01343196): a decaying state as a state of
  complex energy.
* V. Weisskopf and E. Wigner, "Berechnung der natürlichen Linienbreite auf Grund der Diracschen
  Lichttheorie", *Z. Phys.* 63, 54–73 (1930),
  [doi:10.1007/BF01336768](https://doi.org/10.1007/BF01336768): exponential decay and the natural
  line's shape.
* G. Breit and E. Wigner, "Capture of Slow Neutrons", *Phys. Rev.* 49, 519–531 (1936),
  [doi:10.1103/PhysRev.49.519](https://doi.org/10.1103/PhysRev.49.519): the line.
* L. Fonda, G. C. Ghirardi and A. Rimini, "Decay theory of unstable quantum systems",
  *Rep. Prog. Phys.* 41, 587–631 (1978),
  [doi:10.1088/0034-4885/41/4/003](https://doi.org/10.1088/0034-4885/41/4/003): where the
  exponential law holds and where it bends.
* B. W. Sargent, "The maximum energy of the β-rays from uranium X and other bodies",
  *Proc. R. Soc. A* 139, 659–673 (1933),
  [doi:10.1098/rspa.1933.0045](https://doi.org/10.1098/rspa.1933.0045): the fifth-power rule.

### The resonances

* F. Takahashi et al. (Particle Data Group), "Review of Particle Physics",
  *Int. J. Mod. Phys. A* 41, 2630011 (2026), and <https://pdg.lbl.gov>: every mass, width and
  lifetime above.
* J. J. Aubert et al., "Experimental Observation of a Heavy Particle J", *Phys. Rev. Lett.* 33,
  1404–1406 (1974), [doi:10.1103/PhysRevLett.33.1404](https://doi.org/10.1103/PhysRevLett.33.1404),
  and J.-E. Augustin et al., "Discovery of a Narrow Resonance in e⁺e⁻ Annihilation",
  *Phys. Rev. Lett.* 33, 1406–1408 (1974),
  [doi:10.1103/PhysRevLett.33.1406](https://doi.org/10.1103/PhysRevLett.33.1406): the J/ψ, whose
  narrowness announced a new quark.
* The ALEPH, DELPHI, L3, OPAL and SLD Collaborations, "Precision electroweak measurements on the
  Z resonance", *Phys. Rep.* 427, 257–454 (2006),
  [doi:10.1016/j.physrep.2005.12.006](https://doi.org/10.1016/j.physrep.2005.12.006): the Z's
  line, measured point by point.

### Time dilation

* B. Rossi and D. B. Hall, "Variation of the Rate of Decay of Mesotrons with Momentum",
  *Phys. Rev.* 59, 223–228 (1941),
  [doi:10.1103/PhysRev.59.223](https://doi.org/10.1103/PhysRev.59.223): faster muons live longer.
* J. Bailey et al., "Measurements of relativistic time dilatation for positive and negative muons
  in a circular orbit", *Nature* 268, 301–305 (1977),
  [doi:10.1038/268301a0](https://doi.org/10.1038/268301a0): the storage-ring measurement.

### Earlier models and syntheses

A decaying sinusoid is the oldest unit of synthesis there is, and each of Forte's struck
instruments is a sum of them. What is new here is only that there is one, and that its two
numbers are a particle's.

* X. Rodet, "Time-Domain Formant-Wave-Function Synthesis", *Computer Music Journal* 8(3), 9–14
  (1984), [doi:10.2307/3679809](https://doi.org/10.2307/3679809): voices built from decaying
  sinusoids, each a formant with a width.
* M. Mathews and J. O. Smith, "Methods for Synthesizing Very High Q Parametrically Well Behaved
  Two Pole Filters", SMAC-03 (Stockholm, 2003),
  [paper](https://ccrma.stanford.edu/~jos/smac03maxjos/): one resonance as a turning complex
  number, as the engine here does it.
* E. Hill, J. Cherston, S. Goldfarb and J. Paradiso, "ATLAS data sonification: a new interface
  for musical expression", *PoS* ICHEP2016, 1042 (2017),
  [doi:10.22323/1.282.1042](https://doi.org/10.22323/1.282.1042): collision data mapped to
  sound (Quantizer), a different thing from playing a resonance's own line.
