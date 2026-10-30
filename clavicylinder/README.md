# Clavicylinder

Ernst Chladni's clavicylinder (finished January 1800): a keyboard with a
straight iron bar for every key, free at both ends, and behind the keys a
glass cylinder that a treadle keeps turning. Pressing a key lifts its bar
against the wet glass; strips of cloth tied over the bar's rubbed point stick
to the glass and slip, and keep the bar singing for as long as the key is
down. Chladni toured Europe with it, and the Paris Institut heard it in 1808.
Here every bar is an Euler–Bernoulli beam with its real modes, cut to its note
from Chladni's dimensions, and the cloth is a pad on the glass whose stick and
slip are solved every sample. You can hear what a sample cannot give you: a
note that waits for enough pressure and then speaks, that swells in under a
gentle key and speaks at once under a firm one, and fades away as the
pressure is let off; the high bars falling silent when the cloth is soaked; an
overtone taking over when the cords slip off the nodes.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/clavicylinder/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | press a key (its bar sings while the key is held); 54 keys, C2–F6, Chladni's compass (all 88, A0–C8, with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | key pressure |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity (how firmly the key goes down); **aftertouch presses harder**; **mod wheel = treadle speed** (rest = 1 rev/s, full = 2 rev/s); sustain pedal = hold |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch |

## What is Chladni's and what is reconstruction

Chladni kept the inside of the clavicylinder secret for twenty years; the
Institut's commissioners reported on it in 1808 without being shown it. He
described it at last, with the instruments that grew from it, in his
*Beyträge zur praktischen Akustik* (1821). From there come the bars and
their sizes, the posts and bent ends and where they sit, the cords on the
nodes, the cloth strips and how many, the cylinder's size and the sponge,
the treadle and its flywheel, the compass, how he tuned the bars, and the
faults and remedies the presets play. What he did not give in numbers is
reconstruction, and so marked below: the friction of wet cloth on glass, the
cloth's stiffness and mass, how hard each key presses, how long the bent
ends are, and how the bars' sound reaches the soundboard.

## The physics

**The bars.** "Iron bars, ⅜ of a Rhenish inch wide" (§13, about 9.8 mm),
"about a line thick, or a little more" (§61, here 2.3 mm). A free–free bar's
modes solve cos βL cosh βL = 1: βL = 4.730, 7.853, 10.996 …, frequencies

  fₙ = (βₙL)² / (2π L²) · h √(E / 12ρ),  ratios 1 : 2.756 : 5.404 : 8.933 …

(wrought iron, E = 200 GPa, ρ = 7700 kg/m³). Each key's length is solved so
that mode 1 is its note: middle C is 21 cm long, C2 43 cm, F6 9.5 cm. A bar
is tied down with thread on cork at the two nodes of mode 1, 22.4 % of its
length from each end, where mode 1 does not move, so the cords barely damp
it. Its loss is the iron's, a fixed fraction of each cycle (σₙ = π fₙ η, η
from the *Ring after release* time at middle C), plus the cords as dashpots
where they hold the bar (reconstruction: 5 N·s/m each), which is nothing for
mode 1 on the nodes and a good deal for the others. *Bar thickness* changes
every bar: a thicker bar is longer and heavier for the same note.

**The rubbed point.** Chladni found that a bar must be rubbed in the
direction in which it swings round its nearest node. Below E4 the cloth is
tied over a short iron post, "about an inch long", riveted upright ⅜ of the
bar's length from the back end (§64–65); the post's tip moves with the bar's
height there and swings with its slope. From E4 up the bar's back end is bent
up toward the glass and rubbed directly (his border lay between B♭3 and E4,
§66; the bent end is 15 % of the length here, reconstruction). The rubbed
point of mode n moves along (−a/L · φₙ′(x), φₙ(x)) per unit of the mode, a
the post's or bent end's height; the glass rubs it along mode 1's motion, so
the friction feeds mode 1 most. Past its own cantilever resonance the iron
lever no longer follows the bar's slope, which keeps the friction from
driving the highest modes through it.

