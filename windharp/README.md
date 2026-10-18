# Wind Harp

The Aeolian harp, made playable. Strings stretched in the wind sing by
themselves: air flowing across a thin cylinder sheds a von Kármán vortex
street, the alternating vortices push the string across the wind, and when
their rate nears one of the string's harmonics the wake locks onto it and the
string sounds that harmonic, often a high one. Here every key is a nylon
string behind its own shutter (from C5 up, a course of two in unison, as
many instruments double their thin top strings). Pressing the key slides the shutter open and
lets the wind onto the string; nothing strikes or bows it, and nothing is
sampled. The wake is a row of van der Pol oscillators along the string, the
model that Facchinetti, de Langre and Biolley built for cables, and a linear
analysis of the string and its wake (de Langre's coupled-mode flutter) says
where each harmonic locks in. Every string is cut so that at the reference
wind, a gentle 4 m/s breeze, it locks onto its third harmonic on the key's
note. More wind and every sounding string hops up its own harmonic series;
less and it comes down, later than it went up. Gusts make strings flicker
between harmonics, and Kircher's harp, all strings in unison and differing
only in thickness, turns the wind into chords of harmonics.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/windharp/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (80 keys, A0–E7, 113 strings): open a key's shutter |
| `←` `→` | octave |
| `↑` `↓` | wind speed |
| `Space` | sustain: the shutters stay open after the keys come up |
| MIDI | notes, velocity (how fast the shutter opens), release velocity (how fast it shuts), sustain pedal (CC64); **mod wheel and aftertouch = more wind** (channel aftertouch for every string, polyphonic for its own) |
| Touch | lean on a held key (slide the finger along it, either way, or press harder with an Apple Pencil) = aftertouch: more wind on that string |

## The physics

### 1. Vortex shedding and the Strouhal number

Wind of speed U across a cylinder of diameter D sheds vortices alternately
from its two sides, at the Strouhal frequency

  f_s = St · U / D,   Re = U D / ν

Strouhal (1878) found that the tone of a wire in moving air has a pitch
proportional to the speed over the diameter, and Rayleigh (1879) showed that an Aeolian string swings across the
wind, not along it: it is the alternating lift that drives it. St depends
on the Reynolds number Re. Below Re ≈ 47 the wake is steady and nothing is
shed; above, the model uses Williamson & Brown's (1998) two-term fit to
two-dimensional laminar shedding,

  St = 0.2698 − 1.0271 / √Re

which gives 0.120 at Re = 47, 0.167 at Re = 100 and 0.237 at Re = 1000. Air
is taken at 20 °C: ν = 1.516×10⁻⁵ m²/s, ρ = 1.204 kg/m³, c = 343 m/s.

The shedding switches on at Re ≈ 47 as a supercritical Hopf bifurcation:
Provansal, Mathis & Boyer (1987) found that near this threshold the wake's
growth follows a Stuart–Landau equation, whose growth rate is proportional
to the distance from threshold and whose saturated amplitude grows as its
square root. The model scales the wake's own growth by
r = (Re − 47)/13, held between −1 and 1, so that shedding fades in over
47 < Re < 60 with amplitude 2√r and a wake below 47 dies away.

### 2. The wake as a van der Pol oscillator

Facchinetti, de Langre & Biolley (2004a) describe the fluctuating lift by a
wake variable q, the lift coefficient over half its fixed-cylinder value
(C_L = ½C_L0 q), which obeys van der Pol's equation and feels the
cylinder's acceleration:

  q̈ + εΩ (q² − r) q̇ + Ω² q = (A/D) Ÿ

with their constants ε = 0.3, A = 12 and C_L0 = 0.3, and γ = 0.8 below.
They compared several couplings with experiments and found that coupling to
the acceleration reproduces the observed lock-in domains and amplitudes;
these are their published values. Left alone (a fixed cylinder), the wake
swings with amplitude 2√r and, because ε is not small, a little below Ω:
the van der Pol limit cycle runs at κΩ, κ = 1 − ε²/16 + 17ε⁴/3072 = 0.99442
(the Lindstedt–Poincaré series). The model sets Ω = 2πf_s/κ, so that the
free wake sheds exactly at the Strouhal frequency (the tests check κ and the
limit cycle's amplitude, 2.001 in its fundamental, against a Runge–Kutta
integration).

### 3. The string

Each string is nylon (ρ = 1140 kg/m³, E = 4 GPa, typical values), pinned at
both ends, moving across the wind (Y), in modal form:

  m Ÿ + (r_s + r_f) Ẏ − T Y'' + E I Y'''' = ¼ ρ U² D C_L0 q(x, t)

  f_n = n f₀ √(1 + B n²),   f₀ = (1/2L) √(T/m),   B = π³ E D⁴ / (64 T L²)

The mass per length m includes the air the string carries with it
(ρπD²/4); r_s is the string's own loss (each mode at ζ = 1/2Q, the
**String Q**, 500 by default); and r_f = γΩρD² is the flow's damping on a
moving cylinder, which acts only where the shutter is open. The mass ratio
m* = m/ρD² is 744 for plain nylon; the **String mass (winding)** knob
multiplies it, as a metal winding would, without thickening the string.

The wake lives at J stations, the midpoints x_j = (j + ½)L/J, one for each of
the N modes kept. Each station feels the string's acceleration there and
pushes on the string with its own lift, so the wake can take the shape of
whichever mode it locks onto (a single wake oscillator for the whole string
could never drive an even mode, whose shape averages to zero). With
stations evenly spaced at the midpoints, projecting the lift onto the modes
is an exact discrete sine transform, so the modes stay independent. A
string keeps the modes up to the Strouhal frequency at the top wind (8 m/s)
and one more: 8 or 9 at the default tuning, up to 16 for Kircher's harp.

### 4. Cutting a string for each key

At the reference wind U₀ = 4 m/s every string must shed at its key's note
and lock onto its harmonic n₀ (the **Sounding harmonic**, 3 by default). So
its diameter solves D = St(U₀D/ν) U₀/f_note, and its fundamental is chosen
so that f_n0 = f_note, stiffness included. Its length follows a harp-like
scale, L = 0.8 m × (f₀/100 Hz)^−½, and the tension tunes it,
T = m(2Lf₀)²:

| key | D (mm) | L (cm) | T (N) | stress (MPa) | f₀ (Hz) | B | Re at U₀ |
|---|---|---|---|---|---|---|---|
| A0 | 37.7 | 338.5 | 1826 | 1.6 | 5.6 | 0.19 | 9960 |
| C2 | 15.5 | 182.5 | 1062 | 5.6 | 19.2 | 0.032 | 4095 |
| G3 | 4.92 | 99.7 | 358 | 19 | 64.4 | 3.2×10⁻³ | 1299 |
| C4 | 3.62 | 86.0 | 260 | 25 | 86.5 | 1.7×10⁻³ | 954 |
| C5 | 1.69 | 60.6 | 114 | 51 | 174.1 | 3.8×10⁻⁴ | 446 |
| C6 | 0.75 | 42.8 | 45 | 102 | 348.7 | 7.5×10⁻⁵ | 199 |
| C7 | 0.29 | 30.3 | 14 | 204 | 697.6 | 1.1×10⁻⁵ | 77 |
| E7 | 0.19 | 27.0 | 7 | 257 | 879.0 | 4.7×10⁻⁶ | 50 |

From G3 to C7 these are buildable: fishing line at the top, a 5 mm nylon
cord (as thick as a telephone wire, which sings at the same pitch in the
same wind) at the bottom, under tensions of 14–360 N and stresses well
within nylon's. Re stays between 77 and 1300 there, above 47 everywhere: the
C7 string keeps shedding down to 61 % of U₀ (at full strength down to 78 %).
The Strouhal frequency falls as 1/D, so the bass needs thick strings, and
below G3 they become ropes, cut by the same rule: 15.5 mm and 1.8 m at C2,
37.7 mm and 3.4 m at A0 (as a solid rod, stiff enough to stretch its
harmonics: B = 0.19). They are slow to move: A0 takes 5 s to speak, C1
3.7 s, G2 1.4 s. At the top the rule runs out. A thinner string sheds at a
higher frequency only while its Reynolds number stays above 47, and St
falls towards 0.12 as Re does: no diameter makes St(U₀D/ν)·U₀/D more than
about 2.7 kHz. E7 (2637 Hz) sheds at Re 50, from 94 % of U₀ up; F7 would
need Re 45, so the keys stop at E7. Stiffness stretches each string's harmonics a
little, most in the bass (G3's 4th harmonic, a fourth above its note, comes
19 ¢ wide).

### 5. Courses: two strings to a key in the treble

The Strouhal frequency puts thin strings in the treble, and a thin string
carries little force to the bridge: alone, the C7 string would sound 24 dB
under the bass. As on many instruments whose top strings are fine, the
treble keys have more strings: one to a key up to B4, two from C5 to C7 and
three from C♯7 to E7 (113 strings in all), behind one shutter. The two strings of a course are
cut alike but not identically: they are tuned 1.2 ¢ apart (−0.6 and
+0.6 ¢) and their gauges differ by 0.5 %, each offset jittered by a seeded
quarter of that. Each string has its own wake and locks on its own, on the
same harmonic (the tests check every string of every course at U₀: all
within 3 ¢ of the note, a course's two 0.9–1.3 ¢ apart), so a course beats
slowly, once every second or two: it shimmers. Together they are 3 dB
louder than one string on average (their powers add) and 6 dB at the crest
of a beat. A third string would add another 2 dB, at half as much again of
the treble's cost.

### 6. When does a harmonic lock? The linear analysis

Take one mode n of the string and the wake shaped like it. In units of the
wake's time 1/Ω and of D, they are Facchinetti's pair, linearised:

  ÿ + λ ẏ + δ² y = M q,   q̈ − ε q̇ + q = A ÿ

  δ = ω_n/Ω,   λ = 2ζδ + γ/m*,   M = C_L0 / (16π² St_Ω² m*)

(St_Ω = ΩD/2πU), and their characteristic equation is

  (s² + λs + δ²)(s² − εs + 1) = A M s²

The wake's own root grows at about εΩ/2 whatever the string does: the wake
starts by itself in a few cycles. De Langre (2006) showed that lock-in is a
second instability: drop the dissipative terms (the wake, once saturated,
neither gains nor loses on average), and the string's root and the wake's
merge into a growing pair, coupled-mode flutter, exactly when

  |δ − 1| < √(A M)

That is the band of wind in which harmonic n locks in. With the published
constants and nylon in air, M is tiny (m* is large: 4.5×10⁻⁵ for C4), so
√(AM) is 0.023 in the bass to 0.036 at the top: each harmonic's band is
about ±2.2 % wide in wind (±2.6 % at the top, where St still rises with
Re). For C4, harmonic 3 locks between 3.89 and 4.07
m/s, harmonic 4 between 5.13 and 5.36 m/s, harmonic 5 between 6.38 and
6.66 m/s. Inside the band the coupled pair grows at Re s, 17.9/s for C4 at
the band's middle and 227/s for C7 (damping included).

The engine reproduces this exactly when its wake's own growth is turned down
(ε = 0.001): a kicked C4 string grows at 18.6/s (model 18.3/s), C6 at
88.9/s (88.8/s). With the published ε = 0.3 a kicked wake grows at its own
root's rate (C4: 253/s, model 248/s), saturates within a few cycles and
then drives the string at resonance while the string pulls the wake's phase
into step. The string then rises at about half the coupled-mode rate (C4
0.54, C6 0.47 of it, from 3 % to 30 % of its final swing). Every key from G3 to
C7 speaks within a second at the reference wind: its string reaches half its final
swing after 0.6–0.8 s at G3 (it varies with the turbulence that seeds it),
about 0.5 s at C4, 0.23 s at C5 and 0.07 s at C7 (and 5 s on the A0 rope).
The bass, heavy and slow to move, swells in; the treble starts almost at once.

The tests check the band in the engine. Opening a shutter at a steady wind
inside the band locks the string; a string whose wind rises slowly locks
onto each harmonic where its band begins (C6's first string: harmonics 3, 4
and 5 at 3.95, 5.03 and 6.09 m/s, predicted 3.88, 4.96 and 6.03), and when
the wind falls it locks where each band ends (4.05, 5.18 and 6.33 m/s,
predicted 4.07, 5.20 and 6.32). The lag of a few per cent is the time the string takes to
grow.

### 7. Holding on: hysteresis and the harmonic balance

Once locked, a string holds its harmonic beyond the band. To find how far,
the model balances the locked state's first harmonics: with
y = Re(Ŷe^{iωt}) and the van der Pol term averaged, (q² − r)q̇ → (|Q̂|²/4 −
r)q̇, each station j of a string locked on mode n (shape φ_j) answers its own
forcing Aω²Ŷφ_j as a forced van der Pol oscillator,

  |Q̂_j|² [(1 − ω²)² + ε²ω² (|Q̂_j|²/4 − r)²] = (A ω² Ŷ φ_j)²

and the mode needs

  δ² − ω² + iλω + A M ω² (2/J) Σ_j φ_j² / (1 − ω² + iεωP_j) = 0,   P_j = |Q̂_j|²/4 − r

Newton finds ω and Ŷ; following the solution as the wind moves finds where
the locked branch ends. For C5's first string it reaches from 3.81 to 4.15
m/s, beyond the band (3.88–4.06) on both sides. Stepping the wind away from
it locked in the engine, it lets go at 4.20 m/s rising (balance 4.15) and
3.84 m/s falling (balance 3.81). So, rising, a string holds its harmonic past
where it would have picked it up, and falling, it holds the next one down
past where that began: the hysteresis that Brika & Laneville (1993) found
on a long flexible cylinder. Between bands the string drops out of lock
altogether; the gap is the harp falling quiet as the wind changes.

The same balance gives the locked swing. At the band's middle the engine
swings at G3 0.0444 D (balance 0.0450), C4 0.0465 (0.0472), C6 0.0729 (0.0736)
and C7 0.1441 (0.1453). With the wake's turbulence (section 10) the bass
strings, at high Re, lose up to 8 % of that (G3 0.0413, C4 0.0434).

### 8. Mass and damping

A heavy string is hard for the wake to move. The locked swing depends on
the mass–damping product m*ζ, the combination the Skop–Griffin and Scruton
numbers are built on (Sc = 2m*ζ here): at C7, m*ζ = 1.49, 0.74, 0.37 and 0.19
give Ŷ/D = 0.076, 0.144, 0.242 and 0.351, and a string wound to four times
the mass with four times the Q swings as the plain one (within 4 %). Mass
alone sets the band: √(AM) ∝ 1/√m*, so the four-times-heavier string's band
is half as wide, and a wind that the light string still locks in leaves it
silent. With plain nylon and the default Q, m*ζ = 0.74.

### 9. Shutters, release and the voices

Each string sits behind a shutter that slides along it. Pressing the key
opens it, in 300 ms × (1/30)^velocity: 254 ms at velocity 0.05, 28 ms at the
computer keyboard's 0.7, 10 ms at full velocity. The wind reaches each wake
station as the shutter passes it; a covered station's wake decays (its r is
−1) and has no lift, no turbulence and no flow damping. A slow shutter lets
the wind onto the string a little at a time, and the note starts later and
more gently. Key-up shuts it in 40 ms (with MIDI release velocity, from
100 ms to 15 ms); the wake dies, and the string rings down at its own
damping ζω = ω/2Q (tested within 5 %): 4.2 s to −60 dB at C4. The pedal
keeps the shutters open.

One voice per key: pressing a sounding key reopens its shutter on the same
strings. Beyond 12 keys the quietest one whose key is up (or, failing
that, the quietest held one), never one under 50 ms old, fades out over 30
ms. A changed n₀, tuning or winding gives the next press a new string and
fades the old.

### 10. Turbulence and gusts

Above Re ≈ 180 a real wake turns three-dimensional and its tone broadens.
Each wake station gets a small random force, seeded, sized so that a free
wake's line is 0.2 % wide (full width at half height) at Re ≤ 180, widening
to 1.5 % at Re ≥ 1000; there is none below Re = 47, where the wake is
steady. It breaks the symmetry a perfectly still wake would keep (a wake
shaped like an odd mode could never start an even one), and it is part of
the faint wind noise in the sound.

The wind itself gusts: U(t) = U (1 + I_u g(t)), with the **Gustiness** I_u
the turbulence intensity σ_u/U and g of unit variance. Atmospheric
turbulence has a von Kármán spectrum, flat below a corner f_c = 1/2πT_u
(T_u the **Gust time scale**) and falling as f^−5/3 above. The engine makes g
as the sum of two seeded Ornstein–Uhlenbeck processes with corners f_c and
6 f_c, sharing the variance 62 : 38, whose spectrum follows von Kármán's
within 2 dB from f_c/3 to 6 f_c. A string held near the edge of its lock
flickers: a C6 held at the top of its 3rd harmonic's band changes harmonic
or drops in and out of lock 8 times in 10 s with 5 % gusts, and not once
in a steady wind.

### 11. Kircher's harp

Kircher (1650) strung his Aeolian harp with gut strings tuned in unison and
found that the wind drew other intervals from them. With **Tuning** set to
Kircher, every string is tuned to the same fundamental (G3 by default, the
**Unison note**) at the same length (57 cm), and each key keeps only its
gauge: its diameter still makes its Strouhal frequency at U₀ the key's note.
So a key locks onto whichever harmonic of G3 lies within its band of that
note: G4, D5, G5, B5 and F6 sound harmonics 2, 3, 4, 5 and 7 (B5 12 ¢ and F6
30 ¢ under equal temperament, as harmonics are), while keys between
harmonics stay unlocked and nearly silent. Hold a handful and raise the wind,
and each gauge climbs its own series: the chord of harmonics re-forms.

### 12. The sound

The strings run over a bridge on the box's top and are fastened at the far
end to a rigid block. The bridge feels each string's slope, F_b = T Σ (nπ/L) a_n, summed over the
key's course. Above its lowest modes the top acts on average as a mass-like
plate, and the model takes the pressure it radiates at r = 1 m as

  p = ρ F_b / (2π m'' r) · H(f),   |H| = √(1 + (f/500 Hz)²) / √(1 + (f/4 kHz)²)

with m'' the top's mass per area under the string. As on a harp's
soundboard the top tapers, 4 kg/m² under the G3 string (with its bars) to
0.5 kg/m² under C7, which evens the registers by 18 dB; below G3 it goes on
thickening at the same rate, to 22 kg/m² under the A0 rope. H is the
top's radiation efficiency: below its coincidence frequency (around 4 kHz
for a 3 mm spruce top) a finite plate radiates from its edges and corners,
and more efficiently the higher the frequency. The model takes it as one
first-order shelf rising 6 dB an octave from 500 Hz and levelling off by
4 kHz (the model's choice of curve): +0.6 dB at G3, +1.0 dB at C4, +3.1 dB
at C5, +7.0 dB at C6 and +11.6 dB at C7. The box's lowest resonances add broad
peaks: the air in the box through its rose holes at 140 Hz (Q 6), and plate
modes at 235, 370, 580 and 900 Hz (Q 8–10), each a band-pass of the summed
force with gain 1.4–1.8 at its peak. Two microphones, by the box's bass and
treble ends, hear each key's force by its place across the box and the
resonances in or out of phase.

The wake's lift also radiates directly, as a dipole (Curle 1955; Phillips
1956 computed the aeolian tone this way):

  p = cos θ / (4π c r) · dF_L/dt,   F_L = ¼ ρ U² D C_L0 Σ_j q_j Δx √(ℓ_c / Δx)

A fixed cylinder's lift is correlated only over a few diameters along the
span, ℓ_c = 5 D here (the model's choice), so each station's span radiates
as Δx/ℓ_c independent cells. That puts the aeolian tone 34–42 dB under
the box's sound of a locked key (C4–C6): when a string locks you hear the
string. Between bands what remains, mostly the shedding itself at the
Strouhal frequency, is 30–38 dB under the locked note (C5 at 4.60 m/s: 612
Hz, the Strouhal frequency 612 Hz, 35 dB under), and slides with the wind.

**Voicing.** The thick bass strings carry far more force than the fine
treble ones: one string a key with a flat top would leave a 24 dB tilt
(a forte note peaking at 0.35 in the bass and 0.02 at C7). The tapered top,
the courses and the top's radiation efficiency together even it out: at the
reference wind a forte note now peaks at 0.22–0.30 from G3 to B3, 0.14–0.23
from C4 to B4, 0.19–0.35 from C5 to B5 and 0.27–0.31 from C6 to C7 (the
tests hold every key to 0.1–0.5 at 44.1 and 48 kHz). The page then trims
the whole instrument by −4 dB.

### 13. The engine

- **Each sample**, for each sounding string: the modes' accelerations give
  each station's acceleration (a sine transform, split into odd and even
  modes, which are symmetric and antisymmetric about the middle); each
  station's wake advances by leapfrog, its velocity half a step ahead, with
  its damping εΩ(q² − r)q̇ taken at the mean of the old and new velocity (so a
  large swing cannot blow up) and its frequency prewarped,
  Ω_d = (2/h) sin(Ωh/2), so that its linear part rings at Ω exactly; the new
  lift is projected back onto the modes; and each mode advances exactly
  under a force running linearly from the old lift to the new (a first-order
  hold, so the loop has no half-sample delay).
- **The wind** (slider gliding over 60 ms, gusts, aftertouch gliding too) and
  everything that follows from it, Ω, r, the lift's size and the flow's
  damping, is worked out at each end of a 128-sample block and ramped
  linearly across it, sample by sample.
- **Each string at its own rate.** A string whose top mode and fastest
  shedding (at 1.5 × the top wind) keep ωh under 0.4 at a half or a quarter
  of the sample rate steps at that rate, its force and lift brought back by
  linear interpolation: at 48 kHz G3–B♭3 step at 12 kHz and B3–B♭4 at
  24 kHz; the rest at 48 kHz. The leapfrog is prewarped and the modes exact
  at any step, and the decimated strings lock and swing as at the full rate.
- **Cost.** Ten sounding keys across the compass (15 strings in their
  courses) take about 20 % of one core at 48 kHz in Node on the shared
  machine this was built on (19–25 % from run to run); ten keys in the top
  octave (20 strings, all at the full rate) take more. A string whose shutter is shut
  and whose wake has died just rings, at a fraction of the cost.
- **No allocation** in `process()`: a key's strings are built when it is
  first pressed.
- **In C++**: the engine and the model are C++, built as WebAssembly for
  this page and as plugins (CLAP, VST3, AU and a standalone app), where CC64
  is the pedal that keeps the shutters open, the mod wheel blows the wind up
  to its top speed and aftertouch (channel or per key) blows harder. The
  page's map and table come from the same model. A string's design is a
  closed form, made as the key is pressed into a fixed pool of voices. Ten
  keys across the compass take about 10 % of a core.

## What to listen for

`examples/windharp/` (regenerate with `node tools/render-windharp.mjs`):

1. **01-a-slow-tune-in-a-breathing-wind**: a slow tune over sustained
   chords while the wind breathes a few per cent about 4 m/s, every string
   locked on its third harmonic: each chord swells in, the bass last.
2. **02-one-string-as-the-wind-rises-and-falls**: G5's string as the wind
   rises from 3.6 to 6.9 m/s and falls again. Rising, it hops from its 3rd
   harmonic (G5) to its 4th (C6) and 5th (E6), falling quiet between them;
   falling, each harmonic comes in later and holds on lower (hysteresis).
3. **03-gusts-make-a-string-flicker**: two strings in a wind just past where
   their 3rd harmonic lets go, with 5 % gusts: they drop out of lock and
   back.
4. **04-kircher-harp-unison-strings-in-a-rising-wind**: Kircher's harp, all
   strings tuned to G3; five gauges sound its harmonics 2–6 (G4 D5 G5 B5
   D6) at 4 m/s; as the wind rises to 5.9 m/s each climbs its own series and
   the chord of harmonics changes, ending on harmonics 3, 6, 8 and 9.
5. **05-light-then-heavy-string**: a third on plain nylon, then on strings
   wound to six times the mass: the heavy strings swing five times less
   (their mass–damping is six times larger), take twice as long to speak
   and sound about 5 dB softer.
6. **06-slow-then-fast-shutters**: a rising arpeggio with slow shutters
   (velocity 0.1, 210 ms) and then fast ones (10 ms).

On the page, the **Lock-in map** draws the last key's Strouhal frequency
against the wind across its harmonics, each band of lock-in from the linear
analysis dark and the locked branch's reach (the hysteresis) pale, with the
wind now as a dot trailing its gusts. **The string and its wake** shows the
string's swing in slow motion, the wake at each station, and a cross-section
with the vortex street peeling off downstream. The **Spectrogram** shows
the hops, and **The string** lists the last key's dimensions, its Reynolds
number and mass–damping, and each harmonic's band, reach, growth rate and
locked swing.

## Files

```
windharp/index.html, style.css            page
windharp/src/windharp-model.js            constants, and what the tests hold the C++ to: Williamson & Brown's Strouhal fit,
                                          the linear analysis (de Langre's coupled-mode flutter), von Kármán's gust spectrum
windharp/src/windharp-params.js           parameters and presets
windharp/src/windharp-main.js             page wiring and views
windharp/src/windharp-wasm.js             the engine and model as WebAssembly (windharp/wasm/windharp.wasm)
native/instruments/windharp/              the physics in C++: model (the wake, the strings and their courses, the linear
                                          analysis, the harmonic balance, shutters, gusts, the box), engine, generated
                                          tables, reference (plugins and WebAssembly)
test/windharp-tests.mjs                   node test/windharp-tests.mjs (26 tests, about 26 s)
tools/render-windharp.mjs                 node tools/render-windharp.mjs → examples/windharp/
```

## Simplifications

- **A wake oscillator, not a flow.** The wake is Facchinetti's van der Pol
  model with its published constants, which they compared with forced and
  free vibration experiments on rigid cylinders, not Aeolian strings. It has no spanwise coupling between stations, no drag
  fluctuation (the in-line force at 2f_s) and no in-line motion of the
  string.
- **St(Re).** Williamson & Brown's two-term fit is for two-dimensional
  laminar shedding. Above a few hundred a real wake turns three-dimensional
  and irregular (Roshko's irregular range), and its Strouhal number levels
  off near 0.2 rather than rising towards 0.27 as the fit does (0.237 at
  Re = 1000). The bass strings, at Re 450–1300, use the fit beyond that.
  The shedding's onset ramp (full by Re = 60) and the wake's line widths are
  the model's choices.
- **The linear and balance analyses** treat one mode at a time, with a wake
  shaped like it; the engine lets all modes and stations interact. They
  agree within the tolerances above. Opened at a steady wind, a string locks
  most readily in the upper part of its band: the saturated wake runs at
  κΩ, half a per cent below the Ω the linear analysis uses.
- **The string** is uniform, pinned at rigid ends, with one Q for every mode
  and the flow's damping γΩρD² averaged over the open span. Its bending
  stiffness is a solid nylon rod's even when it is wound, and heavily wound
  treble strings would be beyond nylon's strength.
- **The box** is a mass-like plate with five broad resonances and a
  radiation-efficiency shelf, not a modal model of a real case, and it does
  not act back on the strings: no sympathetic coupling through the bridge,
  so the strings of a course, which a shared bridge would pull towards one
  another, beat freely.
- **The aeolian tone's** level rests on the chosen correlation length; a
  vibrating string correlates its wake further along the span than that.
- **Shutters** expose each station all at once as they pass; the flow round
  a shutter's edge is not modelled.

## Prior art and references

**The instrument and its history.**
- A. Kircher (1650). *Musurgia universalis*, vol. 2, book IX,
  Machinamentum X, pp. 352–355. Rome.
  [archive.org scan](https://archive.org/details/chepfl-lipr-AXC19_02/page/n378/mode/1up).
  The Aeolian harp: gut strings tuned in unison or octaves, which sound
  other intervals than their open notes in the wind.
- V. Strouhal (1878). "Ueber eine besondere Art der Tonerregung." *Ann.
  Phys.* 241(10), 216–251.
  [doi:10.1002/andp.18782411005](https://doi.org/10.1002/andp.18782411005).
- Lord Rayleigh (1879). "Acoustical observations. II." *Phil. Mag.*
  7(42), 149–162.
  [doi:10.1080/14786447908639584](https://doi.org/10.1080/14786447908639584).
  Shows that the Aeolian string vibrates across the wind, not along it.
- H. Bénard (1908). "Formation de centres de giration à l'arrière d'un
  obstacle en mouvement." *C. R. Acad. Sci.* 147, 839–842.
  [archive.org scan](https://archive.org/details/comptesrendusheb147acad/page/n846/mode/1up).
- T. von Kármán (1911, 1912). "Über den Mechanismus des Widerstandes, den
  ein bewegter Körper in einer Flüssigkeit erfährt." *Nachr. Ges. Wiss.
  Göttingen, Math.-Phys. Kl.* 1911, 509–517; 1912, 547–556.
  [EuDML (1911)](https://eudml.org/doc/58812),
  [EuDML (1912)](https://eudml.org/doc/58837).
- Lord Rayleigh (1915). "Aeolian tones." *Phil. Mag.* 29(172), 433–444.
  [doi:10.1080/14786440408635325](https://doi.org/10.1080/14786440408635325).
- S. Bonner (2001). "Aeolian harp." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.46545](https://doi.org/10.1093/gmo/9781561592630.article.46545).

**The physics.**
- A. Roshko (1954). *On the Development of Turbulent Wakes from Vortex
  Streets*. NACA Report 1191.
  [NTRS](https://ntrs.nasa.gov/citations/19930092207). The stable range
  of periodic shedding, its transition and its irregular range.
- N. Curle (1955). "The influence of solid boundaries upon aerodynamic
  sound." *Proc. R. Soc. Lond. A* 231, 505–514 (DOI not confirmed;
  [abstract](https://typeset.io/authors/n-curle-3k7hiekdra)). A body's
  effect on a flow's sound is a distribution of dipoles, the force each
  surface element exerts on the fluid: the aeolian tone's dipole.
- O. M. Phillips (1956). "The intensity of Aeolian tones." *J. Fluid
  Mech.* 1(6), 607–624.
  [Cambridge Core](https://resolve-he.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/intnesity-of-aeolian-tones/E9479B5E1A838A3DFFA2454FA10B20FE).
  The aeolian tone as dipole radiation of the fluctuating lift and drag of a
  cylinder at Re 40–160.
- R. E. D. Bishop & A. Y. Hassan (1964). "The lift and drag forces on a
  circular cylinder oscillating in a flowing fluid." *Proc. R. Soc. Lond.
  A* 277(1368), 51–75.
  [doi:10.1098/rspa.1964.0005](https://doi.org/10.1098/rspa.1964.0005).
- C. C. Feng (1968). "The measurement of vortex induced effects in flow
  past stationary and oscillating circular and D-section cylinders."
  Thesis, University of British Columbia.
  [doi:10.14288/1.0104049](https://doi.org/10.14288/1.0104049). Lock-in
  ("capture") measured at several damping levels.
- R. T. Hartlen & I. G. Currie (1970). "Lift-oscillator model of
  vortex-induced vibration." *J. Eng. Mech. Div. ASCE* 96(5), 577–591.
  [doi:10.1061/JMCEA3.0001276](https://doi.org/10.1061/JMCEA3.0001276).
  A self-excited lift oscillator coupled to the structure's velocity.
- M. Provansal, C. Mathis & L. Boyer (1987). "Bénard–von Kármán
  instability: transient and forced regimes." *J. Fluid Mech.* 182, 1–22.
  [Cambridge Core](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/benardvon-karman-instability-transient-and-forced-regimes/E952B649863C503D73E6178E2C2013AD).
  The wake near the onset of shedding follows a Stuart–Landau equation, with
  entrainment by forcing; the model's onset ramp.
- D. Brika & A. Laneville (1993). "Vortex-induced vibrations of a long
  flexible circular cylinder." *J. Fluid Mech.* 250, 481–508.
  [doi:10.1017/S0022112093001533](https://doi.org/10.1017/S0022112093001533).
  Hysteresis loops and jumps between branches as the wind rises and
  falls.
- C. H. K. Williamson & G. L. Brown (1998). "A series in 1/√Re to
  represent the Strouhal–Reynolds number relationship of the cylinder
  wake." *J. Fluids Struct.* 12(8), 1073–1085.
  [doi:10.1006/jfls.1998.0184](https://doi.org/10.1006/jfls.1998.0184).
  The two-term fit St = 0.2698 − 1.0271/√Re used here.
- C. H. K. Williamson & R. Govardhan (2004). "Vortex-induced vibrations."
  *Annu. Rev. Fluid Mech.* 36, 413–455.
  [doi:10.1146/annurev.fluid.36.050802.122128](https://doi.org/10.1146/annurev.fluid.36.050802.122128).
- M. L. Facchinetti, E. de Langre & F. Biolley (2004). "Coupling of
  structure and wake oscillators in vortex-induced vibrations." *J. Fluids
  Struct.* 19(2), 123–140.
  [doi:10.1016/j.jfluidstructs.2003.12.004](https://doi.org/10.1016/j.jfluidstructs.2003.12.004).
  Van der Pol wake oscillator on a one-degree-of-freedom structure;
  acceleration coupling reproduces the observed lock-in domains. The
  constants ε = 0.3, A = 12, γ = 0.8 and M = 0.05/m* (C_L0 ≈ 0.3 at St = 0.2)
  used here.
- M. L. Facchinetti, E. de Langre & F. Biolley (2004). "Vortex-induced
  travelling waves along a cable." *Eur. J. Mech. B Fluids* 23(1),
  199–208.
  [doi:10.1016/j.euromechflu.2003.04.004](https://doi.org/10.1016/j.euromechflu.2003.04.004).
  Wake oscillators distributed along a cable.
- E. de Langre (2006). "Frequency lock-in is caused by coupled-mode
  flutter." *J. Fluids Struct.* 22(6–7), 783–791.
  [doi:10.1016/j.jfluidstructs.2006.04.008](https://doi.org/10.1016/j.jfluidstructs.2006.04.008).
  The wake oscillator stripped of its nonlinear and dissipative terms has a
  range of coupled-mode flutter, which is lock-in: the analysis of section 6.
- R. Violette, E. de Langre & J. Szydlowski (2010). "A linear stability
  approach to vortex-induced vibrations and waves." *J. Fluids Struct.*
  26(3), 442–466.
  [doi:10.1016/j.jfluidstructs.2010.01.002](https://doi.org/10.1016/j.jfluidstructs.2010.01.002).
  A continuum of wake oscillators along a tensioned cable: which mode locks
  in, and mode switching as the flow speed changes.

**Earlier models and synthesis projects.**
- Y. Dobashi, T. Yamamoto & T. Nishita (2003). "Real-time rendering of
  aerodynamic sound using sound textures based on computational fluid
  dynamics." *ACM Trans. Graph.* 22(3), 732–740.
  [doi:10.1145/882262.882339](https://doi.org/10.1145/882262.882339).
  Aerodynamic sounds (swords, wind) from CFD-precomputed sound textures,
  replayed in real time.
- R. Selfridge, J. D. Reiss, E. J. Avital & X. Tang (2016). "Physically
  derived synthesis model of an Aeolian tone." *AES 141st Convention*,
  Los Angeles (no DOI).
  Real-time Aeolian-tone synthesis from fluid-dynamics formulae, compared
  with wind-tunnel and computational results.
- R. Selfridge, D. Moffat, J. D. Reiss & E. J. Avital (2017). "Real-time
  physical model of an Aeolian harp." *Proc. 24th Int. Congress on Sound
  and Vibration (ICSV24)*, London. doi:10.25144/24498 (the publisher's
  landing page was offline when checked). Aeolian-harp model from
  semi-empirical fluid-dynamics equations with a wind model, evaluated in
  a listening test.
- R. Selfridge, D. Moffat, E. J. Avital & J. D. Reiss (2018). "Creating
  real-time aeroacoustic sound effects using physically informed
  models." *J. Audio Eng. Soc.* 66(7/8), 594–607.
  [doi:10.17743/jaes.2018.0033](https://doi.org/10.17743/jaes.2018.0033).
  A compact-source Aeolian-tone model, used for swords, Aeolian harps and
  propellers.
- [Nemisindo Aeolian Tones](https://nemisindo.com/models/aeolian-tones)
  (Nemisindo): browser procedural-audio model, hybrid: filtered noise at a
  Reynolds-dependent Strouhal frequency and its harmonics, with an
  "Aeolian Harp" preset but no string model or lock-in.
