# Reed Piano

A physically modelled reed electric piano after the Wurlitzer 200A. Each key
is a flat steel reed, clamped at one end, struck by a small felt hammer and
tuned by a blob of solder on its tip. The tip swings through a slot in a comb
held at +150 V, so each reed is one plate of a capacitor whose value depends
on where the tip is. The famous Wurlitzer bark is not distortion added
afterwards. It is the shape of that capacitance curve, here computed from
Laplace's equation, read out by a lopsided swing. A sample could not give you
the bark growing continuously with how hard you play, or let you move the
reed in its slot, change the solder or starve the pickup of charge.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/reeds/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (64 keys, A1–C7) |
| `←` `→` | octave |
| `↑` `↓` | velocity (hammer speed, 0.1–2 m/s) |
| `Space` | damper pedal |
| MIDI | notes, velocity, sustain pedal (CC64) |

## The physics

**Reeds.** Every tongue is spring steel (E = 200 GPa, ρ = 7850 kg/m³),
0.5 mm thick and 2.4 mm wide, clamped at the root. It is an Euler–Bernoulli
cantilever. `reedFEM` builds it from 20 Hermite beam elements, with the
solder as a point mass M at the tip and the blob's rotary inertia
J = M(a²/6 + ((a+h)/2)²): a lump of side a = (M/ρ_solder)^⅓ sitting on top of
the tongue. For a rectangular section, f₁ = (1.8751²/2π)·h·√(E/12ρ)/L², which
depends on the thickness h and the length but not on the width. Without
solder the overtones sit at the textbook 6.267, 17.55 and 34.39 × f₁.
A tip mass of μ times the tongue's own mass lowers f₁ much more than the
overtones, because it sits where mode 1 moves most and near where the higher
modes have their last node. The FEM roots match the exact frequency equation
for a cantilever with a tip mass,
1 + cos λ cosh λ + μλ(cos λ sinh λ − sin λ cosh λ) = 0
(e.g. Laura, Pombo & Susemihl, *J. Sound Vib.* 37, 1974), to 2·10⁻⁴ for
μ = 0.1 to 8 (tested).

**Tuning by solder.** The solder ratio M/m runs geometrically from 1.6 at A1
to 0.04 at C7, and each key's free length is *solved* so that mode 1 is the
note: start from the exact tip-mass root, then let the FEM, which includes J,
correct L. Every key is within 0.01 ¢ in the model and 0.02 ¢ in the engine's
output. The dimensions are plausible, not measured; the real instrument uses
several reed blanks.

| key | f₁ (Hz) | length (mm) | solder (mg) | M / tongue | modes 2, 3 (× f₁) | T60 modes 1, 2 (s) | hammer (g) | contact, ff (ms) | tip swing, ff (mm) |
|---|---|---|---|---|---|---|---|---|---|
| A1 | 55.0 | 51.8 | 781 | 1.60 | 11.2, 28.5 | 12.0, 3.9 | 0.70 | 1.79 | ±1.66 |
| A2 | 110.0 | 42.4 | 316 | 0.79 | 9.2, 25.5 | 8.6, 2.2 | 0.58 | 1.15 | ±1.44 |
| A3 | 220.0 | 33.9 | 125 | 0.39 | 7.7, 22.1 | 5.7, 1.1 | 0.47 | 0.74 | ±1.15 |
| A4 | 440.0 | 26.3 | 48 | 0.19 | 6.8, 19.6 | 3.3, 0.55 | 0.39 | 0.48 | ±0.81 |
| A5 | 880.0 | 19.8 | 18 | 0.10 | 6.5, 18.2 | 1.7, 0.24 | 0.32 | 0.30 | ±0.50 |
| C7 | 2093 | 13.4 | 5 | 0.04 | 6.3 | 0.65, 0.07 | 0.25 | 0.42 | ±0.23 |

