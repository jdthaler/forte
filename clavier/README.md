# Tangent Clavier

A physically modelled clavinet, after the Hohner Clavinet D6. Each key
throws a rubber tangent at a steel string and pins it onto a metal anvil.
The string then rings between the anvil and the tailpiece, two magnetic
pickups near the tailpiece hear it, and four RC tabs filter it. When the key
is let go, the whole string, including the yarn-wound end, swings free and
the yarn chokes it. Every part of that is integrated live: the impact on the
anvil, the clamped boundary, the pitch that rises as you press harder, the
glide of a loud bass note, and the "thunk" on release. A sample could not
give you the pressure vibrato, the pickup switches on any note, or a
tangent that bounces. Other physical models of the Clavinet are listed under
*Prior art and references*.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/clavier/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (60 keys, F1–E6) |
| `←` `→` | octave |
| `↑` `↓` | velocity (tangent speed) |
| `Space` | mute bar, while held (the D6 has no sustain pedal) |
| MIDI | notes, velocity, CC64 = mute bar, **aftertouch = key pressure** (channel or polyphonic), pitch wheel up = press every held key harder |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: key pressure: the tangent presses the string harder |

## The physics

**The string and its scale.** One steel string per key runs from the
tailpiece (x = 0) to its tuning pin. The tangent pins it at x = L, so the
speaking length is [0, L]. The nonspeaking length Ln beyond the anvil is
wound with yarn. On a D6 the pitch drops three semitones when a key is
released and the two parts join (Gabrielli et al. 2013), so Ln = (2^(1/4) − 1)·L
= 0.189 L. The strings run almost parallel to the keyboard and share one
tailpiece, so L falls by about a key width per semitone: 86 cm at F1, 17 cm
at E6. The first 23 strings (F1–D♯3) are wound and the rest are plain
music wire, 0.011″ to G3 and 0.009″ above. The overall diameters of the
wound strings follow a replacement set; I chose each core so the model
reproduces the inharmonicity Gabrielli et al. measured on a D6 (B = 5·10⁻⁴
at F1, 2·10⁻⁴ at A♯1, ~10⁻⁴ at D3–D♯3). The plain strings then land within
a factor of two of their measured B with no fitting. The tension follows
from the pitch. For a pinned stiff string,
f_n = (n/2L)·√(T/μ)·√(1 + B n²), B = π²EI/TL²,
so T = μ(2Lf₁)² − π²EI/L² exactly, with EA and EI from the steel core only.

| key | f₁ (Hz) | L (cm) | Ln (cm) | string | T (N) | stress | B | pull off anvil | pitch at 16 N |
|---|---|---|---|---|---|---|---|---|---|
| F1 | 43.7 | 86.0 | 16.3 | wound 0.81 / 0.54 mm core | 21.6 | 96 MPa | 5.0·10⁻⁴ | 0.08 N | +110 ¢ |
| A♯2 | 116.5 | 66.1 | 12.5 | wound 0.56 / 0.39 mm | 43.2 | 362 MPa | 1.2·10⁻⁴ | 0.21 N | +39 ¢ |
| E3 | 164.8 | 59.1 | 11.2 | plain 0.279 mm | 18.3 | 298 MPa | 9.2·10⁻⁵ | 0.10 N | +53 ¢ |
| C4 | 261.6 | 49.8 | 9.4 | plain 0.229 mm | 21.8 | 532 MPa | 4.9·10⁻⁵ | 0.14 N | +36 ¢ |
| A4 | 440.0 | 39.2 | 7.4 | plain 0.229 mm | 38.4 | 936 MPa | 4.5·10⁻⁵ | 0.31 N | +26 ¢ |
| E6 | 1318.5 | 17.0 | 3.2 | plain 0.229 mm | 64.7 | 1.58 GPa | 1.4·10⁻⁴ | 1.20 N | +35 ¢ |

The bass strings are slack. Their EA/T reaches 2000 at F1 (core stress
only 96 MPa), which is why the bass bends and glides most. The top octave
runs at 60 % of the wire's breaking stress.

**Component modes.** The string is two pieces joined at the anvil, and the
anvil contact decides how they join, so the string is reduced to modes with
the height s of the string at the anvil as the shared coordinate:

