# Singing Arc

William Duddell's singing arc (1900), played from a keyboard as he played it.
A carbon arc lamp burns on direct current. Its voltage *falls* as its current
rises, so across a coil and a capacitor it behaves as a negative resistance:
it feeds the tuned circuit instead of damping it, and the circuit rings at
its own note. Duddell played tunes on it from a keyboard that switched
capacitors across a fixed coil. There is no loudspeaker. The arc's column
swells and shrinks with the heat the current puts into it, and that
breathing *is* the sound. Here the arc is Ayrton's falling characteristic
with a thermal memory (a Mayr-type column), the circuit is Duddell's, and the
sound is the thermophone's pressure, ∝ dP/dt. Notes grow out of the arc's own
flicker at the rate a linear analysis predicts and sound a little below
Kelvin's LC formula. Keys held together put their capacitors in parallel and
the pitch drops. Above Ayrton's hissing current the arc hisses, and with a
high re-strike voltage it goes out and re-strikes every cycle. Simon's talking
arc is here too.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/arc/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8): each key closes a contact that switches its capacitor across the coil |
| `←` `→` | octave |
| `↑` `↓` | arc current |
| `Space` | hold: keys stay down while Space is held |
| MIDI | notes, sustain pedal (= hold), **mod wheel = arc current**. Velocity does nothing: a key only closes a contact, as on Duddell's keyboard |

## The physics

### 1. Duddell's arc

Electric arc lamps of the 1890s whistled and hummed, and Duddell was asked to
find out why. In his paper to the Institution of Electrical Engineers (read
13 December 1900, published 1901) he showed that a coil and a condenser in
series across a direct-current arc make it sing, at a note close to
Kelvin's formula for the circuit, f = 1/(2π√LC) (William Thomson, 1853). At
the meeting he played tunes, *God Save the Queen* among them, from a keyboard
that switched condensers across a fixed coil. Elihu Thomson had patented a
condenser and coil across a direct-current discharge gap in 1893. The arc
oscillator went on to radio as Poulsen's arc converter (US patent 1905), and
Simon had already made an arc reproduce speech (1898).

### 2. Ayrton's falling characteristic

Hertha Ayrton measured the steady voltage of arcs between solid carbons
against current and length and fitted

  V = a + b·l + (c + d·l)/I = A + B/I

with the gap l in mm and the current I in amperes. The model uses the
constants usually quoted for her solid carbons (positive 11 mm, negative
9 mm): a = 38.88 V, b = 2.074 V/mm, c = 11.66 W, d = 10.54 W/mm. They have not
been checked against her book here, so treat them as the model's choice. At
the defaults (3 A, 3 mm gap) A = 45.10 V and B = 43.28 W, and the arc burns
at 59.5 V. Its static resistance is R₀ = V/I = 19.8 Ω, and its differential
resistance is negative:

  R_d = dV/dI = −B/I² = −4.81 Ω

Less current, or a longer gap, makes it steeper: −10.7 Ω at 2 A, −1.2 Ω at
6 A, −0.30 Ω at 12 A.

### 3. The column's thermal memory

The arc's conductance g is set by the temperature of its column, and the
column takes time to heat and cool. Mayr's (1943) model makes that a single
energy balance with a time constant τ:

  (1/g) dg/dt = (1/τ) (u·i / P(g) − 1)

where P(g) is the power the column loses. Mayr took P constant, which gives
a hyperbola u = P/i; Cassie's (1939) companion model takes P ∝ g, which gives
a flat characteristic and could not make the arc sing. Here the loss is chosen
so that the static limit is Ayrton's curve. Write the state as a *thermal
current* X, the steady current at which the column would have this
conductance:

  g = X²/(A·X + B),   P = A·X + B

Mayr's law then becomes a relaxation of X towards the current through the
arc:

  dX/dt = (w/τ) (i² − X²)/X,   w = (A·X + B)/(A·X + 2B)

