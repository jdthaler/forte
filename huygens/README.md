# Huygens Keyboard

A keyboard whose notes are self-sustained oscillators that **pull each other
into tune**. Hold an equal-tempered C-major chord and the oscillators lock
onto the just ratios 4:5:6. Add B♭ and, with a little more coupling, it
becomes the pure harmonic seventh 7:4. The mechanism is the one Huygens
noticed in 1665, when two pendulum clocks on the same beam fell into step.

Play it at <https://forte.jthaler.net/huygens/> (or locally — see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/`, `Q…]` rows | play (61 keys, C2–C7) |
| hold `Space` | latch notes, to build chords on a computer keyboard |
| `↑` `↓` | coupling strength |
| `←` `→` | octave |
| MIDI | notes; **mod wheel = coupling**; sustain pedal = latch |

## What each key is

Each key is the circuit van der Pol and van der Mark studied in 1927. A
capacitor charges through a resistor from a shared supply rail, with a neon
lamp across it. At the striking voltage (90 V) the lamp fires and dumps the
capacitor to the extinction voltage (60 V); then the cycle repeats. That gives
a sawtooth with period T = R C ln[(V − V_e)/(V − V_s)], and each key's
resistor sets its pitch. Firing times are solved analytically inside each
sample, so tuning and locking are exact to a hundredth of a cent. The output
is band-limited with polyBLEP.

A key powers its lamp up and keys its output, like an organ keyer. On release
the output fades while the lamp keeps running, and the lamp is switched off
once it is silent. The output passes through a coupling capacitor (a 15 Hz
high-pass), so a note stops without a thump.

## How the lamps lock

**Coupling.** All the lamps share a cathode resistor. When one fires, its
discharge briefly lifts the voltage across every other lamp by a small kick
K. A lamp within K of striking fires in the same instant (and may set off
others). Every other lamp is left exactly as it was: a kick either fires a
lamp or leaves no trace. In time, a lamp is captured if its own next firing
was due within a fraction δ of its period, with

  δ = ln[(S − V_s + K)/(S − V_s)] / ln[(S − V_e)/(S − V_s)]

for supply S. δ is the same for every key. This is pulse coupling of
integrate-and-fire oscillators (Mirollo–Strogatz: fireflies, pacemaker cells)
in its simplest, "absorbing" form. The supply and lamp voltages enter only
through δ, so changing them rescales the coupling axis and nothing else.

**Two lamps, exactly.** Once two lamps have fired together they are back
where they started, so from then on their motion repeats exactly: they are
locked, and counting firings until the next shared one gives the ratio p:q.
Stepping from one shared firing to the next is all it takes to compute the
lock for any interval. The p:q lock (the upper lamp fires p times while the
lower fires q times) covers

  (p − δ)/q ≤ f_upper/f_lower ≤ p/(q − δ),

unless a simpler ratio catches the pair first. Every interval locks to
something. By Dirichlet's approximation theorem some q ≤ 1/δ brings a firing
inside the window, so the devil's staircase is complete: there is no unlocked
or chaotic motion between its steps. The tests check the rule against the
engine at tongue edges, at 42 intervals, and with two different circuits of
equal δ.

**What locks, and when** (two lamps a given equal-tempered interval apart; the
coupling is the kick as a fraction of the lamp's 30 V swing, for the default
150 V supply):

| interval | locks onto | from (δ) | then |
|---|---|---|---|
| octave | 2:1 | any coupling (ET octaves are 2:1 already) | |
| fifth, fourth | 3:2, 4:3 | 0.28 % (0.0034) | |
| major 7th | 17:9 (1 ¢ from ET) | 0.83 % (0.010) | 15:8 from 4.43 %, 2:1 from 9.31 % |
| major 2nd, minor 7th | 9:8, 16:9 | 1.65 % (0.020) | minor 7th → **7:4** from 5.87 %; major 2nd → 1:1 from 9.05 % |
| major 6th | 5:3 | 2.20 % (0.027) | |
| major 3rd | 5:4 | 2.57 % (0.032) | |
| tritone | 7:5 | 4.12 % (0.050) | 17:12 before that, from 2.40 %; 3:2 from 14.4 % |
| minor 3rd | 6:5 | 4.42 % (0.054) | 19:16 before that, from 1.87 %; 1:1 from 13.3 % |
| minor 2nd | 1:1: merges into one pitch | 4.60 % (0.056) | 17:16 before that, from 3.98 % |
| minor 6th | 8:5 | 5.17 % (0.063) | 19:12 before that, from 2.51 %; 3:2 from 9.13 % |

Below each onset the interval is still locked, to a more complex ratio close
to where it started: ratios with denominators above 17 move an ET interval by
at most 1.3 ¢. The simpler the ratio,
the wider its tongue. The page draws the **devil's staircase** (how far the
coupling pulls each interval) and the **Arnold tongues** (which ratio each
interval locks onto, at every coupling) for the current circuit, from the
rule above. With rail sag on (below) there is no closed form, so the page
simulates each point instead.

