# Steel Pan

The steelpan of Trinidad: the end of a 55-gallon oil drum hammered into a
bowl, with note areas raised in it as shallow domes, each tuned by hammering
until its three lowest modes ring at the fundamental, the octave and the
twelfth. Nothing here is sampled. Every key is a note area whose modes are
integrated live, and three pieces of physics make it a pan rather than a
bell. The dome's curvature couples the note's own modes, so a hard stroke
pumps the octave out of the fundamental and the tone blooms. The steel
between notes couples each note to its neighbours, which the fourths-and-fifths
layout makes ring along in tune. The skirt decides which partials radiate. You
can flatten the domes, leave the notes untuned, lay the pan out chromatically,
cut the skirt, or roll a held note with the mod wheel.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/steelpan/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (the steel band's A1–F♯6, six bass to high tenor; all 88, A0–C8, with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | sustain: keeps your hands off the notes after key-up |
| MIDI | notes, velocity, sustain pedal (CC64); **mod wheel = roll**; aftertouch rolls the note you lean on |
| Touch | lean on a held key (slide the finger along it, or press harder with an Apple Pencil) = aftertouch: a roll |

## The physics

### 1. A note area and its modes

A note is a patch of thin steel (about a millimetre, thinned by the
sinking) set into the bowl and bounded by grooves or by a sharp change of
curvature, which reflect its bending waves. Holographic interferometry
shows its modes are confined to it, with nodal lines along and across it
(Rossing, Hansen & Hampton 2000). Here the note is a rectangle of
length/width r, simply supported, whose bending modes are

  w_ij(x, y) = sin(iπ(x+1)/2) · sin(jπ(y+1)/2),   x, y ∈ [−1, 1]

with i half-waves along the note and j across it, at

  f_ij / f_11 = (i² + r² j²) / (1 + r²)

(Leissa 1969). The three that matter are the fundamental (1,1), the
octave (2,1), which has a nodal line across the middle of the note, and
the third partial (1,2), which has one along it. (Hansen and Rossing
measured a tuned G3 note's first three at 198.9, 391.9 and 583.8 Hz,
1 : 1.97 : 2.94.) Above
them come nine more, (3,1), (2,2), (3,2) and so on up to 18 kHz. **Note
shape** sets r (1.3 by default). At r = √2 the first three fall on
1 : 2 : 3 by themselves, and (2,2) always sits on 4 × f₁.

### 2. The tuner

A tuner shapes each note until its lowest three partials are harmonic. A
stroke along a mode's nodal line hardly moves that mode, but changes the
stiffness that the others feel, so the partials can be pushed apart one
at a time (Hansen & Rossing 2005; Kronman 1991). **Tuning** chooses the
targets:

| Tuning | (1,1) | (2,1) | (1,2) |
|---|---|---|---|
| Octave and twelfth | f₁ | 2f₁ | 3f₁ |
| Octave and double octave | f₁ | 2f₁ | 4f₁ |
| Untuned (as sunk) | f₁ | the plate's | the plate's |

Pans are tuned one way or the other (Hansen & Rossing 2005). The rest of the modes stay where the plate puts them. No
tuner is exact: **Tuner's accuracy** misses the octave and third partial
by a fixed amount per note, within ± that many cents (2 by default).
The fundamental is on equal-tempered pitch on every key.

### 3. The stick

A rubber-tipped stick stays on the note for about a millisecond. The
force is a half-sine pulse of length τ, whose spectrum

  |F(f)| ∝ |cos(πfτ) / (1 − (2fτ)²)|

is flat below 1/τ and has its first zero at 1.5/τ, so a long contact
reaches only the low modes. τ follows a Hertz contact: it goes as v^(−1/5)
with the stick's speed (Hertz 1882), so a harder stroke is also a shorter,
brighter one, and as f₁^(−1/2) across the pan, since higher notes are
smaller and stiffer. **Stick contact** is τ at C4 for a full-velocity stroke
(0.7 ms). The stroke is an impulse on every mode, shaped by the pulse and
by the mode's shape where the stick lands (**Strike point** along the note
and **Off the long axis** across it). At the centre the octave and third
partial have nodes, so the stick alone cannot excite them. The fundamental
of a full-velocity stroke at the centre moves half a thickness.

### 4. The dome: a 1 : 2 : 3 internal resonance

