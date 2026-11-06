# Cristal Baschet

Bernard and François Baschet built the first **cristal** in Paris in 1952: a
row of glass rods, each clamped on a threaded steel stem, all the stems
bolted to one heavy metal bar. The player strokes the rods lengthwise with
wet fingers. The glass hardly vibrates itself: it is the handle. The
finger's friction pulls the rod along its axis, which bends the stem it is
clamped on, and the stem's bending mode is the note. A bare stem is almost
silent, so the bar, the *collector*, carries the vibration to radiators that
move the air: tall fibreglass cones, a cut-steel "flame", and long steel
wires, the *whiskers*, that ring in sympathy. Here every key is such a
resonator, built from its parts as Couineaux, Ablitzer and Gautier measured
and modelled one (2023, 2025), and stroked by a finger whose friction is
their fit to a wet fingertip. What you can hear: a note that needs the
finger to press past a threshold and then grows in; a tone whose loudness is
the stroke's speed, as a bow's; the dip as the finger turns at the end of a
stroke; a rough, crackling tone when pressed far too hard; a faint, thin
collector made full by its cones and shimmering with the flame; and
harmonics that bloom where a whisker rings with them.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/cristal/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | stroke a rod (it sounds while the key is held); 49 keys, C2–C6 (all 88, A0–C8, with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | finger pressure |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity (the stroke's speed); **aftertouch presses harder**; **mod wheel strokes faster** (from 10 to 20 cm/s); sustain pedal = hold. No pitch bend: each stem rings at its own note |
| MPE | slide (CC74) is one finger's own stroke speed, pressure its own pressure |
| Touch | lean on a held key (slide the finger along it, or press harder with an Apple Pencil) = aftertouch |

## The resonator

**The parts.** Couineaux, Ablitzer and Gautier (2025, Table 1 and Fig. 2)
give the parts of a resonator as they modelled it: a vibrating threaded
steel stem Ø 3.76 mm (E = 220 GPa, ρ = 7900 kg/m³), and a glass rod 243 mm
long and Ø 7.8 mm (E = 50 GPa, ρ = 2400 kg/m³): **27.9 g** of glass. Here the
stem is held at both ends, its foot bolted to the collector and its top to
the frame, and the rod is clamped across it at a height *h* of its length
(the *Rod's place on the stem* knob, default the middle) together with a
**tuning weight**, 40 g at C2 and halving every octave up. The rod is a rigid
mass on the stem's node there, with its moment of inertia M L²/12 about the
clamp.

**The modes.** The stem is 16 Euler–Bernoulli beam elements (cubic Hermite,
consistent masses), and its modes are the generalised eigenproblem
K x = ω² M x, mass-normalised. The finger pulls along the rod's axis, which
is the stem's sideways motion at the clamp, so a mode's shape there, φ,
says how hard the finger drives it: its mass at the rod is m = 1/φ². Modes
the finger cannot drive (φ² under 10⁻³ of the largest) are left out, and so
is everything above 16 kHz. The tests check the elements against the
clamped–clamped beam's βL = 4.730 and its static deflection.

**One stem a note.** Each key's stem is cut to length (the real ones are
tuned by moving their bolts along the thread) until the mode the finger
drives most easily is on its note: L ← L (f/f₀)^(2/3), since f goes nearly
as L^(−3/2). With the rod in the middle that is the stem's first bending
mode, the rod and weight swinging along its axis:

| key | stem | weight | mass at the rod | speaks above | rough above | T60 | the next mode |
|---|---|---|---|---|---|---|---|
| C2 65 Hz | 31.5 cm | 40 g | 78 g | 25 mN | 3.0 N | 19 s | 11.2× |
| C3 131 Hz | 22.3 cm | 20 g | 55 g | 35 mN | 4.2 N | 9.3 s | 11.2× |
| C4 262 Hz | 15.3 cm | 10 g | 43 g | 54 mN | 6.5 N | 4.7 s | 11.9× |
| C5 523 Hz | 10.2 cm | 5 g | 36 g | 91 mN | 11 N | 2.3 s | 13.3× |
| C6 1047 Hz | 6.6 cm | 2.5 g | 33 g | 164 mN | 20 N | 1.2 s | above 16 kHz |

(thresholds for a wet finger stroking at 10 cm/s). The next mode the finger
can drive is the stem's next symmetric one, far above: the note is nearly a
single mode, and its higher harmonics come from the stick–slip, not from
the stem. With the rod lower on the stem, its swing also rocks it, and a
mode **below** the note shares the finger's pull (at 30 % on C4: 133 Hz with
145 g at the rod, beside the note's 263 Hz with 66 g). Where that mode
crosses the note, around C3–G3, the two argue over the finger and the tone
wavers between them, as Couineaux and his colleagues found a playing mode
and the rod's mode strongly coupled over part of the rod's travel.

**Losses.** Couineaux et al. (2023) gave every mode of their model a
damping ratio of 0.09 %: the *Stem losses* knob, ζ, which sets the
threshold and how long a rod rings once the finger leaves it (T60 = 6.91/ζω:
19 s at C2, 1.2 s at C6).

**Full range** opens the keys past C2–C6 for an 88-key keyboard: the same
rods, the weights carrying on their halving, and the stems cut longer (46 cm
at A0, with a 95 g weight) and shorter (2.7 cm at C8).

## The finger

**Friction.** Couineaux et al. (2023) fitted a hyperbolic law to Derler and
Rotaru's measurements of a wet finger's friction:

  μ(Δv) = μd + (μs − μd) / (1 + |Δv|/V₀),  μs = 2, μd = 0.3, V₀ = 2 cm/s,

where Δv is the slip between the rod and the finger. A wet fingertip on
clean glass grips hard while still and lets go once it slides; dry skin
does not. The *Finger wetness* knob moves μs − μd from 0.05 (dry) through
1.7 (85 %, the fit) to 2.3 (dripping). Below 60 % the fingerprint's ridges
(0.45 mm apart) catch on the glass: the friction's random part, 2 % when
wet, grows to 12 %, smoothed over the passage of a ridge.

**Stick and slip.** The finger moves along the rod at its stroke speed u,
pressing with a normal force N. Each sample every mode advances exactly
(the two-pole of `modeCoeffs`), and the rod's velocity is linear in the
friction force F: v = v₀ + Y F, Y = Σ φ² b/k. So the contact **sticks** if
the force that holds the rod to the finger, F = −(v₀ − u)/Y, is within μs·N;
otherwise it **slips**, at the speed that solves Δv = |v₀ − u| − Y N μ(Δv).
With the hyperbolic law that is a quadratic,

  Δv² + (V₀ − a + YNμd) Δv − V₀ (a − YNμs) = 0,  a = |v₀ − u|,

solved in closed form every sample: no iteration.

**The threshold.** Steady sliding at u is unstable where the friction's
fall with speed, a negative damping N (μs − μd) / (V₀ (1 + u/V₀)²),
outruns the mode's own damping 2ζωm (Couineaux et al. 2023, Eq. 16):

  N > 2 ζ ω m V₀ (1 + u/V₀)² / (μs − μd).

The thresholds above come out at 25–164 mN in the compass; Couineaux and
his colleagues found 0.06 N for their C♯4 rod at 10 cm/s. The engine agrees
with the formula (tested: a note grows above it and dies away below it).
Like a technician regulating a keyboard, each key's force is set as a
multiple of its own threshold (the *Finger pressure* knob, default 10×),
scaled with the stroke's speed as the threshold scales, (1 + u/V₀)², and up
to 2× by aftertouch. A finger lands firmly, three times what it then holds,
and eases off over a quarter of a second (our choice, after the way players
start a stroke): the note starts quickly without the flat, pressed tone of
holding that hard. Changing the wetness or the losses moves the true
threshold away from this regulation, which is why dry fingers fall silent.

**The upper limit.** Gautier, Le Carrou, Elmaian and Bousquet (2010) gave
the other end of the playing range, after Schelleng's for the bowed string:
the finger can let go once a cycle only below

  F_max = π u √(k m) / (2 (μs − μd)),

121 times the threshold at 10 cm/s, for every key (both go as mω; the
threshold also as ζ). Pressed past
it, the stuck moments grow, slips come irregularly and the tone turns
rough, wavering in pitch (*Pressing too hard* preset, 120×).

**What it sounds like.** Above threshold the rod swings by about the
finger's speed, sticking once a cycle, so **the stroke's speed is the
loudness**, as a bow's speed is a string's. Velocity sets it, 0.4–1.4× the
*Stroke speed*. The stuck moment lengthens every cycle a little, so a stem
cut to its note's mode sounds about 6 ¢ flat at the reference touch: like a
maker tuning by playing, each stem is cut that much sharp
(`tools/cristal-tuning.mjs`, which plays every key and writes
`cristal-tuning.h`; every key is then within 0.5 ¢, tested). Pressing
harder, or stroking faster, flattens it more (about 20 ¢ at 20× the
threshold), as a bow pressed hard flattens a string.

**Strokes.** A rod is 24 cm long, so a held note is a series of strokes of
20 cm. *Back and forth*, the finger slows, turns and comes back over 80 ms,
and the tone dips for a moment as the rod reverses with it. *Toward you*,
it lifts at the end, comes back through the air in 0.15 s and lands again
at the far end, as many players stroke: a small new start every stroke.
*One endless stroke* is what no finger can do.

## The collector and the radiators

**The collector.** Each stem's foot pulls on the collector with the
reaction there: for each mode, the row of K − ω²M for the foot's sideways
motion on the stem's free degrees of freedom. The collector is a heavy bar
(2 kg) on its mounts' spring (20 Hz, ζ 2 %; our estimate); its two halves,
toward the bass and toward the treble, each move with the stems along them.
The stems do not feel the collector move back (it is far heavier than a
rod): Couineaux et al. (2023) found the radiating parts had little effect
on the self-oscillation.

**The cones.** Baschet's patent (US 3,167,994) describes large, untuned,
roughly conical radiators of thin metal or plasticised cardboard; later
cristals use fibreglass. Each cone here is a piston driven by its half of
the collector: its far-field pressure goes as ρc v s/(s + c/a), rising with
frequency below ka = 1 (156 Hz for the big cone, a = 35 cm, at the bass end;
364 Hz for the small one, 15 cm, at the treble end) and flat above, until
the cone stops moving as one (its breakup, a resonant low-pass at 900 Hz and
2.2 kHz; our estimates). So the cones bring out the body, and the bass end
sounds to the left, the treble to the right. The bar's own end face, a
piston 3 cm across, is heard with every choice: alone (*Bare collector*) it
is 15–20 dB under the cones, and thin, since it only radiates well above
1.8 kHz.

**The flame.** A tall cut steel sheet, 1 mm thick, bolted to the
collector. Below about 500 Hz it moves as one, a plate 25 cm across that
radiates as the cones do. Above, it bends: a Kirchhoff plate of that size
has a mode every 10 Hz or so. Sixty-four modes stand for them, drawn
(seeded) with the sheet's even density over 60 Hz–9 kHz, each driven by the
bar's acceleration (q̈ + 2σq̇ + ω²q = −a) and moving a random share of the
sheet, weighted by its radiation efficiency below coincidence (11.7 kHz, so
pressure ∝ (f/fc)^¼). Their loss factor, 0.01, is widened from a steel
sheet's so that 64 can stand for hundreds (our choice): a shimmering metal
halo that rings on a moment after the note.

**The whiskers.** Couineaux, Ablitzer and Gautier (2025) measured how the
whiskers, steel wires 0.5–1 mm across and 60–150 cm long fixed to the
collector, usually three groups of eight, enrich the sound: a harmonic
blooms where one of a whisker's modes meets it and the collector moves
easily at that frequency. Here 24 wires Ø 1 mm, 0.6–1.5 m long, are fixed to
the collector's treble half. Each is a clamped–free bar whose stretching
modes, f = (2n − 1)c/4L (c = 5277 m/s: 880 Hz to 2.2 kHz for the first,
and their odd multiples below 10 kHz), are driven through the bar's
acceleration a, q̈ + 2σq̇ + ω²q = −Γ a with Γ = √(2m_w)·2/((2n − 1)π), and
pull back on it with −ΣΓq̈. The wires and the bar are solved together each
sample (one step of both is linear in the bar's new position), so a whisker
right on a note's fundamental takes energy from it as a tuned absorber
does, and splits it into a beat. Their loss, η = 10⁻³, is steel's
(about 3·10⁻⁴) with the clamp's added: once excited they ring for a second
or so. Together they lift the top octave and a half, C6–C7, by 3–6 dB,
most where a note sits just under a whisker.

**The sway.** A whisker sways slowly on its first bending mode,
1.875²/(2πL²)·(d/4)·c: 0.3 Hz for the longest and 2 Hz for the shortest
(Couineaux 2025 give about 1.1 Hz for one 80 cm long). A bent wire's
stretching modes shift with its curvature, and Couineaux et al. heard the
sway as a slow modulation of the highs. Here each wire's modes move up to
±5 % at full *Whisker sway* (our choice of scale), each at its own rate and
phase, so they sweep across the harmonics: a sparkle in the highs.

## What to listen for

- **The threshold** (*A light touch*, 2.5×): the note grows from nothing
  over a second or more; under 1× the finger only slides.
- **The stroke** (*Slow strokes*, *Fast strokes*, the mod wheel): louder and
  a little brighter as the finger speeds up.
- **The turns** (hold a note for a few seconds): every 2 s at 10 cm/s, the
  tone dips as the finger turns round; *Strokes toward you* restarts it
  instead.
- **Pressing too hard** (120×): rough, irregular, wavering.
- **Dry fingers**: a faint rub, no note.
- **The rod lower on its stem** (30 %): C3–G3 waver between two modes.
- **The radiators**: *The bare collector* is faint and thin; the cones give
  the body; the flame a metallic halo.
- **The whiskers** (*Swaying whiskers*, high notes): harmonics that come
  and go.

## Files

```
cristal/index.html, style.css            page
cristal/src/cristal-params.js            parameters and presets
cristal/src/cristal-instrument.js        the descriptor: everything but the page
cristal/src/cristal-main.js              page wiring and views
cristal/src/cristal-tour.js              the guided tour
cristal/src/cristal-wasm.js, cristal/wasm/cristal.wasm   the engine and model, built from the C++
native/instruments/cristal/              the physics in C++: model and engine (plugins and WebAssembly)
native/instruments/cristal/cristal-tuning.h   each stem's cut, from tools/cristal-tuning.mjs
test/cristal-tests.mjs                   node test/cristal-tests.mjs
tools/render-cristal.mjs                 node tools/render-cristal.mjs → examples/cristal/
```

## Simplifications

- **A resonator is a stem and a rigid rod.** The real ones have a support
  stem, a hanger, bolts and the plongeoir; Couineaux's finite elements
  found nine modes under 500 Hz in one. Ours has the playing mode, the
  rocking mode when the rod is off-centre, and the stem's higher modes. The
  rod's own bending (across its length, which the finger's pull hardly
  drives) is left out.
- **The collector does not push back on the stems**, and its halves are
  rigid masses on a spring: no bar modes, no coupling between keys through
  it. The whiskers do push back on it.
- **The finger is rigid**, as in Couineaux's model: its force and speed are
  prescribed, with no skin pad between bone and glass.
- **The radiators are estimates.** The cones' sizes and breakups, the
  flame's losses and the whiskers' curvature shift are our choices, not
  measurements; the flame's modes are statistical, not a real flame's.
- **The landing press** (three times the held force, at most 20 thresholds
  more, easing over 0.25 s) is our choice.
- **One microphone pair** in front, the cones at the two ends; the room and
  venue are Forte's.

## Quality

High plays up to six modes a stem, 36 rods at once and every whisker's
stretching modes below 10 kHz (up to six a wire). Medium plays three modes a
stem, 16 rods and three modes a whisker; Low two modes a stem, 10 rods and
only a whisker's first. Past the rods a level plays, the quietest rod nobody
is stroking is let go, or else the one stroked longest. The flame, one for the whole instrument, keeps its 64 modes at
every level. The note is the stem's speaking mode at every level, so the
pitch, the threshold and a note's level stay.

## Prior art and references

**The instrument.** Bernard and François Baschet built the cristal in 1952
in Paris (Couineaux et al. 2023). F. Baschet, *Musical instrument with
mechanical radiating means*, [US 3,167,994](https://patents.google.com/patent/US3167994A/en)
(filed 1963, granted 2 February 1965; French priority 1957): tuned metal
rods rigidly fixed to a heavy carrier bar, large untuned roughly conical
radiators, and (its claim 3) a glass rod rubbed lengthwise with the fingers
to set a rod vibrating. Couineaux et al. cite F. Baschet's Swiss patent
CH 345229 (1960), *Instrument de musique polyphonique polyton à timbres
multiples*, and F. and B. Baschet, *Organologie des Structures Sonores
Baschet* (1985). The Association Structure Sonore Baschet keeps their work:
<http://baschet.org/>.

**The physics.** The resonator's parts, the friction law, its threshold and
the losses are from A. Couineaux, F. Ablitzer and F. Gautier, "Minimal
physical model of the cristal Baschet", *Acta Acustica* **7**, 49 (2023),
[doi:10.1051/aacus/2023041](https://doi.org/10.1051/aacus/2023041); the
whiskers' sympathy and sway from A. Couineaux, F. Ablitzer and F. Gautier,
"Sound enrichment of the cristal Baschet by the whiskers", *Acta Acustica*
**9**, 49 (2025), [doi:10.1051/aacus/2025024](https://doi.org/10.1051/aacus/2025024).
The playing range's upper limit, the rod's rigid motion and the collector's
role are from F. Gautier, J.-L. Le Carrou, A. Elmaian and F. Bousquet,
"Acoustics of the Cristal Baschet", *Proceedings of the 20th International
Symposium on Music Acoustics* (ISMA 2010, Sydney and Katoomba),
[PDF](https://www.lam.jussieu.fr/Publications/Conferences/ISMA2010_Gautier.pdf).
The finger friction Couineaux et al. fitted is S. Derler and G.-M. Rotaru,
"Stick-slip phenomena in the friction of human skin", *Wear* **301**,
324–329 (2013), [doi:10.1016/j.wear.2012.11.030](https://doi.org/10.1016/j.wear.2012.11.030).
The stability of steady sliding is the bowed-string analysis (F. G.
Friedlander 1953; J. Woodhouse, "The acoustics of the violin: a review",
*Rep. Prog. Phys.* **77**, 115901 (2014),
[doi:10.1088/0034-4885/77/11/115901](https://doi.org/10.1088/0034-4885/77/11/115901)),
and the limit is J. C. Schelleng's maximum bow force ("The bowed string and
the player", *J. Acoust. Soc. Am.* **53**, 26–41, 1973). The beam
elements are the standard cubic Hermite ones.

**Earlier models.** Couineaux, Ablitzer and Gautier's minimal model (2023,
above) is a time-domain simulation of one resonator stroked by a finger,
and their 2025 paper adds a whisker and the collector. We did not find an
earlier playable synthesis of the cristal from its physics. Forte's own
Glass Armonica and Clavicylinder use the same kind of stick–slip contact on
glass.
