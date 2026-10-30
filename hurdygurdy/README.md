# Hurdy-Gurdy

The French vielle à roue of the 18th century, in G/C. A crank turns a
rosined wooden wheel, 15 cm across, that bows every string at once: two
melody strings, the chanterelles, which the keys stop with wooden tangents,
and the drones beside them (the gros bourdon on G2, the petit bourdon on C3,
the mouche on G3). The fourth drone, the trompette, does not run over a
fixed bridge: it rests on the chien, a little loose bridge whose foot stands
on the soundboard, held down only by the trompette's own pull, which the
tirant, a peg and a cord, sets. Turn the crank harder and the wheel's drag on
the trompette lifts the chien off the board once a period, and it falls back
and hits it: the buzz. Players make it rhythmic with the coup de poignet, a
jerk of the wrist on the crank at chosen points of each turn.

Here every string is a bowed waveguide string, the wheel's friction solved
implicitly at its contact as for the [Viola Organista](../bowed/README.md),
and the chien is a mass on a stiff, one-sided contact with the board, pulled
by the string over it. You can hear what a sample cannot give you: the buzz
starting at the crank speed where the drag first beats the tirant, and not
before; a coup on each beat of a bourrée; a tight tirant (sec) that only the
hardest coups lift, a loose one (gras) that buzzes at a touch; the melody
running flat as the wheel bows it, set right at each tangent as a maker
does; the top notes crunching when the wheel turns too slowly for them.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/hurdygurdy/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | the keys (25: the open chanterelles on G4, then a tangent a semitone to G6); the highest key held is the note, and the crank turns while one is down |
| `←` `→` | octave |
| `↑` `↓` | the crank's speed |
| `Space` | the coup de poignet, while held |
| MIDI | notes (the highest held sounds; a key struck harder than about 0.55 gives a coup as its tangent lands); **mod wheel = the crank's speed**; **sustain pedal = a coup, held**; **aftertouch = a coup, as hard as you press**; pitch bend pushes the tangents (±2 semitones, the drones stay put) |

**Playing.** The hand starts the wheel when you press a key and stops it
when you let go of the last one, the last tangent held down until the wheel
has stopped. *Keep turning between notes* turns the crank with no key down,
as a player does: the open chanterelles then sound G4 under the drones. Play
legato, each key down before the last lets go, and the tangents pass the
note on with no gap. The coups make the buzz: set *Coups per turn* for a
steady rhythm of the hand (two a turn for a bourrée, three for a mazurka), or
play them yourself with Space, the sustain pedal, aftertouch or hard keys.

## The strings and the tangents

The six strings are gut (the three lowest drones wound), each tuned by
Mersenne's law, f = (1/2L)√(T/μ), to tensions of 25 to 60 N, well under
gut's breaking stress:

| string | note | length | μ (g/m) |
|---|---|---|---|
| chanterelles (two) | G4 | 33 cm | 0.50 |
| trompette | D4 (or C4) | 33 cm | 1.13 |
| mouche | G3 | 36 cm | 2.6, wound |
| petit bourdon | C3 | 36 cm | 5.5, wound |
| gros bourdon | G2 | 36 cm | 9.5, wound |

Each string is a digital waveguide in velocity waves, split at the wheel
into a bridge side and a nut side, each a fractional delay with the losses
of air and the gut's internal friction lumped into a one-pole filter
(σ = 3 + 12·(f/1 kHz)² s⁻¹, more for the wound drones). The second
chanterelle is tuned a little sharp of the first (*Chanterelle unison*,
1.5 ¢): the two never quite agree, and their slow beat thickens the melody.

A key's tangent stops the chanterelles from the far side, at
L·f_open/f_key: a semitone a step, a quarter of the string at G6. The wheel
stays where it is, 28 mm from the bridge, so a high note puts it further
along its shorter string: 8 % of the open string, a third of G6's. Above G6
the tangents would reach the wheel, which is why the keyboard stops there;
below G4 nothing can lengthen the open strings.

