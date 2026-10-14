# Viola Organista

Leonardo da Vinci's bowed keyboard, sketched in the Codex Atlanticus
(c. 1488–89) and first built by Sławomir Zubrzycki in 2013. Pressing a key
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
| MIDI | notes and velocity; **aftertouch** (channel or polyphonic) presses harder; mod wheel = key pressure; CC64 = hold |

Space is *hold*, not a damper pedal. A bowed note lasts only while its string
is on the wheel, so the useful pedal keeps keys down. Letting released strings
ring is a separate switch (*Dampers lifted*).

## The physics

**The instrument.** Zubrzycki's instrument has 61 steel strings over a spruce
soundboard in a case shaped like a baby grand. Four wheels wrapped in horsehair
turn on a crankshaft that the player pumps with a pedal, and each key presses
its string against a wheel. This model has 49 keys (C2–C6), one wheel speed
for all strings, and the wheel touching every string at the same fraction β of
its length from the bridge.

**Strings** (`bowed-model.js: stringDesign`). The scale is harpsichord-like:
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

**The string as a waveguide** (`string.js`). Velocity waves travel in delay
lines: bridge → wheel → bridge (2·D_b samples) and wheel → nut → wheel (2·D_n).
The string's own losses (air and internal friction) are distributed, so each
round trip gets a one-pole low-pass for its share of the travel time. The
target decay rate is σ(f) = 0.35 + 1.4·(f/kHz)² s⁻¹, raised up to 7× at high
frequency for the wound bass, where the winding rubs on the core. The filter's
gain at DC is capped at 1, so the loop stays passive for any setting. The nut
reflects with −1. Every string ends on one shared bridge.

**Torsion.** The wheel grips the string's *surface*, which also moves when the
string rolls. Torsional waves travel at c_t = √(G/ρ) = 3180 m/s whatever the
tension, and a solid wire's torsional impedance, seen at its surface, is
ρI_p c_t/r² = μc_t/2 (3.6–6.4 × Z₀ here). A second waveguide pair carries them,
with Q = 40 for the fundamental torsional mode (836 Hz at C2, 7.7 kHz at C6).
Woodhouse & Loach measured Q of that order on cello strings. Friction drives
both waveguides, with admittances 1/(2Z₀) and 1/(2Z_t).

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
tests check all of this against the engine: stick fraction and slip speed
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

| case | F_min model → measured | F_max model → measured |
|---|---|---|
| C3, β = 0.12, v_B = 25 cm/s | 37 → 61 mN (× 1.6) | 3.69 → 2.88 N (× 0.78) |
| C4 | 21 → 32 mN (× 1.5) | 2.98 → 2.40 N (× 0.80) |
| C5 | 14 → 19 mN (× 1.4) | 2.39 → 2.57 N (× 1.08) |
| C6 | 9.8 → 8.8 mN (× 0.9) | 1.88 → 1.94 N (× 1.03) |
| C4, β = 0.06 | 82 → 104 mN (× 1.3) | 5.82 → 4.56 N (× 0.78) |
| C4, β = 0.24 | 5.5 → 8.0 mN (× 1.5) | 1.56 → 0.91 N (× 0.59) |
| C4, v_B = 50 cm/s | 41 → 58 mN (× 1.4) | 5.82 → 4.77 N (× 0.82) |
| C4, v_B = 12.5 cm/s | 11 → 18 mN (× 1.6) | 1.56 → 1.46 N (× 0.94) |