**The default, 5.5 %** (δ = 0.067), locks major and minor triads onto 5-limit
just intonation in every voicing and register: root position, both
inversions, open, and with the root doubled (nine voicings, C2 to C5, in the
tests). It has to be this strong. In C–E–G–C′, E–C′ is a minor sixth, which
reaches 8:5 only from 5.17 %; at 4.5 % the E of that chord settles near 401 ¢
instead of 386 ¢. The price is semitones. A bare minor second merges into a
unison from 4.60 %, so no coupling locks the minor sixth and keeps semitones
apart. A semitone inside a chord is pulled the same way: Cmaj7 with C on top
may lock as 8:10:12:15:16, or settle into a long pattern instead. The
"Weaker (4.5 %)" preset keeps semitones apart and gives up the inversions.

**Chords.** Each pair follows the rule above, and a chord locks when its pairs
agree, as a triad's do on 4:5:6. Where they conflict, three or more lamps can
settle into a long repeating pattern instead. At the default a C dominant
seventh's G–B♭ wants 6:5 while C–B♭ wants 16:9, and the chord settles on
C:E:G:B♭ = 67:85:100:120, a pattern 67 periods of C long. From about 6 %
C–B♭ can reach 7:4, and at 7 % the chord locks as 4:5:6:7.

**How fast.** From random phases a pair locks at its first shared firing.
Until then the two firing trains slide past each other at the beat rate
Δ = |p f_lower − q f_upper| of the ratio they will lock onto. The capture
window covers a fraction δ(p + q) of the spacing between near-misses, so
capture takes at most (1 − δ(p + q))/Δ, plus q + 1 periods of the lower note.
Equal temperament's fifth is so close to 3:2 that it beats slowly: at the
default C4–G4 locks within 0.8 s and C2–G2 within 3 s. Thirds beat faster and
lock within tens of milliseconds (C2–E2 within 0.23 s).

**Watching it.** The page's tables detect locks from shared firings, so
"locked 5:4" is exact and holds steady even in the bass; pairs that meet only
through a third note (C and G in a locked C–E–G) are chained. The firing
raster is triggered on the lowest note's firing shared with the most others,
so a locked chord's pattern stands still and an unlocked one slides.

**Pitch hold.** A pulse can only make a lamp fire *earlier*, so locked
chords run sharp: about 20–30 ¢ for a 4:5:6:7 chord. Every oscillator's period
scales with the same function of supply voltage, so a slow servo on the supply
can hold the average pitch without disturbing any interval. With it on,
individual notes settle at their just-intonation offsets from equal
temperament. For C–E–G that's +3.9, −9.8 and +5.9 ¢, the textbook values.

## Why not strings or pipes?

The first two attempts are kept in `experiments/`, and
`node tools/lock-comparison.mjs` reruns them:

| oscillator | coupling | ET fifth (−2.0 ¢) | ET third (+13.7 ¢) |
|---|---|---|---|
| bowed strings, shared bridge | up to 37 s⁻¹ bridge damping | stays ≈ −2 to −3 ¢; oscillation breaks up at the strongest coupling | +12.7 ¢, then stops |
| reed pipes, shared windchest | up to κ = 1000 s⁻¹ | −2.3 ¢ | +14.0 ¢ |
| neon relaxation, pulse-coupled | 1 % / 3 % | **0.00 ¢** | **0.00 ¢** at 3 % |

Adler's law explains it. An oscillator's locking range is roughly
(injected signal)/(2Q) of its frequency. A bowed string is a resonator with
Q ≈ 1000, and Helmholtz motion's period is fixed by the round trip on the
string. Pipes have Q ≈ 20–50: real organ pipes do pull each other, but only
within a few cents, as organ builders know. Pushing the windchest coupling
further destabilizes the wind before thirds lock. Relaxation oscillators have
no resonator, so they lock over musical intervals.

## Knobs worth trying

* **Pulse coupling**: sweep it under a held chord. The fifth locks almost at
  once, the major third from 2.6 %, the minor seventh reaches 7:4 near 6 %,
  and above 4.6 % semitones merge into unisons.
* **Random mistuning** of 25 ¢: an out-of-tune keyboard that plays in tune,
  because each chord re-tunes itself.
* **Resistor drift**: every oscillator wanders; locked chords wander together.
* **Rail-sag coupling**: coupling through the shared supply's resistance,
  which is slow and weak. It barely locks anything, a good contrast with the
  pulses.
* **Supply and lamp voltages**: change the ramp's curvature, and with it δ for
  a given kick. The tongue map stretches along the coupling axis; in terms of
  δ it is unchanged.

## Simplifications

* The kick is instantaneous and leaves no trace on a lamp it does not fire.
  A real shared resistor would also nudge the other capacitors' charge a
  little, which would speed up capture but blur the exact tongue rule.
* The lamps strike and go out at fixed voltages: no jitter, no hysteresis
  drift.
* The pitch-hold servo lowers S a little, which raises δ: by about 0.2 % at
  the default, 1–2 % at the strongest couplings. The map is drawn for the
  nominal supply.

`examples/huygens/` has five renders: uncoupled vs coupled C major; a coupling
sweep under a held seventh chord; a badly tuned keyboard rescued; a minor
second merging into a unison; drifting resistors held together. Regenerate
with `node tools/render-huygens.mjs`. Tests: `node test/huygens-tests.mjs`.
