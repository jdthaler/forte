# Clavichord

A German clavichord of C. P. E. Bach's day: five octaves from FF to f³,
two brass and iron strings to every key, and, for a change of colour, the
double-fretted layout of older instruments, where neighbouring keys share
strings. Nothing is sampled. Press a key and the brass tangent on its far
end strikes the strings and stays on them: it is the end of the speaking
length, it holds the strings up, stretched, for as long as the finger holds
the key, and the listing cloth woven in by the hitchpins damps the rest.
So the finger never lets go of the note. Press harder and it goes sharp,
lighter and it goes flat; rock the finger and it sings with the
clavichord's own vibrato, the *Bebung*. Let the key go and the tangent drops
away, the whole string rings for an instant and the listing stops it. On a
fretted pair the higher tangent takes the strings from the lower one, and
when it lets go, the lower one is still there and speaks again.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/clavichord/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61 keys, FF–f³; *Full range* opens A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the tangent meets the strings |
| `Space` | hold: keys stay down while it is held (a clavichord has no dampers to lift) |
| MIDI | notes, velocity, **aftertouch** (polyphonic or channel: the finger presses harder), mod wheel (the Bebung's depth), hold pedal (CC64), MPE (pressure presses the note's key, slide gives it its own Bebung) |

## The physics

### 1. The strings and the scale

Each key has a *course* of two strings tuned in unison (three, with the
4′ strings in the bass). The scale is Pythagorean in the treble, the
speaking length L ∝ 1/f from 26 cm at c², and folded in the bass so that FF
gets 1.26 m instead of 2 m:

  L(m) = max(4 cm, L_c² · fold(L_c² 2^((72 − m)/12)) / fold(L_c²)),  fold(ℓ) = ℓ / (1 + (ℓ / 1.3 m)^2.5)^(1/2.5)

Brass wire up to B, 0.50 mm at FF to 0.38 mm; iron from c, 0.36 mm down to
0.20 mm at f³ (below FF, with *Full range*, the brass carries on thicker,
up to 0.8 mm). Each string runs from the bridge on the soundboard, past the
tangent, to a hitchpin: the stretch beyond the tangent, the *afterlength*,
grows from 12 cm in the bass to 28 cm in the treble. Each string is tuned
for its note with the key down (below, 4), from the stiff string's

  f_n = (n / 2L) √(T/μ) · √(1 + B n²),  B = π² E I / (T L²)

which gives 19 N at FF (95 MPa in the brass), 39 N at c¹ (540 MPa in the
iron) and 18 N at f³ (590 MPa). Clavichord strings are slack beside a
harpsichord's: that is what lets a finger bend them.

*Fretting* chooses between the unfretted (*bundfrei*) instrument, a course
for every key, and the double-fretted (*gebunden*) one, where C–C♯, E♭–E,
F–F♯, G–G♯ and B♭–B share a course and D and A have their own. On a shared
course the upper key's tangent stands a semitone nearer the bridge, at
L·f_lower/f_upper in the keyboard's own tuning.

### 2. The tangent strikes and stays

The tangent is a moving end of the speaking length. With X measured from
the bridge, and z the tangent's height above the strings' rest line,

  speaking length (0 < X < L):  y = z X/L + Σ qₙ sin(nπX/L)
  afterlength (s = X − L, 0 < s < a):  y = z (1 − s/a) + Σ pₘ sin(mπs/a)

The straight lines carry the tangent's static push; the partials are
everything else. Putting y into the wave equation, each partial is driven
by the tangent's acceleration:

  q̈ₙ + 2σₙ q̇ₙ + ωₙ² qₙ = 2(−1)ⁿ z̈ / (nπ),  p̈ₘ + 2σₘ ṗₘ + ωₘ² pₘ = −2 z̈ / (mπ)

So a stroke starts every partial at once, each ∝ 1/n, and a faster stroke
starts them harder: the brass end of the speaking length does what a hammer
can only do at a point. The tangent is the key's and the finger's mass M
(*Key and finger*, 12 g), pushed up by the finger's force F and pulled down
by the strings' slopes either side of it:

  M z̈ = F − R ż + Σ_strings T (−z/L − Σ(−1)ⁿ kₙ qₙ − z/a + Σ κₘ pₘ)

