# Singing Dunes

In a few deserts, sand sliding down the steep lee face of a dune **booms**: a
loud, low note between about 60 and 110 Hz, with harmonics, that can go on
for minutes and be heard kilometres away. It has been likened to a
low-flying propeller plane, a drum roll and a cello's open string. Here each
key sends an avalanche down a dune's slip face, and the avalanche sings.
How dunes sing is still argued over, so the instrument plays both of the
leading accounts. In the first (Douady, Andreotti and their colleagues),
the note is set by the **size of the grains**: sheared grains pass over one
another at a rate set by their size, and above a threshold speed the
avalanche's own shaking pulls them into step, a case of the synchronisation
Kuramoto described. In the second (Vriend, Hunt and their colleagues), the
grains rattle at random and a **buried layer** of the dune, dry loose sand
over firmer sand, rings as a waveguide at its depth's note. What you can
hear: a song that needs the sand to run fast enough before it starts, finds
its step slowly near the threshold and breaks up as the avalanche stops;
well-sorted sand singing where poorly sorted sand only roars; a damp dune
falling silent; and the same avalanche heard through either theory.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/dunes/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8; `Z` is C2, among the notes real dunes sing); an avalanche runs while its key is held, and comes to rest after |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | hold the keys that are down (their avalanches keep running) |
| MIDI | notes and velocity (the avalanche's speed); **mod wheel and aftertouch push more sand** down the face; sustain pedal = hold. No pitch bend: the grains set the note |
| MPE | no note bends; **slide pushes one key's avalanche** on its own, and a note's pressure does the same |

## The avalanche

A dune's slip face stands at sand's angle of repose, about 32°. Sand piles
up at its top until it slips, and a layer some centimetres deep runs down
the face over the sand that stays put. Here a key starts an avalanche whose
speed U is the **Avalanche speed** times the square of the key's velocity
(the sand runs up to it in about a tenth of a second); **Push** (the mod
wheel, aftertouch or MPE slide) runs it up toward the full speed whatever
the velocity. People sliding down Dumont Dunes, California, on their seats
ran avalanches at 1 to 2 m/s (Vriend et al. 2007). The avalanche runs in
surges, so its speed wanders by about 8 % over a third of a second. Once
the key is up, friction slows it at a constant rate to rest in the
**Stopping time**. The grains also hiss as they slide: a rustle of random
knocks, band-passed between 0.9 and 6 kHz, as loud as the sum of U^1.5 over
the avalanches running (**Sliding hiss**).

## The grains' theory: the note is the shear rate

Bagnold (1966) proposed, and Douady and colleagues (2006) measured, that
the note of a singing avalanche is the rate at which the sheared grains pass
over one another, set by the grain diameter d and gravity alone:

  f = 0.4 √(g / d)

| dune | grains | f predicted | f sung |
|---|---|---|---|
| Ghord Lahmar, Tarfaya, Morocco | 160 µm | 100 Hz | 105 ± 10 Hz |
| Mar de Dunas, Copiapó, Chile | 210 µm | 87 Hz | 90 ± 10 Hz |
| Cerro Bramador, Copiapó, Chile | 270 µm | 77 Hz | 75 ± 10 Hz |
| Sand Mountain, Nevada | 340 µm | 68 Hz | 63 ± 5 Hz |

(Douady et al. 2006, Table I.) So each key here is a sand: its grains are
d = g (0.4 / f)², 163 µm on G2 and 367 µm on C2. Real dunes sing between
about C2 and A♭2, the computer keys' lower row. Lower keys are coarser,
past very coarse sand into granules at A0 (2.1 mm); higher keys are finer,
past very fine sand (from about C3) into silt and, at the top, clay-sized
grains, where no dune is known to sing: the law is carried on to make a
keyboard. The **What sets the pitch** view draws the law with the four dunes
and the sand classes (Wentworth 1922).

**Falling into step.** Each push of one sheared grain layer over the next
is a small knock on the layer beneath, and random knocks only rumble. Douady
and colleagues found a threshold speed, 0.23 m/s on the dune at Tarfaya,
below which no avalanche sang, and argued that the flowing layer itself
resonates and pulls the grains into step; Andreotti (2004) described the
song as the grains' motion locking to a wave on the surface. Here the
avalanche is 24 patches of grains, each a phase oscillator θ_j with its own
natural frequency, all nudged by the layer's vibration Z̃, a broad resonance
(Q 2) at the note fed by their mean field e^{iθ}:

  dθ_j/dt = ω_j + K Im(Z̃ e^{−iθ_j}) + noise

which at resonance is **Kuramoto's model**, dθ_j/dt = ω_j + K R sin(ψ − θ_j),
R e^{iψ} the patches' mean (Kuramoto 1975). Its result: a population whose
natural frequencies spread with density g(ω) stays scattered (R ≈ 1/√N, a
rumble) until the coupling passes K_c = 2 / (π g(0)), then gathers into a
bunch that pushes together (R near 1, a song). With phase noise D widening
each patch's line, the threshold is K_c = 2 / ∫ g(ν) D / (D² + ν²) dν
(Strogatz and Mirollo 1991). The patches' frequencies are the quantiles of a
Gaussian, so their mean is the note. The coupling grows in proportion to the
avalanche's speed, pinned so that the default sand starts to sing at
Douady's 0.23 m/s; above that, R grows the faster the further past K_c the
coupling is, so a slide just past the threshold finds its step over a
second or more, and a fast one at once. The **Grains in step** view shows the
patches round a circle by their phase, and the **Threshold** view R and the
coupling over its threshold as the avalanche runs and stops.

**Sorting.** Geologists measure how much a sand's grain sizes spread by
Folk and Ward's (1957) σ in φ, log₂ units of size: under 0.35 φ is very well
sorted, over 1 φ poorly sorted. Since f ∝ d^(−1/2), a spread σφ of grain
size is a spread σφ ln 2 / 2 of the patches' frequencies (±10 % at the
default 0.3 φ), so K_c, and the speed the sand needs, grows with it: 0.44
m/s at 0.6 φ, 0.87 m/s at 1.2 φ. Singing sands are very well sorted;
Dagois-Bohy, Courrech du Pont and Douady (2012) found polydisperse sands
gave broad, noisy spectra, and sieving them made them sing.

