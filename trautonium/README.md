# Trautonium

Friedrich Trautwein's Trautonium (Berlin, 1930) and Oskar Sala's
Mixtur-Trautonium (1952). A neon lamp across a capacitor flashes each time
the capacitor charges up to the lamp's striking voltage, and the capacitor
charges through a resistance wire stretched over a metal rail: wherever a
finger presses the wire onto the rail sets the pitch, and a finger sliding
along it glides. Every flash is a sharp pulse of current, and the pulses ring
resonant circuits tuned once and left there, so a note keeps the same
"vowel" wherever it is played. Sala added lamps that fire on every second,
third … n-th flash of the master: the subharmonics, the undertone series
under the note. Here every lamp's firing is solved to a fraction of a sample,
the dividers are caught by the master's sync pulse exactly as their voltages
say, and the circuits ring from the instant of each flash. You can hear what
a sample cannot give you: dividers that hold their ratio wherever the finger
goes, then slip flat or jump a pulse early when the sync is too weak or too
strong; formants that stay put while the pitch slides under them; ÷24 under
the low keys, a beat of wings.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/trautonium/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | press the wire (88 keys, A0–C8); a note sounds while its key is held |
| `←` `→` | octave |
| `↑` `↓` | the first circuit's tuning |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity (how hard the finger presses); **pitch bend slides the finger** (±2 semitones); **aftertouch presses harder**; **mod wheel = the first circuit's tuning** (a vowel sweep, from its setting up to 6 kHz); **CC11 = the volume pedal**; sustain pedal = hold |
| MPE | each note bends on its own, up to four octaves either way (a finger rolling and sliding on its wire), its pressure presses it, and CC74 tunes its own first circuit |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch |

**Playing.** *Keys* gives every key a manual of its own, so chords play.
*One wire* is the instrument as built: a single tone. A key pressed while
another is held slides the finger along the wire to it, in the *finger slide*
time, and letting it go slides back to the key still down; a key pressed
alone lands there.

## The lamp

A capacitor C charges through the wire's resistance R toward the supply S.
Across it sits a neon lamp, dark until the voltage reaches its striking
voltage V_s = 90 V; then the gas breaks down, the lamp dumps the capacitor to
its extinction voltage V_e = 60 V in a flash and goes dark again. The voltage
climbs as

  V(t) = S − (S − V_e) e^(−t/RC)

and reaches V_s after

  T = R C ln[(S − V_e)/(S − V_s)]

