# Glass Armonica

Benjamin Franklin's armonica (1761): 37 glass bowls nested on a horizontal
spindle that a treadle keeps turning, played by touching the moving rims with
wet fingers. Here every bowl is a thin hemispherical shell with its real
flexural modes. A fingertip, modelled as a skin pad with stick–slip friction,
drives the bowl while the bowl turns underneath it. You can hear things a
sample cannot give you: notes that need a moment to *speak*, a warble whose
rate follows the treadle, bowls that keep ringing and precessing after the
finger lifts, and pitch that slides down as water is poured in.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/glass/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | touch a bowl (it sounds while the key is held); 41 keys, F3–A6 |
| `←` `→` | octave |
| `↑` `↓` | finger pressure |
| `Space` | hold the notes that are down (latch) |
| MIDI | notes and velocity; **aftertouch presses harder**; **mod wheel = treadle speed**; sustain pedal = hold |

## The physics

**The bowls.** Franklin's glasses were blown "as near as possible in the form
of hemispheres", 9 in across for the lowest G and 3 in for the highest, in
quarter-inch steps, with walls "about a tenth of an inch near the brim". He
tuned them by grinding. His letter to Beccaria (1762) is reprinted in the
*Encyclopaedia Britannica*, 3rd ed. (1797), "Armonica". Here each key's
diameter is linear in key number from 9 in (G3) to 3 in (G6), extrapolated to
F3–A6. The wall thickness is solved so that the (2,0) mode is on pitch. It
comes out at 1.75–2.8 mm, mean 2.49 mm, which matches Franklin's tenth of an
inch (2.54 mm) without being fitted to it (tested).

| bowl | Ø | wall | glass | rim speed at 0.5 rev/s | speaks above | free T60 | ε₂ |
|---|---|---|---|---|---|---|---|
| G3 196 Hz | 9.0 in | 2.22 mm | 456 g | 36 cm/s | 0.91 N | 17 s | 0.008 |
| A4 440 Hz | 6.7 in | 2.73 mm | 308 g | 27 cm/s | 0.67 N | 10 s | 0.035 |
| G5 784 Hz | 5.0 in | 2.74 mm | 174 g | 20 cm/s | 0.51 N | 6 s | 0.081 |
| G6 1568 Hz | 3.0 in | 1.97 mm | 45 g | 12 cm/s | 0.30 N | 3 s | 0.14 |

**Rayleigh's shell modes.** A thin shell bends far more easily than it
stretches, so its low modes are *inextensional*. Rayleigh (1881; *Theory of
Sound* §§ 232–235) found the exact inextensional field of a spherical shell.
With θ the polar angle from the neck, φ the azimuth and t = tan(θ/2):

  u = sinθ tⁿ cos nφ,  v = sinθ tⁿ sin nφ,  w = −(n + cosθ) tⁿ cos nφ

(meridional, azimuthal, outward). All three membrane strains vanish, and on a
sphere the bending is a pure twist: κ_θ = −κ_φ = n(n²−1)tⁿ cos nφ/(a² sin²θ).
The tests check both by finite differences. The energy ratio is therefore
exact within thin-shell theory:

  ω_n² = E h² n²(n²−1)² I₁ / (3ρ(1+ν) a⁴ I₂),
  I₁ = ∫ t²ⁿ/sin³θ dθ = ¼[1/(2n−2) + 1/n + 1/(2n+2)],  I₂ = ∫ t²ⁿ[2 sin²θ + (n+cosθ)²] sinθ dθ

(integrals over the hemisphere, 0 … π/2; soda-lime glass, E = 70 GPa,
ρ = 2500 kg/m³, ν = 0.22). The families n = 2, 3, 4, 5, 6 stand in the ratios
**1 : 2.810 : 5.432 : 8.839 : 13.02**. A thin ring (Rayleigh, Hoppe),
f ∝ n(n²−1)/√(n²+1), gives 1 : 2.828 : 5.423 : 8.771 : 12.87. The two agree
to 1 % because the motion is concentrated near the rim (tⁿ), where a
hemisphere looks like a ring. Every family up to 16 kHz is kept, 5 for the
lowest bowls and 4 at the top. At the rim the tangential motion is 1/n of the
radial (v = sin nφ, w = −n cos nφ), and that factor sets the finger's coupling.

