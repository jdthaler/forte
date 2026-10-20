# Whistlers

Lightning as a keyboard. A lightning stroke radiates a crack of very low
frequency (VLF) radio, and some of it leaks up through the ionosphere into
the magnetosphere, where the Earth's magnetic field guides it along a field
line to the other hemisphere. The plasma along the line slows each frequency
by a different amount, so the crack arrives drawn out into a **whistler**: a
pure tone that falls for seconds, first heard on field telephones in the
First World War and explained by Storey in 1953. Every key here is a field
line, the one whose whistler's **nose**, the frequency that arrives first, is
the note: the top of the keyboard lies just outside the plasmasphere, four
Earth radii out on the equator, and the bottom reaches twenty-three. Pressing
a key strikes lightning at that line's foot. The whistler falls from the
note, with a short branch rising above it, and the ionosphere at each end
sends it back for **echoes** that fall ever more slowly. The crack itself,
heard along the ground, rings down into **tweeks**, and held keys sing
**chorus**, the rising tones of hot electrons at dawn. Nothing is sampled:
each frequency's travel time is the cold-plasma group delay integrated along
a dipole field line through Carpenter and Anderson's model of the
plasmasphere, and the tests check it against Eckersley's law, the exact
group index, and the field and densities the model is built from.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/whistlers/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (A0–C8): strike lightning at the foot of that key's field line |
| `←` `→` | octave |
| `↑` `↓` | velocity: the stroke's current, how loud its crack and whistler are |
| `Space` | keep the receivers open, so whistlers and echoes play on after the keys come up |
| MIDI | notes, velocity, sustain pedal (CC64), **mod wheel = chorus**, **aftertouch = more chorus** (channel for every key, polyphonic for its own) |
| Touch | lean on a held key (slide along it, or press harder with an Apple Pencil) = aftertouch: more chorus on that line |

## The physics

### 1. The field line

The Earth's field is taken as a dipole, with IGRF-13's g₁⁰ for 2020,
29 404.8 nT, as the field on the equator at the surface. A field line is
r = L R_E cos²λ, crossing the equator L Earth radii out, and along it the
electron gyrofrequency is

  f_ce(λ) = f_ce,eq √(1 + 3 sin²λ) / cos⁶λ,  f_ce,eq = 823.1 kHz / L³

(27.99 Hz per nT): 12.86 kHz on the equator at L = 4, 1.07 kHz at L = 9.2.
The whistler is followed from the ionosphere's top, 1000 km up, at one foot to
the same height at the other; below it is left out (see Simplifications).

### 2. The plasma

The electron density on the equator is Carpenter and Anderson's (1992) model
after midnight (magnetic local time 02):

* the **plasmasphere**, log₁₀ n = −0.3145 L + 3.9043 per cm³: 450 cm⁻³ at
  L = 4;
* the **plasmapause** (**Plasmapause**, 4.7 by default, Kp 2), across which n
  falls tenfold every 0.1 L;
* the **trough** beyond, 6400 L^−4.5 + (1 − e^−(L−2)/10), about one electron
  per cm³.

Their own fit puts the plasmapause at L = 5.6 − 0.46 Kp, which the control
shows. Along the line, n = n_eq (L R_E / r)^α, with α = 1 in the plasmasphere
and 2.5 in the trough (Denton et al. 2006), passing from one to the other with
the density across the plasmapause. **Plasma density** scales it all.

### 3. Whistler-mode waves

Below the gyrofrequency, a wave travelling along the field in a cold electron
plasma has the refractive index n² = 1 + f_pe² / f (f_ce − f), with
f_pe = 8978.66 √n Hz the plasma frequency. A pulse travels at the group
velocity, c / n_g, with the group index

  n_g = d(nf)/df = n − f_pe² (f_ce − 2f) / 2n f (f_ce − f)²,

used exactly (Storey 1953; Helliwell 1965). A frequency's delay over one hop,
foot to foot, is

  τ(f) = (1/c) ∫ n_g ds,

integrated over the line with 48-point Gauss–Legendre quadrature (the tests
check it against a polyline sum of 20 000 segments). At low frequencies, where
f ≪ f_ce ≪ f_pe, n_g ≈ f_pe / 2√(f f_ce) and τ = D / √f: Eckersley's law
(1935), with D the dispersion. Nearer the gyrofrequency the delay turns: it
is least at the **nose**, f_n ≈ 0.4 f_ce,eq along these lines, and grows again
above it. So a whistler starts at its nose and splits, the lower branch
falling and the upper one rising.

