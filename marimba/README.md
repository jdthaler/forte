# Marimba and Xylophone

Two instruments from one piece of wood: the five-octave concert marimba
(C2–C7) and the orchestral xylophone (F4–C8), both rosewood bars over
stopped tubes. Nothing here is sampled. Each bar is solved by finite
elements (the vibraphone's Timoshenko beam, with the wood's stiffness and
its soft shear) and its arch cut shaped until its modes land on a chord:
the marimba's first three at 1 : 4 : 10, the xylophone's thicker bar's
first two at 1 : 3. The tube under it shares the bar's air and draws the
fundamental out as sound, and its second resonance, three times higher,
sits right on the xylophone's twelfth (if the mouth is placed to hear it).
Wood loses energy a hundred times faster than the vibraphone's aluminium,
so the notes are short, and a held key rolls, the two mallets in turn, as
a marimbist sustains a note.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/marimba/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (all 88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity (the mallet's speed, up to 3 m/s by default) |
| `Space` | holds the keys down: held notes keep rolling (a marimba has no dampers) |
| MIDI | notes, velocity, CC64 (holds the keys); **mod wheel = roll**; aftertouch rolls the key leaned on; MPE slide rolls one note |

## The physics

### 1. The bar: rosewood, cut underneath

Every bar is Honduras rosewood, the classic marimba and xylophone wood:
1025 kg/m³ and E = 22 GPa along the grain (The Wood Database). A marimba
bar is 24 mm thick at C2 and 19 mm at C7, 76 mm wide in the bass and
41 mm at the top; a xylophone bar is narrower and as thick (41 to 32 mm
wide, 24 to 20 mm thick, F4 to C8). These are plausible sizes, graded
along each compass, not a maker's drawings.

The bar is solved exactly as the [vibraphone](../vibraphone/README.md)'s
is: a **Timoshenko beam** (shear and rotary inertia) whose thickness
follows the cut, by finite elements on half the bar, with Saint-Venant
torsion on the same mesh (the code is shared). What changes is the
material. Wood is stiff along the grain and soft across it: its shear
modulus is a tenth or less of E (the Wood Handbook's hardwoods run from
E/7 to E/18; rosewood is not in its table, so the model takes E/13, with
the shear coefficient 5/6). Shear matters in a short thick bar, and far
more in wood than in aluminium (E/κG = 15.6 against 3.2): a plain C7
marimba bar, 20 cm long and 19 mm thick, rings at 1 : 2.4 : 4.5 rather
than the slender beam's 1 : 2.756 : 5.404 (tested). A plain A0 bar, 2 m
long, gives the slender beam's f₁ = (β₁L)² h √(E/12ρ) / 2πL² to 3 ¢
(tested).

### 2. The cut: 1 : 4 : 10 and 1 : 3

A plain bar's overtones belong to no harmonic series. The maker thins the
middle of the bar from underneath, where the low modes bend most, and pulls
them down into tune:

* **The marimba** is cut with a long, deep arch (a flat centre with
  cosine sides, as on the vibraphone; the flat share of the cut rises from
  0.2 in the bass to 0.7 at C7). Its length, the arch's length and its
  depth are solved together, by Newton's method, so that the first three
  bending modes sit at **1 : 4 : 10**, two octaves and then three octaves
  and a major third above the note (Fletcher & Rossing; Rossing). Bork's
  listeners preferred the third a little flat, at 9.88 (Rossing 2001);
  this marimba takes the textbook 10.
* **The xylophone** is cut with a short, shallow arch (its length held at
  0.6 to 0.5 of the half-bar, its flat share 0.3), and only two things are
  solved: the depth and the length that put the first overtone at
  **3 × f₁**, a twelfth (Rossing 2001). The third mode falls where the cut
  leaves it: 5.8 × f₁ at F4, 5.6 at C6, near the 1 : 3 : 6 some makers tune
  to (tested: 5.3 to 7 across the compass).

`tools/marimba-bars.mjs` tunes all 88 bars of each kind, A0–C8, walking
out from the bottom of each compass, and writes the table the instrument
plays (`marimba-bars.h`); every bar meets its ratios to 10⁻⁶ ¢ (the test
checks every key to 0.01 ¢).

| key | marimba bar | thinnest | modes 4, 5 (× f₁) | tube | xylophone bar | thinnest | mode 3 |
|---|---|---|---|---|---|---|---|
| C2 | 74.7 cm × 76 mm, 976 g | 8.5 mm | 17.0, 24.7 | 125 cm, ⌀ 90 mm | | | |
| C3 | 56.1 cm × 67 mm, 684 g | 9.2 mm | 16.1, 22.0 | 61 cm, ⌀ 77 mm | | | |
| C4 | 38.8 cm × 59 mm, 411 g | 8.8 mm | 15.3, 20.1 | 29 cm, ⌀ 65 mm | | | |
| F4 | | | | | 49.7 cm × 41 mm, 455 g | 18.4 mm | 5.80 |
| C5 | 25.8 cm × 52 mm, 235 g | 7.9 mm | 14.5, 18.2 | 14 cm, ⌀ 55 mm | 39.1 cm × 39 mm, 332 g | 17.2 mm | 5.71 |
| C6 | 16.7 cm × 46 mm, 131 g | 6.8 mm | 13.3, 16.0 | 6 cm, ⌀ 47 mm | 25.3 cm × 37 mm, 185 g | 14.5 mm | 5.57 |
| C7 | 10.4 cm × 41 mm, 72 g | 5.3 mm | 11.5, 14.0 | 2.4 cm, ⌀ 40 mm | 15.1 cm × 34 mm, 94 g | 10.8 mm | 5.59 |
| C8 | | | | | 7.3 cm × 32 mm, 37 g | 5.9 mm | 6.72 |

What the cut buys: the marimba's deep arch shortens a bar to 55–60 % of a
plain bar on the same note (a plain C2 is 132 cm long), the xylophone's
shallow one to 80–90 % (tested). The marimba's top bars come out short
(10 cm at C7): tuning a third mode at 21 kHz takes a deep, narrow slot.
Real makers often tune only 1 : 4 up there and leave the bar longer.

**Every key has a bar.** The keys past each compass carry its design on:
the end bars' blanks, cut and tuned the same way, each over its own tube.
A marimba bar at A0 is 1.2 m long over a 3 m tube; a xylophone bar at C2,
1.2 m. At the very top, past C7, the marimba's bars are wider than they are
long, more plates than beams, and their torsion falls below their
fundamental. Modes above 0.45 × the sample rate are left out rather than
allowed to fold back.

### 3. How long a bar rings

Each mode loses energy at σ (amplitude ∝ e^(−σt), T₆₀ = 6.91/σ), the sum of:

* **the wood's internal friction**, σ = πfη, with η the **Wood's internal
  friction** knob, 4×10⁻³ by default. Aramaki et al. measured 59 woods as
  xylophone bars tuned to 1 kHz: rosewood (*Dalbergia*) damped least,
  σ = 14.3 s⁻¹, which is η = σ/πf = 4.5×10⁻³ with everything else that
  damped those bars included. Aluminium's is 10⁻⁴. So a wooden bar's
  upper partials die fast, in proportion to their frequency;
* **the cords** through the bar at mode 1's nodes (19–22 % of the length,
  from the finite elements), dashpots as on the vibraphone;
* **radiation from the bar itself**, as a strip of dipoles (vibraphone,
  section 3).

There is no heat-flow (Zener) loss: wood's thermal expansion along the
grain is a fifth of aluminium's and its heat flow far slower, so it is
negligible beside the friction.

| key | T₆₀ alone: mode 1 | mode 2 | mode 3 | with its tube: mode 1 |
|---|---|---|---|---|
| C2 | 8.4 s | 2.0 s | 0.82 s | 3.4 s |
| C3 | 4.2 s | 1.0 s | 0.40 s | 2.9 s |
| C4 | 2.1 s | 0.51 s | 0.18 s | 1.5 s |
| C5 | 1.05 s | 0.25 s | 0.08 s | 0.65 s |
| C6 | 0.52 s | 0.12 s | 0.04 s | 0.43 s |

### 4. The resonator: a stopped tube and its second resonance

Under each bar hangs a tube closed at the bottom, its bore graded from
90 mm (C2) to 40 mm (C7) on the marimba and from 52 to 30 mm on the
xylophone. It is lumped at its mouth, as the vibraphone's is, in terms of
the volume X pushed out of it: m_a = ρ₀ℓ_e/2S, with ℓ_e the length plus the
open end's correction 0.61a (Levine & Schwinger). A tube closed at one end
resonates only at **odd** multiples of its first resonance, a quarter
wave, three quarters, five quarters: the model keeps the first two, both
with the same m_a (a closed–open tube's modes all have the same effective
mass at the mouth),

  K_a,m = m_a ((2m − 1)πc / 2ℓ_e)²,   m = 1, 2,

each with its own losses: radiation from the mouth, ρ₀ck²/4π; the walls'
boundary layers, α = 2.95×10⁻⁵ √f / a per metre (Fletcher & Rossing); and
the plug at the bottom. Each tube is cut so that, with the bar in place, its
first resonance is the bar's note (**Tube tuning** offsets it): 125 cm long
at C2, 29 cm at C4, 2.4 cm at C7 (tested: within 5 % of λ/4 − 0.61a, a
little shorter for the gap). Real bass marimbas fold such tubes, or end
them in a box; these are straight.

### 5. Bar and tube: two oscillators sharing the air

Bar mode 1 and the tube's first resonance are coupled as on the
vibraphone: the bar pushes S_b of air per unit of its modal coordinate
towards the mouth, that air goes into the tube or escapes sideways through
the gap g with an inertance m_g = ρ₀ ln(1 + R_b/g) / 2πg, and the shared
kinetic energy ½ m_g (Ẋ − S_b q̇)² couples the two through their masses
(vibraphone, section 5). κ is about 0.0065 on the marimba at the default
25 mm gap, closer gaps give more (tested), and the tube makes the
fundamental **20–29 dB louder** at C2–C5 (tested at C3 and C4: > 10 dB)
and the note shorter, since what it radiates the bar loses. In the bass the
tube is a sharp resonator (Q ≈ 100 at C2 and C3) and fills slowly: the
fundamental swells for a few tenths of a second after the stroke.

**The second pair.** Bar mode 2 and the tube's second resonance (3 × the
first) are a second such pair. On a xylophone they are in tune: bar mode 2
is at 3 × f₁ by the cut, which is the textbook reason the xylophone is cut
to a twelfth (Rossing 2001: the closed tube "amplifies both the
fundamental and the first overtone"). But mode 2 is antisymmetric: it rocks
the bar about its centre, one half pushing air down as the other draws it
up. Over a mouth centred under the bar the two halves cancel and
S_b = ∫ w₂ dA = 0, exactly (tested: κ₂ < 10⁻⁹). **Tube mouth off centre**
moves the mouth along the bar; then mode 2 does push air into it, κ₂ grows
with the offset, and the tube's second resonance takes the twelfth up:
it dies faster (tested) and part of its sound comes from the mouth. On the
marimba the tube's 3 f₁ sits a fourth below bar mode 2 (4 f₁), and the
pair hardly exchanges anything.

### 6. The mallet

The vibraphone's power-law head, F = Kδ^2.3 + Kα d(δ^2.3)/dt, solved
implicitly against every mode at the strike point and both bar–tube pairs,
energy-conserving (Chatziioannou & van Walstijn). **Mallet hardness** is
the force at 1 mm of squash: 300 N by default, a medium marimba yarn
mallet, up to 30 kN for a hard plastic xylophone mallet. The default 14 g
yarn head stays on a bar for about a millisecond, which is longer than a
period of everything above 1 kHz: it rings the fundamental and hardly the
upper partials. The xylophone preset's 12 kN, 12 g head leaves in a
fraction of that and rings them all (tested: 10 f₁ against f₁ up by more
than 10 dB from yarn to plastic). Velocity sets the head's speed. On the
marimba's top octave a yarn mallet stays on for two periods of the note,
so the top keys are quiet with it, as on the instrument, whose players
change to harder mallets up there.

Where it lands matters. At the centre, mode 2 has a node (the default,
0.42, is near it: a mellow tone); at the end every mode speaks; on mode 1's
node (about 21 %) the fundamental drops out. Off the centre line the bar
twists, and its torsion joins in.

### 7. The roll

A bar cannot be made to sustain, and a marimba has no pedal. A marimbist
holds a note by **rolling**: the two mallets strike in turn, about a dozen
times a second. Here a held key rolls when the **Roll** is up (the mod
wheel), struck again at that fraction of the first stroke's velocity,
**Roll speed** strokes a second (both mallets together; 12 by default),
each stroke up to 3 % early or late, the second mallet landing 3 % of the
length nearer the centre and on the other side of the centre line.
Aftertouch on one key, or its own MPE slide, rolls it alone. Letting go of
the key ends the roll; the bar then rings away by itself (tested: the
strokes counted, the rolled note held, the released one dying).

### 8. The engine

One voice per bar: striking a ringing bar hits it where it is. The bar's
modes 3–5 and its two torsion modes are exact two-pole recursions; bar
mode 1 with the tube's first resonance, and bar mode 2 with its second,
are each integrated by the implicit midpoint rule, their stiffnesses
pre-warped so each keeps its own frequency, as the vibraphone's pair is.
The output is the tubes' volume acceleration (a monopole) plus each bar
mode's own radiation, panned by the bar's place along the frame (bass on
the left). The bars' modes come from a finite-element solve of a
millisecond or two, built off the audio thread for the instrument, the
undercut depth and the keyboard's tuning, or by the page and sent with the
note; the gap, the tube tuning and the mouth's offset are read every
block, so they glide.

## What to listen for

* **The two cuts.** The **Xylophone: hard plastic mallets** preset, then
  switch **Instrument** to Marimba with the same mallets: the twelfth's
  dry, bright knock against the marimba's rounder double octave.
* **The plain bar.** Undercut depth to 0: the clang of 1 : 2.76 : 5.40.
* **The tubes.** **No resonators: the bars alone**, then put them back:
  the fundamental comes up by 20 dB and more, and in the bass swells after
  the stroke. **Tubes pressed close** brings bar and tube nearer to sharing
  their energy.
* **The twelfth through the tube.** **Xylophone, tubes off centre**: struck
  near the end, the 3 × f₁ partial grows louder and shorter as the mouth
  moves off centre; with the mouth centred the tube cannot hear it.
* **Wood.** **Dry wood** and **A ringing bar** move η by a factor of 20:
  the difference between a dead bar and something nearer a vibraphone's.
* **Mallets.** **Soft yarn** against **Marimba with xylophone mallets**:
  the contact time in the bar view decides the colour.
* **The roll.** **Marimba rolled: a chorale**: hold chords; the mod wheel
  sets how hard the mallets roll.

## Files

```
marimba/index.html, style.css            page
marimba/src/marimba-instrument.js        the descriptor: parameters, keys, roll, engine; the compasses and target ratios
marimba/src/marimba-params.js            parameters and presets
marimba/src/marimba-main.js              page wiring and views
marimba/src/marimba-tour.js              the guided tour
marimba/src/marimba-wasm.js              the C++ engine and model as WebAssembly (marimba/wasm/marimba.wasm)
native/instruments/marimba/              the physics in C++: blanks, tuning, losses, radiation, tubes, coupling,
                                         mallet (marimba-model), the engine, the tuned bars (marimba-bars.h), tables, reference
native/instruments/vibraphone/bar.*      the bars' finite elements, shared with the vibraphone
test/marimba-tests.mjs                   node test/marimba-tests.mjs (24 tests, on the WebAssembly)
tools/marimba-bars.mjs                   node tools/marimba-bars.mjs → native/instruments/marimba/marimba-bars.h
tools/render-marimba.mjs                 node tools/render-marimba.mjs → examples/marimba/
```

## Simplifications

* **Dimensions are plausible, not measured.** The widths, thicknesses,
  tube bores and the family of cut shapes are reasonable choices, not a
  maker's drawings; real cuts are shaped by hand, and real top bars are
  often tuned 1 : 4 only, which leaves them longer.
* **Wood is one material.** Rosewood along the grain with one shear
  modulus (an estimate) and one loss factor for every mode; real wood
  varies from bar to bar, its loss rises somewhat with frequency, and its
  grain is never quite along the bar.
* **A beam, not a solid**, as on the vibraphone: no width modes, no
  warping. Past C7 the marimba's bars are too short for a beam to describe
  them well.
* **Each tube resonance couples to one bar mode.** The tube's two
  resonances share one mouth, and an off-centre mouth would let bar mode 1
  drive the second resonance and mode 2 the first; those cross terms are
  far out of tune and left out. The gap's inertance is the vibraphone's
  radial-flow estimate.
* **The mallet** is a point contact; the wood's own dent under a hard
  mallet (a second spring in series) is left out, and the head never
  double-strikes or bounces.
* **No sympathetic resonance**: bars and tubes do not drive their
  neighbours, and the frame does not ring.
* **The roll** strikes as often as asked whether or not the bar has moved
  away from the last stroke, and its strokes are evenly spaced but for a
  little jitter.

## Quality

The Quality setting (in the header, for phones and older computers) keeps
High as described here. The engine is light already, so Medium and Low
trim little: Medium lets 12 bars ring at once instead of 16, Low 8, and
both leave out a bar's modes above 16 and 12 kHz and let a bar go once it
has fallen 70 and 60 dB (90 dB at High). Each bar and its tube are played
in full, so a note keeps its pitch and level (tested).

## Prior art and references

**The original instruments.**
- J. C. Deagan (1903). "Musical instrument." US Patent 747,341.
  [Google Patents](https://patents.google.com/patent/US747341). Graduated
  tube resonators under the bars of a xylophone.
- J. C. Deagan (1916). "Percussion musical instrument." US Patent
  1,173,783. [Google Patents](https://patents.google.com/patent/US1173783).
  A telescoping resonator tube under each bar.
- J. C. Deagan (1916). "Musical instrument of xylophone type." US Patent
  1,207,281. [Google Patents](https://patents.google.com/patent/US1207281).
- [Percussive Arts Society Hall of Fame: John Calhoun Deagan](https://pas.org/john-calhoun-deagan)
  (1853–1934), whose company made the chromatic xylophones and marimbas,
  with tuned resonators, from which the orchestral instruments descend.
- [Britannica: Marimba](https://www.britannica.com/art/marimba). One of
  many African names for the xylophone, carried to Central America, where
  the marimba is the national instrument of Guatemala.
- Yamaha, [The history of the marimba](https://fi.yamaha.com/files/download/brochure/1/1224901/Marimba_history_en.pdf):
  the YM-6000 (1984, with Keiko Abe), the first five-octave concert
  marimba, C2–C7.
- Yamaha, [YX-500R/F specifications](https://usa.yamaha.com/products/musical_instruments/percussion/xylophones/yx-500r_f/specs.html):
  a concert xylophone of three and a half octaves, F4–C8.

**The physics.**
- F. Orduña-Bustamante (1991). "Nonuniform beams with harmonically
  related overtones for use in percussion instruments." *J. Acoust. Soc.
  Am.* 90(6), 2935–2941.
  [doi:10.1121/1.401768](https://doi.org/10.1121/1.401768).
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
- A. Bretos, C. Santamaría & J. Alonso Moral (1999). "Finite element
  analysis and experimental measurements of natural eigenmodes and random
  responses of wooden bars used in musical instruments." *Applied
  Acoustics* 56(3), 141–156.
  [doi:10.1016/S0003-682X(98)00030-9](https://doi.org/10.1016/S0003-682X%2898%2900030-9).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific, Singapore. [doi:10.1142/4294](https://doi.org/10.1142/4294).
- T. D. Rossing (2001). "Acoustics of percussion instruments: recent
  progress." *Acoust. Sci. Technol.* 22(3), 177–188.
  [doi:10.1250/ast.22.177](https://doi.org/10.1250/ast.22.177). The
  marimba's 1 : 4 : 10 (and Bork's preferred 9.88), the xylophone's 1 : 3
  and its tube's second resonance.
- B. H. Suits (2001). "Basic physics of xylophone and marimba bars."
  *Am. J. Phys.* 69(7), 743–750.
  [doi:10.1119/1.1359520](https://doi.org/10.1119/1.1359520).
- M. Aramaki, H. Baillères, L. Brancheriau, R. Kronland-Martinet &
  S. Ystad (2007). "Sound quality assessment of wood for xylophone bars."
  *J. Acoust. Soc. Am.* 121(4), 2407–2420.
  [doi:10.1121/1.2697154](https://doi.org/10.1121/1.2697154). The
  damping of 59 woods as xylophone bars; rosewood the least.
- D. Holz (1996). "Tropical hardwoods used in musical instruments – can we
  substitute them by temperate zone species?" *Holzforschung* 50(2),
  121–129. [doi:10.1515/hfsg.1996.50.2.121](https://doi.org/10.1515/hfsg.1996.50.2.121).
- D. E. Kretschmann (2010). "Mechanical properties of wood." Chapter 5 of
  *Wood Handbook: Wood as an Engineering Material*, FPL-GTR-190, USDA
  Forest Products Laboratory.
  [Treesearch](https://research.fs.usda.gov/treesearch/37440). Table 5-1,
  the hardwoods' elastic ratios.
- [The Wood Database: Honduran Rosewood](https://www.wood-database.com/honduran-rosewood/):
  density and modulus of elasticity.
- D. Beaton & G. Scavone (2021). "Three-dimensional tuning of idiophone
  bar modes via finite element analysis." *J. Acoust. Soc. Am.* 149(6),
  3758–3768. [doi:10.1121/10.0005062](https://doi.org/10.1121/10.0005062).

**Earlier models and synthesis projects.**
- A. Chaigne & V. Doutaut (1997). "Numerical simulations of xylophones.
  I. Time-domain modeling of the vibrating bars." *J. Acoust. Soc. Am.*
  101(1), 539–557. [doi:10.1121/1.418117](https://doi.org/10.1121/1.418117).
  A finite-difference model of a non-uniform damped bar struck by a mallet
  with Hertzian contact.
- V. Doutaut, D. Matignon & A. Chaigne (1998). "Numerical simulations of
  xylophones. II. Time-domain modeling of the resonator and of the
  radiated sound pressure." *J. Acoust. Soc. Am.* 104(3), 1633–1647.
  [doi:10.1121/1.424376](https://doi.org/10.1121/1.424376). Adds the
  coupled tubular resonator and radiation.
- L. Henrique & J. Antunes (2003). "Optimal design and physical modelling
  of mallet percussion instruments." *Acta Acust. united Acust.* 89,
  948–963 (no DOI). Finite-element optimisation of marimba bar profiles,
  then modal synthesis of mallet impacts.
- F. Soares, J. Antunes & V. Debut (2022). "A minimal model of the
  bar-resonator vibroacoustic interaction in mallet percussion
  instruments." *Applied Acoustics* 199, 109049.
  [doi:10.1016/j.apacoust.2022.109049](https://doi.org/10.1016/j.apacoust.2022.109049).
  The bar's fundamental as an oscillator coupled to the tube.
- F. Soares, V. Debut & J. Antunes (2023). "The bar-resonator interaction
  in mallet percussion instruments: a multi-modal model and experimental
  validation." *J. Sound Vib.* 548, 117528.
  [doi:10.1016/j.jsv.2022.117528](https://doi.org/10.1016/j.jsv.2022.117528).
  Several bar modes and several tube modes, coupled.
- [STK ModalBar](https://ccrma.stanford.edu/software/stk/classstk_1_1ModalBar.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): a modal struck bar with
  marimba presets.
- [Faust physmodels.lib `marimbaModel`](https://faustlibraries.grame.fr/libs/physmodels/)
  (GRAME): a modal bar made with Mesh2Faust from a 3D model, coupled to a
  resonance tube.
- [Pianoteq Xylo](https://www.modartt.com/xylo) (Modartt, 2010):
  physically modelled xylophone (F4–C8) and bass marimba (C2–C7).
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/)
  (Applied Acoustics Systems): coupled modelled resonators, including
  marimba-bar and tube types, excited by a mallet.

**Further sources used in this model.** The vibraphone's (its README):
Cowper's shear coefficient, Reddy's interdependent elements, Roark's
torsion constant, Levine & Schwinger's end correction, and Chatziioannou &
van Walstijn's energy-conserving contact.