A bowed string runs flat of the free string, the more so the higher the note
and the further along its string the bow sits, mostly from the rosin's lag
(below). Makers set each tangent by ear; here
[`tools/hurdygurdy-tuning.mjs`](../tools/hurdygurdy-tuning.mjs) does the
same, bowing every note alone at the default crank speed and turning its
tangent (and each drone's peg) until it sounds its note, from 2 ¢ on the
open string to 47 ¢ at G6. Every note sounds within 3 ¢ of its note at
the defaults; crank faster or press harder and the melody moves a few cents,
as on the instrument.

## The wheel

The wheel's rim moves at v_B = π·D·n for n turns a second (37 cm/s at the
default 1.2 turns/s). Each string bears on it with a force set by the cotton
wound on it and the paper shims under it, and the rosin's friction follows
Smith and Woodhouse's thermal model: the hyperbolic curve from μs = 0.8
stuck to μd = 0.3 sliding fast, its width v₀ the cotton's softness, the grip
lagging the sliding speed by τ = 20 µs, plus a little band-limited grain,
heard as the wheel's hiss. The friction is solved implicitly with the
string's impedance at the contact each step, as in McIntyre, Schumacher and
Woodhouse (1983), and the strings run 1 to 8 steps a sample (*Quality*,
below) so that the corner that runs round each string stays sharp.

Schelleng's bounds set what each string can take: from
F_max = 2Z₀(v_B + βv₀)/(Δμ β) down to a minimum that grows with the
string's losses. At the defaults the chanterelles bear 60 % of what G6 can
take (so the treble stays clean and the open string, whose minimum is
highest, still speaks in Helmholtz motion on every key) and the drones half
or less. Turn the crank slowly and F_max falls with v_B: the top notes
crunch (*Slow crank*). Two strings on one bridge in near unison pull on each
other: the chanterelles fall into step and add at about 0.8 of in phase,
and now and then one starts a note slipping twice a period before it
settles, as on the instrument.

The hand turns the crank toward its speed in the *start-up* time (and stops
it in a third of that), a little faster on the down stroke than on the way
back up (*Hand unevenness*), and the wheel lags the hand by its inertia
(15 ms). When the wheel stops, the cotton resting on it damps the strings
(T₆₀ ≈ 0.6 s), so they fall quiet as the player's do.

## The chien

The trompette's bridge-side end is the chien: a mass m (1.2 g, the little
hardwood bridge and the string over it) whose top the string pulls up with
the force it sends there, and whose foot the tirant's pull F_t holds on the
board. The board pushes back only while the foot is pressed into it, as a
stiff spring–dashpot (k = 1.5 MN/m, a contact of about 90 µs), and the foot
leaves it as soon as that force falls to zero. Each step

  m ẏ' = F_s − F_t + F_c,  F_s = 2Z₀·a − Z₀·ẏ,  F_c = max(0, −k y − c ẏ) for y < 0,

with the string's impedance taken implicitly, so a = the wave arriving from
the wheel reflects from a moving end. The dashpot c = 2ζ√(km) is set for the
chosen coefficient of restitution (*Bounce on the soundboard*): since the
board cannot pull, ζ is not the free oscillator's but solves
e = e^(−ζt)·|cos ωt − ζ sin ωt/ω| at the first ωt past π/2 where the
contact force vanishes (Schwager and Pöschel 2007).

The Helmholtz motion pulls the trompette's end with a sawtooth whose peak is
Z₀v_B/β above the drag's mean, about (1 − β)·μd·F_N. Once that beats the
tirant, the chien lifts once a period and lands with a click: the buzz.
Solving that for the speed gives the threshold the Chien view shows, 1.54
turns/s at the default tirant of 2.7 N; the buzz starts within a few per cent
of it, and a tighter tirant needs more. Under it the crank turns cleanly and
the trompette is just a drone; above it, every coup that takes the wheel
past it is a burst of clicks, one or more a period, in the rhythm of the
hand. A light, bouncy chien rattles several times a period; a heavy one
lingers in the air and buzzes lower.

