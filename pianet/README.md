# Sticky-Pad Piano

A physically modelled reed piano after the Hohner Pianet (models T and N). It
has no hammers. Each steel reed has a tacky pad resting on its tip. Pressing
the key lifts the pad, and the reed is dragged up with it until the
adhesive bond peels away; the reed then snaps free and rings. Releasing the
key drops the pad back onto the moving reed and chokes it. A Pianet's
character follows from this mechanism: a weak but real touch response, slow
keys that speak late, the short "plink" of staccato chords, and dull or
silent notes on an instrument whose pads have aged. Here all of it comes
from adhesion physics, with no envelopes.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/pianet/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61 keys, C2–C7) |
| `←` `→` | octave |
| `↑` `↓` | velocity (key speed at the pad, 3–40 cm/s) |
| `Space` | sustain: a catch keeps lifted pads up |
| MIDI | notes, velocity, sustain pedal (CC64) |

The real Pianet spans F1–F6. Here it spans C2–C7 like the other Forte
keyboards. The Pianet itself had no sustain pedal, and lifting every pad at
once would pluck every reed. So `Space` does not lift pads: it latches the
pads of keys you have played until you let go.

## The physics

### 1. The reeds

Each key's reed is a flat spring-steel strip (E = 200 GPa, ρ = 7850 kg/m³,
3 mm wide), clamped at one end, with a lump of solder at the free end that
tunes it. `src/reed.js` solves the Euler–Bernoulli beam with 16 Hermite
elements. The solder is a point mass plus rotary inertia, at the centre of a
lump 12 % of the reed's length. The FEM matches the exact frequency equation
of a cantilever with a tip mass R = M/(μL),

  1 + cos β cosh β + R β (cos β sinh β − sin β cosh β) = 0   (Blevins, table 8-1),

to 10⁻⁵, and the bare cantilever's 6.267, 17.55 and 34.39 × f₁. If the
solder is given as a fraction of the reed's own mass, every key is the same
dimensionless problem, f₁ = Λ₁ h √(E/12ρ) / (2π L²). So each reed's length
is *solved* for its pitch (exact to 0.01 ¢). The thickness is graded from
0.75 to 0.45 mm and the solder ratio from 1.6 to 0.3, bass to treble:

| key | length | thickness | solder | stiffness at the pad | f₂/f₁ | T60, key held | T60, pad down |
|---|---|---|---|---|---|---|---|
| C2 | 60.6 mm | 0.75 mm | 1.71 g | 0.56 N/mm | 12.3 | 8.2 s | 0.18 s |
| C3 | 44.0 mm | 0.69 mm | 0.82 g | 1.13 N/mm | 11.0 | 6.0 s | 92 ms |
| C4 | 31.7 mm | 0.63 mm | 0.39 g | 2.29 N/mm | 9.9 | 4.0 s | 47 ms |
| C5 | 22.6 mm | 0.57 mm | 0.18 g | 4.68 N/mm | 9.0 | 2.5 s | 24 ms |
| C6 | 16.0 mm | 0.51 mm | 0.08 g | 9.58 N/mm | 8.2 | 1.4 s | 12 ms |
| C7 | 11.1 mm | 0.45 mm | 0.035 g | 19.6 N/mm | 7.7 | 0.77 s | 6 ms |

The solder lowers f₁ much more than the overtones, so the second mode sits
at 8–12 × f₁ (a bare strip's is at 6.3 ×). With more solder (the *Solder tip
mass* knob) the reed is cut shorter and stiffer to stay in tune, mode 2
climbs (C3: 7.6 × with a quarter of the default solder, 16 × with three
times as much), and the reed swings less for the same pad force. The heavy
tip nearly pins itself in mode 2. That mode is strong in the reed's middle
but 45 dB down at the tip, where the pickup is, so it gives a short glassy
tick in the attack.

**Damping.** σₙ = σ_air + π fₙ [η + η_TED(fₙ)]. Thermoelastic damping
(Zener) has relaxation strength Δ = Eα²T/c_v = 2.3 × 10⁻³ for steel and peaks at
f_TED = πD/(2h²) ≈ 34–93 Hz (D = 1.2 × 10⁻⁵ m²/s). Above its peak it adds an
almost constant πΔ f_TED ≈ 0.25–0.7 s⁻¹, bass to treble. η (*Reed loss*, default 1.2 × 10⁻³) lumps the clamp
and internal friction, and σ_air = 0.4 s⁻¹ lumps air drag and radiation.

### 2. Key, foam and pad

