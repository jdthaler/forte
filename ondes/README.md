# Ondes Martenot

Maurice Martenot's *ondes musicales* (Paris, 1928), the electronic
instrument of Messiaen, Honegger, Jolivet and Varèse. Its note is the
difference of two radio-frequency oscillators: one fixed, the other tuned by
a variable capacitor that the keyboard, or a ring on the finger pulling a
ribbon, moves. Mixed and detected, they beat at the difference, and the beat
is the note. The left hand plays a second instrument in a drawer: a key whose
pressure sets the loudness, and switches that send the beat through shaping
circuits, the *timbres*. The sound comes out of one or more *diffuseurs*,
loudspeakers that are instruments in themselves: one with springs stretched
across it, one whose cone is a tam-tam, one with two dozen strings.

Here the two oscillators pull on each other as real ones do (Adler's
equation), each sample stepped exactly; the intensity key follows the force
and level measured on a real one; the timbres are shaped from the beat's
phase and band-limited where they jump; and the diffuseurs are physics too:
the springs' and the tam-tam's modes solved from their geometry and
material, and the palme's 24 strings rung through their bridge. You can hear
the low notes buzz as the oscillators pull, the ring slide evenly through the
semitones, a note swell under the left hand, and the tam-tam's halo and the
palme's strings ring on after it.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/ondes/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8); a note sounds while its key is held |
| `←` `→` | octave |
| `↑` `↓` | the keyboard's vibrato |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity (how hard the intensity key is pressed); **aftertouch presses harder**; **mod wheel = the keyboard's vibrato** (from none up to ±60 ¢); pitch bend ±2 semitones; sustain pedal = hold |
| MPE | each note bends on its own, up to four octaves either way (a finger sliding as the ring slides), its pressure presses its intensity key, and CC74 rocks its own key (its vibrato) |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch |

**Playing.** *Keys* gives every key an ondes of its own, so chords play.
*Ribbon* is the instrument as built: a single tone. A key pressed while
another is held slides the ring along the ribbon to it, in the *ring's
slide* time, and letting it go slides back to the key still down; a key
pressed alone lands there.

## The heterodyne

Two valve oscillators run near 100 kHz, far above hearing. The note is
their difference: mixed, rectified and filtered, their sum's envelope rises
and falls at the rate they slip past each other. A tiny change of the
variable oscillator's capacitance moves the note a lot (a part in a
thousand of 100 kHz is 100 Hz), which is why one capacitor, turned by the
keys or by the ribbon's wire round its pulley, covers seven octaves.

Two oscillators this close do not run independently. Each leaks a little of
its signal into the other, and an oscillator nudged by a signal near its own
frequency is pulled toward it. Robert Adler (1946) worked out what that does
to the phase difference φ between them:

  dφ/dt = Δ − K sin φ