**The cloth on the glass.** Strips of broadcloth, three on a post and two
on a bent end (§65), sit between the glass and the rubbed point: a pad of
mass m on a shear spring k and damper (reconstruction, of the order of wet
felt: 0.04 g/cm² a layer, G ≈ 0.2 MPa, a patch as wide as the bar and 5 mm
long at middle C, smaller in the treble). The glass, wetted with a sponge,
grips the pad with friction that falls as the pad slides faster,

  μ(u) = μd + Δμ / (1 + (u/v₀)²) + βu,

stuck while the force that holds the pad on the glass stays within μs·N and
slipping otherwise, at the speed that solves the friction law against the
pad and the bar's response (safeguarded Newton, every sample). *Cloth
wetness* sets the grab: nearly dry cloth scratches, damp cloth grabs and lets
go, soaked cloth floats on its water, and the small, thin strips of the
treble soak through first, so their grab goes and "the high notes do not
speak at all". *Grip* is Chladni's remedies (§74): "a little soap, put on
with the finger" for a tone that comes out "too cutting", "a little finely
ground pumice" when the friction will not draw a tone "especially in the
treble".

**Speaking.** A bar starts when the friction's fall at the glass's speed,
μ′(V), feeds mode 1 a negative damping N|μ′|c₁²/(2m) larger than its loss σ₁.
That threshold force (the page shows it, and the tests check that the engine
starts where it says) is a few grams on the glass. Each key is regulated, as
a voicer would, so that every key speaks alike: its force goes with its bar's
rubbed mass and its note to the 0.7 (found by playing every key). *Key
pressure* sets the force at middle C; velocity scales it 0.5–1.5× (how firmly
the key goes down) and aftertouch up to 2× more. A key struck down knocks
the bar against the glass (a short pulse of normal force, softened by more
cloth); its friction gives the note its first push, so a firm key speaks at
once and a gentle one swells in. Once a bar sings, the cloth sticks to the
glass once a cycle and the rubbed point keeps pace with the glass while it
does: pressing harder then adds only a little loudness and some edge, and a
faster cylinder carries it further and is louder.

**Tuning.** Chladni tuned each bar by its length, then by filing its
thickness, and gave it the last accuracy once it was fixed in place (§36).
Here each free bar is cut a little sharp for the cloth riding on it, and the
bars on posts filed flat again for the cloth's spring holding them to the
glass (5 cents at middle C, up to 13 at C2; found by playing every key), so
that every bar from C2 to F6 sounds within 4 cents of its note at the
defaults. Badly fastened bars had "the joining in of a higher tone, usually
the fifth of the higher octave", "the most unbearable fault" (§49), and a
tone that changed with stronger or weaker pressure on the key. *Cords off
the nodes* moves the cords: off the nodes they damp the note; at 9 %
outward they sit on mode 2's nodes, which then rings free while mode 1 is
damped, until mode 2 takes over.

**The cylinder.** Glass, "a little over 2½ Rhenish inches" across (§21; 7 cm
in his 1809 notice), turned by a treadle and a crank with a flywheel of
"a little over 10 inches" cast round with lead and an off-centre weight that
brings the crank back up (§23–24, §73). The foot pushes once a turn (*Foot's
push*), making up within about 0.6 s the speed it has lost; every pressed bar
drags on the glass. A light flywheel (*Flywheel lead*) lets a big chord slow
the cylinder until the foot catches up.

**The sound.** The bar's modes reach the key and the soundboard through the
cords: the share of each mode's swing the cork passes on, and the bar's twist
over a short lever (reconstruction). A bent-end bar swings less than a bar on
a post for the same glass, so it is coupled to the bridge more strongly, as
Chladni balanced them by where he set the border (reconstruction). Then the
thin fir soundboard (*Soundboard*, a short body response), panned across the
compass, and the room.

## What to listen for

The demos in `examples/clavicylinder/`:

