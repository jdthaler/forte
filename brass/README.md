# Brass

A trombone, a trumpet and a flugelhorn, sounding from their physics. A
player's lips, a mass on a spring, are blown apart by the breath and pulled
shut again, letting a puff of air into the mouthpiece once a period; the
pressure waves it starts run down the bore, reflect from the bell and come
back in time to push the lips open again. Nothing is sampled. Along the
long, narrow tubing a loud wave's crests travel faster than its troughs, so
at fortissimo the wave steepens into a **shock** before it reaches the bell:
the blare of a loud trombone is made in the air inside it (Hirschberg and
colleagues photographed the shocks in 1996). You hear soft notes stay round
and loud ones turn brassy, which a louder sample of a soft note cannot do;
the flugelhorn's widening cone stay mellow where the trumpet's cylinder
blazes; the plunger's wah; and every note pitched by a player's ear moving
the slide and the lips onto it.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/brass/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (all 88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the computer keys blow |
| `Space` | hold: keys stay down while it is held (a horn has no dampers: a note lasts as long as the breath) |
| MIDI | notes, velocity (breath), hold pedal (CC64); **mod wheel = the plunger**; key pressure blows up to half as hard again; pitch bend and MPE move the slide and the lips with it (±12 semitones per key, CC74 each key's own plunger) |

## The physics

### 1. The horns

Each horn is a chain of cylinders from the mouthpiece's throat to the bell,
drawn from its maker's dimensions (size 1, slide in, valves up):

| | trombone | trumpet | flugelhorn |
|---|---|---|---|
| mouthpiece cup | 1.6 cm³, throat Ø 6.8 mm | 0.45 cm³, Ø 3.6 mm | 0.80 cm³, Ø 4.2 mm |
| backbore, leadpipe | 75 mm, 27 cm | 65 mm, 24 cm | 60 mm, 10 cm |
| cylinder (slide or valves) | 1.35 m, Ø 12.7 mm | 0.50 m, Ø 11.65 mm | 0.35 m, Ø 10.9 mm |
| bell taper (cone) | 0.62 m to Ø 20 mm | 0.30 m to Ø 16 mm | 0.70 m to Ø 34 mm |
| flare | 0.48 m, γ = 0.70, bell Ø 216 mm | 0.32 m, γ = 0.75, Ø 123 mm | 0.30 m, γ = 0.60, Ø 152 mm |
| in B♭, partials | 2–8 | 2–9 | 2–8 |

The flare is a Bessel horn, r ∝ (x₀ + L − x)^(−γ), cut to meet the cone. The
trombone and trumpet are mostly cylinder; the flugelhorn mostly cone. Each
cylinder is trimmed so that the fourth partial, slide in, is the horn's B♭
on its own digital bore (B♭3 for the trombone, B♭4 for the others).

**Bell size** draws the mouth wider or narrower and redraws the flare to
meet it.

### 2. Waves along the bore

The bore is a Kelly–Lochbaum lattice: every cylinder a pair of delay lines,
the wave going out (p⁺) and the wave coming back (p⁻), and at each change of
cross-section a scattering junction (one multiply: w = κ(a⁺ − b⁻), κ the
difference of the two admittances over their sum). The cone and the flare
are staircases of short cylinders (the flare in steps of 22 % in radius,
merged until each is at least a sample long); the long cylinders run at
fractional delays (Lagrange, third order), the short ones a whole number of
samples.

The walls take energy from the waves (viscous and thermal boundary layers):
α = LOSS √f / a nepers per metre, LOSS = 3 × 10⁻⁵ (Benade's value for air in
a smooth tube, with its √f). Each long segment has a one-pole lowpass
matched to e^(−LOSS √f Λ), Λ = Σ l/a over it and the short segments before
it, at 100 Hz and 4 kHz.

At the bell the wave radiates: R(s) = −1/(1 + sτ), τ = 1.22 a/c, the low
frequency limit of an open end (Levine and Schwinger), as a bilinear
filter. What leaves is the volume flow U = Y (p⁺ − p⁻), and the sound a
metre away is that of a monopole: p = ρ/4π · dU/dt.

### 3. Steepening into shocks

A loud wave is not quite linear. Where its pressure is p, the air is
compressed and carried along with it, so the wave travels at
c (1 + β p / ρc²), β = (γ + 1)/2 = 1.2 for air. Over a distance x a crest
gains on a trough, and a sine of amplitude p and angular frequency ω turns
into a shock after x_s = ρc³ / (β ω p): 6.4 m for 2 kPa at 500 Hz. A
fortissimo trombone has 10–20 kPa in its mouthpiece, with fronts much
steeper than a sine's, so its 2.7 m are enough (Hirschberg et al. 1996).

Each long, narrow segment (the leadpipe and the cylinder, within 1.25 of the
cylinder's radius) reads its outgoing wave out of its delay line where its
own pressure carried it: at D (1 − k p), k = β · **air nonlinearity** /
ρc². Since p is the sample being read, the read solves itself, by fixed
point iteration from the last two samples' extrapolation (two steps at
High). The returning wave, stripped of its treble by the bell and much
weaker, and the cone and flare, where the wave spreads out, run linear. The
walls' losses round off the shock's front, so it stays finite.

### 4. The lips

The lips are one mass on a spring, an outward-striking valve (blown open
by the mouth's pressure, Helmholtz's "swinging door"):

m ÿ = −k (y − H₀) − r ẏ + S (p_m − p_c)

with m the lips' moving mass, k = m ω_l², r = m ω_l / Q (**Lip damping**),
S the area the pressure pushes on, H₀ their rest opening. Pressed shut (y <
0) the lips are five times stiffer. The trombone's lips tuned to B♭2 are
120 mg over 0.3 cm², 14 mm wide; the trumpet's at B♭3 50 mg, 0.16 cm², 10 mm. They scale
with the note, m ∝ (f_ref/f)^1.2, and with the horn when it is built bigger
or smaller (by similarity: mass s³, area s², width s). The player tunes
them 650 ¢ below the note up to the fourth partial (500 ¢ on the third,
less higher up, where the partials crowd together); **Lip tension** moves
them from there.

The flow through the opening is Bernoulli's, U = w h √(2 Δp/ρ) (w the
width, h = max(0, y)), plus the air the lips sweep, S ẏ; the cup is a volume
V of air, C = V/ρc², fed by the flow and draining into the bore. Together
they make a quadratic in √Δp, solved in closed form each sample (backward
Euler on the cup), so the lips, the cup and the bore's first wave all
agree. The lips move by symplectic Euler.

The breath, p_m = **Breath** × 450 Pa × 12^(v^1.3) × (f/261.6 Hz)^0.35, is
about 0.5 kPa at pianissimo and 5.5 kPa at fortissimo at C4, more for high
notes, as players blow (Fletcher and Tarnopolsky measured trumpeters'
blowing pressures rising from a few kilopascals, soft and low, to tens of
kilopascals, loud and high). The tongue lets it go over **Tonguing** (a raised
cosine), it follows the velocity and key pressure over 30 ms, and released,
it stops over 30 ms.

### 5. The player

For each key the player picks the horn they have and the partial with the
shortest slide (or fewest valves): the cost is |octave| × 10 + the slide's
length over the horn's + 0.01 × the partial, among slides from just in to
42 % out (six semitones). Past the horn's compass (trombone E2–C5, trumpet
F♯3–C6, flugelhorn E3–G5) the same horn is built twice as big or small, by
octaves, every part in proportion, and the lips with it, playing only its
middle partials (third to sixth), where it speaks surely: the keyboard's
bottom A0 is a trombone eight times the size, its top C8 one a sixteenth of
it.