Every key's line is the one whose nose is the key's note: L is found by a
fixed point, L = (x F_CE1 / f)^⅓ with x = f_n / f_ce,eq for the line, and
the nose itself by golden-section search, so a key is in tune to a hundredth
of a cent in any tuning. The nose follows the field, so a key's L does not
change with **Plasma density**; the delay does, by about its square root.

| key | nose | L | n_eq (cm⁻³) | first arrival (one hop) | the note's octave down two |
|---|---|---|---|---|---|
| A0 | 27.5 Hz | 23.2 | 0.9 | 139 s | 209 s |
| A2 | 110 Hz | 14.6 | 0.8 | 20 s | 30 s |
| A4 | 440 Hz | 9.2 | 0.8 | 3.2 s | 4.8 s |
| A6 | 1.76 kHz | 5.7 | 2.8 | 0.91 s | 1.33 s |
| E7 | 2.64 kHz | 5.0 | 4.9 | 0.70 s | 1.01 s |
| C8 | 4.19 kHz | 4.2 | 386 | 2.4 s | 3.5 s |

The top four keys, inside the plasmapause at its default, lie in plasma a
hundred times thicker: their whistlers come later and fall more slowly than
the ones just below.

### 4. Ducts

Whistlers reach the ground mostly along **ducts**, field-aligned tubes of
denser plasma that trap them (Smith 1961). A duct holds a whistler only below
half the equatorial gyrofrequency (Carpenter 1968), so the upper branch stops
there, faded over the last 3 % of f_ce. **Ducts** lays several side by side,
each a step of **Duct spacing** (a share of L) farther out and nearer in, at
random levels: a multi-path whistler, its copies a little higher and earlier
or lower and later, since the nose goes as 1/L³.

### 5. The stroke

A return stroke's current is taken as Bruce and Golde's double exponential,
e^(−t/τ₁) − e^(−t/τ₂), with τ₁ = 50 µs and τ₂ = 5 µs (our choice, typical of
the form), and its radiated field as its derivative. Its spectrum rises as f
to about 3 kHz, is flat to 32 kHz and peaks near 10 kHz, so the bass keys'
whistlers are thinner at their low ends than the top ones'. **Velocity** is
the current.

### 6. From the delays to the sound

Each frequency arrives at τ(f), so the whistler is synthesised by stationary
phase: at time T after the stroke, each branch sounds the frequency whose
delay is T, with the amplitude S(f) / √|dτ/df|, S the stroke's spectrum. At
the nose dτ/df is zero and that amplitude would be infinite; there the two
branches are one Airy function, whose peak, 0.5357 (2/τ_ω″)^⅓, caps them
(half each), and before the nose arrives the tone rises as the Airy function
does, over 1.5 (τ_ω″/2)^⅓. Each branch is a table of 120 frequencies (96 down
five octaves from the nose, the lowest faded out, and 24 up to the duct's
cutoff), and a phase rotator follows it, its frequency gliding linearly
between control steps of 32 samples.

The level is normalised so every key's nose is as loud; what falls is the
spectrum and the spread, so the slow bass whistlers are no louder than the
quick top ones.

### 7. Echoes

At each end the ionosphere reflects part of the whistler back up the line
(**Echoes**). After n hops the delay is n τ(f), so every echo is the same
whistler stretched n times: it starts later, falls more slowly, and is spread
thinner, its stationary-phase level falling as n^−½ and its Airy cap as
n^−⅓. A receiver at the line's other end (**Receiver**) hears hops 1, 3, 5 …,
each pair of reflections taking R² of the level; one near the lightning hears
hops 2, 4, 6 … (two-hop whistlers, as they are heard at mid latitudes).

### 8. When it is heard

The whistler starts at once when the key goes down, its nose as soon as the
Airy rise allows (**Real travel time** off). With it on, the crack comes first
and the whistler when it has travelled: 0.7 s near E7, two minutes at A0.

### 9. The crack and tweeks