* Speaking length (Craig–Bampton): u = s·x/L + Σ q_n sin(nπx/L). These are
  the pinned stiff-string modes on top of the static shape that the anvil
  point drags along. They couple to s through their mass only:
  μ_n(q̈_n + 2σ_n q̇_n + ω_n² q_n) = −c_n s̈, with c_n = μL(−1)ⁿ⁺¹/nπ and
  μ_n = μL/2. All partials up to 9 kHz are kept, at most 96 (6 at E6, 90 at F1).
* Yarn length (free-interface): quarter-wave modes cos((m−½)πξ/Ln), free at
  the anvil and pinned at the tuning pin, so s = Σ r_m. The force at the
  anvil point drives them. Truncating them (≤ 8) stiffens the yarn's static
  spring by Σ1/(m−½)² ÷ (π²/2). I soften them by that ratio so its static
  stiffness T/Ln is exact. The yarn is a uniform viscous drag (σ_y = 2000 s⁻¹),
  which makes these modes heavily damped or overdamped.

Joined at the anvil with nothing else acting, these give the full string.
The coupled eigenproblem's fundamental lands within 8 ¢ of a pinned string
of length L + Ln, three semitones below the held note. With the anvil
holding s still, the speaking modes are exactly the pinned stiff string.
A finite-difference solve of μü = Tu″ − EIu⁗, Richardson-extrapolated over
two grids, agrees to 0.2 ¢ (tested).

**Tangent and anvil.** The key is a mass M (8 g at the tangent) with a
Hertzian rubber tip, F_r = K_r δ^1.5 (1 + λ_r δ̇) (Hunt–Crossley). K_r is
set so the tip squeezes 0.25 mm under the 4 N of a held key. The anvil is a
steel stud, F_a = 2·10⁹ δ^1.5 (1 + 0.3 δ̇) N, about 1.6 µm of indentation
at 4 N. The string sits a gap g = 0.5 mm above the anvil. The thrown key flies
freely at the strike speed v = 0.3–4 m/s (MIDI velocity; Gabrielli et al.
give 1–4 m/s). When the tip lands, the finger takes over. It presses with
the key force F (4 N, plus up to 12 N of aftertouch) and damps the key's
rebound (15 N·s/m). The finger catches the bounce but does not brake the
stroke. Each sample, the tip height η and the string height s are found
together by a 2-D Newton solve. All modes contribute their instantaneous
compliance to it. What comes out:

* **The strike is a carry, then a stop.** The tip meets a string that is
  almost massless at that point and carries it down at speed v for a time
  τ = g/v. Then the anvil stops it in a few microseconds. The speaking
  length is left holding the difference between its old straight line and
  the new ramp from the tailpiece to the anvil, a sawtooth:
  q_n = 2g(−1)ⁿ/nπ. The engine reproduces n|q_n| = 2g/π to 8 % (tested). The
  finite carry time multiplies this by |sinc(πfτ)|: the first null is at
  v/g: 1.3 kHz for a soft note (0.67 m/s), 8 kHz for the hardest. That is the
  Clavinet's touch. The string can only travel g, so harder playing makes
  the note brighter, and barely louder. Gabrielli et al. build their
  excitation pulse from the same d/v.
* **The clamped boundary comes out of the contact.** At a held 4 N the stud
  contact has a stiffness of ~4·10⁶ N/m, so it holds the speaking length
  as if rigidly pinned. Every key is within 1.4 ¢ of A440 equal temperament
  from engine output (tested). The force on the stud is the key force less
  the string's pull off it, T·g(1/L + 1/Ln) (tested). The impact peaks at
  20–90 N.
* **Too light a press and the pinch fails.** Below the string's pull (1.2 N
  at E6) the tangent can't hold the string on the anvil. It then rings
  against the lossy rubber and buzzes. Set *Key pressure* below 1 N, or try
  the *Worn tips* preset with a soft, bouncy tip.

