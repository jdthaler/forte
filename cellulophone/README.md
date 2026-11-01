# Cellulophone

Pierre Toulon's Cellulophone, the photoelectric organ first shown in Paris
in 1927 and developed with Pleyel into the 1930s: a keyboard instrument that
made its sound from light. Lamps shone through discs of narrow slots turning
on one motor, one disc an octave and one ring of slots a semitone, and every
slot that passed a window let a flash of light through to a photocell. In
each window a **screen** drawn with one period of a wave shaped the flashes,
so the cell's current, amplified and sent to a loudspeaker, had the screen's
timbre: a flute, a clarinet, a hunting horn. A key tilted a little mirror
into its beam, and how deep and how far back the key went moved two more
screens into the light. Here the disc, the windows, the screens, the
mirrors, the cells, the lamps and the amplifier are each modelled from what
they do to the light, and you can hear what made the instrument what it
was: notes a few cents out of tune because a ring can only have a whole
number of slots, the slot's width dulling the drawing, a 100 Hz hum from
lamps on the mains, the sluggish selenium cell the patent ruled out, and a
different timbre on every octave's disc.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/cellulophone/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8); a note sounds while its key is held |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | hold the keys that are down (their mirrors stay in the beam) |
| MIDI | notes and velocity (how deep the key goes, as far as the key touch lets it); aftertouch presses a key deeper; **mod wheel pushes the keys back** (the timbre screen); **pitch bend turns the motor** (every disc, ±2 semitones, as fast as their inertia lets it); sustain pedal = hold |
| MPE | every disc turns with one motor, so no note bends alone; **slide pushes one key back**, and a note's pressure presses its own key |

## The discs and their tuning

A disc turning Ω times a second with N equidistant slots on a ring
interrupts a beam N·Ω times a second. Toulon put the twelve semitones of an
octave on one disc, twelve concentric rings, and gave each octave its own
disc, all geared to one motor so that each turns exactly twice as fast as
the one below (the patent's second disc "at twice the speed"). The lowest
note had 54 slots, and the others need

  N_k = 54 · 2^(k/12)

for semitone k: 57.2, 60.6, 64.2 … But a ring has a whole number of slots,
so each is rounded: 54, 57, 61, 64, 68, 72, 76, 81, 86, 91, 96 and 102 from
C to B. The motor is set so that A sounds its pitch exactly; the rest are
off by the rounding, the same in every octave:

| | C | C♯ | D | E♭ | E | F | F♯ | G | A♭ | A | B♭ | B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| slots | 54 | 57 | 61 | 64 | 68 | 72 | 76 | 81 | 86 | 91 | 96 | 102 |
| cents | −3.5 | −9.9 | +7.5 | −9.4 | −4.4 | −5.4 | −11.8 | −1.5 | +2.2 | 0 | −7.4 | −2.4 |

Tom Rhea, who described the instrument in 1977, noted that this made it
"permanently out of tune", with errors "greater than the normally acceptable
0.1 %". *Disc* offers a disc four or sixteen times as fine, whose rings round
closer (within 3.5 ¢ and 1 ¢). The keyboard's tuning (A = 415 Hz, a
temperament) cuts the rings for it: the pitch moves every note together, and
a temperament moves each ring to the nearest whole number of slots.

The motor's speed is common to every note: *Motor hunting* swings it about
its mean about once a second, and pitch bend turns it, both through the
discs' inertia (a quarter of a second). Each ring's first slot sits at its
own place on its disc, fixed when the disc was cut, and *Slot-cutting error*
gives every slot its own small error in width and place, the same each turn.
Errors that come round once a turn are sidebands at the disc's turning rate:
a faint fringe on every line, 0.6 a second apart on the lowest disc and 40
on the highest.

## The window and its screens

In front of each ring sits a window one slot pitch wide, so that one slot
leaves it as the next comes in, holding a **screen**: a transparent plate
whose clearness across the window is one period of the wave, T(x), 0 ≤ T ≤ 1.
As a slot crosses the window the light through it follows the drawing. The
slot is not a line but an opening of width a (a fraction of the slot pitch),
and it lets through the screen over its whole width at once:

  L(x) = ∫ T over the slot = a · (T ⊛ box_a)(x)

so harmonic n of the screen reaches the cell multiplied by

  a · sinc(n a) = sin(π n a) / (π n)

Narrow slots keep the drawing's harmonics but let little light through;
wide ones are loud and dull, and a harmonic vanishes where n·a is a whole
number. Toulon's slots were "narrow"; the default is 6 % of the pitch.

