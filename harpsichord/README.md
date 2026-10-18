# Harpsichord

A Flemish double-manual harpsichord after the Ruckers workshop of Antwerp,
as such instruments were later rebuilt in France with a five-octave compass:
61 keys from FF to f³, three choirs of strings (two at 8′ pitch, one at 4′),
two manuals and a coupler, a buff stop, and an English lute row added for
good measure. Nothing is sampled. Press a key and its jacks rise; each
engaged plectrum, a small tapered cantilever of Delrin or quill, catches its
string, bends under it, and the string slides out along it against friction
until it slips off the tip. That release is the pluck, and everything about
it comes from the mechanics: how stiff the voicer left the plectrum, how far
it reaches past the string, where along the string the jack row stands. You
can voice the plectra, move every row's plucking point, change the
registration as a player would, retune to A = 415 in meantone, and switch
the soundboard off to hear what the strings alone push into the bridge.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/harpsichord/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61 keys, FF–f³) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the key lifts the jacks (it changes little) |
| `Space` | hold: keys stay down while it is held (a harpsichord has no damper pedal) |
| MIDI | notes, velocity, **release velocity** (how fast the key comes up), hold pedal (CC64) |

## The physics

### 1. The instrument: compass, choirs and registers

Ruckers doubles had two manuals a fourth apart, for transposing. Rebuilt in
eighteenth-century France (*ravalement*), their manuals were aligned, a
second 8′ choir was often added and the compass widened, in the grandest
rebuilds to five octaves, FF–f³. This model is such an instrument, with the
French disposition. **Full range** (under Strings and tuning) opens the keys
past the compass, A0 to C8, for an 88-key keyboard: no harpsichord had them,
so they carry the same scale on (iron strings at the same stress up to 4.5 cm
at C8, brass ones a little thicker per key below FF):

- the **upper manual** lifts the **front 8′** jacks, which pluck nearest the
  nut: bright and a little nasal;
- the **lower manual** lifts the **back 8′** jacks (further from the nut,
  rounder) and the **4′** jacks, which pluck their own strings, half as long
  and an octave higher;
- the **coupler** (a shove coupler) makes the lower manual's keys lift the
  upper manual's as well, so both 8′ choirs sound together. That is the
  default: two 8′s, a little apart in pitch and in where they are plucked.

The page plays one keyboard; choose the manual and the registers in the
sidebar, as a player would by moving the register slides. Every jack on a
key rises when the key goes down and lifts its damper, but only the engaged
rows reach their strings.

### 2. The strings: scale, wire and tension

The 8′ c² string is 355 mm long, Ruckers' iron scaling (about 35–36 cm; see
O'Brien 1990). From the top down to about c¹ the scale is Pythagorean, each
octave twice as long; below, it is foreshortened into the case,

  L = L_P / (1 + (L_P/L_max)^2.5)^(1/2.5),   L_P = 0.355 m · 2^((c² − key)/12),   L_max = 1.7 m

(normalised so c² stays at 355 mm), so FF is 1.65 m, c 1.18 m and c¹ 0.69 m,
3 % short of Pythagorean. The 4′ is the same rule an octave up with
L_max = 0.9 m: 178 mm at c², 0.87 m at FF.

For a plain wire of density ρ the stress at pitch depends only on L·f,

  σ = T/A = 4ρ(L f)²,

which is why a scale is drawn for a metal. In the Pythagorean treble the
iron is at 1.08 GPa at A = 440 (0.96 GPa at A = 415); the foreshortened
tenor would leave iron slack, so below B♭ the strings are brass (E = 100 GPa,
ρ = 8500 kg/m³), from 0.69 GPa at A down to 0.18 GPa at FF. Iron is taken as
E = 200 GPa, ρ = 7850 kg/m³. The diameters are graded smoothly, as gauge
numbers step them on an instrument: iron 0.30 mm at B♭ to 0.20 mm at f³,
brass 0.34 mm at A to 0.56 mm at FF (the 4′: iron 0.24 to 0.18 mm, brass
0.26 to 0.36 mm). The tensions then come out between 35 and 63 N on the 8′
and 20 and 37 N on the 4′.

Each string is tuned so that its fundamental is exactly the key's pitch,
including the stiffness of the wire (Fletcher 1964),

  T = 4L²f₁²μ − EI(π/L)²,   fₙ = n f₁ √((1 + Bn²)/(1 + B)),   B = π²EI/(TL²) = π³E d⁴/(64 T L²)

