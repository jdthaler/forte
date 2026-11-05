# Cimbalom

Courses of steel strings struck by hammers thrown from the player's hands: the concert cimbalom
that József Schunda built in Budapest from 1874, and its folk ancestor the hammered dulcimer.
Each key is one course, four strings tuned together in the cimbalom's treble (three copper-wound
in its bass), two on the dulcimer. Nothing here is recorded: the hammer, the strings, the bridge
they share and the soundboard under it are integrated sample by sample.

What makes it more than a piano without keys:

* **The hammer is free.** A cimbalom player holds a light stick loosely and throws it; it touches
  the strings for a millisecond or two and is thrown back by them. How long it stays, and so how
  bright the note is, depends on its face (cotton, leather or bare wood), its mass, how stiffly
  its stick holds the head, and where it lands.
* **The strings of a course are coupled.** They all press on the bridge at one point, and the
  bridge's motion drives each of them back. Struck together they move in step and drain into the
  bridge fast; their slight mistuning pulls them out of step, and then the note decays slower or
  beats (Weinreich, 1977). That two-stage, shimmering decay is the sound of a course of strings.
* **The dulcimer's bridge makes two notes of one string.** Its treble bridge divides each string
  2 : 3, so the two sides sound a fifth apart. Strike one side and the other rings along through
  the bridge, loudest at the partials the two share.
* **Dampers, or none.** Schunda's cimbalom added a felt damper bar that only the pedal lifts; the
  dulcimer has no dampers at all, and every string rings, with the strings of the other notes
  ringing along with the bridge.

Play it with the computer keys, a MIDI keyboard or the on-screen keys. **Space** (or CC64) is the
damper pedal: it lifts the bar. The **mod wheel** moves where the hammers land; **aftertouch**
sets how hard the tremolo's strokes are. Every key of the 88 plays: past each instrument's
compass (the modern cimbalom's AA–a‴, a large dulcimer's G2–D6) the same scale of strings
carries on.

## The physics

### 1. The strings and the scale

Every string is steel, and its speaking length comes from the note: plain wire at about
1.1 GPa (a wave speed c = 2Lf of 380 m/s, under half the wire's strength), so L = 190 m/s ÷ f,
folded under the instrument's longest string (88 cm on the cimbalom, 62 cm on the dulcimer).
Below E3 on the cimbalom (D3 on the dulcimer) the strings are wound with copper: the tension of
the lowest plain string carried on, and the mass raised to make the note,

  T = μ (2 L f)²,   B = π² E I / (T L²)

with E I the core's bending stiffness. Each string's partials are those of a stiff string,

  fₙ = n f₁ √((1 + B n²) / (1 + B))

and each loses energy to the air (viscous drag with a boundary layer that grows as √f) and to the
wire's internal friction (loss factor 2 × 10⁻⁴ for plain steel, 9 × 10⁻⁴ for a wound string, whose
winding rubs on its core).