**Water.** Booming dunes fall silent after rain (Vriend et al. 2007, citing
Lewis and Haff). Here water cuts the coupling by e for every 0.15 % of
water by weight: our choice of scale, since we found no measurement of how
fast the song fades with moisture. It quietens the hiss in the same way.

**The collisions.** Each patch's push is a Gaussian pulse in phase whose
full width at half height is the **Collision length**, a share of the cycle:
its harmonic n goes as exp(−n²w²/2). Long pushes (45 %) are nearly a sine,
a pure hum; short ones (12 %) are knocks, rich in harmonics, closer to the
propeller plane. The pulse is band-limited (up to 32 harmonics, fewer on
higher keys).

**Where you hear it from.** The patches lie across the face, the even ones
heard more on the left, the odd ones more on the right: a scattered
avalanche sounds wide, and a song in step, every patch pushing together,
sits in the middle.

## The layer's theory: the note is the dune's depth

Vriend, Hunt, Clayton and their colleagues (2007; Hunt and Vriend 2010)
measured, with seismic refraction at Dumont Dunes, a dry, loose surface
layer about 1.5 m deep in which sound runs slowly (c₁ 180 to 340 m/s) over
firmer sand where it runs faster (c₂ 300 to 450 m/s). They found that the
booming frequency did not follow the grain size there and changed with the
seasons as the layer did, and modelled the layer as a waveguide whose modes
ring at

  f_n = n c₁ / (2 H √(1 − c₁² / c₂²))

With **Theory** on the layer, each key is a layer of depth H with this first
mode at the note, with Dumont's c₁ = 180 m/s over c₂ = 300 m/s
(August–September 2006): 1.37 m for 82 Hz, inside the 1.2 ± 0.3 m they
measured. The avalanche's grains rattle at random, a white source as loud
as its speed, and the layer's first eight modes ring with it, mode n
excited as 1/n, each a two-pole resonance whose energy leaks away through
the layer's floor in **Layer Q**/π cycles. There is no threshold: a slow
slide rings the same note, more quietly. The views draw the layer and its
depth against the note.