The rear of the key carries a holder. Foam connects it to the tacky face:
a Kelvin–Voigt element (spring k_p = 0.6 N/mm in parallel with a dashpot
c_p = 0.25 N·s/m), with the face itself taken as massless. At rest the pad
presses on the reed 80 % of the way to the tip with 20 mN, bonded over a
3 × 3 mm patch (equal-area disc, a₀ = 1.69 mm). A key stroke lifts the
holder at a constant speed: 3 cm/s (pp) to 40 cm/s (ff), up to 5 mm. On
release it comes back at 25 cm/s. The foam force acts on every reed mode
through the mode shapes at the pad. It is solved implicitly each sample
(2× oversampled), together with the modal update, so a stiff or heavily
damped foam stays stable.

### 3. Adhesion: a crack that runs away

The bond is a flat contact of radius a, and its rim is a crack. For a
flat punch on an elastic body (Kendall 1971) the energy release rate under a
pull F is

  G = F² / (8π a³ E*),

so a bond of radius a₀ holds until F₀ = √(8π a₀³ E* G₀). That static pull-off
is the **Tack F₀** knob. With E* = 1 MPa (a silicone or leather skin on
foam), the default 0.25 N means a work of adhesion G₀ = 0.51 J/m². That lies
between bare van der Waals contact (≈ 0.05–0.1 J/m²) and a pressure-sensitive
tape (1–100 J/m²).

Soft adhesives are **viscoelastic**: the faster the crack moves, the more
energy it dissipates, and the harder it is to drive (Gent & Schultz 1972;
Maugis & Barquins 1978):

  G = G₀ [1 + (v/v₀)ⁿ],  inverted:  v = −da/dt = v₀ (G/G₀ − 1)^(1/n).

Maugis and Barquins measured n ≈ 0.6 for polyurethane on glass (the *Rate
exponent* knob). v₀ = 1 cm/s, the crack speed at which the work of adhesion
doubles, is chosen, not measured. Under a constant load G grows as a⁻³ as the
bond shrinks, so a peel that has started runs away and the reed snaps free.
The crack law has two limits with closed forms, and both are tested:

* **Slow loading**: the bond lets go at Kendall's F₀ (F*/F₀ = 1.004 at a
  loading rate of 10⁻⁴ N/s).
* **Fast loading** at rate R: the load runs ahead of the crack. Integrating
  da/dt ≈ −v₀ (G/G₀)^(1/n) gives

  F*/F₀ = [ (2+n)/(3+n) · a₀ R / (v₀ F₀) ]^(n/(2+n)),

  so with n = 0.6 the pull-off force grows as R^0.23. The integrator matches
  the closed form within 4 %, and its slope to 10⁻².

**What this does to the touch.** A faster key loads the bond faster, and the
reed is released from further up. At C4 the pad lets go at 0.47 N (3 cm/s),
0.59 N (11 cm/s) and 0.78 N (40 cm/s), against a static tack of 0.25 N. Notes
get 3–6.5 dB louder from pp to ff: weak, but real. On a stiff treble reed this
is exactly the crack law at the loading rate k_series·V, which the engine
follows to within 15 %. Two side effects:

* **Slow keys speak late.** The pad has to stretch the foam and bend the reed
  before the bond gives: 34 ms after the key starts moving at pp on C4,
  52 ms on C2, and 3–5 ms at ff.
* **Heavy bass reeds can't keep up.** A fast key snaps the 61 mm C2 reed free
  5 ms into the stroke, a third of its period, before it has followed the pad
  all the way. So the bass's touch response saturates. With rate-blind pads
  (n → 0.1) it even inverts: ff is 6.5 dB *quieter* than pp, because the
  release force no longer grows while the drag time keeps shrinking.

**Aged pads.** Old foam and dried-out faces lose their tack. At C4, relative
to fresh pads, the level falls by 7 dB at 0.1 N, 13 dB at 30 mN, 26 dB at
10 mN and 30 dB at 5 mN. The faintest notes are just the 20 mN preload
letting go: a note that "fails to speak".

### 4. Key up: the pad lands on a moving reed

The holder comes back down and the face meets the vibrating reed. Contact
is unilateral: the foam pushes but cannot pull unless the face is bonded.
While pressed, the face re-wets the reed and the bond regrows towards a₀
(time constant 5 ms). When the reed swings away, it has to peel that bond
again. The foam dashpot and these repeated peels (adhesion hysteresis) choke
the reed. The modal estimate c_p φ²/2 gives the "pad down" column of the
table: 0.18 s at C2, 47 ms at C4. In the engine, C3 is more than 100 dB down
0.2 s after the key comes up. The landing itself gives a small tick. A pad
cannot grip a reed that is still moving, so a bass note repeated within a
few ms of its pad landing comes out weaker.

### 5. Pickups