which is the period: a sawtooth, its ramp bowed by the exponential. Pearson
and Anson described the circuit in 1922; Trautwein's 1930 instrument ran on
it (Schwandt's account in *Funkschau* calls it the Hittorf circuit, and the
flash's pulses what the formants need).

**Supply voltage.** At the default 150 V the ramp takes ln(90/60) = 0.405 of
a time constant, the gentle start of the curve, so it is nearly straight: a
bright sawtooth. Near 90 V the capacitor is close to full as the lamp fires
(at 95 V the ramp takes 1.95 time constants), the ramp bends over, and the
sound goes rounder and darker. Every key's resistance is set for the supply,
so the pitch stays.

**The wire.** With C = 50 nF the wire is 112 kΩ from the finger to its end at
A4, 1.79 MΩ at A0 and 11.8 kΩ at C8. Since f = 1/(RC ln …), an octave up halves
the resistance, so on a wire whose resistance grows evenly along it the notes
are spaced as on a string: an octave halves the length. The *finger slide*
moves the finger at a steady speed, so 1/f moves evenly: a slide goes quickly
through the high notes and slowly through the low ones.

Each sawtooth is band-limited with polyBLEP: the exact instant of every flash,
to a fraction of a sample, places the correction. The firing times come from
the charging curve itself, so the pitch is exact (the tests check every key to
0.01 ¢).

## The dividers (the Mixtur-Trautonium)

Sala's Mixtur-Trautonium gives each manual four more relaxation oscillators,
each held to a whole-number fraction of the master: f/2, f/3 … f/24, mixed in
at their own levels (Doepfer's account: four dividers a manual, 1 to 24 on
rotary switches). Sala's patent (DE 917470, 1952) locks them by feeding them
the master's wave.

Here each divider is a lamp like the master, with its resistor ganged to the
wire so that on its own it would run a *slack* slower than f/n:
its period is n(1 + s) of the master's. Every flash of the master lifts every
divider by the *sync pulse* K. A divider that the lift takes past V_s fires at
that instant and starts again in step with the master; one that it doesn't
reach is left exactly as it was. (The Huygens Keyboard's lamps fire each
other the same way, and the same code places the firings.)

A lamp is within K of striking for the last

  δ = ln[(S − V_s + K)/(S − V_s)] / ln[(S − V_e)/(S − V_s)]

of its period: the **capture window**. Started in step, the divider is due
to fire after n(1 + s) master periods; after m of them, 1 − m/(n(1 + s)) of
its period is still to run, so the first flash that catches it is

  m = ⌈n(1 + s)(1 − δ)⌉,

if that comes before it fires on its own (m ≤ n(1 + s)). Every capture starts
it in step again, so it repeats: it fires on every m-th flash. It divides
true (m = n) when

  s/(1 + s) ≤ δ < (ns + 1)/(n(1 + s)).

The defaults (3 % of the 30 V swing, 2 % slack, 150 V) give δ = 3.67 %
against a slack of 1.96 %, and every divider from ÷1 to ÷24 divides true.
Turn the sync down below the slack and the dividers slip: each fires on its
own, n(1 + s) master periods apart, 34 ¢ flat of f/n, and drifts past the
master's flashes. Turn it up and the window reaches back a whole flash for
the large n first: at 10 % (δ = 12.0 %) ÷10 fires on the 9th flash and ÷16 on
the 15th while ÷2 and ÷5 still divide true. The supply voltage changes δ for
the same pulse too (at 100 V the default pulse gives 6.2 %).

The dividers' notes are the **undertone series**, the mirror of the
harmonics: f, f/2, f/3, f/4, f/5 make a minor chord downward, as the
harmonics make a major one upward.

## The resonant circuits

Trautwein's tone came from fixed resonances: a formant transformer and a
rotary capacitor made a resonant circuit, tuned once and left alone, and the
lamp's flashes rang it (*Funkschau*, 1930). His first instrument had two
such circuits; the Mixtur-Trautonium four to a manual.

Here every discharge of every sounding lamp is a step of its voltage, and
each step rings each circuit, from the instant it happens, as a damped
sinusoid

  (ω₀/Q_ref ω) e^(−σt) sin ωt,   ω₀ = 2πf, σ = ω₀/2Q, ω = √(ω₀² − σ²),

the step response of a resonance of peak Q/Q_ref (Q_ref = 8). The circuits
are linear, so their states simply add the steps up; they are tuned in hertz,
whatever the note. A discharge rings a circuit equally hard whatever its Q
(its charge into the capacitor), so a sharp circuit rings longer and louder.
Each harmonic of the note comes out as loud as its sawtooth's 1/k times the
circuits' response there: the harmonics that fall under a peak stand out,
and as the note moves they change, as a voice keeps its vowel on every pitch.
At a low note, or under a large divider, the flashes come further apart than
a circuit rings, and each one is heard as a pitched click. The mixture's
sawtooth also goes round the circuits (*direct sawtooth*), through a 15 Hz
coupling capacitor.

## Pressure, the pedal and the release

Sala's manuals sensed how hard the wire was pressed onto the rail, and that
set the loudness; the 1930 instrument had a volume pedal (*Funkschau*). Here
the key's velocity sets how hard the finger presses, and aftertouch presses
it further, up to fully down (a note struck at 0.3 and leaned on fully gets
1/0.3 louder). The pressure rises in the *finger's press* time, which a hard
key halves and a soft one makes one and a half times as long, and falls in
the *finger's lift* time when the key is released; then the wire leaves the
rail and the lamps stop. The volume pedal (CC11) scales everything. All the
lamps of a manual start at their extinction voltage when the finger lands,
as if they had just fired together, so a note speaks within one period (and
its press), with its dividers in step.

## What to listen for

`examples/trautonium/` has eight renders (`node tools/render-trautonium.mjs`):

1. **A slow melody on one wire**: legato slides between the notes, a
   finger's vibrato on the long ones, ÷2 in the mixture.
2. **The undertones switched in**: one held C3, then ÷2, ÷3, ÷4 and ÷5
   added one at a time.
3. **The bare lamp, then "oo", then "ee"**: the same phrase, the circuits
   off and then tuned to two vowels.
4. **Sliding under fixed formants**: one wire from C2 to C5 and back; the
   harmonics bend while the circuits' bands stay put.
5. **Sync in step, slipping, then early**: the undertone chord; the sync
   turned down until the dividers slip and beat; then up to 25 %, where ÷4
   fires on the 3rd flash and ÷5 on the 4th.
6. **Wing beats from ÷24**: the master silent, ÷24 alone under two low
   keys; each flash rings the circuits.
7. **Pressing in and letting off**: a soft note swelled with aftertouch.
8. **A subharmonic bass**: the master with ÷2 and ÷4 under it.

On the page, the **Lamps** view draws each lamp's capacitor voltage over a
few of the master's flashes, the band under the strike line that the sync
pulse reaches, and each divider's kicks; the **Circuits** view draws the
circuits' response with the note's harmonics on it.

## Files

```
trautonium/index.html, style.css                page
trautonium/src/trautonium-params.js             parameters and presets
trautonium/src/trautonium-instrument.js         the descriptor: everything but the page
trautonium/src/trautonium-main.js               page wiring and views
trautonium/src/trautonium-wasm.js, trautonium/wasm/trautonium.wasm   the engine and model, built from the C++
native/instruments/trautonium/                  the physics in C++: model and engine (plugins and WebAssembly)
test/trautonium-tests.mjs                       node test/trautonium-tests.mjs
tools/render-trautonium.mjs                     node tools/render-trautonium.mjs → examples/trautonium/
```

## Simplifications

* **The wire's resistance charges the capacitor.** In Trautwein's circuit the
  wire was a voltage divider setting the grid of a valve that served as the
  lamp's charging resistance, and Sala's master was a thyratron whose grid
  the wire biased. Here the wire is the resistance, which keeps f ∝ 1/R; how
  the notes were spaced on a real wire depended on the valve's curve.
* **The dividers track the wire.** Sala's patent keeps each divider's own
  timing fixed and feeds it the master's sawtooth through a phase-reversing
  valve, more strongly at higher pitches, which holds it locked over about
  three and a half octaves, at ratios up to about 1:20. Here each divider's
  resistor is ganged to the wire and the sync is a pulse at each flash, so
  the lock holds across all 88 keys and its edges have a closed form. A
  divider switched off still runs, so it is in step when switched in.
* **The lamps are ideal.** They strike and go out at fixed voltages, at once,
  with no jitter or drift: a real neon lamp's flash takes microseconds, its
  voltages wander with temperature and age, and Trautwein's pitch drifted.
  The flash's own current pulse is not heard directly; only its step, through
  the circuits and the sawtooth.
* **The circuits are band-pass only**, each rung by the steps alone (the slow
  charging current through it is left out). Sala's could also be switched to
  low-pass.
* **The finger's pressure is a smooth press and lift** set by the velocity
  and aftertouch; it changes the loudness only (a lightly pressed wire's
  contact resistance would also pull the pitch flat). Sala's later
  instruments had envelope generators and a noise source, not modelled here.
* **One loudspeaker**: the output is mono, before the room.

## Quality

At Medium the engine sounds at most 12 manuals at once and at Low 6 (High:
32); past that the oldest lifted one, else the oldest held one, lets go in
5 ms. A note sounds exactly as at High: the lamps and circuits cost little,
and trimming them would move where the dividers lock.

## Prior art and references

### The instrument

* Trautwein, F. (1930). *Elektrische Musik*. Berlin: Weidmannsche
  Buchhandlung. Published for the instrument's first public concert in
  Berlin on 20 June 1930, where Sala, Paul Hindemith and Rudolph Schmidt
  played it; Trautwein built it at the Rundfunkversuchsstelle of the Berlin
  Hochschule für Musik. Hindemith wrote trios for three Trautoniums and a
  Concertino for Trautonium and strings (1931).
* Trautwein, F. [AT 132824](https://patents.google.com/patent/AT132824B/de),
  "Vorrichtung zur Erzeugung von Musik auf elektrischem Wege" (priority
  1931, published 1933): tone generators made of a glow lamp, a capacitor
  and a resistor.
* Schwandt, E. (1930). ["Elektrische Musik"](https://worldradiohistory.com/INTERNATIONAL/Funkschau/1930/Funkschau-1930-07-05.pdf).
  *Funkschau* (Munich). The glow lamp, capacitor and resistor in the Hittorf
  circuit, the manual resistor, the formant transformer and rotary
  capacitor, the foot pedal.
* Sala, O. [DE 917470](https://patents.google.com/patent/DE917470C/de),
  "Synchronisationsvorrichtung für elektrische Musikinstrumente" (filed
  1952, published 1954), and [US 2,740,892](https://patents.google.com/patent/US2740892A/en),
  "Synchronizing system for electrical musical instruments" (granted 1956):
  gas-discharge relaxation generators locked to the played one for its
  subharmonics. Sala presented the Mixtur-Trautonium in 1952 and made the
  sounds of Hitchcock's *The Birds* (1963) on it.
* Marsh, A. (2019). ["How the Trautonium found favor with Nazis and gave
  Hitchcock's *The Birds* its distinctive screech"](https://spectrum.ieee.org/how-the-trautonium-found-favor-with-nazis-and-gave-hitchcocks-emthe-birdsem-its-distinctive-screech).
  *IEEE Spectrum*. The wire over the plate, the neon relaxation oscillator,
  Telefunken's Volkstrautonium (about 200 made in the 1930s).
* [The Trautonium Project](https://doepfer.de/traut/traut_e.htm) (Doepfer):
  the Mixtur-Trautonium's four dividers a manual, 1 to 24 on rotary
  switches, its four formant filters a manual, and its pressure-sensing
  manual.

### The physics

* Pearson, S. O. & Anson, H. St. G. (1922). "The neon tube as a means of
  producing intermittent currents." *Proc. Phys. Soc. London* 34, 204–212.
  [doi:10.1088/1478-7814/34/1/341](https://doi.org/10.1088/1478-7814/34/1/341)
* van der Pol, B. (1926). "On 'relaxation-oscillations'." *Phil. Mag.*
  (7) 2, 978–992.
  [doi:10.1080/14786442608564127](https://doi.org/10.1080/14786442608564127)
* van der Pol, B. & van der Mark, J. (1927). "Frequency demultiplication."
  *Nature* 120, 363–364.
  [doi:10.1038/120363a0](https://doi.org/10.1038/120363a0). A neon-lamp
  relaxation oscillator locked to whole-number fractions of its drive.
* Mirollo, R. E. & Strogatz, S. H. (1990). "Synchronization of
  pulse-coupled biological oscillators." *SIAM J. Appl. Math.* 50,
  1645–1662. [doi:10.1137/0150098](https://doi.org/10.1137/0150098). Firing
  by absorption, as the dividers here.
* Välimäki, V. & Huovilainen, A. (2007). "Antialiasing oscillators in
  subtractive synthesis." *IEEE Signal Processing Magazine* 24(2), 116–125.
  [doi:10.1109/MSP.2007.323276](https://doi.org/10.1109/MSP.2007.323276).
  PolyBLEP.

### Earlier models and syntheses

* [Trautoniks](https://trautoniks.de/com/history.html) (Jürgen Hiller):
  Mixtur-Trautonium clones and modules since 1990, from a programmable
  frequency divider for subharmonic groups.
* [A-113 Subharmonic Generator, A-104 Trautonium Formant Filter and A-198
  Trautonium Manual](https://doepfer.de/traut/traut_e.htm) (Doepfer): the
  Mixtur-Trautonium's dividers, filters and manual as modules.
* The Subharchord (Labor für Akustisch-Musikalische Grenzprobleme, East
  Berlin, from about 1960): an organ-like keyboard of subharmonic mixtures
  after the Trautonium.
* [Subharmonicon](https://www.moogmusic.com/synthesizers/subharmonicon/)
  (Moog Music, 2020): an analog synthesizer of subharmonic oscillators and
  polyrhythmic sequencers, after the Mixtur-Trautonium, Theremin's
  Rhythmicon and Joseph Schillinger.
* [Huygens Keyboard](../huygens/README.md) (Forte): the same neon lamps,
  firing each other across the keyboard.