with R = 1.5 N·s/m for the finger's flesh and the key's cloth, and the key
bed stopping the travel at 4.5 mm. Velocity sets the tangent's speed when
it meets the strings, 4 cm/s (pp) to 40 cm/s (ff); after that the finger
holds the key with the force *Finger pressure on the key* sets (0.8 N, the
weight of 82 g, by default), and the tangent settles where the strings'
pull balances it,

  F = Σ T z (1/L + 1/a)

about 1.5 mm up: Thwaites and Fletcher measured 1 to 2 mm.

### 3. Pressure tuning and the Bebung

Holding the strings up stretches them by Δl = z²(1/L + 1/a)/2, and their
tension rises to

  T = T₀ + (EA/l) Δl

Every partial's frequency follows T, sample by sample: pressing harder is
sharper by about ½ ΔT/T. At c¹ another 0.1 N on the key raises the note by
0.9 ¢, and 2 N by 17 ¢; in the slack bass and the short treble it is three
to four times as much. Aftertouch (polyphonic, channel or MPE pressure)
presses the key harder, up to 2.5 × the set pressure, and the key bed.

The *Bebung* is the finger rocking its pressure on a held key, F(1 + 0.6 b
sin 2πf_B t), b from the mod wheel, f_B the *Bebung rate*; it eases in over
the first quarter second. The pitch wavers with the pressure; the tangent's
mass makes the strokes of a heavy key start sharp and settle (*Key and
finger*).

### 4. The tangent's give, and tuning for it

The tangent is not a rigid nut: the key and finger ride on the strings'
springs. For a small vibration about its rest, the speaking partials'
reaction on it, the afterlengths' and its own mass and damping balance when

  D(ω) = −ω² M + iωR + Σ [T(1/L + 1/a) − (2T/L) Σₙ ω²/Dₙ − (2T/a) Σₘ ω²/Dₘ] = 0,  Dₙ = ωₙ² − ω² + 2iσₙω

A partial sounds at the root of D near its own pole: above the rigid nut's
frequency where the key's mass rules, by 8 ¢ at c¹ and up to 60 ¢ at FF,
where the tangent's own bounce on the strings (at a few tens of hertz) is
not far below the note. The tuner tunes the strings by ear, with the key
down; the model does the same, solving for the root and setting each
string's tension so that the note sounds at its pitch with the default key
and finger at the default pressure. Below FF the bounce reaches the note
itself and the tangent takes most of the fundamental: there the notes are
mostly their upper partials.

### 5. The listing, and key up

The *listing* is a cloth woven between the strings near the hitchpins. A
partial whose length is long beside the cloth's width w loses only the
share of its energy that lies in the cloth:

  σ = σ_∞ · listing · (1 − sin(2βw)/(2βw)),  σ_∞ = 400 s⁻¹, w = min(0.7a, 10 cm)

So it kills the afterlength's own pitches (c/2a: 400 to 650 Hz, all over the
compass) and barely touches the speaking length. *Listing cloth* thins it
out: then the afterlengths ring, a faint, fixed chord beside every note, as
on an instrument whose listing has worn.

When the key rises, the tangent drops at the release velocity's speed
(1.5 to 15 cm/s), the strings pulling it as fast as the finger lets the key
go. While it is still on them the speaking length is still the note; once
it is clear, the shape of the whole string, bridge to hitchpin, becomes the
open string's partials, and the listing, now on every one of them, stops it
in a few tenths of a second. That soft, brief ring of the whole string is
the clavichord's key-up.

### 6. Fretted pairs

When the upper key of a fretted pair goes down while the lower is held, its
tangent meets the strings nearer the bridge: the strings' shape is
projected onto the new speaking length and afterlength (∫ sin·sin and
∫ line·sin in closed form), and the upper note sounds; the lower tangent is
now in the afterlength, under the listing, silent. When the upper key lets
go, its tangent drops until the strings rest on the lower tangent again,
and hands them over: the lower note speaks again, softly, plucked by the
strings springing onto it. The upper of a pair always wins: C and C♯
cannot sound together.

### 7. The 4′ strings