The crack travels along the ground in the waveguide between the Earth and the
ionosphere, h km up (**Ionosphere height**, 85 km at night). Its m-th mode
cuts off at f_m = m c / 2h (1.76 kHz at 85 km), and from a stroke d km away
(**Lightning's distance**) the frequency f arrives at t = (d/c) / √(1 −
(f_m/f)²), so each mode is a ping falling onto its cutoff: a **tweek**
(Ohya et al. 2003, Kumar et al. 2009). Near its cutoff a mode bounces between
the ground and the ionosphere f₁ (f_m / f) times a second, keeping 98 % at
each bounce, so the tweek rings and fades. **Sferic** sets the crack's level:
a click, band-limited between 1 and 10 kHz, then up to eight modes.

### 10. Chorus

While a key is held, rising elements sound on its line: chorus, the emission
of hot electrons injected near the equator after a substorm, heard at dawn
(Tsurutani and Smith 1974). Each element sweeps from 0.12–0.3 of the
equatorial gyrofrequency up to 0.47, just under the half where the duct lets
go, over **Chorus element length**; they come at random, **Chorus** a second
(the mod wheel), and key pressure brings more.

### 11. Listening

The receiver is a pair of crossed loop antennas, as VLF receivers are: the
whistler, which arrives circularly polarised, comes out as the same tone in
quadrature, left and right, and the crack from a bearing of 40° off one loop.
Nothing stops a whistler on its way, so letting a key up turns that key's
receiver down instead, over **Release**; the pedal keeps it open.

## What to listen for

The demos in `examples/whistlers/`:

* **A night of whistlers** (default): a slow tune with the pedal down, in
  the middle of the keyboard, on lines eight to twelve Earth radii out.
* **Across the plasmapause**: a scale up the top of the keyboard: quick
  whistlers in the thin trough, then, past the plasmapause, long slow ones in
  the plasmasphere.
* **An echo train**: one whistler and its echoes, each later, slower and
  thinner.
* **Far end, then near the lightning**: one-hop whistlers, then two-hop ones,
  twice as spread out.
* **One duct, then five**: the same note alone, then as a multi-path
  whistler.
* **The crack, then the whistler**: real travel time: the crack and its
  tweeks at once, the whistler when it arrives.
* **Tweeks, near then far**: the crack from 500 km, a click, and from
  7000 km, a long ping onto 1.8 kHz.
* **Dawn chorus**: held chords singing rising elements.

On the page, **The field line** shows the Earth, the key's field line and the
plasmasphere, and the whistler's frequencies travelling along it as packets,
the nose ahead and the low ones falling behind, turning back at each end;
**Dispersion** shows each frequency's arrival against Eckersley's law;
**The plasma** shows the density against L, with the keys at their lines.

## Files

```
whistlers/index.html, style.css            page
whistlers/src/whistlers-params.js          parameters and presets
whistlers/src/whistlers-instrument.js      the descriptor: everything but the page
whistlers/src/whistlers-main.js            page wiring and views
whistlers/src/whistlers-wasm.js            the engine and model, the C++ as WebAssembly (whistlers/wasm/whistlers.wasm)
native/instruments/whistlers/              the physics in C++: model, engine, reference (plugins and WebAssembly)
test/whistlers-tests.mjs                   node test/whistlers-tests.mjs (24 tests, about 2 s)
tools/render-whistlers.mjs                 node tools/render-whistlers.mjs → examples/whistlers/
```

## Simplifications

* **Field lines too far out.** Real whistlers have noses of a few kHz, on
  lines from L = 2 to 6; the keyboard's lower octaves need lines out to
  L = 23, where the real field is no dipole (the magnetopause is about 10 R_E
  out on the day side, and the night side stretches into the tail). The
  model keeps the dipole and the trough's density there.
* Electrons only: no ions, so no lower-hybrid effects (which matter below a
  few hundred Hz on real lines), and a cold plasma, so no Landau damping or
  growth.
* The ionosphere below 1000 km is left out, and so is the crossing from the
  ground into the duct: the whistler starts at the line's foot.
* Propagation is strictly along the field, inside the duct; unducted and
  magnetospherically reflected whistlers are not modelled.
* The echoes' level is relative to the first arrival and lumps together the
  ionosphere's reflection and the duct's losses.
* Chorus elements are not dispersed on their way down, and their sweep is
  linear.
* The stroke's times (50 and 5 µs) and the tweeks' 98 % per bounce are our
  choices; every stroke is the same.
* The tweeks' modes are those of a flat, sharp waveguide over a perfect
  ground.

## Quality