B runs from 6×10⁻⁶ (the tenor brass) to 2.5×10⁻⁴ (f³) on the 8′ and up to
8×10⁻⁴ on the short 4′ strings: c²'s 10th partial is 4 ¢ sharp, its 18th
14 ¢. Thin harpsichord wire is far less stiff than piano wire. The model
keeps every partial up to 10 kHz (the **Highest partial** knob), at most 90
per string.

### 3. Tuning: pitch and temperament

The pitch standard is A = 440 Hz, or 415 Hz (the modern convention for
"baroque pitch"): the same wires retuned, 11 % less tension. The
temperament is built from its circle of fifths:

- **equal**: every fifth 700 ¢;
- **¼-comma meantone**: every fifth narrowed by a quarter of the syntonic
  comma (21.5 ¢), to 696.6 ¢, so the major thirds C–E, D–F♯, E–G♯, F–A,
  G–B, A–C♯, B♭–D and E♭–G are pure (386.3 ¢). The leftover goes into the
  wolf G♯–E♭ (737.6 ¢);
- **Werckmeister III**: C–G, G–D, D–A and B–F♯ narrowed by a quarter of the
  Pythagorean comma (23.5 ¢), the rest pure.

A stays at the pitch standard. The two 8′ choirs are never exactly together:
the front one is set **Unison spread** (1.5 ¢ by default, ± a seeded
40 % per key) above the back one, so they beat slowly, and the 4′ is a
fraction of that off its octave.

### 4. The pluck: a cantilever, friction and the slip

Each plectrum sticks out of its jack's tongue horizontally, under the
string: free length ℓ = 3.5 mm, reaching **o** (the overlap, 0.6 mm) past
the string, so the string sits at s₀ = ℓ − o from the root. Its thickness
tapers, t(z) = t₀(1 − τz/ℓ): Delrin is cut nearly flat (τ = 0.15), quill
thin towards the tip (τ = 0.5). The string presses down on it with a force
F, and it bends as an Euler–Bernoulli beam; for the string at material point
s,

  deflection there   w = F c(s),   c(s) = ∫₀ˢ (s − z)²/EI(z) dz
  slope there        tan θ = F g(s),   g(s) = ∫₀ˢ (s − z)/EI(z) dz
  foreshortening     δ = F² Φ(s),   Φ(s) = ½∫₀ˢ (∫₀ᶻ (s − ζ)/EI(ζ) dζ)² dz

(for a uniform plectrum c = s³/3EI, g = s²/2EI and δ = 0.6 w²/s, which the
tests check). So under the string the plectrum is a spring of stiffness
k(s) = 1/c(s), softer the further out the string sits, and its surface there
slopes down towards the tip.

Pushing on a slope pushes sideways. The force from the plectrum lies within
the friction cone around the surface's normal, so with friction coefficient
μ = tan φ the sideways force per unit of vertical force lies between
tan(θ − φ) and tan(θ + φ). The string resists being moved sideways with its
own static stiffness at the plucking point and, at short times, its wave
impedance,

  Z ż + K_z (z − z₀) = F_z,   K_z = T L/(x(L − x)),   Z = 2√(Tμ)

While F tan(θ − φ) is less than that needs, friction holds the string where
it is. As the jack rises, F grows, the plectrum bends, its slope steepens,
and the string starts to slide out along it, which puts it where the
plectrum is softer and steeper still. When the string would pass the tip, it
slips off: the plectrum's force is gone within a sample, and the string,
lifted by u, rings from that shape.

At c¹ on the back 8′ (default voicing, jack at 40 cm/s) the plectrum touches
the string, carries it up 2.6 mm with a force of 1.9 N, bent 0.94 mm, 23° at
the string, and lets go 8.9 ms after touching, giving the string 2.6 mJ.
Friction holds the string for the first 5 ms; it then slides the 0.6 mm out
to the tip over the last 3.7 ms.

If the plectrum moves slowly and without friction, the string is let go from
its static shape: the shape of a point force at the plucking point x, whose
modal amplitudes are

  qₙ = F φₙ(x)/ωₙ² ∝ sin(nπx/L) / (n²(1 + Bn²))

(φₙ the mass-normalised mode shapes). The tests check the engine's string
against this to within 1.5 %, and check two other things independently:

- the energy the string carries equals the work the plectrum did on it,
  ∫F du (to 2 % at 48 kHz, converging as h²: 0.4 % at 96 kHz, 0.1 % at
  192 kHz), and a slow push stores ½F²C, C = Σφₙ²/ωₙ² ≈ x(L − x)/TL;