The slide is set on the digital bore itself: its input impedance, computed
in the z-domain from the same lattice, losses and taps that the engine
runs, has its peak moved onto the note by Newton's method on the slide. The
partials of the trombone, slide in, sit within 15 ¢ of a harmonic series on
B♭1 from the fourth up and about 60–80 ¢ flat on the second and third, as on
real trombones. The position shown is the one a player names (C3 sixth, C4
third).

Lips play a little above the bore's peak, so the note needs an ear: the
player listens to the lips' period (upward crossings of their mean, a
Schmitt trigger on their smoothed motion) and pulls the slide out (or in)
and loosens (or tightens) the lips together, quickly while the note speaks
and gently after, until it is in tune. If it has cracked onto a
neighbouring partial, the player tightens or loosens the lips until it
jumps. What the ear learned for a key is kept for its next press.

Oversampling: the horns built a quarter of the size or smaller run at 2, 4
or 8 times the rate, so their shortest pieces stay a sample long.

### 6. The plunger

The plunger over the bell is an orifice one sample long, of the mouth's
area × (1 − 0.97 × **Plunger**): it reflects the treble back into the horn
instead of letting it out. The mod wheel and each key's MPE slide move it.

### 7. Level

The radiated pressure at 1 m is scaled by 0.035 to the output, then by a
voicer's regulation: each key of each horn played at the defaults,
mezzo-forte, measured once it has spoken, and given the gain that brings it
to the same level as every other (`tools/brass-levels.mjs`, the median of
each key and its neighbours, `brass-levels.h`). A horn's second partial is
weak and its horns built smaller radiate less; the regulation evens that
out, as an organ builder does, and leaves each note's own dynamics alone.