The **Solder mass** knob scales every blob and re-cuts every reed, so the pitch
cannot move (tested at ×0.2 and ×3). What changes is everything else. A heavy
blob makes a shorter, stiffer reed (A3: 40 → 28 mm from ×0.2 to ×3). The
hammer swings it less, so it is quieter and barks less. Its overtones go up
(mode 2: 6.4 → 9.4 × f₁), and the pickup hears them less, because a heavy tip
barely moves in the higher modes (A3's mode 2 at the slot: −34 dB re mode 1
with light solder, −47 dB at ×3). Its sustain is shorter (6.1 → 4.7 s),
because a stiffer reed loads its clamp harder for the same energy (below).

**Losses.** Each mode n has three:

* σ = ½ηω from steel's internal friction (η = 2·10⁻⁴);
* σ = ½ω²(Y_w Γₙ² + Y_θ Θₙ²) from the clamp. Mode n pushes on the clamp
  with a shear force ω²Γₙ and a bending moment ω²Θₙ, where Γₙ = rᵀMφₙ and
  Θₙ = sᵀMφₙ are the FEM's participation factors for a rigid translation and
  a rigid rotation about the root. The clamp's resistive mobilities Y_w and
  Y_θ take the power ½|F|²Y. The moment term turns out nearly equal for
  every mode, while the shear term grows ~14× from mode 1 to mode 2, so
  overtones die first.
* σ = σ_d (φₙ(x_d)/φ₁(x_d))² from the damper felt at 70 % of the length,
  once the key is up and the pedal is off (σ_d = 30 s⁻¹).

Y_w and Y_θ are *not* measured. They are set so that middle C rings about
5 s, split 30 : 70 between shear and moment. The rest of the table (12 s at
A1, 0.65 s at C7, and every overtone) follows from the mode shapes. Air
damping of a 2.4 mm strip at these Reynolds numbers gives Q ≈ 10⁴
(Sader, *J. Appl. Phys.* 84, 1998), so it is left out.

**Hammer.** A small mass on a power-law felt, F = Kδ^p + Kα d(δ^p)/dt
(p = 2.5, as for piano hammers after Chaigne & Askenfelt, *JASA* 95, 1994),
graded from 0.70 g and soft in the bass to 0.25 g and 100× harder in the
treble. Velocity sets the hammer speed, up to 2 m/s. The contact is solved
implicitly, against all modes, every sample. The elastic part is the
*discrete gradient* Fₙ = [V(δₙ₊₁) − V(δₙ₋₁)]/(δₙ₊₁ − δₙ₋₁) with
V = Kδ^(p+1)/(p+1) (Chatziioannou & van Walstijn, *J. Sound Vib.* 339, 2015),
so a strike with no hysteresis conserves energy exactly (tested to 10⁻³:
at A3 and 1.4 m/s, 34 % of the hammer's energy goes into the reed and the
rest leaves with the rebounding hammer). An ordinary implicit update loses
9 % to numerical damping at 96 kHz. Contacts last 1.8 ms in the bass and
0.3–0.4 ms in the treble. The felt filters the overtones out: after the
strike, mode 2 is 40–60 dB below mode 1 at the pickup (A3 at ff: −42 dB), so
nearly everything you hear above the fundamental comes from the pickup.
**Hammer felt hardness** ×10 brings mode 2 up by ~8 dB. Moving the **Strike
point** near the clamp (15 %) brings it to −19 dB, with a much smaller swing.

**The slot.** The comb is a plate 0.8 mm thick with a slot for every reed.
The reed's tip reaches ℓ = 3 mm into its slot, with a clearance g (the
**Gap** knob, 0.3 mm) to the slot's sides. `slot-field.js` solves Laplace's
equation in the slot's cross-section. The reed is at ground, the comb at +V,
and a grounded frame sits 6 mm above and below. The reed's centre line and
each tooth's middle are symmetry planes, because the slots repeat. The
solver uses successive over-relaxation on nested 0.1/0.05/0.025 mm grids,
and the reed's charge comes from Gauss's law. It is exact for a uniform
field (tested to 10⁻⁶), and halving its resolution (0.05 mm) changes C by
only 0.7 % at g = 0.3 mm.
`tools/reeds-slot-table.mjs` sweeps the reed's height y from −5.8 to +5.8 mm
at eight gaps from 0.1 to 1.5 mm (about 24 minutes). That is the reed's
whole travel: it meets the frame at ±5.75 mm, and the last row on each side
only gives the interpolation its neighbour. The engine interpolates the
table: Catmull–Rom in y, power-law in g, within 3 % of a fresh solve between
tabulated gaps (tested). At g = 0.3 mm:

* C(0) = 0.211 pF with the reed level with the comb. It falls to 0.125 pF at
  1 mm and 0.053 pF at 3 mm, a long tail, because in two dimensions
  capacitance decays only slowly with distance.
* The steepest slope is 0.118 pF/mm at y = 0.62 mm. The inflection is at
  0.59 mm: below it C(y) is concave (it saturates as the reed enters the
  slot), above it convex.
* Narrow gaps approach the parallel-plate value 2ε₀h/g, but slowly. Even at
  g = 0.1 mm the fringe adds 71 %, and at 1.5 mm C is four times the
  parallel-plate value. C(0) grows sixfold as the gap closes from 1.5 to
  0.1 mm, which makes a narrow gap much louder, but the *shape* of C(y), and
  so the bark, hardly changes with the gap.

**The frame is an end stop.** A reed swinging far enough meets the grounded
frame face-on, at |y| = H − h/2 = 5.75 mm from the comb's mid-plane. The
engine treats this as a stiff, lossless contact (10⁶ N/m at the slot),
solved implicitly. As voiced, nothing comes near it: a forte A1 swings out
to 1.96 mm. Only extreme settings reach it, such as solder ×0.05 or the rest
height at ±2 mm with the strike near the tip, and the tip then bounces off
the frame with a clack (tested: it never passes 5.76 mm).

**The bark.** The reed rests 0.3 mm above the comb's mid-plane (**Reed height
in the slot**), where C(y) is already bending over. A soft note swings
±0.1 mm on a nearly straight stretch of the curve. A hard one swings
±1.2 mm (A3): down over the top of the curve, where C saturates and then
falls again, and up into the steep flank. The comb voltage folds, so even
harmonics appear. A3's 2nd harmonic goes from −26 dB (pp) to −3.5 dB (ff)
re the fundamental (tested). The treble swings less (±0.2 mm at C7) and
stays clean, as on the real instrument. A reed **centred** in the slot
(height 0) sits at the top of an even curve: the fundamental cancels and the
octave remains (tested, > 25 dB). At 1.2 mm it rides on the convex tail: thin
and nearly linear.

**Constant charge or constant voltage?** The comb is fed from +V through a
large resistor R. Its node carries all 64 slots plus the comb's stray
capacitance and the cable, C₀ ≈ 200 pF. One reed changes this by
δC ≲ 0.15 pF, so the node equation C₀v′ + V δC′ = −v/R is linear to 10⁻³,
and the 1/C nonlinearity of a single capacitor is negligible here. It is a
first-order high-pass of the capacitance swing with τ = RC₀:

* ωτ ≫ 1, **constant charge**: v = −V δC/C₀. The output follows C(y) itself,
  flat in frequency, about 75 mV for 0.1 pF at 150 V.
* ωτ ≪ 1, **constant voltage**: v = −V R dC/dt. The output follows the rate,
  rising 6 dB/octave.

With R = 22 MΩ, τ = 4.4 ms and the corner is 36 Hz. A1 sits at ωτ = 1.5
(−1.6 dB, 33° of phase lead), and from A2 up every key is in the
constant-charge regime to within 0.5 dB. The engine does not pick a regime: it integrates the
node exactly for δC linear within a sample, so either limit comes out
(tested against the analytic |H| at four R, f pairs). Turn the **Feed
resistor** down to 1 MΩ (corner 800 Hz) and the instrument becomes a
differentiator: the bass loses its fundamentals and the top gets edgy. At
0.5 MΩ the A1 fundamental falls by 27.7 dB, as |H| predicts (tested). R and C₀ are estimates, not measurements of a 200A.