- the release force matches a quasi-static solution of the same equations
  (raise the jack in tiny steps, find the stick–slip equilibrium each time,
  stop where the string passes the tip) to within 2 %. For a uniform
  plectrum without foreshortening, which reaches the tip before any snap,
  that equilibrium has a closed form: with g = ℓ²/2EI,

  K_z o = F (F g − μ)/(1 + μ F g),   so for μ = 0:   F = √(2 EI K_z o)/ℓ

The release force grows as √EI. So a stiffer plectrum lets go later, at a
larger force and lift, and the time from touch to release is (u + w)/V for a
jack speed V. The tests check all three.

### 5. Voicing

The **Voicing** knob sets the plectrum's tip stiffness 1/c(ℓ) (2500 N/m by
default: for Delrin's E ≈ 3 GPa, a strip about 1.5 mm wide and 0.48 mm
thick) for a string
whose lateral stiffness at the plucking point is K_ref = 1000 N/m, about
c². The slack bass strings (K_z = 225 N/m for FF's 4′) cannot take a treble
plectrum. Friction holds a string until the plectrum's slope under it reaches
the friction angle, which fixes the plectrum's deflection there,
w ≈ ⅔ s tan φ, whatever its stiffness. The string is then up by (k/K_z)·w,
and a slack string would ride up to the jack rail (7.5 mm) without being
plucked. So the voicer leaves weaker plectra on slacker strings:

  k_tip = k_set · (K_z/K_ref)^0.6

With k ∝ K_z every string would be lifted alike, but the stiff treble
strings would get far more energy (E ≈ ½K_z u²); with k ∝ √K_z the energies
would be even but the slack strings lifted too far. The exponent 0.6 lifts
the strings 1.8–4.0 mm at the defaults and gives them 1.8–3.2 mJ (the lute
row, plucking by the nut where the strings are stiff, lifts them
1.0–1.9 mm and gives them 3.5–4.7 mJ). Voiced too stiff, with too much overlap, a plectrum on a slack
bass string still carries it to the rail without letting go: no pluck, as on
a badly voiced instrument.

### 6. The comb: where the string is plucked

A partial with a node at the plucking point is not excited, so plucking at
1/n of the length removes partial n and its multiples. The force the string
then puts on the bridge, partial by partial, is

  Fₙ ∝ bₙ qₙ ∝ sin(nπβ)/n,   β = x/L

(the stiffness cancels: bₙ ∝ T kₙ + EI kₙ³ and ωₙ² ∝ T kₙ² + EI kₙ⁴), a comb
whose notches fall at multiples of f₁/β. The jack rows run straight across
the gap while the nut curves away towards the bass, so the plucking point is
further from the nut in the bass, but not in proportion to the length (here
x ∝ √L). The plucked fraction β falls from about a quarter at the top to a
twentieth at FF, which is much of why a harpsichord's treble is round and its
bass buzzy:

| key | front 8′ | back 8′ | 4′ | lute |
|---|---|---|---|---|
| FF | 86 mm (β = 0.052) | 134 mm (0.081) | 100 mm (0.115) | 26 mm (0.016) |
| c | 73 mm (0.062) | 113 mm (0.096) | 83 mm (0.138) | 22 mm (0.019) |
| c¹ | 56 mm (0.081) | 86 mm (0.126) | 63 mm (0.182) | 17 mm (0.024) |
| c² | 40 mm (0.113) | 62 mm (0.175) | 45 mm (0.254) | 12 mm (0.034) |
| f³ | 25 mm (0.183) | 38 mm (0.284) | 28 mm (0.413) | 7 mm (0.055) |

The knobs set each row's distance at c²; the **comb** view draws the
current comb for the last key over the live spectrum.

### 7. The buff stop and the lute row

The **buff stop** presses leather pads against the back 8′ strings 10 mm
from the nut. Each pad is a light spring (400 N/m) and a dashpot of
0.6 √(Tμ). Near the nut, partial n moves there as sin(nπ·10 mm/L), so the
pads barely touch the fundamental and soak up the upper partials. The tone
is short, dull and pizzicato-like (Grove lists "lute stop" as an erroneous
English name for it). It comes on and off over 20 ms.

The **lute row** is a row of jacks that plucks the back 8′ strings 12 mm
from the nut (at c²), played from the upper manual: β = 0.02–0.06, so the
comb's first notch is beyond the 16th partial. With the fundamental weak
relative to everything above it, the sound is thin and nasal. It was an
English and German addition, not on a Ruckers. With the lute and the back 8′
row both rising, the lute plucks those strings.

### 8. Key up: the plectrum passes and the damper lands

When the key comes up, its jacks fall. A plectrum that has plucked is now
above its string, and on the way down its bevelled underside meets the
string. The tongue pivots back against its spring (60 N/m as seen by the
string), so the plectrum pushes the string down a little and slips past once
the string has been pushed by about the overlap: a faint brush, not a second
pluck.

Then the damper, a felt flag on the jack 4 mm beside the plectrum, lands on
the string. It is a one-sided contact (it can push the string down but not
pull it up) with a stiffness of 300 N/m and a dashpot of 3√(Tμ) (the
**Damper felt** knob scales it). Far more than that would pin the string
instead of absorbing it. From c¹ up, notes fall 40 dB within a third of a
second of the key coming up; the bass, damped close to its end, rings on for
longer.

How fast the key comes up sets how fast the jacks fall: from 3.5 cm/s (a key
let up slowly) to 35 cm/s (a jack dropping freely from the rail, √(2gh)).
That sets how hard the felt lands and how hard the jack (6 g) knocks back
onto its key. MIDI keyboards that send **release velocity** set it per note
(the note-off carries it to the engine). The computer keyboard and the
on-screen keys have none, and use a release of 0.6 (14 cm/s).

### 9. Touch: what velocity changes

On a harpsichord velocity hardly changes the level: the plectrum lets go
where it lets go. Measured differences are a few decibels, a slightly
brighter tone and a louder key knock (Penttinen 2006; see also MacRitchie
and Nuti 2015 and Paté et al. 2017). Here the key's velocity sets the jack
speed, 8 cm/s (pp) to 80 cm/s (ff).

- **The pluck:** a fast jack drives the string before it has settled into
  its static shape, so it is let go slightly higher and moving: on one choir,
  pp to ff is about 1–2 dB, and a little brighter. Nothing else in the model
  depends on velocity.
- **Timing:** a fast key plucks sooner (the jack covers its 1 mm gap and the
  lift faster).
- **The stagger:** the rows are set 0.5 mm apart in height (**Stagger**), so
  they speak in turn: back 8′, front 8′, 4′. With a slow key the two 8′s
  are a few milliseconds apart, so their low partials start out of phase
  and the first moments of the note are softer; with a fast key they
  coincide.
- **The knock:** the key (25 g) lands on its cloth at the end of its travel,
  and the knock grows with speed.

### 10. Bridge and soundboard

Partial n pushes on the bridge with Fₙ = bₙ qₙ,
bₙ = ±√(2/μL)(T kₙ + EI kₙ³). The bridge moves with the board's admittance
Y there, so the partial drains into the board at

  σ_b = Re Y(fₙ) · bₙ²/(2ωₙ²) = Re Y(fₙ) (T + EI kₙ²)/L

(Re Y · T/L for a flexible string): short strings drain fastest. On top
comes the string's own loss. That is the air's viscous drag on a thin wire,
a constant term and a boundary-layer term growing as √f, and the wire's
internal friction (loss factor 2.5×10⁻⁴ for iron, 6×10⁻⁴ for brass). Thin
wire loses relatively more to the air, so the treble's partials die sooner.
The fundamentals' 60 dB decay times come out at 41 s (FF), 16 s (c),
5.4 s (c¹), 3.6 s (c²) and 3.1 s (f³).

The soundboard is spruce about 3 mm thick, its grain along the strings,
glued all round and stiffened by its bridges. It is modelled as an
equivalent simply supported orthotropic plate, as the Electric Grand models
its piano board: 1.75 × 0.85 m, the mass of board and bridges
(ρh = 1.6 kg/m²) and spruce's anisotropy (D_x = 10 D_y), with the stiffness
set by the one thing that matters most to the strings, its mean conductance
at the bridge,

  G₀ = 1/(8√(ρh)(D_x D_y)^¼) = 3.5×10⁻³ s/kg

That gives D_x = 2520 N·m and D_y = 252 N·m, a lowest mode at 41 Hz and 77
modes up to 2.4 kHz, each with a loss factor of 0.04. The bridge's own mass
(10 g at the drive point) sits in series, Y_tot = Y/(1 + iωm_bY), so the
board is mass-like above f_b = 1/(2πm_bG₀) = 4.5 kHz. The strings drive the
board at five points, three along the 8′ bridge and two along the 4′,
interpolated by key. Above the modal band a residual path, flat in force,
takes over, at the band's mean level.

Two microphones listen close over the board, one over its tail (bass) end
and one over its front (treble) end, each hearing the board's acceleration
averaged over a Gaussian patch (σ = 0.3 m) under it. A first-order high-pass at 100 Hz stands
for the sound running round the case. The low modes ring the whole board
and reach both microphones alike. Above the modal band a bending wave dies
within a few wavelengths of the bridge, so each bridge point is heard mostly
by the nearer microphone: the stereo is the board's, bass on the left and
treble on the right. **Soundboard** off, you hear the bridge force itself,
panned by key: thin, without the board's resonances.

### 11. The engine

- **Partials.** Each partial is an exactly discretised damped oscillator,
  qₙ[t+1] = a₁qₙ[t] − a₂qₙ[t−1] + bₙfₙ[t], with a₁ = 2r cos ω_d h,
  a₂ = r², r = e^(−σh). Its input gain bₙ = (1 − a₁ + a₂)/ωₙ² makes a steady
  force give exactly the static deflection.
- **Contacts.** Every sample, the contacts on a string (plectra, damper
  felt, buff pad) are linear in the string's displacement at their points
  once the touching set is known. So the engine solves
  (I + βC)F = α − βu_free exactly, an implicit step with
  Cᵢⱼ = Σₙ φₙ(xᵢ)bₙφₙ(xⱼ), dropping one-sided contacts that would pull.
  Then it moves each plectrum's contact point by the friction law, again
  implicitly (bisection on s). The slip is a discontinuity in force, and the
  implicit step takes it in its stride.
- **Cost.** A string free of contacts costs one pass over its partials per
  sample; with contacts, two. Top partials that have died away (below
  10⁻⁶ N at the bridge) stop being integrated, and a string asleep (quiet,
  damped, nothing touching it) costs nothing. Ten keys held with 8′ 8′
  coupled (20 strings) take 13 % of real time at 48 kHz in Node, and with
  the 4′ (30 strings) 17 %, on the shared cloud machine this was built on.
  The buff on adds 7 points (its pads are contacts the whole time).
- **Voices.** One voice per key holds that key's strings: pressing a key
  again plucks the same strings. A plectrum still above its string goes
  down past it first. At most 16 keys sound at once; beyond that the
  quietest released key fades out (σ = 200 s⁻¹, −60 dB in 35 ms), never one
  that has not yet sounded. Physics knobs (tuning, losses, damper, highest
  partial) give the next press new strings and fade the old.
- **Allocation.** No allocation in `process()`: the strings are made when a
  key is first pressed.
- **In C++**: the engine and model are C++ (`native/instruments/harpsichord`).
  They run as WebAssembly on this page, whose views draw the model's strings
  and slow-motion pluck, and as plugins (CLAP, VST3, AU and a standalone
  app), where CC64 holds the keys down as Space does and the release
  velocity of a MIDI note-off sets how fast the jacks fall. A plugin builds
  every key's strings (their partials and the soundboard's admittance at
  each) on a worker thread whenever a physics knob changes, and a note
  whose strings aren't ready yet waits a few milliseconds for them; voices
  come from a fixed pool. Ten keys of 8′ 8′ 4′ (30 strings) take about 5 %
  of a core in C++.

