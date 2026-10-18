# Viola Organista

Leonardo da Vinci's bowed keyboard, sketched in his notebooks of c. 1488–89
(the Codex Atlanticus among them), as built by Sławomir Zubrzycki and first
played by him in Kraków in 2013. Bowed keyboards were built long before, from
Hans Haiden's Geigenwerk of c. 1575 to Akio Obuchi's of the 1990s (see
[Prior art](#prior-art-and-references)). Pressing a key
pulls a steel string down onto a wheel that is already turning. The wheel is
wrapped in rosined horsehair and driven by a treadle, so the key does not
strike or pluck the string: it bows it, for as long as you hold it. Every note
here is the stick–slip friction of a wheel on a string, solved sample by
sample: its whispery or crunchy failures, its slow or clean attacks, its pitch
that sags as you press harder. None of that is in a sample, because none of it
is the same twice.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/bowed/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (49 keys, C2–C6); a held key keeps bowing |
| `←` `→` | octave |
| `↑` `↓` | key pressure (bow force) |
| hold `Space` | hold: keys stay down (the string stays on the wheel) |
| MIDI | notes and velocity; **aftertouch** (channel or polyphonic) presses harder; **mod wheel = treadle** (wheel speed: rest = 25 cm/s, full = 1 m/s); CC64 = hold |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: presses the key harder (more bow force) |

The mod wheel is the treadle, the real instrument's swell: Helmholtz amplitude
is proportional to the wheel speed, so a held note grows 9–12 dB as the wheel
goes up (through the flywheel, over about half a second) and stays in
Helmholtz motion. Speed also raises Schelleng's force limits, so a note
*started* with the wheel above about 60 cm/s and a normal touch begins in
surface sound in the lower two octaves: press harder (aftertouch or ↑), as a
player pumping the treadle does.

Space is *hold*, not a damper pedal. A bowed note lasts only while its string
is on the wheel, so the useful pedal keeps keys down. Letting released strings
ring is a separate switch (*Dampers lifted*).

## The physics

**The instrument.** Zubrzycki's instrument has 61 steel strings over a spruce
soundboard in a case shaped like a baby grand. Four wheels wrapped in horsehair
turn on a crankshaft that the player pumps with a pedal, and each key presses
its string against a wheel. This model has 49 keys (C2–C6) and four wheels,
one per register (C2–B2, C3–B3, C4–D5, E♭5–C6). Each wheel touches its strings
at one fraction β of their length from the bridge, and the voicing of the
registers (below) gives the upper wheels more surface speed and the treble
wheel a smaller β.

**Strings** (`bowed-model.cpp: stringDesign`). The scale is harpsichord-like:
C5 is 36 cm, and lengths double every 1.25 octaves going down (foreshortened to
1.9 m at C2). Tension runs from 130 N in the bass to 95 N in the treble.
Mersenne's law, f₀ = c/2L with c = √(T/μ), then gives the mass per length.
Strings below C4 are wound.

| key | length | tension | Z₀ = √(Tμ) | wave speed | stress | inharmonicity B | free-string T60 |
|---|---|---|---|---|---|---|---|
| C2 | 1.90 m | 130 N | 0.52 kg/s | 249 m/s | 0.49 GPa | 2.4·10⁻⁵ | 7.7 s |
| C3 | 1.09 m | 121 N | 0.42 kg/s | 287 m/s | 0.65 GPa | 3.8·10⁻⁵ | 5.4 s |
| C4 | 0.63 m | 113 N | 0.34 kg/s | 330 m/s | 0.85 GPa | 6.2·10⁻⁵ | 3.9 s |
| C5 | 0.36 m | 104 N | 0.27 kg/s | 379 m/s | 1.13 GPa | 9.9·10⁻⁵ | 2.4 s |
| C6 | 0.21 m | 95 N | 0.22 kg/s | 441 m/s | 1.53 GPa | 1.5·10⁻⁴ | 1.3 s |

Stress in a wire depends only on its wave speed (σ = ρc²), so the treble runs
at 64 % of music wire's strength whatever its gauge. The heavy treble keeps
Z₀, and with it the treble's loudness, up. Stiffness is left out: B ≤ 1.5·10⁻⁴
puts the 10th partial of the *free* string at most 13 ¢ sharp, and Helmholtz
motion locks the partials into exact harmonics anyway.

**The string as a waveguide** (`bowed-string.cpp`). Velocity waves travel in delay
lines: bridge → wheel → bridge (2·D_b samples) and wheel → nut → wheel (2·D_n).
The string's own losses (air and internal friction) are distributed, so each
round trip gets a one-pole low-pass for its share of the travel time. The
target decay rate is σ(f) = 0.35 + 1.4·(f/kHz)² s⁻¹, raised up to 7× at high
frequency for the wound bass, where the winding rubs on the core. The filter's
gain at DC is capped just below 1, so the loop stays passive for any setting;
a trip so short that its own loss is already below that margin (the bridge
side, with the wheel near the bridge and low losses) gets a flat gain instead
(tested on all 49 keys at every combination of the β, loss and mobility
extremes, at 44.1, 48 and 96 kHz). The nut reflects with −1. Every string ends
on one shared bridge. Should a string ever go non-finite, the engine stops
that string alone before its wave reaches the bridge, and the others play on
(tested).

**Torsion.** The wheel grips the string's *surface*, which also moves when the
string rolls. Torsional waves travel at c_t = √(G/ρ) = 3180 m/s whatever the
tension, and a solid wire's torsional impedance, seen at its surface, is
ρI_p c_t/r² = μc_t/2 (3.6–6.4 × Z₀ here). A second waveguide pair carries them,
with Q = 40 for the fundamental torsional mode (836 Hz at C2, 7.7 kHz at C6).
Woodhouse & Loach measured Q of that order on cello strings. Friction drives
both waveguides, with admittances 1/(2Z₀) and 1/(2Z_t).

*The torsional echo.* Each slip also twists the string. The transverse corner
returns from the bridge after 2βL/c, the twist from the nut after
2(1 − β)L/c_t, and the two coincide at β* = c/(c + c_t): 0.073 at C2, 0.10 at
C4, 0.121 at C6. Just below β* the returning twist meets the end of the slip,
the next capture comes late, and the bowed note runs 15–35 ¢ flatter than a
little to either side. On F4 the flattening dips from −9 ¢ to −28 ¢ at
β = 0.092 (β* = 0.099), and without torsion the dip is gone (tested). The
treble wheel is set to keep its strings clear of it (below).

**Friction.** The friction curve is the hyperbolic fit to steady sliding of
rosin,

  μ(Δv) = μd + (μs − μd)·v₀/(v₀ + |Δv|),  μs = 0.8, μd = 0.3, v₀ = 0.1 m/s.

The junction is solved implicitly every sample. If the friction force were
zero, the string under the wheel would move at v_h; the string's admittance
there is Y = 1/(2Z₀) + 1/(2Z_t). Sticking needs a force −(v_h − v_B)/Y, which
the wheel can supply up to μs·F_N. While slipping, the force sits on the curve,
and a quadratic gives the sliding speed. The curve folds back on itself, so
there can be several solutions. The model then keeps the state it is in: it
stays stuck while it can, and keeps slipping while its branch exists. This is
the hysteresis of McIntyre, Schumacher & Woodhouse (1983).

Two refinements make the friction less idealised:

* **Rosin lag** (default 20 µs). Real rosin's grip is set by the temperature
  of the contact (Smith & Woodhouse 2000), and friction lags the sliding speed
  (Hess & Soom 1990). So μ follows a lagged sliding speed ũ, with
  dũ/dt = (|Δv| − ũ)/τ. Steady sliding still gives the curve above, but μ
  cannot change faster than τ, and the junction becomes linear: stick if
  |v_h − v_B| ≤ Y·μ(ũ)·F_N. With the classic curve (τ = 0, a preset), the slope
  of the curve is a broadband negative resistance whenever the string slides
  slowly. In the bass it is as large as 2Z₀, and attacks become chaotic for
  hundreds of milliseconds. The lag tames this above ~5 kHz.
* **Rosin grain** (0.5 %). Band-limited noise on μ, the uneven grip of hair and
  rosin. You hear it as bow noise. It also knocks the string out of stray
  slipping patterns.

**Helmholtz motion.** A corner runs round the string once per period. Under
the wheel the string sticks, moving at v_B for 1 − β of the period, and slips
back at −v_B(1 − β)/β for the rest (Helmholtz 1863; Raman 1918). The force on
the bridge is a sawtooth of peak-to-peak 2Z₀v_B/β with harmonics falling as 1/n.
So the loudness is set by the wheel speed and position, not by the key. The
tests check all of this on a string bowed alone: stick fraction and slip speed
within 4 % and 15 %, harmonics 2–6 within 2.5 dB of 1/n, and amplitude ∝ v_B/β.

**Schelleng's bounds.** Helmholtz motion survives only for
F_min < F_N < F_max (Schelleng 1973). In the form of Schoonderwaldt, Guettler
& Askenfelt (2008), with the friction curve's v₀ included:

  F_max = 2Z₀(v_B + βv₀) / ((μs − μd)β),  F_min = Z₀²(v_B + βv₀) / (2R(μs − μd)β²),

where R = 2Z₀f₀/σ₁ is the bridge resistance that would give the string's
actual decay. Above F_max the wheel cannot let go on time and the motion turns
raucous. Below F_min the string cannot stay stuck through the ripples of its
own losses and slips twice or more per period: Schelleng's *surface sound*.
Measured the way Schoonderwaldt et al. did it (establish Helmholtz motion,
then sweep the force slowly):

| case (default wheels) | F_min model → measured | F_max model → measured |
|---|---|---|
| C3, β = 0.12, v_B = 25 cm/s | 37 → 61 mN (× 1.6) | 3.69 → 2.88 N (× 0.78) |
| C4, β = 0.12, v_B = 27.5 cm/s | 23 → 35 mN (× 1.6) | 3.26 → 2.77 N (× 0.85) |
| C5, β = 0.12, v_B = 27.5 cm/s | 15 → 16 mN (× 1.1) | 2.62 → 2.82 N (× 1.08) |
| C6, β = 0.09, v_B = 40 cm/s | 28 → 7.6 mN (× 0.3) | 3.95 → 3.62 N (× 0.92) |
| C4, β = 0.06 | 90 → 110 mN (× 1.2) | 6.39 → 5.05 N (× 0.79) |
| C4, β = 0.24 | 6.0 → 8.5 mN (× 1.4) | 1.70 → 1.10 N (× 0.65) |
| C4, v_B = 55 cm/s | 45 → 64 mN (× 1.4) | 6.39 → 5.24 N (× 0.82) |
| C4, v_B = 14 cm/s | 12 → 21 mN (× 1.7) | 1.70 → 1.64 N (× 0.96) |

The upper bound holds well, with slope −1 in β (tested). The lower bound has
slope ≈ −2 in β (tested), but comes out 1.2–1.7× Schelleng's value below C5. His
derivation assumes a lossless string on a resistive bridge (Raman's model).
The rounded corner of a lossy string adds a friction-force ripple that
triggers premature slips earlier, which is how Schoonderwaldt et al. explain
the same discrepancy in their measurements. They also found the measured F_min
nearly independent of v_B. Here it still scales as v_B^0.8, closer to
Schelleng than to their violin.

**Attacks.** The wheel is already turning when the key brings the string to
it, so every note starts the way a violinist plays "from the air": full bow
speed, force rising from zero. Guettler (2002) showed that the first few
periods decide whether a regular Helmholtz motion forms, a prolonged one
(raucous, delayed slips), or multiple slipping (premature slips). For a
constant bow speed and a sudden force, the window for a perfect start is
narrow. Here the key's speed sets how fast the force rises (key travel time
× 1/velocity), and the physics does the rest. Time to settle into Helmholtz
motion (15 regular periods in a row) at default settings:

| key (period) | hard key, 8 ms | normal, 11 ms | soft, 16 ms | lazy, 54 ms | very lazy, 200 ms |
|---|---|---|---|---|---|
| C2 (15 ms) | 153 ms | 183 ms | 242 ms | 255 ms | 361 ms |
| C3 (7.6 ms) | 107 | 128 | 247 | 578 | 250 |
| C4 (3.8 ms) | 100 | 78 | 151 | 129 | 224 |
| C5 (1.9 ms) | 50 | 33 | 51 | 54 | 152 |
| C6 (0.95 ms) | 42 | 39 | 57 | 69 | 164 |

The *Attack map* view computes this live, for the key you play and the knobs
you set, over every rise time and final force (a Guettler diagram for a
wheel). It is not smooth. Bowed-string transients are notoriously sensitive,
and the map has islands. One hazard is real: a few patterns with two slips per
period, including a near-symmetric "octave" pattern, are stable almost
everywhere Helmholtz motion is. A string that falls into one keeps whistling,
just as a violin E string can. About 1 note in 100 whistles: 2 of 294 in a
sweep of every key at six velocities at 48 kHz (F3 at 0.45, B♭3 at 0.6), 1 of
294 at 44.1 kHz; over 2940 notes (12 velocities, five rosin-grain seeds) the
rate is 1.1 %, mostly in the lower two octaves. Which notes whistle is
chaotic: at 48 kHz every key settles at the voiced touch, at 44.1 kHz G3 does
not. Press harder (aftertouch, or ↑) and it snaps into Helmholtz motion, then
stays there when you ease off: hysteresis. (A brief force overshoot at the end
of the key's travel, which a violinist uses to "catch" the string, was tried:
at up to twice the steady force for 30–100 ms it moved the rate between 0.8
and 1.2 %, within the scatter, and so it is not in the model. Freeing a
string once it whistles takes about F_max for a tenth of a second.)

**Voicing.** Each key is regulated so that a normal touch (velocity 0.7)
presses with half of Schelleng's maximum at its wheel's default speed. Below about
0.25 F_max a fresh note starts in surface sound; near 0.9 F_max the motion turns
raucous; in between, half way, the attacks settle most reliably.
Velocity changes the force only between 0.75× and 1.11×; mostly it changes how
fast the force rises. The voicing is a fixed table, as on the real instrument.
Change the wheel speed or position and the operating point moves around
Schelleng's diagram. The view shows it moving.

**The registers.** On one wheel at one β the keyboard is uneven: the steady
level spans 19 dB across the 49 keys, and the top octave sits about 7 dB
below the rest (its Z₀ is lower, and the board radiates its fundamentals
poorly, below coincidence). The four wheels voice it, as a builder would:

| wheel | keys | surface speed | β |
|---|---|---|---|
| 1 | C2–B2 | the treadle's, 25 cm/s | β (0.12) |
| 2 | C3–B3 | × 1 | β |
| 3 | C4–D5 | × 1.1 | β |
| 4 | E♭5–C6 | × 1.6 | 0.75 β |

Faster is louder at the same place on Schelleng's diagram (the voiced force
follows v_B). The treble wheel also sits nearer the bridge, both for level and
to keep its strings below the torsional echo (above; at one β = 0.12 the top
keys would sit on it, C6 bowed 33 ¢ flat). Moving β *up* to quieten a note
does not work: at the voiced force, a string bowed further from the bridge
starts in a two-slip whistle far more often (8 % of all touches at 1.15 β,
against 1 %). With the voicing, and with the strings loading the board (below),
the register medians agree within 1.8 dB and the 49 keys span 12.4 dB, 6.2 dB
from the 10th to the 90th percentile (steady RMS, tested). What is left are
the board's strong notes, whose fundamental sits on a plate mode: F2–F♯2
(mode (2,1), 90 Hz), C3, E♭4 ((1,3), 312 Hz) and F♯5–A♭5, 5–8 dB above their
neighbours, as strong notes are on any soundboard.

**Flattening, and tuning while bowing.** A bowed string sounds flat of its free
frequency, more so the harder it is pressed (McIntyre & Woodhouse 1979). The
slip comes late and the corner is rounded. Here, at the voiced touch, the flat
runs from 4.5 ¢ (C2) through 9 ¢ (C4) and 12 ¢ (C5) to 19 ¢ (C6). The rosin
lag adds to it, most at the top, where a slip lasts only about four lags. A
tuner tunes by ear while the instrument plays, so each free string is set that
much sharp (`tools/bowed-tuning.mjs`, which bows each string of the C++ build
alone and corrects its table; rebuild and run `--check`). The bowed notes are then within ±1 ¢ of
equal temperament at both 48 and 44.1 kHz (tested on all 49 keys from the
audio). The table belongs to the oversampling plan, which is fixed at 48 kHz
and kept at 44.1 kHz (choosing it from the rate put B3, C4, B4 and C5 2–3 ¢
sharp there). Consequences
you can hear: pressing harder lowers the pitch (tested), and a released string
rings sharp by its tuning offset (tested), most noticeably in the top octave
with the dampers lifted.

**Bridge and soundboard.** All strings end on one bridge. Its velocity is
V = G·(total string force), solved implicitly each sample for every sounding
string: V = 2GΣZ_k a_k / (1 + GΣZ), where a_k is the wave string k sends it.
G is the soundboard's point admittance, and for a plate it is real:
Y∞ = 1/(8√(ρh)(D_x D_y)^¼) (Cremer & Heckl). The board is 3 mm spruce,
1.3 × 0.65 m, with smeared ribs: D_x = 300 and D_y = 100 N·m, which gives
Y∞ = 8.5 mm/(N·s). The bridge damps each string by σ ≈ 2GZ₀f₀ and couples them
all. The same plate's modes (f₁₁ = 47 Hz, 0.036 modes/Hz, 77 below 2.4 kHz)
radiate the sound. Each mode is driven at eight points along the bridge and
heard by two microphones through the far-field radiation of a baffled,
simply supported plate (Wallace 1972). Odd–odd modes radiate as monopoles at
low frequency; the others hardly radiate until coincidence (1.6 kHz). Wallace's
weight is complex, w_r + i w_i per unit modal velocity, and its quadrature
part is taken from the mode's acceleration, −a/ω (equal to ω·q at resonance).
Taken from the displacement instead, it radiated the board's static sag under
the mean friction force: a DC offset of up to a fifth of the note's peak and a
sub-audio thump at every key-down and key-up. Now the mean is below 0.3 % of
the peak, and below 20 Hz the output stays within 5 % of it (tested: < 12 %).
The strings load the board in return. Seen from the bridge each string is a
dashpot of its wave impedance Z₀, so plate mode m loses σ = Σ Z₀,k φ_m(x_k)²/2M
to the 49 strings on top of the wood's π f η: 4.4 times the wood's loss for
(1,1) and roughly equal to it for the next few, which tames the board's
strongest resonances by 2–3.5 dB (tested against the sum). Above the
modelled modes the board is dense, so the bridge force radiates directly.
Its level matches the modes' mean (−45 dB per newton), and a one-pole at
4 kHz rolls it off for the bridge's mass. The tests check the plate model
against Weyl's mode count, the mean point conductance (= Y∞ within 15 %), and
Wallace's monopole limit.

**Dampers and sympathetic strings.** A released key lifts its string off the
wheel in 15 ms. Then a felt damper adds loss (T60 = 0.25 s), and the string
leaves the simulation once it is silent. With the dampers lifted, all 49
strings stay on the bridge and ring freely. Bow C3 and its octave C4 picks up
about 10× the energy it does when C♯3 is bowed. It would be more if the free
strings were not tuned sharp, which puts C4's resonance about 1 Hz off C3's
second harmonic.

**Sampling.** A slip lasts β of a period, only four samples at C6 at 48 kHz,
and it must be resolved. Without torsion and rosin lag, C6's measured minimum
force (at β = 0.12) is 0.2×, 0.8× and 1.3× Schelleng's value at 48, 96 and
192 kHz: it has not converged at the output rate. The bridge side of the
waveguide also needs a couple of samples, which limits how close to the bridge
the wheel can sit. So each string runs at 1×, 2× or 4× 48 kHz (C4 and below,
to C5, to C6), keeping at least ~180 samples per period. The plan is that of
48 kHz at every rate: at 44.1 kHz each string keeps its factor, at 96 kHz it
halves. Within one output sample the
other strings' pull on the bridge is held. Each string's own bridge reflection
stays exact, and its bridge force is low-passed (4th-order at 18 kHz) and
decimated.

**Cost.** Ten held notes take about 10 % of one core (measured in Node on an
Apple M2 Max). With the dampers lifted all 49 strings run, and it takes about
25 %. Damped, silent strings leave the loop, and a silent instrument costs
nothing.

## What to listen for

`examples/bowed/` (regenerate with `node tools/render-bowed.mjs`):

1. **Chorale in G.** Four voices over a falling bass, with a cadence. The
   treadle swells the bass wheels' speed from 20 to 30 cm/s into the phrase and eases
   off; louder comes from faster, since Helmholtz amplitude ∝ v_B. The player
   presses in proportion, which keeps every note in the same place on
   Schelleng's diagram. Listen for the bass taking a beat longer to speak.
2. **Force sweep on D3**, from ×0.03 to ×4 of the voiced touch. It starts as
   surface sound: two to four slips per period, the fundamental 10–20 dB below
   the upper harmonics, quiet and whistly. Then it snaps into Helmholtz motion,
   10 dB louder and full. At the end it turns raucous, a gritty, aperiodic
   crunch.
3. **Bow position** on G3: β = 0.06 (sul ponticello, louder and glassy),
   0.12, and 0.28 (sul tasto, soft and flutey). The force is scaled to stay
   inside each position's window.
4. **Wheel speed.** A chord while the treadle goes from 12 to 50 cm/s: louder
   and brighter as it speeds up. Then an uneven treadle, ±18 % at 0.7 strokes
   per second, which swells each note on every stroke.
5. **Attacks** on A2: a quick key (it settles within a few periods), a lazy
   key (a breathy, slipping start), and a key slammed down at 1.7 F_max (it
   never finds Helmholtz motion: raucous).
6. **Dampers**: a chord released with the dampers (it stops), then with the
   dampers lifted. It rings on, slightly sharp, and the other strings join in.

On the page, the views show the same physics live:

* **String on the wheel**: the string's shape, rebuilt from its travelling
  waves and sampled stroboscopically, 1/48 of a period later each frame. The
  Helmholtz corner sweeps round the dashed parabolas. There is a small
  permanent kink at the wheel, the static deflection from the mean friction
  force.
* **Schelleng diagram**: the two bounds for the key you play, and the live
  operating point, coloured by what the string is actually doing.
* **Velocity under the wheel**: stick at v_B, slip at −v_B(1−β)/β, and any extra
  slips.
* **Attack map**: the Guettler diagram, computed in the page.
* **Spectrum**.

**In C++**: the engine and model are C++, run as WebAssembly on this page and as
plugins (CLAP, VST3, AU and a standalone app), where the Space pedal is Hold
on CC64, the mod wheel drives the treadle (25 cm/s at rest, up to 1 m/s) and
aftertouch presses the keys harder. Bowed friction is chaotic: a difference
in the last bit of one number can grow into another attack. So the C++ takes
its sines, exponentials, logarithms and powers from fdlibm, as V8 computes
them, and draws the rosin's grain from the same seeded generator: the
WebAssembly plays what the JavaScript engine played to the last bit. The
string-alone tests and the tuning tool bow one string of the C++ by itself
(`bowed_string_*` in `bowed-web.cpp`). Ten strings take about 6 % of a core.

## Files

```
bowed/index.html, style.css           page
bowed/src/bowed-params.js             parameters, presets and the key range
bowed/src/bowed-tuning.js             tuning table (generated)
bowed/src/bowed-main.js               page wiring and views
bowed/src/bowed-wasm.js               the engine and model as WebAssembly (bowed/wasm/bowed.wasm; AudioWorklet and Node)
native/instruments/bowed/             the C++ port: model, string, engine, generated tables, reference (V8's math, fdlibm, is in native/core)
test/bowed-tests.mjs                  node test/bowed-tests.mjs
tools/bowed-tuning.mjs                node tools/bowed-tuning.mjs → bowed/src/bowed-tuning.js and its C++ copy (bows the WebAssembly; --check)
tools/render-bowed.mjs                node tools/render-bowed.mjs → examples/bowed/
```

## Simplifications

* **Four wheels, each with one β.** On the real instrument β also changes
  along each wheel's range, with the geometry of strings, bridge and wheels.
  Here each wheel meets all its strings at the same fraction of their length,
  and its speed and β are a voicing choice of mine (above), not measurements.
  The contact is a point: the wheel's width (Pitteroff & Woodhouse's finite
  bow width) and the hair's compliance are left out. The flywheel is a
  first-order lag on the treadle setting; pressing many keys does not slow it.