The strings of a course are a few cents apart, spread evenly about the note by the **Unison
spread** (with a tuner's small, fixed errors on top).

### 2. The hammer

The hammer is a head on a stick. Its face is a nonlinear spring, with the losses of Hunt and
Crossley:

  F = K δᵖ (1 + α δ̇)    (δ: how far the face is pressed in)

| face | K | p | α (s/m) |
|---|---|---|---|
| cotton-wound (the cimbalom's) | 1.5 × 10¹⁰ N/m^2.5 | 2.5 | 0.35 |
| leather | 2 × 10⁹ N/m² | 2 | 0.15 |
| bare wood | 4 × 10⁸ N/m^1.5 | 1.5 | 0.02 |

Cotton follows a piano felt's exponent (Chaigne and Askenfelt), bare wood Hertz's contact of
crossed cylinders. At a stroke's forces all three are stiff beside the strings' impedance, so
the length of the contact is set mostly by the hammer's mass and the strings; the face shows in
how sharply the force rises, and so in the top of the spectrum (above about 4 kHz, 13 dB between
cotton and wood at C5). The **Hammer mass** is what the strings feel: a quarter of it in the head, the
rest in the stick, joined by the stick's flex, a spring whose relative mode is the **Stick
stiffness** (damping ratio 0.08). A stiff stick puts the whole mass behind the head; a whippy one
leaves the head alone for a short blow, and its follow-through can drive the head into the
strings again.

The stroke throws the hammer at 0.29 m/s (velocity 0) to 5 m/s (velocity 1), from just above the
strings where they are at that moment, and it is free from then on: the strings push it back.
Each sample the engine takes the strings' next position without the hammer, then solves for the
force that the compression it leaves gives (Newton's method on the contact law, bracketed),
applies it, and moves the head and stick on. The force is shared by the course's strings at the
strike point, x_h from the near bridge, and pushes each partial in proportion to its shape there,
ψₙ = √(2/μL) sin(nπ x_h/L).

How long the hammer stays is set as much by the strings as by its face. The stretch of string
between the hammer and the near bridge is a stiff spring (T/x_h for each string), and the wave
reflected from that bridge comes back within a fraction of a millisecond: a light hammer is
thrown off by it (Hall, 1986, worked out the case of a hammer light beside the string). A heavy
one stays on, pushes the string into a broad bow and sounds darker. Near the bridge, this short
segment drives the bridge hard during the contact (Peterson, Rossing and Canfield, 1994), and the
fundamental comes out weaker.

### 3. The bridge, and the strings of a course together

Every partial of every string in a course meets the bridge at one point. Each drives it with a
force βₙ qₙ, β = √(2/μL)(Tk + EIk³), and the bridge, a resistive admittance G, moves and drives
each partial back. In each partial's own terms that is the coupling of `forte/sympathetic.h`: the
bridge signal S = Σ c q̇ pushes back on every partial with −c S, where c² = 2σ_B and

  σ_B = Re Y(f) · β² / (2ω²)   (one string alone on the bridge: G T / L at low frequencies)

So two strings in step drain at twice one string's rate, four at four times, and strings out of
step barely drive the bridge at all: Weinreich's coupled piano strings. Struck together, a
course's strings start in step and decay fast; as their spread pulls them apart they stop
helping each other into the bridge, and the rest of the note decays at the strings' own slow
rate, or beats. The same coupling runs between the dulcimer's two sides of the treble bridge,
whose partials share the bridge point too.

### 4. The dulcimer's divided strings

From D4 up, the dulcimer's courses cross the treble bridge, which divides them 2 : 3. A key from
D4 to C♯5 plays the right side, whose left side sounds a pure fifth above (3 : 2); from D5 up a key
plays the left side, whose right side sounds a fifth below. The far side's partials, ν strings
of them, join the course's coupling at the bridge. Most of them are far from any struck partial
and hear only a faint push; but the struck side's 3rd partial and the far side's 2nd (on the
right) are the same note, a few hundredths of a cent apart from the strings' stiffness, and that
pair swaps energy freely: strike one side and the other rings along an octave and a fifth up.

### 5. Dampers, the pedal and sympathetic strings

A damped course's partials decay at σ + 28 s⁻¹ (T₆₀ ≈ 0.25 s) under the felt. **Dampers**:

* *Keys*: a key let go is damped unless the pedal is down, as a piano player expects;
* *Pedal*: the concert cimbalom's own way, the bar on every string until the pedal lifts it
  (pressing a key does not lift it, so without the pedal every note is short);
* *None*: the hammered dulcimer, which has none.

Every course the bar does not hold also rings along with the bridge, through
`forte/sympathetic.h`: each key's course as its in-phase mode (its lowest eight partials),
driven by the bridge signals of every sounding course but its own, with a share κ of the bridge's
motion (0.5 at full **Sympathetic strings**). This is the haze around a dulcimer's notes.

### 6. The tremolo

The cimbalom's held notes are tremolos. While a key is held and the **Tremolo** is on, the
hammers strike again at its rate (each interval within ±6 % at random), the hands alternating at
0.8 and 0.7 of the first stroke's speed, or as hard as the key is pressed once it sends
aftertouch. Each stroke lands on strings that are already moving.

### 7. The soundboard

The bridge forces drive a soundboard, an equivalent simply supported orthotropic plate (stiffness
ratio 10–12 along and across the grain) whose mean admittance is the infinite plate's,
G₀ = 1/(8√(Dρh)) (Cremer), through a bridge with its own mass: 1.2 × 0.6 m on the cimbalom
(G₀ 1.8 × 10⁻³ s/kg, bridge 30 g), 0.9 × 0.42 m on the dulcimer (5 × 10⁻³ s/kg, 20 g), loss
factor 0.05. Its first 48 modes are integrated as two-pole resonators driven at three points
along the bridges and heard by two microphones (the case's acoustic short circuit taken out below
100 Hz); above them the bridge force goes straight to the microphones, at the level the modes
reach there. The same admittance, at each partial's frequency, sets the strings' bridge losses,
so a partial near a strong board mode dies fast: the board's resonances colour every note.

## What to listen for

* **The hammer's face.** Play one note three times, cotton, leather, wood. In *Hammer contact* the
  force rounds off or jumps; the spectrum fills in at the top.
* **Two-stage decay and beats.** Hold a mid-range key and watch *Decay*: a fast fall, then a slow
  one. The cimbalom's own bridge drains its strings gently beside their own losses, so turn
  **Bridge mobility** up to make it plain. *Unisons in perfect tune* gives a single straight
  line; *Out-of-tune tavern cimbalom* beats.
* **Where the hammer lands.** Move the mod wheel: at the middle (50 %) the even partials vanish
  and the note goes hollow; near the bridge it thins.
* **One string, two notes.** On the dulcimer, play A4 and look at *Strings and hammer*: the far
  side (blue) swings at its own fifth, mostly an octave and a fifth up.
* **The cloud.** *Dulcimer drone cloud*: a few notes and the whole instrument hums along.
* **Whippy sticks.** *Whippy bamboo sticks*: the head strikes alone and comes back two or three
  times, bright and soft.
* **The tremolo.** *Cimbalom tremolo*: hold a chord.

## Files

```
cimbalom/index.html, style.css            the page
cimbalom/src/cimbalom-params.js           parameters and presets
cimbalom/src/cimbalom-instrument.js       the descriptor
cimbalom/src/cimbalom-wasm.js             the engine and model, as WebAssembly
cimbalom/src/cimbalom-main.js             the views
cimbalom/src/cimbalom-tour.js             the guided tour
native/instruments/cimbalom/              the physics in C++: model, engine, web exports
test/cimbalom-tests.mjs                   the tests
tools/render-cimbalom.mjs                 the demos
```

## Simplifications

* The strings move in one plane, vertical to the soundboard, and their tension is fixed: no
  second polarisation and no tension modulation.
* The bridge is a resistance (the real part of the board's admittance at each partial); its
  reactance, which pulls a course's strings' frequencies together as well (Weinreich), is left
  out. Partials far apart in frequency still feel each other's bridge signal, which is right only
  on average.
* The concert cimbalom's strings are divided by its bridges too (Pap, 2000), but how is not
  modelled here: its courses are single lengths, muted beyond their bridges. The dulcimer's bass
  courses are too.
* The sympathetic strings are each course's struck side only, as one in-phase string.
* The hammer meets the course as one string: the mean of the strings' positions at the strike
  point, the force shared equally.
* The soundboard is a rectangle with simply supported edges, not a braced trapezoid in a case.
* The scale (lengths, diameters, where the bass turns to wound strings) is a plausible one, not a
  measured instrument's.

## Quality

* **High** plays everything: 32 courses at once, 48 partials a string (up to 14 kHz), 32 on the
  dulcimer's far sides, eight partials for each sympathetic course.
* **Medium**: 16 courses, 24 partials a string (7 kHz), 16 on the far sides, four for each
  sympathetic course.
* **Low**: 10 courses, 12 partials (4.5 kHz), six on the far sides, at most two strings a course
  (the cimbalom's beats are thinner) and no sympathetic strings.

## Prior art and references

### The instrument

* Schunda, V. J. (1906). *A czimbalom: Története*. Budapest: Buschmann. The maker's own history
  of the cimbalom; Schunda showed his concert cimbalom at the 1873 Vienna World's Fair and built
  it in Pest from 1874, with heavy dampers, a longer scale and a metal brace.
* Leach, J. (1972). "The Cimbalom." *Music & Letters* 53(2), 134–142.
  [doi:10.1093/ml/LIII.2.134](https://doi.org/10.1093/ml/LIII.2.134).
* Gifford, P. M. (2001). *The Hammered Dulcimer: A History*. Scarecrow Press, Lanham.
* Pap, J. (2000). "The Acoustical Characteristics of the Concert Cimbalom." *American Lutherie*
  61. [Guild of American Luthiers](https://luth.org/2000_0189500-pap-cymb/): the strings divided
  by the bridges and raised for playing, and what that does to the damping and the decay,
  measured at the Hungarian Academy of Sciences.

### Physics

* Peterson, D. R., Rossing, T. D. & Canfield, G. H. (1994). "Acoustics of the hammered dulcimer,
  its history, and recent developments." *J. Acoust. Soc. Am.* 95(5), 3002.
  [doi:10.1121/1.408844](https://doi.org/10.1121/1.408844): no dampers, so builders shorten the
  decay; the short string segment between hammer and bridge drives the bridge during contact;
  hammer hardness and strike position shape the attack.
* Peterson, D. (2006). "The acoustics of the hammered dulcimer and similar instruments."
  *J. Acoust. Soc. Am.* 120(5), 3119.
  [doi:10.1121/1.4787637](https://doi.org/10.1121/1.4787637): 23 to 30 courses of two to four
  strings; the treble bridge's fifth.
* Weinreich, G. (1977). "Coupled piano strings." *J. Acoust. Soc. Am.* 62(6), 1474–1484.
  [doi:10.1121/1.381677](https://doi.org/10.1121/1.381677): unison strings coupled at the bridge,
  double decay and aftersound.
* Hall, D. E. (1986). "Piano string excitation in the case of small hammer mass." *J. Acoust.
  Soc. Am.* 79(1), 141–147. [doi:10.1121/1.393637](https://doi.org/10.1121/1.393637): a light
  hammer thrown off by the wave reflected from the near end.
* Chaigne, A. & Askenfelt, A. (1994). "Numerical simulations of piano strings. I. A physical
  model for a struck string using finite difference methods." *J. Acoust. Soc. Am.* 95(2),
  1112–1118. [doi:10.1121/1.408459](https://doi.org/10.1121/1.408459): the felt hammer's
  nonlinear spring and the struck stiff string.
* Hunt, K. H. & Crossley, F. R. E. (1975). "Coefficient of restitution interpreted as damping in
  vibroimpact." *J. Appl. Mech.* 42(2), 440–445.
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596): the contact's losses.
* Cremer, L., Heckl, M. & Petersson, B. A. T. (2005). *Structure-Borne Sound*, 3rd ed. Springer,
  Berlin. The infinite plate's point admittance.
* Fletcher, N. H. & Rossing, T. D. (1998). *The Physics of Musical Instruments*, 2nd ed.
  Springer, New York. Stiff strings, bridges and soundboards.

### Earlier models and syntheses

* Modartt (2009). Cimbalom, a free add-on for Pianoteq.
  [Rekkerd.org](https://rekkerd.org/modartt-releases-pianoteq-cimbalom-add-on/): a physically
  modelled copy of a 2007 cimbalom by Balázs Kovács, whose keys, as on the instrument, do not lift
  the dampers.