**Still argued over.** Andreotti, Bonneau and Clément replied that Vriend's
data show no link to the layer's resonance and that the song comes from
waves along the surface instead (a comment on Vriend et al.,
[arXiv:0710.1815](https://arxiv.org/abs/0710.1815)), and
Dagois-Bohy and colleagues (2012) made avalanches sing on a hard plate in
the lab, with no dune under them at all, at the grains' note. Andreotti and
Bonneau (2009) proposed that both are parts of one mechanism: the friction
in the thin shear band under the avalanche makes elastic waves guided along
the surface grow exponentially, a linear instability whose fastest modes
beat and waver. This instrument doesn't model that synthesis: it plays the
two accounts side by side.

## What to listen for

- **The threshold.** A soft key (velocity under about 0.5) only rumbles and
  hisses; a harder one sings. Just past the threshold the song takes a
  second or two to gather, and comes and goes as the avalanche surges.
- **The stop.** Let a key go: the song holds as the sand slows, then breaks
  up into a rumble as the coupling falls below the threshold, then stops.
- **Push.** Hold a soft key and raise the mod wheel: the rumble gathers
  into a song.
- **Sorting and water.** At 0.6 φ the song is rougher and needs a harder
  key; at 1.2 φ, or with 0.3 % water, it never comes.
- **Collisions.** Short ones buzz; long ones hum.
- **The other theory.** The same keys through the layer: no threshold, a
  steadier, breathier tone, and lines as wide as the layer leaks.

The demos in `examples/dunes/` take these one at a time.

## Files

```
dunes/index.html, style.css          page
dunes/src/dunes-params.js            parameters and presets
dunes/src/dunes-instrument.js        the descriptor: everything but the page
dunes/src/dunes-main.js              page wiring and views
dunes/src/dunes-tour.js              the guided tour
dunes/src/dunes-wasm.js, dunes/wasm/dunes.wasm   the engine and model, built from the C++
native/instruments/dunes/            the physics in C++: model and engine (plugins and WebAssembly)
test/dunes-tests.mjs                 node test/dunes-tests.mjs
tools/render-dunes.mjs               node tools/render-dunes.mjs → examples/dunes/
```

## Simplifications

- **24 patches stand for the avalanche's grains.** A real avalanche has
  millions of grains in thousands of patches, so it scatters more evenly
  below the threshold and gathers more completely above it. With 24, a
  scattered avalanche still has a faint, wandering pitch, and the bunch's
  edge wavers.
- **The coupling's size is pinned, not derived.** Douady's threshold fixes
  where the default sand starts; nothing here derives the coupling from the
  flowing layer's depth and wave speed, as Douady and Andreotti sketch it.
  Its growth in proportion to the speed is our choice.
- **The frequency is not set by the speed.** In the grains' theory the note
  doesn't depend on how fast the sand runs; Vriend's team heard 83 Hz at 1
  m/s and 87 Hz at 2 m/s, a small change not modelled.
- **The layer is the same for every key's depth**, c₁ and c₂ fixed, its
  modes exact harmonics. A real layer's modes are dispersive, and its
  booming phase speed changed down the face (Vriend et al. 2007).
- **One face, heard from in front.** No distance, wind or the dune's own
  radiation pattern; the room and venue are Forte's.
- **The water's effect is a scale we chose** (above).

## Quality

High plays 24 patches per avalanche, eight layer modes and up to 24
avalanches at once. Medium plays 14 patches, four layer modes and 12
avalanches; Low plays 8 patches, two layer modes and 6 avalanches, the
oldest coming to rest in 20 ms when another starts. Fewer patches leave a
song's note and level where they were but make the threshold rougher: a
scattered avalanche is less even, and a song's bunch a little looser.

## Prior art and references

**The phenomenon.** Booming sand was reported for centuries before it was
studied: Marco Polo's account of the Lop desert's spirits, and Charles
Darwin's *Voyage of the Beagle* (1839), where people near Copiapó told him of
"El Bramador", "the roarer or bellower", a sand hill that sounded "only when
people, by ascending it, put the sand in motion". Sholtz, Bretz and Nori
reviewed the reports and theories: P. Sholtz, M. Bretz and F. Nori (1997),
"Sound-producing sand avalanches", *Contemporary Physics* 38(5), 329–342
([the authors' page](https://public.websites.umich.edu/~nori/booming_sand.html)).

**The physics.**
- R. A. Bagnold (1966). "The shearing and dilatation of dry sand and the
  'singing' mechanism." *Proc. R. Soc. Lond. A* 295, 219–232.
  [doi:10.1098/rspa.1966.0236](https://doi.org/10.1098/rspa.1966.0236)
- B. Andreotti (2004). "The song of dunes as a wave-particle mode locking."
  *Phys. Rev. Lett.* 93, 238001.
  [doi:10.1103/PhysRevLett.93.238001](https://doi.org/10.1103/PhysRevLett.93.238001)
- S. Douady, A. Manning, P. Hersen, H. Elbelrhiti, S. Protière, A. Daerr and
  B. Kabbachi (2006). "Song of the dunes as a self-synchronized instrument."
  *Phys. Rev. Lett.* 97, 018002.
  [doi:10.1103/PhysRevLett.97.018002](https://doi.org/10.1103/PhysRevLett.97.018002)
  ([arXiv:nlin/0412047](https://arxiv.org/abs/nlin/0412047)): the shear law,
  the four dunes and the threshold speed.
- N. M. Vriend, M. L. Hunt, R. W. Clayton, C. E. Brennen, K. S. Brantley and
  A. Ruiz-Angulo (2007). "Solving the mystery of booming sand dunes."
  *Geophys. Res. Lett.* 34, L16306.
  [doi:10.1029/2007GL030276](https://doi.org/10.1029/2007GL030276): the
  layer, its wave speeds and the waveguide.
- M. L. Hunt and N. M. Vriend (2010). "Booming sand dunes." *Annu. Rev.
  Earth Planet. Sci.* 38, 281–301.
  [doi:10.1146/annurev-earth-040809-152336](https://doi.org/10.1146/annurev-earth-040809-152336)
- B. Andreotti and L. Bonneau (2009). "Booming dune instability." *Phys. Rev.
  Lett.* 103, 238001.
  [doi:10.1103/PhysRevLett.103.238001](https://doi.org/10.1103/PhysRevLett.103.238001)
- S. Dagois-Bohy, S. Courrech du Pont and S. Douady (2012). "Singing-sand
  avalanches without dunes." *Geophys. Res. Lett.* 39.
  [doi:10.1029/2012GL052540](https://doi.org/10.1029/2012GL052540): sorting,
  sieving, and song on a hard plate.
- Y. Kuramoto (1975). "Self-entrainment of a population of coupled
  non-linear oscillators." *Lecture Notes in Physics* 39, 420–422.
  [doi:10.1007/BFb0013365](https://doi.org/10.1007/BFb0013365)
- S. H. Strogatz and R. E. Mirollo (1991). "Stability of incoherence in a
  population of coupled oscillators." *J. Stat. Phys.* 63, 613–635.
  [doi:10.1007/BF01029202](https://doi.org/10.1007/BF01029202): the
  threshold with noise.
- R. L. Folk and W. C. Ward (1957). "Brazos River bar: a study in the
  significance of grain size parameters." *J. Sediment. Petrol.* 27, 3–26
  ([AAPG Datapages](https://archives.datapages.com/data/sepm/journals/v01-32/data/027/027001/0003.htm)):
  sorting in φ.
- C. K. Wentworth (1922). "A scale of grade and class terms for clastic
  sediments." *J. Geol.* 30, 377–392.
  [doi:10.1086/622910](https://doi.org/10.1086/622910): the sand classes.

**Earlier models and syntheses.** We found no earlier physical model of a
booming dune made to be played. Forte's [Huygens Keyboard](../huygens/)
is the same physics of synchronisation in clocks.