*4′ strings in the bass* adds a third string to each course up to e, an
octave up, on its own bridge at half the speaking length and struck by the
same tangent, as on some of Hieronymus Albrecht Hass's large clavichords.

### 8. Bridge and soundboard

Each string pushes on the bridge with T y′(0) = T z/L + Σ (T kₙ + EI kₙ³) qₙ.
The bridge sits on a small, thin spruce soundboard, modelled as an
orthotropic plate 50 × 26 cm (1 kg/m², 12 times stiffer along the grain),
simply supported, with 48 modes from 220 Hz; three points along the bridge
drive it, two microphones hear its acceleration, and a residual path
carries the force above the modal band. The board takes each partial's
energy at a rate from its admittance at the key's bridge point,
σ_B = Re Y(f) b²/(2ω²). *Soundboard* off plays the bridge force directly, as
a contact pickup would.

### 9. The engine

One voice per course, from a pool of 32 (20 sound at once at High; the
quietest released one, then the oldest, fades out in 10 ms). At a course's
first stroke its strings are designed from the parameters (closed forms and
the tuning root, under a millisecond), and its partials are two-pole
resonators whose coefficients follow the tension every sample: up to 96
speaking partials below *Highest partial* (10 kHz), 8 afterlength partials
and, once the tangent has gone, 32 of the open string. The tangent is
integrated alongside them (semi-implicit Euler), each partial driven by its
second difference.

## What to listen for

`examples/clavichord/` (regenerate with `node tools/render-clavichord.mjs`):

1. **01-an-air-with-bebung-on-the-long-notes**: a short air in D minor
   written for the demo, with a quiet bass, the long notes sung with the
   finger's Bebung (each its own, as MPE's slide gives it).
2. **02-pressing-harder-bends-the-note-up**: one held G4 while aftertouch
   swells and fades: the pitch rises with the pressure and comes back.
3. **03-bebung-none-then-deeper-then-faster**: a held third with no
   Bebung, a moderate one, then a deeper, faster one.
4. **04-fretted-trill-then-unfretted**: a trill C5–C♯5 on a fretted pair,
   where the upper tangent stops the lower and the lower speaks again
   between strokes, then on an unfretted instrument, where C5 rings on
   under the trill.
5. **05-listing-on-then-thinned-out**: a phrase with the listing, then
   with it thinned to almost nothing: the afterlengths' fixed pitches ring
   along, and each release rings on.
6. **06-bass-without-then-with-4-foot-strings**: a bass line, then the
   same with the 4′ strings: brighter, fuller.

On the page, the **strings** view draws one string of the course from the
side, its heights hugely exaggerated: the tangent holding it up, the
finger's force on the key, the engine's own partials vibrating in slow
motion, the listing by the hitchpin. The **pitch and pressure** view traces
the last five seconds of the finger's force and the note's pitch: watch the
Bebung and aftertouch move one with the other. The spectrum marks the
speaking length's partials, the 4′'s and, dimly, the afterlengths'; the
**course** card lists the wire, the tensions, the tangent's height and how
much it bends the note.

## Files

```
clavichord/index.html, style.css          page
clavichord/src/clavichord-params.js       parameters and presets (and the constants the page needs)
clavichord/src/clavichord-instrument.js   the descriptor: everything a host needs to play it
clavichord/src/clavichord-main.js         page wiring and views
clavichord/src/clavichord-wasm.js         the engine and model as WebAssembly (clavichord/wasm/clavichord.wasm), for the page and the tests
native/instruments/clavichord/            the physics in C++: model (scale, wire, tuning for the tangent's give, listing, soundboard), engine, the page's and tests' hooks
test/clavichord-tests.mjs                 node test/clavichord-tests.mjs (26 tests, ~12 s)
tools/render-clavichord.mjs               node tools/render-clavichord.mjs → examples/clavichord/
```

## Simplifications

* **Dimensions are plausible, not measured.** The c² scale, the fold in the
  bass, the gauges, the brass–iron break, the afterlengths and the board are
  reasonable choices for a German instrument of the 1760s, not one
  instrument's drawings.
* **The tangent never leaves the strings while the key is down.** It is a
  bilateral constraint: Jiolat et al. (2021) let it bounce, which a very
  hard stroke would do. The finger is a force with a damper (the force
  follows the pressure within 3 ms), not a hand with its own stiffness.