## What to listen for

`examples/harpsichord/` (regenerate with `node tools/render-harpsichord.mjs`):

1. **01-bach-prelude-in-c-on-two-8-foot-choirs**: J. S. Bach's Prelude in C major
   (BWV 846), bars 1–4, on the two 8′ choirs coupled: the instrument as it
   is usually heard.
2. **02-front-back-lute-then-buff**: one arpeggio on the front 8′ (plucked
   near the nut), the back 8′ (rounder), the lute row (thin and nasal) and
   the back 8′ with the buff (short and dull).
3. **03-four-foot-alone-then-full**: a chord on the 4′ alone, an octave up,
   then 8′ 8′ 4′ together.
4. **04-plucking-point-from-nut-to-middle**: c² on the back 8′ plucked
   12, 30, 60, 120 and 178 mm from the nut. The comb's notches move down
   the spectrum, until plucked at the middle the even partials are gone.
5. **05-light-heavy-and-quill-voicing**: the arpeggio with light Delrin
   plectra (1000 N/m, 0.35 mm overlap), heavy ones (4000 N/m, 0.9 mm) and
   quill: softer and louder, and a slightly different release.
6. **06-touch-pp-ff-then-slow-and-quick-release**: G3 at pp, mf and ff,
   almost the same (the pp a little later). Then G2 let up slowly and
   quickly: the quick release thumps.