The arc's voltage is u = i/g. A steady arc has X = |i| and sits on Ayrton's
curve. The tests check the static limit against Ayrton's equation to 0.1 %.
τ is the instrument's main voicing knob, from 5 to 300 µs (default 26 µs, the
model's choice, made so that the note sounds about 1 % below Kelvin's formula
on the default coil).

### 4. Negative, inductive, and an upper limit

Linearised about its operating point, the arc is an impedance

  Z(s) = R₀ − K·2w/(sτ + 2w),   K = I₀R₀ (ln g)′ = R₀/w

At low frequency Z = R_d, the falling slope. At high frequency Z = R₀: the
column cannot follow, its conductance is frozen, and the arc is a plain
positive resistor. In between, its imaginary part is positive. The thermal
lag acts as a series inductance

  L_arc = Kτ/(2w) = 0.40 mH

at the defaults. The arc stops looking negative where Re Z = 0:

  ωτ = 2w √(K/R₀ − 1)

which is 4.84 kHz at the defaults. A slow column (thick carbons, a large τ)
lowers that ceiling and a quick one raises it. Poulsen's later arc burned in
a hydrogen-rich gas, which cools the column fast, and reached radio
frequencies. The
tests check the analytic Z(jω) against a numerical linearisation of the arc's
equations from 10 Hz to 100 kHz (to 10⁻⁵), and its limits.

### 5. Hysteresis

Driven by a sinusoidal current, the operating point does not run up and down
the static curve: it traces a loop. While the current rises the column is
still cool, so the voltage is higher than the static curve; while it falls the
column is still hot, so the voltage is lower. The loop runs clockwise in the
(i, u) plane, as an inductive element's does. For a small swing I₁ its area
is π I₁² Im Z(jω), which the tests check to 2 %. The loop collapses onto the
static curve as ωτ → 0 and onto a straight line of slope R₀ as ωτ → ∞, the
pinched, frequency-dependent loop that makes Chua and Kang's "memristive
system" and that Ginoux and Rossetto read in the singing arc. The V–I view
draws it live.

### 6. Duddell's circuit and the start of a note

The supply is 220 V of DC mains through a rheostat R_b, set for the arc
current (53.5 Ω for 3 A), and a large choke L_b = 0.5 H that keeps the supply
out of the oscillation. Across the arc sits the musical circuit: a fixed coil,
L = 20 mH by default with R = 0.3 Ω, in series with the capacitors the keys
switch in. Small perturbations ∝ eˢᵗ obey

  1 + Z(s)·(1/(R_b + sL_b) + sC/(LCs² + RCs + 1)) = 0

which is a quartic, with four roots: the musical pair, the column's thermal
mode and the choke's slow mode. The model solves it exactly; the tests
check its roots against the eigenvalues of the circuit's state matrix. For the
musical pair, approximately

  σ ≈ (−Re Z − R)/(2(L + L_arc)),   f ≈ f_LC (1 − L_arc/(2L))

so the note starts when the arc's negative resistance outweighs the coil's
loss. At the defaults it grows at σ ≈ 110 s⁻¹ (×e every 9 ms) on every key
from A0 to C6 (then more slowly towards the ceiling, below), and starts 1.0 %
below Kelvin's formula at C6, 1.2 % at C4 and 2.0 % at C3, where the choke in
parallel adds a little more. A coil resistance above
R_th ≈ 4.5–4.8 Ω, or an arc current above about 12 A, and the silent arc stays
silent. The tests hold the engine to the analysis: its growth rate within 3 %
and its starting frequency within 2 cents (measured: within 0.11 % and
0.07 cent), and the threshold within ±3 % in R.

The ceiling of §4 is where the keyboard falls silent. With the default column
every key up to C8 sings (the analysis puts the limit at 4.7 kHz), but the
negative resistance thins as the ceiling nears: σ is 84 s⁻¹ at C7 and 18 s⁻¹
at C8, which takes half a second to speak. With τ = 150 µs the ceiling falls
to 843 Hz, and the keys from A5 up stay silent.

