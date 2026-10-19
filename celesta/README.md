# Celesta

A keyboard that plays steel bars: each key throws a small felt hammer at a thin
rectangular steel bar, which rests on two blocks over a wooden box tuned to it.
Auguste Mustel built the first in Paris in 1886, and Tchaikovsky made it famous
in *The Nutcracker* (1892). Here every bar is solved as a Timoshenko beam and cut
to length, every box is a stopped pipe that shares the air in the gap with its
bar, and the hammers are felt springs that leave when the bar throws them off.
The note's short, sweet sound is what that exchange leaves: the bar's overtones
glint and vanish, the box takes the fundamental and gives it to the room. Pull a
box closer and you hear bar and box trade energy; take the boxes away and the
bars are almost silent; harden the hammers and it turns into a keyboard
glockenspiel.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/celesta/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (Z is C4, the bottom of the compass) |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | damper pedal: lifts every damper felt |
| MIDI | notes, velocity, damper pedal (CC64), sostenuto (CC66), soft pedal (CC67), mod wheel: the hammer felt |

The real celesta's compass is the four octaves C4–C8 (written an octave lower);
**Full range** opens A0–C8.

## The physics

### 1. The bars: plain steel, solved as Timoshenko beams

A celesta bar is a flat rectangle of steel, not undercut like a vibraphone's.
Here it is 2.5 mm thick and 30 mm wide at C4, thinning to 2.0 mm and narrowing to
20 mm at C8 (Yamaha's guide gives 20–30 mm for the width, and a summary of it 2.5 mm
for the thickness in the bass and 2 mm in the treble), in steel with E = 205 GPa, ρ = 7850 kg/m³, ν = 0.29. Each bar is
cut to the length that puts its first bending mode on its note: 224 mm at C4 and
50 mm at C8, close to the 8 to 2 inches of the Mustel celesta at Grinnell College (whose bars
are a little thicker, 0.13 inch).

A bar this short and stiff is a Timoshenko beam: as well as bending, its
sections shear and rotate, and both lower every mode, the higher ones most. With
w the deflection and ψ the rotation of a section,

  κGA (w″ − ψ′) + ρAω² w = 0,    EI ψ″ + κGA (w′ − ψ) + ρIω² ψ = 0

where κ = 10(1 + ν)/(12 + 11ν) is Cowper's shear coefficient for a rectangle.
Solutions go as e^{λx}, with λ² the roots of

  λ⁴ + ρω²(1/κG + 1/E) λ² + ρ²ω⁴/(EκG) − ρAω²/(EI) = 0,

a pair ±α (hyperbolic) and a pair ±iβ (trigonometric). Free at both ends means no
bending moment (ψ′ = 0) and no shear force (w′ = ψ) at x = 0 and x = L. The first
end fixes two of the four constants; the second leaves a 2 × 2 determinant in ω
whose zeros are the bending frequencies. The model scans it for sign changes and
bisects each one, then reads each mode's shape from the constants and scales it
to unit modal mass, ∫(ρA w² + ρI ψ²) dx = 1. As the bar gets thin the frequencies
become Euler–Bernoulli's, (βₙL)² √(EI/ρA) / (2πL²) with cos βL cosh βL = 1, whose
ratios are 1 : 2.756 : 5.404 : 8.933 : 13.34.

The torsional modes are Saint-Venant's: fₙ = n/(2L) √(GJ/ρIₚ), with J the torsion
constant of a b × h rectangle (Roark) and Iₚ = bh(b² + h²)/12. A hammer on the centre
line cannot twist the bar; one off it can (**Off the centre line**).