7. **07-equal-then-meantone-thirds**: a cadence at A = 415 in equal
   temperament, then in ¼-comma meantone, where the major thirds stop
   beating.
8. **08-soundboard-then-bridge-force-alone**: a phrase through the
   soundboard, then the bridge force alone: most of the sound is the board.

On the page, the **pluck** view replays the last key's pluck slowed down
some hundred times. The jack rises; the plectrum, drawn to scale with its
real deflection, catches the string (a circle of its true diameter), bends,
and the string slides out along it until it slips off. A trace below follows
the force and the string's height. The **scale** view draws every key's 8′
and 4′ string to scale with its metal, where each row plucks it, and its
inharmonicity. The **comb** view draws the plucked comb of every row in use
for the last key over the live spectrum.

## Files

```
harpsichord/index.html, style.css          page
harpsichord/src/harpsichord-params.js      parameters and presets (and the model's constants the page needs)
harpsichord/src/harpsichord-main.js        page wiring and views
harpsichord/src/harpsichord-wasm.js        the engine and model as WebAssembly (harpsichord/wasm/harpsichord.wasm), for the page and the tests
native/instruments/harpsichord/            the physics in C++: model (scale, tuning, losses, registers, voicing, soundboard), plectrum (a cantilever; the quasi-static release), string (modal, with implicit point contacts), engine, generated tables, reference
test/harpsichord-tests.mjs                 node test/harpsichord-tests.mjs (21 tests, ~25 s)
tools/render-harpsichord.mjs               node tools/render-harpsichord.mjs → examples/harpsichord/
```