1. **Chorale in F.** Four voices held and moved together, the kind of piece
   the Institut found "takes on life and colour" on the clavicylinder.
2. **Pressure swell and smorzando.** One held bar while the key pressure
   climbs from below the threshold and back: silence (the knock rings
   away), the note swelling in as the threshold passes, little more as the
   pressure goes on rising, and the note fading away as it is let off.
3. **Gentle keys swell, firm keys speak.** The same arpeggio pressed
   gently, then firmly.
4. **Trills and runs.** "Rapid successions of sounds, the trill": the treble
   bars speak within a few hundredths of a second.
5. **Cords on the nodes, then off.** The same middle C with the cords moved
   onto mode 2's nodes: an octave and a tritone up takes over.
6. **Damp cloth, then soaked.** A rising arpeggio: soaked, the top notes do
   not speak at all.
7. **The compass, C2 to F6.**

On the page, the *Bar* view draws the focused bar from the side under the
glass, bending in slow motion, with the cloth green while it sticks; *Under
the cloth* shows the slip speed (flat on zero while it sticks, once a
cycle); the spectrum marks the bar's modes; the table lists them, and the
info card gives the bar's size, where it is rubbed, and the force it needs to
speak against the force on it now.

## Files

```
clavicylinder/index.html, style.css          page
clavicylinder/src/clavicylinder-instrument.js    the descriptor: parameters, keys, pedal, wheel, engine
clavicylinder/src/clavicylinder-params.js        parameters and presets
clavicylinder/src/clavicylinder-main.js          page wiring and views
clavicylinder/src/clavicylinder-wasm.js          the C++ engine and model as WebAssembly (clavicylinder/wasm/clavicylinder.wasm)
native/instruments/clavicylinder/            the physics in C++: bars, rubbed point, cloth and friction
                                             (clavicylinder-model), the engine, generated tables, reference
test/clavicylinder-tests.mjs                 node test/clavicylinder-tests.mjs  (26 tests, on the WebAssembly)
tools/render-clavicylinder.mjs               node tools/render-clavicylinder.mjs → examples/clavicylinder/
```

The same C++ runs as WebAssembly on the page and as plugins (CLAP, VST3, AU
and the Forte app), where CC64 is Hold, the mod wheel turns the treadle and
aftertouch presses harder. Ten held bars take about 5 % of a core.

## Simplifications

* **The friction and the cloth are reconstruction.** Wet broadcloth on glass
  is not measured; the friction curve's shape is standard and its numbers,
  with the cloth's, were chosen so that every key speaks with a few grams on
  the glass and none squeals at the defaults.
* **The swell is narrower than Chladni's.** The Institut heard the tone
  graded "at will by the most insensible nuances" from medium down to
  smorzando, and less so from medium to loudest. In the model a held note's
  loudness grades over only about a doubling of the force above the
  threshold; below it a note fades away rather than holding softly, and above
  it the cloth sticks once a cycle and loudness follows the glass's speed more
  than the pressure (which Chladni said mattered far less than on the
  armonica).
* **The regulation, the filing and the balance of posts and bent ends** were
  found by playing every key, as a builder would have; Chladni gave no
  numbers for them.
* **Straight bars.** Chladni bent the bass bars into spirals at their ends
  to save room, and bent the treble bars convergently; here every bar is a
  straight beam, its bent end only a lever. His whalebone struts against the
  "joining in" are not modelled; the cords do that.
* **Point contact, rubbed along one line.** The cloth touches the glass at
  one point and the friction acts only along mode 1's motion at it; twisting
  and the bar's sideways modes are left out.
* **The soundboard** is a short shared body response, not each bar's
  coupling through its key to a board with its own modes.

## Quality

The Quality setting (in the top bar, for phones and older computers) keeps
High as described here. Medium plays the four lowest modes of each bar and
Low the two lowest (the fourth already sits 13 times above the note and the
cloth hardly drives it), with the same friction solve. A bar whose key is
held always sounds; of the bars ringing on after their keys let go, Medium
keeps 24 and Low 12, and they stop a little sooner as they fade.

