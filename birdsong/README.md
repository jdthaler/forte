# Birdsong

A songbird sings with its syrinx, the organ where its windpipe forks into the
two bronchi. Air pushed from the air sacs flows between two folds of tissue,
the labia, and sets them swinging, as a trumpeter's lips buzz in the
mouthpiece; each swing opens and closes the airway and so chops the airflow
into sound, which the trachea and the mouth then filter on its way out of the
beak. Gabriel Mindlin's group in Buenos Aires showed that the labia's motion
reduces to one nonlinear oscillator with two knobs, the air sac pressure and
the labial tension, and that driving those two knobs along simple paths
rebuilds the songs of canaries and zebra finches closely enough that the
birds' own brains answer to the synthetic songs. Here every key is a bird
with that oscillator for a syrinx, tuned by the natural rate of its labia, so
you can hear the two ways a bird starts a note (a pure tone growing from
nothing, or a buzz born at zero frequency), the pitch climbing with the
breath, trills of mini-breaths, sweeps of tension, and a mouth that the bird
keeps tuned to its note.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/birdsong/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | breathe into a bird (88 keys, A0–C8); it sings while its key is held |
| `←` `→` | octave |
| `↑` `↓` | the syllable rate |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity (**how hard the breath**); **aftertouch breathes harder** (and so sharpens the note, as a real bird's pressure does); **mod wheel = the syllable rate**, up from its setting; **pitch bend retunes the labia** (±2 semitones); sustain pedal = hold |
| MPE | each note bends on its own, up to two octaves either way, its pressure is its own breath, and CC74 sets its own syllable rate |

Real songbirds sing from about 1 to 8 kHz, which on this keyboard is the top
two octaves and beyond; lower down, each key is the same bird with slower
labia, singing as no songbird can (its trachea and mouth stay a songbird's
unless you change them).

## The labia: one oscillator, two knobs

Laje, Gardner and Mindlin (2002) modelled the midpoint of a labium as a mass
on a spring, driven by the pressure of the air squeezing between the labia
and damped more strongly as they swing wider (they collide). Its two
essential parameters are the air sac pressure and the tension the syringeal
muscles put on the labia. Near where it starts to oscillate, such a system
takes a universal form, its **normal form** (Gardner et al. 2001; Sitt et
al. 2010; Amador et al. 2013), in time τ = γt:

    dx/dτ = v
    dv/dτ = α + βx + x² − x³ − xv − x²v

where x is the labia's opening about their midpoint and v their speed. α
stands for the air sac pressure (it is negative, past the onset, when the
bird sings) and β for minus the labial tension. γ is the labia's natural
rate: a stiffer, lighter labium swings faster, and γ scales the whole motion
in time without changing its shape. Each key sets γ so that the swing the
labia settle into (the **limit cycle**) is the key's note:

    f = γ Ω(α, β) / 2π

where Ω, the cycle's angular frequency in τ, is found by integrating the
normal form until its period settles (to 10⁻⁹, or by the Aitken limit of a
geometric run near the Hopf line, where it settles slowly). At the defaults
Ω ≈ 0.78, so A4 needs γ ≈ 3,500 s⁻¹ and the top C ≈ 34,000 s⁻¹; Amador's
zebra finch fits used γ = 24,000 s⁻¹. The engine integrates the normal form
with classical Runge–Kutta steps of at most 0.1 in τ (about sixty a cycle,
several a sample for the top notes) at twice the sample rate.

### Two ways to start

The labia rest at a fixed point of the equations, a root of
g(x) = α + βx + x² − x³, while the pressure is low (α = 0.1 here). Raising the
pressure (lowering α) loses that rest in one of two ways, and which one sets
the sound:

* **Hopf bifurcation** (tension above ¼): the rest point becomes unstable at
  α = 0, and a swing grows from nothing around it at a finite frequency,
  √(tension) in τ. Just past the onset it is small and nearly a sine, its
  size ∝ √(α's distance past the line). A pure, whistled tone: the canary's.
* **Saddle-node bifurcation** (tension below ¼): the rest point meets a
  saddle and both vanish, at

      α = x² − 2x³,  x = (2 + √(4 + 12β)) / 6

  (where g = g′ = 0). Near zero tension and below, this happens on the limit
  cycle itself (a **SNILC**, saddle-node on an invariant circle): the swing
  starts at full size and at **zero frequency**, the labia crawling past the
  ghost of the lost fixed points and snapping round once a period. Just past
  the onset the period goes as 1/√(distance), so a breath that rises through
  it is heard as a few slow clicks running up into the note, and the swing
  is a pulse, rich in harmonics, which fills out into a rounder tone as the
  pressure rises. Sitt et al. (2008) found exactly this in zebra finches:
  their low, buzzy syllables have more harmonics the lower their pitch, as a
  SNILC predicts and a Hopf onset does not.

At tension ¼ the two lines cross. They belong to different rest points there
(the Hopf's at x = 0, the saddle-node's at x = ½); the point where one rest
point loses its stability both ways at once, a Takens–Bogdanov point, is at
zero tension.
The view *Pressure and tension* draws the onset line, Hopf solid and
saddle-node dashed, with the note's breath moving across it.

### The breath

A key raises the air sac pressure from rest past the onset by the
**drive**: the full drive at the hardest velocity, a quarter of it at the
softest, with aftertouch adding up to half as much again. The pressure rises
with the *Breath in* time (a hard key in half of it, a soft one in one and a
half) and falls with *Breath out* when the key is let go; below the onset the
labia stop within a few swings. The swing grows wider and faster with the
pressure, so the pitch climbs with it, as in real birds; each key is tuned at
the pressure its velocity gives, so soft and hard notes land on the same
pitch, but aftertouch sharpens a held note, and a slow breath slides up into
it. The airflow through the labia, and so the sound, is taken ∝ √(drive), as
a flow through an opening goes with the square root of the pressure across
it. **Turbulence** adds random fluctuations to α, which seed every onset and
make the swing wander near the onset.

### Syllables

A canary repeats one syllable many times in a phrase, at up to about 30 a
second, faster than it can breathe in and out, so between syllables it
takes a quick **mini-breath** (Hartley and Suthers 1989). Gardner et al.
(2001) showed that each kind of canary syllable comes from a simple
periodic path of pressure and tension through the normal form's plane. While
a key is held, the bird repeats its syllable at the syllable rate:

* **Whistle**: the breath and the tension held, one long note.
* **Trill**: the breath on for *Sound in each syllable* of each period, with
  smooth rises and falls (a fifth of the sound each), and a silent
  mini-breath between: each syllable a fresh onset.
* **Upsweeps** and **Downsweeps**: the trill's breath, with the tension
  sliding through each syllable by ± *Tension sweep* (of the tension, or of ¼
  if that is more), so the pitch glides, roughly as √(tension).
* **Warble**: one breath, the tension rocking sinusoidally.

The drive is kept past the onset as the tension moves, so a sweep that
crosses ¼ changes the onset's kind mid-phrase (the preset *Sweeps across the
bifurcation*). The note is tuned at the gesture's centre.

## The vocal tract

The labia modulate the airflow, and the sound they make enters the trachea.
Following Amador et al. (2013), the pressure at the trachea's base is the
airflow A x(t) (the flow, set by the breath, times the opening) less what
the trachea's top reflects back down:

    Pᵢ(t) = A x(t) − r Pᵢ(t − T),   T = 2L/c

and what leaves the top is (1 − r) Pᵢ(t − T/2). That makes a tube closed at
the syrinx and open at the glottis, resonant at c/4L and its odd multiples:
2.45 kHz and 7.35 kHz for Amador's 3.5 cm trachea (c = 343 m/s). It runs as a
delay line, read with linear interpolation.

Then the **oropharyngeal–oesophageal cavity** (OEC), the space of the throat
and upper oesophagus, which songbirds expand and contract while they sing.
It is a Helmholtz resonator radiating from the beak, here a band-pass
resonance of unit gain at its peak, quality Q:

    H(f) = (f/f₀Q) / √((1 − f²/f₀²)² + (f/f₀Q)²)

Riede et al. (2006) filmed northern cardinals singing under X-rays and
found that they keep this cavity's resonance on the fundamental of the note
they sing, so that it passes the fundamental and holds back the harmonics:
that is why so much birdsong is a pure whistle, though the labia's swing is
not a sine. **Mouth tuned to the note** (on at first) does this: the
resonance follows the frequency the labia are singing at, measured between
their swings, within 4 ms. Off, it stays at *Mouth resonance (fixed)*, about
4 kHz in Amador's zebra finch, and picks out whichever harmonics fall near
it.

**Voicing.** Each key is voiced so that the same swing leaves the beak
equally loud: its level is divided by the tract's power gain on that note's
harmonics (the limit cycle's Fourier series, 96 harmonics, through the
trachea and the mouth), up to 40 dB. So the trachea and mouth colour the
sound without making the keys far from their resonances near-silent; with a
fixed mouth the lowest keys still fall quiet, as their harmonics run out
before reaching it.

## What to listen for

* **Hopf against saddle-node.** At the defaults (tension 0.5) a note grows out
  of silence as a pure whistle. The preset *Zebra finch* (tension 0) starts
  each note with a click or two that runs up into a buzz full of harmonics;
  play softly to hear more clicks, harder for a rounder tone. Sweep the
  tension (a Seaboard's pad X) across ¼ while holding a note.
* **Pitch from breath.** With a long *Breath in*, a note slides up into its
  pitch. Aftertouch sharpens a held note; raising the air sac pressure retunes
  every key to keep the pitch, but changes the tone.
* **Trills and sweeps.** *Canary trill* repeats a syllable with a mini-breath
  between each; *Fast trill* at 25 a second is a canary's "tour". The mod
  wheel speeds any of them up. Upsweeps, downsweeps and the warble glide the
  pitch as the tension moves.
* **The mouth.** Play a zebra finch, then turn on *Mouth tuned to the note*:
  the same labia come out as a whistle. With a fixed mouth, play up the
  keyboard and hear different harmonics light up under the 4 kHz resonance,
  and the trachea's resonance at c/4L (a *Long trachea* puts it at 715 Hz).
* **Turbulence.** *Turbulent, near onset* breathes just past the onset with
  noisy flow: the swing wanders and rasps.

## Files

```
birdsong/index.html, style.css               page
birdsong/src/birdsong-params.js              parameters and presets
birdsong/src/birdsong-instrument.js          the descriptor: everything but the page
birdsong/src/birdsong-main.js                page wiring and views
birdsong/src/birdsong-tour.js                the guided tour
birdsong/src/birdsong-wasm.js, birdsong/wasm/birdsong.wasm   the engine and model, built from the C++
native/instruments/birdsong/                 the physics in C++: model and engine (plugins and WebAssembly)
test/birdsong-tests.mjs                      node test/birdsong-tests.mjs
tools/render-birdsong.mjs                    node tools/render-birdsong.mjs → examples/birdsong/
```

## Simplifications

* **One side of the syrinx.** A songbird has two, one in each bronchus, each
  with its own labia and muscles, and many birds sing two notes at once or
  hand a phrase from one side to the other (Greenewalt 1968; Suthers 1990).
  Here each key is one side; two keys make two birds, not one bird's two
  voices.
* **The normal form, not the full labial model.** It keeps the dynamics near
  the onsets (the bifurcations and the shapes of the swings), as Mindlin's
  synthesizers do, but its α and β are dimensionless stand-ins for the
  pressure and tension, not pascals and newtons, and γ is set per key rather
  than by the muscles.
* **Tuned by γ.** The keyboard and the pitch bend scale the labia's natural
  rate; in a bird the ventral syringeal muscle raises the pitch through the
  tension, which also changes β. The tension knob here changes the onset and
  the tone, and every key is retuned to keep its pitch.
* **The sound does not act back on the labia.** The trachea's pressure at
  the syrinx does not push the labia (the source and filter are separate, as
  in Sitt et al. 2008); in real birds that coupling can lock the labia to a
  tract resonance.
* **The trachea's top reflects with a constant r**, with no losses that grow
  with frequency; the OEC is one band-pass resonance, and the beak (whose
  gape birds also move with the pitch) is folded into it.
* **The gestures are fixed shapes** at a steady rate, the same for every
  syllable, where a canary's phrase changes syllable type, and a zebra
  finch's motif is a sequence of different ones.
* **Mono**: one bird, one point, before the room.

## Quality

At Medium the engine sings at most 12 birds at once and at Low 6 (High: 24);
past that the oldest released one, else the oldest held one, breathes out in
6 ms. The labia's Runge–Kutta steps may also be longer, up to 0.2 in τ at
Medium and 0.3 at Low (High: 0.1), so the high notes take fewer steps a
sample; the pitch moves by less than half a cent and the level not at all.

## Prior art and references

### The bird

* Greenewalt, C. H. (1968). *Bird Song: Acoustics and Physiology*.
  Washington, DC: Smithsonian Institution Press. The two sides of the
  syrinx as two independent voices.
* Hartley, R. S. & Suthers, R. A. (1989). "Airflow and pressure during canary
  song: direct evidence for mini-breaths." *J. Comp. Physiol. A* 165, 15–26.
  [doi:10.1007/BF00613795](https://doi.org/10.1007/BF00613795)
* Suthers, R. A. (1990). "Contributions to birdsong from the left and right
  sides of the intact syrinx." *Nature* 347, 473–477.
  [doi:10.1038/347473a0](https://doi.org/10.1038/347473a0)
* Goller, F. & Larsen, O. N. (1997). "A new mechanism of sound generation in
  songbirds." *PNAS* 94, 14787–14791.
  [doi:10.1073/pnas.94.26.14787](https://doi.org/10.1073/pnas.94.26.14787).
  The labia, not the membranes once thought, are the sound source.
* Riede, T., Suthers, R. A., Fletcher, N. H. & Blevins, W. E. (2006).
  "Songbirds tune their vocal tract to the fundamental frequency of their
  song." *PNAS* 103, 5543–5548.
  [doi:10.1073/pnas.0601262103](https://doi.org/10.1073/pnas.0601262103)

### The physics

* Gardner, T., Cecchi, G., Magnasco, M., Laje, R. & Mindlin, G. B. (2001).
  "Simple motor gestures for birdsongs." *Phys. Rev. Lett.* 87, 208101.
  [doi:10.1103/PhysRevLett.87.208101](https://doi.org/10.1103/PhysRevLett.87.208101).
  Canary syllables from simple paths of pressure and tension.
* Laje, R., Gardner, T. J. & Mindlin, G. B. (2002). "Neuromuscular control of
  vocalizations in birdsong: a model." *Phys. Rev. E* 65, 051921.
  [doi:10.1103/PhysRevE.65.051921](https://doi.org/10.1103/PhysRevE.65.051921)
* Mindlin, G. B. & Laje, R. (2005). *The Physics of Birdsong*. Berlin:
  Springer. [doi:10.1007/3-540-28249-1](https://doi.org/10.1007/3-540-28249-1)
* Sitt, J. D., Amador, A., Goller, F. & Mindlin, G. B. (2008). "Dynamical
  origin of spectrally rich vocalizations in birdsong." *Phys. Rev. E* 78,
  011905. [doi:10.1103/PhysRevE.78.011905](https://doi.org/10.1103/PhysRevE.78.011905).
  The saddle-node on the cycle, and zebra finches' harmonics.
* Sitt, J. D., Arneodo, E. M., Goller, F. & Mindlin, G. B. (2010).
  "Physiologically driven avian vocal synthesizer." *Phys. Rev. E* 81,
  031927. [doi:10.1103/PhysRevE.81.031927](https://doi.org/10.1103/PhysRevE.81.031927).
  The normal form, from air sac pressure and syringeal muscle activity.
* Amador, A., Sanz Perl, Y., Mindlin, G. B. & Margoliash, D. (2013).
  "Elemental gesture dynamics are encoded by song premotor cortical
  neurons." *Nature* 495, 59–64.
  [doi:10.1038/nature11967](https://doi.org/10.1038/nature11967). The normal
  form with γ, the trachea's delay line and the OEC; zebra finches' song
  neurons answer the synthetic song as their own.

### Earlier models and syntheses

* Fletcher, N. H. (1988). ["Bird song — a quantitative acoustic model."](https://newt.phys.unsw.edu.au/music/people/publications/Fletcher1988.pdf)
  *J. Theor. Biol.* 135, 455–481. The syrinx as a pressure-controlled valve
  feeding the tract.
* Kahrs, M. & Avanzini, F. (2001). ["Computer synthesis of bird songs and
  calls"](https://dafx.de/paper-archive/details/6mLKWqV8wyzd3nl1cdk8gQ).
  *DAFx-01*, Limerick. A physical model of the syrinx's membranes and tract.
* Smyth, T. & Smith, J. O. (2002). ["The sounds of the avian syrinx — are
  they really flute-like?"](https://dafx.de/paper-archive/details/MEGN49ijRePa-QxfWtm5TA)
  *DAFx-02*, Hamburg. A waveguide model of the syrinx and trachea.
* Mindlin's laboratory (Universidad de Buenos Aires) has used its
  synthesizer to play synthetic songs back to birds, awake and asleep (Amador
  et al. 2013, above).
