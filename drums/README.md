# Timpani and Tabla

Two drums that have a pitch, which a drum shouldn't. A stretched circular membrane has modes at the
zeros of Bessel functions, 1 : 1.34 : 1.66 : 1.98 … for the (1,1), (2,1), (3,1), (4,1) modes, with no
musical series among them: a bare drumhead clangs. The **timpani** gets its pitch from the air: the
kettle's air and the air above the head ride along with every mode and lower it, the broad, slow
modes most, until the (1,1), (2,1), (3,1), (4,1) modes sit near 2 : 3 : 4 : 5, the 2nd to 5th
harmonics of a note an octave below the principal. The **tabla** gets it from its black *syahi*, a
patch of iron filings, gum and paste laid on the goatskin in layers: its weight pulls nine modes onto
the first five harmonics of the fundamental, as C. V. Raman found in 1934.

Every key is a drum of its own. On timpani it is a copper kettle sized from the key (a 66 cm drum
around D3, its diameter halving every two octaves below that, as a set of timpani is graded, and
every octave above, so its tension stays the drum's own) and tightened until its principal (1,1) mode
sounds the note. The dayan (the tabla's right-hand drum) is a 14 cm head
around C♯4, tuned as players tune it, by its harmonics: its (1,1), the second harmonic, an octave
above the note. The bayan, the big left-hand drum, is a 23 cm head around C3 whose fundamental is the
note, and whose pitch the heel of the hand bends.

## The physics

**The head.** A membrane of areal density σ(r) under tension T, held at its rim (r = a):

    σ(r) ∂²w/∂t² = T ∇²w + p_below − p_above

The model solves it order by order in the angle, w = Φ(r) cos mθ, in a basis of the bare membrane's
modes J_m(j_mi r/a) (eight for each m, m = 0 … 9), keeping four modes of each order: 40 modes, from
(0,1) to (9,4). Mylar (0.19 mm, 262 g/m²) on the timpani; goatskin (about 300 g/m²) on the tabla.

**The air above.** The head is taken to sit in a rigid baffle with a half space of air above it. A
mode pushes the air with its own pattern of wavenumbers k, the Hankel transform of its shape
(φ̃(k) = ∫ Φ(r) J_m(kr) r dr, in closed form for the basis), and the air pushes back with an added mass

    M_ij = ρ ε_m ∫ φ̃_i(k) φ̃_j(k) k dk / √(k² − k₀²),    k₀ = ω / c

where ε_m is 2π for m = 0 and π otherwise. Above k₀ the air only rides along (a mass); below it, the
square root is imaginary: that part of the mode's motion radiates, and its imaginary mass is the
mode's loss to sound. A mode's frequency moves with ω through k₀, so each is found by iterating
ω = √λ(ω) (a few passes, by the secant method), and its decay from the losses over its mass, which
is d(ω²M)/dω².

**The kettle below.** The kettle is a rigid cylinder of the same radius holding the same air (a
hemisphere's volume, two thirds of a radius deep, for the timpani). Its air has modes of its own,
J_m(βr) cos κ(z + d) with J_m′(βa) = 0 and κ² = k₀² − β², and each pushes on the head with

    p = −ρ ω² cot(κd)/κ · w_q

A mode with a radial wavenumber β above k₀ is evanescent, cot becomes coth, and it is a mass,
ρ coth(γd)/γ. The one mode with β = 0 changes the air's volume: for the round modes (m = 0) it is a
spring, ρc²/d at low frequency, which pushes the (0,1) mode up past the principal. Near κd = π the
kettle's own resonance meets the head's modes; a 1 % loss in the walls and the vent keeps it finite.

**The syahi.** The dayan's patch is heaviest at the centre and thins to its edge, laid on in layers:

    σ(r) = σ_skin · (1 + 8.1 (1 − (r/0.56a)²)^0.40)    for r < 0.56a

about nine times the skin's density at the centre and five times on average. Its radius and profile
were fitted, with the air and the shell included, to the frequencies Raman measured on a dayan (as
Sathej and Adhikari tabulate them), and land within 16 ¢ rms of them; see the tests. The dayan's
shell is a closed wooden body about 25 cm tall and wider inside than its head: a cylinder of the
head's radius holding as much air is about seven radii deep. The bayan's patch is smaller (0.30 a,
Sathej and Adhikari's), set at the centre.

**The beater.** A felt mallet (22 g) or a fingertip (10 g) is a mass on a spring that stiffens as
it is squeezed, F = K x^p (p = 2 for felt), against the head under it. The contact is solved
implicitly each sample, with the head's response to the force over that sample, until the beater
leaves the head. A soft mallet stays on for several milliseconds and reaches only the low modes;
wood leaves in a fraction of one and reaches them all. The drums above the instrument's own key are
smaller, and take a beater lighter in proportion to their head's area (as a player picks lighter
sticks for a small drum): its contact is shorter as the drum's period is, where a heavy mallet would
bury a little head in a thud.

**Hands.** A finger resting on the head (the tabla's Na and Tin), fingers left pressed after a closed
stroke (Te, Ka) and the heel pressing into the bayan are dashpots at their points (1.5, 10 and up to
4 N·s/m), each solved implicitly: it damps every mode that moves under it and spares those with a
node there. The resting finger lies a quarter turn round from the strike, as the ring finger lies
beside the index: on the nodal line of the struck (1,1) and (3,1), so it spares those and damps the
round modes and the even ones. A key let go with *Let it ring* off lays a hand flat on the head.

**Tension.** Every 16 samples the head's tension is worked out again from three things, and every
mode follows it as √T:

* the **pedal** (pitch bend, ± the pedal's range; or one note's own bend, MPE): T × b², so the
  principal moves by b;
* the **heel** (aftertouch or MPE pressure, from half pressure up: below that a finger resting on a
  Seaboard would mute every drum) pushing in by δ: a cone of depth δ stretches the head by
  δ²/2a², and its tension rises by E·h·δ²/2a²(1 − ν);
* the head's **own swing**: its mean square slope stretches it too, by ½∫|∇w|² dA / πa², so a hard
  stroke starts a little sharp and glides down as it dies.

**The listener** sits across the drum from the player, at the *listening angle* from overhead, three
of the drum's radii away. Each mode sends there the far field of a baffled source,
p = ρ iᵐ cos(mψ) φ̃(k₀ sin φ) a² · (acceleration) / R. Straight overhead (φ = 0) only the round modes
are heard; at the side the (m,1) modes come in. Drums are spread across the stereo field from low to
high, as a set of timpani stands in an orchestra.

## What to listen for

* **The kettle's harmonics.** Play a timpani note: the overtones sit near a fifth and an octave above
  the principal, as Rayleigh heard (the model gives 1 : 1.55 : 2.05 : 2.53 : 3.00 for Mylar, and
  1 : 1.51 : 1.97 : 2.41 : 2.84 for calfskin). Set *Air on the head* to 0 and the same head plays the
  bare Bessel ratios, 1 : 1.34 : 1.67 : 1.98 : 2.29, a clang, and rings for seconds: the air was also
  taking its energy away as sound.
* **The thud.** The round (0,n) modes push air in and out like a piston, radiate almost all their
  energy and die in about a tenth of a second. Struck at the centre only they sound. Take the kettle
  away (*Under the head: open air*) and the (0,1) mode drops an octave below the note.
* **Raman's harmonics.** On the dayan the (0,1) fundamental, (1,1), (2,1) and (0,2), (3,1) and (1,2),
  then (4,1), (2,2) and (0,3) fall near 1 : 2 : 3 : 4 : 5. Without its syahi they scatter
  (1.54 : 2 : 2.78 : 3.03 : 3.50 over the note).
* **Strokes.** *Na* (rim, a finger resting on the syahi's edge) kills the fundamental and leaves the
  2nd harmonic ringing; *Tun* (the centre) is mostly the fundamental; *Te* (the centre, the fingers
  staying) is a dry slap.
* **The bayan's swoop.** Lean firmly into a held key (aftertouch, or a Seaboard's pressure, past half): the heel
  stretches the skin and the whole drum slides up. A loose head bends furthest.
* **The pedal.** The pitch-bend wheel changes the tension of every sounding drum, the timpani
  glissando.
* **A hard stroke.** At full velocity with wooden mallets the note starts a few cents sharp and
  settles as it dies: the head's own stretch.

## Files

```
drums/index.html, style.css      page
drums/src/drums-params.js        parameters, the drums and the presets
drums/src/drums-instrument.js    the descriptor: everything a host needs to play it
drums/src/drums-main.js          page wiring and views: the drumhead, the overtones, the spectrum, the modes
drums/src/drums-tour.js          the guided tour
drums/src/drums-wasm.js          the engine and model as WebAssembly (drums/wasm/drums.wasm); the page's drums packed for the engine
native/instruments/drums/        the physics in C++: model (membrane, air, kettle, syahi), engine, the page's and tests' hooks
test/drums-tests.mjs             node test/drums-tests.mjs (25 tests)
tools/render-drums.mjs           node tools/render-drums.mjs → examples/drums/
```

## Simplifications

* **A baffle.** The air above the head is a half space bounded by a rigid plane at the rim: the real
  kettle's outside, and the air around its rim, are left out. The model's Mylar timpani lands a
  little sharp of a fifth and an octave (1.55, 2.05), its heavier calfskin one closer (1.51, 1.97).
* **A cylindrical kettle.** The kettle and the tabla's shell are cylinders of the head's radius and
  the same volume. The kettle's vent hole is a 1 % loss.
* **A round tabla.** The bayan's patch sits off centre on a real bayan; here it is centred, so its
  modes stay cos mθ. The tabla's second ring of skin (the *kinar*), the braided rim and the tuning
  blocks are left out: the head is held at its rim.
* **Sharp tension, √T.** When the tension changes (pedal, heel, the head's swing) every mode follows
  it as √T, as a membrane's do; the air's share of each mode's mass is kept as it was at the drum's
  own tension.
* **Cosine modes only.** The beater and the heel lie on one line through the centre, so the sin mθ
  twin of every mode is never driven and is left out. The resting finger, a quarter turn round,
  would damp those twins and couple them to the driven modes; that is left out too.
* **No bending stiffness**, which matters to a membrane only far above the modes kept.

## Quality

High plays 40 modes on up to 32 drums at once. Medium plays the lowest 26 modes on 16 drums, and Low
the lowest 14 on 8; past that many, the quietest drum not being struck is stopped in 30 ms. A drum
stops once it is 100 dB below its loudest (90 at Medium, 80 at Low).

## Prior art and references

### The instruments

* The kettledrum, a skin stretched over a bowl, came to Europe from the Middle East in the Middle
  Ages; the orchestra's pedal timpani, whose foot pedal tightens every tension rod at once, came in
  the late 19th century.
* The tabla, a pair of hand drums of North India, the dayan and the bayan, each a goatskin head laced
  over a shell, the dayan's carrying the black syahi.

### The physics

* Lord Rayleigh, *The Theory of Sound* (1877–78): the circular membrane, and the
  kettledrum's principal tone with overtones a fifth and an octave above it.
* C. V. Raman, "The Indian musical drums", *Proc. Indian Acad. Sci.* A **1**, 179–188 (1934): the
  tabla's and mridangam's nine modes on five harmonics, and the syahi that puts them there.
* B. S. Ramakrishna and M. M. Sondhi, "Vibrations of Indian musical drums regarded as composite
  membranes", *J. Acoust. Soc. Am.* **26**, 523–529 (1954),
  [doi:10.1121/1.1907369](https://doi.org/10.1121/1.1907369): the loaded head as two membranes of
  different density, and the ratios that make it harmonic.
* B. S. Ramakrishna, "Modes of vibration of the Indian drum dugga or left-hand thabala",
  *J. Acoust. Soc. Am.* **29**, 234–238 (1957): the bayan.
* R. S. Christian, R. E. Davis, A. Tubis, C. A. Anderson, R. I. Mills and T. D. Rossing, "Effects of
  air loading on timpani membrane vibrations", *J. Acoust. Soc. Am.* **76**, 1336–1345 (1984): the
  air above the head and in the kettle, which this model follows.
* G. Sathej and R. Adhikari, "The eigenspectra of Indian musical drums",
  [arXiv:0809.1320](https://arxiv.org/abs/0809.1320) (2008): smooth and composite loaded heads for
  the dayan, with Raman's measurements tabulated; the composite head's modes are a test here.
* N. H. Fletcher and T. D. Rossing, *The Physics of Musical Instruments* (Springer, 2nd ed. 1998),
  chapter 18: membranes, timpani and the Indian drums.

### Earlier models and syntheses

* L. Rhaouti, A. Chaigne and P. Joly, "Time-domain modeling and numerical simulation of a
  kettledrum", *J. Acoust. Soc. Am.* **105**, 3545–3562 (1999),
  [doi:10.1121/1.424679](https://doi.org/10.1121/1.424679): the head, the air in and around the
  kettle and a felt mallet, by finite elements in time.
* S. Bilbao and C. J. Webb, "Physical modeling of timpani drums in 3D on GPGPUs",
  [Audio Engineering Society (2013)](https://aes2.org/publications/elibrary-page/?id=16967): the head and
  the air of a whole room, by finite differences on graphics processors (the NESS project).
* Applied Acoustics Systems' [Chromaphone](https://kvraudio.com/product/chromaphone-1-by-applied-acoustics-systems)
  (2011): a commercial percussion synthesiser with membrane resonators among its models.