* **One plane of vibration.** The strings move only up and down; their
  sideways swing, the tension modulation by the vibration itself (here a few
  thousandths of the static stretch) and the longitudinal modes are left
  out. The strings of a course share the tangent but not the bridge's motion.
* **The listing is a uniform dashpot** over its width, not a woven cloth;
  the open string after release has the same listing.
* **No sympathetic resonance** of the other courses, and no case or
  cavity: the soundboard is an equivalent rectangular plate, its loss factor
  a single number, as the harpsichord's.
* **Below FF** (with *Full range*) the instrument goes on where no
  clavichord did, and the tangent's give takes most of the fundamental.

## Quality

The Quality setting (in the top bar, for phones and older computers) keeps High as described
here. Medium sounds 14 courses at once (20) and gives each string 48 speaking partials, none above
6 kHz, 4 afterlength partials and 16 for the open string; Low 9 courses, 28 partials below 4 kHz,
2 and 8. A fading top partial is dropped once it is 10⁻⁴ (Medium) or 3·10⁻⁴ (Low) of the
loudest. A note keeps its pitch and its level; it loses some brightness at Low.

## Prior art and references

### The instrument

* Brauchli, B. (1998). *The Clavichord*. Cambridge University Press,
  Cambridge. The history, the makers (Hass's 4′ strings among them),
  fretting and the listing.
* Bach, C. P. E. (1753). *Versuch über die wahre Art das Clavier zu
  spielen*, Berlin. The Bebung, as its players were taught it.

### Physics

* Thwaites, S. & Fletcher, N. H. (1981). "Some notes on the clavichord."
  *J. Acoust. Soc. Am.* 69(5), 1476–1483.
  [PDF](https://www.phys.unsw.edu.au/music/people/publications/Thwaitesetal1981.pdf):
  the tangent's travel (about 3 mm to the strings, 1–2 mm more to deflect
  them), its admittance (mostly a mass), the losses (bridge, tangent, the
  felt beyond it) and an instrument's gauges.
* d'Alessandro, C. (2010). "On the dynamics of the clavichord: from tangent
  motion to sound." *J. Acoust. Soc. Am.* 128(4), 2173–2181.
  [doi:10.1121/1.3478783](https://doi.org/10.1121/1.3478783): the
  tangent's motion and the sound it makes.
* Jiolat, J.-T., d'Alessandro, C., Le Carrou, J.-L. & Antunes, J. (2021).
  "Toward a physical model of the clavichord." *J. Acoust. Soc. Am.*
  150(4), 2350.
  [doi:10.1121/10.0006438](https://doi.org/10.1121/10.0006438): tangent and
  key, string (Kirchhoff–Carrier), bridge and soundboard and damper as
  modal subsystems coupled by Udwadia–Kalaba, with intermittent contact,
  after a copy of a 1784 Hubert: key force sets the intonation, key
  velocity the level.
* Carrier, G. F. (1945). "On the non-linear vibration problem of the
  elastic string." *Q. Appl. Math.* 3(2), 157–165.
  [doi:10.1090/qam/12351](https://doi.org/10.1090/qam/12351): the
  stretched string's tension.
* Fletcher, N. H. & Rossing, T. D. (1998). *The Physics of Musical
  Instruments*, 2nd ed. Springer, New York. Stiff strings, plates.

### Earlier models and syntheses

* Välimäki, V., Laurson, M. & Erkut, C. (2003). "Commuted waveguide
  synthesis of the clavichord." *Computer Music Journal* 27(1), 71–82.
  [doi:10.1162/01489260360613353](https://doi.org/10.1162/01489260360613353):
  waveguide strings excited by a recorded body response, with the key-up
  sound and pitch glides (modelled and sampled).
* Forte's own [Clavier](../clavier/README.md), a tangent that clamps a
  string against an anvil, and [Harpsichord](../harpsichord/README.md),
  whose soundboard this one shares.

This model differs from them in solving the tangent and the strings
together in real time: the pressure, the Bebung, the fretted handover and
the key-up all come from the same equations, with the tuning set for the
tangent's give.
