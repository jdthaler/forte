# Huygens Keyboard

A keyboard whose notes are self-sustained oscillators that **pull each other
into tune**. Hold an equal-tempered C-major chord and the oscillators lock
onto the just ratios 4:5:6. Add B♭ and, with a little more coupling, it
becomes the pure harmonic seventh 7:4. The mechanism is the one Huygens
noticed in 1665, when two pendulum clocks hung from a shared support fell
into step, swinging in opposite directions.

Play it at <https://forte.jthaler.net/huygens/> (or locally — see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/`, `Q…]` rows | play (88 keys, A0–C8) |
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

## In C++

The engine and the model (each key's design tuning, δ and the lock ratio)
are C++, built as WebAssembly for this page, where the lock map's worker
uses them too, and as plugins (CLAP, VST3, AU and a standalone app): the
Space pedal is Hold on CC64 and the mod wheel raises the pulse coupling from
its default. Each key's starting phase and the resistors' drift come from a
seeded generator. Ten coupled keys take about 1.6 % of a core. The C++ is in
`native/instruments/huygens/`, its WebAssembly in `huygens/wasm/` (wrapped by
`huygens/src/huygens-wasm.js`); `huygens/src/sync-theory.js` keeps the closed
forms (the kick for a window δ, the tongue edges, the capture time) that the
tests hold it to.

## Prior art and references

### The original observation and the oscillator

In February 1665 Christiaan Huygens found that two of his pendulum clocks,
hung a foot or two apart, kept time together, their pendulums moving in
opposite directions, and that they drifted apart once separated. He
described it in letters to his father and to Robert Moray of the Royal
Society. His notes describe each clock hanging from its own beam, the
beams resting on the same two chairs.

* Huygens, C. Letter to Constantijn Huygens, 26 February 1665 (No. 1335),
  and letter to R. Moray, 27 February 1665 (No. 1338). *Œuvres complètes*,
  Tome V (1893, ed. D. Bierens de Haan), 243–244 and 246–249.
  [No. 1335](https://www.dbnl.org/tekst/huyg003oeuv05_01/huyg003oeuv05_01_0138.php),
  [No. 1338](https://www.dbnl.org/tekst/huyg003oeuv05_01/huyg003oeuv05_01_0141.php)
  (DBNL).
* Huygens, C. Notes of 1665 on the "sympathy" of clocks. *Œuvres
  complètes*, Tome XVII (1932), 183–186.
  [DBNL](https://www.dbnl.org/tekst/huyg003oeuv17_01/huyg003oeuv17_01_0030.php)
* Bennett, M., Schatz, M. F., Rockwood, H. & Wiesenfeld, K. (2002).
  "Huygens's clocks." *Proc. R. Soc. Lond. A* 458, 563–579.
  [doi:10.1098/rspa.2001.0888](https://doi.org/10.1098/rspa.2001.0888)

The keys' circuit, a capacitor charged through a resistor with a neon lamp
across it, goes back to Pearson and Anson. Van der Pol named relaxation
oscillations, and with van der Mark drove this neon-lamp circuit with a
sinusoid and heard it lock to integer fractions of the drive.

* Pearson, S. O. & Anson, H. St. G. (1922). "The neon tube as a means of
  producing intermittent currents." *Proc. Phys. Soc. London* 34, 204–212.
  [doi:10.1088/1478-7814/34/1/341](https://doi.org/10.1088/1478-7814/34/1/341)
* van der Pol, B. (1926). "On 'relaxation-oscillations'." *Phil. Mag.*
  (7) 2, 978–992.
  [doi:10.1080/14786442608564127](https://doi.org/10.1080/14786442608564127)
* van der Pol, B. & van der Mark, J. (1927). "Frequency demultiplication."
  *Nature* 120, 363–364.
  [doi:10.1038/120363a0](https://doi.org/10.1038/120363a0)

### The physics

* Adler, R. (1946). "A study of locking phenomena in oscillators."
  *Proc. IRE* 34, 351–357.
  [doi:10.1109/JRPROC.1946.229930](https://doi.org/10.1109/JRPROC.1946.229930).
  The locking range used in *Why not strings or pipes?*
* Arnold, V. I. (1961). "Small denominators. I. Mappings of the
  circumference onto itself." *Izv. Akad. Nauk SSSR Ser. Mat.* 25, 21–86.
  English translation: *Amer. Math. Soc. Transl.* (2) 46, 213–284 (1965).
  [doi:10.1090/trans2/046/11](https://doi.org/10.1090/trans2/046/11). The
  tongues of the circle map.
* Winfree, A. T. (1967). "Biological rhythms and the behavior of
  populations of coupled oscillators." *J. Theor. Biol.* 16, 15–42.
  [doi:10.1016/0022-5193(67)90051-3](https://doi.org/10.1016/0022-5193%2867%2990051-3)
* Peskin, C. S. (1975). [*Mathematical Aspects of Heart Physiology*](https://math.nyu.edu/~peskin/heartnotes/index.html).
  Courant Institute of Mathematical Sciences lecture notes, 268–278 (as
  cited by Mirollo & Strogatz). Pulse-coupled integrate-and-fire
  oscillators as a model of the cardiac pacemaker.
* Keener, J. P., Hoppensteadt, F. C. & Rinzel, J. (1981). "Integrate-and-fire
  models of nerve membrane response to oscillatory input." *SIAM J. Appl.
  Math.* 41, 503–517. [doi:10.1137/0141042](https://doi.org/10.1137/0141042)
* Jensen, M. H., Bak, P. & Bohr, T. (1983). "Complete devil's staircase,
  fractal dimension, and universality of mode-locking structure in the
  circle map." *Phys. Rev. Lett.* 50, 1637–1639.
  [doi:10.1103/PhysRevLett.50.1637](https://doi.org/10.1103/PhysRevLett.50.1637)
* Kuramoto, Y. (1984). *Chemical Oscillations, Waves, and Turbulence*.
  Springer. [doi:10.1007/978-3-642-69689-3](https://doi.org/10.1007/978-3-642-69689-3)
* Bak, P. (1986). "The devil's staircase." *Physics Today* 39(12), 38–45.
  [doi:10.1063/1.881047](https://doi.org/10.1063/1.881047)
* Mirollo, R. E. & Strogatz, S. H. (1990). "Synchronization of
  pulse-coupled biological oscillators." *SIAM J. Appl. Math.* 50,
  1645–1662. [doi:10.1137/0150098](https://doi.org/10.1137/0150098). Firing
  by absorption, as here.
* Pikovsky, A., Rosenblum, M. & Kurths, J. (2001). *Synchronization: A
  Universal Concept in Nonlinear Sciences*. Cambridge University Press.
  [doi:10.1017/CBO9780511755743](https://doi.org/10.1017/CBO9780511755743)
* Pantaleone, J. (2002). "Synchronization of metronomes." *Am. J. Phys.*
  70, 992–1000. [doi:10.1119/1.1501118](https://doi.org/10.1119/1.1501118)
* Strogatz, S. (2003). [*Sync: The Emerging Science of Spontaneous Order*](https://www.publishersweekly.com/9780786868445).
  Hyperion.
* Abel, M., Ahnert, K. & Bergweiler, S. (2009). "Synchronization of sound
  sources." *Phys. Rev. Lett.* 103, 114301.
  [doi:10.1103/PhysRevLett.103.114301](https://doi.org/10.1103/PhysRevLett.103.114301).
  Organ pipes pulling each other into tune.
* Fischer, J. L., Bader, R. & Abel, M. (2016). "Aeroacoustical coupling
  and synchronization of organ pipes." *J. Acoust. Soc. Am.* 140,
  2344–2351. [doi:10.1121/1.4964135](https://doi.org/10.1121/1.4964135)

### Earlier instruments and works

Friedrich Trautwein's Trautonium already sounded glow-lamp relaxation
oscillators, and Oskar Sala's Mixtur-Trautonium synchronised such
oscillators to sound subharmonics of the played note: relaxation
oscillators locked at integer ratios.

* Trautwein, F. [AT 132824](https://patents.google.com/patent/AT132824B/de),
  "Vorrichtung zur Erzeugung von Musik auf elektrischem Wege" (priority
  1931, published 1933): tone generators made of a glow lamp, a capacitor
  and a resistor, producing relaxation oscillations.
* Sala, O. [DE 917470](https://patents.google.com/patent/DE917470C/de),
  "Synchronisationsvorrichtung für elektrische Musikinstrumente" (filed
  1952, published 1954), and [US 2,740,892](https://patents.google.com/patent/US2740892A/en),
  "Synchronizing system for electrical musical instruments" (granted 1956):
  gas-discharge relaxation generators synchronised to a played
  oscillator to give its subharmonics.
* Marsh, A. (2019). ["How the Trautonium found favor with Nazis and gave
  Hitchcock's *The Birds* its distinctive screech"](https://spectrum.ieee.org/how-the-trautonium-found-favor-with-nazis-and-gave-hitchcocks-emthe-birdsem-its-distinctive-screech).
  *IEEE Spectrum*. The Trautonium's neon relaxation oscillator.
* [Trautonium](https://doepfer.de/traut/traut_e.htm) (Doepfer): a
  description of the Mixtur-Trautonium's subharmonic dividers.
* [Subharmonicon](https://www.moogmusic.com/synthesizers/subharmonicon/)
  (Moog Music): an analog synthesizer of subharmonic oscillators and
  polyrhythmic sequencers, after the Mixtur-Trautonium, Theremin's
  Rhythmicon and Joseph Schillinger.
* Lem, N. (2019). ["Sound in multiples: synchrony and interaction design
  using coupled-oscillator networks"](https://www.smc2019.uma.es/articles/P3/P3_09_SMC2019_paper.pdf).
  *Proc. Sound and Music Computing Conf.* (SMC 2019), Málaga. Kuramoto
  networks for music.
* Lucas, P. P., Fasciani, S., Szorkovszky, A. & Glette, K. (2024).
  "Interactive sonification of 3D swarmalators." *Proc. NIME 2024*,
  252–260. [doi:10.5281/zenodo.13904846](https://doi.org/10.5281/zenodo.13904846)
* Moon, G. (2024). "Coupled oscillator networks: perspectives on
  synchronization and nonlinear musical frameworks." *Proc. NIME 2024*,
  413–418. [doi:10.5281/zenodo.13904895](https://doi.org/10.5281/zenodo.13904895)
