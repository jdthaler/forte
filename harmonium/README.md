# Free-Reed Organ

A harmonium with the accordion's tricks. Each key opens a pallet; wind from
a reservoir rushes into a small cell, and a brass tongue riveted over a
close-fitting slot starts to swing through it by itself. Nothing strikes it
and nothing is sampled. The wind pushes the tongue into its slot, choking
the gap the air escapes through, and the air that feeds the gap has mass,
so the pressure it brings lags the tongue. Above a threshold that lag pumps
energy into the swing: the reed grows out of the turbulence in a tenth of a
second and settles swinging through the slot, chopping the flow into
pulses. The wind is live: more of it and the reeds speak sooner, louder and
a little flatter; less and the treble stops first. Reeds tuned a few cents
apart beat (the musette); there are 16′ and 4′ ranks, an expression stop
that bypasses the reservoir, and an accordion's tone chamber.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/harmonium/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61 keys, C2–C7) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the key opens its pallet |
| `Space` | hold: keys stay down while it is held (an organ has no damper pedal) |
| MIDI | notes, velocity, release velocity, hold pedal (CC64); **mod wheel and aftertouch = more wind** |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: more wind |

## The physics

### 1. The instrument: compass, ranks and stops

The keyboard has five octaves, C2–C7 (61 keys, 65 Hz to 2.09 kHz), the
compass of many harmoniums. Each key can sound five reeds, one in each rank:

- **8′**: one reed a key at the written pitch;
- **musette** (the harmonium's *voix céleste*): one or two more 8′ reeds,
  tuned sharp and flat by the **Musette detune** (12 ¢ by default);
- **16′**: an octave down, C1–C6 (33 Hz to 1.05 kHz);
- **4′**: an octave up, C3–C8 (131 Hz to 4.19 kHz).

Pulling a stop opens its rank's mutes over 20 ms, even under held keys.
**Percussion** adds Martin's percussion action to the 8′ (section 5).

### 2. The reed: a weighted brass cantilever

Each tongue is brass (E = 100 GPa, ρ = 8500 kg/m³), clamped at the rivet
and free at the tip, reduced to its first two bending modes. Below G3 a
tuning weight sits at the tip, growing to the tongue's own mass at C1, so
that the bass reeds stay a manageable length. With μ = M/ρAL the weight's
share of the mass, the frequencies follow from the moment-free tip and the
shear the weight's inertia puts there,

  1 + cos λ cosh λ + μλ (cos λ sinh λ − sin λ cosh λ) = 0,   ωₙ = λₙ² √(EI/ρA) / L²

(λ₁ = 1.8751 and λ₂ = 4.6941 bare, 1.2479 and 4.0311 with μ = 1), with mode
shapes ψₙ normalised to move the tip by 1 and orthogonal once the weight is
included. A tip displacement y is then y = q₁ + q₂, each mode having modal
mass mₙ = ρbhL∫ψₙ² + M, stiffness mₙωₙ² and pressure area Sₙ = bL∫ψₙ.

The voicer's scale: thickness h and width b grow towards the bass as
(f/261.6 Hz)^−0.35 (h = 0.19 mm and b = 1.7 mm at C8, 0.50 and 4.5 mm at C4,
1.03 and 9.3 mm at C1), and the length is what tunes the reed:

| reed | length | width × thickness | tip weight | mode 2 / mode 1 |
|---|---|---|---|---|
| C1 (16′) | 87.7 mm | 9.3 × 1.03 mm | 7.1 g | 10.4 |
| C2 | 60.4 mm | 7.3 × 0.81 mm | 1.9 g | 8.9 |
| C4 | 32.3 mm | 4.5 × 0.50 mm | none | 6.27 |
| C7 | 8.0 mm | 2.2 × 0.24 mm | none | 6.27 |
| C8 (4′) | 5.0 mm | 1.7 × 0.19 mm | none | 6.27 |

The tests hold every reed to Rayleigh's one-term estimate,
f = (1/2π)√(3EI/L³/(M + 0.2357 m)), within 1.5 %. Mode 1 loses energy at
the **Reed Q** (500 by default), mode 2 with twice its damping ratio, and the air drags on
the swinging tongue as on a plate moving broadside, −½ρC_D b|ẇ|ẇ along it
(C_D = 2): small at the usual swings, it matters to the long bass reeds.

### 3. The slot and the gap

The tongue rests a little above its slot: its **set**, 0.89 mm at C4,
scaled with the reed (∝ L^0.8 × deflection^0.2, so 1.8 mm at C2 and
0.15 mm at C7). The plate is e = 0.6 mm + 0.03 L thick, and a **clearance**
δ (40 µm at C4, ∝ L) is left round the tongue's sides and tip. Take w(x) =
y ψ₁(x) the height of the tongue's lower face along it, positive into the
slot. Along each edge the air escapes through the shortest gap between the
tongue's corner and the slot's: while the tongue overlaps the slot
(0 < w < e + h) that is just the clearance; outside it, it opens with the
distance d clear of the slot. So the open area is

  A(y) = 2∫₀ᴸ √(d(yψ₁)² + δ²) dx + (b + 2δ)√(d(y)² + δ²),   d(w) = max(0, −w, w − e − h)

Clear of the slot A grows as (2L∫ψ₁ + b)|y|, the tongue's perimeter times
its height; inside it only the clearance is left, δ(2L + b + 2δ); and the
overlap that chokes the flow is the plate plus the tongue's own thickness
(Millot & Baumann's "useful section" also counts the reed's thickness). Near
the rivet the tongue never leaves the slot's edge, so the area changes
smoothly as the tip goes in.
The **Flow against displacement** view draws this function, through the
reservoir's pressure, as a dashed line.

### 4. The air: why a free reed swings by itself

The jet leaves through the gap at speed x with a contracted area
(c_d = 0.61), and the air accelerating through it has mass (unsteady
Bernoulli over a length ℓ_j = e + h). The reed sits on a small cell of
volume V (compliance C = V/ρc²), fed from the reservoir at P through a throat
of inertance M_a = ρℓ/A and the pallet (opening a, orifice loss K), and the
tongue's motion sweeps volume out of the cell. Downstream is the open air
(p_d = 0) or the cassotto:

  p_c − p_d = ½ρ x|x| + ρ ℓ_j dx/dt,   U_g = c_d A(y) x

  C dp_c/dt = U_in − U_g − Σ Sₙ q̇ₙ,   M_a dU_in/dt = a (P − p_c) − K U_in|U_in| / a

  mₙ (q̈ₙ + 2ζₙωₙ q̇ₙ + ωₙ² (qₙ − rₙ)) = Sₙ (p_c − p_d),   r₁ = −y₀ (the set)

Apart from the jet's air mass the gap's flow is quasi-steady, with the side
flow and the contraction coefficient that Tarnopolsky, Fletcher & Lai (2000)
found must be included.

Why it swings. A tip motion δy changes the flow by G_A δy = c_d x A′(y) δy.
Above the slot, closing the gap cuts the flow (A′ < 0): the reed is a
**blown-closed** valve in Fletcher's (1993) classification, like a clarinet
reed and unlike a brass player's lips, and Ricot, Caussé & Misdariis (2005)
show the accordion reed is one. With a fixed pressure behind it, such a
valve feels a force that only follows its position, and cannot oscillate.
What drives it is the mass of the air. Linearised about the steady state
for motions ∝ e^{st}, the equations above reduce to one:

  1 + Z_eff(s) Σₙ Sₙ (s Sₙ + G_A) / (mₙ (s² + 2ζₙωₙ s + ωₙ²)) = 0,   Z_eff = Z_t R_j/(Z_t + R_j)

Z_t is the throat (sM_a + R_in) in parallel with the cell (1/sC), and
R_j = (ρx + sρℓ_j)/(c_d A) the jet's resistance and air mass. On an
inertive load the closing term −G_A Z_eff is a force in phase with the
reed's velocity: negative damping. St Hilaire, Wilson & Beavers (1971)
found that harmonium reeds start by exponential growth, that jet and wake
instabilities do not matter, and that unsteady potential flow puts an
exciting pressure of order ρU₀ẏ on the reed; here it is the air in the
throat and in the gap. Fletcher (1993) showed that each kind of valve can
oscillate only within ranges of the impedance it works into; here a
blown-closed reed needs an inertive load. A cell so big that its resonance
with the throat falls below the reed (9 times the default volume, beyond the
knob's range) is a compliant load, and the reed no longer starts. The tests
check that with almost no air mass, or such a cell, there is no threshold
at all. At low flow the air only damps the reed; at higher flow it drives
it, as Cottingham, Reed & Busha (1999) measured on reed-organ reeds.

The voicer sizes the throat for the reed. With u = ωM_a/R_j and ε = ωS₁/c_d x A′
(how much air the swinging tongue displaces against how much it chokes),
the drive is largest at u* = √(1 + ε²) − ε. A voicer trades some of it for a
lower threshold: here ωM_a = 0.4 u* R_j at the working wind, which gives
throats of ℓ/A ≈ 520–1020 m⁻¹ (C4: 521 m⁻¹, about a 1 cm² channel 5 cm
long). The **Air mass** knob scales it. The cell is sized to put its
resonance with the throat 3× above the reed: 9 cm³ at C4, 115 cm³ at C2,
0.08 cm³ at C7, and 470 cm³ for the 16′'s lowest reed. The **Reed cell**
knob scales the volume.

### 5. Threshold, onset and the pitch against the wind

The page and the tests solve that equation (Newton, from the bare reed's
root) and follow the reed's root as the pressure rises until it crosses into
the right half-plane: the **threshold**. At the default voicing:

| reed | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|---|
| threshold (Pa) | 22 | 28 | 33 | 38 | 54 | 76 | 120 | 258 |
| growth at 800 Pa (1/s) | 18 | 24 | 37 | 58 | 58 | 54 | 45 | 28 |

Below the threshold a reed stays silent or dies away; above it, it grows at
Re s. The engine matches the model: a reed kicked at 1.25× and 0.8× of
its threshold grows and dies at the predicted rates, and at the default wind
it grows at Re s within 10 % and starts at Im s/2π within 2 ¢ (C3, C4, C5,
C7). The wind view draws the last key's threshold.

The bellows default to 800 Pa (82 mm of water), where every key speaks: half
its full level within 90–260 ms (C4 90 ms, C7 180 ms, C2 260 ms; the bass is
slowest). Free reeds are slow to speak, which is why Martin (1841) gave them
a percussion action: a small hammer that strikes the reed as the key goes
down. The **Percussion** stop does that to the 8′ (a tip speed of
0.6 m/s × velocity). Velocity itself sets how fast the pallet opens, from 30
ms (pp) to 3 ms (ff). A fast pallet slams the wind into the cell, kicks the
reed and starts it sooner (C4: half level after 150 ms at pp, 90 ms at ff,
60 ms with percussion); the loudness is the wind's.

The wind is the dynamics. More pressure makes the reed speak sooner, louder
and a little flatter. At C4:

| pressure | 250 Pa | 500 Pa | 1000 Pa | 2000 Pa | 2500 Pa |
|---|---|---|---|---|---|
| half level after | 290 ms | 140 ms | 90 ms | 60 ms | 50 ms |
| pitch | +4.2 ¢ | +0.8 ¢ | −1.1 ¢ | −4.9 ¢ | −6.4 ¢ |

That is a slight, steady fall, as Cottingham, Reed & Busha (1999) report for
free reeds over the normal playing range. They find it roughly linear in the
pressure; here it is closer to linear in its logarithm, about 3 ¢ per
doubling. The air mass and the gap's negative stiffness both load the reed more
as the flow grows. The small-signal root also says that a reed starts below
its final pitch (Im s/2π is 2.4 % under the reed's natural frequency at C4
and 800 Pa, where it finally sounds 1 % under) and rises into tune as it
grows: a scoop of about 25 ¢ at C4 and 50 ¢ at C2 while the note swells.

### 6. Tuning

The reeds are tuned as a voicer tunes them, at the playing wind:
`tools/harmonium-tuning.mjs` blows every reed from C1 to C8 alone in the
engine, measures how far below its natural frequency it sounds (0.25–1.15 %),
and recuts it; with the engine rebuilt on the new table, until it sounds its
note within 0.05 ¢ (`--check` measures the build as it is). Every key C2–C7 then
sounds within ±3 ¢ at 48 and 44.1 kHz (measured worst 0.6 ¢), and so do the
16′ and 4′ ranks. Change the voicing (set, clearance, Q, air mass, cell) or
the wind and the pitch moves, as it would on the instrument.

### 7. The musette: reeds that beat

The musette's reeds are cut sharp and flat by the **Musette detune**, and
the sound swells and fades at their frequency difference. At A4 with 12 ¢,
the three reeds sound 436.96, 440.00 and 443.06 Hz, and two of them beat at
3.06 per second. The test measures the beat from the sound's envelope and
finds the frequency difference within 2 %. A few cents give the
harmonium's slow *voix céleste* shimmer; 12–20 ¢ the accordion's musette;
30 ¢ a wet, Italian-style tremolo. The reeds do not pull each other into
step: each has its own cell, and they share only the reservoir (and the
cassotto, if it is on).

### 8. The wind: bellows, reservoir and expression stop

Two feeders worked by the feet push air into a spring-loaded reservoir
through their own resistance, so the reservoir's pressure is the player's
effort less what the reeds draw:

  C_w dP/dt = G (P_effort − P) − Σ U_in,   G = 10⁻⁴ m³/s per Pa,   τ = C_w/G = 0.6 s

The mod wheel and aftertouch raise the effort (aftertouch up to double it).
A big chord sags the pressure by its draw over G. Ten keys on one 8′ draw
2.7 L/s and sag the wind 27 Pa (3.3 %); with the three-reed musette, about
100 Pa (12 %). The reservoir takes 0.6 s to follow the effort and
to sag.

The harmonium's **expression stop** (descended from Grenié's *orgue
expressif*, 1810) shuts the reservoir off. Only the wind chest's small
volume is left (τ = 15 ms), so the pressure follows the feet: the sag is
immediate, the dynamics answer at once, and **Pumping** is heard. Each
feeder delivers unevenly over its stroke, so the effort swells twice per
stroke of one foot,

  P_effort ∝ 1 − 0.2 + 0.2 (π/2)|sin 2π r t|

for r strokes per second per foot. The reservoir smooths that swell as a
first-order low-pass of time constant 0.6 s: 9× less at 1.2 strokes per
second (the test checks the ratio within 20 %). An accordion works like the
expression stop all the time.

### 9. The cassotto

An accordion's tone chamber: the reeds sound into a box (88 cm³ at the
default tuning) whose single mouth (20 cm² by 3 cm) leads out. It is a
Helmholtz resonator,

  C_k dp_d/dt = Σ U_out − U_k,   M_k dU_k/dt = p_d − R_k U_k,   f_k = 1/(2π√(M_k C_k)),   Q = 2