The upper bound holds well, with slope −1 in β (tested). The lower bound has
slope ≈ −2 in β (tested), but comes out 1.3–1.6× Schelleng's value below C6. His
derivation assumes a lossless string on a resistive bridge (Raman's model).
The rounded corner of a lossy string adds a friction-force ripple that
triggers premature slips earlier, which is how Schoonderwaldt et al. explain
the same discrepancy in their measurements. They also found the measured F_min
nearly independent of v_B. Here it still scales as v_B^0.86, closer to
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
| C2 (15 ms) | 122 ms | 184 ms | 273 ms | 318 ms | 539 ms |
| C3 (7.6 ms) | 107 | 106 | 145 | 398 | 207 |
| C4 (3.8 ms) | 118 | 88 | 87 | 84 | 241 |
| C5 (1.9 ms) | 65 | 49 | 112 | 75 | 145 |
| C6 (0.96 ms) | 21 | 21 | 60 | 47 | 119 |

The *Attack map* view computes this live, for the key you play and the knobs
you set, over every rise time and final force (a Guettler diagram for a
wheel). It is not smooth. Bowed-string transients are notoriously sensitive,
and the map has islands. One hazard is real: a few patterns with two slips per
period, including a near-symmetric "octave" pattern, are stable almost
everywhere Helmholtz motion is. A string that falls into one keeps whistling,
just as a violin E string can. At the voiced touch every key settles. At soft
touches about 1 note in 100 whistles (2 of 294 in a sweep of every key at six
velocities). Press harder (aftertouch, or ↑) and it
snaps into Helmholtz motion, then stays there when you ease off: hysteresis.

**Voicing.** Each key is regulated so that a normal touch (velocity 0.7)
presses with half of Schelleng's maximum at the default wheel. Below about
0.25 F_max a fresh note starts in surface sound; near 0.9 F_max the motion turns
raucous; in between, half way, the attacks settle most reliably.
Velocity changes the force only between 0.75× and 1.11×; mostly it changes how
fast the force rises. The voicing is a fixed table, as on the real instrument.
Change the wheel speed or position and the operating point moves around
Schelleng's diagram. The view shows it moving.

**Flattening, and tuning while bowing.** A bowed string sounds flat of its free
frequency, more so the harder it is pressed (McIntyre & Woodhouse 1979). The
slip comes late and the corner is rounded. Here, at the voiced touch, the flat
runs from 4 ¢ (C2) through 9 ¢ (C4) to 33 ¢ (C6). The rosin lag adds to it,
most at the top, where a slip lasts only five lags. A tuner tunes by ear while
the instrument plays, so each free string is set that much sharp
(`tools/bowed-tuning.mjs`). The bowed notes are then within ±1 ¢ of equal
temperament (tested on all 49 keys from the audio, within ±3 ¢). Consequences
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
low frequency; the others hardly radiate until coincidence (1.6 kHz). Above
the modelled modes the board is dense, so the bridge force radiates directly.
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

**Sampling.** A slip lasts β of a period, only five samples at C6 at 48 kHz,
and it must be resolved. Without torsion and rosin lag, C6's measured minimum
force is 0.2×, 0.8× and 1.3× Schelleng's value at 48, 96 and 192 kHz: it has
not converged at the output rate. The bridge side of the waveguide also needs
a couple of samples, which limits how close to the bridge the wheel can sit.
So each string runs at 1×, 2× or 4× the output rate (C4 and below, to C5, to
C6), keeping at least ~180 samples per period. Within one output sample the
other strings' pull on the bridge is held. Each string's own bridge reflection
stays exact, and its bridge force is low-passed (4th-order at 18 kHz) and
decimated.

**Cost.** Ten held notes take about 10 % of one core (measured in Node on an
Apple M2 Max). With the dampers lifted all 49 strings run, and it takes about
26 %. Damped, silent strings leave the loop, and a silent instrument costs
nothing.

## What to listen for

`examples/bowed/` (regenerate with `node tools/render-bowed.mjs`):

1. **Chorale in G.** Four voices over a falling bass, with a cadence. The
   treadle swells the wheel speed from 20 to 30 cm/s into the phrase and eases
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

## Files

```
bowed/index.html, style.css           page
bowed/src/bowed-model.js              physics: scale, losses, friction, Schelleng, plate, voicing (no audio, no DOM)
bowed/src/string.js                   one string: waveguide, friction junction, torsion, oversampling, Helmholtz start, attack timing
bowed/src/bowed-engine.js             real-time engine: wheel, shared bridge, keys, dampers, soundboard (AudioWorklet and Node)
bowed/src/bowed-params.js             parameters and presets
bowed/src/bowed-tuning.js             tuning table (generated)
bowed/src/bowed-main.js               page wiring and views
test/bowed-tests.mjs                  node test/bowed-tests.mjs
tools/bowed-tuning.mjs                node tools/bowed-tuning.mjs → bowed/src/bowed-tuning.js
tools/render-bowed.mjs                node tools/render-bowed.mjs → examples/bowed/
```

## Simplifications

* **One wheel, one β.** The real instrument has four wheels, each serving a
  register, so β changes along each wheel's range. Here every string meets the
  wheel at the same fraction of its length. The contact is a point: the wheel's
  width (Pitteroff & Woodhouse's finite bow width) and the hair's compliance
  are left out. So is the wheel's own dynamics: pressing many keys does not
  slow the flywheel.
* **Friction.** The friction curve with a first-order lag stands in for
  Woodhouse's thermal model of rosin, which tracks the contact temperature
  through heat diffusion. The lag reproduces the curve in steady sliding and
  removes its unphysical instant response. It is not fitted to measurements,
  and it exaggerates flattening at the top (33 ¢ at C6), where a slip lasts
  only five lag times.
* **Strings.** No stiffness (B ≤ 1.5·10⁻⁴), so the free string is harmonic.
  The wound bass's extra loss is a simple factor, and its torsion uses the
  solid-wire formula. One polarisation: the string moves only along the wheel's
  surface, and the key's push toward the wheel does not change the tension.
* **Bridge.** The strings see the board's average (real) admittance. They do
  not see its modal peaks, so there are no wolf notes. The modes appear only in
  the radiated sound. The board is a rectangle with smeared ribs, not a
  harpsichord's bentside shape, and the eight drive points share the bridge.
* **Attacks are chaotic.** Bowed-string transients really are. One
  consequence is a small chance that a note locks into a two-slip whistle,
  about 1 % at soft touches and never at the default touch. Pressing harder
  frees it.
* **Range and tuning.** 49 keys (C2–C6) rather than Zubrzycki's 61. The tuning
  table is computed at default settings. Changing the wheel, the friction or
  the string losses changes the flattening and so the pitch, as it would on the
  instrument.

## References

Helmholtz, *On the Sensations of Tone* (1863); C. V. Raman, *Indian Assoc.
Cult. Sci. Bull.* 15 (1918); J. C. Schelleng, "The bowed string and the
player", *JASA* 53, 26 (1973); M. E. McIntyre & J. Woodhouse, "On the
fundamentals of bowed-string dynamics", *Acustica* 43, 93 (1979); M. E.
McIntyre, R. T. Schumacher & J. Woodhouse, "On the oscillations of musical
instruments", *JASA* 74, 1325 (1983); J. O. Smith, "Physical modeling using
digital waveguides", *Computer Music J.* 16(4) (1992); D. P. Hess & A. Soom,
"Friction at a lubricated line contact operating at oscillating sliding
velocities", *J. Tribology* 112, 147 (1990); J. Woodhouse & A. R. Loach,
"Torsional behaviour of cello strings", *Acustica* 85 (1999); J. H. Smith &
J. Woodhouse, "The tribology of rosin", *J. Mech. Phys. Solids* 48, 1633
(2000); K. Guettler, "On the creation of the Helmholtz motion in bowed
strings", *Acta Acustica* 88, 970 (2002); J. Woodhouse, "Bowed string
simulation using a thermal friction model", *Acta Acustica* 89, 355 (2003);
E. Schoonderwaldt, K. Guettler & A. Askenfelt, "An empirical investigation of
bow-force limits in the Schelleng diagram", *Acta Acustica* 94, 604 (2008);
C. E. Wallace, "Radiation resistance of a rectangular panel", *JASA* 51, 946
(1972); L. Cremer, M. Heckl & B. A. T. Petersson, *Structure-Borne Sound*
(Springer).
