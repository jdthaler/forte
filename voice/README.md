# Singing Voice

A voice built from the body that makes it: the lungs push air up through
two **vocal folds**, which the flow sets flapping, and the buzz they make
travels up a **tube from the throat to the lips**, whose shape makes it a
vowel. Each key is sung by its own singer, whose folds are stretched until
they sound the key's note, and the mod wheel moves every singer's tongue,
jaw and lips from oo through aw, ah and eh to ee. Nothing here is a
recording or a filter bank: the folds are masses on springs pushed by the
air, the tract is 44 short sections of tube in which the sound scatters at
every change of width, and what you hear is the flow leaving the lips. So
you can hear what a sample could not give you: breath that makes a voice
brighter as well as louder, folds held apart into a breathy voice or a
whisper, a narrowed larynx tube gathering the formants into the ring of an
opera voice, and a soprano's high notes that falter until she opens her
jaw.

The history hook is Bell Labs' **Voder** (Homer Dudley, 1939), a keyboard
that spoke at the New York World's Fair: its operators played ten
resonances with their fingers, a wrist bar chose buzz or hiss, and a pedal
set the pitch. The tube here is the one John Kelly and Carol Lochbaum
wrote in 1962, which sang *Daisy Bell* at Bell Labs in 1961.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/voice/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (C2–C6, a bass's low C to a soprano's top C; *Full range* opens A0–C8); a note sings while its key is held |
| `←` `→` | octave |
| `↑` `↓` | the vowel |
| `Space` | hold the keys that are down: the singers sing on |
| MIDI | notes and velocity (how hard the lungs push); aftertouch pushes harder; **mod wheel moves the vowel** (from where the slider is); pitch bend bends every singer's note; sustain pedal = hold |
| MPE | each note bends alone (±48 semitones), **slide moves that singer's own vowel**, and its pressure pushes that singer's lungs |
| Seaboard faders | lung pressure, breathiness, vibrato; the XY pad: larynx tube and vowel |

## The folds

Each fold is Ishizaka and Flanagan's (1972) **two masses on springs**: a
lower mass m₁ = 0.125 g on a spring k₁ = 80 N/m and an upper one
m₂ = 0.025 g on k₂ = 8 N/m, coupled by k_c = 25 N/m, 2.5 and 0.5 mm thick
along the flow and 1.4 cm long. The springs stiffen as they stretch
(k(1 + 100 cm⁻² x²)). Their displacements x₁, x₂ open the glottis
a_i = a₀ + 2 l_g x_i, where a₀ is *Folds apart at rest*. When a mass
crosses the midline it meets a contact spring three times as stiff, and
its damping rises from ζ = 0.1 (lower) and 0.6 (upper) to 1.1 and 1.9: the
tissue squeezed.

The air through the narrowest point a_min = min(a₁, a₂) obeys Bernoulli up
to it and leaves as a jet:

  ρU²/(2a_min²) + Z₁U = P_s − 2p⁻

where P_s is the lung pressure, p⁻ the wave coming back down the tract and
Z₁ = ρc/A₁ the tract's first section. The lower mass feels the pressure
P_s − (P_s − p₁)(a_min/a₁)², the upper one the pressure above the folds
p₁ (Steinecke and Herzel's simplification of Ishizaka and Flanagan's
pressures, 1995). The lower mass is pushed open from below, the upper one
follows a little later, the gap shuts from the bottom: the out-of-step
motion, a wave travelling up the folds, is what feeds them energy each
cycle. The folds and the flow run on a symplectic Euler step at the
tract's rate (twice the sample rate below 80 kHz, then a 47-tap half-band
filter down).

**Tension** stretches the folds: thinner (m/Q) and stiffer (kQ), so every
frequency of theirs goes up by Q. *Folds' thickness* scales the masses and
their depth together: thick folds (chest voice) shut for a good part of
each cycle; thin ones (head voice, falsetto) barely touch.

**Breath noise.** Above a Reynolds number Re = U/(ν l_g) of 1800 the jet
turns turbulent: noise of pressure ∝ Re² − 1800², low-passed at 6 kHz, is
added where the jet enters the tract. Breathy folds that never shut, and a
whisper's folds held too far apart to move at all, are heard through it.

## The singer's ear

Nothing in the folds says which note they will sing: their frequency
depends on the tension, the pressure and the tract above them. So each
singer listens, as people do. A Schmitt trigger on the lower mass's motion
times every cycle, and after each the tension moves toward the note:
Q ← Q · exp(clamp(½ ln(f_target/f_measured), ±0.1)), held between half and
twice its starting value. The tension a key ends on is remembered, so a key
sung again starts nearer its note. The lungs push harder as the folds
stretch (the threshold pressure rises with the pitch: √Q below the
nominal tension, Q above), and a level balance (∝ f^−1.3) keeps low and
high notes even, as a singer would. *Vibrato* swings the target by the
depth set, at the rate set, after a short delay; *Unsteadiness* adds a
slow random flutter, different for each singer.