**The doublet.** Each n is a degenerate pair (cos nφ, sin nφ). In a real bowl
uneven walls split it. Jundt et al. (2006) measured 4 Hz at 895 Hz in a wine
glass (8 ¢). The *Doublet split* knob (default 12 ¢, typical of hand-blown
glass) sets it for (2,0). Higher families get 60–100 % of it, with a random
orientation ψ_n per bowl. The irregularity is taken as a mass irregularity,
so liquid, which loads all of the wall, dilutes it. Jundt et al. saw the
doublet merge as the glass was filled.

**Rotation: Bryan's effect.** In the bowl's frame the Coriolis force couples
the two members of each doublet:

  q̈_c − 2g q̇_s + ω₁² q_c = Q_c/M,  q̈_s + 2g q̇_c + ω₂² q_s = Q_s/M,  g = nBΩ,

where B = ∫ẑ·(x_c × x_s) / (n ∫|x_c|²) = 2I₃/I₂ is Bryan's factor. For a ring
the same integral gives Bryan's (1890) **2/(n²+1)**, 0.4 for n = 2. For
Rayleigh's hemisphere it gives **0.277**, the value used for hemispherical
resonator gyroscopes, which work on exactly this effect. The vibration pattern
lags the glass: it precesses at −BΩ in the bowl and at **(1 − B)Ω in the room**.
A free bowl turning at Ω rings at ω ± n(1 − B)Ω at a fixed ear. In a test, a
released A4 bowl at 0.5 rev/s beats at 1.45 Hz: 2n(1 − B)f_rot with the
hemisphere's B, where a ring's B would give 1.20 Hz. The engine integrates the
Coriolis term implicitly (a 2×2 solve per doublet per sample), and free
ringing decays at exactly the glass loss rate whether the bowl turns or not
(tested). The spindle's speed follows the treadle through Franklin's flywheel
(an 18-inch wheel with 25 lb of lead). *Treadle unevenness* adds the foot's
push once per turn.

**The finger.** The finger is fixed in the room, and the rim slides under it
at V = Ωa (12–37 cm/s at 0.5 rev/s). The contact has three parts:

* *Friction* follows a Stribeck curve (wet skin on clean glass is a
  boundary-lubricated contact): μ(u) = μd + Δμ/(1 + (u/v₀)²) + βu, with
  μd = 0.3–0.4, v₀ = 0.5 m/s, β = 0.02 s/m. Water softens the stratum
  corneum, and on clean, hydrophilic glass the friction is high and falls
  steeply with slip speed: the "squeaky clean" grab (Adams, Briscoe & Johnson
  2007; Derler & Gerhardt 2012). *Skin moisture* moves Δμ from 0.03 (dry) to
  0.83 (wet). Franklin's advice was the same: wet fingers, no grease, a little
  chalk.
* *A skin pad*: mass 20 mg, shear stiffness 2 N/mm and damping 8 N·s/m, a
  Kelvin–Voigt element between the finger bone and the contact (order of
  magnitude after Wiertlewski & Hayward 2012). It is stiff at low frequency
  and damper-like across the bowls' range.
* *Radial pulp damping* of 6 N·s/m (growing with force as the contact
  spreads), which damps the rim's normal motion under the finger.

Each sample, the rim velocity at the finger and the pad velocity are both
linear in the friction force F (the modal and pad responses to a unit impulse
are known). So the contact sticks if the force needed to hold it is within
μs·N. Otherwise it slips at the speed u that solves u − |s₀| + Y N μ(u) = 0,
found by safeguarded Newton. This is the bowed-string scheme of
`huygens/experiments/bowed-string.js` with a different friction law. A
tangential force drives the pattern with a **tangential antinode, i.e. a
radial node, under the finger** (S). The other member C, with its radial
antinode there, is damped hard by the pulp. That is how the finger locks the
standing wave in place.

**Speaking.** Steady sliding is unstable when the falling friction feeds S
faster than S loses energy. The bowl turns, so the material carries S into C
at the lab-frame rate γ = n(1 − B)Ω, and the finger then kills C. From
ṡ = −σ_S s + γc, ċ = −γs − σ_C c the onset condition is

  σ_neg = σ + γ²/σ_C,  σ_neg = Re[g/(1 − gY_p(ω))]/(2M),  g = N·(−μ′(V)),

with M the modal mass at the rim (0.35 kg for G3, 0.034 kg for G6). This gives
the threshold forces in the table. The engine agrees: on A4 the measured
growth rates at 0.8, 0.95, 1.05 and 1.6 × threshold are −0.26, −0.07, +0.06
and +0.80 s⁻¹, against −0.23, −0.06, +0.06 and +0.70 from the formula. The
*Bryan drain* γ²/σ_C is comparable to the glass's own loss in the bass. Spin
the treadle faster and the big bowls stop speaking (try the *Fast treadle*
preset).