**The field pulls on the reed.** The grounded reed is attracted toward higher
capacitance, F = ½V² dC/dy, applied at the slot in the engine. Linearised
about the rest height, this is a spring k_E = −½V²C″(y₀), which shifts the
pitch by Δf/f ≈ ½k_E/k. It is tiny: 0.02 ¢ at 150 V. At 600 V on A1 (the
softest reed) the engine moves by 0.385 ¢ against 0.370 ¢ predicted (tested).
By Paschen's law a 0.3 mm air gap breaks down at about 1.5 kV, so the
**Comb voltage** knob stops at 600 V. In practice the voltage is just signal
level: v ∝ V.

**Preamp and tremolo.** The comb voltage is amplified ×12 by a stage that
clips softly and asymmetrically (tanh with 1.6 V of headroom on one side and
1.1 V on the other: a transistor runs out of swing sooner toward one rail).
**Preamp drive** scales the signal into it, with the level compensated. The
200A's tremolo is an oscillator lighting an LED next to a CdS photocell that
shunts the preamp's signal. Photocells light up fast and go dark slowly
(e.g. a VTL5C3: 2.5 ms on, 35 ms off), modelled with 4 ms and 35 ms time
constants. The LED only conducts on positive half-cycles, and the gain is
1/(1 + 3ℓ) for light level ℓ. The result is a lopsided throb: at full depth
the level drops 11 dB in the first 27 % of each cycle and spends the rest
recovering (tested).

**Speakers.** The 200A plays through two 4"×8" oval speakers in its lid.
They are modelled as a lumped driver: a 2nd-order high-pass at the cone
resonance (130 Hz, Q 0.9), a first-order open-back cancellation below
280 Hz, a cone break-up peak (+6 dB at 2.6 kHz, Q 2.2), a small dip around
900 Hz and a 6 kHz roll-off. Net response: −29 dB at 55 Hz, −12 dB at
110 Hz, −4 dB at 220 Hz, flat to 1.3 kHz, +5.7 dB at 2.6 kHz, −11 dB at
10 kHz. The bass fundamentals all but vanish and the ear rebuilds them from
the pickup's harmonics. **Output: direct** is the preamp, DC-blocked at
12 Hz and trimmed 4.4 dB below the speakers' passband: with the bass left
in, that makes the two outputs about equally loud on a phrase (within
0.2 dB for the *Direct out, clean* preset). Switching between them
crossfades over 20 ms, and the speaker filters always run.

**Engine.** The reeds, comb node, tremolo and preamp run at 2× the audio
rate, then a 47-tap Blackman-sinc decimator (applied folded: it is
symmetric). The engine is mono, like the instrument. Ten sounding voices
take 4 % of one core (Apple M2 Max, Node). A voice frees itself once its tip
moves less than 3 nm (30 nm once damped). *Gap* and *Reed height* glide to
a new setting with a 20 ms time constant: the slot's rest point and its
C(y) table move smoothly under the sounding reeds (the table is blended
from one block to the next), so the knobs do not click. *Solder mass*,
*Strike point* and *Hammer felt hardness* re-cut the reeds and apply to new
notes. A key struck again after one of them moved gets a new reed, and its
old one fades out in about 20 ms.

## What to listen for

`examples/reeds/`, regenerated with `node tools/render-reeds.mjs`:

1. **Soul ballad, tremolo through the speakers.** Em9–Dm9–Cmaj9 with a fill:
   the instrument as it is usually heard.
2. **The same A3, pp to ff (direct out).** Six strikes from 0.16 to 2 m/s.
   The tone goes from a near-sine to the bark, as the swing reaches over the
   top of C(y).
3. **Reed centred in the slot, then 0.3 mm high, then 1.2 mm high.** The same
   arpeggio three times. Centred, everything sounds an octave up and hollow.
   At 0.3 mm you get the normal voicing. Riding high, it is thin and clean.
4. **Light solder, then heavy, at the same pitch.** Long reeds swing more:
   louder, more bark, a little more ring. Heavy blobs give short reeds:
   quieter, sweeter and shorter.
5. **Tremolo on a held chord.** The photocell's fast attack and slow release
   give the throb its shape.
6. **Direct out, then the built-in speakers.** Same phrase. The speakers take
   the bass fundamentals away and add the honk around 2.6 kHz.