and the sound is the mouth's volume acceleration. Above f_k (1500 Hz by
default, the **Cassotto resonance** knob) it falls 12 dB per octave. C4's
12th to 24th harmonics come out 24 dB weaker against the fundamental, and
the whole note several dB softer. Its pressure acts back on every reed's
downstream face and lowers the pitch slightly (0.9 ¢ at C4). The chamber
has one mouth, so with it on the sound is mono.

### 10. The sound

A reed radiates by the air it puts into the room. That is the jet plus the
air the tongue's downstream face pushes, U_out = U_g + Σ Sₙq̇ₙ, and the far
field is its rate of change, p = ρ/4πr · dU_out/dt (a monopole). Without
the cassotto each key is panned by its place along the instrument, bass to
the left. Turbulence in the jet seeds every onset: a random pressure on the
tongue, up to ±0.2 % of the pressure across it, from a seeded table.

The flow pulses twice a cycle, once on each side of the slot, and
unevenly, so the sound is rich in harmonics. A free reed swings far: the
tip's swing is often about 15 % of the reed's length (Braasch & Cottingham
2023). Here it is 15 % at C4 (4.8 mm against a 32 mm reed), 20 % at C2 and
6 % at C7. The loudness follows the flow, so the
treble is softer: a forte note peaks at 0.44 (C2), 0.32 (C4), 0.12 (C6) and
0.05 (C7). That is about a 20 dB tilt, partly offset by the ear's greater
sensitivity higher up.