A curved shell cannot bend without stretching, and stretching a dome
couples its modes quadratically. With the tuned modes x₁, x₂, x₃
measured in thicknesses, their equations are

  ẍₚ + 2σₚẋₚ + ωₚ²xₚ = −∂V/∂xₚ + strike,
  V = g (x₁²x₂ + x₁x₂x₃ + x₂²x₃) + (γω₁²/4) (Σ rₚ² xₚ²)²,

with rₚ = ωₚ/ω₁. Each cubic term is resonant on a tuned note:
x₁² drives x₂ at 2ω₁ = ω₂, x₁x₂ drives x₃ at ω₁ + ω₂ = ω₃, and
x₂² drives x₃ at 2ω₂ when the third partial is a double octave. This
is the kind of internal resonance that Monteil, Touzé, Thomas & Benacchio
(2014) analysed, after Achong (1996) modelled pan notes as nonlinear
oscillators. Measured on a real pan, such couplings switch on at
amplitudes of about 1/25 of the thickness (Thomas, Monteil & Touzé 2014).
The quartic term is the
stretching that every plate has: it keeps the potential bounded and makes a
fortissimo note a few cents sharp.

The coupling grows with the dome: g = 0.05 · **Dome rise** · ω₁², with the
rise in thicknesses (3 by default). The factor 0.05 stands for the
integrals of the mode shapes against the dome, which depend on how the
real note is lopsided: a perfectly symmetric note would not couple its
octave to its fundamental at all. It is a modelling choice, set so that
the octave catches up with the fundamental in a few tens of milliseconds
after a forte stroke at the centre.

Struck at the centre, the octave starts from nothing and grows as the
secular term of a forced oscillator,

  |x₂(t)| ≈ g a² t / 4ω₂,

for a fundamental of amplitude a, so four times faster for a stroke twice
as hard. That is the pan's bloom: a soft note is nearly a pure decay of
what the stick put in, and a hard one brightens after the stroke. Very
hard, the energy goes into the octave and comes back, a slow wobble in the
tone. With no dome the note is linear, and every stroke has the same
colour at any loudness.

### 5. Neighbours and the layout

All the notes share one sheet of steel, so a note's motion pushes on its
neighbours. Between each pair of tuned modes of two neighbouring notes
that are within 3 % of each other, the engine puts a spring,
V = κ w ωₐω_b xₐx_b, with κ the **Note coupling** (0.15 %) and w = 1 for
side-by-side and radial neighbours, ½ for diagonal ones. Modes further
apart hardly exchange energy, and they are left uncoupled.

Each ring holds an octave, and the next ring in holds the octave above.
Anthony Williams laid the ring out in fourths and fifths (his 1953
"spider web" pan, now the standard layout), so each note's neighbours are
its fifth above and below. That makes their partials coincide. C4's
twelfth (3f₁) is G4's octave and G5's fundamental, the C5 inside it is
its octave, and F3's twelfth falls on its octave. Struck, a note sets
these neighbours ringing in tune. The equal-tempered fifth is 2 cents
narrow, so the coincidence is close but not exact. In a **chromatic**
layout, as on early pans, the side-by-side neighbours share nothing, and
only the radial octaves ring along.

### 6. The skirt and what you hear

The skirt is the drum's side wall, left whole on a bass (86 cm) and cut to
14 cm on a tenor. The back of a note radiates in antiphase with its front
and reaches a listener by a path d = L + 28 cm longer (down the skirt and
round the rim of a drum 57 cm across). Where d is short against the
wavelength, the two cancel:

  |1 − e^(−ikd)| / 2 ≈ kd/2,   smoothed here to kd / √(4 + (kd)²),

so a short skirt loses the low partials. The band's skirt for each key is
a smooth fit through the family, L = 0.86 m · (f₁/98 Hz)^(−1.4), between 14
and 86 cm, and **Skirt length** scales it. Each mode's surface velocity is
heard through that factor, as by a close microphone. The notes are spread
across the stereo field by pitch.

### 7. Hands and rolls

Pannists let notes ring. Here letting go of a key lays a hand on the note
(T₆₀ **Hand mute**, 0.3 s), which also stills the neighbours that were only
ringing along with it. **Let notes ring** or Space (the sustain pedal) keeps
the hands off. A long note on a pan is a roll: both sticks strike again and
again. While a key is held, **Roll** (the mod wheel) restrikes it at that
fraction of its first stroke, **Roll speed** times a second, alternating
hands a little unevenly. Aftertouch rolls the note you lean on.

### 8. The engine