The Quality setting (in the top bar, beside the CPU readout) trims what plays at
once: 16 strokes at Medium and 10 at Low, against 24 at High (the quietest
let-go one fading first); at most 3 ducts at Medium and 2 at Low, against 5;
echoes cut once they are 40 dB down at Medium and 30 dB at Low, against
60 dB; 4 and 2 tweek modes, against 8; and 5 and 3 chorus elements at once,
against 8. A single whistler with one duct sounds the same at every setting.

## Prior art and references

**The discovery**

* H. Barkhausen, "Zwei mit Hilfe der neuen Verstärker entdeckte
  Erscheinungen", *Physikalische Zeitschrift* 20 (1919): falling
  tones on field telephones in the First World War.
* T. L. Eckersley, "Musical atmospherics", *Nature* 135, 104–105 (1935):
  the D/√f law.
* L. R. O. Storey, "An investigation of whistling atmospherics",
  *Phil. Trans. R. Soc. A* 246, 113–141 (1953),
  [doi:10.1098/rsta.1953.0011](https://doi.org/10.1098/rsta.1953.0011):
  lightning's crack dispersed along the field lines, and the plasma beyond
  the ionosphere it implied.

**The physics**

* R. A. Helliwell, *Whistlers and Related Ionospheric Phenomena* (Stanford
  University Press, 1965; Dover, 2006): the dispersion, the nose, ducts,
  echoes and chorus.
* D. L. Carpenter and R. R. Anderson, "An ISEE/whistler model of equatorial
  electron density in the magnetosphere", *J. Geophys. Res.* 97, 1097–1108
  (1992), [doi:10.1029/91JA01548](https://doi.org/10.1029/91JA01548): the
  plasmasphere, the plasmapause and the trough.
* D. L. Carpenter, "Whistler evidence of a 'knee' in the magnetospheric
  ionization density profile", *J. Geophys. Res.* 68, 1675–1682 (1963),
  [doi:10.1029/JZ068i006p01675](https://doi.org/10.1029/JZ068i006p01675):
  the plasmapause, found from whistlers.
* D. L. Carpenter, "Ducted whistler-mode propagation in the magnetosphere; a
  half-gyrofrequency upper intensity cutoff and some associated wave growth
  phenomena", *J. Geophys. Res.* 73, 2919–2928 (1968),
  [doi:10.1029/JA073i009p02919](https://doi.org/10.1029/JA073i009p02919).
* R. L. Smith, "Propagation characteristics of whistlers trapped in
  field-aligned columns of enhanced ionization", *J. Geophys. Res.* 66,
  3699–3707 (1961),
  [doi:10.1029/JZ066i011p03699](https://doi.org/10.1029/JZ066i011p03699):
  ducts.
* R. E. Denton et al., "Distribution of density along magnetospheric field
  lines", *J. Geophys. Res.* 111, A04213 (2006),
  [doi:10.1029/2005JA011414](https://doi.org/10.1029/2005JA011414): the
  power law along the line.
* P. Alken et al., "International Geomagnetic Reference Field: the
  thirteenth generation", *Earth Planets Space* 73, 49 (2021),
  [doi:10.1186/s40623-020-01288-x](https://doi.org/10.1186/s40623-020-01288-x):
  g₁⁰.
* B. T. Tsurutani and E. J. Smith, "Postmidnight chorus: a substorm
  phenomenon", *J. Geophys. Res.* 79, 118–127 (1974),
  [doi:10.1029/JA079i001p00118](https://doi.org/10.1029/JA079i001p00118).
* Tweeks, the waveguide's modes and their cutoffs: H. Ohya et al.,
  *Earth Planets Space* (2003),
  <https://earth-planets-space.springeropen.com/articles/10.1186/BF03352469>;
  S. Kumar et al., *Earth Planets Space* (2009); A. I. Sukhorukov,
  *Ann. Geophys.* 14, 33 (1996).
* C. E. R. Bruce and R. H. Golde, "The lightning discharge", *Journal of
  the Institution of Electrical Engineers*, Part II (December 1941): the
  double-exponential stroke.

**Earlier syntheses and recordings**

* Whistler (Contralogic): a plugin that
  shapes noise with resonant band-pass filters into whistler-like sweeps.
* A Csound whistler made by frequency modulation, a student project at the
  University of Illinois.
* [HamSCI Whistler Catcher](https://hamsci.org/): real VLF recordings, and
  receivers to make them.