**Pianet T: variable reluctance.** A magnet pole sits under each reed tip at
gap g. The steel tip closes the magnetic circuit; the rest of the circuit
(the magnet and the return path through air) is lumped into an equivalent
air gap ℓ = 1.5 mm:

  Φ(y)/Φ₀ = (ℓ + g) / (ℓ + g + y),   e = −N dΦ/dt,

where y is the tip's height (up = away from the pole). The swing towards the
pole changes the flux more than the swing away, which gives a 2nd harmonic.
For y = Y sin ωt the harmonics fall by ρ = (1 − √(1 − ε²))/ε with
ε = Y/(ℓ + g), so in the output H₂/H₁ = 2ρ ≈ ε (tested). At mf with the
default voicing the 2nd harmonic is at −9 dB (C2), −14 (C3), −20 (C4),
−27 (C5) and −36 dB (C6): a little bark in the bass and a pure treble. The
output follows the tip's *velocity*. The coils are wired in series and wound
alternately (Raes), so neighbouring keys have opposite polarity. About 1 H of
coils against the cable makes a resonant low-pass near 7 kHz (assumed, Q 1.2).
If the swing exceeds the gap, the tip **strikes the pole piece**: an elastic
stop (3 × 10⁵ N/m) that bounces it back with a clack. That happens with poles
set close, or with very tacky pads in the bass.

**Pianet N: electrostatic.** The pickup is "a fixed plate mounted at a
90-degree angle to the reed", and its "capacitance changes most dramatically
when the reed is in the upper portion of its travel", giving a strong 2nd
harmonic (Wikipedia, *Electrostatic pickup*). In the model the plate faces
the tip's end across gap g, with its lower edge at height y_e. Treat the tip
as a line charge and the plate as the part of a grounded plane above the
edge. The image charge that the plate collects is then a Lorentzian
integrated over the plate, and by reciprocity this is the tip–plate
capacitance:

  C(y) = C₁ (1 mm / g) [½ + arctan((y − y_e)/g) / π],

where C₁ = ε₀ × (3 × 1 mm²) / 1 mm. With the edge level with the reed
(y_e = 0), C − C(0) is odd in y: the output has *no* even harmonics (2nd at
−83 dB in the engine), only a strong 3rd. Raise the edge and only the
upswing sees the plate. The 2nd harmonic then rises to −10 dB (C2) …
−26 dB (C6), the N's twang.

All the reeds hang on one plate rail, polarised through R = 10 MΩ from
V_b = 300 V (a repair forum reports 300–500 V on Pianet-family pickups), with
C_bus = 150 pF of rail and wiring. The rail charge obeys

  dQ/dt = (V_b − Q/C) / R,  C = C_bus + Σ Cᵢ(yᵢ),  output = Q/C − V_b.

This is stepped exactly over each sample. Above f_c = 1/(2πRC_bus) = 106 Hz
the rail holds its charge, and the output is −V_b ΔC/C_bus: it follows the
reed's *displacement*, unlike the T's velocity. Below f_c the rail holds its
voltage, and the output is ∝ dC/dt. So the N's lowest fundamentals are thinned
(C2 loses 5.6 dB). A slow key also produces a soft thump: the rail relaxes
while the reed is held up, and then the reed swings back through it. The
test checks the rail against the first-order high-pass between the two
regimes.

**Voicing.** Both gaps (and the plate edge) are scaled per key by
√(f_C4/f) ∝ √(swing). Each reed then sweeps a similar part of its pickup's
nonlinear range, and the levels come out even across the keyboard. The knobs
set the C4 values.

### 6. Output

An RC low-pass (the *Tone* knob) stands for the tone pot and cable. The
optional valve combo is generic: asymmetric tanh clipping at 2×, then a
10″ speaker's band-pass (80 Hz high-pass, cone resonance, a 2.4 kHz
presence peak, 5 kHz roll-off). The instrument is mono: one pickup rail.
The voices run 2× oversampled and are decimated with a 63-tap
windowed-sinc FIR. Ten voices take 2.6 % of real time in Node.

## What to listen for

`examples/pianet/`, regenerated with `node tools/render-pianet.mjs`:

1. **Moody minor phrase** (default, Pianet T). The off-beat chords are
   played staccato, so the pads land 20 ms after each key comes up and choke
   them: the plink. The held bass barks slightly through the magnetic pickup.
2. **Key speed 3 → 40 cm/s**, one fifth, eight times. It gets louder, but
   only by a few dB. Listen also to the attack moving earlier: the slow
   strokes speak tens of ms late.
3. **Fresh pads, then aged (40 mN), then nearly dead (12 mN).** The same bar
   of the phrase, about 12 dB and then 20 dB down, the faint notes barely
   speaking.
4. **Pianet T, then Pianet N.** The T follows the tip's velocity, so the
   reed's high modes give it a glassier attack (about 20 dB more energy above
   4 kHz). The N follows displacement and its raised plate edge adds even
   harmonics: more weight below 200 Hz and more twang at 1–4 kHz.