| Key | Bar (mm) | Mass (g) | Modes 2 : 3 (× f₁) | Torsion 1 (× f₁) | Box depth (mm) | κ | Pair split (Hz) | Box alone T₆₀ (s) | Hammer |
|---|---|---|---|---|---|---|---|---|---|
| C4 | 224 × 30 × 2.50 | 132 | 2.754 : 5.393 | 4.39 | 270 | 0.0135 | 3.5 | 0.60 | 4.0 g, 200 N |
| C5 | 154 × 27.5 × 2.38 | 79 | 2.752 : 5.383 | 3.30 | 125 | 0.0115 | 6.0 | 0.18 | 3.4 g, 503 N |
| C6 | 106 × 25 × 2.25 | 47 | 2.748 : 5.364 | 2.49 | 56 | 0.0097 | 10.1 | 0.04 | 2.8 g, 1265 N |
| C7 | 73 × 22.5 × 2.13 | 27 | 2.741 : 5.330 | 1.90 | 23 | 0.0080 | 16.7 | 0.01 | 2.4 g, 3181 N |
| C8 | 50 × 20 × 2.00 | 16 | 2.728 | 1.47 | 8 | 0.0064 | 26.8 | 0.004 | 2.0 g, 8000 N |

(Defaults; κ, the split and the box at the default 12 mm gap; the hammer's felt as
its force at 1 mm.) Shear and rotary inertia put mode 3 of the C7 bar 1.4 % (24 cents)
below a thin bar's, and mode 2 of the C8 bar 1 % below; the modes above those are past
20 kHz. **Bar thickness** scales
the whole grading: a thicker bar must be longer to sound the same note, so it is
heavier, takes the hammer's energy more slowly and rings longer, and shear pulls
its overtones further down.

### 2. How long a bar rings by itself

Every mode has a decay rate σ (amplitude ∝ e^{−σt}, T₆₀ = 6.91/σ), the sum of:

- **Internal friction** σ = πfη, with η the steel's loss factor (**Internal friction
  η**, 2 × 10⁻⁵).
- **Heat flow** (Zener): bending squeezes one face and stretches the other, and heat
  flows across the thickness. η_TE = Δ ωτ/(1 + ω²τ²) with Δ = Eα²T/(ρc_p) ≈ 2.2 × 10⁻³
  and τ = h²/(π²D), D the thermal diffusivity. For a 2.5 mm bar τ ≈ 0.05 s, so every
  audible mode is far above the relaxation peak and loses the same σ ≈ Δ/(2τ) ≈
  0.02 s⁻¹. Torsion changes no volume and loses nothing this way.
- **The blocks**: each bar rests on two felt-topped blocks at its fundamental's nodes
  (22.4 % from each end). A dashpot of 0.4 N·s/m under each, 6 mm wide, damps any mode
  that moves there; mode 1 only rocks on them, so it barely notices (σ = 0.01 s⁻¹ at
  C4), while modes 2 and 3 lose 3–5 s⁻¹: the overtones die in a fraction of a second.
- **Radiation**: a thin strip moving through the air radiates as a line of dipoles,
  short-circuited around its edges: σ_rad = ρc k⁴ J /(32π) with J the strip's
  far-field integral (as in the vibraphone). At the fundamental it is tiny: on its
  own a C4 bar rings for over two minutes, and a C8 bar for three seconds.

### 3. The box: a stopped pipe under the bar

Under each bar is a wooden box closed at the bottom, open at the top between the two
blocks: its mouth is as wide as the bar and as long as the span between the nodes
(0.55 L), so the bar's middle, the part that moves most in mode 1, pumps air into it.
Its first mode is a quarter-wave resonance, a volume X of air moving in and out of
the mouth with

  m_a = ρ ℓ_e /(2S),    K_a = m_a (πc/2ℓ_e)²