* **Friction.** The friction curve with a first-order lag stands in for
  Woodhouse's thermal model of rosin, which tracks the contact temperature
  through heat diffusion. The lag reproduces the curve in steady sliding and
  removes its unphysical instant response. It is not fitted to measurements,
  and it may exaggerate flattening at the top (19 ¢ at C6), where a slip lasts
  only about four lag times.
* **Strings.** No stiffness (B ≤ 1.5·10⁻⁴), so the free string is harmonic.
  The wound bass's extra loss is a simple factor, and its torsion uses the
  solid-wire formula. One polarisation: the string moves only along the wheel's
  surface, and the key's push toward the wheel does not change the tension.
* **Bridge.** The strings see the board's average (real) admittance. They do
  not see its modal peaks, so there are no wolf notes. The modes appear only in
  the radiated sound, damped by the wood and by the strings' load on the
  bridge. Their radiation damping, 30–50 % of the wood's loss below 1 kHz by
  Wallace's far field, is left out.
  The board is a rectangle with smeared ribs, not a
  harpsichord's bentside shape, and the eight drive points share the bridge.
* **Attacks are chaotic.** Bowed-string transients really are. One
  consequence is a small chance that a note locks into a two-slip whistle,
  about 1 % of touches, which ones depending on the sample rate. Pressing
  harder frees it.