Every key is a note, alive while it sounds, with up to twelve modes as
exact two-pole resonators (the impulse-invariant discretisation of a
damped oscillator). Each sample, the dome's forces and the neighbours'
springs are computed from the current displacements and fed to the
resonators as forces. A note that comes alive wakes its neighbours. Those
run only their three tuned modes until they are struck, and every note
goes to sleep once it has rung out. The fundamental rings for **Ring time
at C4** (1.6 s), longer down the pan and shorter up it as 1/√f₁, and the
other modes die faster as (f/f₁)^**Damping vs frequency** (0.6). A stroke
is never cut off: a second stroke on a ringing note adds to it, as on the
real pan. The page draws the pan around the last note played, every note
glowing with its amplitude, and the amplitudes of that note's three tuned
modes over time.

## What to listen for

The demos are in `examples/steelpan/`.

1. **A calypso** on the tenor over a strummed double-second part, notes
   left to ring.
2. **Soft to hard strokes** on one note. The soft ones are a plain
   decay. The hard ones bloom, as the octave rises after the stroke.
3. **Flat notes, then high domes**, the same hard phrase twice. Flat, the
   tone is fixed. Domed, it brightens and wobbles.
4. **Tuned, then untuned as sunk.** The untuned notes clang: their octave
   and twelfth are a semitone or more off.
5. **Neighbours ring along: fifths, then chromatic.** C4 struck once and
   left to ring. In fourths and fifths, G4, G5 and C5 take up its twelfth
   and octave, and the note is fuller and longer. Chromatic, only the
   octave rings on.
6. **A rolled chord**, the roll swelling with the mod wheel.
7. **A bass line with a tenor's skirt, then the whole drum.** The short
   skirt loses the fundamentals to the back of the notes.

## Files

```
steelpan/index.html, style.css            page
steelpan/src/steelpan-params.js           parameters and presets
steelpan/src/steelpan-instrument.js       the descriptor: everything but the page
steelpan/src/steelpan-main.js             page wiring and views
steelpan/src/steelpan-wasm.js, steelpan/wasm/steelpan.wasm   the engine and model, built from the C++
native/instruments/steelpan/              the physics in C++: model and engine (plugins and WebAssembly)
test/steelpan-tests.mjs                   node test/steelpan-tests.mjs
tools/render-steelpan.mjs                 node tools/render-steelpan.mjs → examples/steelpan/
```

## Simplifications

- **The note is a rectangle.** Real notes are ellipses with soft
  boundaries, and their upper modes come in near-degenerate pairs (Hansen
  & Rossing 2005). The rectangle's modes have the right nodal lines for the
  three tuned modes and plausible places for the rest.
- **The tuner's work is given, not done.** The tuned modes are put on
  their targets. The model does not hammer the note, or say how its
  stiffness and curvature move them.
- **One coupling constant for the dome.** The three cubic terms share one
  coefficient. In a real note they differ, depend on the note's
  asymmetry, and Monteil et al. fit them to each note. Other quadratic
  terms (a note's 2f₁ in its own fundamental, and the dome's slow sag)
  are left out.
- **Neighbours couple only near resonance**, and only through their tuned
  modes. The steel between notes, the skirt's own modes (Hansen and
  Rossing found one at 830 Hz, beside a G5 note) and the rest of the bowl are not modelled.
- **One pan for 88 keys.** The band's pans each cover part of the range
  with their own skirt, sink depth and note sizes. Here one layout and one
  set of knobs covers all of them, and the skirt follows the key.
- **Radiation** is a single factor per mode for the skirt. The real
  pattern depends on the mode's shape (an antisymmetric octave radiates as
  a dipole), the bowl and the room.
- **No stick bounce or double strokes**, and the stick does not stop the
  note while it is in contact.

## Quality

The Quality setting (in the controls, for phones and older computers) keeps
High as described here. The pan is light already, so Medium and Low trim
only a little: a stroke rings at most 8 of a note's modes at Medium and 6 at
Low (12 at High), dropping the highest untuned ones and any above 16 and
12 kHz, and a note goes quiet a little sooner once it has rung out. The
fundamental, octave and twelfth, the dome's coupling and the neighbours
singing along all stay; what goes is a little of the stick's metallic top.

## Prior art and references