## Prior art and references

### The instrument and its history

* Chladni, E. F. F. (1802). *Die Akustik*. Leipzig: Breitkopf & Härtel.
  The clavicylinder, "finished in January 1800", with its "quick speech".
* Chladni, E. F. F. (1809). *Traité d'acoustique*. Paris: Courcier. Prints
  the report of the Institut's commissioners (Prony, reporter; Lacépède and
  Haüy for the physical and mathematical sciences; Grétry, Gossec and Méhul
  for the fine arts), December 1808, pp. 358–361: prompt speech, the trill,
  a tone graded by the pressure on the key "to an eminent degree from the
  medium of intensity down to smorzando", "not very extensive" from medium
  to the loudest.
* "Account of a New Musical Instrument, called a Clavo-cylinder, invented by
  M. Chladni" (1809), an English notice in *Discoveries and Improvements in
  Arts, Manufactures, &c.*, p. 381 (JSTOR Early Journal Content): a glass
  cylinder of seven centimetres turned by a pedal and loaded wheel; four
  octaves and a half; the Paris Conservatoire's report likening it to the
  flute and clarinet in the treble and the bassoon in the bass.
* Chladni, E. F. F. (1821). *Beyträge zur praktischen Akustik und zur Lehre
  vom Instrumentenbau, enthaltend die Theorie und Anleitung zum Bau des
  Clavicylinders und damit verwandter Instrumente*. Leipzig: Breitkopf &
  Härtel. The source of the model: §13 (the bars' width), §21 (the cylinder),
  §23–24 and §73 (the flywheel, crank and treadle), §36 (tuning), §49 (the faults of a
  bar badly fastened or rubbed), §61 (the bars' thickness), §64–66 (posts,
  bent ends and the border between them), §74 (the care of the instrument:
  soap, pumice).
* Heise, B. (2007). "Chladni's clavicylinder and some imitations." *Eur.
  Phys. J. Special Topics* 145, 3–14.
  [doi:10.1140/epjst/e2007-00143-6](https://doi.org/10.1140/epjst/e2007-00143-6).
* Stöckmann, H.-J. (2007). "Chladni meets Napoleon." *Eur. Phys. J. Special
  Topics* 145, 15–23.
  [doi:10.1140/epjst/e2007-00144-5](https://doi.org/10.1140/epjst/e2007-00144-5).

### The physics

* Rayleigh, Lord (1894). *The Theory of Sound*, 2nd ed., vol. 1. London:
  Macmillan. Lateral vibrations of bars, free–free modes and their nodes
  (ch. VIII).
* Armstrong-Hélouvry, B., Dupont, P. & Canudas de Wit, C. (1994). "A survey of
  models, analysis tools and compensation methods for the control of machines
  with friction." *Automatica* 30, 1083–1138 (the Stribeck curve among them).
  [doi:10.1016/0005-1098(94)90209-7](https://doi.org/10.1016/0005-1098(94)90209-7).
* Akay, A. (2002). "Acoustics of friction." *J. Acoust. Soc. Am.* 111,
  1525–1548. [doi:10.1121/1.1456514](https://doi.org/10.1121/1.1456514).

### Earlier models

* Essl, G. & Cook, P. R. (2000). "Measurements and efficient simulations of
  bowed bars." *J. Acoust. Soc. Am.* 108, 379–388.
  [doi:10.1121/1.429471](https://doi.org/10.1121/1.429471). Banded
  waveguides for bowed bars (in the Synthesis ToolKit as `BandedWG`); a bow on
  a bar, not cloth on a turning cylinder, and not Chladni's instrument. We
  found no earlier physical model of the clavicylinder.

Forte's own [Glass Armonica](../glass/README.md) and
[Viola Organista](../bowed/README.md) solve stick–slip friction the same way;
the clavicylinder joins them as the friction instrument where the glass turns
and the bar sings.