## What to listen for

`examples/brass/`:

1. **`01-trombone-soft-and-loud`**: the same phrase pianissimo, then
   fortissimo. The loud one is not only louder: its treble has come up
   (the spectral centroid of F3 doubles from 7 to 15 harmonics).
2. **`02-fortissimo-with-and-without-shocks`**: a fortissimo phrase, then
   again with the air's nonlinearity off. Without it the loud notes are
   loud but round.
3. **`03-trumpet-and-flugelhorn`**: the same loud phrase on the trumpet,
   then the flugelhorn: the cone stays mellow.
4. **`04-plunger-wah`**: a held trombone note, the plunger opening and
   closing.

On the page, **Inside the horn** draws the waves along the bore: play F3
softly, then hard, and watch the outgoing wave's fronts sharpen in the
shaded tubes. **Mouthpiece and bell** puts the mouthpiece's pressure and
the wave arriving at the bell side by side.

## Files

```
brass/index.html, style.css          page
brass/src/brass-params.js            parameters and presets
brass/src/brass-instrument.js        the descriptor: everything but the page
brass/src/brass-main.js              page wiring and views
brass/src/brass-tour.js              the guided tour
brass/src/brass-wasm.js, brass/wasm/brass.wasm   the engine and model, built from the C++
native/instruments/brass/            the physics in C++: model and engine (plugins and WebAssembly)
test/brass-tests.mjs                 node test/brass-tests.mjs
tools/render-brass.mjs               node tools/render-brass.mjs → examples/brass/
tools/brass-levels.mjs               the regulation: node tools/brass-levels.mjs → brass-levels.h (--check)
```

## Simplifications

- **Plane waves.** The bore is a staircase of cylinders carrying plane
  waves; in the flare, where real wavefronts curve, that puts the
  partials a little out (the slide is tuned on the staircase, so the notes
  are in tune all the same).
- **The walls' losses** are a one-pole filter per long segment, exact at
  100 Hz and 4 kHz; between, it takes about half the loss of e^(−α√f), and
  above 4 kHz up to twice it. The losses of the short pieces of the flare
  are lumped into the last long segment's.
- **Steepening** acts on the outgoing wave in the leadpipe and the cylinder
  only: the cone, the flare and the returning wave are linear. A real
  shock's front is set by the air's viscosity and the walls; here by the
  walls' filter and the sample rate.
- **The lips** are one mass on a spring moving in one direction, without
  the second mode and the sideways motion of real lips, or the vocal
  tract's resonances. Their tuning per horn is set by ear to speak cleanly;
  the trumpet's and flugelhorn's top notes (weak peaks, as on the real
  instruments) can wander by 20–30 ¢ around the note.