**The original instrument.**
- The steelband grew up in Trinidad in the late 1930s and 1940s.
  Winston "Spree" Simon, Ellie Mannette, Neville Jules and Anthony Williams
  are among its pioneers. Mannette is credited with sinking the playing
  surface of a 55-gallon drum into a concave bowl around 1946
  ([Percussive Arts Society](https://pas.org/elliott-ellie-mannette/)),
  and Williams with the fourths-and-fifths "spider web" layout of 1953
  ([NIHERST](https://niherst.gov.tt/icons/icon/anthony-williams-tt1)).
- U. Kronman (1991). *Steel Pan Tuning: A Handbook for Steel Pan Making
  and Tuning.* Musikmuseet, Stockholm (Musikmuseets skrifter 20).
- B. R. Copeland (2010). "G-Pan musical instrument." US Patent 7,750,220
  (filed 2008, assigned to the Government of the Republic of Trinidad and
  Tobago). [Google Patents](https://patents.google.com/patent/US7750220).
  A family of pans with an extended range.

**The physics.**
- T. D. Rossing, D. S. Hampton & U. J. Hansen (1996). "Music from oil
  drums: the acoustics of the steel pan." *Physics Today* 49(3), 24–29.
  [doi:10.1063/1.881489](https://doi.org/10.1063/1.881489).
- T. D. Rossing, U. J. Hansen & D. S. Hampton (2000). "Vibrational mode
  shapes in Caribbean steelpans. I. Tenor and double second." *J. Acoust.
  Soc. Am.* 108(2), 803–812.
  [doi:10.1121/1.429613](https://doi.org/10.1121/1.429613).
- U. J. Hansen, T. D. Rossing, E. Mannette & K. George (1995). "The
  Caribbean steel pan: tuning and mode studies." *MRS Bulletin* 20(3),
  44–46. [doi:10.1557/S0883769400044419](https://doi.org/10.1557/S0883769400044419).
- U. J. Hansen & T. D. Rossing (2005). "The Caribbean steelpan, and some
  offsprings." *Forum Acusticum*, Budapest. Mode frequencies of a G3 note,
  coupling between the C4, G4 and G5 notes, and the skirt.
- O. Thomas, M. Monteil & C. Touzé (2014). "Complicated dynamics exhibited
  by thin shells displaying numerous internal resonances: application to
  the steelpan." *European Nonlinear Dynamics Conference (ENOC 2014)*,
  Vienna. [HAL hal-01134689](https://hal.science/hal-01134689). Couplings
  from 1/25 of the thickness; 1 : 2 : 2 and 1 : 2 : 4 models fitted to a
  struck note.
- A. Achong (1996). "The steelpan as a system of non-linear mode-localized
  oscillators, I: theory, simulations, experiments and bifurcations."
  *J. Sound Vib.* 197(4), 471–487.
  [doi:10.1006/jsvi.1996.0543](https://doi.org/10.1006/jsvi.1996.0543).
- M. Monteil, C. Touzé, O. Thomas & S. Benacchio (2014). "Nonlinear forced
  vibrations of thin structures with tuned eigenfrequencies: the cases of
  1:2:4 and 1:2:2 internal resonances." *Nonlinear Dynamics* 75, 175–200.
  [doi:10.1007/s11071-013-1057-7](https://doi.org/10.1007/s11071-013-1057-7).
- P. Bryde & L. Mahadevan (2022). "Localization in musical steelpans."
  [arXiv:2212.14465](https://arxiv.org/abs/2212.14465). Why a note's
  modes stay in the note: the change of curvature at its edge.
- A. W. Leissa (1969). *Vibration of Plates.* NASA SP-160. The simply
  supported rectangular plate.
- H. Hertz (1882). "Über die Berührung fester elastischer Körper." *J.
  reine angew. Math.* 92, 156–171. The contact law behind the stick's
  v^(−1/5).

**Earlier models and syntheses.**
- [Steelpan Synthesis and Intangible Cultural Heritage](https://doi.org/10.23919/EUSIPCO63174.2024.10715113)
  (R. Ali & H. Khan, EUSIPCO 2024): a mathematical model of the steelpan,
  discretised for synthesis, used to compare the timbres of pans.
- [Nonlinear vibrations of steelpans: analysis of mode coupling in view of
  modal sound synthesis](https://hal-ensta-paris.archives-ouvertes.fr/hal-01138173)
  (M. Monteil, C. Touzé & O. Thomas, Stockholm Music Acoustics Conference
  2013): models of the mode couplings, aimed at reduced-order modal
  synthesis.
- [Apparatus for percussive harmonic musical synthesis utilizing MIDI
  technology](https://patents.google.com/patent/US8063296B2) (B. R.
  Copeland, M. Byron, E. Philip & K. Maynard, University of the West
  Indies, US Patent 8,063,296, 2011): an electronic pan, pads laid out as a
  tenor's, played through MIDI synthesis.