**Key pressure → pitch.** The D6's tangent squeezes the string against the
anvil "with greater or less strength according to the heaviness of key
pressure" (Hohner's manual). Hohner advertised vibrato and bends of up to a
quarter tone. The geometry of the pinch is not published, so this part is a
lumped model of my own. The rubber tip is wider than the stud. Squeezed by
δ = (F/K_r)^(2/3), it bends the string round the stud's edge by that depth
within its half-width a ≈ 3 mm. That adds ΔL = δ²/2a of length, and the
speaking length's tension rises by ΔT = EA·ΔL/L. The string doesn't slip
through the pinch, so the nonspeaking side is unaffected. The keyboard is
tuned at 4 N. Pressing 16 N raises C4 by 36 ¢ and the slack F1 by 110 ¢;
the measured shifts match theory to 0.1 ¢ (tested). The wrap follows the
tip's force through a 10 ms low-pass (its quasi-static squeeze), so the
impact spike only nudges the pitch. The *Rubber tip* and *Tip half-width*
sliders set how much bend you get per newton.

**Tension modulation.** The speaking length's tension follows its whole
stretch (Kirchhoff–Carrier):
T(t) = T + (EA/2L)·∫u_x² dx + ΔT_wrap − (the tuned state),
with ∫u_x² = s²/L + Σ (nπ/L)² (L/2) q_n². It enters every mode's recursion
coefficient each sample. For one mode of amplitude A this is a Duffing
oscillator, Δω/ω = 3EAk²A²/32T, and the engine matches that to 15 %
(tested). On the D6's slack bass this is the audible part. F1 at full
velocity starts 14 ¢ sharp, is still 7 ¢ sharp after 0.3 s and settles to
about 1.5 ¢ after 2 s, as the high partials, which carry most of the
stretch (∫u_x² weights partial n by n²), die away. The anvil fixes how far
the string is carried, but the touch decides how many high partials the
carry excites (the carry-time cutoff v/g), so softer notes glide less: F1
starts 9 ¢ sharp at velocity 0.3 and 4 ¢ at pp (0.05). From F2 up the glide
is under 4 ¢.
The update is linearised (explicit), not energy-conserving, so ΔT is
clamped to −50…+60 % of T. It never gets near that.

**Release.** On note-off the finger lets go and a 1.5 N return spring lifts
the key. The rubber unloads, the string springs off the anvil within about
2 ms, and the anvil point becomes an ordinary point on one long string. The
speaking modes' energy flows through it into the yarn modes, and the drag
there stops the note: 40 dB in well under 0.2 s (tested). The release
itself plucks the long string, so you hear a short thunk three semitones
down. Turn the yarn down (*No yarn* preset) and that pitch rings on. The
engine finds it within 4 ¢ of the coupled eigenvalue (tested), with no
special case for releases. That eigenvalue is 307–320 ¢ below the held note,
not the ideal 300: the open string relaxes from the tuned tension T to its
rest tension T₀ (0.5–3 % less: the pinch's stretch is let go), and the
yarn and the stiffness shift it a few cents more. The page's info row shows
the coupled value.

**Pickups.** Two single-coil bars run across all the strings near the
tailpiece. On a D6 the "bridge" pickup sits over the strings near the
termination, tilted about 30°, and the "centre" pickup sits under them,
further in (Gabrielli et al. 2013). Here A is the lower (centre) pickup,
15 cm from the tailpiece at F1 and 6 cm at E6 (slanted), and B is the
upper one, 3.5 → 2 cm. A pickup at x senses the string's height there,
u(x) = s·x/L + Σ q_n sin(nπx/L), averaged over an 8 mm pole. So partials
with a node over the pole vanish: a comb with teeth every L/x partials.
With A at x/L = 0.19 on A♯2 the notches fall every 5.3 partials (620 Hz).
Gabrielli et al. see notches every ~4.7 partials (544 Hz) in a recorded A♯2. Each pickup's flux
falls off as exp(−distance/λ), λ = 2 mm (Gabrielli et al. and Remaggi et
al. find a negative exponential). The lower pickup sees Φ ∝ e^(u/λ) and the
upper e^(−u/λ), and the output is dΦ/dt, normalised to the string's
velocity. That is linear for small swings, with some second-harmonic growl
on loud bass notes. The exponential is a fit near the rest position: within
about a field depth of it the string is in the pole's near field, where the
flux can grow no faster than at the face, so beyond u = λ it continues along
its tangent. (Unbounded, a 2 mm gap with a 0.5 mm field multiplied the gain
by e⁴ = 55 and peaked at 42.) The string's swing, and with it the signal, is
proportional to the gap g; the output is scaled by 0.5 mm/g, as a player
would reset the volume, so the *gap* slider changes the touch (carry time)
and the growl, not the loudness (a 2 mm gap was 12 dB louder, F1 peaking at
1.4). A string's signal also scales with the steel in it (its
core cross-section), so the wound bass is louder than the plain treble. The
D6's own gauge step at D♯3/E3 shows up, which is why replacement sets add a
transitional 0.011″ gauge. The switches give A alone, B alone, A + B or
A − B. Out of phase, the low partials the two pickups share cancel: on E2
the fundamental drops by the model's |W_A − W_B| / |W_A + W_B| to within
1 dB (tested).