## The tract and its vowels

The tract is 44 sections of tube from the folds to the lips, each a
**Kelly–Lochbaum** junction: a pressure wave meeting a change of area from
A_k to A_{k+1} reflects r = (A_k − A_{k+1})/(A_k + A_{k+1}) of itself and
passes the rest. A section's walls soak up a little (more in narrow
sections, ∝ 1/√A; *Wall losses*). At the lips the wave meets the radiation
impedance of a piston in a baffle, Flanagan's R = 128ρc/(9π²A) in parallel
with L = 8ρ/(3π²a) (a the mouth's radius), as a one-pole reflection
filter, and the sound is the rate of change of the flow out of the mouth.

The first five sections are the **larynx tube** above the folds
(*Larynx tube*, 1.5 cm² by default). The other 39 take a vowel's
**area function**. Ours are fitted: each vowel's log-area is a cosine
series of eight terms, between 0.25 and 9 cm² (the lips at most 7),
fitted by Levenberg–Marquardt until a 17.5 cm tract's first three
resonances are Peterson and Barney's (1952) averages for 33 men:

| vowel | as in | F1, F2, F3 measured (Hz) | the fitted tract (Hz) |
|---|---|---|---|
| oo /u/ | who'd | 300, 870, 2240 | 300, 870, 2240 |
| aw /ɔ/ | hawed | 570, 840, 2410 | 570, 840, 2410 |
| ah /ɑ/ | hod | 730, 1090, 2440 | 728, 1090, 2437 |
| eh /ɛ/ | head | 530, 1840, 2480 | 521, 1794, 2423 |
| ee /i/ | heed | 270, 2290, 3010 | 269, 2277, 2966 |

(`tools/voice-native-table.mjs` makes the table, `voice-vowels.h`.)
Between two vowels the tract takes the log-areas halfway. *Tract length*
stretches every section: 17.5 cm for men, 14.5 for women, 11 for
children, and every formant scales with its inverse.

**The singer's formant.** Narrow the larynx tube to a sixth of the
throat above it, as trained singers do by lowering the larynx, and it
rings on its own near 3 kHz, gathering the tract's gain there into one
peak (Sundberg 1974): where an orchestra is weak, so an opera voice
carries over it.

**Formant tuning.** The tract pushes back on the folds. Below its first
resonance F1 its input is inertive, like a mass, and helps them; above F1
it is compliant and fights them, so a note sung above the vowel's F1 can
falter or crack (Titze 2008). Sopranos open the jaw and spread the lips to
raise F1 just above the note (Joliveau, Smith and Wolfe 2004). With
*Formant tuning* on, each singer singing above three quarters of the
vowel's F1 opens the jaw by the least amount J that leaves the tract's
input reactance at the note at least ρc/A₁ (inertive), mixing the
vowel's log-area toward a horn that widens from 1 cm² at the throat to
9 cm² at the lips; if a note still finds no steady cycle after a moment, it
tries a little wider. The vowel drifts toward ah, as a soprano's does.

## What to listen for

The demos in `examples/voice/`:

- **Daisy Bell** (01, and 09 as straight and plain as in 1961), each
  syllable's vowel moved by the mod wheel.
- **The vowels** (02): one low A while the tract moves from ah to oo to ee;
  the pitch never moves, the bands where the harmonics are loud do.
- **A chord** (03): four singers, each with their own flutter.
- **Breath** (04): 4, 9, then 22 cm of water: louder and brighter.
- **Breathy, whisper, pressed** (05).
- **The singer's formant** (06): the larynx tube usual, then narrowed: a
  ring near 3 kHz.
- **A soprano's high ee** (07): C5 to A5 with the jaw kept shut, faint and
  unsteady; then with formant tuning, open and full.
- **Bass to child** (08): the same phrase on shorter and shorter tracts.

On the page, *Vocal folds* shows the folds slowed down (a stroboscope of
the last cycle) and the flow; *Vocal tract* the tube's profile and its
transfer function with the formants; *Vowel chart* the F1–F2 plane with
Peterson and Barney's vowels and where each singer is.

## Files

```
voice/index.html, style.css                  page
voice/src/voice-params.js                    parameters and presets
voice/src/voice-instrument.js                the descriptor: everything but the page
voice/src/voice-main.js                      page wiring and views
voice/src/voice-tour.js                      the guided tour (and Daisy Bell's notes)
voice/src/voice-wasm.js, voice/wasm/voice.wasm   the engine and model, built from the C++
native/instruments/voice/                    the physics in C++: model, vowels, engine (plugins and WebAssembly)
test/voice-tests.mjs                         node test/voice-tests.mjs
tools/voice-native-table.mjs                 fits the vowels → native/instruments/voice/voice-vowels.h
tools/render-voice.mjs                       node tools/render-voice.mjs → examples/voice/
```

## Simplifications

* **No nose and no lungs' tube.** The tract has no nasal branch (so no
  nasal vowels or hum) and the folds are fed by a steady pressure, with no
  subglottal tract below them to resonate.