7. **Feed resistor 22 MΩ, then 1 MΩ.** Constant charge, then nearly constant
   voltage. The second take is quieter and tilted toward the treble (the
   lowest notes lose their fundamental), because the pickup now hears dC/dt.

On the page, the **slow-motion view** replays the last strike: the reed
bending, the hammer leaving, and, end-on, the potential in the slot solved
live as the reed moves. The **C(y)** view shows where on the curve the strike
swings and the comb voltage it makes. Try the *Reed centred* preset there.

## Files

```
reeds/index.html, style.css           page
reeds/src/reeds-model.js              reed FEM, tuning, losses, hammer, pickup C(y), comb node (no audio, no DOM)
reeds/src/slot-field.js               Laplace solver for the slot cross-section
reeds/src/slot-table.js               C(y) for eight gaps (generated)
reeds/src/reeds-engine.js             real-time engine (AudioWorklet and Node), traceStrike for the views
reeds/src/reeds-params.js             parameters and presets
reeds/src/reeds-main.js               page wiring, info and mode table
reeds/src/reeds-views.js              slow-motion reed and slot, C(y) view
test/reeds-tests.mjs                  node test/reeds-tests.mjs (28 tests, ~4 s)
tools/render-reeds.mjs                node tools/render-reeds.mjs → examples/reeds/
tools/reeds-slot-table.mjs            node tools/reeds-slot-table.mjs → reeds/src/slot-table.js
```

## Simplifications

* **Dimensions and electrical values are estimates.** The 0.5 × 2.4 mm tongue,
  the solder grading, the 0.8 mm comb, the 3 mm insertion, 150 V, 22 MΩ and
  200 pF are plausible values, not measurements of a 200A. Real instruments
  use a few reed blanks and are voiced reed by reed.
* **The slot is two-dimensional.** C(y) is the cross-section's capacitance ×
  the insertion depth. The field at the reed's end and at the mouth of the
  slot, the tip's slight tilt over those 3 mm and the arc it swings on
  (≈ 1 % of ℓ) are left out. The far boundary (a grounded frame 6 mm away)
  changes the tail of C(y) by ~5–20 %, its peak by ~4 %. All reeds are
  identical in their slots.
* **The clamp loss is two fitted numbers.** Their split between shear and
  moment sets how fast the overtones die. Neither is measured.
* **One plane of motion.** Torsion of the flat tongue (≈ 10 kHz and up) and
  sideways bending are not modelled. The hammer has no action mechanics:
  velocity is hammer speed.
* **The preamp, photocell and speakers are behavioural.** They are physically
  motivated stages with plausible constants, not circuit simulations of the
  200A's schematic, and not measured speaker responses. The power amplifier is
  assumed clean.
* **The treble is quieter** (about −7 dB at C7 re A3 at the same velocity,
  through the speakers; on the direct out a forte C7 peaks at only 0.06). A
  displacement-sensing pickup favours the long bass reeds, and nothing here
  re-voices the treble.
* **The frame stop is lossless,** and only the slot point (1.5 mm from the
  tip) touches it.

## Prior art and references

### The original instrument and its inventors

Benjamin F. Miessner patented electrostatic pickups for struck vibrators in
the early 1930s. His later reed-piano patents, and those of Clifford W.
Andersen, were assigned to Wurlitzer.