The coups: each is a sin² surge of the wheel's speed (*Coup strength*, +60 %
at its peak) 70 ms long, at each of N evenly spaced points a turn; Space,
the sustain pedal and aftertouch give the same surge for as long as they are
held, and a key struck hard gives one of 90 ms as it lands.

## The body

Each bridge stands on the soundboard, a 32 × 24 cm orthotropic spruce plate
(Cremer and Heckl's Y∞ = 1/(8√(ρh)(D_x D_y)^¼) its point admittance), and
moves with V = 2G Σ Z_k a_k / (1 + G ΣZ) from the strings on it: the
chanterelles share the middle bridge, each drone has a small one of its own
to the side, and the trompette stands on the chien. Their forces drive the
plate's modes below 4 kHz at four points, each mode heard by two
microphones through Wallace's (1972) radiation, plus a direct path for the
dense modes above.

## What to listen for

* **The threshold**: *Une traînée* or the crank's ↑, slowly, on a held note.
  Nothing, nothing, then the chien starts to click, one per period, then a
  buzz. The Chien view shows its lift and the pull against the tirant line;
  the Crank view the speed against the threshold.
* **The rhythm of the hand**: *Bourrée* or *Mazurka*: two or three bursts a
  turn, the buzz exactly on the coups. Try *Coups per turn* at six or eight.
* **Sec and gras**: the same phrase with the tirant tight, where only a hard
  coup cracks, and loose, where every surge buzzes, long and fat.
* **The drones**: *Drones alone, turning*. Then switch each off: it leaves
  the wheel and rings out. *Drones in C* retunes the trompette to C4 and
  adds the petit bourdon.
* **The melody's bite**: *Slow crank* (the top notes crunch, the force too
  great for the speed); *Wheel pressure* up (raucous) or down (airy);
  *Wide unison* (the two chanterelles beating).

## Files

```
hurdygurdy/index.html, style.css                page
hurdygurdy/src/hurdygurdy-params.js             parameters and presets
hurdygurdy/src/hurdygurdy-instrument.js         the descriptor: everything but the page
hurdygurdy/src/hurdygurdy-main.js               page wiring and views
hurdygurdy/src/hurdygurdy-wasm.js, hurdygurdy/wasm/hurdygurdy.wasm   the engine and model, built from the C++
native/instruments/hurdygurdy/                  the physics in C++: model and engine (plugins and WebAssembly)
native/instruments/hurdygurdy/hurdygurdy-tuning.h   the tangents and pegs (tools/hurdygurdy-tuning.mjs)
test/hurdygurdy-tests.mjs                       node test/hurdygurdy-tests.mjs
tools/hurdygurdy-tuning.mjs                     node tools/hurdygurdy-tuning.mjs [--check]
tools/render-hurdygurdy.mjs                     node tools/render-hurdygurdy.mjs → examples/hurdygurdy/
```

The friction, the loss filters and the plate are the Viola Organista's
(`native/instruments/bowed/bowed-model.h`).

## Simplifications

* **One polarisation.** The strings move only across the wheel's rim; the
  motion along it, and the strings' torsion, are left out.
* **The wheel is perfectly round and true**, its speed the same under every
  string. A real wheel runs a little out of true, and players dress it.
* **The chien is a point mass on one foot.** A real one rocks on two legs
  about its slot in the mouche's bridge, and its foot strikes a slip of
  hard wood or ivory set into the table.
* **No sympathetic strings.** Many 18th-century vielles have four or six;
  this one has none.
* **The keys are ideal**: a tangent stops the string at once at a point,
  with no travel or noise, and a released key's tangent falls away as
  quickly.
* **The bridges are resistive**: each sees the plate's point admittance Y∞,
  not its modes, so the strings do not pull each other's pitch at the board's
  resonances.

## Quality