The screens are the patent's "harmonic screens", each a recipe of harmonic
amplitudes drawn at full contrast, opaque where the wave is lowest and clear
where it is highest: *Sine*, *Flûte*, *Clarinette* (the odd harmonics, which
the patent's sixth claim names), *Hautbois*, *Trompe de chasse*, *Violon*
(every harmonic, 1/n) and *Voix humaine* (two formants). A drawing's peaks
depend on the harmonics' phases, which the ear barely hears, so each is
drawn with Schroeder's phases (1970), which spread the harmonics' peaks
apart; and each window is as much taller as its drawing's wave is weaker
than the sine's, so the stops sound alike in loudness, as a voicer would set
them. With *A screen for each octave* every disc carries its own (violin in
the bass, then horn, voix humaine, oboe, clarinet, flute and sine at the
top): the design allows, as Rhea noted, "eight different timbres" on one
keyboard.

## The keys

A key tilts a small mirror into its ring's beam and sends it to the
photocell. The beam reaching the mirror is a round spot, and the mirror's
edge sweeps across it: with the edge a fraction m of the diameter across,
the light let through is a circular segment,

  (θ − sin θ) / 2π,  θ = 2 arccos(1 − 2m)

over the *Mirror travel* (a quick key, a little less). Its steady light
arrives with it, so the coupling capacitor after the cell hears every key's
step: a soft thump when quick, nothing when slow.

The patent's touch (its figures 18 and 19) moves two more screens. Pressing a
key down moves a screen whose clearness grows evenly with depth into its
beam: the light is 1 − t + t·v of the full beam for velocity v and *Key
touch* t, and aftertouch presses the key the rest of the way. Pushing a key
**back** slides a second screen into its window, a slit centred on the
drawing's clearest point,

  s(x) = ((1 + cos 2π(x − x*)) / 2)⁸

and stacked screens multiply: the window passes T·(1 − p(1 − s)) for push p.
The light comes in shorter flashes, brighter and buzzier; less of it gets
through on average, but each flash still swings from dark to clear, so the
note keeps its loudness. The mod wheel pushes every key; MPE's slide pushes
one.

Two more of Toulon's ideas: the *Tremolo screen*, a slotted screen turning
in the beam for "the tremolo of the hunting horn", 8 or 10 times a second;
and the *Damping arcs* of his fourth claim, slots whose length shortens along
an arc so that a note's light narrows away "like a piano". Light through a
slot is in proportion to its length, so the note falls in a straight line,
not a ring's exponential.

## Light, cell, amplifier, loudspeaker

Four tungsten lamps light the discs. On alternating current a filament cools
a little between the peaks of the current, and its light ripples at twice
the mains frequency, about 5 % at 50 Hz (its heat capacity smooths the
ripple as 1/f, so a little less at 60 Hz). The ripple multiplies all the
light: every held note brings a 100 Hz line, the ripple times its steady
light, and its own sidebands 100 Hz either side.

The patent asks for a cell "without inertia" and names potassium, a vacuum
photocell whose current is in proportion to the light and follows it at
once; it rules selenium out. One cell an octave gathers that octave's
beams. A selenium cell answers slowly, here 60 % of its response within a
millisecond and the rest over 30 ms, and as the 0.6 power of the light:
notes swell in late, and two notes on one cell make their sum and
difference tones.

The cell's current goes through a coupling capacitor (a 5 Hz corner: the
steady light goes, its steps leave thumps) to a valve amplifier, whose
*drive* rounds the peaks (y = tanh(g x)/g), and a loudspeaker: a moving-coil
cone in a baffle (Rice and Kellogg, 1925; its resonance near 90 Hz, its
paper breaking up near 4.5 kHz) or a horn (cut off near 180 Hz, its driver's
diaphragm ringing near 2.2 kHz). One loudspeaker: the sound is mono.

## What to listen for

- **The tuning**: a D major chord on the 54-slot disc, its F♯ 12 ¢ flat,
  beats; on the fine disc it is still.
- **The screens**: one held note as the stops change the drawing; the
  clarinet's spectrum has no even harmonics.
- **The slot**: wider slots, louder and duller; narrow ones, bright and
  faint.
- **Push**: the mod wheel narrows the light into flashes.
- **The mains**: a 100 Hz hum that comes and goes with the notes.
- **Selenium**: late, muffled notes, and a growl under chords.
- **The damping arcs**: notes that fade in a straight line.