* **Range and tuning.** 49 keys (C2–C6) rather than Zubrzycki's 61. The tuning
  table is computed at default settings. Changing the wheel, the friction or
  the string losses changes the flattening and so the pitch, as it would on the
  instrument.

## Prior art and references

Everything above stands on earlier work: the instrument is Leonardo's and its
builders', the physics is the bowed-string literature below, and bowed strings
have been synthesised by physical modelling for forty years.

### The original instrument and its history

* **Leonardo da Vinci**, sketches of the *viola organista* in his notebooks of
  c. 1488–89, among them the [Codex Atlanticus](https://codex-atlanticus.ambrosiana.it/)
  (Biblioteca Ambrosiana, Milan). It was not built in his lifetime. The
  standard study is E. Winternitz (1982). *Leonardo da Vinci as a Musician*.
  Yale University Press, pp. 137–167.
* **Hans Haiden's Geigenwerk** (Nuremberg, c. 1575). The keys pull the strings
  down onto friction wheels that a treadle or crank keeps turning, five wheels
  on Haiden's instrument; the player varied the loudness through the wheel
  speed. It is pictured as the "Nürmbergisch Geigenwerck" in M. Praetorius,
  *Syntagma musicum* II, *De Organographia* (Wolfenbüttel, 1619), with the
  plates in *Theatrum Instrumentorum* (1620); English translation by
  D. Z. Crookes (Clarendon Press, 1986), p. 69.
* **Fray Raymundo Truchado's Geigenwerk**, inscribed 1625 (the date has been
  questioned), with four wheels: Musical Instruments Museum, Brussels
  (no. IV-21).