Above threshold the note grows exponentially from the friction noise and the
finger's landing. It takes 0.3–0.6 s to speak at mid velocity and over a
second for a light touch. That is the armonica's famous slow, "breathing"
attack, and the demos have the fingers go down early to allow for it. Once
speaking, the skin **sticks once per cycle** (tested). The rim's tangential
velocity swings by about the rim speed, as a bowed string's does by the bow
speed, so the full level is set more by the treadle than by force. Pressure
sets how fast a note swells and, by pressing less, how fast it fades: in
Franklin's words, tones "may be swelled and softened at pleasure". Press far
harder and N(−μ′) approaches the skin's own damping. The pad itself becomes
unstable and the skin **squeals** in the bowl's (3,0)–(6,0) modes.

*Key regulation.* The thresholds range from 0.25 N (A6) to 0.94 N (F3). Like
a technician regulating a keyboard, each key's finger force is set as a
multiple of its own threshold for a wet finger at the reference speed (the
*Finger pressure* knob, default 6×), then scaled 0.6–1.4× by velocity and up
to 2× by aftertouch. Changing moisture, Stribeck speed or treadle speed moves
the true threshold away from this regulation, which is what makes dry fingers
fall silent.

**Warble.** The S pattern is fixed in the room while the split doublet turns
with the glass. The pattern sees the stiffness of each member in turn, 2n
times per revolution. So the tone wavers by **± half the split at 2n × the
rotation rate**, together with a little amplitude modulation as energy leaks
into C. At 0.5 rev/s with a 16 ¢ split that is ±7.8 ¢ at 1.99 Hz (tested).
The faster the treadle, the faster the warble. Rossing (1994) measured 4–8
beats per second in finger-rubbed wine glasses.