**Tone tabs.** The D6's four tabs each put a network across the amplifier
input (values from Gabrielli et al. 2013, Table 3): soft = 30 kΩ ‖ 0.1 µF,
medium = 10 kΩ ‖ 15 nF, treble = 2 H ‖ 4.7 nF, brilliant = 0.6 H. Fed from
the pickups' source resistance R_p (10 kΩ, my assumption), the transfer is
H = 1/(1 + R_p Y), with Y the sum of the selected admittances. Every Y here
is a sum of sC, 1/R and 1/sL, so **any combination of tabs is one biquad**:

H(s) = s / (R_p C s² + (1 + R_p G) s + R_p Γ),  C = ΣC, G = Σ1/R, Γ = Σ1/L.

Soft alone is a low-pass at 210 Hz, medium a low-pass at 2.1 kHz, treble a
unit-gain band-pass at 1/2π√(LC) = 1.64 kHz, and brilliant a high-pass at
R_p/2πL = 2.65 kHz. With no tab down there is no path and the D6 is silent,
and so is this. The tests check the formula against the parallel networks
for all 15 combinations. It is bilinear-transformed (prewarped at 1 kHz).
The amplifier's mild shelves (−3 dB at 130 Hz, +3 dB at 4 kHz; Gabrielli et
al.) follow, then *Amplifier gain*.

**Mute bar.** A felt pad pressed onto every string 14 mm from the
tailpiece: a spring (≤ 400 N/m) and a dashpot (≤ 1.2 N·s/m) at one point,
eliminated into the same implicit solve as the anvil, so a hard mute stays
stable. Partial n feels it as sin²(nπx_m/L). The fundamental is damped
least, the twang most, and the felt's stiffness nudges the pitch up. A
weak felt adds exactly first-order perturbation theory's
Δσ = R sin²(kx_m)/μL to the fundamental (tested). Hold Space, or use the
sustain pedal, to engage it while you play.

**Losses and level.** The held partials decay at σ_n = σ₁ + h·(f_n² − f₁²)
(f in kHz). σ₁ gives T60 = 14 s for A2's fundamental, scaling as f^0.6
(D6 bass notes ring 20 s or more, Gabrielli et al.), and h = 0.5 s⁻¹/kHz²
is air and internal friction. A forte note peaks at 0.15–0.36, loudest in
the wound bass.

**Numerics.** Every mode is an exact two-pole (impulse-invariant)
recursion, including the overdamped yarn modes. Each sample: (1) every mode
takes its free step, with the current tension; (2) the anvil point's
equation is the Schur complement of all modes. Its effective mass is the
residual mass of the truncated modes plus the yarn's compliance, and it is
solved with the tangent, both contacts and the felt by 2-D Newton with
backtracking, usually 1–3 iterations; (3) every mode takes its share of the
result. The pickups' nonlinearity is mild, so there is no oversampling. Ten
bass voices (the most modes) run at 17 % of real time in Node on an Apple
laptop; a spread chord at 9 %.

**In C++.** The same engine and model run as WebAssembly on this page (the
JavaScript is the fallback; `?engine=js` in the address forces it), where
the views draw from the WebAssembly model and the slow motion replays the
WebAssembly engine; and as plugins (CLAP, VST3, AU and a standalone app),
with velocity as the tangent's speed, CC64 as the mute bar, and aftertouch
and the pitch wheel (up) pressing held keys harder. A key's modes are
closed-form, so the engine builds them when the key is struck, as here
(ten keys at once in about 0.2 ms). The WebAssembly plays what the
JavaScript plays to within 10⁻⁷ of the peak (float32 rounding), and the same
test suite passes on it. Ten bass voices take about 14 % of a core in C++.