## Simplifications

* **Dimensions are plausible, not measured.** The c² scaling is Ruckers'.
  The foreshortening, the gauges, the brass–iron break, the plucking
  points, the plectrum's size and the board's size are reasonable choices,
  not one instrument's drawings. The ravalement compass is one of several
  used.
* **One polarisation is heard.** The string's vertical motion (towards the
  board) is integrated in full. Its sideways motion enters only during the
  pluck, as a spring and the wave impedance resisting the slide. After
  release the sideways vibration, which drives the bridge far less, is not
  heard, and the energy stored in it is dropped.
* **The plectrum is massless and its slopes small.** It is a quasi-static
  Euler–Bernoulli cantilever with first-order foreshortening, under a
  vertical load, with Coulomb friction (one coefficient for sticking and
  sliding). At release the slope is 22–26°, where the small-slope formulas
  overstate the deflection by about 10 % against the elastica (Bisshopp
  and Drucker 1945); Perng et al. (2010, 2011) model the large deflection
  and the tip's shape. The friction coefficients and tapers are estimates.
* **No tension modulation.** At ff the string's stretch raises its pitch by
  a few cents at the attack; that glide is left out.
* **No sympathetic resonance.** Strings do not drive one another through
  the bridge, so the unplucked choir of a held key stays silent.
* **The soundboard is an equivalent plate.** It is a rectangle with
  smeared-in stiffness and its edges simply supported, not the
  wing-shaped, ribbed board of a real instrument. Its stiffness is set by an
  estimated mean conductance, its loss factor is a single number, the
  bridge is a point mass, and the case's air cavity (Savage et al. 1992) is
  left out. The residual above the modal band is flat in force.
* **The microphones** hear the board's acceleration averaged over a patch,
  not a radiated far field. The knocks reach the board through an estimated
  coupling at the bridge.
* **The jack** moves at the key's speed, a constant; the real action
  accelerates. The damper felt, the tongue's spring and the buff's leather
  are linear.

## Prior art and references

