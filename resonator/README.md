# Magnetic Resonator Piano

Andrew McPherson's Magnetic Resonator Piano (first played in 2009): an
ordinary grand piano with an electromagnet hung over the strings of every
note. A single pickup on the soundboard hears all the strings at once; for
each note that is played, the computer filters out that note's partial, locks
an oscillator to it with a phase-locked loop, and sends a current in step with
the string's own motion back through the coil, which pulls on the steel. The
strings are never touched, and nothing comes out of a loudspeaker: the sound
is the piano's own strings and soundboard. A note can grow out of silence and
hold for as long as the key is down, swell and fade under the fingers, or sing
one harmonic with no fundamental.

Here the strings are a concert grand's (the Ribbon Piano's scale: lengths,
gauges and copper winding), each partial integrated exactly, the unisons of a
key coupled through a shared bridge; the coil pulls as the square of its
current over the square of the gap; and the pickup, the band-pass, the loop,
the amplifier and the coil's inductance run sample by sample, a block late, as
on the real instrument. You can hear what a sample cannot give you: a bass
note that takes seconds to swell while a treble one speaks in a fraction of
one, the loop wandering for a moment before it locks, a harmonic that will not
speak because its node sits under the coil, a phase that pushes the string
against itself, an open loop that misses the stretched partials and beats
against the unisons, and a string slapping a coil set too close.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/resonator/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play: each held key lifts its dampers and drives its strings (all 88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | drive (coil current) |
| `Space` | sustain pedal: every damper up, so released notes ring on undriven |
| MIDI | notes and velocity (current, and the hammer's speed when the hammers play); **aftertouch pushes more current**; **mod wheel = brightness**; sustain pedal; MPE: each note's own pressure and brightness (CC74), no bend |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch |

## The physics

### The strings

Every key has one string (A0–G1), two (G♯1–C♯3) or three, of the Ribbon
Piano's smoothed concert-grand scale: speaking length L, a steel core of
diameter d, copper winding below the tenor, and tension T set so that the
stiff string's first partial is the key's note. A pinned stiff string's
partials and mass-normalised shapes are

  f_n = n f₀ √(1 + B n²),   f₀ = √(T/μ) / 2L,   B = π³ E d⁴ / (64 T L²),   ψ_n(x) = √(2/μL) sin(nπx/L)

with B from about 10⁻⁴ in the tenor to 10⁻² high in the treble, as measured
on real grands (Fletcher 1964), so the 8th partial of middle C is several
cents sharp of the 8th harmonic. A key's unisons are detuned a little apart
(**Unison detune**).

Each partial is a two-pole resonator integrated exactly. The wire's own
losses are σ₀ = 0.1 + 2.5 × 10⁻⁹ ω² s⁻¹ (air, then internal friction rising
with frequency). The strings end on the bridge, a resistance of mobility G:
3 × 10⁻⁴ s/kg from C4 up, half that at the bass bridge. A string alone loses
its energy there at

  σ_b = G T / L

whatever the partial, and every partial pushes the bridge through
β_n = √G · T ψ′_n(L) / ω_n (β² = 2σ_b for a flexible string). The strings of
a key share the bridge: each partial feels −β_n S, with S = Σ β q̇ over all
the key's partials, and the bridge's velocity √G·S is the sound. So a key's
unisons couple (Weinreich 1977): moving together they lose to the bridge two
or three times as fast as one alone, and the slow, nearly silent motion
against each other is the aftersound.

The felt hammer, when it plays, is the Ribbon Piano's (Chaigne and
Askenfelt's masses and stiffnesses, F = K δᵖ), striking an eighth of the way
along, solved implicitly with the strings' compliance under it. The dampers
sit on the strings while the key is up (T60 0.28 s), except the top 20 keys,
which have none.

### The coil

The second MRP's coils are 21 mm across (McPherson 2012), wide enough to
cover all a note's strings, and hang over them a fifth of the length from the
front in the bass, a quarter at middle C and a third from C5 up (McPherson
2010). A coil pulls on the steel string, F ∝ i² / g²: attraction only, as hard
whichever way the current flows (McPherson 2012). So a sine of current alone
would pull at twice its frequency; the amplifier adds a bias I_off to the
signal and never lets the current go below zero,

  i = I (b + s(t)) clipped to [0, 2.5 A],   F = κ i² / (g − u)²

where s is the drive waveform, b the **Bias current** (the MRP's is slightly
more than the signal, b ≈ 1.1), u the string's swing toward the coil and g
the gap (**Gap to the string**: 1.6 mm, 1/16 in, in the treble, widening to
1.8 times that in the bass, where the strings swing further, as McPherson
did). Expanding the square, the pull has a steady part, a part in step with
the signal, 2 b s, and a part at twice its frequency, s²: with the bias near
the signal's peak the octave is strong, with a large bias the pull is clean.
The current follows through the coil and amplifier's corner at 3 kHz.

The pull on partial n is the string's shape under the coil averaged over its
width,

  f_n = F ψ_n(x_a) · sinc(nπw/2L)

so a partial with a node under the coil cannot be driven: the 5th at C2 and
C3, the 4th at C4, the 3rd from C5 (McPherson 2010 names exactly these).
**Coil position** moves the coil along the string, as a multiple of where the
MRP's sits.

A struck string's partials carry very different energies for the same
displacement across the keyboard, so left alone the treble would swell 20 dB
louder than the bass under the same current. Each note's current is voiced
(measured at the defaults, as a technician voices a piano's hammers) so the
notes sound alike; since the pull goes as the current squared, half the
level's difference in dB.

### The loop

McPherson's MRP hears every string through one piezo pickup on the soundboard
(magnetic pickups would hear the coils). Here the pickup is the sum of every
key's bridge signal, and it reaches the loops one 128-sample block later
(2.7 ms at 48 kHz: the computer's buffering, his "several milliseconds"). For
each driven note:

1. a second-order band-pass at the partial it drives, Q = 50 (McPherson's,
   which lets the neighbouring semitone through only 15 dB down);
2. a phase-locked loop: the band-passed signal times the cosine of the
   oscillator's phase, over its amplitude, filtered of its ripple at twice the
   partial, drives a proportional-integral loop filter (natural frequency
   f/40, 0.5–6 Hz, damping 0.8; lock range ±50 ¢) that pulls the oscillator's
   frequency onto the string's (Best);
3. a second oscillator, ahead of the first by the calibrated phase, is the
   drive. McPherson calibrated it by ear, note by note, for the loudest tone;
   here it is worked out: the delays from the push to the loop (the block,
   half a sample in the velocity, a sample in the push, the coil's corner) and
   the sign of the partial's shape under the coil and at the bridge, made up
   so that the push is in step with the string's velocity. **Phase error**
   turns it away from there: at ±90° the coil mostly pulls the pitch, and at
   180° it pushes against the string, so nothing grows;
4. two more band-passes, a semitone either side: when one of them is louder
   than the note's own, the loop's gain falls to zero and the oscillator holds
   its pitch (McPherson's dynamic loop gain, **Interference guard**), so a loud
   neighbour cannot pull the loop onto its string.

The **Drive waveform** is the second oscillator's: a sine, or a wave with
harmonics falling as 1/n^(2 − 1.6 × brightness), every one or the odd ones,
each put at the string's own partial rather than an exact multiple (the MRP's
"stretched" harmonics), with the power of a sine of the same peak; or noise
in the band of the note's first partials, with no loop at all. **Harmonic**
drives one partial alone (the band-pass and oscillator on it), or two or
three at once with a loop each (McPherson's second strategy, for
multiphonics). **Feedback: open loop** drives the coil at the keyboard's pitch
times the harmonic's number instead, with no loop: the stretched partials and
detuned unisons are missed, and beat.

A note's current is **Drive** × its voicing × (0.25 + 0.75 velocity) ×
(1 + aftertouch), rising over the **Swell time** and falling in 40 ms when
the key lets go. On top of that the string swells at its own pace: with the
drive steady, a partial grows as 1 − e^(−σt), σ its loss rate with its
unisons, so the bass, whose strings lose least, takes seconds (McPherson: C2
"has not reached full amplitude after 5 s") and the treble a fraction of one.

The MRP's audio interface gave it fifteen channels: here too at most fifteen
notes are driven at once, and the sixteenth takes the oldest one's channel,
whose string then rings on by itself while its key is held.

## What to listen for

* **Out of silence.** With the hammers off (the default), a key only lifts
  its dampers and starts its coil: the note grows from nothing. Low notes take
  seconds; hold them.
* **The lock.** The oscillator starts at the partial's pitch, and the loop
  pulls it onto the strings' as they begin to move: the Swell and lock view's
  green trace settles in a fraction of a second.
* **Harmonics.** *Octave harmonic* and *Twelfth, no fundamental* play a
  partial alone; *Two partials locked* holds two. Try the 5th harmonic below
  middle C, or *4th harmonic on its node (C4)*: the coil sits on that
  partial's node and it barely speaks, while the keys either side of middle C
  find it.
* **Struck, then sustained.** The hammer gives the attack and the coil keeps
  the note from decaying, as the MRP's own keyboard does.
* **Brightness and bias.** The mod wheel adds the drive's upper harmonics;
  each sits on the string's own (sharp) partial. A low bias clips the
  current's troughs and the pull doubles in frequency: the octave grows.
* **Phase.** Turn **Phase error** while holding a note: ±90° weakens it and
  bends it a little, 180° lets it die.
* **Open loop, beating.** Driven at the keyboard's pitch, the detuned unisons
  beat and the stretched partials are missed.
* **Too close.** At 0.55 mm a loud note swings far enough to slap the coil:
  the pull grows as it nears (the gap's 1/g²) and the string buzzes on the
  coil's face.
* **Fifteen channels.** Hold sixteen keys and the first goes quiet, its
  string ringing on undriven.

## Files

```
resonator/index.html, style.css          page
resonator/src/resonator-instrument.js    the descriptor: parameters, keys, pedal, wheel, engine
resonator/src/resonator-params.js        parameters and presets
resonator/src/resonator-main.js          page wiring and views
resonator/src/resonator-wasm.js          the C++ engine and model as WebAssembly (resonator/wasm/resonator.wasm)
native/instruments/resonator/            the physics in C++: strings, coil and voicing (resonator-model),
                                         the engine (pickup, loops, amplifier, hammer, strings), generated tables, reference
test/resonator-tests.mjs                 node test/resonator-tests.mjs  (16 tests, on the WebAssembly)
tools/render-resonator.mjs               node tools/render-resonator.mjs → examples/resonator/
```

The same C++ runs as WebAssembly on the page and as plugins (CLAP, VST3, AU
and the Forte app), where CC64 is the sustain pedal, the mod wheel the
brightness and aftertouch more current. Ten notes, struck and driven, take
about a fifth of a core.

## Simplifications

* **The bridge is a resistance.** The real soundboard's mobility has
  resonances, and is lower and partly reactive in the bass; here it is one
  real number, halved at the bass bridge, and the soundboard's colour comes
  from the page's soundboard response afterwards.
* **One polarisation, no longitudinal waves.** The strings move only toward
  and away from the coil; the Ribbon Piano's second polarisation, torsion and
  longitudinal modes are left out, and the strings of different keys do not
  ring along with each other.
* **The coil's pull is a closed form.** F ∝ i²/g² ignores the core's
  saturation and the field's spread past the coil's face; its strength
  (0.05 N at 1 A across 1.6 mm, shared by the note's strings) is set so a
  driven middle C is about as loud as a struck one, as McPherson reports, not
  measured.
* **The voicing is ours.** McPherson set each note's level in software; the
  table of currents here is chosen so the notes sound alike at the defaults.
* **The calibration is exact.** The real MRP's phase was tuned by ear and
  held for the fundamental; here it is computed for each partial a loop
  drives, and **Phase error** adds a mistake on purpose.
* **The keyboard is ordinary.** The MRP's later versions read each key's
  position continuously (a modified Moog Piano Bar, later McPherson's TouchKeys
  and optical sensors), for swells on a partly pressed key, vibrato and
  pitch. Here a key's velocity and aftertouch, and MPE's pressure and CC74,
  stand in for those.

## Quality

* **High** plays every partial under 8 kHz (up to 32) of every string.
* **Medium** plays 16 partials of each string, under 5 kHz.
* **Low** plays 8 partials, under 3 kHz, of at most two strings a key (each
  keeps the pull and level its share gave), and lets go of the quietest string
  no key or coil holds past 20 at once (40 at Medium).

The loops, the pickup and the coils are the same at every level.

## Prior art and references

### The instrument

* A. McPherson, "The Magnetic Resonator Piano: Electronic Augmentation of an
  Acoustic Grand Piano", *Journal of New Music Research* **39**(3), 189–202
  (2010), [doi:10.1080/09298211003695587](https://doi.org/10.1080/09298211003695587).
  The instrument: the coils and where they sit, the gaps, the piezo pickup,
  the band-pass (Q 50), the phase-locked loop and its calibration, the dynamic
  loop gain, the nodes, the 15 channels, the rise times.
* A. McPherson and Y. Kim, "Augmenting the Acoustic Piano with Electromagnetic
  String Actuation and Continuous Key Position Sensing", *Proceedings of NIME
  2010*, Sydney, 217–222,
  [nime.org](https://www.nime.org/proceedings/2010/nime2010_217.pdf).
* A. McPherson, "Techniques and Circuits for Electromagnetic Instrument
  Actuation", *Proceedings of NIME 2012*, Ann Arbor, 131–136,
  [nime.org](https://nime.org/proceedings/2012/nime2012_117.pdf). The second
  MRP: the i² pull, the single-ended bias, the coils (0.82 in, 19 mH), the
  amplifiers' 3 kHz corner.
* A. McPherson, *Secrets of Antikythera* (Innova 842, 2013): McPherson's
  music for the instrument.

### Before it

* G. S. Heet, "String instrument vibration initiator and sustainer", US patent
  4,075,921 (1978): the EBow, an electromagnet in a feedback loop with a pickup
  that sustains a guitar string.
* E. Berdahl, S. Backer and J. O. Smith III, "If I Had a Hammer: Design and
  Theory of an Electromagnetically-Prepared Piano", *Proceedings of ICMC 2005*,
  Barcelona: electromagnets with permanent magnets over a piano's strings,
  driven by synthesised signals, for Per Bloland's music
  ([CCRMA](https://ccrma.stanford.edu/~sbacker/empp/)).

### The physics

* H. Fletcher, "Normal vibration frequencies of a stiff piano string",
  *J. Acoust. Soc. Am.* **36**(1), 203–209 (1964),
  [doi:10.1121/1.1918933](https://doi.org/10.1121/1.1918933): the stiff
  string's partials and B.
* G. Weinreich, "Coupled piano strings", *J. Acoust. Soc. Am.* **62**(6),
  1474–1484 (1977), [doi:10.1121/1.381677](https://doi.org/10.1121/1.381677):
  unisons coupled through the bridge, the prompt sound and the aftersound.
* A. Chaigne and A. Askenfelt, "Numerical simulations of piano strings. I. A
  physical model for a struck string using finite difference methods",
  *J. Acoust. Soc. Am.* **95**(2), 1112–1118 (1994),
  [doi:10.1121/1.408459](https://doi.org/10.1121/1.408459): the felt hammers.
* R. E. Best, *Phase-Locked Loops: Design, Simulation, and Applications*
  (McGraw-Hill), the loop McPherson's follows.

### Earlier models

No physical model of the MRP itself is known to us. The Ribbon Piano and the
Electric Grand in Forte share its string scale.
