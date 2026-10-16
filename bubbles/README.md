# Bubble Organ

A row of 52 nozzles on the floor of a tank of water, one per key, A3 to C8.
Press a key and its nozzle lets go a gas bubble, which rings at its Minnaert
frequency: the gas inside is the spring, and the water that moves with the
wall is the mass. Hold the key and the nozzle keeps bubbling, a brook. Each
ring is a linear model of the bubble's breathing, with nothing sampled: heat
flowing between the gas and the water, viscosity, sound radiated into the
water, and the free surface above all set its pitch and how long it rings.
That makes the tank itself an instrument. Lower the nozzles and every note
rises; pump the air out and the keyboard falls about an octave. Change the
gas and the bubbles go up or down by different amounts at the top and the
bottom of the keyboard. Fill the tank with glycerol and the treble only thuds.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/bubbles/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (52 nozzles, A3–C8); hold a key for a brook |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the neck snaps as the bubble pinches off |
| `Space` | hold: keys latch while it is down, so their brooks keep running |
| MIDI | notes, velocity, hold pedal (CC64); **mod wheel = bubbles per second**; aftertouch = more gas, more bubbles |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: more gas, more bubbles |

## The physics

### 1. A bubble is a spring and a mass

A bubble of radius R in a liquid of density ρ at pressure p₀ breathes: its
wall moves in and out, the gas pushing back like a spring. Almost all the
kinetic energy is in the liquid around it, which moves as if the bubble had
a mass of 4πρR³ (three times the displaced liquid). For a small breathing
motion, x = R(t) − R₀, Rayleigh and Plesset's equation reduces to a damped
oscillator,

  ẍ + 2b ẋ + ω₀² x = 0,    ω₀² = 3κ p₀ / ρR²

with κ the gas's polytropic exponent. Minnaert (1933) took κ = γ (an
adiabatic gas), which gives

  f₀ = (1/2πR) √(3γp₀/ρ),    f₀R = 3.26 kHz·mm for air in water (10⁵ Pa, 1000 kg/m³)

At one atmosphere in water at 20 °C (101.3 kPa, 998.2 kg/m³) the product is
3.29 kHz·mm. A 1 mm bubble sings at about 3.3 kHz and a 1 cm bubble at about
330 Hz: the sound of running water. The tests check the model against this
formula to 10⁻⁶ once heat flow, surface tension, losses and the surface are
switched off.

### 2. Heat flow: κ between 1 and γ

As the bubble is squeezed its gas heats up, and some of that heat leaks
into the water during each cycle. That makes the spring softer (κ < γ) and
lossy. In the linear theory (Prosperetti 1977; Commander and Prosperetti
1989) the gas pressure responds to the volume through a complex
polytropic index Φ,

  Φ = 3γ / (1 − 3(γ − 1) iχ [√(i/χ) coth √(i/χ) − 1]),    χ = D/ωR²

where D is the gas's thermal diffusivity, so that √χ compares the thermal
layer √(2D/ω) with the radius. Then κ = Re Φ / 3, and Im Φ is the thermal
loss. A thick bubble (χ → 0) is adiabatic, Φ → 3γ; a tiny one (χ → ∞) is
isothermal, Φ → 3. Devin (1959) wrote the same result in real functions of
X = R√(2ω/D):

  κ = γ / {(1 + d²) [1 + (3(γ−1)/X)(sinh X − sin X)/(cosh X − cos X)]}
  d = 3(γ−1)[X(sinh X + sin X) − 2(cosh X − cos X)] / [X²(cosh X − cos X) + 3(γ−1)X(sinh X − sin X)]

The two forms are algebraically identical (the tests check them against
each other to 10⁻¹², and both against their adiabatic and isothermal
asymptotes). D = K/(ρ_g c_p) depends on the gas's density, so it falls as
the pressure rises: deeper bubbles are more adiabatic. Air at 1 atm has
D = 21 mm²/s, so the thermal layer is 40 µm thick on the top key's bubble
(R = 0.78 mm) and 0.17 mm on the bottom key's (R = 15 mm): every bubble on
this keyboard is nearly adiabatic, κ = 1.36 at the top and 1.39 at the
bottom.