* Miessner, B. F. (1933). "Method and apparatus for the production of
  music." US 1,929,027.
  [Google Patents](https://patents.google.com/patent/US1929027A/en):
  among its arrangements, a struck vibrator and a fixed plate charged from
  a DC source through a resistance that keeps the charge nearly constant,
  so the vibration appears as an AC voltage across the capacity.
* Andersen, C. W. (1961). "Electronic piano." US 2,974,555 (Wurlitzer,
  filed 1955).
  [Google Patents](https://patents.google.com/patent/US2974555A/en):
  vibrating reeds with sheet-metal pickups capacitively coupled to them and
  shaped to balance the fundamental against the harmonics.
* Miessner, B. F. (1960). "Electronic piano." US 2,942,512 (Wurlitzer).
  [Google Patents](https://patents.google.com/patent/US2942512A/en):
  reed and pickup arrangements in which the reed–pickup capacity
  variation, departing from a sinusoid within each cycle, generates the
  partials.
* Miessner, B. F. (1962). "Electronic piano." US 3,038,363 (Wurlitzer).
  [Google Patents](https://patents.google.com/patent/US3038363A/en):
  tuned cantilever reeds and an electrostatic pickup arranged so that the
  reed modulates the capacity asymmetrically.

### Physics and engineering literature

* Laura, P. A. A., Pombo, J. L. & Susemihl, E. A. (1974). "A note on the
  vibrations of a clamped-free beam with a mass at the free end."
  *J. Sound Vib.* 37(2), 161–168.
  [doi:10.1016/S0022-460X(74)80325-1](https://doi.org/10.1016/S0022-460X%2874%2980325-1)
* Han, S. M., Benaroya, H. & Wei, T. (1999). "Dynamics of transversely
  vibrating beams using four engineering theories." *J. Sound Vib.*
  225(5), 935–988.
  [doi:10.1006/jsvi.1999.2257](https://doi.org/10.1006/jsvi.1999.2257)
* Sader, J. E. (1998). "Frequency response of cantilever beams immersed in
  viscous fluids with applications to the atomic force microscope."
  *J. Appl. Phys.* 84(1), 64–76.
  [doi:10.1063/1.368002](https://doi.org/10.1063/1.368002)
* Chaigne, A. & Askenfelt, A. (1994). "Numerical simulations of piano
  strings. I. A physical model for a struck string using finite difference
  methods." *J. Acoust. Soc. Am.* 95(2), 1112–1118.
  [doi:10.1121/1.408459](https://doi.org/10.1121/1.408459)
* Chatziioannou, V. & van Walstijn, M. (2015). "Energy conserving schemes
  for the simulation of musical instrument contact dynamics."
  *J. Sound Vib.* 339, 262–279.
  [doi:10.1016/j.jsv.2014.11.017](https://doi.org/10.1016/j.jsv.2014.11.017)
* Pfeifle, F. & Münster, M. (2017). "Tone production of the Wurlitzer and
  Rhodes e-pianos." In A. Schneider (ed.), *Studies in Musical Acoustics
  and Psychoacoustics*, Springer, 75–107.
  [doi:10.1007/978-3-319-47292-8_3](https://doi.org/10.1007/978-3-319-47292-8_3):
  high-speed camera measurements and finite-difference models of both
  instruments.

### Earlier models and syntheses

Academic:

* Pfeifle, F. (2017). "Real-time physical model of a Wurlitzer and Rhodes
  electric piano." *Proc. 20th Int. Conf. Digital Audio Effects (DAFx-17)*,
  Edinburgh, 17–24.
  [DAFx archive](https://dafx.de/paper-archive/details/W0D0fMDJBUxiacAi_398wg):
  the reed as a non-uniform cantilever with large-deflection effects, its
  capacitance curve computed from the electric field on slices through the
  reed and pickup geometry, and the output taken as the current
  u₀ dC/dt at constant supply voltage; finite-difference schemes on FPGA
  hardware, compared with measurements (modelled).

Software and instruments:

* [EVP88](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_9_section_1.html)
  (Apple, Logic Pro): component modelling of Rhodes, Wurlitzer and Hohner
  Electra pianos, including the reeds and tines in their pickups' fields.
* [Lounge Lizard EP-5](https://www.applied-acoustics.com/lounge-lizard-ep-5/)
  (Applied Acoustics Systems): a physical-modelling engine with dedicated
  reed and tine models.
* [Pianoteq Electric Pianos](https://www.modartt.com/electric) (Modartt):
  a physically modelled Vintage Reeds instrument, with presets after the
  200A.
* [Wurli V](https://www.arturia.com/products/software-instruments/wurli-v/overview)
  (Arturia): physical modelling of the reeds, pickups, preamp and output
  circuit.
* [Wurly](https://www.audiothing.net/instruments/wurly/) (AudioThing):
  modelled reed and pickup geometry and electric section, with a mechanical
  section of models and samples and sampled speakers (hybrid).