5. **Staccato chokes, then the same with sustain.** The pads as dampers.
6. **Plate edge level with the reed, then raised.** The same four notes:
   hollow, odd harmonics only (clarinet-like), then the octave appears.
7. **Light, then heavy solder.** The same notes on reeds re-cut for a quarter
   and for three times the default solder. Heavier tips mean shorter, stiffer
   reeds that swing less (quieter), with mode 2 pushed from 7.6 to 16 × f₁.
8. **The phrase through a valve combo**, as the Pianet was usually heard.

On the page: watch the bond (the red band under the pad) shrink as the
crack runs, and the release points in the force plot climb the spring line
as the key gets faster. Turn the tack down until the notes die. Set the
poles close and play the bass hard to hear the reeds hit them. Set the plate
edge to 0 for odd harmonics only.

## Files

```
pianet/index.html, style.css          page
pianet/src/reed.js                    FEM reed with solder (and the exact tip-mass frequency equation)
pianet/src/pianet-model.js            reeds per key, pad, adhesion law, pickups, the Pluck mechanism
pianet/src/pianet-engine.js           real-time engine (AudioWorklet and Node)
pianet/src/pianet-params.js           parameters and presets
pianet/src/pianet-main.js             page wiring and views
test/pianet-tests.mjs                 node test/pianet-tests.mjs
tools/render-pianet.mjs               node tools/render-pianet.mjs → examples/pianet/
```

## Simplifications

* **Reed dimensions are plausible, not measured.** I found no published
  Pianet reed geometry. The thickness and solder grading were chosen to
  give 1–6 cm reeds and an even level across the keyboard. The solder
  lump's size is a fixed fraction of the reed.
* **The bond is a flat punch on an elastic half-space** (Kendall), while a
  real pad face is a thin skin on foam. The two only agree in scaling. The
  crack law's v₀ was chosen for a playable touch, not fitted to pad data, and
  the bond re-forms with a single 5 ms time constant. Real tacky surfaces gain
  tack over seconds of dwell.
* **The pad face is massless and the foam is linear.** Real foam stiffens as
  it compresses, and the face has a little mass of its own. The key moves at
  constant speed, like a struck touch with no finger acceleration, and
  returns at constant speed.
* **The magnetic pickup is a one-dimensional reluctance model.** The
  equivalent gap ℓ, the coil resonance, and the geometry (pole under the
  tip) are assumptions; the T's real pole may sit off the reed's path. The
  magnet's pull on the reed is ignored, though it would flatten a reed set
  close to its pole slightly. The pole stop is a linear spring with no loss.
* **The electrostatic pickup is a 2-D image-charge model** of a line charge
  near a plate edge, and the bias values (300 V, 10 MΩ, 150 pF) are typical
  rather than documented. Intermodulation through the shared rail is modelled
  but tiny.
* **Gap voicing ∝ √swing** is a rule of thumb, not a factory procedure.
* **Damping is lumped**: air is a constant σ, and the clamp and internal
  friction share one loss factor η. Only the thermoelastic part has a
  physical frequency dependence.
* The valve combo is a generic soft clipper and speaker filter, not a model
  of a particular amplifier.

## Sources

* R. D. Blevins, *Formulas for Natural Frequency and Mode Shape* (1979):
  cantilever with a tip mass.
* K. Kendall, "The adhesion and surface energy of elastic solids",
  J. Phys. D 4, 1186 (1971): flat-punch pull-off.
* A. N. Gent & J. Schultz, "Effect of wetting liquids on the strength of
  adhesion of viscoelastic materials", J. Adhesion 3, 281 (1972).
* D. Maugis & M. Barquins, "Fracture mechanics and the adherence of
  viscoelastic bodies", J. Phys. D 11, 1989 (1978): G − G₀ = G₀ φ(a_T v),
  φ ∝ v^0.6.
* C. Zener, "Internal friction in solids II: general theory of thermoelastic
  internal friction", Phys. Rev. 53, 90 (1938).
* Hohner Pianet history and materials: Wikipedia, *Hohner Pianet* (after
  Lenhoff & Robertson, *Classic Keys*, 2019). Models up to 1977 had leather
  pads on urethane foam, ground stainless reeds and variable-capacitance
  pickups; the T and M (1977–83) had moulded silicone pads, rolled
  spring-steel reeds and electromagnetic pickups.
* Pianet T pickup coils in series, wound alternately: G.-W. Raes, notes on
  the Logos Foundation's robotised Pianet T (logosfoundation.org).
* Electrostatic pickup geometry in the Pianet N: Wikipedia, *Electrostatic
  pickup*.