for an effective length ℓ_e (the depth plus the open end's correction, 0.61 of the
mouth's equivalent radius) and mouth area S. It loses energy by radiating from the
mouth as a monopole, R_rad = ρck²/(4π), and in the boundary layers on its walls
(attenuation 2.95 × 10⁻⁵ √f · P/(2S) per metre, P the inner perimeter). In the
treble the box is tiny, its mouth almost as wide as a wavelength: it radiates almost
everything at once (Q ≈ 7 at C8) and helps little.

### 4. Bar and box share the air in the gap

The bar's mode 1 sweeps a volume S_b q over the mouth (q its modal coordinate) and
the air that the box does not take escapes sideways through the gap g under the bar.
That escaping air has an inertance m_g = ρ ln(1 + R_b/g)/(2πg), with R_b half the
bar's width, and its kinetic energy couples the two:

  ½ (1 + m_g S_b²) q̇² − m_g S_b q̇ Ẋ + ½ (m_a + m_g) Ẋ²

so the pair moves as two oscillators coupled through their masses, with coupling
κ = m_g S_b / √(M₁₁M₂₂). Each box is cut so that, with the gap's air on it, it sounds
its bar's pitch exactly (**Box tuning** shifts it). Tuned and coupled, the two share
one note as two modes split by about κf: 3.5 Hz at C4 and 6 Hz at C5 at the default
12 mm gap. Energy goes back and forth between bar and box at that rate while the box
gives it to the room, which is why a celesta note is louder and shorter than its bar
alone: about 2 s at C4 and 1.2–1.8 s higher up, against tens of seconds for the
bars by themselves.

- **Bar–box gap**: closer, the coupling grows; the box takes energy faster and the
  two lines split further, so the note swells and beats (try 2.5 mm). Further away
  the box takes less: quieter and longer.
- **Box tuning**: off tune, the box takes less energy and the note starts with a
  beat at the difference.
- **Resonator boxes** off: the bar alone, 15–20 dB quieter in the middle of the compass.

### 5. The hammer

The hammer is a small wooden head covered in felt, thrown at the bar by the key
(from above in Mustel's and Schiedmayer's celestas, from below in Yamaha's). Its felt
is a nonlinear spring with a little hysteresis, as a piano hammer's (Stulov):

  F = K δ^2.5 + K α d(δ^2.5)/dt

where δ is how far the felt is squashed. Down the compass the felt is thicker and the
hammers heavier: here the mass halves and the felt gets 40 times harder from C4 to
C8 (**Hammer felt**, the force at 1 mm at C4, and **Hammer mass**). The hammer and
the bar's modes are solved together every sample, the contact implicitly with an
energy-conserving discrete gradient (Chatziioannou & van Walstijn), so the hammer
stays on exactly as long as the felt pushes: 0.8 ms at C4, 0.25 ms at C8 at the
defaults. A longer contact cannot reach modes above about 1/(contact time): soft
felt gives a round, nearly pure tone; hard felt brings in the overtones' glint. Its
speed at full velocity is **Hammer speed** (2.5 m/s). Striking a ringing bar hits it
where it is, so a repeated note adds to it or partly cancels it.

**Strike point**: where along the bar the hammer lands, 30 % from the end by default.
At the centre mode 2 (2.76 × f₁) has a node and stays silent; on mode 1's node
(22.4 %) the fundamental drops out.

### 6. Dampers and pedal

Each bar has a felt damper resting on it near one end (a pad 8 % of the bar long,
centred 7 % from the end) until its key goes down. It adds σ = (6.91/T) · w̄ᵢ² to
mode i, where T is **Damper felt** (the fundamental's T₆₀, 0.15 s) and w̄ᵢ² is the
mode's mean square under the pad relative to mode 1's: a pad, not a line, so no
mode can hide on a node. The damper pedal (Space, CC64) or **Pedal held down** lifts
them all.

### 7. What you hear

The box radiates its volume acceleration Ẍ as a monopole, and each bar mode radiates
its own little dipole share. The two add, panned by the key's place across the case
(bass left).

### 8. The engine

One voice per bar. Bar mode 1 and the box are integrated together with the implicit
midpoint rule (stiffnesses pre-warped so each keeps its own frequency); the other
bending and torsion modes are exact two-pole recursions. The hammer is a mass
launched 1.5 samples above the bar, in contact through the felt law solved by Newton's
method each sample. A key's bar (frequencies, shapes, losses, box) takes some tens of
microseconds to build; the engine builds one per audio block ahead of time and keeps
them until the bar thickness changes. Up to 24 bars sound at once; beyond that the
quietest fades out over 30 ms.

## What to listen for

The demos in `examples/celesta/`:

1. **Waltz, pedal each bar**: the celesta's own compass, bass and chords under a tune
   an octave and more above.
2. **With boxes, then without**: the same phrase; without its boxes the bar can hardly
   move the air.
3. **Box close, bar and box beat**: a C5 bar at the usual 12 mm, then 2.5 mm above its
   box: the note swells and beats as energy goes back and forth.
4. **Soft felt, then a keyboard glockenspiel**: hard hammers, thicker bars and no boxes
   bring in the inharmonic overtones and a long ring.
5. **Dampers, then pedal**: short notes stop dead; with the pedal they run together.
6. **Centre, end and node strikes**: no mode 2 at the centre, every mode near the end,
   no fundamental on the node.

On the page, watch **The bar** (the modes' live amplitudes, and the box filling with
the energy it takes) and **Bar and box**, the energy in each over the last 3 s.

## Files

```
celesta/index.html, style.css          page
celesta/src/celesta-params.js          parameters and presets
celesta/src/celesta-instrument.js      the descriptor: everything but the page
celesta/src/celesta-main.js            page wiring and views
celesta/src/celesta-wasm.js, celesta/wasm/celesta.wasm   the engine and model, built from the C++
native/instruments/celesta/            the physics in C++: model and engine (plugins and WebAssembly)
test/celesta-tests.mjs                 node test/celesta-tests.mjs
tools/render-celesta.mjs               node tools/render-celesta.mjs → examples/celesta/
```

## Simplifications

- **The bars are beams.** A 30 mm wide, 224 mm long bar is a little plate-like: a wide
  bar bends with E/(1 − ν²) rather than E (about 9 % stiffer at the limit), and its
  sideways (in-plane) bending and higher plate modes are left out. The hammer strikes
  at a point, not across the width.
- **The grading is ours.** Celestas differ by maker and era; the widths and
  thicknesses follow Yamaha's figures, the lengths come out of the physics, and the
  hammers' grading is chosen so the treble hammers are short enough to reach their
  bars. Real bars are tuned by grinding, not cut from a formula.
- **The box is a stopped pipe of the bar's width**, open over the span between the
  blocks. Real celesta resonators are shaped by each maker (some describe them as
  Helmholtz resonators); their walls are taken as rigid, and the boxes neither feel
  each other nor the case.
- **No cabinet**: the celesta's upright case, its sound board and its reflections are
  left to the room.
- **The blocks** are dashpots at the nodes, not the screws and felt of a real mounting.
- **The action** is a hammer mass and a speed: no key, escapement or repetition.
- **Radiation** is a monopole for the box and a line of dipoles for the bar, with no
  directivity and no baffle.

## Prior art and references

**The original instrument.**
- J. Holland, J. Blades & A. B. Acker (2018). "Celesta." *Grove Music Online*.
  [doi:10.1093/omo/9781561592630.013.3000000242](https://doi.org/10.1093/omo/9781561592630.013.3000000242).
  Auguste Mustel's celesta (Paris, 1886), after his father Victor Mustel's
  typophone, which struck tuning forks.
- [Celesta (Mustel)](https://omeka-s.grinnell.edu/s/MusicalInstruments/item/971),
  Grinnell College Musical Instrument Collection: 49 steel bars graduated from
  about 8 to 2 inches, 1 inch wide and 0.13 inch thick, felt hammers and dampers.
- [The Structure of the Celesta](https://www.yamaha.com/en/musical_instrument_guide/celesta/mechanism),
  Yamaha Musical Instrument Guide: the bars, the boxes and the action.
- N. Terada, M. Takahasi, H. Ohmuro & Y. Semba (1992). "Celesta promptly responsive
  to high speed keying-in." European patent application EP 0 489 430 A2 (Yamaha;
  withdrawn). [Google Patents](https://patents.google.com/patent/EP0489430A2/en).
  Hammers under the bars, returned by gravity.

**The physics.**
- S. P. Timoshenko (1921). "On the correction for shear of the differential equation
  for transverse vibrations of prismatic bars." *Phil. Mag.* 41(245), 744–746.
  [doi:10.1080/14786442108636264](https://doi.org/10.1080/14786442108636264).
- R. W. Traill-Nash & A. R. Collar (1953). "The effects of shear flexibility and
  rotatory inertia on the bending vibrations of beams." *Q. J. Mech. Appl. Math.*
  6(2), 186–222. [doi:10.1093/qjmam/6.2.186](https://doi.org/10.1093/qjmam/6.2.186).
  The free–free Timoshenko frequency equation.
- G. R. Cowper (1966). "The shear coefficient in Timoshenko's beam theory."
  *J. Appl. Mech.* 33(2), 335–340.
  [doi:10.1115/1.3625046](https://doi.org/10.1115/1.3625046).
- S. M. Han, H. Benaroya & T. Wei (1999). "Dynamics of transversely vibrating beams
  using four engineering theories." *J. Sound Vib.* 225(5), 935–988.
  [doi:10.1006/jsvi.1999.2257](https://doi.org/10.1006/jsvi.1999.2257).
- C. Zener (1938). "Internal friction in solids II: general theory of thermoelastic
  internal friction." *Phys. Rev.* 53, 90–99.
  [doi:10.1103/PhysRev.53.90](https://doi.org/10.1103/PhysRev.53.90).
- W. C. Young & R. G. Budynas (2002). *Roark's Formulas for Stress and Strain*, 7th
  edn. McGraw-Hill. The torsion constant of a rectangle.
- N. H. Fletcher & T. D. Rossing (1998). "Mallet percussion instruments." In *The
  Physics of Musical Instruments*, 2nd edn, 623–648. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_19](https://doi.org/10.1007/978-0-387-21603-4_19).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World Scientific,
  Singapore. [doi:10.1142/4294](https://doi.org/10.1142/4294). Chapter 7,
  "Metallophones".
- F. Soares, J. Antunes & V. Debut (2022). "A minimal model of the bar-resonator
  vibroacoustic interaction in mallet percussion instruments." *Applied Acoustics*
  199, 109049.
  [doi:10.1016/j.apacoust.2022.109049](https://doi.org/10.1016/j.apacoust.2022.109049).
  The bar's fundamental as an oscillator coupled to its resonator.
- A. Stulov (1995). "Hysteretic model of the grand piano hammer felt." *J. Acoust.
  Soc. Am.* 97(4), 2577–2585. [doi:10.1121/1.411912](https://doi.org/10.1121/1.411912).
- V. Chatziioannou & M. van Walstijn (2015). "Energy conserving schemes for the
  simulation of musical instrument contact dynamics." *J. Sound Vib.* 339, 262–279.
  [doi:10.1016/j.jsv.2014.11.017](https://doi.org/10.1016/j.jsv.2014.11.017).

**Earlier models and syntheses.**
- A. Chaigne & V. Doutaut (1997). "Numerical simulations of xylophones. I.
  Time-domain modeling of the vibrating bars." *J. Acoust. Soc. Am.* 101(1), 539–557.
  [doi:10.1121/1.418117](https://doi.org/10.1121/1.418117). Finite-difference bars
  struck by a mallet with Hertzian contact.
- V. Doutaut, D. Matignon & A. Chaigne (1998). "Numerical simulations of xylophones.
  II. Time-domain modeling of the resonator and of the radiated sound pressure."
  *J. Acoust. Soc. Am.* 104(3), 1633–1647.
  [doi:10.1121/1.424376](https://doi.org/10.1121/1.424376).
- [Pianoteq Celeste](https://www.modartt.com/celeste) (Modartt, 2010): physically
  modelled celesta, glockenspiel, toy piano and kalimba.
- [STK ModalBar](https://ccrma.stanford.edu/software/stk/classstk_1_1ModalBar.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): modal struck bars with mallet and
  resonator presets.
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/) (Applied
  Acoustics Systems, 2020; first version 2011): coupled modelled resonators,
  including beams and tubes, excited by a mallet.