**Water.** Franklin noted that a wet glass sounds flatter. French (1983) and
Jundt et al. (2006) treat liquid in a glass as extra kinetic energy: each
horizontal slice of liquid follows the wall's motion as 2-D potential flow,
with kinetic energy ρ_l π r² ξ²/(2n) per unit height. With Rayleigh's field
(the wall's horizontal motion is ξ = −n sinθ tⁿ) this gives

  f/f₀ = (1 + Λ_n)^(−1/2),  Λ_n = (ρ_l a/ρ_g h) · n J_n(θ_d)/I₂,  J_n = ∫₀^θd sin⁵θ t²ⁿ dθ,

the form of French's ω₀²/ω² = 1 + α(ρ_l a/ρ_g h)(d/H)ⁿ. Shallow water hardly
matters (Λ ∝ d^(n+3), because the mode lives at the rim). An A4 bowl filled a
quarter, half, three-quarters and completely drops 3, 83, 494 and 1250 ¢.
Jundt et al. measured −1340 ¢ for a full wine glass. *Water in the bowls*
lowers every bowl and nothing retunes, so this is a physics demonstration,
not a tuning control. (On Franklin's horizontal spindle water would pool; the
knob is the upright wine-glass experiment applied to every bowl.) Water loads
(2,0) more than (3,0), and nearly full bowls jump to (3,0).

**Radiation and listening.** Each family radiates like the order-n harmonic of
a sphere of the bowl's radius: p·r = ρc a v · ε_n(ka), with
ε_n = 1/(ka|h_n′(ka)|) from the spherical Hankel function. This tends to
(ka)ⁿ⁺¹/((n+1)(2n−1)!!) for a small bowl and 1 for a large one (both limits
tested). A quadrupole the size of a bass bowl is a poor radiator
(ε₂ = 0.008 for G3), so the bass is soft and the faint harmonics and upper
modes are brightened. Two microphones sit 35° and 55° round the rim from the
finger. That is the only source of stereo, apart from the bowls being laid out
along the spindle (low notes on the left). A pattern turning past the two
microphones moves between the speakers. The shell's room reverb adds a little
space.

## What to listen for

`examples/glass/` (regenerate with `node tools/render-glass.mjs`):

1. **Adagio in C, held chords**: a slow phrase over sustained chords in the
   manner of Mozart's armonica pieces (K. 356, K. 617). Fingers go down
   early; released bowls keep ringing under the next harmony.
2. **Treadle slow, then fast**: one G5 at 0.3 rev/s, then at 1.2 rev/s. The
   warble goes from 1.2 Hz to 4.8 Hz. The note is louder too, because the rim
   moves faster.
3. **Perfect bowl, then a split doublet**: A4 with no irregularity (steady,
   ±0.4 ¢), then with a 25 ¢ split (±12 ¢ at 2 Hz).
4. **Finger pressure from silent to squealing**: one C5 while the force rises
   from 0.5× to 30× threshold. First only the whisper of the skin ridges, then
   the bowl grabs and swells, then the skin squeals at 6.8 kHz, in the bowl's
   (6,0) family.
5. **Water poured into a ringing bowl**: G4 is touched, then water is poured
   in while it rings, and the pitch glides from 392 to 334 Hz. Touched again,
   it speaks at the new pitch.
6. **Dry fingers, then wet**: a C-major triad with dry skin (a faint rubbing
   whisper), then wet.
7. **Finger lifted: the free bowl precesses**: A4 and E5 rubbed for 2 s, then
   left to ring. The pattern now turns at (1 − B)Ω and sweeps past the two
   microphones at 1.45 Hz, so the sound swings between the speakers (34 dB of
   L/R swing). Listen in stereo.

On the page, the bowl view shows the rim's motion in slow motion, hugely
exaggerated. You can see the radial node held under the finger, the glass's
tick marks turning past it, and the pattern starting to drift when you let
go. The contact trace shows the stick–slip cycle. The zoomed spectrum shows
the doublet and the lines of the free, spinning bowl.

## Files

```
glass/index.html, style.css          page
glass/src/glass-model.js             shell modes, Bryan factor, water loading, radiation, friction, threshold (no audio, no DOM)
glass/src/glass-engine.js            real-time engine (AudioWorklet and Node)
glass/src/glass-params.js            parameters and presets
glass/src/glass-main.js              page wiring and views
test/glass-tests.mjs                 node test/glass-tests.mjs  (22 tests, ~8 s)
tools/render-glass.mjs               node tools/render-glass.mjs → examples/glass/
```

Ten bowls rubbed at once render at about 8 % of real time in Node.

## Simplifications

* **Perfect hemispheres.** Real armonica bowls are cup-shaped and thicker
  toward the neck. The shape changes the overtone ratios a little (the ring
  and hemisphere differ by ≤ 1 %), but the neck is clamped where Rayleigh's
  modes hardly move. Diameter is linear in key, and Franklin's repeated sizes
  of different thickness are smoothed over.
* **The friction curve and skin values are order-of-magnitude choices.** Wet
  skin on glass at 0.1–0.4 m/s is not well measured. The Stribeck shape is
  standard, and the numbers were chosen within plausible ranges so that a
  speaking window exists across three octaves. The threshold and the
  stick–slip mechanics follow from the model; the exact forces do not come
  from measurement.
* **Key regulation** (force as a multiple of each bowl's threshold) is a
  design choice. A player's finger does it by feel.
* **Point contact.** The finger is one point on the rim. A real fingertip
  touches about a centimetre of rim, which damps the S pattern a little too.
  Normal-force fluctuations from the rim's axial motion are ignored.
* **Loudness is set by rim speed.** Above threshold, more force mostly means a
  faster swell and a brighter, then squealing, tone, not a much louder steady
  one.
* **Radiation** uses a sphere, not an open, nested bowl, which would cancel
  even more of the bass (inside and outside radiate in antiphase). The
  microphones see each family's rim motion, with no room modes beyond the
  shared reverb.
* **Water** uses French's 2-D slice flow with no free-surface or sloshing
  modes, and is applied to bowls that in reality hang on their side.
* **Treadle** speed variation is a once-per-turn sinusoid smoothed by a
  first-order flywheel.

Sources: Franklin to Beccaria, 13 July 1762; Lord Rayleigh, *Proc. London
Math. Soc.* 13, 4 (1881) and *The Theory of Sound* (1894); G. H. Bryan, *Proc.
Camb. Phil. Soc.* 7, 101 (1890); A. P. French, *Am. J. Phys.* 51, 688 (1983);
T. D. Rossing, *J. Acoust. Soc. Am.* 95, 1106 (1994); G. Jundt et al.,
*J. Acoust. Soc. Am.* 119, 3793 (2006); B. Armstrong-Hélouvry et al.,
*Automatica* 30, 1083 (1994); M. J. Adams, B. J. Briscoe, S. A. Johnson,
*Tribol. Lett.* 26, 239 (2007); S. Derler, L.-C. Gerhardt, *Tribol. Lett.* 45,
1 (2012); M. Wiertlewski, V. Hayward, *J. Biomech.* 45, 1869 (2012).
