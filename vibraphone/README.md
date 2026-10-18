# Vibraphone

A vibraphone after the Deagan vibraharp of 1927: 37 aluminium bars, F3–F6,
each over a stopped tube, with a motor turning a disc in every tube's mouth.
Nothing here is sampled. Each bar's undercut is shaped by a finite-element
model until its first three modes sit at exactly 1 : 4 : 10. The tube under
it is a second oscillator that shares the bar's air, drawing the
fundamental out as sound. The motor's discs open and close the tubes, so
the pulsing tremolo, its slight pitch wobble, and the way it smears in the
bass all come out of the coupling. You can move the tube closer until bar
and tube trade energy back and forth, take the tubes away, plane the
undercut off, twist the discs along the shaft, or cool the hall until the
tubes fall out of tune with their bars.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/vibraphone/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (37 bars, F3–F6) |
| `←` `→` | octave |
| `↑` `↓` | velocity (the mallet's speed, up to 3 m/s by default) |
| `Space` | damper pedal: lifts the felt off every bar |
| MIDI | notes, velocity, sustain pedal (CC64); **mod wheel = shaft speed** |

## The physics

### 1. The bar: a Timoshenko beam with an arch cut under it

Every bar starts as aluminium (E = 69 GPa, ρ = 2700 kg/m³, ν = 0.33),
12.7 mm (½") thick, its width graded from 57 mm at F3 to 38 mm at F6. It
rests on two cords and is free at both ends. A plain bar of length L
bends in the free–free modes of an Euler–Bernoulli beam,

  cos βL · cosh βL = 1,   f_n = (β_nL)² h √(E/12ρ) / 2πL²,

at 1 : 2.756 : 5.404 : 8.933 : 13.34. Those are not harmonics, which is why
the bars of a vibraphone are undercut: an arch is milled out of the
underside, and the thinner middle lowers the modes that bend there most.

The bar is solved as a **Timoshenko beam** (shear and rotary inertia
matter: a 13 mm bar 14–37 cm long is not slender) whose thickness h(x)
follows the cut. The cut has a thin flat centre of half-width c, then a
cosine rise to the full thickness at ±a:

  h(x) = h₀ − d                                   |x| ≤ c
  h(x) = h₀ − d·½[1 + cos(π(|x| − c)/(a − c))]    c < |x| < a

so it is smooth (no slope step) everywhere. The finite elements
(`native/instruments/vibraphone/bar.cpp`, and the bending part in
`src/bar.js`, which tunes the bars) mesh half the bar
(the cut is symmetric, so modes 1, 3, 5 have zero slope at the centre and
2, 4 zero displacement) with two-node elements whose deflection is cubic and
rotation quadratic, interdependently (exact for a uniform element in
statics; Reddy 1997), with φ = 12EI/k_sGAl² and Cowper's shear coefficient
k_s = 10(1 + ν)/(12 + 11ν) = 0.851 for a rectangle. Stiffness and mass are
integrated with 5-point Gauss rules on the varying section, 108 elements
per half. The matrices are banded, so each eigenvalue comes from a
Sturm-sequence bisection (the number of negative pivots of K − λM counts
the eigenvalues below λ) and each mode shape from inverse iteration. The
tests check the solver against the dense eigensolver in `shared/linalg.js`
(to 10⁻⁹), a thin plain bar against the beam ratios above (to 2×10⁻⁴), and
that a mesh twice as fine moves the tuning by less than 0.25 ¢.

The same mesh carries **torsion**: Saint-Venant twisting, GJ θ″ against
the polar inertia ρ(bh³ + hb³)/12, with Roark's torsion constant for a
rectangle, J = bh³[⅓ − 0.21 (h/b)(1 − h⁴/12b⁴)]. A uniform bar twists at
f_n = n c_T/2L, c_T = √(GJ/ρI_p) (tested to 10⁻³). The engine keeps bending
modes 1–5 and torsion modes 1–2.

### 2. Tuning 1 : 4 : 10

Vibraphone bars, like marimba bars, are tuned so that the second bending
mode sits two octaves above the first and the third three octaves and a
major third above it, 1 : 4 : 10 (Fletcher & Rossing; Rossing). For each key
the flat share c/a of the cut is fixed, rising from 0.22 at F3 (a wide
arch) to 0.85 at F6 (a narrow, flat-bottomed slot), and three unknowns are
solved together: the cut's half-width a, its depth d and the bar's length
L, so that

  f₂/f₁ = 4,   f₃/f₁ = 10,   f₁ = 440 · 2^((key − 69)/12) Hz.

`tuneUndercut` does this by Newton's method with a finite-difference
Jacobian, in 3–5 steps from the neighbouring key's answer.
`tools/vibraphone-bars.mjs` tunes all 37 bars in about a second and writes
`src/bar-table.js`. Every bar meets 1 : 4 : 10 to 0.01 ¢ in the model, and
the test re-solves every key from the table and checks 1 ¢, then re-runs
the optimiser cold on three keys and recovers the table.

| key | f₁ (Hz) | L | width | mass | cut (flat part) | thinnest | cords at | modes 4, 5 (× f₁) | torsion 1, 2 (× f₁) |
|---|---|---|---|---|---|---|---|---|---|
| F3 | 174.6 | 37.1 cm | 57 mm | 538 g | 25.9 (5.7) cm | 5.0 mm | 19.6 % | 16.8, 24.4 | 3.45, 13.0 |
| C4 | 261.6 | 32.7 cm | 53 mm | 478 g | 17.4 (6.0) cm | 5.6 mm | 20.5 % | 15.9, 22.2 | 3.23, 12.1 |
| A4 | 440.0 | 25.8 cm | 49 mm | 355 g | 11.1 (5.5) cm | 5.8 mm | 20.9 % | 15.1, 21.0 | 2.78, 10.5 |
| C5 | 523.3 | 23.7 cm | 47 mm | 317 g | 9.6 (5.3) cm | 5.9 mm | 20.9 % | 15.0, 20.7 | 2.63, 10.0 |
| F5 | 698.5 | 20.5 cm | 44 mm | 261 g | 7.5 (4.8) cm | 5.9 mm | 21.0 % | 14.7, 20.3 | 2.40, 9.24 |
| C6 | 1046.5 | 16.6 cm | 41 mm | 195 g | 5.4 (4.1) cm | 5.8 mm | 21.1 % | 14.4, 19.7 | 2.11, 8.28 |
| F6 | 1396.9 | 14.2 cm | 38 mm | 157 g | 4.3 (3.6) cm | 5.7 mm | 21.2 % | 14.1, 19.3 | 1.92, 7.69 |

What the cut buys: the undercut lowers f₁ by a factor of 2.2–2.7, so a
tuned bar is shorter than a plain one for the same note. Played plain
(**Undercut depth** 0), each bar is cut to the length that keeps it on
pitch: 61.4 cm at F3, 21.6 cm at F6, ringing at 1 : 2.75 : 5.37 and
1 : 2.70 : 5.13 (shear and rotary inertia pull a short thick bar below the
slender-beam ratios). That lowering also has a floor: with a cut in the
middle only, this family of cuts cannot reach 1 : 4 : 10 while lowering f₁
by less than about 2.1. So the top bar comes out at 14 cm, a little
shorter than on most instruments, whose top octave is rarely tuned
to the 10th partial (14 kHz at F6).

### 3. How long a bar rings on its own

Each mode loses energy at σ (s⁻¹, amplitude ∝ e^(−σt), T₆₀ = 6.91/σ), the
sum of four parts:

* **internal friction**, σ = πfη, with η the **Internal friction** knob
  (10⁻⁴ by default);
* **heat flow** (Zener): bending squeezes one face and stretches the other,
  and heat crossing the thickness takes energy with it,
  η = Δ ωτ/(1 + ω²τ²), Δ = Eα²T/ρc_p = 4.4×10⁻³, τ = h²/π²D_th. It is
  weighted, element by element, by each mode's share of bending energy
  there. At these thicknesses ωτ ≫ 1, so it is small: T₆₀ above 120 s;
* **the cords**, which pass through holes at mode 1's nodes (19.6–21.2 % of
  the length, from the FEM): a dashpot of 0.25 N·s/m at each, acting on the
  displacement there and, over the cord's 2 mm radius, on the slope. Mode 1
  barely notices them; modes 2 and 3 do;
* **radiation from the bar itself**. A thin strip moving normal to itself
  is a line of dipoles whose strength per unit length is its added mass
  over ρ₀, πb²/4 per metre of velocity. With I(μ) = ∫(πb²/4) w(x) e^(ikxμ) dx
  over the bar (μ the cosine of the angle to it),

  σ_rad = ρ₀ c k⁴ J / 32π,   J = ∫(1 − μ²) |I(μ)|² dμ,

rolled off by 1/(1 + (kb/2)²) once the bar is no longer small against the
wavelength. Mode 1 radiates almost nothing (the bar's net volume
displacement is nearly zero, and what is left is a weak quadrupole along
its length); the upper modes, above about 2 kHz, radiate well and die
fastest. Torsion, whose two edges move in opposite directions, is a
lateral quadrupole (strength πb⁴k/128 per metre: an estimate).

| key | T₆₀ alone: mode 1 | mode 2 | mode 3 |
|---|---|---|---|
| F3 | 63 s | 15.3 s | 5.0 s |
| C4 | 55 s | 11.5 s | 2.3 s |
| A4 | 38 s | 6.7 s | 0.94 s |
| F5 | 26 s | 3.4 s | 0.52 s |
| F6 | 13 s | 1.2 s | 0.26 s |

### 4. The resonator: a stopped tube

Under each bar hangs a tube closed at the bottom, its bore graded from
76 mm (F3) to 42 mm (F6). Its first mode is a quarter wave: a pressure node
at the open mouth, an antinode at the closed end. Lumped at the mouth, in
terms of the volume X pushed out of it,

  m_a = ρ₀ℓ_e/2S,   K_a = m_a (πc/2ℓ_e)²,   ℓ_e = L_t + 0.61 a_t

with 0.61 a_t the end correction of an unflanged pipe (Levine & Schwinger).
c = 343.2 m/s at 20 °C. Two losses: radiation from the mouth, the
resistance R = ρ₀ck²/4π of a small monopole, and the viscous and thermal
boundary layers on the walls, σ_w = αc with α = 2.95×10⁻⁵ √f / a_t per
metre (Fletcher & Rossing). The bass tubes are sharp resonators and the
treble ones broad: σ = 5.8 s⁻¹ at F3 (Q ≈ 95), 30 s⁻¹ at A4 (Q ≈ 46),
400 s⁻¹ at F6 (Q ≈ 11), where (ka)² = 0.29 and the mouth radiates almost
as well as it can.

The tube is cut so that, with the bar in place and the disc open, it is
tuned to the bar at 20 °C (**Tube tuning** offsets it). At the default
30 mm gap that makes it 45.2 cm long at F3, 29.5 cm at C4, 16.9 cm at A4
and 4.5 cm at F6.

### 5. Bar and tube: two oscillators sharing the air in the gap

The bar's mode 1 (unit modal mass, coordinate q, shape w₁) pushes the air
under its middle towards the mouth: S_b = ∫ w₁ dA over the part of the bar
above it is the volume per unit q. That air either goes into the tube or
escapes sideways through the gap, so the escaping volume is X − S_b q. The
escaping air has an inertance of its own, radial flow out of a slot of
height g,

  m_g = ρ₀ ln(1 + R_b/g) / 2πg,   R_b = min(b/2, a_t),

and the system's energies are

  T = ½ q̇² + ½ (m_a + m_c) Ẋ² + ½ m_g (Ẋ − S_b q̇)²,   V = ½ ω_b² q² + ½ K_a X²

(m_c is the disc, below). The cross term couples the two through their
masses: M = [[1 + m_g S_b², −m_g S_b], [−m_g S_b, m_a + m_c + m_g]], with
the coupling coefficient κ = m_g S_b/√(M₁₁M₂₂). A bar pressed close to
the mouth has nowhere to push its air but into the tube, so κ grows as
the gap closes. Two such oscillators have normal modes

  (1 − κ²)ω⁴ − (ω_b² + ω_t²)ω² + ω_b²ω_t² = 0,   so when tuned  ω± = ω₀/√(1 ∓ κ),

a pair split by about κf₀, between which the energy beats. With the losses
the modes are the roots of det(s²M + sC + K) = 0, a quartic solved in
`coupledModes`. The **Bar–tube gap** knob moves the pair through two
regimes (C4, tube tuned):

| gap | κ | the coupled pair | T₆₀ |
|---|---|---|---|
| 6 mm | 0.044 | 255.9 and 267.3 Hz: split, energy beats at 11.4 Hz | 2.4, 2.0 s |
| 10 mm | 0.023 | 258.7 and 264.5 Hz | 1.7, 1.5 s |
| 20 mm | 0.008 | 261.0 and 262.2 Hz | 1.4, 1.2 s |
| 30 mm | 0.0041 | both at 261.6 Hz: one bar-like, one tube-like | 5.5, 0.7 s |
| 50 mm | 0.0017 | both at 261.6 Hz | 23.6, 0.6 s |

Between 20 and 30 mm the pair passes an exceptional point, where κω₀
equals the difference of the two damping rates. Closer, bar and tube
share their energy and both die in about a second. Further, the tube can
take energy only as fast as it radiates it, a slow leak of
(κω₀)²/4σ_t: the bar rings for seconds and the tube sings along at its
pitch. The default, 30 mm, sits just on the leaky side: κ = 0.0047 at F3,
0.0037 at A4, 0.0030 at F6, and the bar's ring falls from 63 s to 4.1 s at
F3, from 38 s to 6.3 s at A4 and from 13 s to 7.2 s at F6.

The tube is what you hear of the fundamental. In the far field the bar,
the escaping air and the tube's mouth add up to a monopole of volume
velocity Ẋ alone (the bar's two faces cancel, as above). So the tube makes
the fundamental 34 dB louder at F3 (12 dB at F6), and **rounder**: the
radiated fundamental swells for 0.35 s at F3 (55 ms at F5) while the tube
fills, where the bar alone peaks at once. The tests check all three: the
engine's split against the damped quartic (to 0.1 Hz at F3 and C4 with the
tube 6 mm away), the energy beating at 1/Δf (to 3 %), and the tube making
the fundamental louder, swelling and the bar's ring shorter.

### 6. The motor and the discs

A shaft runs along each row of tubes, through their mouths, with a
butterfly disc in each. The disc covers c_d of the mouth when face-on
(**Disc size**, 0.7 by default: a disc 84 % of the bore's diameter), so at
angle θ (0 = edge-on) the mouth is open by

  s(θ) = 1 − c_d |sin θ|,

twice open per turn. The flow squeezing past a disc adds end correction:
an inertance m_c = ρ₀ℓ_v(1/s − 1)/S with ℓ_v = a_t/4 (an estimate: the
disc's thickness plus the end corrections of the gaps around it). That
does two things: it weakens the coupling (κ falls by 4–13 %), and, more,
it flattens the tube (by 72 ¢ at F3, 134 ¢ at A4, 276 ¢ at F6 with the
disc closed), out of the band in which it can follow its bar. The
fundamental's loudness then pulses at

  f_trem = (shaft revolutions per second) × 2 openings per turn,

which the tests measure from the output's envelope, at three speeds, to 1 %.
The **Shaft speed** runs from 0.5 to 6 rev/s, a 1–12 Hz tremolo, and the
shaft spins up and down with a 0.35 s time constant. Stopped, it parks
(a critically damped 1.2 Hz servo) with the naturals' discs open or
closed. The two shafts are joined by a belt, and the accidentals' can run
up to 180° behind; **Disc phase step** sets each disc further round its
shaft than its neighbour's. Two neighbouring naturals with the discs
45° apart pulse a quarter of a cycle apart, 1/16 s at 2 rev/s (tested).

At the default 4.5 Hz the level pulses by about 15 dB at F3, 19 dB at A4,
15 dB at C5 and 7 dB at F6 (averaged over many cycles), deeper with
bigger discs. Because the tube is a resonator being detuned and retuned,
the phase of its sound swings as well as its level: a frequency
modulation. In the loud half of each pulse it is about 3 ¢ rms at F6,
13 ¢ at C5 and 27 ¢ at C4; in the bass, where the tubes are sharpest, it
reaches 35 ¢. From the middle up the tremolo is mostly amplitude; at the
bottom it is partly a vibrato.

The motor also lengthens the notes. A tube drains its bar only while its
disc is near open, so with the motor at 2.5 rev/s a C4 loses energy at
2.8 dB/s, against 6.2 dB/s with the discs open, 1.3 dB/s with them closed
and 1.2 dB/s with no tubes at all.

### 7. The mallet

A yarn-wound head on a rubber core, as a power-law contact,

  F = K δ^p + K α d(δ^p)/dt,   p = 2.3,  α = 3×10⁻⁵ s,

stiffening as the yarn packs onto the core, with a little loss in the yarn.
**Mallet hardness** is the force at 1 mm of squash (800 N by default), the
head weighs 12 g, and velocity sets its speed, v = 3 m/s × velocity. The
contact is solved implicitly every sample against every mode at the strike
point and the coupled bar–tube pair, with the elastic force the discrete
gradient of K δ^(p+1)/(p+1) between the steps either side
(Chatziioannou & van Walstijn), so the strike neither creates nor loses
energy numerically. On C4 the default head stays on for 0.94 ms at velocity
0.3, 0.71 ms at 0.6 and 0.58 ms at 1, peaking at 43, 108 and 212 N: a
harder strike squashes the yarn further, stiffens the contact and reaches
higher modes, so velocity changes the colour, not only the level. A soft
head (80 N) stays 1.2–1.9 ms; a cord head (6000 N, 9 g), 0.3–0.5 ms.

Where it lands matters. At the centre, mode 2 has a node and stays silent;
at the end every mode speaks; on mode 1's node (about 20 % of the length)
the fundamental drops out. Struck **off the centre line**, the bar twists:
its torsional modes join in.

### 8. Damper, pedal and air

A felt-covered bar presses on every bar, 5 % of its length from its inner
end, unless the pedal is down. It adds σ_d (w_n(x_d)/w₁(x_d))² to mode n,
with σ_d = 6.91/T₆₀ from the **Damper felt** knob (0.3 s). A held key keeps
the felt off its own bar, as if the player held it there, so key-up damps
a bar only while the pedal is up; Space or CC64 lifts the felt off all of
them, and **Pedal held down** never lets it land. It lands over 8 ms.

**Air temperature** retunes the tubes: c ∝ √T, +2.95 ¢ per kelvin. The bars
barely move, about −0.4 ¢ per kelvin (aluminium expands, α = 23×10⁻⁶ /K,
and softens, dE/E ≈ −4.8×10⁻⁴ /K). Tuned at 20 °C, a hall at 5 °C leaves
every tube about 50 ¢ flat of its bar: quieter, longer notes.

### 9. What you hear

Pressure at the listener ∝ the tube's volume acceleration Ẍ plus, for each
bar mode, q̈_n k_n√J_n/2: the monopole that radiates the same power as the
bar's own motion, the strip's dipole rolled off as in section 3. It is
panned by the bar's place along the frame (low notes left). A single forte
note peaks at 0.27–0.32 across the keyboard.

### 10. The engine

* **Bar modes 2–5 and torsion** run as exact two-pole recursions (the
  impulse-invariant discretisation of shared/dsp.js's `modeCoeffs`), exact
  in frequency and decay at any step.
* **Bar mode 1 and the tube** run together by the implicit midpoint rule,
  (2M + hC + ½h²K) v_m = 2Mv − hKx + hf, which is unconditionally stable
  and conserves energy without losses. Each stiffness is pre-warped by
  (tan x/x)², x = ½h√(K/M), so each oscillator keeps its own frequency
  exactly. The disc's angle enters M₂₂ every sample.
* **Voices**: one per bar, so re-striking a ringing bar strikes the same
  bar where it is. At most 16 sound at once; beyond that the one with the
  least energy fades out over 30 ms, never one younger than 50 ms or with
  a mallet on it. A bar frees its voice 90 dB below its peak energy (70 dB
  once damped). Changing the undercut gives the key a new bar, and the old
  one fades.
* **Knobs glide** (30 ms; the disc phases 0.3 s, as if turned by hand), so
  nothing clicks. The bars' modes (2 ms of FEM each, 12 ms when the
  undercut knob has moved and the bar must be re-cut) are built on the page
  and sent with each note, a key at a time ahead of use, so the audio
  thread never solves a bar.
* **In C++**: the engine and model are C++ (`native/instruments/vibraphone`),
  run as WebAssembly on this page and as plugins (CLAP, VST3, AU and a
  standalone app), where CC64 is the damper pedal and the mod wheel the
  shaft speed. The page builds each bar with the WebAssembly model and sends
  it with the note; a plugin builds every bar on a worker thread as soon as
  the undercut knob settles, and a note whose bar isn't ready yet waits a
  few milliseconds for it. It was ported from the first, JavaScript version,
  and played what that played to within 10⁻⁷ of the peak (float32 output
  rounding). Ten bars take about 2 % of a core; a bar's modes take 2–7 ms
  to build.

## What to listen for

`examples/vibraphone/` (regenerate with `node tools/render-vibraphone.mjs`):

1. **01-ballad-slow-motor-pedal-down**: four chords and a melody, the pedal
   held through each chord, a slow motor (3.2 Hz): the instrument as it
   is usually heard.
2. **02-motor-off-then-on-held-chord**: A3–C4–E4–G4 held with the discs
   open, then the motor starts (2.5 rev/s): the shaft spins up and a 5 Hz
   pulse appears.
3. **03-with-resonators-then-without**: the same phrase, then with the
   tubes taken away: thin, glassy and quiet, the fundamental 30 dB down
   and the upper partials left on their own.
4. **04-tuned-bars-then-plain-bars**: F4–A4–C5–F5 struck near the end, so
   the upper modes speak, on tuned bars (partials at two octaves and three
   octaves and a third) and then on plain bars (2.76 and 5.40 × f₁): a
   clangy, out-of-tune halo.
5. **05-tube-close-bar-and-tube-beat**: F3 with its tube at 30 mm, then
   pressed to 6 mm: the pair splits by 8.8 Hz and the note throbs as bar and
   tube hand the energy back and forth.
6. **06-discs-aligned-then-twisted**: a G chord with every disc aligned,
   pulsing as one; then with the discs 40° apart along the shaft and the
   accidentals' shaft 90° behind: the pulse ripples through the chord.
7. **07-soft-yarn-then-hard-cord-mallets**: an arpeggio with a soft head
   (80 N at 1 mm), then a hard cord one (6000 N, 9 g): from a round tone to
   a bright ping, the 4th and 10th partials ringing over it.
8. **08-centre-end-and-node-strikes**: D4 and A4 struck at the centre (pure:
   mode 2 is silent), at the end (every mode), and on mode 1's node (the
   fundamental gone, the upper partials left).

On the page, the **bar** view draws the struck bar to scale with its
undercut, the cords, the mallet and the damper, and its first three modes
moving with their live amplitudes. The **resonator** view shows the tube's
standing wave and its disc turning, how κ and the tube's pitch change over
one turn, and the energy in bar and tube: watch it trade back and forth
with the *Tubes pressed close* preset, and pulse with the motor on. The
**spectrum** marks the model's lines, and the **mode table** lists each
mode's frequency, its ratio, a plain bar's ratio, its T₆₀ alone and how
strongly the strike point excites it.

## Files

```
vibraphone/index.html, style.css          page
vibraphone/src/bar.js                     the blanks, Timoshenko bending FEM, banded eigensolver, undercut optimiser (for the tuning tool)
vibraphone/src/bar-table.js               the tuned bars (generated by tools/vibraphone-bars.mjs)
vibraphone/src/vibraphone-instrument.js   the descriptor: parameters, keys, pedal, wheel, engine
vibraphone/src/vibraphone-params.js       parameters and presets
vibraphone/src/vibraphone-main.js         page wiring and views
vibraphone/src/vibraphone-wasm.js         the C++ engine and model as WebAssembly (vibraphone/wasm/vibraphone.wasm)
native/instruments/vibraphone/            the physics in C++: FEM (bar), bars, losses, radiation, tubes, coupling, discs,
                                          mallet (vibraphone-model), the engine, generated tables, reference
test/vibraphone-tests.mjs                 node test/vibraphone-tests.mjs (24 tests, ~35 s, on the WebAssembly)
tools/vibraphone-bars.mjs                 node tools/vibraphone-bars.mjs → vibraphone/src/bar-table.js and its C++ copy
tools/render-vibraphone.mjs               node tools/render-vibraphone.mjs → examples/vibraphone/
```

## Simplifications

* **Dimensions are plausible, not measured.** The thickness, the widths, the
  tube bores and the family of cut shapes (a flat centre with cosine sides,
  its flat share set by a rule) are reasonable choices, not a Deagan's
  drawings. Real cuts are shaped by hand, and real top bars are often only
  tuned 1 : 4, which lets them be longer than the 14 cm here.
* **A beam, not a solid.** Bending along the length and Saint-Venant
  torsion, without warping or the bar's sideways bending and width modes;
  Roark's torsion constant is an approximation, best for thin sections.
* **Losses are estimates.** η is a knob; the cords are linear dashpots of a
  chosen strength; the bar's radiation treats it as a compact strip with a
  roll-off, and its torsional radiation is a cruder estimate still.
* **The tube is one lumped mode**, and only bar mode 1 couples to it. Its
  next modes (3 and 5 × f₁) are far from the bar's 4 and 10. The gap's
  inertance is a radial-flow estimate that ignores the parts of the mouth
  the bar does not cover. Losses at the disc, the shaft and the bottom plug
  are left out, so the bass tubes may be sharper resonators than real ones,
  which would make the bass's pitch wobble (section 6) larger than on an
  instrument.
* **The disc** only adds end correction; its flow losses, and any jet
  formed past its edges, are left out, and the value of ℓ_v is an estimate.
* **The mallet** is a point contact with a power-law, slightly lossy
  head. It lifts away after one contact; its stick does not flex and it
  never double-strikes.
* **No sympathetic resonance**: neighbouring bars and tubes do not drive
  each other, and the frame does not ring.
* **One listener**: a power-equivalent mix, not a directivity pattern (the
  bar's dipole radiates mostly up and down, the tubes all round).
* **Temperature**: aluminium's dE/dT is a typical value; the bars' and the
  air's temperatures are taken to be equal.

## Prior art and references

**The original instrument.**
- J. C. Deagan (1919). "Xylophone." US Patent 1,293,723 (filed 1917).
  [Google Patents](https://patents.google.com/patent/US1293723A).
  Shutters over the resonator mouths, closed further as the temperature
  rises, to keep the tubes in tune.
- H. E. Winterhoff (1927). "Musical bar." US Patent 1,632,751 (filed
  1923, assigned to Leedy Manufacturing Co.).
  [Google Patents](https://patents.google.com/patent/US1632751A). Undercut
  bars with the first overtone tuned to an octave relation.
- M. L. Jones (1930). "Musical instrument." US Patent 1,760,141 (filed
  1928, assigned to J. C. Deagan Inc.).
  [Google Patents](https://patents.google.com/patent/US1760141A).
  Pedal-released damper for metal-bar instruments with fan blades turning
  in the resonators.
- H. J. Schluter (1931). "Vibrant bar for musical instruments." US Patent
  1,838,502 (filed 1930, assigned to J. C. Deagan Inc.).
  [Google Patents](https://patents.google.com/patent/US1838502A). Bars
  thinned so the overtones fall in harmonic relation.
- W. D. Gladstone (1932). "Percussion musical instrument." US Patent
  1,843,553 (filed 1930).
  [Google Patents](https://patents.google.com/patent/US1843553A). A
  revolving fan ("pulsator") in each resonator.
- H. A. Bower (1933). "Control mechanism for vibra harps." US Patent
  1,902,614 (filed 1931).
  [Google Patents](https://patents.google.com/patent/US1902614A).
  Player-controlled motor speed for the tremolo.
- J. Blades & T. Brett (2014). "Vibraphone [vibraharp] (USA)." *Grove
  Music Online*.
  [doi:10.1093/gmo/9781561592630.article.A2258609](https://doi.org/10.1093/gmo/9781561592630.article.A2258609).
- J. Holland, J. Blades & A. B. Acker (2018). "Celesta." *Grove Music
  Online*.
  [doi:10.1093/omo/9781561592630.013.3000000242](https://doi.org/10.1093/omo/9781561592630.013.3000000242).

**The physics.**
- F. Orduña-Bustamante (1991). "Nonuniform beams with harmonically
  related overtones for use in percussion instruments." *J. Acoust. Soc.
  Am.* 90(6), 2935–2941.
  [doi:10.1121/1.401768](https://doi.org/10.1121/1.401768). Erratum:
  91(6), 3582–3583 (1992),
  [doi:10.1121/1.403816](https://doi.org/10.1121/1.403816).
- I. Bork (1995). "Practical tuning of xylophone bars and resonators."
  *Applied Acoustics* 46(1), 103–127.
  [doi:10.1016/0003-682X(95)93953-F](https://doi.org/10.1016/0003-682X%2895%2993953-F).
- J. Petrolito & K. A. Legge (1997). "Optimal undercuts for the tuning of
  percussive beams." *J. Acoust. Soc. Am.* 102(4), 2432–2437.
  [doi:10.1121/1.419625](https://doi.org/10.1121/1.419625).
- N. H. Fletcher & T. D. Rossing (1998). "Mallet percussion
  instruments." In *The Physics of Musical Instruments*, 2nd edn,
  623–648. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_19](https://doi.org/10.1007/978-0-387-21603-4_19).
- I. Bork, A. Chaigne, L.-C. Trebuchet, M. Kosfelder & D. Pillot (1999).
  "Comparison between modal analysis and finite element modelling of a
  marimba bar." *Acta Acust. united Acust.* 85, 258–266 (no DOI).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific, Singapore. [doi:10.1142/4294](https://doi.org/10.1142/4294).
  Chapter 7, "Metallophones", 64–78:
  [doi:10.1142/9789812709288_0007](https://doi.org/10.1142/9789812709288_0007).
- T. D. Rossing (2001). "Acoustics of percussion instruments: recent
  progress." *Acoust. Sci. Technol.* 22(3), 177–188.
  [doi:10.1250/ast.22.177](https://doi.org/10.1250/ast.22.177).
- F. Soares, J. Antunes & V. Debut (2021). "Multi-modal tuning of
  vibrating bars with simplified undercuts using an evolutionary
  optimization algorithm." *Applied Acoustics* 173, 107704.
  [doi:10.1016/j.apacoust.2020.107704](https://doi.org/10.1016/j.apacoust.2020.107704).
- F. Soares, J. Antunes & V. Debut (2021). "Tuning of bending and
  torsional modes of bars used in mallet percussion instruments."
  *J. Acoust. Soc. Am.* 150(4), 2757–2769.
  [doi:10.1121/10.0006573](https://doi.org/10.1121/10.0006573).
- D. Beaton & G. Scavone (2021). "Three-dimensional tuning of idiophone
  bar modes via finite element analysis." *J. Acoust. Soc. Am.* 149(6),
  3758–3768. [doi:10.1121/10.0005062](https://doi.org/10.1121/10.0005062).
- D. Beaton & G. Scavone (2022). "Experimental measurements of a
  prototype vibraphone bar with three-dimensional cutaway geometry."
  *JASA Express Lett.* 2(8), 083201.
  [doi:10.1121/10.0013470](https://doi.org/10.1121/10.0013470).

**Earlier models and synthesis projects.**
- V. Doutaut & A. Chaigne (1994). "Numerical simulations of bar
  percussion instruments." *J. Phys. IV* 4(C5), C5-613–C5-616.
  [doi:10.1051/jp4:19945131](https://doi.org/10.1051/jp4:19945131).
- A. Chaigne & V. Doutaut (1997). "Numerical simulations of xylophones.
  I. Time-domain modeling of the vibrating bars." *J. Acoust. Soc. Am.*
  101(1), 539–557. [doi:10.1121/1.418117](https://doi.org/10.1121/1.418117).
  Finite-difference model of a non-uniform damped bar struck by a mallet
  with Hertzian contact.
- V. Doutaut, D. Matignon & A. Chaigne (1998). "Numerical simulations of
  xylophones. II. Time-domain modeling of the resonator and of the
  radiated sound pressure." *J. Acoust. Soc. Am.* 104(3), 1633–1647.
  [doi:10.1121/1.424376](https://doi.org/10.1121/1.424376). Adds the
  coupled tubular resonator and radiation; applied to xylophone, marimba
  and vibraphone.
- G. Essl & P. R. Cook (1999). "Banded waveguides: towards physical
  modeling of bowed bar percussion instruments." *Proc. ICMC 1999*.
  [hdl:2027/spo.bbp2372.1999.408](https://hdl.handle.net/2027/spo.bbp2372.1999.408).
- G. Essl & P. R. Cook (2000). "Measurements and efficient simulations of
  bowed bars." *J. Acoust. Soc. Am.* 108(1), 379–388.
  [doi:10.1121/1.429471](https://doi.org/10.1121/1.429471).
- L. Henrique & J. Antunes (2003). "Optimal design and physical modelling
  of mallet percussion instruments." *Acta Acust. united Acust.* 89,
  948–963 (no DOI). [Author preprint](http://projects.itn.pt/Mafra/File4.pdf).
  Finite-element optimisation of vibraphone and marimba bar profiles
  (e.g. 1:4:10), then modal synthesis of mallet impacts.
- G. Essl, S. Serafin, P. R. Cook & J. O. Smith (2004). "Theory of banded
  waveguides." *Computer Music J.* 28(1), 37–50.
  [doi:10.1162/014892604322970634](https://doi.org/10.1162/014892604322970634).
- P. Rucz, M. Á. Ulveczki, J. Angster & A. Miklós (2021). "Simulation of
  mallet percussion instruments by a coupled modal vibroacoustic finite
  element model." *J. Acoust. Soc. Am.* 149(5), 3200–3212.
  [doi:10.1121/10.0004216](https://doi.org/10.1121/10.0004216). Coupled
  3D bar, resonator and radiation model with nonlinear mallet contact.
- F. Soares, J. Antunes & V. Debut (2022). "A minimal model of the
  bar-resonator vibroacoustic interaction in mallet percussion
  instruments." *Applied Acoustics* 199, 109049.
  [doi:10.1016/j.apacoust.2022.109049](https://doi.org/10.1016/j.apacoust.2022.109049).
  The bar's fundamental as an oscillator coupled to the tube: the
  two-oscillator model of this brief.
- F. Soares, V. Debut & J. Antunes (2023). "The bar-resonator interaction
  in mallet percussion instruments: a multi-modal model and experimental
  validation." *J. Sound Vib.* 548, 117528.
  [doi:10.1016/j.jsv.2022.117528](https://doi.org/10.1016/j.jsv.2022.117528).
- [STK ModalBar](https://ccrma.stanford.edu/software/stk/classstk_1_1ModalBar.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): modal struck bar with
  marimba and vibraphone presets and vibrato controls.
- [Csound `vibes` opcode](https://csound.com/docs/manual/vibes.html)
  (J. ffitch after P. R. Cook): struck metal bar as in a vibraphone, with
  tremolo frequency and amplitude inputs.
- [Faust physmodels.lib `marimbaModel`](https://faustlibraries.grame.fr/libs/physmodels/)
  (GRAME Faust libraries): modal bar generated with Mesh2Faust from a 3D
  model, coupled to a resonance tube.
- [Pianoteq Vibes](https://www.modartt.com/vibes) (Modartt, 2009):
  physically modelled vibraphones with adjustable tremolo and mallet
  hardness.
- [Pianoteq Celeste](https://www.modartt.com/celeste) (Modartt, 2010):
  physically modelled celesta and glockenspiel.
- [Pianoteq Xylo](https://www.modartt.com/xylo) (Modartt, 2010):
  physically modelled xylophone and bass marimba.
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/)
  (Applied Acoustics Systems, 2020; first version 2011): pairs of coupled
  modelled resonators, including beam, marimba and tube types, excited by
  a mallet.
- [Collision](https://www.ableton.com/en/packs/collision/) (Ableton with
  Applied Acoustics Systems, 2009): physically modelled mallet and
  resonators for Ableton Live.

**Further sources used in this model.**

* G. R. Cowper, "The shear coefficient in Timoshenko's beam theory",
  *J. Appl. Mech.* 33 (1966).
* J. N. Reddy, "On locking-free shear deformable beam finite elements",
  *Comput. Methods Appl. Mech. Eng.* 149 (1997): interdependent
  interpolation.
* W. C. Young and R. G. Budynas, *Roark's Formulas for Stress and Strain*,
  7th ed., McGraw-Hill (2002): the torsion constant of a rectangle.
* C. Zener, "Internal friction in solids II: general theory of
  thermoelastic internal friction", *Phys. Rev.* 53, 90 (1938).
* H. Levine and J. Schwinger, "On the radiation of sound from an
  unflanged circular pipe", *Phys. Rev.* 73, 383 (1948): the 0.61a end
  correction.
* V. Chatziioannou and M. van Walstijn, "Energy conserving schemes for the
  simulation of musical instrument contact dynamics", *J. Sound Vib.* 339
  (2015).