**The original instrument.**
- F. Hubbard (1965). *Three Centuries of Harpsichord Making*. Harvard
  University Press, Cambridge, Mass.
  [Harvard University Press](https://www.hup.harvard.edu/books/9780674888456).
- G. G. O'Brien (1990). *Ruckers: A Harpsichord and Virginal Building
  Tradition*. Cambridge University Press, Cambridge.
  [Cambridge University Press](https://www.cambridge.org/9780521066822).
- J. Lambrechts-Douillez & G. G. O'Brien (2001, rev. 2023). "Ruckers
  family." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.24062](https://doi.org/10.1093/gmo/9781561592630.article.24062).
- E. M. Ripin, rev. J. Koster (2001). "Buff stop" and "Lute stop." *Grove
  Music Online*.
  [doi:10.1093/gmo/9781561592630.article.04266](https://doi.org/10.1093/gmo/9781561592630.article.04266);
  [doi:10.1093/gmo/9781561592630.article.17217](https://doi.org/10.1093/gmo/9781561592630.article.17217).
- E. L. Kottick (2003). *A History of the Harpsichord*. Indiana University
  Press, Bloomington.
  [Indiana University Press](https://iupress.org/9780253023476/a-history-of-the-harpsichord/).
- J. Koster (2019). "History and construction of the harpsichord." In
  M. Kroll (ed.), *The Cambridge Companion to the Harpsichord*, 2–30.
  Cambridge University Press.
  [doi:10.1017/9781316659359.003](https://doi.org/10.1017/9781316659359.003).

**The physics.**
- H. Fletcher (1964). "Normal vibration frequencies of a stiff piano
  string." *J. Acoust. Soc. Am.* 36(1), 203–209.
  [doi:10.1121/1.1918933](https://doi.org/10.1121/1.1918933).
- N. H. Fletcher (1977). "Analysis of the design and performance of
  harpsichords." *Acustica* 37(3), 139–147 (no DOI).
- W. R. Savage, E. L. Kottick, T. J. Hendrickson & K. D. Marshall (1992).
  "Air and structural modes of a harpsichord." *J. Acoust. Soc. Am.*
  91(4), 2180–2189. [doi:10.1121/1.403652](https://doi.org/10.1121/1.403652).
- D. H. Griffel (1994). "The dynamics of plucking." *J. Sound Vib.*
  175(3), 289–297. [doi:10.1006/jsvi.1994.1329](https://doi.org/10.1006/jsvi.1994.1329).
  A plectrum–string model of the harpsichord pluck.
- N. H. Fletcher & T. D. Rossing (1998). "Harps, harpsichords,
  clavichords, and dulcimers." In *The Physics of Musical Instruments*,
  2nd edn, 331–351. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_11](https://doi.org/10.1007/978-0-387-21603-4_11).
- N. Giordano & J. P. Winans II (1999). "Plucked strings and the
  harpsichord." *J. Sound Vib.* 224(3), 455–473.
  [doi:10.1006/jsvi.1999.2187](https://doi.org/10.1006/jsvi.1999.2187).
- N. H. Fletcher & C. Beebe (2010). "Harpsichord and clavichord." In
  T. D. Rossing (ed.), *The Science of String Instruments*, 123–143.
  Springer, New York.
  [doi:10.1007/978-1-4419-7110-4_8](https://doi.org/10.1007/978-1-4419-7110-4_8).
- D. Chadefaux, J.-L. Le Carrou, S. Le Conte & M. Castellengo (2013).
  "Analysis of the harpsichord plectrum–string interaction." *Proc. Stockholm
  Music Acoustics Conference (SMAC 2013)*, 155–160.
  [PDF](https://www.lam.jussieu.fr/Membres/Castellengo/publications/2013a_Le%20Carrou-SMAC_p.155-160.pdf).
  High-speed video and vibrometry of the jack, plectrum and string while
  playing, and a plectrum model with the tip's taper.
- J. MacRitchie & G. Nuti (2015). "Using historical accounts of
  harpsichord touch to empirically investigate the production and
  perception of dynamics on the 1788 Taskin." *Front. Psychol.* 6, 183.
  [doi:10.3389/fpsyg.2015.00183](https://doi.org/10.3389/fpsyg.2015.00183).
- A. Paté, J.-L. Le Carrou, A. Givois & A. Roy (2017). "Influence of
  plectrum shape and jack velocity on the sound of the harpsichord: an
  experimental study." *J. Acoust. Soc. Am.* 141(3), 1523–1534.
  [doi:10.1121/1.4976955](https://doi.org/10.1121/1.4976955).
- A. Paté, A. Givois, S. Le Conte, J.-L. Le Carrou, M. Castellengo &
  S. Vaiedelich (2017). "Perception of harpsichord plectra voicing."
  *Acta Acust. united Acust.* 103(4), 685–704.
  [doi:10.3813/AAA.919097](https://doi.org/10.3813/AAA.919097).

**Earlier models and synthesis projects.**
- V. Välimäki, H. Penttinen, J. Knif, M. Laurson & C. Erkut (2004).
  "Sound synthesis of the harpsichord using a computationally efficient
  physical model." *EURASIP J. Appl. Signal Process.* 2004(7), 934–948.
  [doi:10.1155/S111086570440211X](https://doi.org/10.1155/S111086570440211X).
  Commuted digital-waveguide strings with a resonator for beating, a
  soundboard filter fitted to measured bridge responses, and a sampled
  key-release thump.
- H. Penttinen (2006). "On the dynamics of the harpsichord and its
  synthesis." *Proc. DAFx-06*, Montreal, 115–120.
  [PDF](https://dafx.de/paper-archive/2006/papers/p_115.pdf). Measured
  velocity dependence, added to the 2004 model with gain and timbre
  control and a filter for the soundboard knock.
- H. Penttinen (2006). *Loudness and Timbre Issues in Plucked Stringed
  Instruments: Analysis, Synthesis, and Design*. Doctoral thesis,
  Helsinki University of Technology.
  [urn:nbn:fi:tkk-007423](https://urn.fi/urn:nbn:fi:tkk-007423).
- C.-Y. J. Perng, J. O. Smith & T. D. Rossing (2010). "Physical modeling
  of the harpsichord plectrum-string interaction." *Proc. DAFx-10*, Graz.
  [PDF](https://dafx.de/paper-archive/2010/DAFx10/PerngSmithRossing_DAFx10_P93.pdf).
  The plectrum as a large-deflection beam acting on both string
  polarisations up to release (frictionless contact).
- C.-Y. J. Perng, J. O. Smith & T. D. Rossing (2011). "Harpsichord sound
  synthesis using a physical plectrum model interfaced with the digital
  waveguide." *Proc. DAFx-11*, Paris, 329–335.
  [PDF](https://dafx.de/paper-archive/2011/Papers/24_e.pdf). Adds the
  plectrum-tip geometry for the slip-off and drives a waveguide string.
- C.-Y. J. Perng (2012). *Physical Modeling of the Harpsichord
  Plectrum–String Interaction*. PhD thesis, Stanford University.
  [Stanford Digital Repository](https://purl.stanford.edu/wp454hs7976).
  The model of the DAFx papers in full, with experiments, extended with
  filters for synthesis.
- R. Michon & J. O. Smith (2011). "FAUST-STK: a set of linear and
  nonlinear physical models for the FAUST programming language." *Proc.
  DAFx-11*, Paris, 199–204.
  [PDF](https://dafx.de/paper-archive/2011/Papers/20_e.pdf). Includes a
  commuted-synthesis harpsichord ported from a SynthBuilder patch.
- L. Larisch, B. Lemke & G. Wittum (2020). "3d Modeling and simulation of
  a harpsichord." *Comput. Visual. Sci.* 23, 6.
  [doi:10.1007/s00791-020-00326-1](https://doi.org/10.1007/s00791-020-00326-1).
  Finite-element eigenmodes of the soundboard and the whole instrument,
  compared with measurements.
- M. Hamilton, R. Russo, C. Webb & M. Ducceschi (2025). "A two-register
  haptic interface for articulated control of harpsichord physical
  models." *Proc. Forum Acusticum / EuroNoise 2025*, 2851–2858.
  [doi:10.61782/fa.2025.0046](https://doi.org/10.61782/fa.2025.0046).
  A sensor-equipped harpsichord action driving a real-time nonlinear
  modal string model.
- R. Bader, N. Plath & P. Kontopidis (2025). "Sound impact of simple
  viscoelastic damping changes due to aging and the role of the double
  bentside on soundboard tension in a 1755 Dulcken harpsichord."
  arXiv:2511.09037. [doi:10.48550/arXiv.2511.09037](https://doi.org/10.48550/arXiv.2511.09037).
  Finite-difference soundboard model from measured thickness and damping.
- [Ruckers harpsichord](https://www.modartt.com/harpsichord) (Modartt,
  add-on for Pianoteq 5.6 or later): physical model of a copy of a 1624
  Ioannes Ruckers, with lower 8′, upper 8′ and 4′ registers, buff stop and
  a rattle pedal.
- [KIViR harpsichords](https://www.modartt.com/kivir) (Modartt, KIViR
  project): free physically modelled Pianoteq instruments after a 1697
  Carlo Grimaldi and a copy of a 1733 François Étienne Blanchet.
- [Karsten Collection](https://www.modartt.com/karsten) (Modartt, add-on
  for Pianoteq 6.7 or later): physically modelled historical keyboards,
  including a 1680 Giovanni Giusti harpsichord.

**Further sources used in this model.**
- K. E. Bisshopp & D. C. Drucker (1945). "Large deflection of cantilever
  beams." *Quart. Appl. Math.* 3(3), 272–275 (DOI unconfirmed): the
  elastica of an end-loaded cantilever, against which the small-slope beam
  here overstates the deflection by about 10 % at the release load.