### 7. Large signal: the first kind, and the second

Ayrton's hyperbola alone cannot hold a sinusoidal swing. Its slope steepens
towards zero current, so the further the current swings down, the more
negative the arc looks, and a growing oscillation runs on until the current
reaches zero and the arc goes out. The describing function (the fundamental of
the arc's voltage for a sinusoidal current) shows it, and the tests check it:
its real part grows more negative with every step in swing, up to 90 % of the
direct current. Integrated in time without a floor, the arc goes out for
good.

What holds a real arc is the carbons. They are white hot (the crater on the
positive carbon most of all) and keep the gas between them conducting when
the column collapses. The model gives the column a floor: its conductance is
never less than that of a thermal current X_m, so the static curve peaks at a
**re-strike voltage** U_r = A + B/X_m and is ohmic below X_m. U_r is set as a
multiple of the burning voltage (default 1.25: 74 V, with X_m = 1.48 A at
3 A). As the swing reaches the floor the arc stops paying in energy and the
amplitude settles: the current swings between about 0.8 A and 5.5 A and
never stops, which is what the literature calls oscillation of the first
kind. Raise the re-strike voltage and the floor sinks. At 1.6 × (95 V) the
current falls to 0.14 A each cycle. At 2.2 × (131 V) the column goes out every
cycle, the capacitor charges until the voltage reaches U_r, and the arc
re-strikes with a jolt: the second kind, buzzing, the regime Poulsen's arc
ran in. The tests check both: the first kind's current stays above 15 % of
the direct current, and the second kind's falls below 5 % and re-strikes
within 5 % of U_r.

Because the hyperbola is subcritical, the arc is bistable near its threshold.
Raised past the threshold current (about 12 A on the defaults) while it
sings, it keeps singing up to about 17 A, where it folds; started there, it
stays silent. The tests check both sides at 1.12 × the threshold.

### 8. The keyboard

Each key's capacitor is cut so that its *sounding* note lands on the key.
The model integrates the circuit to its steady cycle with the engine's
scheme, measures the frequency, corrects the capacitance (C ∝ 1/f², then,
where the deep bass still rings round the note after five steps, a secant on
ln C against ln f) and repeats until it is within 0.1 cent. At the defaults
that is 860 µF for A0 (Kelvin's formula would give 1675 µF), 66.4 µF for C3
(74.0), 17.7 µF for C4 (18.5), 4.51 µF for C5 (4.63), 1.13 µF for C6 (1.16)
and 0.071 µF for C8 (0.072): microfarads on a 20 mH coil. Cut by Kelvin's
formula instead (a preset), the notes sound flat: 1.0 % at C6, 1.3 % at C5,
2.2 % at C4, 5.7 % at C3 and more than a third at A0. The bass is flatter
because there the current is furthest from a sine. The engine's own time step
flattens a note as the trapezoidal rule does (2.6 cents at C8 at 48 kHz), so
it scales each capacitor by the difference between its step and the cutting
integration's. The tests find every key within 1 cent of its note (measured:
0.4 cent at worst, in the deep bass), and the steady-cycle integration agrees
with a fourth-order Runge–Kutta solution to 0.1 cent.

**One arc.** As on Duddell's keyboard, every key switches its capacitor across
the same coil. Hold two and their capacitors are in parallel: C adds, and the
arc sings one lower note, below both (C4 and E4 together sound about 203 Hz).
That is physics, not last-note priority; the tests check the pitch against
the steady cycle with the summed capacitance.

**Several arcs.** A bench of 2–6 lamps, each with its own coil, capacitors and
rheostat, panned across the stereo field. A key goes to the lamp that already
has it (a re-press makes no second voice), else to a silent lamp (the one
released longest ago), else to one still ringing down. When all are held, it
takes the lamp whose note has sounded longest, but only one that has sounded
for at least 40 ms. The stolen note fades as its contact opens, and the new
capacitor goes in 14 ms later, once the old note has gone. If every lamp has
only just started, the new note is dropped rather than cutting one off.

**Keys and contacts.** A resting capacitor is held at the arc's voltage
through a 2 kΩ leak (the key's back contact). So a key switches it in
without a jolt, and the note grows out of the arc's own flicker at the linear
rate, reaching half its final level in about 90 ms on every key. The contact
closes in about half a millisecond. On release the contacts part and a small
spark absorbs the coil's energy, its resistance growing with their
separation by 4 Ω a millisecond, and the note fades by 40 dB in 8–11 ms,
without a click: the coil's current and the arc's cannot jump. Once the spark
reaches 50 Ω it goes out at the next zero of its current, as an AC spark
does, so the released capacitor leaves the circuit before the next note.
Velocity has no physical meaning on this keyboard and is ignored.

### 9. Hissing

Above a certain current a carbon arc hisses. Ayrton (1899) traced the hiss to
air reaching the crater above a "hissing current", which depends on the
arc's length. The model's hissing current grows with the gap,
I_h = 2.5 A + 1.5 A/mm × l (7 A at 3 mm; the law and its numbers are the
model's choice). Above it the column's conductance is shaken by noise,
low-passed at 4 kHz, whose rms rises smoothly to 0.8 % (× the Hissing knob)
at 1.25 I_h. Below it a quiet arc keeps only a faint flicker (6·10⁻⁵ rms),
about 80 dB under full scale, which seeds every note. Between 7 and 12 A the
default arc sings and hisses at once; a note held while the current rises
keeps singing to about 17 A, and above that the arc only hisses.

### 10. The sound: the arc is the loudspeaker

The column takes in heat at the electrical power P = u·i. With a falling
characteristic that is not ∝ i²: for a slow swing P ≈ A·i + B, and only for a
fast one does it approach 2u·δi. The gas expands at constant pressure by
dV/dt = P/(ρ c_p T), and a small source of volume velocity q radiates
p = ρ q̇/(4πr). Together:

  p(r, t) = (γ − 1)/(4π c² r) · dP/dt

which is the thermophone's law (Arnold & Crandall 1917), as used for plasma
loudspeakers (Béquin et al. 2007). Drouet & Nadeau (1979) measured arc
faults' pressure following the rate of change of arc power. The tests check
that (γ − 1)/c² = 1/(c_p T) for air and that the engine's output is exactly
this pressure of its own power. Only the changing part of the power sounds.
The output is the pressure in pascals at the listening distance (default
1 m), so 1.0 is 94 dB SPL. A default note peaks at 0.05 Pa (A0) to 0.76 Pa
(C8), 67–92 dB SPL (0.06 Pa at C3, 0.26 Pa at C6). The level rises up the
keyboard because dP/dt grows with frequency at a given swing.

### 11. The talking arc

Simon (1898) found that microphone currents fed into an arc make it speak.
Here the "Talking arc" setting replaces the keyboard's capacitors with a
transformer: its secondary (0.5 mH, 6 Ω) and a 100 µF blocking condenser
across the arc, with the microphone's EMF in series. The page has no audio
input, so the microphone hears a synthesised singer: a Rosenberg glottal pulse
through three formant resonators gliding round the vowels a–e–i–o–u (the men's
averages of Peterson & Barney 1952). The keys set the singer's note. The arc
turns the current into sound by the same dP/dt. The transformer branch is
tuned to 712 Hz and rings with less loss than its 6 Ω, because the arc's
negative resistance (−4.8 Ω at 3 A) regenerates it. Turn the arc current down below
about 2.7 A and the arc's negative resistance exceeds the branch's loss: the
talking arc howls on its own.

### 12. The engine

- **Implicit, oversampled.** The circuit is stiff: a 0.5 H choke, a 20 mH
  coil, and a column that can cool in a few microseconds. It is stepped at
  4× the sample rate (2× above 50 kHz). The coils and capacitors use the
  trapezoidal rule, which keeps the LC resonance within a fraction of a cent
  at that rate. The column uses the θ-method: trapezoidal, or exactly as damped
  as it must be when τ is shorter than the step. Each step the linear circuit
  is reduced to a Norton source seen by the arc, i = J − G_N·u, and the
  column's thermal current is found by Newton's method (two or three
  iterations). The model's own steady-cycle integration uses the same scheme,
  and the engine agrees with a Runge–Kutta reference to 0.02 cent.
- **Smoothing.** Every knob glides over 30 ms, sample by sample, and
  everything that follows from it (A, B, R_b, X_m, τ, L, R, the pressure
  gain) is recomputed every sample.
- **Output.** The pressure, ∝ dP/dt at the oversampled rate, is brought back
  to the sample rate through a 64-tap Kaiser-windowed low-pass.
- **Cost.** One arc takes about 4 % of one core at 48 kHz in Node on the
  machine this was built on, and six singing arcs about 19 %. Nothing is
  allocated in `process()`: each arc's switch and bank arrays are made
  once.
- **The capacitors.** The page cuts every key's capacitor in the background
  (about 6 ms a key) and sends the table to the engine with each note, so the
  audio thread never cuts one. Until it is cut, a quick table for the
  starting note serves, and while a knob moves the old bank stays, as a real
  one would.
- **Randomness** (flicker, hiss, the singer's breath) is seeded.
- **In C++**: the engine and the model are C++, built as WebAssembly for
  this page (the views and the page's capacitor bank use the same model) and
  as plugins (CLAP, VST3, AU and a standalone app), where CC64 latches the
  keys (Hold) and the mod wheel raises the arc current. A plugin cuts every
  key's capacitor on a worker thread as soon as a knob it depends on
  settles, and until a key's is ready it plays that key's last one, or
  Kelvin's if it never had one. Six singing lamps take about 20 % of a core:
  the circuit's Newton steps at four times the sample rate.

## What to listen for

`examples/arc/` (regenerate with `node tools/render-arc.mjs`):

1. **01-god-save-the-queen-on-one-arc**: the first phrase of the tune Duddell
   played at the Institution of Electrical Engineers in 1900, on one arc. Each
   note grows out of the arc's flicker in about 90 ms.
2. **02-arc-current-raised-singing-then-hissing**: E4 held while the rheostat
   lets more current through, 1.6 to 20 A. The falling curve flattens, and the
   arc starts to hiss at 7 A. A silent arc could not start above 12 A, but this
   one is singing and holds on to the top of the range, where it dies and
   leaves only the hiss.
3. **03-two-keys-on-one-arc-capacitors-in-parallel**: C5, then E5 added: the
   capacitors add and the arc sings one note below both. E5 is let go, C5
   returns, and the same again from G4 with D5.
4. **04-small-coil-then-big-coil**: an arpeggio on a 4 mH coil with big
   capacitors (fast, bright, and 23 % below Kelvin's formula before the
   capacitors are cut for it), then on an 80 mH coil with small ones (each
   note takes four times as long to grow, and sounds purer).
5. **05-a-slow-column-cannot-sing-the-top-notes**: a scale from G4 to C6 on
   the default column (τ = 26 µs), then on a slow one (150 µs), whose ceiling
   is 843 Hz: G5 barely speaks, and A5, B5 and C6 stay silent.
6. **06-first-kind-then-second-kind**: C4 and G4 with the current never
   stopping (re-strike voltage 1.25 × the burning voltage), then at 2.2 ×:
   the column goes out every cycle and re-strikes at 131 V, and the note
   buzzes.
7. **07-six-arcs-in-chords**: six lamps, a key each, playing a cadence.
8. **08-the-talking-arc**: Simon's talking arc. A singer at the microphone,
   coupled into the arc through a transformer, and the arc sings the vowels
   back.

On the page, the **V–I plane** shows Ayrton's curve, the model's static
curve with its floor (the shaded strip where the column has collapsed), the
supply's load line, the hissing current, and the operating point running
round its loop live. **The arc** shows the column between the carbons,
strobed to about a cycle a second: its glow follows the power and its width
the heat it holds. **Duddell's circuit** lights the switched capacitors,
moves the supply's steady current and the musical branch's swing, and lists
the analysis for the last key: its capacitor, the starting note and growth
rate, the thresholds and the ceiling. The **Spectrum** marks Kelvin's formula
for the key's capacitor and the note.

## Files

```
arc/index.html, style.css           page
arc/src/arc-model.js                constants, Ayrton's and Kelvin's formulas, the thermophone, and the checks the
                                    tests hold the C++ to: Z(jω) in closed form, Mayr's law linearised, integrated
                                    over a cycle (the describing function) and as the circuit's state matrix
arc/src/arc-params.js               parameters and presets
arc/src/arc-main.js                 page wiring, the capacitor bank and the views
arc/src/arc-wasm.js                 the engine and model as WebAssembly (arc/wasm/arc.wasm)
native/instruments/arc/             the physics in C++: model, singer, engine, generated tables, reference (plugins and WebAssembly)
test/arc-tests.mjs                  node test/arc-tests.mjs (30 tests, about 6 s)
tools/render-arc.mjs                node tools/render-arc.mjs → examples/arc/
```

## Simplifications

- **Ayrton's constants** are the commonly quoted ones for one size of solid
  carbon, not checked against her book. One curve serves every current and
  gap, whereas Ayrton found the voltage settling only as the carbons wore to
  shape.
- **One thermal time constant.** A real column's τ grows with its size and
  current, and the carbons' own slow heating is left out. The floor of §7,
  standing for the white-hot carbons, is the model's: a smooth limit on the
  column's thermal current, not a model of thermionic emission. The arc
  conducts both ways alike, whereas a real one would prefer its crater as
  anode; in the second kind a small reverse current flows.
- **The hiss** is conductance noise above a hissing current whose law is the
  model's. Ayrton's curve is kept above it, although a hissing arc burns
  differently.
- **The thermophone** is a point source with no directivity and no
  low-frequency limit from heat conduction. The sound does not act back on the
  arc.
- **The circuit's parts are ideal:** no condenser leakage or dielectric loss,
  a coil with a fixed resistance (no skin effect, no self-capacitance), and
  contacts whose closing and opening laws are the model's. The spark at an
  opening contact absorbs energy but makes no sound of its own.
- **The capacitors** are cut for the settings at the moment a key is
  pressed; a real bank is fixed. A held note keeps its capacitor, so moving a
  knob shifts its pitch as it would on the real arc, but the next note is in
  tune again.
- **Several arcs** do not interact. Lamps on one real supply would.
- **The talking arc** hears a synthesised singer, not a microphone. Its
  transformer is an EMF with a series resistance and inductance, with no
  carbon-microphone nonlinearity.

## Quality

The Quality setting (in the controls, for phones and older computers) changes
nothing here: Medium and Low play exactly as High. Each lamp is one circuit
that has to be stepped finely for its arc to sing at all, the number of lamps
is yours to set (Number of arcs), and six of them cost little.

## Prior art and references

**History and invention.**
- W. Thomson (1853). "On transient electric currents." *Phil. Mag.* (4) 5(34),
  393–405. [doi:10.1080/14786445308647279](https://doi.org/10.1080/14786445308647279).
  The oscillatory discharge of a condenser through a coil, and its frequency:
  "Kelvin's formula".
- E. Thomson (1893). "Method of and means for producing alternating
  currents." US Patent 500,630.
  [Google Patents](https://patents.google.com/patent/US500630A). A
  condenser and coil across a direct-current discharge gap; Duddell
  credits Thomson's 1892 experiments.
- H. Th. Simon (1898). "Akustische Erscheinungen am electrischen
  Flammenbogen." *Ann. Phys.* 300(2), 233–239.
  [doi:10.1002/andp.18983000204](https://doi.org/10.1002/andp.18983000204).
  The "talking arc": microphone currents fed into an arc make it
  reproduce speech.
- H. Ayrton (1899). "The hissing of the electric arc." *J. IEE* 28(140),
  400–436. [doi:10.1049/jiee-1.1899.0020](https://doi.org/10.1049/jiee-1.1899.0020).
- W. Duddell (1901). "On rapid variations in the current through the
  direct-current arc." *J. IEE* 30(148), 232–267 (read 13 December 1900).
  [doi:10.1049/jiee-1.1901.0007](https://doi.org/10.1049/jiee-1.1901.0007).
  The singing arc, played at the meeting from a keyboard that switched
  capacitors (Appendix III).
- Anon. (1900). "Some experiments on the direct-current arc." *Nature*
  63(1625), 182–183. [doi:10.1038/063182a0](https://doi.org/10.1038/063182a0).
  Report of Duddell's demonstration.
- H. Ayrton (1902). *The Electric Arc*. The Electrician Printing and
  Publishing Co., London.
  [archive.org](https://archive.org/details/electricarc00ayrtrich). The
  equation for the voltage of arcs between solid carbons (chapter VI), and
  hissing arcs (chapter X).
- V. Poulsen (1905). "Method of producing alternating currents with a
  high number of vibrations." US Patent 789,449.
  [Google Patents](https://patents.google.com/patent/US789449A). The arc
  converter for radio.
- E. Ruhmer (1908). *Wireless Telephony in Theory and Practice*. Trans.
  J. Erskine-Murray. D. Van Nostrand, New York.
  [archive.org](https://archive.org/details/wirelesstelephon00ruhmrich).
  The speaking arc and arc telephony.
- R. Wittje (2013). "The electrical imagination: sound analogies,
  equivalent circuits, and the rise of electroacoustics, 1863–1939."
  *Osiris* 28(1), 40–63. [doi:10.1086/671362](https://doi.org/10.1086/671362).

**The physics.**
- A. Blondel (1906). "Sur les phénomènes de l'arc chantant." *J. Phys.
  Théor. Appl.* 5(1), 77–97.
  [doi:10.1051/jphystap:01906005007700](https://doi.org/10.1051/jphystap:01906005007700).
- G. W. Nasmyth (1908). "The frequency of the singing arc." *Phys. Rev.
  (Ser. I)* 27(2), 117–140.
  [doi:10.1103/PhysRevSeriesI.27.117](https://doi.org/10.1103/PhysRevSeriesI.27.117).
- H. D. Arnold & I. B. Crandall (1917). "The thermophone as a precision
  source of sound." *Phys. Rev.* 10(1), 22–38.
  [doi:10.1103/PhysRev.10.22](https://doi.org/10.1103/PhysRev.10.22).
- A. M. Cassie (1939). "Arc rupture and circuit severity: a new theory."
  CIGRE Report 102, Paris (no DOI; title as cited by later arc-model papers).
  The arc with a constant-voltage characteristic and a thermal time constant.
- O. Mayr (1943). "Beiträge zur Theorie des statischen und des
  dynamischen Lichtbogens." *Archiv für Elektrotechnik* 37(12), 588–608.
  [doi:10.1007/BF02084317](https://doi.org/10.1007/BF02084317). The
  energy-balance arc model used here, with its loss chosen to give Ayrton's
  curve.
- L. O. Chua & S. M. Kang (1976). "Memristive devices and systems."
  *Proc. IEEE* 64(2), 209–223.
  [doi:10.1109/PROC.1976.10092](https://doi.org/10.1109/PROC.1976.10092).
- M. G. Drouet & F. Nadeau (1979). "Pressure waves due to arcing faults in
  a substation." *IEEE Trans. Power Appar. Syst.* PAS-98(5), 1632–1635.
  [doi:10.1109/TPAS.1979.319480](https://doi.org/10.1109/TPAS.1979.319480).
  Measured sound pressure following the rate of change of arc power.
- Ph. Béquin, K. Castor, Ph. Herzog & V. Montembault (2007). "Modeling
  plasma loudspeakers." *J. Acoust. Soc. Am.* 121(4), 1960–1970.
  [doi:10.1121/1.2697201](https://doi.org/10.1121/1.2697201).
- J.-M. Ginoux & B. Rossetto (2013). "The singing arc: the oldest
  memristor?" In A. Adamatzky & G. Chen (eds), *Chaos, CNN, Memristors
  and Beyond*, World Scientific, 494–507.
  [doi:10.1142/9789814434805_0040](https://doi.org/10.1142/9789814434805_0040).
- J.-M. Ginoux (2017). "From the series-dynamo machine to the singing arc:
  Gérard-Lescuyer, Blondel, Poincaré." In *History of Nonlinear
  Oscillations Theory in France (1880–1940)*, Springer, 3–37.
  [doi:10.1007/978-3-319-55239-2_1](https://doi.org/10.1007/978-3-319-55239-2_1).
- W. Marszalek (2016). "Memristive fingerprints of electric arcs." arXiv
  preprint. [arXiv:1601.01612](https://arxiv.org/abs/1601.01612). A hybrid
  Cassie–Mayr arc as a memristive system: a pinched V–I loop that tends to a
  single resistor-like line as the frequency rises.

**The talking arc's singer.**
- G. E. Peterson & H. L. Barney (1952). "Control methods used in a study of
  the vowels." *J. Acoust. Soc. Am.* 24(2), 175–184.
  [doi:10.1121/1.1906875](https://doi.org/10.1121/1.1906875). The vowels'
  formant frequencies.
- A. E. Rosenberg (1971). "Effect of glottal pulse shape on the quality of
  natural vowels." *J. Acoust. Soc. Am.* 49, 583–590 (DOI not confirmed).
  The glottal pulse used for the singer.

**Earlier models and synthesis projects.**
- W. Duddell (1913). "A water model of the musical electric arc." *Proc.
  Phys. Soc. Lond.* 26(1), 117.
  [doi:10.1088/1478-7814/26/1/311](https://doi.org/10.1088/1478-7814/26/1/311).
  Duddell's own hydraulic analogue of the musical arc.
- Max Kohl AG (c. 1911): singing- and speaking-arc teaching apparatus in
  the firm's *Physical Apparatus* price list No. 50, reproduced in Wittje
  (2013), fig. 5. Commercial demonstration sets.
- [Speaking arc and singing arc](https://www.youtube.com/watch?v=cCEU3ShVE2E)
  (Fondazione Scienza e Tecnica, Florence, 2016): a microphone-modulated
  speaking arc, and an arc oscillator retuned with a variable capacitor.
- S. Klein (1956). "Electrical transducer." US Patent 2,768,246.
  [Google Patents](https://patents.google.com/patent/US2768246A). The
  Ionophone, an audio-modulated corona-discharge loudspeaker, later sold
  as the Ionovac.
- [Ionophone and Ionovac history](http://www.roger-russell.com/ionovac/ionovac.htm)
  (R. Russell, 1996–2004): Klein's Ionophone, the DuKane and Electro-Voice
  Ionovac, the Fane Ionofane and the Hill plasma loudspeaker.
- F. J. Fransson & E. V. Jansson (1975). "STL-Ionophone: transducer
  properties and construction." *J. Acoust. Soc. Am.* 58(4), 910–915.
  [doi:10.1121/1.380743](https://doi.org/10.1121/1.380743). A glow
  discharge in air with superimposed AC used as a laboratory sound
  source.
- A. E. Hill (1980). "Sound production using large volume plasmas." US
  Patent 4,219,705. [Google Patents](https://patents.google.com/patent/US4219705A).
- [CORONA plasma tweeter](https://www.lansche-audio.com/products/plasmatweeter/)
  (Lansche Audio): the music signal modulates a small high-voltage plasma.
- [Acapella Audio Arts](https://www.acapella.de/): loudspeaker maker
  whose ion tweeter drives the air with a modulated plasma.
- [ArcAttack](https://arcattack.com/): performance group playing music on
  modulated Tesla-coil discharges.