## What to listen for

`examples/clavier/` (regenerate with `node tools/render-clavier.mjs`):

1. **Funky riff in E minor**: both pickups, medium + treble. The ghost notes
   are keys let go at once, so what you hear is the strike and the release
   thunk.
2. **Pickups**: the same bar through A (lower, warm), B (upper, thin and
   quiet), A + B, then A − B (nasal). Levels are matched, as a player would
   with the volume.
3. **Tone tabs**: soft, medium, treble, brilliant, each alone, levels
   matched.
4. **Aftertouch**: a held D4 pressed in a 5.5 Hz vibrato (0 to +22 ¢), then
   pushed slowly to full pressure (16 N, +33 ¢) and back.
5. **Mute bar**: the riff open, then muted, then with the mute pedalled on
   alternate beats.
6. **Release thunk**: staccato bass notes with the yarn, then without it.
   Each release now rings on, a minor third below the note.
7. **Velocity**: A3 from pp to ff. The tangent's carry time g/v sets the
   brightness much more than the loudness.
8. **Tension glide**: F1 and F2 at full velocity, then the same with
   tension modulation off. Listen for the slight droop at the start.

On the page, the slow-motion view replays the engine's own simulation of
the last key: flight, carry, pinch, ringing, release, with the felt drawn
when the mute bar is on (the checkbox or Space). It is computed only while
the view is open, when the page is idle, so it never delays a note; the
released string's frequencies are kept per key. The comb view shows
what the selected pickups hear of each partial. The mode table lists the
held partials, their stiffness sharpening and T60.

## Files

```
clavier/index.html, style.css          page
clavier/src/clavier-model.js           physics (no audio, no DOM): scale, modes, contacts, pickups, tone tabs
clavier/src/clavier-engine.js          real-time engine (AudioWorklet and Node)
clavier/src/clavier-params.js          parameters and presets
clavier/src/clavier-main.js            page wiring and views
clavier/src/clavier-wasm.js            the C++ engine and model as WebAssembly (clavier/wasm/clavier.wasm)
native/instruments/clavier/            the C++ port: model, engine, reference (plugins and WebAssembly)
test/clavier-tests.mjs                 node test/clavier-tests.mjs  (23 tests, ~15 s; FORTE_ENGINE=wasm: on the WebAssembly)
tools/render-clavier.mjs               node tools/render-clavier.mjs → examples/clavier/
```

## Simplifications

* **The scale is reconstructed, not measured.** The lengths come from
  Gabrielli et al.'s drawing and the measured inharmonicity, and the gauges
  from a replacement set. Tensions and stresses are derived from those.
  They are plausible but not a D6's specification.
* **The pressure-to-pitch mechanism is a lumped guess** (the tip wrapping
  the string by its own squeeze over ~3 mm, without slip). It gives a
  quarter tone in the middle at a hard press, as Hohner advertised. The
  slack bass bends more, which may be more than a real D6 does.
* **One polarisation.** Only vertical motion. Gabrielli et al. measure the
  pickups' response to horizontal motion 25 dB down. There is no whirling
  and no longitudinal modes.