The **Reed in its slot** view replays one cycle of the last key's reed
slowed down a few hundred times, to scale: the tongue (and its weight)
swinging down through the plate, the wind's pressure in the cell above, the
jet at the tip, and the open area.

### 11. The engine

- **Each step**, a reed's two modes advance exactly under the mean of the
  old and new force, and the air is integrated by BDF2 (second order,
  L-stable, so no stiff mode rings). The unknown is the jet speed x′: given
  it, the pressures, the throat's flow (a quadratic, solved exactly), the
  reed's motion and the open area all follow. Newton on the cell's air
  balance finds x′ from the extrapolated x, usually in one step, and
  brackets and bisects when it must. The jet's air mass keeps the flow
  continuous where the gap is wide open and the pressure crosses zero, so
  neither a slammed pallet, a tiny clearance nor 5 kPa of wind blows it up.
- **Oversampling.** Reeds that sound at 440 Hz or more run at twice the
  sample rate, brought back down by a 63-tap half-band FIR. Below 440 Hz,
  at the sample rate, the worst aliased line stays 49 dB under the
  strongest harmonic; with 2× the C7's stays 46 dB under (29 dB without).
- **Cost.** Ten held keys with the three-reed musette (30 reeds) take 25–28 %
  of real time at 48 kHz in Node on the shared machine this was built on;
  one 8′ rank, about 10 %. Reeds whose stop is off sleep.