* **Fitted, not measured, tracts.** The area functions are shapes that ring
  at Peterson and Barney's formants, not MRI measurements of a singer;
  many shapes give the same three formants, and ours are smooth ones. The
  women's and children's voices are the men's tracts shortened.
* **Vowels only.** No consonants: the tract never closes, and there is no
  tongue tip, teeth or lip closure to make them.
* **Symmetric folds,** one pair of two masses each (no body-cover layers,
  no left–right asymmetry), with the contact and damping of Ishizaka and
  Flanagan.
* **The singer's ear and jaw are rules,** not a model of the brain: a
  pitch controller on the measured cycle, and a jaw chosen from the tract's
  input reactance. High oo and ee near C6, and ah within a few semitones
  of a short tract's highest F1 (around A5), can still waver.
* **The level balance** (∝ f^−1.3) is a voicer's choice, so that a scale
  sounds even.

## Quality

At most 16 singers sound at once at High, 8 at Medium and 6 at Low; past
that the oldest lets go, released ones first. Each singer is computed in
full at every level.

## Prior art and references

### The history

* Dudley, H., Riesz, R. R. and Watkins, S. S. A. (1939). A synthetic
  speaker. *Journal of the Franklin Institute* 227(6), 739–764,
  [doi:10.1016/S0016-0032(39)90816-1](https://doi.org/10.1016/S0016-0032(39)90816-1): the Voder.
* Kelly, J. L. and Lochbaum, C. C. (1962). Speech synthesis. *Proceedings
  of the Fourth International Congress on Acoustics*, Copenhagen, paper
  G42: the tube of sections. Their synthesis sang *Daisy Bell* at Bell
  Labs in 1961, with Max Mathews's accompaniment.

### The physics

* Ishizaka, K. and Flanagan, J. L. (1972). Synthesis of voiced sounds from
  a two-mass model of the vocal cords. *Bell System Technical Journal*
  51(6), 1233–1268, [doi:10.1002/j.1538-7305.1972.tb02651.x](https://doi.org/10.1002/j.1538-7305.1972.tb02651.x):
  the folds and their constants.
* Steinecke, I. and Herzel, H. (1995). Bifurcations in an asymmetric
  vocal-fold model. *Journal of the Acoustical Society of America* 97(3),
  1874–1884, [doi:10.1121/1.412061](https://doi.org/10.1121/1.412061): the simplified pressures on the masses.
* Flanagan, J. L. (1972). *Speech Analysis, Synthesis and Perception*, 2nd
  ed., Springer: the radiation impedance and the tract's losses.
* Peterson, G. E. and Barney, H. L. (1952). Control methods used in a
  study of the vowels. *Journal of the Acoustical Society of America*
  24(2), 175–184, [doi:10.1121/1.1906875](https://doi.org/10.1121/1.1906875): the formants the vowels are fitted to.
* Sundberg, J. (1974). Articulatory interpretation of the "singing
  formant". *Journal of the Acoustical Society of America* 55(4), 838–844,
  [doi:10.1121/1.1914609](https://doi.org/10.1121/1.1914609).
* Joliveau, E., Smith, J. and Wolfe, J. (2004). Tuning of vocal tract
  resonance by sopranos. *Nature* 427, 116, [doi:10.1038/427116a](https://doi.org/10.1038/427116a).
* Titze, I. R. (2008). Nonlinear source–filter coupling in phonation:
  theory. *Journal of the Acoustical Society of America* 123(5),
  2733–2749, [doi:10.1121/1.2832337](https://doi.org/10.1121/1.2832337): why a tract above the note fights the folds.

### Earlier models and syntheses

The two-mass folds into a Kelly–Lochbaum tract are a textbook articulatory
synthesizer, and many have been built. Perry Cook's SPASM and SINGER
(Stanford, around 1990) sang through a waveguide tract; Peter Birkholz's
VocalTractLab models a full three-dimensional tract and folds; Neil
Thapen's [Pink Trombone](https://dood.al/pinktrombone/) (2017) puts a Kelly–Lochbaum tract of 44 sections, as ours, in the browser
to play with the mouse. What is ours: the vowels fitted to Peterson and
Barney, the singer's ear that tunes the folds' tension to a keyboard, the
jaw opening chosen from the tract's input reactance, and playing it as a
keyboard of many singers.