* **Pickups.** A 1-D exponential field per pickup (continued linearly beyond
  one field depth, a stand-in for the pole's near field) and a fixed 8 mm aperture.
  The upper pickup's tilt is modelled only as a slant in its distance. The
  coil impedance is flat (Gabrielli et al. measure less than 1 dB of
  variation in its response), and R_p = 10 kΩ is assumed.
* **Losses are phenomenological.** σ₁ + h f². Gabrielli et al. report
  ripples in the partials' T60 and slow beating on some notes, which they
  don't explain; neither is modelled. Nor is the knock of the tangent
  through the frame, which shows up in recordings of the top octave.
* **Tension modulation** acts on the speaking length only. The yarn side
  stays linear at the rest tension, and the update is linearised rather
  than energy-conserving.
* **Latency.** The waves need 3–10 ms to run from the anvil to the pickups,
  and the key's flight adds up to 5 ms at pianissimo. That is real physics,
  and it makes the bass slightly late.

## Prior art and references

### The original instrument and its inventor

Ernst Zacharias designed the Clavinet for Hohner; his patent describes the
tangent that clamps the string against an anvil, with the damping on one
side of it. The D6's pressure response is described in the Hohner Clavinet
D6 owner's manual.

* Zacharias, E. (1969). "String instruments having a keyboard."
  US 3,447,410 (Hohner; German priority 1966).
  [Google Patents](https://patents.google.com/patent/US3447410A/en): the
  key drives a tangent that clamps the string against an anvil, so that it
  vibrates on the far side, while a damper acts on the string on the near
  side only; on release the string leaves the anvil again.

### Physics and engineering literature

* Gabrielli, L., Välimäki, V., Penttinen, H., Squartini, S. & Bilbao, S.
  (2013). "A digital waveguide-based approach for Clavinet modeling and
  synthesis." *EURASIP J. Adv. Signal Process.* 2013, 103.
  [doi:10.1186/1687-6180-2013-103](https://doi.org/10.1186/1687-6180-2013-103):
  measurements of a D6 (mechanism, pickups, tone networks, inharmonicity,
  release pitch), the main source for this model.
* Hunt, K. H. & Crossley, F. R. E. (1975). "Coefficient of restitution
  interpreted as damping in vibroimpact." *J. Appl. Mech.* 42(2), 440–445.
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596): the contact
  damping.
* Craig, R. R. & Bampton, M. C. C. (1968). "Coupling of substructures for
  dynamic analyses." *AIAA J.* 6(7), 1313–1319.
  [doi:10.2514/3.4741](https://doi.org/10.2514/3.4741): the component
  modes.
* Carrier, G. F. (1945). "On the non-linear vibration problem of the
  elastic string." *Q. Appl. Math.* 3(2), 157–165.
  [doi:10.1090/qam/12351](https://doi.org/10.1090/qam/12351): tension
  modulation.
* Horton, N. G. & Moore, T. R. (2009). "Modeling the magnetic pickup of an
  electric guitar." *Am. J. Phys.* 77(2), 144–150.
  [doi:10.1119/1.2990663](https://doi.org/10.1119/1.2990663)

### Earlier models and syntheses

Academic:

* Gabrielli, L., Välimäki, V. & Bilbao, S. (2011). "Real-time emulation of
  the Clavinet." *Proc. International Computer Music Conference (ICMC
  2011)*, Huddersfield, 249–252.
  [Edinburgh Research Explorer](https://www.research.ed.ac.uk/en/publications/real-time-emulation-of-the-clavinet-an-electromechanical-keyboard/):
  a digital waveguide string with a velocity-dependent polynomial
  excitation pulse and a beating generator, in Pure Data (modelled).
* Remaggi, L., Gabrielli, L., de Paiva, R. C. D., Välimäki, V. &
  Squartini, S. (2012). "A pickup model for the Clavinet." *Proc. 15th Int.
  Conf. Digital Audio Effects (DAFx-12)*, York.
  [DAFx archive](https://dafx.de/paper-archive/details/LLNq5mLTHOeoFVjy2lRN-w):
  the single-coil pickups from inspection and electrical measurement, with
  a nonlinear magnetic flux, inserted into a waveguide string (modelled).
* Gabrielli et al. (2013), above: the waveguide model with dispersion,
  ripple and beating filters, the pickup nonlinearity, and the tone-tab
  and amplifier filters, running with 10-voice polyphony on an embedded
  device (modelled).

Software and instruments:

* [EVD6](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_8_section_1.html)
  (Apple, Logic Pro): component modelling of the D6, including string
  buzz, key clicks and the pickups.
* [Clavinet V](https://www.arturia.com/products/software-instruments/clavinet-v/overview)
  (Arturia): a physically modelled Clavinet.
* [Pianoteq Hohner Collection](https://www.modartt.com/hohner_collection)
  (Modartt): a physically modelled Clavinet D6, with its pickup selector.
* [Model D6](https://www.genuinesoundware.com/?a=showproduct&b=58) (GSi):
  a physically modelled Clavinet; GSi states that the same engine runs in
  the Crumar Seven and Mojo 61 keyboards.