- **Voices.** One voice per key holds its five reeds: pressing it again
  reopens the same pallet. Beyond 16 keys the quietest released key fades
  out over 30 ms, never one under 50 ms old. Voicing knobs give the next
  press new reeds and fade the old.
- **Release.** The pallet closes in 8 ms (3–15 ms with MIDI release
  velocity); the sealed cell's air stops the reed, 40 dB down within 0.25 s
  at C4, though a long bass reed rings on a little.
- **Allocation.** None in `process()`: reeds and their area tables are built
  when a key is first pressed and cached per key and voicing (in the
  plugins, on a worker thread).

## What to listen for

`examples/harmonium/` (regenerate with `node tools/render-harmonium.mjs`):

1. **01-old-hundredth-on-the-8-foot-and-voix-celeste**: the first line of
   *Old Hundredth* (Louis Bourgeois, Genevan Psalter, 1551) in four parts,
   on the 8′ with a voix céleste 5 ¢ sharp: the harmonium as it is usually
   heard, every chord swelling in, the bass last.
2. **02-one-reed-then-musette-of-two-then-three**: A4 on one reed, then with
   a second 12 ¢ sharp (beating 3.1 times a second), then three reeds.
3. **03-wind-rising-from-a-whisper-to-full**: a held chord through the
   expression stop while the wind rises from 120 to 2500 Pa. Near their
   thresholds the reeds speak slowly and softly; as the wind rises the chord
   grows louder and brighter and sinks a few cents.
4. **04-slow-key-fast-key-then-percussion**: a rising arpeggio with a slow
   key (the pallet opening in 30 ms), a fast one (3 ms) and with percussion:
   each speaks sooner.
5. **05-pumped-through-the-reservoir-then-the-expression-stop**: a chord
   pumped at 1.2 strokes a second, steady through the reservoir, then
   swelling with every stroke through the expression stop.
6. **06-accordion-musette-open-then-in-the-cassotto**: a phrase on a
   three-reed accordion musette (15 ¢), in the open and then through the
   cassotto: rounder and softer.
7. **07-eight-foot-then-with-sixteen-then-full-organ**: a cadence on the 8′,
   with the 16′ added, then 16′, 8′ and 4′.
8. **08-gentle-wind-near-threshold-then-normal**: the same arpeggio at a
   gentle 150 Pa, where the reeds speak late and soft and the top barely
   speaks before it is let go, then at 800 Pa.

On the page, the **Flow against displacement** view draws the live loop
over the dashed quasi-steady curve, the **Musette** view the sound's
envelope with ticks at the predicted beat period, and the **Wind** view the
reservoir's pressure, the air drawn and the last key's threshold.

## Files

```
harmonium/index.html, style.css           page
harmonium/src/harmonium-instrument.js     the descriptor: parameters, presets, range, engine, output chain
harmonium/src/harmonium-params.js         parameters and presets
harmonium/src/harmonium-wasm.js           the engine and the model: the C++ as WebAssembly (harmonium/wasm/harmonium.wasm)
harmonium/src/harmonium-data.js           key range, ranks and stops, and areaAt (reading a slot-area table) for the views
harmonium/src/tuning-table.js             each reed's sounding/natural frequency at the default wind (the C++ copy's source)
harmonium/src/harmonium-main.js           page wiring and views
native/instruments/harmonium/             the C++ port: model, engine, generated tables (the tuning table among
                                          them), reference (plugins and WebAssembly)
test/harmonium-tests.mjs                  node test/harmonium-tests.mjs (24 tests, ~15 s)
tools/harmonium-tuning.mjs                node tools/harmonium-tuning.mjs → harmonium/src/tuning-table.js and its C++ copy
tools/render-harmonium.mjs                node tools/render-harmonium.mjs → examples/harmonium/
```