High bows the chanterelles at 8 steps a sample (at 48 kHz), the trompette
at 4 and the drones at 1 to 2. Medium halves the chanterelles' steps, takes
the trompette to 2 and the drones to 1; Low quarters them and bows one
chanterelle, heard as the pair. A note keeps its pitch within a few cents and
its level within 2 dB; a released string is let go once it is about 80 dB
(Medium) or 70 dB (Low) down. Medium costs about half of High, Low about a
third.

## Prior art and references

### The instrument

* Dobbins, P. F. (1993). ["Introducing the hurdy-gurdy."](https://www.ioa.org.uk/system/files/publications/PF%20DOBBINS%20INTRODUCING%20THE%20HURDY-GURDY.pdf)
  *Proceedings of the Institute of Acoustics* 15(3), 705–712. The wheel
  (100–150 mm, rosined, laminated), the cotton on the strings, the tangents,
  the chanterelles' central bridge and the drones' side bridges, the chien
  in its groove at the foot of the mouche's bridge, and spectra of two
  instruments.
* [Hurdy-gurdy](https://en.wikipedia.org/wiki/Hurdy-gurdy) (Wikipedia): the
  vielle à roue's strings and tunings in G and C, the trompette, chien and
  tirant, and the coup de poignet.

### The physics

* Schelleng, J. C. (1973). "The bowed string and the player." *J. Acoust.
  Soc. Am.* 53, 26–41. [doi:10.1121/1.1913322](https://doi.org/10.1121/1.1913322).
* McIntyre, M. E., Schumacher, R. T. & Woodhouse, J. (1983). "On the
  oscillations of musical instruments." *J. Acoust. Soc. Am.* 74,
  1325–1345. [doi:10.1121/1.390157](https://doi.org/10.1121/1.390157).
* Smith, J. H. & Woodhouse, J. (2000). "The tribology of rosin." *J. Mech.
  Phys. Solids* 48, 1633–1681.
  [doi:10.1016/S0022-5096(99)00067-8](https://doi.org/10.1016/S0022-5096(99)00067-8).
* Woodhouse, J. (2003). "Bowed string simulation using a thermal friction
  model." *Acta Acustica united with Acustica* 89, 355–368.
* Wallace, C. E. (1972). "Radiation resistance of a rectangular panel." *J.
  Acoust. Soc. Am.* 51, 946–952.
  [doi:10.1121/1.1912943](https://doi.org/10.1121/1.1912943).
* Cremer, L., Heckl, M. & Petersson, B. A. T. (2005). *Structure-Borne Sound*,
  3rd ed. Springer. [doi:10.1007/b137728](https://doi.org/10.1007/b137728).
* Hunt, K. H. & Crossley, F. R. E. (1975). "Coefficient of restitution
  interpreted as damping in vibroimpact." *J. Appl. Mech.* 42(2), 440–445.
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596).
* Schwager, T. & Pöschel, T. (2007). "Coefficient of restitution and
  linear–dashpot model revisited." *Granular Matter* 9(6), 465–469.
  [doi:10.1007/s10035-007-0065-z](https://doi.org/10.1007/s10035-007-0065-z).
  The restitution of a spring–dashpot contact that cannot pull.

### Earlier models and syntheses

* Padilla, A. & Gibiat, V. (2005). ["The 'trumpet marine', an instrument
  between a trumpet and a violin."](https://dael.euracoustics.org/confs/acoustics2008/data/fa2005-budapest/paper/306-0.pdf)
  *Forum Acusticum 2005*, Budapest. The tromba marina's drumming bridge as
  a mass–spring oscillator on a bowed string, free to rise and stopped by
  the table: the same mechanism as the chien.
* Turchet, L. (2016). "The Hyper-Hurdy-Gurdy." *Proc. 13th Sound and Music
  Computing Conf.* (Hamburg).
  [doi:10.5281/zenodo.851323](https://doi.org/10.5281/zenodo.851323). An
  acoustic hurdy-gurdy fitted with sensors to drive electronic sound.
* [Viola Organista](../bowed/README.md) (Forte): the same stick–slip
  bowing, by a wheel, of strings a keyboard brings to it.