## Files

```
cellulophone/index.html, style.css                  page
cellulophone/src/cellulophone-params.js             parameters and presets
cellulophone/src/cellulophone-instrument.js         the descriptor: everything but the page
cellulophone/src/cellulophone-main.js               page wiring and views
cellulophone/src/cellulophone-tour.js               the guided tour
cellulophone/src/cellulophone-wasm.js, cellulophone/wasm/cellulophone.wasm   the engine and model, built from the C++
native/instruments/cellulophone/                    the physics in C++: model and engine (plugins and WebAssembly)
test/cellulophone-tests.mjs                         node test/cellulophone-tests.mjs
tools/render-cellulophone.mjs                       node tools/render-cellulophone.mjs → examples/cellulophone/
```

## Simplifications

* **The screens' drawings are ours.** The patent describes harmonic screens
  and instrument tones but gives no drawings, and Toulon's own are lost; the
  recipes here are plausible harmonic spectra for the instruments named.
  The window heights that match the stops' loudness are a voicer's choice,
  not the patent's.
* **The slit and the depth screen.** The patent's push screen has a law that
  "depends on displacement"; the narrowing slit is one such law. The depth
  screen is the linear one the patent describes.
* **The damping arcs** start as the key goes down. The patent's arcs are on a
  turning disc and does not say how a note's arc is brought to its start.
* **The optics are ideal.** The windows are imaged sharply, the slots have
  straight edges, the mirrors are flat and every beam is alike. The real
  instrument's lenses blurred the slot (more dulling) and its lamps
  differed.
* **Cells and amplifier.** The potassium cell is linear with no noise; the
  selenium cell is a power law and two time constants, a sketch of its
  slow, sublinear response rather than a measured cell. The amplifier is one
  soft limit and the loudspeakers two or three filters.
* **The keyboard.** Accounts differ (one manual of eight octaves, or two
  manuals and pedals); here it is one keyboard of 88 keys, A0–C8, on nine
  discs.

## Quality

At Medium at most 24 keys sound at once and at Low 12 (High: every key);
past that the oldest key lets go, released ones first. Low also cuts every
slot true (no cutting error), which saves looking up each slot's error.

## Prior art and references

### The instrument

* Toulon, P. M. G. [US 1,948,996](https://patents.google.com/patent/US1948996A/en),
  "Music instrument working through a keyboard and photo-electric cell"
  (filed 1928, granted 1934): the slotted discs and their rings, the windows
  and screens, the key mirrors, the depth and push screens (figures 18–19),
  the tremolo screen, the damping arcs and the cell "without inertia".
* Rhea, T. (1977). "Photoelectric instruments, Part III: The Cellulophone."
  *Electronic Perspectives*, *Contemporary Keyboard*, September 1977,
  [reprinted by the EMEAPP](https://emeapp.org/2026/08/17/electronic-perspectives-photoelectric-instruments-part-iii-the-cellulophone/):
  four tungsten lamps, one disc and one cell an octave, "permanently out of
  tune", eight timbres, and the touch control described in *L'Onde
  Électrique* (December 1935).
* Crab, S. *120 Years of Electronic Music*,
  ["optical synthesis"](https://120years.net/tag/optical-synthesis/): the
  Cellulophone of Toulon and Krugg Bass (1927), its 54 slots for the lowest
  note, the Prix Jean Barès (1933) and Pleyel.

### The physics

* Schroeder, M. R. (1970). "Synthesis of low-peak-factor signals and binary
  sequences with low autocorrelation." *IEEE Transactions on Information
  Theory* 16(1), 85–89. [doi:10.1109/TIT.1970.1054411](https://doi.org/10.1109/TIT.1970.1054411).
  The phases the screens are drawn with.
* Rice, C. W., and Kellogg, E. W. (1925). ["Notes on the development of a new
  type of hornless loud speaker."](https://scilit.com/publications/839599c196fd066ceb67158d62cea87e)
  *Transactions of the AIEE* 44. The moving-coil cone.

### Earlier models and syntheses

We did not find a published model of the Cellulophone. Optical tone wheels
went on in the Welte Lichttonorgel, the Photona and the Superpiano of the
1930s (listed with it on *120 Years of Electronic Music*) and, much later,
in Mattel's Optigan (1971); this site's [Tonewheel Organ](../organ/) and
[Telharmonium](../telharmonium/) turn wheels magnetically instead.