Because Φ depends on ω, and ω on Φ, the engine solves for both together (a
few fixed-point steps) when each bubble is born.

### 3. Surface tension

The gas inside is at p_b = p₀ + 2σ/R, and the wall's own tension adds a
stiffness of its own, so in full

  ω₀² = [p_b Re Φ − 2σ/R] / ρR²m,    i.e. [3κp₀ + 2(3κ − 1)σ/R] / ρR² for m = 1

(m is the surface's image, section 5). For water σ = 72.8 mN/m: 2σ/R is
186 Pa on the top key's bubble, 0.2 % of p₀, and raises its pitch by 1.2 ¢.
Surface tension matters for bubbles below about 10 µm, not for these.

### 4. Losses: heat, viscosity, radiation

The damping b is the sum of three parts. As dimensionless damping
constants, δ = 2b/ω₀ = 1/Q (Devin's convention), they are

  δ_th = p_b Im Φ / ρω²R²m      heat flow into the liquid
  δ_vis = 4μ / ρωR²m            the liquid's viscosity at the moving wall
  δ_rad = (ωR/c)(1 − sin 2kd/2kd) / m      sound radiated into the liquid, k = ω/c

and a note's amplitude falls as e^(−bt), 60 dB in T₆₀ = 6.91/b. Far from any
surface, δ_rad = ωR/c = √(3κp₀/ρ)/c = 0.0137 for air in water, the same for
every size. For a 1 mm air bubble at 1 atm the model gives δ_th = 0.0254,
δ_rad = 0.0137, δ_vis = 0.0002: δ = 0.039, Q = 25. Heat flow peaks for bubbles
of 10–20 µm (δ_th ≈ 0.12, κ ≈ 1.1), where the thermal layer is comparable
with the radius; viscosity only wins for bubbles of a few microns. On this
keyboard, at the defaults (30 cm of water, air, 1 atm):

| key | f (Hz) | R | κ | δ_th | δ_rad | δ_vis | δ | Q | T₆₀ |
|---|---|---|---|---|---|---|---|---|---|
| A3 | 220 | 15.27 mm | 1.390 | 0.0067 | 0.0007 | 1.3×10⁻⁵ | 0.0074 | 135 | 1.35 s |
| C4 | 261.6 | 12.80 mm | 1.390 | 0.0073 | 0.0010 | 1.5×10⁻⁵ | 0.0083 | 120 | 1.01 s |
| A4 | 440 | 7.56 mm | 1.386 | 0.0094 | 0.0028 | 2.6×10⁻⁵ | 0.0123 | 82 | 0.41 s |
| C5 | 523.3 | 6.35 mm | 1.385 | 0.0103 | 0.0038 | 3.0×10⁻⁵ | 0.0141 | 71 | 0.30 s |
| C6 | 1046.5 | 3.15 mm | 1.379 | 0.0145 | 0.0115 | 6.1×10⁻⁵ | 0.0261 | 38 | 81 ms |
| C7 | 2093 | 1.58 mm | 1.370 | 0.0201 | 0.0162 | 1.2×10⁻⁴ | 0.0364 | 27 | 29 ms |
| C8 | 4186 | 0.78 mm | 1.358 | 0.0279 | 0.0151 | 2.5×10⁻⁴ | 0.0433 | 23 | 12 ms |

The low bubbles ring for a second; the high ones are ticks. The bass's
radiation is small here because of the surface above it (next section).

### 5. The free surface above

The water's surface is free: the pressure there cannot change. To the
bubble it is as if a mirror bubble breathed in antiphase at height d above
the surface, 2d away. Seen from the bubble, that image does two things.
It lightens the liquid the bubble must push (it is pulling the same water
the other way), and it cancels the bubble's sound far away, so it radiates
less. With the mutual radiation impedance of two point sources a distance
2d apart, the inertia is scaled by

  m = 1 − (R/2d) cos 2kd

and the radiated power by 1 − sin 2kd/2kd. When the surface is close
compared with a wavelength (2kd ≪ 1) this is a light, poorly radiating
dipole: 30 cm down, the A3 bubble rings 19 ¢ higher than in open water and
radiates 5 % of its free-field power (C4: 15 ¢, 7 %; A4: 5 ¢, 20 %; C6: 83 %),
which is why the bass rings so long at the defaults. Ten metres down the
image is gone and A3's ring shortens from 1.35 s to 0.31 s. The image term
is the leading one in R/2d; the model caps R/2d at ¼, a bubble 2R below the
surface. The same rise in pitch is described by Leighton (1994) and used for
liquid sounds by van den Doel (2005), up to √2 for a bubble touching the
surface.

### 6. The keyboard: which bubbles

Each nozzle releases bubbles of the radius that sounds its note at the
defaults (30 cm down, air, water, 1 atm), solved from the full model: from
15.3 mm at A3 to 0.78 mm at C8. Below A3 the bubbles would be over 3 cm
across. They are not spheres any more: bubbles over about a millimetre are
flattened and wobble as they rise, and above about a centimetre they are
spherical caps. The breathing mode of a moderately distorted bubble rings
close to that of the sphere of the same volume (Strasberg 1953), so the
model uses the equal-volume sphere throughout; the tank view draws them
flattened.

Pressing a key releases its first bubble at once, at exactly the nozzle's
size, so a tapped key is always in tune. While the key is held the nozzle
keeps releasing bubbles at **Bubbles per second**. The gaps are a blend of
regular and random, T·[(1 − j) + j·E] with E exponential of mean 1 and j the
**Irregularity**, so the mean rate is exact and j = 1 gives independent
(Poisson) releases. The bubbles after the first form in the wake of the ones
before them and scatter in size by the **Size spread** (a normal spread,
clipped at 2.5σ): 1 % bigger rings 17 ¢ flat. Their kicks scatter too, by
25 % × the irregularity (one standard deviation). Aftertouch opens the gas
further, up to three times the rate. Striking a held key again releases its next bubble at once and
restarts the gaps from there; it never adds a second nozzle. All of this
randomness comes from one seeded generator, so a render repeats exactly.

### 7. Depth, pressure, gas and liquid retune it

Everything in section 1 to 5 depends on the tank, so changing it retunes
the whole keyboard; that is the instrument.

**Depth.** The nozzles sit at depth h, so the liquid pressure on them is
p₀ = p_air + ρgh, one more atmosphere every 10.3 m. Pitch goes as √p₀
(times √κ, which drifts a little because thin gas is more isothermal: the
tests check f ∝ √(p₀κ/m) to 0.3 %). At 10 m every key is 544–571 ¢ up; at
20 m (2.93 atm) 891–921 ¢, a major sixth. Down there the surface no longer
quietens the bass, and A3's ring shortens to 0.22 s.

**Pressure.** Pumping the air out lowers every pitch by √(p₀ ratio): a
quarter of an atmosphere (0.279 atm at the nozzles) puts the keyboard
1137–1171 ¢ down, about an octave. Bubbles already ringing follow the knob
too (it glides with a 50 ms time constant): squeezed as well as stiffened,
they rise by more than √(p₀ ratio).

**Gas.** The gas acts through γ and through its thermal diffusivity D:

| gas | γ | D at 1 atm | A3 | C6 | C8 | Q at C8 |
|---|---|---|---|---|---|---|
| air | 1.40 | 21 mm²/s | 0 | 0 | 0 | 23 |
| helium | 5/3 | 175 mm²/s | +129 ¢ | +101 ¢ | +50 ¢ | 8 |
| argon | 5/3 | 20 mm²/s | +147 ¢ | +143 ¢ | +136 ¢ | 17 |
| SF₆ | 1.10 | 3.2 mm²/s | −203 ¢ | −196 ¢ | −185 ¢ | 62 |

Adiabatic bubbles would move by √(γ ratio): +151 ¢ for helium and argon,
−209 ¢ for SF₆. Argon, a slow conductor like air, nearly does. Helium's
thermal diffusivity is eight times air's: its small bubbles fall back
towards isothermal (κ = 1.44 at C8, against γ = 1.67), so the top of the
keyboard moves only half a semitone, and heat flow damps them hard (Q = 8).
In the isothermal limit the gas would not matter at all; the tests check
both limits. SF₆ conducts so little heat that its bubbles barely lose any:
with the surface also stopping the bass from radiating, its A3 rings for
9 s at the defaults (Q ≈ 800).

**Liquid.** The liquid is the mass (ρ) and the viscous loss (μ):

| liquid | ρ (kg/m³) | μ | pitch | Q at A3, C6, C8 | T₆₀ at A3, C8 |
|---|---|---|---|---|---|
| water | 998.2 | 1.0 mPa·s | 0 | 135, 38, 23 | 1.35 s, 12 ms |
| 90 % glycerol | 1234.7 | 0.219 Pa·s | −177 ¢ | 103, 31, 12 | 1.13 s, 7 ms |
| glycerol | 1261 | 1.41 Pa·s | −195 ¢ (−223 ¢ at C8) | 43, 10, 2.9 | 0.48 s, 1.7 ms |

Glycerol is 1400 times as viscous as water. The brief for this instrument
said that would kill the ring, and for the treble it does: on C8,
δ_vis = 0.31 and the ring is 40 dB down in under five periods, a thud. But
δ_vis = 4μ/ρωR² falls as 1/R (ωR is fixed), so the bass still rings for
half a second. That is the physics, and you can hear the boundary move
through the keyboard.

With **Keep in tune** on, each nozzle instead releases the radius that
sounds its note under the current conditions (bigger bubbles 20 m down,
smaller ones in glycerol or under a vacuum), so the keyboard stays on pitch
while the rings, levels and rise speeds change.

### 8. The kick at pinch-off

A bubble is born ringing. As it pinches off the nozzle its neck snaps
shut under surface tension, and the gas is left out of equilibrium with
the new, closed wall (Longuet-Higgins 1989 worked out how a newborn
bubble's distorted shape drives its breathing; Deane and Czerski 2008
traced the kick of nozzle bubbles to the collapse of the neck). The model takes the
simplest version: a pressure step Δp, a fraction ε of the Laplace pressure
2σ/R, with ε = 0.5 × velocity. The wall's equilibrium moves by
a = Δp/(ρRmω₀²), and the wall rings about it. The pressure it radiates is
ρ times the volume acceleration over 4πr,

  p = ρ V̈ / 4πr = ρR²ẍ / r,    which starts at   R Δp / mr = 2εσ / mr

the same for every size of bubble. A big bubble moves more water (its
volume velocity grows as R) but more slowly, and the two cancel in the
pressure. That is how the keyboard balances: by the physics of the kick, no
voicing. At full velocity the kick is 4.8 Pa on A3's bubble and 93 Pa on
C8's, the wall moves by 1×10⁻⁵ and 2×10⁻⁴ of its radius, and the sound is
0.157 Pa at 46.5 cm. Such small strains are well inside the linear theory.

The neck does not snap instantly. The model ramps Δp along a raised cosine
over the **Neck snap time** (50 µs by default). A ramp shorter than a
period rings the bubble fully; a longer one is a gentle push that the
bubble follows, and the ring that is left is the ramp's spectrum at f₀,
cos(πfτ)/(1 − 4f²τ²). With a 1 ms snap A3 loses 0.4 dB, C5 2.3 dB, C6
10.7 dB, C7 24.7 dB and C8 38 dB: the treble hardly rings (tested).

### 9. Rising, and the "bloop" that isn't

Once free, the bubble rises. Buoyancy against the added mass ½ρV starts it
at 2g, and drag holds it at a terminal speed U:

  dv/dt = 2g(1 − v²/U²),    z = (U²/2g) ln cosh(2gt/U)

Small bubbles, or any in glycerol, creep up at the Hadamard–Rybczynski
speed of a clean bubble in slow viscous flow, ρgR²/3μ; deformed mm–cm
bubbles in water rise at about Mendelson's (1967) wave speed √(σ/ρR + gR).
The model blends the two, U = (U_HR⁻² + U_M⁻²)^(−½): 0.23–0.39 m/s across
the keyboard in water, 34 cm/s for A3 and 1.8 mm/s for C8 in glycerol.

The brief for this instrument expected the pitch to fall as the bubble
rises (less water above it) and called that the bubble's "bloop". The
bubble does rise into lower pressure, and it swells (R ∝ p_b^(−1/3n), with
the slow exponent n from the same heat-flow theory at 3 Hz: 1.00 for C8's
bubble, 1.32 for A3's, whose gas takes over a second to share its heat).
But it rings for milliseconds to a second, and in that time it rises
centimetres. One metre down, A3's bubble falls 3.5 ¢ in its first 0.1 s
(by which time it is 8 dB quieter) and 7.6 ¢ in 0.2 s (−17 dB); C5's falls
3 ¢ while it dies by 41 dB. That glide is real and in the model, but it is
far too small to hear as a bloop.

Near the surface the image of section 5 wins instead: as the bubble rises,
its image comes closer and its pitch goes **up**. The two balance about 25
cm down for A3's bubble, 17 cm for C5's and 12.5 cm for C6's. At the default
30 cm, A3 drifts by under 1 ¢ for 0.2 s and then climbs 7 ¢ by 0.4 s; with the
nozzles 10 cm down it climbs 34 ¢ in its first 0.1 s and far more in its last
few centimetres (where the leading-order image term is only a rough guide)
before it bursts at the surface and stops. That is the same direction as
the chirp in the plink of a drop falling into water, whose bubble is born
just under a moving surface; that case needs the shape of the crater, and
is left out.

### 10. What you hear: two hydrophones

You listen through two hydrophones at nozzle depth, 35 cm in front of the
1.02 m row of nozzles, at 20 % and 80 % of its length. Each hears every
bubble's direct sound, ρR²ẍ/r, falling as 1/r from its nozzle. A centre
nozzle is 46.5 cm from both; an end nozzle is 6.8 dB louder on its own
side than on the other. Low notes are on the left because the row runs low to high.

### 11. The engine

* **Each bubble** is a rotating phasor u, multiplied every sample by
  e^((−b + iω_d)/fs), the exact solution of ẍ + 2bẋ + ω₀²x = 0 at any
  step, and the output is Re(s²u) = ẍ with s = −b + iω_d.
* **The snap** moves the equilibrium along a raised cosine, taken
  piecewise linear between samples. The phasor tracks the wall's deviation
  from the moving particular solution, which rings freely between samples,
  and jumps by a closed-form amount at each change of slope. The output is
  then exactly ẍ, with no staircase (an earlier version stepped the
  equilibrium sample by sample, which put a −30 dB artefact on slow snaps).
* **The glide**: every block (128 samples) each bubble's depth, size,
  image, frequency and damping are recomputed (with Φ kept from its
  birth), and s and the output gain are swept linearly across the block,
  so nothing steps.
* **Bubbles** live in a fixed pool of 192, and nothing is allocated while
  it plays. A bubble is freed 80 dB below its peak, or 2 ms after it
  reaches the surface. Beyond 160 ringing, each new release fades the
  quietest bubble over 6 ms, never one younger than 12 ms.
* **Cost**: ten held keys at 48 kHz take 1–2 % of a core at the default 5
  bubbles/s (about 15 ringing) and 7–11 % at 40 /s each (130 ringing), in
  Node on the shared cloud machine this was built on.
* A single forte bubble peaks at 0.16–0.21 (velocity 1) wherever it is on
  the keyboard; a four-key forte chord stays under 1 even though the first
  bubbles of a chord all kick together.

## What to listen for

`examples/bubbles/` (regenerate with `node tools/render-bubbles.mjs`):

1. **01-a-tune-over-two-brooks**: a melody of single bubbles (tapped
   keys) over held bass notes, whose nozzles keep bubbling: a brook with a
   tune in it.
2. **02-surface-then-20-m-down-then-quarter-atmosphere**: the same phrase
   30 cm down, then 20 m down (a major sixth up, and the bass rings much
   shorter now the surface is far away), then under a quarter of an
   atmosphere (about an octave down).
3. **03-air-helium-argon-then-sf6**: one arpeggio from A3 to A7 in air,
   helium, argon and SF₆. Helium goes up 1.3 semitones in the bass but
   only half a semitone at the top, and dies fast; argon goes up almost
   1.5 semitones everywhere; SF₆ goes two semitones down and rings on.
4. **04-water-then-glycerol**: the same phrase in water, then glycerol:
   two semitones lower, the treble reduced to thuds, the bass still
   ringing.
5. **05-deep-then-shallow-bubbles-rise-in-pitch**: three big low bubbles
   1 m down (a few cents flat as they rise), then 10 cm down: each climbs
   in pitch as it nears the surface, and stops when it bursts.
6. **06-quick-neck-snap-then-slow**: an arpeggio up the keyboard with a
   50 µs pinch-off, then a 1 ms one: the low bubbles ring as before, the
   high ones barely sound.
7. **07-metronome-then-torrent**: one held key: even bubbles of one size,
   then 30 a second at random with a 6 % size spread.

On the page, the **tank** shows the nozzles and the bubbles rising from
them to scale (drawn twice their size), coloured by pitch and glowing
while they ring; with glycerol you can watch the small ones crawl. The
**latest bubble** view draws the pressure the engine computed for the last
bubble released, the model's decay envelope over it, and its pitch (the
model's, and the engine's from its zero crossings), κ and damping split
into heat, radiation and viscosity. **Damping across the keyboard** plots
Devin's δ_th, δ_rad and δ_vis for every key's bubble under the current
settings, with κ: switch the gas or the liquid and watch the curves move.
The **spectrum** marks each held key's predicted ring.

## Files

```
bubbles/index.html, style.css          page
bubbles/src/bubbles-model.js           bubble acoustics: Minnaert, heat flow (Φ), losses, the surface's image, rise, glide, kick (no audio, no DOM)
bubbles/src/bubbles-engine.js          real-time engine: nozzles, seeded brooks, bubble pool (AudioWorklet and Node)
bubbles/src/bubbles-params.js          parameters and presets
bubbles/src/bubbles-main.js            page wiring and views
test/bubbles-tests.mjs                 node test/bubbles-tests.mjs (24 tests, ~6 s)
tools/render-bubbles.mjs               node tools/render-bubbles.mjs → examples/bubbles/
```

## Simplifications

* **Spherical, linear breathing only.** The bubbles' shape modes, their
  wobble and zigzag as they rise, and the coupling between shape and
  volume are left out, and so are the losses they bring. The very long
  rings of the biggest bubbles (1.35 s at A3 in air, 9 s in SF₆) are upper
  bounds. The strains are 10⁻⁵ to 10⁻⁴, so the linear theory itself is
  safe.
* **Heat flow** follows the standard linear theory: uniform pressure in the
  gas, a liquid wall that stays at the liquid's temperature, and Φ taken at
  the real ring frequency (accurate for light damping; in glycerol, Q ≈ 3 at
  the top, the true complex frequency would differ a little). Φ is kept from
  each bubble's birth as it rises.
* **Water vapour** is left out: the bubbles are dry gas. If they were
  saturated with vapour that condensed and evaporated freely, it would add
  no stiffness and lower every pitch by about p_v/2p₀: 20 ¢ at 1 atm, 75 ¢
  at a quarter atmosphere.
* **The surface's image** is the leading term in R/2d, capped at ¼. The
  tank's walls and floor are taken to be far away and absorbing, so there
  are no tank modes.
* **The hydrophones hear the direct sound only.** The surface's reflection
  would reach them 0.2 ms later, inverted: at the default 30 cm it would
  take 6–13 dB off the bass and comb the top by about ±5 dB, and in a 10 cm
  tank it would cut most of the keyboard by 8–30 dB. Leaving it to the
  room keeps the keyboard even. The two hydrophones' 0.4 ms difference in
  arrival time is left out too.
* **The kick** is a stand-in for the pinch-off: a pressure step, a set
  share of 2σ/R, over a set snap time. Real nozzles kick harder or softer
  depending on their shape and the gas flow, and the first bubble of each
  press is taken at the nozzle's exact size by choice. The nozzles
  themselves (how a nozzle's size and flow set its bubble's size) are not
  modelled.
* **Rise speeds** blend two textbook limits; contaminated tap water slows
  mm bubbles to 0.1–0.2 m/s, and bubbles do not interact (no coalescence or
  wakes).
* **Fixed at 20 °C.** Gas and liquid properties are 20 °C values. SF₆'s
  thermal conductivity and heat capacity are approximate, and the 90 %
  glycerol's surface tension and sound speed are interpolated between water
  and glycerol (its density and viscosity are tabulated values).

## Prior art and references

**The physics, and the people who worked it out.**
- Lord Rayleigh (1917). "On the pressure developed in a liquid during the
  collapse of a spherical cavity." *Phil. Mag.* 34(200), 94–98.
  [doi:10.1080/14786440808635681](https://doi.org/10.1080/14786440808635681).
  The equation of radial motion of a spherical cavity in a liquid.
- M. Minnaert (1933). "On musical air-bubbles and the sounds of running
  water." *Phil. Mag.* 16(104), 235–248.
  [doi:10.1080/14786443309462277](https://doi.org/10.1080/14786443309462277).
  Identified the bubble's volume pulsation as the source of the sound and
  derived its frequency.
- M. Strasberg (1953). "The pulsation frequency of nonspherical gas
  bubbles in liquids." *J. Acoust. Soc. Am.* 25(3), 536–537.
  [doi:10.1121/1.1907076](https://doi.org/10.1121/1.1907076). The
  equal-volume sphere used here for flattened bubbles.
- M. Strasberg (1956). "Gas bubbles as sources of sound in liquids."
  *J. Acoust. Soc. Am.* 28(1), 20–26.
  [doi:10.1121/1.1908212](https://doi.org/10.1121/1.1908212).
- C. Devin (1959). "Survey of thermal, radiation, and viscous damping of
  pulsating air bubbles in water." *J. Acoust. Soc. Am.* 31(12),
  1654–1667. [doi:10.1121/1.1907675](https://doi.org/10.1121/1.1907675).
- A. Prosperetti (1977). "Thermal effects and damping mechanisms in the
  forced radial oscillations of gas bubbles in liquids." *J. Acoust. Soc.
  Am.* 61(1), 17–27. [doi:10.1121/1.381252](https://doi.org/10.1121/1.381252).
  The complex thermal factor Φ used here.
- K. W. Commander & A. Prosperetti (1989). "Linear pressure waves in
  bubbly liquids: comparison between theory and experiments." *J. Acoust.
  Soc. Am.* 85(2), 732–746.
  [doi:10.1121/1.397599](https://doi.org/10.1121/1.397599). The linearised
  bubble with Φ, in the form used here.
- T. G. Leighton & A. J. Walton (1987). "An experimental study of the
  sound emitted from gas bubbles in a liquid." *Eur. J. Phys.* 8(2),
  98–104. [doi:10.1088/0143-0807/8/2/005](https://doi.org/10.1088/0143-0807/8/2/005).
- M. S. Longuet-Higgins (1989). "Monopole emission of sound by asymmetric
  bubble oscillations. Part 1. Normal modes" and "Part 2. An initial-value
  problem." *J. Fluid Mech.* 201, 525–541 and 543–565.
  [Part 1](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/monopole-emission-of-sound-by-asymmetric-bubble-oscillations-part-1-normal-modes/2DFBAD97795CC340755BCFA47D19DFFA),
  [Part 2](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/monopole-emission-of-sound-by-asymmetric-bubble-oscillations-part-2-an-initialvalue-problem/2B068CABEA57CA14ABA9749E44485394).
- H. C. Pumphrey, L. A. Crum & L. Bjørnø (1989). "Underwater sound
  produced by individual drop impacts and rainfall." *J. Acoust. Soc. Am.*
  85(4), 1518–1526. [doi:10.1121/1.397353](https://doi.org/10.1121/1.397353).
- M. S. Longuet-Higgins (1990). "Bubble noise spectra." *J. Acoust. Soc.
  Am.* 87(2), 652–661. [doi:10.1121/1.398934](https://doi.org/10.1121/1.398934).
- H. N. Oğuz & A. Prosperetti (1990). "Bubble entrainment by the impact of
  drops on liquid surfaces." *J. Fluid Mech.* 219, 143–179.
  [doi:10.1017/S0022112090002890](https://doi.org/10.1017/S0022112090002890).
- M. S. Longuet-Higgins, B. R. Kerman & K. Lunde (1991). "The release of
  air bubbles from an underwater nozzle." *J. Fluid Mech.* 230, 365–390.
  [doi:10.1017/S0022112091000836](https://doi.org/10.1017/S0022112091000836).
- A. Prosperetti & H. N. Oğuz (1993). "The impact of drops on liquid
  surfaces and the underwater noise of rain." *Annu. Rev. Fluid Mech.* 25,
  577–602. [doi:10.1146/annurev.fl.25.010193.003045](https://doi.org/10.1146/annurev.fl.25.010193.003045).
- T. G. Leighton (1994). *The Acoustic Bubble*. Academic Press, London.
  Ch. 3, "The freely-oscillating bubble", pp. 129–286:
  [doi:10.1016/B978-0-12-441920-9.50008-0](https://doi.org/10.1016/B978-0-12-441920-9.50008-0).
- C. E. Brennen (1995). *Cavitation and Bubble Dynamics*. Oxford
  University Press. Rayleigh–Plesset, surface tension and the natural
  frequency.
- G. B. Deane & H. Czerski (2008). "A mechanism stimulating sound
  production from air bubbles released from a nozzle." *J. Acoust. Soc.
  Am.* 123(6), EL126–EL132.
  [doi:10.1121/1.2908198](https://doi.org/10.1121/1.2908198). The neck's
  collapse as the kick that starts the ring, used here.

**Rising bubbles and the liquids.**
- R. Clift, J. R. Grace & M. E. Weber (1978). *Bubbles, Drops, and
  Particles*. Academic Press. The Hadamard–Rybczynski speed and bubble
  shapes.
- H. D. Mendelson (1967). "The prediction of bubble terminal velocities
  from wave theory." *AIChE J.* 13(2), 250–253.
- J. B. Segur & H. E. Oberstar (1951). "Viscosity of glycerol and its
  aqueous solutions." *Ind. Eng. Chem.* 43(9), 2117–2120.
  [doi:10.1021/ie50501a040](https://doi.org/10.1021/ie50501a040).

**Earlier models and syntheses.**
- K. van den Doel (2005). "Physically based models for liquid sounds."
  *ACM Trans. Appl. Percept.* 2(4), 534–546.
  [doi:10.1145/1101530.1101554](https://doi.org/10.1145/1101530.1101554).
  Real-time synthesis of streams, pouring, rain and waves from stochastic
  populations of Minnaert bubbles, with a rising-pitch term for bubbles
  near the surface.
- C. Zheng & D. L. James (2009). "Harmonic fluids." *ACM Trans. Graph.*
  28(3) (SIGGRAPH 2009).
  [doi:10.1145/1531326.1531343](https://doi.org/10.1145/1531326.1531343).
  Bubble oscillators driven by 3D fluid animations, each radiated through
  a precomputed acoustic transfer function.
- W. Moss, H. Yeh, J.-M. Hong, M. C. Lin & D. Manocha (2010). "Sounding
  liquids: automatic sound synthesis from fluid simulation." *ACM Trans.
  Graph.* 29(3).
  [doi:10.1145/1805964.1805965](https://doi.org/10.1145/1805964.1805965).
  Couples bubble-resonance equations to shallow-water and grid–SPH fluid
  simulators.
- C. Drioli & D. Rocchesso (2011). "Acoustic rendering of particle-based
  simulation of liquids in motion." *J. Multimodal User Interfaces*
  5(3–4), 187–195.
  [doi:10.1007/s12193-011-0063-7](https://doi.org/10.1007/s12193-011-0063-7).
  Sound rendering for particle-based liquid simulations.
- T. R. Langlois, C. Zheng & D. L. James (2016). "Toward animating water
  with complex acoustic bubbles." *ACM Trans. Graph.* 35(4).
  [doi:10.1145/2897824.2925904](https://doi.org/10.1145/2897824.2925904).
  Bubble sounds from two-phase simulations, with frequency shifts from
  bubble shape and proximity to surfaces.
- K. Xue, R. M. Aronson, J.-H. Wang, T. R. Langlois & D. L. James (2023).
  "Improved water sound synthesis using coupled bubbles." *ACM Trans.
  Graph.* 42(4). [doi:10.1145/3592424](https://doi.org/10.1145/3592424).
  Coupled-bubble oscillators for the low-frequency sound of bubble clouds.