where Δ is the difference they would have on their own and K, the lock
range, is how strongly they pull (the frequency times the injected
fraction over twice the tank's Q). If Δ < K they lock, φ stops, and the note
is gone: the dead zone at the bottom of a theremin's range. If Δ > K the
phase still goes round, but not evenly: it lingers where K sin φ slows it and
hurries where it doesn't. Its mean rate is

  Ω = √(Δ² − K²)

and its waveform is no longer a sine: cos φ has harmonics falling
geometrically,

  aₙ/a₁ = rⁿ⁻¹,    r = (Δ − Ω)/K

so the note grows buzzier as it nears the lock (r → 1). Far above it
r ≈ K/2Δ, and the pull is inaudible.

**Each sample, exactly.** z = e^{iφ} obeys a Riccati equation,
dz/dt = iΔz − (K/2)(z² − 1), and a Riccati equation's flow is a Möbius map.
Over one sample, with Δ and K held,

  z → (a z + b)/(b z + ā),    a = cos ωh + i (Δ/2ω) sin ωh,    b = (K/2ω) sin ωh,    ω = ½√(Δ² − K²)

(cosh and sinh when locked). It keeps |z| = 1, needs no small steps, and is
the same map the equation integrates to. The engine recomputes it every 16
samples, as the ribbon, the bends, the vibrato and the drift move Δ.

**Tuning.** A technician tunes each key by ear, so each key's capacitor is
trimmed to the difference whose *pulled* beat is its note:

  Δ = √(f² + K²)

So every key is in tune at any pull (the tests play every key within 1 ¢,
pulled hard or not, at A = 440 and 415, and in meantone), and the pull is
heard only in the waveform: the low notes, where K/Δ is largest, turn
buzzy. With the default 1.5 Hz lock range that is a few percent of second
harmonic on the bottom octave; the *Strong pulling* preset (25 Hz) makes
the bottom of the keyboard snap.

The **Beat** view draws the phase going round a circle, with its speed
Δ − K sin φ plotted around it, and one cycle of the timbres it makes.

## The detector and the timbres

The detector follows the envelope of the two oscillators' sum,

  |A₁ + A₂ e^{iφ}| = A₁ √(1 + a² + 2a cos φ),    a = A₂/A₁

which is the **detector balance**. A weak variable oscillator (a → 0) gives a
pure sine at the beat; equal ones (a = 1) a full-wave rectified sine,
|cos(φ/2)|, every harmonic present and falling as 1/(4n² − 1). That is the
**O (onde)** timbre, scaled to a unit fundamental.

The other switches in the drawer send the beat through circuits whose
diagrams Martenot did not publish; Loriod's method and the instruments'
restorers describe them by their spectra, and each is built here from the
phase φ as the circuit that gives that spectrum would build it:

| switch | | from φ | harmonics |
|---|---|---|---|
| **C** | creux (hollow) | a half-wave rectifier, max(cos φ, 0) | the fundamental and its even harmonics, 4/3π, 4/15π … |
| **g** | petit gambe | a triangle, asin(cos φ) | odd, as 1/n² |
| **G** | gambe | a clipped sine, sign(cos φ) | odd, as 1/n |
| **N** | nasillard | a pulse, on while \|φ\| < πw | all, as sin(nπw)/n |
| **8** | octaviant | a full-wave rectifier, \|cos φ\| | the octave and its harmonics |
| **S** | souffle | pink noise | none: breath |

Any of them can be on at once, sharing the level; the octaviant and the
souffle have sliders, as on the later instruments. Because each is a
function of the pulled phase, the pull reaches them all: a strongly pulled
gamba's square spends longer on one side than the other.

**Band-limiting.** The steps (gambe, nasillard) and corners (creux,
octaviant, petit gambe) would alias at the top of the keyboard. Each
sample, the engine finds where φ crossed a step or corner, to a fraction of
the sample (from z's angle before and after), and adds the polyBLEP or
polyBLAMP residual there, one sample late. The tests find the gamba's
loudest alias at E7 (its 11th harmonic, folded to 19 kHz) more than 30 dB
down.

## The intensity key

The left hand presses the *touche d'intensité*: a small leaf spring
pressing a bag of powder, graphite in mica, which conducts better the harder
it is squeezed (like a carbon microphone). No sound comes until it is
pressed; its contact opens at rest. Quartier, Meurisse, Colmars, Frelat &
Vaiedelich (2015) measured one: players press it with 0.3 to 3 N, the bag
crushes like a spring F = k u^α (α ≈ 3), its resistance falls from about
466 kΩ to 18 kΩ, and the level spans about 50 dB:

| force (N) | 0.39 | 0.47 | 0.52 | 0.62 | 0.82 | 1.34 | 9.6 |
|---|---|---|---|---|---|---|---|
| level (dB SPL) | 45.0 | 53.3 | 61.6 | 70.0 | 78.3 | 86.6 | 95.0 |

Here a key's velocity is the force, from 0.3 N (velocity 0) to 3 N
(velocity 1), evenly in log force, and aftertouch presses on to 9.6 N; the
level follows that table, straight between its points in log force (and
along its end segments past them). So most of the dynamics live in the
first newton, and pressing harder still adds less and less, as the
measurements show. The force rises in the *pressing* time and falls in the
*letting go* time, by default faster (the powder lets go faster than it
squeezes, as the restorers note); below 0.05 N the contact opens and the
voice ends.

## Keys, the ribbon and the vibrato

On the ribbon, the ring's wire turns the capacitor through a pulley, and the
keyboard printed above it has keys of equal width: the pitch goes evenly in
semitones along it. So the ring's slide here moves log f at a steady rate,
taking the *ring's slide* time from key to key. On the keyboard, the keys
rock from side to side and move the capacitor with them: the **keyboard
vibrato**, its depth in cents on the mod wheel, its rate a parameter. MPE's
per-note bend slides one note as the ring would, and its CC74 rocks that
note's key.

**Thermal drift.** As the valves warm, both oscillators wander. A few parts
per million of 100 kHz is a fraction of a hertz to hertz, and since the note
is their difference, every note moves by the same hertz: the low notes drift
most in cents. The *drift* (rms, in Hz) is a slow random walk
(Ornstein–Uhlenbeck, wandering over about 4 s), shared by every voice. It is
off by default.

## The diffuseurs

The sum of the voices goes to the loudspeakers switched on, each at its own
level and its own place across the stereo field (they stood side by side).

**Principal (D1).** A large cone loudspeaker: a second-order high-pass at its
55 Hz resonance and a roll-off above 7 kHz.

**Résonance (D2): the springs.** A loudspeaker with six or seven brass
springs stretched in front of it and fixed to its voice coil, which ring on
after the note. Here seven springs 38–56 cm long, coils 2 cm across, of 0.8 mm
wire. Waves on a coil are dispersive. For its transverse waves the
curved-rod model of Fletcher, Tarnopolskaya & de Hoog (2001), which the
spring-reverb literature uses, gives

  ω² = κ²k²(ε² − k²)²/(ε² + k²),    κ = (r/2)√(E/ρ),    ε = 1/R

a branch that rises from zero to a peak at the transition frequency F_C
(368 Hz for these springs; Parker & Bilbao's 3r√(E/ρ)/16√5πR²), falls back
to zero at k = 1/R, and climbs again as a bending wave. Each spring, pinned
at its ends, rings at k = nπ/L on that curve: modes crowd toward F_C from
below, and above it they spread out. Each is driven and heard through the
end on the voice coil (in proportion to k²), and decays with a constant
loss factor, T60 ∝ 1/f, set at 500 Hz (at most three times that below).
Together they give the spring reverb's chirps.

**Métallique (D3): the tam-tam.** A tam-tam, 40 to 75 cm across, in place of
the cone: the voice coil drives the bronze plate. Its modes are those of a
free circular Kirchhoff plate: W = J_m(λr) + C I_m(λr), with no moment and
no shear at the rim, which gives Leissa's frequency equation in λ for each
number m of nodal diameters. The engine solves it once (Bessel functions by
Miller's recurrence; the tests find Leissa's λ² for ν = 0.3 to 5×10⁻⁴) for
every mode up to λ = 60, about 480 of them, and normalises each shape
exactly (Lommel's integrals). A plate h thick and a across then rings at

  f = λ² √(D/ρh) / 2πa²,    D = E h³/12(1 − ν²)

(bronze, 1.5 mm). The coil drives it, and it radiates, at 0.3 of the radius
from the centre, so each mode rings in proportion to W² there: at the
centre only the axisymmetric modes would ring. The modes from 40 Hz to
6 kHz ring, decaying with a constant loss factor set at 1 kHz.

**Palme (D4): the strings.** A palm-leaf sound box with twelve strings on
each face, tuned to the twelve semitones, the exciter driving their bridge.
Here the front strings run from A3 (220 Hz, the French La2) up a chromatic
octave and the back ones an octave higher, in the keyboard's tuning. Each
string is a delay loop (Karplus–Strong, with Jaffe and Smith's tuning
allpass and a one-pole loss), fed by the bridge: a note rings the strings of
its own pitch class and those its harmonics land on, and they ring on after
it, for the *palme strings' ring* time. The sound box also sounds the note
itself, through the principal's filters.

The **Diffuseurs** view draws each one's lines (the springs' modes, the
tam-tam's, the palme's strings) on one axis with the note's harmonics below:
a harmonic that lands near a line sets it ringing.

## What to listen for

`examples/ondes/` has eight renders (`node tools/render-ondes.mjs`):

1. **A ribbon melody with vibrato**: legato slides between the notes, the
   keyboard's vibrato growing on the long ones, through the principal, the
   palme and a little of the tam-tam.
2. **Principal, springs, tam-tam, palme**: the same arpeggio through each
   diffuseur in turn.
3. **The drawer**: one held A3 through O, C, g, G, N, then O with the
   octaviant.
4. **Low notes without and with pulling**: A0, E1, A1, E2 at no pull, then
   pulled hard (25 Hz): the same pitches, buzzier.
5. **The intensity key pressed and let off**: a soft note swelled with
   aftertouch to the loudest nuance and back.
6. **Chords through the tam-tam**: an ondes for each key; the halo rings on
   between the chords.
7. **Warming up**: thermal drift on a slow line; the low A1 wanders most.
8. **Souffle and gambe through the springs**: the petit gambe with breath,
   the springs chirping after each note.

## Files

```
ondes/index.html, style.css                 page
ondes/src/ondes-params.js                   parameters and presets
ondes/src/ondes-instrument.js               the descriptor: everything but the page
ondes/src/ondes-main.js                     page wiring and views
ondes/src/ondes-wasm.js, ondes/wasm/ondes.wasm   the engine and model, built from the C++
native/instruments/ondes/                   the physics in C++: model and engine (plugins and WebAssembly)
test/ondes-tests.mjs                        node test/ondes-tests.mjs
tools/render-ondes.mjs                      node tools/render-ondes.mjs → examples/ondes/
```

## Simplifications

* **The oscillators are their phase difference.** The 100 kHz oscillators
  are not run; only φ is, through Adler's equation, which holds when the
  pull is weak and the tanks' Q high. The lock range is a knob: we found no
  measurement of a Martenot's. Nor of its radio frequency: the drift is set
  in hertz.
* **The detector is an ideal envelope detector**, and its filter passes the
  audio band untouched.
* **The timbres are their spectra.** Martenot's shaping circuits are not
  documented; each is built from φ to give the spectrum its name is known
  for, not from its valves.
* **The intensity key follows the measured curve** with a smooth press and
  release. Its hysteresis (the powder lets go faster, and settles) is only
  the faster release; the leaf spring's travel is not simulated.
* **Each key an instrument.** *Keys* gives every key its own pair of
  oscillators, so chords play, where the real instrument has one; *Ribbon*
  is the one.
* **The springs are linear and pinned**, their mounts and the voice coil's
  load on them left out, and they are heard with the loudspeaker rather than
  modelled as feeding back into its cone. Their gauge and lengths are not
  documented; these are guesses of the right size.
* **The tam-tam is a flat, linear plate**: no hammered dome, no rim, none of
  the nonlinear coupling that spreads a struck tam-tam's crash (the Gong
  Keyboard has that). Driven gently by a coil it stays near linear. Its
  thickness and where the coil meets it are guesses.
* **The palme's strings** each take the whole bridge signal, and do not
  drive one another or the box.
* **No transposition buttons, quarter tones or the keyboard's wire** (the
  earliest instruments' playing wire); the octave keys do the first.

## Quality

At Medium the engine sounds at most 12 voices at once and at Low 6 (High:
32); past that the oldest lifted one, else the oldest held one, lets go in
4 ms. The Résonance plays four of its seven springs at Medium and two at Low,
and both it and the tam-tam keep their modes up to 3 kHz at Medium and
1.5 kHz at Low (6 kHz at High). The voices themselves, the principal and the
palme sound exactly as at High.

## Prior art and references

### The instrument

* Martenot, M. (1928). *Perfectionnements aux instruments de musique
  électriques.* French patent FR 666 807, filed 2 April 1928, published
  7 October 1929.
  [Google Patents](https://patents.google.com/patent/FR666807A/en). The
  instrument played by a ring on a wire; first shown at the Paris Opéra on
  3 May 1928.
* Loriod, J. (1987). *Technique de l'onde électronique type Martenot.*
  Paris: Alphonse Leduc. The method, which names the timbres O, C, g, G, N,
  8 and S.
* Quartier, L., Meurisse, T., Colmars, J., Frelat, J. & Vaiedelich, S.
  (2015). "Intensity key of the ondes Martenot: an early mechanical haptic
  device." *Acta Acustica united with Acustica* 101(2), 421–428.
  [doi:10.3813/AAA.918837](https://doi.org/10.3813/AAA.918837). The
  force–level measurements the intensity key follows, and the bag's
  graphite and mica.
* The ondes.net research publications (Institut Jean le Rond d'Alembert and
  the Musée de la musique, Paris), among them M. Jossic's report on the
  powder (2011) and a mémoire on the instrument's timbres and diffuseurs
  (the palme's 24 strings from La2, the springs 2 cm across, the tam-tam
  40–75 cm). [ondes.net](https://ondes.net/).

### The physics

* Adler, R. (1946). "A study of locking phenomena in oscillators." *Proc.
  IRE* 34(6), 351–357; reprinted in *Proc. IEEE* 61(10), 1380–1385 (1973),
  [doi:10.1109/PROC.1973.9292](https://doi.org/10.1109/PROC.1973.9292).
  The pulling equation and the beat √(Δ² − K²).
* Leissa, A. W. (1969). *Vibration of Plates.* NASA SP-160. The free
  circular plate's frequency equation and its λ².
* Fletcher, N. H., Tarnopolskaya, T. & de Hoog, F. R. (2001). "Wave
  propagation on helices and hyperhelices: a fractal regression." *Proc. R.
  Soc. Lond. A* 457(2005), 33–43.
  [doi:10.1098/rspa.2000.0654](https://doi.org/10.1098/rspa.2000.0654).
  The curved-rod model whose dispersion relation the springs follow.
* Parker, J. & Bilbao, S. (2009). "Spring reverberation: a physical
  perspective." *Proc. DAFx-09*, Como.
  [PDF](https://www.dafx.de/paper-archive/2009/papers/paper_84.pdf). The
  transition frequency F_C.
* Karplus, K. & Strong, A. (1983). "Digital synthesis of plucked-string and
  drum timbres." *Computer Music Journal* 7(2), 43–55.
  [doi:10.2307/3680062](https://doi.org/10.2307/3680062); Jaffe, D. A. &
  Smith, J. O. (1983). "Extensions of the Karplus–Strong plucked-string
  algorithm." *Computer Music Journal* 7(2), 56–69. The palme's strings.
* Esqueda, F., Välimäki, V. & Bilbao, S. (2016). "Rounding corners with
  BLAMP." *Proc. DAFx-16*, Brno.
  [PDF](https://dafx.de/paper-archive/2016/dafxpapers/18-DAFx-16_paper_33-PN.pdf).
  The polyBLAMP residual for the timbres' corners.

### Earlier models and syntheses

* **Analogue Systems French Connection** (2000s): the ondes' ring, wire,
  keyboard and a pressure button as a controller for modular synthesizers,
  built by Bob Williams for Jonny Greenwood (G. Reid's review,
  [Sound On Sound, February 2002](https://www.soundonsound.com/reviews/analogue-systems-french-connection)).
  Controls only; no sound of its own.
* **Soniccouture Ondes** ([soniccouture.com](https://www.soniccouture.com/en/vintage/g27-ondes/)):
  a Kontakt instrument sampled from Thomas Bloch's ondes, its diffuseurs by
  convolution.
* **XILS-lab Les Diffuseurs** (2024, [rekkerd.org](https://rekkerd.org/xils-lab-releases-les-diffuseurs-effect-plugin-bundle/)):
  effect plugins modelled on the Palme and the Métallique.