**In C++**: the engine and the model are C++, run as WebAssembly on this
page and as plugins (CLAP, VST3, AU and a standalone app), where the Space pedal is Hold
on CC64, the mod wheel raises the bellows pressure from its setting to
2500 Pa and aftertouch blows harder (up to double), as on the page. The
reeds are self-oscillators, but nothing in them is chaotic: a render is the
same every time, the turbulence's seeded noise included. The views' reeds and
thresholds come from the WebAssembly model. In the plugins each key's reeds
are designed off the audio thread when the voicing knobs change; on the page,
on a key's first note (about 1 ms). Ten keys on the 8′ take about 7 % of a core; with
the three-reed musette (30 reeds), about 20 %.

## Simplifications

- **A lumped air path.** The throat, the cell and the cassotto are lumped
  inertances and compliances, valid while they are small against a
  wavelength (in the top octave the cell is only a few millimetres across).
  The flow round the tongue is one jet through the total gap, not the
  three-dimensional flow of Ricot et al. or St Hilaire's potential flow. The
  jet's air mass uses one length (the plate plus the tongue), and the
  contraction coefficient is fixed at 0.61.
- **Only the tip's height sets the gap.** The area function uses mode 1's
  shape for the whole tongue; mode 2's bend changes the gap only through the
  tip. Torsion and sideways motion of the tongue are left out, although
  Cottingham (2019) finds they may help start a reed.
- **The scale is plausible, not measured.** The reed dimensions, sets,
  clearances, throat and cell sizes follow the voicing rules above, not one
  instrument's reeds. The rules were chosen so that every reed speaks at the
  default wind and the levels stay within about 20 dB across five octaves.
- **The cell's effect on the tone.** Cottingham (1997) found that a cavity
  round the reed lowers its frequency, as here, and raises its higher
  harmonics. In this lumped model a bigger cell darkens the tone instead:
  its compliance smooths the flow's sharp edges.
- **Losses.** Each mode has one Q, the drag coefficient is a flat plate's,
  the orifice and jet losses are quasi-steady, and the cassotto's walls are
  one Q. The reeds radiate as monopoles into free space: no case, no swell
  box, no room besides the page's reverb.
- **The wind.** The feeders are an effort behind a resistance. The
  reservoir is one compliance with no spring dynamics or safety valve, the
  pumping is a fixed stroke shape, and every reed draws from the same
  pressure at once (no pressure drop along the wind chest).
- **Independent reeds.** The musette's reeds share only the reservoir and
  the cassotto, so they never lock. In instruments whose reeds share a
  chamber they can pull together.
- **Tuning and level** are set at the default wind, as a voicer would. Other
  winds and voicings change the pitch and the level, as on the instrument.

## Prior art and references