- **The valves** are an extension of the cylinder, not their own loops of
  tubing with their bends; the slide is the same cylinder lengthened.
- **The radiation** is the low-frequency limit of an unflanged pipe, and
  the sound a point source at the bell: no directivity, and the bell's own
  vibration is left out.

## Quality

Medium and Low let fewer keys sound at once: 8 at Medium and 5 at Low
against 12, the quietest released key fading first, and they solve the
steepening in one step instead of two (the shock is a little softer at
fortissimo). The horns and the lips are the same at every level.

## Prior art and references

**The instruments.**
- A. Baines (1976). *Brass Instruments: Their History and Development.*
  Faber & Faber, London.

**The physics.**
- A. Hirschberg, J. Gilbert, R. Msallam & A. P. J. Wijnands (1996). "Shock
  waves in trombones." *J. Acoust. Soc. Am.* 99(3), 1754–1758.
  [doi:10.1121/1.414698](https://doi.org/10.1121/1.414698).
- R. Msallam, S. Dequidt, R. Caussé & S. Tassart (2000). "Physical model of
  the trombone including nonlinear effects. Application to the sound
  synthesis of loud tones." *Acta Acustica united with Acustica* 86(4),
  725–736.
- A. Myers, R. W. Pyle, J. Gilbert, D. M. Campbell, J. P. Chick & S. Logie
  (2012). "Effects of nonlinear sound propagation on the characteristic
  timbres of brass instruments." *J. Acoust. Soc. Am.* 131(1), 678–688.
  [doi:10.1121/1.3651093](https://doi.org/10.1121/1.3651093).
- E. Fubini (1935). "Anomalie nella propagazione di onde acustiche di grande
  ampiezza." *Alta Frequenza* 4, 530–581; and D. T. Blackstock (1966).
  "Connection between the Fay and Fubini solutions for plane sound waves of
  finite amplitude." *J. Acoust. Soc. Am.* 39(6), 1019–1026.
  [doi:10.1121/1.1909986](https://doi.org/10.1121/1.1909986).
- S. Adachi & M. Sato (1996). "Trumpet sound simulation using a
  two-dimensional lip vibration model." *J. Acoust. Soc. Am.* 99(2),
  1200–1209. [doi:10.1121/1.414601](https://doi.org/10.1121/1.414601).
- S. J. Elliott & J. M. Bowsher (1982). "Regeneration in brass wind
  instruments." *J. Sound Vib.* 83(2), 181–217.
  [doi:10.1016/S0022-460X(82)80086-5](https://doi.org/10.1016/S0022-460X(82)80086-5).
- N. H. Fletcher & A. Tarnopolsky (1999). "Blowing pressure, power, and
  spectrum in trumpet playing." *J. Acoust. Soc. Am.* 105(2), 874–881.
  [doi:10.1121/1.426276](https://doi.org/10.1121/1.426276).
- A. H. Benade (1976). *Fundamentals of Musical Acoustics.* Oxford
  University Press. The walls' losses, and the bell and mouthpiece pulling
  the partials into a harmonic series.
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical
  Instruments*, 2nd ed., chapters 8 and 14. Springer.
- H. Levine & J. Schwinger (1948). "On the radiation of sound from an
  unflanged circular pipe." *Phys. Rev.* 73(4), 383–406.
  [doi:10.1103/PhysRev.73.383](https://doi.org/10.1103/PhysRev.73.383).
- J. L. Kelly & C. C. Lochbaum (1962). "Speech synthesis." *Proc. 4th Int.
  Congr. Acoustics*, Copenhagen, paper G42.

**Earlier models and syntheses.**
- S. Bilbao (2009). *Numerical Sound Synthesis.* Wiley. Time-domain
  models of acoustic tubes and their excitation.
- [Yamaha VL1](https://en.wikipedia.org/wiki/Yamaha_VL1) (Yamaha, 1994):
  waveguide brass and winds with a lip or reed model, played from a breath
  controller.