* **Akio Obuchi** has built Geigenwerke since 1993, including one after
  Leonardo's viola organista
  ([workshop](http://obuchi.music.coocan.jp/Geigenwerk/index-e.htm)). The one
  he described in 1994 has four wheels, one per octave of a four-octave
  compass, as this model's registers do: A. Obuchi (1994). "Making a bowed
  keyboard instrument." *Journal of the American Musical Instrument Society*,
  111–115. [PDF](https://amis.mircat.org/jamis/1994_111.pdf). He used a
  version of the viola organista in a concert in Italy in 2004
  ([Classical Music, 2013](https://www.classical-music.com/news/leonardo-da-vincis-viola-organista-played-public)).
* **Sławomir Zubrzycki** built his viola organista in 2009–2012 and premiered
  it in recitals at the Royal Kraków Piano Festival in October 2013
  ([festival](https://www.cracowpianofestival.com/17th-piano-festival-2025/artists-2025/slawomir-zubrzycki_25/)),
  at the Academy of Music in Kraków.

### The physics literature

* Helmholtz, H. von (1863). *Die Lehre von den Tonempfindungen als
  physiologische Grundlage für die Theorie der Musik*. Braunschweig. English
  translation by A. J. Ellis, *On the Sensations of Tone* (1875; 2nd ed. 1885).
* Raman, C. V. (1918). "On the mechanical theory of the vibrations of bowed
  strings and of musical instruments of the violin family, with experimental
  verification of the results: Part I." *Bull. Indian Assoc. Cultiv. Sci.* 15,
  1–158.
* Friedlander, F. G. (1953). "On the oscillations of a bowed string." *Proc.
  Camb. Phil. Soc.* 49, 516–530.
  [doi:10.1017/S0305004100028681](https://doi.org/10.1017/S0305004100028681).
* Keller, J. B. (1953). "Bowing of violin strings." *Comm. Pure Appl. Math.*
  6, 483–495. [doi:10.1002/cpa.3160060404](https://doi.org/10.1002/cpa.3160060404).
* Wallace, C. E. (1972). "Radiation resistance of a rectangular panel." *J.
  Acoust. Soc. Am.* 51, 946–952.
  [doi:10.1121/1.1912943](https://doi.org/10.1121/1.1912943).
* Schelleng, J. C. (1973). "The bowed string and the player." *J. Acoust. Soc.
  Am.* 53, 26–41. [doi:10.1121/1.1913322](https://doi.org/10.1121/1.1913322).
* McIntyre, M. E. & Woodhouse, J. (1979). "On the fundamentals of bowed-string
  dynamics." *Acustica* 43, 93–108.
* McIntyre, M. E., Schumacher, R. T. & Woodhouse, J. (1983). "On the
  oscillations of musical instruments." *J. Acoust. Soc. Am.* 74, 1325–1345.
  [doi:10.1121/1.390157](https://doi.org/10.1121/1.390157).
* Cremer, L. (1984). *The Physics of the Violin*, trans. J. S. Allen.
  [MIT Press](https://mitpress.mit.edu/9780262031028/the-physics-of-the-violin/).
* Hess, D. P. & Soom, A. (1990). "Friction at a lubricated line contact
  operating at oscillating sliding velocities." *J. Tribology* 112, 147–152.
  [doi:10.1115/1.2920220](https://doi.org/10.1115/1.2920220).
* Pitteroff, R. & Woodhouse, J. (1998). "Mechanics of the contact area between
  a violin bow and a string," Parts I–III. *Acustica* 84, 543–562, 744–757 and
  929–946.
* Woodhouse, J. & Loach, A. R. (1999). "The torsional behaviour of cello
  strings." *Acustica* 85, 734–740.
* Smith, J. H. & Woodhouse, J. (2000). "The tribology of rosin." *J. Mech.
  Phys. Solids* 48, 1633–1681.
  [doi:10.1016/S0022-5096(99)00067-8](https://doi.org/10.1016/S0022-5096(99)00067-8).
* Guettler, K. (2002). "On the creation of the Helmholtz motion in bowed
  strings." *Acta Acustica united with Acustica* 88, 970–985.
  [PDF](https://knutsacoustics.com/files/actaacustica-on-the-creation.pdf).
* Woodhouse, J. (2003). "Bowed string simulation using a thermal friction
  model." *Acta Acustica united with Acustica* 89, 355–368.
* Woodhouse, J. & Galluzzo, P. M. (2004). "The bowed string as we know it
  today." *Acta Acustica united with Acustica* 90, 579–589.
  [PDF](https://euphonics.org/wp-content/uploads/2022/03/BowedStringReview.pdf).
* Cremer, L., Heckl, M. & Petersson, B. A. T. (2005). *Structure-Borne Sound*,
  3rd ed. Springer. [doi:10.1007/b137728](https://doi.org/10.1007/b137728).
* Schoonderwaldt, E., Guettler, K. & Askenfelt, A. (2008). "An empirical
  investigation of bow-force limits in the Schelleng diagram." *Acta Acustica
  united with Acustica* 94, 604–622.
  [doi:10.3813/AAA.918070](https://doi.org/10.3813/AAA.918070).

### Earlier models and syntheses

The stick–slip junction, the waveguide string and the friction curve here
follow the time-domain bowed-string models of McIntyre, Schumacher & Woodhouse
(1983, above) and Smith (1986). Earlier physical models and syntheses of bowed
strings:

* Smith, J. O. (1986). "Efficient simulation of the reed-bore and bow-string
  mechanisms." *Proc. Int. Computer Music Conf.* (The Hague), 275–280; also in
  [CCRMA report STAN-M-39](https://ccrma.stanford.edu/STANM/stanms/stanm39/)
  (1987). The digital-waveguide bowed string.
* Smith, J. O. (1992). "Physical modeling using digital waveguides." *Computer
  Music J.* 16(4), 74. [doi:10.2307/3680470](https://doi.org/10.2307/3680470).
* Woodhouse, J. (1992). "Physical modeling of bowed strings." *Computer Music
  J.* 16(4), 43. [doi:10.2307/3680468](https://doi.org/10.2307/3680468).
* Serafin, S., Avanzini, F. & Rocchesso, D. (2003). "Bowed string simulation
  using an elasto-plastic friction model." *Proc. Stockholm Music Acoustics
  Conf. (SMAC 2003)*, 95.
* Serafin, S. (2004). *The sound of friction: real-time models, playability and
  musical applications*. PhD thesis, Stanford University.
* Demoucron, M. (2008). *On the control of virtual violins: physical modelling
  and control of bowed string instruments*. PhD thesis, Université Pierre et
  Marie Curie (Paris 6).
* Maestre, E., Spa, C. & Smith, J. O. (2014). "A bowed string physical model
  including finite-width thermal friction and hair dynamics." *Proc. Int.
  Computer Music Conf.* (Athens).
* Desvages, C. & Bilbao, S. (2016). "Two-polarisation physical model of bowed
  strings with nonlinear contact and friction forces, and application to
  gesture-based sound synthesis." *Applied Sciences* 6(5), 135.
  [doi:10.3390/app6050135](https://doi.org/10.3390/app6050135).
* Smith, J. O. [*Physical Audio Signal Processing*, "Bowed
  strings"](https://ccrma.stanford.edu/~jos/pasp/Bowed_Strings.html) (CCRMA,
  online book): the waveguide bowed string and its bow–string junction.
* [STK `Bowed`](https://ccrma.stanford.edu/software/stk/classstk_1_1Bowed.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit, 1995–): open-source
  real-time bowed string after Smith (1986) and McIntyre, Schumacher &
  Woodhouse (1983).
* [Modalys](https://support.ircam.fr/docs/Modalys/current/) (IRCAM): a
  framework for virtual instruments built from physical models, with bowing
  among its connections between objects.
* [Sculpture](https://support.apple.com/guide/logicpro/sculpture-overview-lgsia12ea31/mac)
  (Apple, Logic Pro): a component-modelling string synthesizer whose string can
  be bowed, plucked or struck.
* [SWAM Solo Strings](https://audiomodeling.com/bundles/swam-solo-strings)
  (Audio Modeling): physically modelled violin, viola, cello and double bass,
  played through a modelled bow–string interaction.
* [String Studio VS-3](https://www.applied-acoustics.com/string-studio-vs-3/)
  (Applied Acoustics Systems): a synthesizer whose oscillators are modelled
  strings excited by picks, bows or hammers.