**The original instrument.**
- J. J. Ohala (2011). "Christian Gottlieb Kratzenstein: pioneer in speech
  synthesis." *Proc. 17th Int. Congress of Phonetic Sciences (ICPhS XVII)*,
  Hong Kong, 156–159.
  [PDF](https://www.internationalphoneticassociation.org/icphs-proceedings/ICPhS2011/OnlineProceedings/SpecialSession/Session7/Ohala/Ohala.pdf).
  Kratzenstein's free-reed vowel resonators, his answer to the St
  Petersburg Academy's 1780 prize question (published 1781).
- G.-J. Grenié (1810). French patent, "Jeu d'orgue rendu expressif par le
  moyen d'un plus ou moins grand volume d'air comprimé dans le sommier",
  granted 23 June 1810. [INPI, dossier 1BA557](https://bases-brevets19e.inpi.fr/brevets?detail=428067).
  The *orgue expressif*: free reeds whose loudness follows the wind
  pressure.
- C. Demian, C. Demian & G. Demian (1829). Austrian privilege for the
  "Accordion", Vienna, description dated 6 May 1829 (Priv. Reg. No. 1757,
  23 May 1829). [English summary translation, The Classical Free-Reed,
  Inc. (archived)](https://web.archive.org/web/20090619162610/http://www.ksanti.net/free-reed/history/demian.html).
- C. Wheatstone (1829, 1844). British Patents No. 5803 of 1829,
  "Improvements in the construction of wind musical instruments", and
  No. 10041 of 1844, "Improvements in the action of the concertina, &c.
  by vibrating springs". [Scans, Concertina Library](http://www.concertina.com/patents/index.htm).
- L.-P.-A. Martin (1841). French patent, "Instantanéité du son donné à
  l'anche libre et expression graduée du son de l'anche libre, obtenue à
  l'aide d'un système de soupapes", granted 10 September 1841.
  [INPI, dossier 1BA9346](https://bases-brevets19e.inpi.fr/brevets?detail=440649).
  Percussion action for prompt speech of the reeds.
- A.-F. Debain (1842). French patent, "Changements et perfectionnements
  apportés à la fabrication des orgues à anches libres et à cylindres",
  granted 30 September 1842, with additions to 1844 that name the
  harmonium. [INPI, dossier 1BA9306](https://bases-brevets19e.inpi.fr/brevets?detail=441473).
  Often dated 1840; INPI holds no Debain free-reed patent of that year.
- B. Owen (2001). "Reed organ." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.43321](https://doi.org/10.1093/gmo/9781561592630.article.43321).
- H. S. Harrington & G. Kubik (2001). "Accordion." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.46180](https://doi.org/10.1093/gmo/9781561592630.article.46180).

**The physics.**
- A. O. St Hilaire, T. A. Wilson & G. S. Beavers (1971). "Aerodynamic
  excitation of the harmonium reed." *J. Fluid Mech.* 49(4), 803–816.
  [doi:10.1017/S0022112071002374](https://doi.org/10.1017/S0022112071002374).
  Exponential growth of the reed's swing, jet and wake instability ruled
  out, and an exciting pressure of order ρU₀ȧ from unsteady potential flow.
- A. O. St Hilaire & P. G. Vaidya (1975). "Finite amplitude analysis of a
  flow-structure interaction problem." *J. Fluid Mech.* 67(2), 377–396.
  [doi:10.1017/S0022112075000365](https://doi.org/10.1017/S0022112075000365).
- N. H. Fletcher (1993). "Autonomous vibration of simple
  pressure-controlled valves in gas flows." *J. Acoust. Soc. Am.* 93(4),
  2172–2180. [doi:10.1121/1.406857](https://doi.org/10.1121/1.406857).
  The four kinds of valve, by whether a pressure on either side opens or
  closes them, and the ranges of inlet and outlet impedance in which each
  can oscillate.
- J. P. Cottingham (1997). "Effects of reed cell geometry on the vibration
  frequency and spectrum of a free reed." 133rd meeting of the Acoustical
  Society of America, State College, Pa., paper 4aMU1 (abstract).
  [Abstract](https://auditory.org/asamtgs/asa97pen/4aMU/4aMU1.html).
- H. T. Bahnson, J. F. Antaki & Q. C. Beery (1998). "Acoustical and
  physical dynamics of the diatonic harmonica." *J. Acoust. Soc. Am.*
  103(4), 2134–2144. [doi:10.1121/1.421359](https://doi.org/10.1121/1.421359).
- J. P. Cottingham, C. H. Reed & M. Busha (1999). "Variation of frequency
  with blowing pressure for an air-driven free reed." *J. Acoust. Soc.
  Am.* 105(2), 1001 (abstract).
  [doi:10.1121/1.425800](https://doi.org/10.1121/1.425800).
  A roughly linear fall of pitch with pressure; aerodynamic damping at low
  flow, negative damping at higher flow.
- A. Z. Tarnopolsky, N. H. Fletcher & J. C. S. Lai (2000). "Oscillating
  reed valves — an experimental study." *J. Acoust. Soc. Am.* 108(1),
  400–406. [doi:10.1121/1.429473](https://doi.org/10.1121/1.429473).
- D. Ricot, R. Caussé & N. Misdariis (2005). "Aerodynamic excitation and
  sound production of blown-closed free reeds without acoustic coupling:
  the example of the accordion reed." *J. Acoust. Soc. Am.* 117(4),
  2279–2290. [doi:10.1121/1.1852546](https://doi.org/10.1121/1.1852546).
- L. Millot & C. Baumann (2007). "A proposal for a minimal model of free
  reeds." *Acta Acust. united Acust.* 93, 122–144.
  [HAL hal-04369449](https://hal.science/hal-04369449).
- J. Cottingham (2011). "Acoustics of free-reed instruments." *Physics
  Today* 64(3), 44–48. [doi:10.1063/1.3563819](https://doi.org/10.1063/1.3563819).
- J. Biernat & J. Cottingham (2014). "Attack transients in free reed
  instruments." *Proc. Meetings on Acoustics* 20, 035002.
  [doi:10.1121/1.4891627](https://doi.org/10.1121/1.4891627).
- M. Nussbaumer & A. Agarwal (2016). "Aeroacoustics of free reeds." *Proc.
  22nd Int. Congress on Acoustics (ICA 2016)*, Buenos Aires, paper
  ICA2016-756. [PDF](http://www.ica2016.org.ar/ica2016proceedings/ica2016/ICA2016-0756.pdf).
  Measurements on free reeds, and a model in which the unsteady flow of the
  air in a channel by the reed gives a force in phase with its velocity.
- J. P. Cottingham (2019). "A survey of recent studies on initial transients
  in free reed oscillation." *Proc. 23rd Int. Congress on Acoustics (ICA
  2019)*, Aachen. [PDF](https://pub.dega-akustik.de/ICA2019/data/articles/001430.pdf).
- J. Braasch & J. P. Cottingham (2023). "Free reeds: an intertwined tale of
  Asian and Western musical instruments." *Acoustics Today* 19(4), 14–22.
  [doi:10.1121/AT.2023.19.4.14](https://doi.org/10.1121/AT.2023.19.4.14).

**Earlier models and synthesis projects.**
- R. Caussé, N. Misdariis & D. Ricot (1999). "Studies of accordion reed
  vibrations — applications in sound synthesis." *J. Acoust. Soc. Am.*
  106(4), 2287 (abstract).
  [doi:10.1121/1.427818](https://doi.org/10.1121/1.427818). IRCAM
  measurements towards a simple physical reed model for synthesis,
  programmable in Modalys.
- T. Hikichi, N. Osaka & F. Itakura (2003). "Time-domain simulation of
  sound production of the sho." *J. Acoust. Soc. Am.* 113(2), 1092–1101.
  [doi:10.1121/1.1534605](https://doi.org/10.1121/1.1534605).
  Time-domain model of a pipe-coupled free reed, checked against measured
  threshold pressure and frequency.
- T. Hikichi, N. Osaka & F. Itakura (2004). "Sho-So-In: control of a
  physical model of the sho by means of automatic feature extraction from
  real sounds." *J. New Music Res.* 33(4), 355–365.
  [doi:10.1080/0929821052000343831](https://doi.org/10.1080/0929821052000343831).
- L. Millot (2011). "Chromatical playing on diatonic harmonica: from
  physical modeling to sound synthesis." *J. Acoust. Soc. Am.* 130(4),
  2342 (abstract). [doi:10.1121/1.3654370](https://doi.org/10.1121/1.3654370).
  Two-reed harmonica channel with a nonlinear airflow model coupled to a
  time-varying vocal tract.
- N. V. Puranik & G. P. Scavone (2022). "Physical modelling synthesis of a
  harmonium." *Proc. Meetings on Acoustics* 49, 035015.
  [doi:10.1121/2.0001679](https://doi.org/10.1121/2.0001679). Adapted
  Millot–Baumann reed model driven by bellows pressure, followed by an
  enclosure filter estimated from recordings.
- N. Puranik & G. Scavone (2023). "Clamped bar model for free reeds."
  *Proc. Forum Acusticum 2023*, Turin, 1809–1815.
  [doi:10.61782/fa.2023.0853](https://doi.org/10.61782/fa.2023.0853).
  Distributed (clamped-bar) reed model with a time-domain scheme for reed
  motion and airflow.
- N. Puranik & G. Scavone (2023). "Physically inspired signal model for
  harmonium sound synthesis." *Proc. DAFx23*, Copenhagen.
  [DAFx archive](https://dafx.de/paper-archive/details/YpJGemANSDbyjvvVLMb4rg).
  Real-time Pure Data simplification of their physical model.
- [Roland V-Accordion FR-8x](https://www.roland.com/global/products/fr-8x/)
  (Roland): Roland describes its engine as "Advanced Physical Behavior
  Modeling" of bellows and individual reeds, with cassotto and musette
  simulation; it does not say whether the reed tones are sampled.
