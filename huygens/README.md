# Huygens Keyboard

A keyboard whose notes are self-sustained oscillators that **pull each other
into tune**. Hold an equal-tempered C-major chord and the oscillators lock
onto the just ratios 4:5:6. Add B♭ and, with enough coupling, it becomes
the pure harmonic seventh 7:4. The mechanism is the one Huygens noticed in
1665, when two pendulum clocks on the same beam fell into step.

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

**Coupling.** All the lamps share a cathode resistor. When one fires, its
discharge briefly lifts the voltage across every other lamp by a small
"kick". Any lamp that is that close to striking fires in the same instant.
This is pulse coupling of integrate-and-fire oscillators (Mirollo–Strogatz:
fireflies, pacemaker cells). A relaxation oscillator has no resonator holding
its phase, so these nudges accumulate into frequency locking.

**What locks, and when** (two oscillators, C4 plus an equal-tempered
interval; the coupling is the kick as a fraction of the lamp's 30 V swing):

| interval | locks at | onto | then |
|---|---|---|---|
| octave | 0.25 % | 2:1 | |
| fifth, fourth | 0.75 % | 3:2, 4:3 | |
| major 7th | 1.0 % | 17:9 (1 ¢ away!) | 15:8 at 4.5 %, 2:1 at 9.5 % |
| major 2nd, minor 7th | 1.75 % | 9:8, 16:9 | minor 7th → **7:4** at 6 % |
| major 6th | 2.25 % | 5:3 | |
| major 3rd | 2.75 % | 5:4 | |
| tritone | 4.25 % | 7:5 | → 3:2 at 14.5 % |
| minor 3rd | 4.5 % | 6:5 | |
| minor 2nd | 4.75 % | 1:1, merges into one pitch | |
| minor 6th | 5.25 % | 8:5 | collapses into 3:2 at 9.25 % |

The simpler the ratio, the wider its locking region. The page computes the
whole picture live for the current circuit: the **devil's staircase** (how
far coupling pulls each interval) and the **Arnold tongues** (where locking
happens at every coupling strength). It also shows a firing raster triggered
on the lowest note: a locked chord's rhythm stands still, and an unlocked one
slides. The default, 4.5 %, locks every consonance while keeping semitones
distinct.

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

* **Pulse coupling**: sweep it under a held chord. The fifth locks first,
  then the third, then the seventh, and at the top semitones collapse into
  unisons.
* **Random mistuning** of 25 ¢: an out-of-tune keyboard that plays in tune,
  because each chord re-tunes itself.
* **Resistor drift**: every oscillator wanders; locked chords wander together.
* **Rail-sag coupling**: coupling through the shared supply's resistance,
  which is slow and weak. It barely locks anything, a good contrast with the
  pulses.
* **Supply voltage**: changes the ramp's curvature, and with it the tongue
  shapes. The map recomputes.

`examples/huygens/` has five renders: uncoupled vs coupled C major; a coupling
sweep under a held seventh chord; a badly tuned keyboard rescued; a minor
second merging into a unison; drifting resistors held together. Regenerate
with `node tools/render-huygens.mjs`. Tests: `node test/huygens-tests.mjs`.
