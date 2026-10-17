# Carillon

A concert carillon of 49 bronze bells, C3–C7, after the Low Countries
instruments whose bells François and Pieter Hemony first tuned partial by
partial in the 1640s. Nothing here is sampled. Each bell's cross-section, its
rib, is solved by axisymmetric finite elements, and the rib is reshaped, as a
founder reshapes it, until five of its partials, the hum, prime, tierce,
quint and nominal, sit at 0.5 : 1 : 1.2 : 1.5 : 2 (or, for a major-third
bell, with the tierce at 1.25). An iron clapper, a ball on a pendulum, hits
the soundbow with a Hertzian contact, solved against every mode of the bell
as it moves. You hear each mode radiate from its own multipole, across the
air between the tower and you. And the note you hear, the strike note, is
not the lowest partial or the loudest: it is a virtual pitch an octave below
the nominal, which a subharmonic-summation estimator finds live on the page.
You can cast the bells as major-third bells, leave them untuned, make them
uneven so their doublets warble, soften the clapper, strike higher on the
waist, or walk across the town square.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/carillon/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (49 bells, C3–C7 at sounding pitch) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the baton is struck |
| `Space` | nothing: a carillon has no dampers, and the bells ring on |
| MIDI | notes, velocity; the sustain pedal (CC64) is accepted and changes nothing |

## The physics

### 1. The instrument: compass, tuning and three ribs

Forty-nine bells, chromatic from C3 (130.8 Hz) to C7 (2093 Hz) at sounding
pitch. Many carillons transpose (their keyboards are written higher or
lower than the bells sound); here the keys sound as written. Bells are
tuned by their nominal, and the strike note lies an octave below it, so each
bell's nominal is set exactly an octave above its key, in equal temperament
at A = 440 Hz.

Founders cast a whole register from one rib, scaled: a bell of the same rib
half the size sounds an octave higher (f ∝ 1/D for the same shape and
metal). Carillon trebles are made from heavier ribs, thicker for their size,
so they are not too thin and short-lived. Here there are three registers,
each with its own rib, its wall thickness scaled before it is tuned (the
model's choice):

| register | keys | wall thickness | soundbow | diameter × nominal |
|---|---|---|---|---|
| bass | C3–B3 | × 0.5 | D/22.5 | 603 m/s |
| middle | C4–B5 | × 0.72 | D/17 | 714 m/s |
| treble | C6–C7 | × 1 | D/12.9 | 910 m/s |

So the bourdon, C3, is 2.30 m across and weighs 5.6 t; C4 is 1.36 m and
1.5 t; C5 0.68 m and 190 kg; C7 22 cm and 8 kg (minor-third bells;
the major-third ones are heavier, 15.8 t at C3). At the change of rib the
bells jump in size: C6 is larger than B5.

Bell bronze, about 78 % copper and 22 % tin: E = 105 GPa, ρ = 8700 kg/m³,
ν = 0.33 (the model's choice of typical values). Only ν enters the shapes
of the modes and their ratios; E/ρ sets how large a bell must be for its note.

### 2. The bell's modes: axisymmetric finite elements

A bell is a body of revolution, so its vibrations separate into families m
= 0, 1, 2, …, each with 2m nodal meridians. In cylindrical coordinates the
displacement of family m is

  u_r = U_r(r, z) cos mθ,   u_θ = U_θ(r, z) sin mθ,   u_z = U_z(r, z) cos mθ

(and the same turned by π/2m, at the same frequency, for m ≥ 1). This is
three-dimensional elasticity, not shell theory. A carillon bell's wall is
thick: its soundbow is about a fifth of its own radius thick, far from the
thin-shell limit (the ring test below shows how far the thin formulas go
wrong there). Wilson (1965) gave the method for bodies of revolution;
Perrin, Charnley & dePont (1983) and Roozen-Kroon (1992) analysed bells with
finite elements. The strains of family m are

  ε_rr = U_r,r cos mθ,   ε_zz = U_z,z cos mθ,   ε_θθ = (U_r + mU_θ)/r · cos mθ,   γ_rz = (U_r,z + U_z,r) cos mθ
  γ_rθ = (U_θ,r − U_θ/r − mU_r/r) sin mθ,   γ_zθ = (U_θ,z − mU_z/r) sin mθ

and integrating cos² and sin² round the bell gives π (2π for m = 0, where U_θ,
a pure twist, is dropped). The rib's cross-section is meshed with 40 × 2
eight-node quadratic quadrilaterals (along the wall × through it), integrated
3 × 3, in `src/bell-fem.js`. The nodes are numbered along the wall, so the
stiffness and mass matrices are banded, and the lowest modes of each m come
from subspace iteration on (K − σM)⁻¹M with a banded Cholesky factor and a
Rayleigh–Ritz step each round (Bathe & Wilson 1973). A rib's 58–115 modes
below 8–12 × its prime take a few seconds. The crown is clamped out to a tenth of
the diameter, as a bell is bolted dead to its headstock. Its two lowest
motions, rocking and bouncing on the crown (the lowest m = 1 and m = 0 modes),
belong to the mounting and are left out of the sound.

The tests check the FEM against three things:

- **A thin ring** (h/R = 0.01, square section) bends in its plane at Hoppe's
  and Rayleigh's frequencies, ω_m² = (EI/ρAR⁴) m²(m² − 1)²/(m² + 1), within
  0.005 % (m = 2) to 0.1 % (m = 8), and breathes at √(E/ρ)/R. A thick ring
  (h/R = 0.1) falls 0.5 % (m = 2), 2.3 % (m = 4) and 8.7 % (m = 8) below the
  thin formula, because shear and rotary inertia lower its higher modes.
  A bell's soundbow is thicker still.
- **A thin free cylinder** (h/R = 0.003) has Rayleigh's (1881) two
  inextensional families: the ring mode, with the plate modulus E/(1 − ν²),
  within 0.4 %, and the rocking mode, ω₂²/ω₁² = (1 + 24(1 − ν)R²/m²L²)/(1 +
  12R²/m²(m² + 1)L²), within 0.25 %. The small remainder shrinks as √h, the
  width of the free edges' boundary layer.
- **The dense generalised eigensolver** (`genEig` in shared/linalg.js) on a
  coarse bell agrees to 10⁻⁹.

Refined from 40 × 2 to 64 × 3 elements, the middle rib's named partials move
by at most 0.6 ¢ (the deciem; the five tuned ones by at most 0.5 ¢), against
5.1 ¢ for 20 × 1.

### 3. The rib, and the founder's tuning

The rib is a mid-surface and a wall thickness at ten stations, from the
crown's bolt hole to the lip: crown, crown edge, shoulder, upper waist,
waist, lower waist, above the soundbow, soundbow and lip. Between them the
mid-surface is a C² cubic spline (flat at the crown) and the thickness a
monotone cubic, so the wall is smooth everywhere (`src/bell-profile.js`).
The starting proportions are those of published minor-third bell
sections and founders' rules of thumb: the crown about half the lip's
diameter across and about 0.8 D above it, a soundbow about D/13 thick near
an eighth of the height, and a waist about a third as thick as the soundbow;
the lower waist sweeps out sharply into the soundbow.

Founders tune a bell by turning metal off its inside at chosen heights. Here
the handles are the thickness, radius and height of the stations, 23 in
all, and a Levenberg–Marquardt search moves them until
hum, prime, tierce and quint sit at 1/4, 1/2, 3/5 (or 5/8) and 3/4 of the
nominal, with a penalty on how far the rib moves (lowered in steps, so the
rib changes no more than it must). The major-third ribs also aim, more
softly, at the superquint, octave nominal and deciem (3/2, 2 and 5/4 of the
nominal), and the minor bass gently at the first two; a last stage then
makes the five exact. (Asked harder, or of the other minor ribs, the soft
targets thin the walls far out of a bell's range.) A rib whose wall would
fold over itself is refused. `tools/carillon-profile.mjs` tunes the six ribs in about 20
minutes from the start ribs and writes `src/bell-table.js`; the tests
re-solve every rib and check the table.

| rib | hum | prime | tierce | quint | nominal | deciem | superquint | octave nominal |
|---|---|---|---|---|---|---|---|---|
| minor, bass (× 0.5) | 0.5000 | 1 | 1.2000 | 1.5000 | 2.0000 | 2.582 (+56 ¢) | 2.927 (−42 ¢) | 4.058 (+25 ¢) |
| minor, middle (× 0.72) | 0.5000 | 1 | 1.2000 | 1.5000 | 2.0000 | 2.562 (+43 ¢) | 2.964 (−21 ¢) | 4.103 (+44 ¢) |
| minor, treble (× 1) | 0.5000 | 1 | 1.2000 | 1.5000 | 2.0000 | 2.485 (−10 ¢) | 2.977 (−13 ¢) | 4.105 (+45 ¢) |
| major, bass (× 0.5) | 0.5000 | 1 | 1.2500 | 1.5000 | 2.0000 | 2.492 (−5 ¢) | 2.951 (−28 ¢) | 4.127 (+54 ¢) |
| major, middle (× 0.72) | 0.5000 | 1 | 1.2500 | 1.5000 | 2.0000 | 2.472 (−20 ¢) | 2.974 (−15 ¢) | 4.173 (+73 ¢) |
| major, treble (× 1) | 0.5000 | 1 | 1.2500 | 1.5000 | 2.0000 | 2.502 (+1 ¢) | 2.962 (−22 ¢) | 4.018 (+8 ¢) |

(Ratios to the prime; ¢ from the ideal 0.5 : 1 : 1.2 (1.25) : 1.5 : 2 : 2.5 : 3 : 4,
read against the nominal.) The five tuned partials sit within 0.01 ¢ of the
ideal; the ones above follow from the shape.

**The major-third bell.** In the 1980s Eijsbouts and the Eindhoven
University of Technology designed a bell with a major third, 1.25, in place
of the tierce, by structural optimisation of its profile with finite
elements (Schoofs et al. 1987; Lehr 1987). Here the same search starts from
a different rib, with a waist that bulges outward instead of sweeping in,
and finds a pronounced swell in the waist under a narrow neck below the
shoulder, quite unlike the minor-third bell's outline.

**Which partial is which.** Partials are named by their family m and their
nodal circles n (Rossing & Perrin 1987; Fletcher & Rossing 1998): hum (2,0),
prime (2,1#), tierce (3,1), quint (3,1#), nominal (4,1), deciem (4,1#),
superquint (5,1), octave nominal (6,1), '#' marking the second family member
with that count. The FEM agrees: the hum and prime are the lowest two modes
of m = 2, the prime with a nodal circle at 0.22–0.25 of the height; the
tierce is the lowest m = 3 mode, its nodal circle up the waist (0.32–0.57 of
the height), and the quint has its circle near the rim (below 0.15 of the
height, or at the lip itself in the minor bass); the nominal, superquint and octave nominal are the rim modes of m = 4, 5 and 6,
moving most at the lip.

### 4. How long a bell rings

Each mode loses energy two ways (amplitude ∝ e^(−σt), T₆₀ = 6.91/σ):

  σ = π f η  +  ρ₀ c η_ℓ(ka) I / (2 ρ_b D)

- **Bronze's internal friction**, loss factor η = 2.5 × 10⁻⁴ (the **Bronze
  loss factor** knob; the model's choice).
- **Radiation.** I = ∫ w² dS is the mode's normal motion squared over the
  outer surface (unit modal mass, from the FEM, so I/(ρ_b D) per bell of
  diameter D), and η_ℓ(ka) = 1/((ka)²|h_ℓ′(ka)|²) the radiation efficiency of
  a sphere vibrating in its ℓ-th harmonic, with ℓ = m (at least 1) and a the
  mode's w²-weighted radius. A low-m mode of a small bell (small ka) is a
  poor radiator, so the hum radiates least.

The result follows the published pattern, the hum ringing longest and the
upper partials dying faster (Fletcher & Rossing 1998), and every T₆₀ scales
as 1/f between bells of the same rib:

| bell | hum | prime | tierce | nominal | superquint | octave nominal |
|---|---|---|---|---|---|---|
| C3 | 124 s | 32 s | 31 s | 13 s | 11 s | 9.6 s |
| C4 | 58 s | 15 s | 12 s | 8.2 s | 6.8 s | 5.6 s |
| C5 | 29 s | 7.3 s | 5.9 s | 4.1 s | 3.4 s | 2.8 s |
| C6 | 12 s | 4.0 s | 3.6 s | 2.7 s | 2.1 s | 1.6 s |
| C7 | 6.1 s | 2.0 s | 1.8 s | 1.3 s | 1.0 s | 0.8 s |

### 5. Doublets and warble

Every family m ≥ 1 is a degenerate pair, cos mθ and sin mθ. A real bell is
never quite round. An uneven wall, here a variation of its mass δρ/ρ =
ε cos 2m(θ − ψ) (the **Asymmetry** knob, the same ε for every m), splits the
pair. First-order degenerate perturbation theory (Perrin & Charnley 1973;
Perrin 1977; Charnley & Perrin 1978) gives the pair's frequencies with their
axes along ψ and ψ + π/2m:

  δ(ω²)/ω² = ∓ (ε/2) κ,   κ = (T_rz − T_θ)/T,   so   Δf/f = ε κ / 2

where T_rz and T_θ are the mode's kinetic energy in u_r, u_z and in u_θ (from
the FEM; the test checks κ for a thin ring against its analytic
(m² − 1)/(m² + 1)). The lower member has its radial antinodes on the heavy
side. For the named partials κ = 0.62–0.93, so at the default ε = 0.2 % the
C5 bell's hum is split by 0.17 Hz and its nominal by 0.94 Hz.

Where the clapper strikes, at angle α from the heavy side (**Strike
angle**), sets how much each member rings: cos mα and sin mα. Heard from the
same azimuth, they reach you as cos² mα and sin² mα and beat at Δf. On an
axis of family m (α a multiple of π/2m), only one member rings and there is
no warble; halfway between (π/4m), both ring equally and the beat is
complete. So no single strike angle silences every doublet. A founder or
bell-hanger can only turn the bell to spare the partials that matter most.
**Listener round the bell** turns the listening direction: each member
radiates in its own 2m-lobed pattern.

### 6. The clapper

A ball on a pendulum hits the soundbow from inside. Its effective mass is
the **Clapper mass** (2.5 % of the bell's by default), its radius 5 % of the
bell's diameter, and the contact is Hertz's,

  F = K δ^(3/2),   K = (4/3) E* √R,   1/E* = (1 − ν_c²)/E_c + (1 − ν_b²)/E_b

with E_c the **Clapper face**: iron at 200 GPa (E* = 76 GPa), or a
softer insert. Every sample, the contact is solved implicitly against every
mode of the bell where it is (`src/carillon-engine.js`): the modes advance
freely, the wall's motion and the ball's give the compression, and the force
solves δ + C F(δ) = δ_free by Newton's method within a bracket, C being the
modes' and the ball's compliance over one step. F is the discrete gradient
of the Hertz potential (2/5) K δ^(5/2) between the steps either side
(Chatziioannou & van Walstijn 2015), so the impact neither makes nor loses
energy numerically. A re-struck bell is struck as it moves.

The console is regulated for an even touch: a stroke of a given velocity
gives every clapper the same kinetic energy as it gives C4's, which flies at
the **Clapper speed** × velocity (1.4 m/s at the computer keys' 0.7). So
lighter clappers fly faster, up to 8 m/s, which the bells from about E5 up
reach at full velocity (the model's choice). Against a rigid wall a Hertz impact lasts
3.2145 (m/K)^(2/5) v^(−1/5); the bell's own give lengthens it a little.
On C4 the ball stays on the bell 0.96 ms, its force pulse 0.48 ms wide at
half height; on C5, 0.42 ms; on C7, 0.17 ms. Fletcher, McGee &
Tarnopolsky (2002) found about 1 ms. The contact scales with the bell, and
as m^(2/5) with the clapper's mass. A short, hard impact reaches higher
partials: a soft insert (3 GPa) stays on more than twice as long and leaves
the upper partials far quieter. Fletcher et al. describe the opposite
change in a real carillon, where worn flats on clapper and bell shorten the
impact and make the sound brighter.

**Strike height** (where on the inside the ball lands, 11.5 % of the height
by default, the soundbow) chooses which modes are struck: each mode's normal
motion of the inner surface there, tabulated at 17 heights. On the soundbow
the rim partials ring strongly; higher on the waist, the prime and quint,
whose motion is there, gain on the nominal (a test checks the prime's gain).

### 7. What you hear: radiation, distance and air

Each mode radiates as a 2^m-pole: the pressure at the listener per unit
modal velocity is ρ₀ c √(η_ℓ I A_m/4π) at 1 m, where A_m is the gain of its
sin^(2m)Θ pattern toward the horizon. Each member of a doublet adds its own
cos or sin m(β − ψ) at the listener's azimuth β. Then the **Distance** from
the tower (30 m by default; 10–600 m) brings spherical spreading,
1/r, and air absorption from ISO 9613-1 at 15 °C and 70 % humidity, which
takes 4.1 dB/km at 1 kHz, 26.6 at 4 kHz and 95 at 8 kHz. From 300 m the 8 kHz
partials lose 28.5 dB more than they do near the tower and those at 1 kHz
only 1.2 dB, so distant bells sound darker. Bells are panned by their place
in the frame, bass to the left.

### 8. The strike note: a virtual pitch

A bell's strike note is the pitch you name. It lies close to an octave below
the nominal, whether or not a partial is there (in a perfectly tuned bell
the prime is; in many old bells it is not). It is not heard at the hum or
prime but is formed by the nominal and the partials above it, near 2 : 3 : 4
of the strike note, Lehr's (1986) partial group, and shifts with their
tuning (Terhardt & Seewann 1984; Hibbert 2008).

The page estimates it by **subharmonic summation** (Hermes 1988), on the
bell's partials as you hear them 30–200 ms after the strike (before the
first strike, on the model's prediction of them):

- each partial adds a peak of height W(f)·(a/a_max)^0.6, a triangle ±50 ¢
  wide, to a log-frequency axis of 48 points per octave (partials 50 dB
  below the loudest are ignored);
- a candidate f₀'s pitch strength is the sum of the axis read at f₀, 2f₀, …,
  15f₀, the n-th weighted h^(n−1);
- W(f) = [1 + (f/2500)²]^(−½)·[1 + (300/f)²]^(−½) favours roughly 0.3–2.5 kHz,
  where virtual pitch is formed (the model's choice).

Praat's implementation of Hermes's method uses h = 0.84. Here h = 0.75,
because with 0.84 the lower octave, where the hum adds its own peak, wins
from F♯5 up in minor-third bells and from C4 up in major-third ones. That is
subharmonic summation's octave bias, which the many inharmonic partials of
a bell make worse.

What it finds:

- On every struck minor-third bell from C♯3 to D6, and every major-third
  bell from C3 to F♯5, the strike note within 6.3 ¢ of nominal/2.
- Given only the nominal, superquint and octave nominal, it still finds
  nominal/2, within 6.4 ¢, on the minor-third bells C4–A♭6 and the
  major-third bells C3–B5: a pitch where none of the three lies, an octave
  and more below them. That is the 2 : 3 : 4 group at work. Where the group
  is too far out of tune (the minor bass rib, its superquint 42 ¢ flat) or
  lies above about 6 kHz (the top bells), it names the nominal itself.
- On the whole struck bell the prime helps: without it, the estimate stays
  at the strike note in most of the minor-third middle register but rises to
  the nominal in the bass and in the major-third bells (whose bass and
  middle ribs have octave nominals 54 and 73 ¢ sharp).
- In the upper bells (from E♭6 for minor-third bells, from G5 for
  major-third ones) it names the hum, an octave below the strike note. The
  hum, prime and nominal stand at 1 : 2 : 4, and in the major-third bell the
  deciem and superquint add 5 and 6: a harmonic series on the hum, which the
  weighting W(f) favours as the bells rise and the partials above the
  nominal grow weak and short. In small bells the hum and prime dominate,
  and this estimator follows them an octave down.
- The minor bourdon, C3, is named by its nominal: its prime, at 131 Hz,
  falls below the region W(f) favours, and its nominal group is the
  out-of-tune one above.

The **Strike note** view shows the pitch-strength curve, the partials as
heard and the estimate, with how far it lies from the nearest partial.

### 9. Historic bells

Before Simpson (1895) argued that every partial of a bell should be tuned,
and before founders learned to do it, most bells were tuned by
their nominal (or strike) alone, and their other partials fell where the
casting put them. **Historic, untuned bells** casts each bell with its
wall off by a few per cent in each of five regions (crown, shoulder, waist,
lower waist, soundbow and lip), seeded by its key: rms 8 % × the knob. Each
mode moves by d ln f = Σ s_g δ_g, the FEM's sensitivity of that mode to each
region's thickness (tabulated). The founder still matches the nominal to
the note. At the full setting the hum, prime, tierce and quint stray from
the ideal by 58 ¢ rms against the nominal, and the casting's
unevenness adds a random asymmetry in every harmonic 2m (rms 0.4 %, at
random angles), so the bells warble each their own way.

### 10. The engine

- **Modes as two-pole recursions**, exact in frequency and decay (the
  impulse-invariant discretisation of shared/dsp.js's `modeCoeffs`), two per
  m ≥ 1 mode for the doublet: 104–215 per bell (more in the bass, whose modes
  below 12 × its prime are all kept; the treble keeps those below 8 × and
  under 0.45 fs).
- **While the clapper is in flight or in contact** (a few milliseconds),
  every mode advances sample by sample with the contact. Otherwise each
  mode runs over the whole block, four modes interleaved in one loop.
- **Pruning.** A mode 100 dB below its bell's loudest moment is skipped, and a
  bell is done when all are. A ringing bell soon costs only its few
  long-lived modes.
- **Voices.** One per bell; striking a ringing bell strikes it as it moves.
  Beyond 36 sounding bells the quietest one older than 50 ms fades out over
  30 ms. Changing the profile or the historic casting hangs a new bell for
  the next strike, and the old one fades.
- **Knobs glide** over 30 ms (distance and listener direction per sample, the
  asymmetry per block). No allocation in `process()`.
- **Cost.** 24 bells struck one after another (every 0.125 s) and left
  ringing take about 12 % of one core at 48 kHz in Node, on the shared
  machine this was built on. A forte note peaks at 0.15–0.45 anywhere
  on the keyboard.
- **In C++**: the same engine and model run as WebAssembly on this page (the
  JavaScript is the fallback; `?engine=js` in the address forces it), and the
  views draw from the WebAssembly model; and as plugins (CLAP, VST3, AU and
  a standalone app), with velocity as the baton stroke and CC64 as the pedal
  that changes nothing. The ribs and modes are the FEM's table, converted
  number for number to C++ (`native/instruments/carillon/bell-table.h`): the
  FEM runs only when the bells are designed, never while they play. The
  WebAssembly plays what the JavaScript plays to within 4 × 10⁻⁸ of the peak
  (a float32 rounding), and the same test suite passes on it. Ten bells
  ringing take about 4 % of a core in C++; striking ten at once, a quarter of
  a millisecond.

## What to listen for

`examples/carillon/` (regenerate with `node tools/render-carillon.mjs`):

1. **01-ode-to-joy-on-the-carillon**: the tune of Beethoven's Ode to Joy in
   the middle register over a bass bell on the strong beats, closing with
   the tremolo carillonneurs play on long notes.
2. **02-minor-third-bells-then-major-third-bells**: an arpeggio and a C major
   chord on minor-third bells, then on major-third bells: every bell's
   tierce rises from a minor to a major third, and the chord sounds sweeter.
3. **03-a-bell-then-only-its-nominal-group-then-a-sine-at-its-strike-note**:
   the G4 bell; then only its nominal, superquint and octave nominal (784,
   1162 and 1608 Hz); then a sine at the strike note the estimator finds
   (391.7 Hz). The middle sound's pitch is the sine's, an octave below any of
   its partials.
4. **04-uneven-bell-struck-on-its-axis-then-between-the-axes**: a C5 bell
   with ε = 0.6 %, struck on its asymmetry's axis (a steady tone), then
   11.25° round, halfway between the nominal's axes (the nominal throbs at
   its 2.8 Hz split).
5. **05-iron-clapper-then-soft-insert**: the same arpeggio with an iron
   clapper, then a 4 GPa insert: rounder, the upper partials gone.
6. **06-tuned-bells-then-historic-untuned-bells**: the passage of demo 2 on
   tuned bells, then on bells as cast: each bell's partials stray, and each
   warbles its own way.
7. **07-under-the-tower-then-across-the-town-square**: from 10 m, then from
   300 m (levels matched by ear: the far one is really 30 dB quieter), where
   the air has taken the top off.

On the page, **The bell** draws the struck bell's section to scale, with the
chosen partial's shape moving, its nodal circles, and the clapper. Beside it
the bell is seen from below, with the partial's 2m lobes, the doublet's axes,
the strike point and the listener, and under it that partial's level over the
last 8 s. **Partials** lists every partial up to 4.5 × the prime, with its
designation, cents from ideal, doublet split, T₆₀ and live level; click one
to draw it. **The strike note** shows subharmonic summation at work.
**Spectrum** is the live output with the bell's partials marked.

## Files

```
carillon/index.html, style.css           page
carillon/src/bell-fem.js                  axisymmetric 8-node solid elements, banded subspace eigensolver, ring and cylinder checks
carillon/src/bell-profile.js               the rib (stations, splines), modes and named partials, nodal circles, the founder's tuning (LM)
carillon/src/bell-table.js                the six tuned ribs and their modes (generated by tools/carillon-profile.mjs)
carillon/src/bronze.js                    bronze and air
carillon/src/carillon-model.js            bells, losses, radiation, doublets, clapper, air absorption, historic bells, strike-note estimator (no audio, no DOM)
carillon/src/carillon-engine.js           real-time engine (AudioWorklet and Node)
carillon/src/carillon-params.js           parameters and presets
carillon/src/carillon-main.js             page wiring and views
carillon/src/carillon-wasm.js             the C++ engine and model as WebAssembly (carillon/wasm/carillon.wasm)
native/instruments/carillon/              the C++ port: model, engine, the table as a generated header, reference (plugins and WebAssembly)
test/carillon-tests.mjs                   node test/carillon-tests.mjs (26 tests, ~20 s; FORTE_ENGINE=wasm: on the WebAssembly)
tools/carillon-profile.mjs                node tools/carillon-profile.mjs → carillon/src/bell-table.js and its C++ (~20 min)
tools/carillon-native-table.mjs           node tools/carillon-native-table.mjs → native/instruments/carillon/bell-table.h
tools/render-carillon.mjs                 node tools/render-carillon.mjs → examples/carillon/
```

## Simplifications

- **The ribs are this model's, not a founder's.** The starting proportions
  follow published sections and rules of thumb, and the search keeps them
  close, but no Hemony or Eijsbouts drawing was copied. The register
  thicknesses (× 0.5, 0.72, 1) are chosen. They make the bourdon about twice
  as heavy as on many four-octave carillons, and the change of rib at C4
  and C6 is a step where founders blend.
- **The upper partials are the shape's, not tuned** (the table in section
  3): superquints 13–42 ¢ flat, octave nominals 8–73 ¢ sharp. Real bells'
  upper partials are often closer to 3 and 4 × the prime.
- **Clamped crown, free lip.** The crown is held rigid out to D/10. The
  mounting's own modes are left out, and nothing of the frame or tower rings
  along.
- **Radiation is a sphere's.** Each mode radiates with the efficiency and
  pattern of a sphere vibrating in its m-th harmonic, at the mode's own
  radius. A bell is an open shell, its inside and outside radiate against
  each other, and its pattern has lobes up and down too. The loss factor is
  a single number for bronze.
- **The listener is on the horizon** of the bell and in its far field.
  There is no tower, louvres or ground reflection; the room knob is the
  page's synthetic room.
- **Asymmetry is a mass variation** in the harmonic 2m of each family m, to
  first order. Thickness variations would also change stiffness, which can
  split the other way. Second-order coupling between families (from other
  harmonics of the unevenness) is left out.
- **The clapper** is a ball of fixed effective mass with a Hertzian face. Its
  shaft does not flex, it does not rebound for a second strike, and its
  return spring is not modelled. Its speed follows the even-touch rule
  above, which no real console follows exactly.
- **The strike note** is one algorithm's estimate, with a weighting and a
  compression chosen here. In real bells the nominal group probably carries
  the strike note more firmly than in these, whose superquints and octave
  nominals stray further from 3 and 4 × the prime (above). Hibbert (2008)
  measured how real strike pitches shift; nothing here is fitted to his
  data.

## Prior art and references

**The original instrument and its history.**
- Lord Rayleigh (1890). "On bells." *Phil. Mag.* 29(176), 1–17.
  [doi:10.1080/14786449008619901](https://doi.org/10.1080/14786449008619901).
- A. B. Simpson (1895, 1896). "On bell tones" and "On bell tones No. II."
  *The Pall Mall Magazine* 7, 183–194, and 10, 150–155. Transcriptions by
  W. A. Hibbert: [1895](https://web.archive.org/web/20260508120415/https://www.hibberts.co.uk/simpsons-first-paper/),
  [1896](https://web.archive.org/web/20260508120205/https://www.hibberts.co.uk/simpsons-second-paper/).
  The case for tuning the partials of bells, behind "Simpson tuning".
- A. Lehr (1959). *De klokkengieters François en Pieter Hemony*.
  Eijsbouts, Asten. [Open Library](https://openlibrary.org/works/OL3397718W).
- A. Lehr (1965). "Hedendaagse Nederlandse klokkengietkunst." *Neth.
  Acoust. Soc. Publ.* 7, 20–49; in English as "Contemporary Dutch
  bell-founding art", in T. D. Rossing (ed.), *Acoustics of Bells* (1984).
  [Transcription](https://web.archive.org/web/20260508133347/https://www.hibberts.co.uk/lehrs-paper-on-the-theory-of-bell-tuning/).
  Includes the history of Hemony tuning.
- A. Lehr (1991). *The Art of the Carillon in the Low Countries*. Lannoo,
  Tielt. [Open Library](https://openlibrary.org/works/OL3397716W).
- H. Klotz & L. Rombouts (2001). "Hemony." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.12772](https://doi.org/10.1093/gmo/9781561592630.article.12772).
- L. Rombouts (2014). *Singing Bronze: A History of Carillon Music*.
  Leuven University Press.
  [doi:10.2307/j.ctt15hvwrh](https://doi.org/10.2307/j.ctt15hvwrh).
- A. Schoofs, F. van Asperen, P. Maas & A. Lehr (1987). "I. Computation of
  bell profiles using structural optimization." *Music Perception* 4(3),
  245–254. [doi:10.2307/40285368](https://doi.org/10.2307/40285368).
  The major-third bell, designed at Eindhoven University of Technology
  with Eijsbouts.
- A. Lehr (1987). "III. From theory to practice." *Music Perception*
  4(3), 267–280. [doi:10.2307/40285370](https://doi.org/10.2307/40285370).

**The physics.**
- R. Hoppe (1871). "Vibrationen eines Ringes in seiner Ebene." *J. reine
  angew. Math.* 73, 158–170.
  [doi:10.1515/crll.1871.73.158](https://doi.org/10.1515/crll.1871.73.158).
  The ring's in-plane modes, the FEM's first check.
- Lord Rayleigh (1881). "On the infinitesimal bending of surfaces of
  revolution." *Proc. London Math. Soc.* s1-13, 4–16.
  [doi:10.1112/plms/s1-13.1.4](https://doi.org/10.1112/plms/s1-13.1.4).
  Inextensional modes of shells, the cylinder check.
- H. Hertz (1882). "Ueber die Berührung fester elastischer Körper." *J.
  reine angew. Math.* 92, 156–171. [EuDML](http://eudml.org/doc/148490).
  The contact law of the clapper.
- E. L. Wilson (1965). "Structural analysis of axisymmetric solids." *AIAA
  J.* 3(12), 2269–2274 (no DOI found). Finite elements for bodies of
  revolution under loads expanded in cos mθ and sin mθ.
- K.-J. Bathe & E. L. Wilson (1973). "Solution methods for eigenvalue
  problems in structural mechanics." *Int. J. Numer. Methods Eng.* 6(2),
  213–226 (no DOI found).
  [Author's PDF](https://web.mit.edu/kjb/www/Publications_Prior_to_1998/Solution_Methods_for_Eigenvalue_Problems_in_Structural_Mechanics.pdf).
  Subspace iteration.
- R. Perrin & T. Charnley (1973). "Group theory and the bell." *J. Sound
  Vib.* 31(4), 411–418.
  [doi:10.1016/S0022-460X(73)80257-3](https://doi.org/10.1016/S0022-460X%2873%2980257-3).
- R. Perrin (1977). "A group theoretical approach to warble in ornamented
  bells." *J. Sound Vib.* 52(3), 307–313.
  [doi:10.1016/0022-460X(77)90561-2](https://doi.org/10.1016/0022-460X%2877%2990561-2).
- T. Charnley & R. Perrin (1978). "Studies with an eccentric bell."
  *J. Sound Vib.* 58(4), 517–525.
  [doi:10.1016/0022-460X(78)90357-7](https://doi.org/10.1016/0022-460X%2878%2990357-7).
- E. Terhardt, G. Stoll & M. Seewann (1982). "Algorithm for extraction of
  pitch and pitch salience from complex tonal signals." *J. Acoust. Soc.
  Am.* 71(3), 679–688. [doi:10.1121/1.387544](https://doi.org/10.1121/1.387544).
- H. Duifhuis, L. F. Willems & R. J. Sluyter (1982). "Measurement of pitch
  in speech: an implementation of Goldstein's theory of pitch perception."
  *J. Acoust. Soc. Am.* 71(6), 1568–1580.
  [doi:10.1121/1.387811](https://doi.org/10.1121/1.387811). The harmonic
  sieve.
- R. Perrin, T. Charnley & J. dePont (1983). "Normal modes of the modern
  English church bell." *J. Sound Vib.* 90(1), 29–49.
  [doi:10.1016/0022-460X(83)90401-7](https://doi.org/10.1016/0022-460X%2883%2990401-7).
- E. Terhardt & M. Seewann (1984). "Auditive und objektive Bestimmung der
  Schlagtonhöhe von historischen Kirchenglocken." *Acustica* 54, 129–144.
  [English translation by W. A. Hibbert](https://web.archive.org/web/20260508105251/https://www.hibberts.co.uk/terhardt-and-seewan-1984/).
- A. Lehr (1986). "Partial groups in the bell sound." *J. Acoust. Soc.
  Am.* 79(6), 2000–2011. [doi:10.1121/1.393208](https://doi.org/10.1121/1.393208).
- T. D. Rossing & R. Perrin (1987). "Vibrations of bells." *Applied
  Acoustics* 20(1), 41–70.
  [doi:10.1016/0003-682X(87)90082-X](https://doi.org/10.1016/0003-682X%2887%2990082-X).
- D. J. Hermes (1988). "Measurement of pitch by subharmonic summation."
  *J. Acoust. Soc. Am.* 83(1), 257–264.
  [doi:10.1121/1.396427](https://doi.org/10.1121/1.396427). The estimator;
  its parameters as in [Praat's implementation](https://www.fon.hum.uva.nl/praat/manual/Sound__To_Pitch__shs____.html)
  (15 subharmonics, 48 points per octave), but for the compression.
- P. J. M. Roozen-Kroon (1992). *Structural Optimization of Bells*. PhD
  thesis, Eindhoven University of Technology.
  [doi:10.6100/IR373470](https://doi.org/10.6100/IR373470).
- ISO 9613-1:1993. *Acoustics — Attenuation of sound during propagation
  outdoors — Part 1: Calculation of the absorption of sound by the
  atmosphere.* [iso.org](https://www.iso.org/standard/17426.html). Air
  absorption.
- N. H. Fletcher & T. D. Rossing (1998). "Bells." In *The Physics of
  Musical Instruments*, 2nd edn, 675–707. Springer, New York.
  [doi:10.1007/978-0-387-21603-4_21](https://doi.org/10.1007/978-0-387-21603-4_21).
- T. D. Rossing (2000). *Science of Percussion Instruments*. World
  Scientific. [doi:10.1142/4294](https://doi.org/10.1142/4294). Chapter
  "Church bells and carillons", 128–145:
  [doi:10.1142/9789812709288_0011](https://doi.org/10.1142/9789812709288_0011).
- N. H. Fletcher, W. T. McGee & A. Z. Tarnopolsky (2002). "Bell clapper
  impact dynamics and the voicing of a carillon." *J. Acoust. Soc. Am.*
  111(3), 1437–1444. [doi:10.1121/1.1448517](https://doi.org/10.1121/1.1448517).
  Contact of about 1 ms, ended by a displacement pulse returning round the
  bell; flats worn on clapper and bell shorten the impact and brighten the sound.
- N. McLachlan, B. Keramati Nigjeh & A. Hasell (2003). "The design of
  bells with harmonic overtones." *J. Acoust. Soc. Am.* 114(1), 505–511.
  [doi:10.1121/1.1575748](https://doi.org/10.1121/1.1575748).
- W. A. Hibbert (2008). *The Quantification of Strike Pitch and Pitch
  Shifts in Church Bells*. PhD thesis, The Open University.
  [Thesis page](https://web.archive.org/web/20260422143744/https://www.hibberts.co.uk/phd-thesis/).
- V. Chatziioannou & M. van Walstijn (2015). "Energy conserving schemes for
  the simulation of musical instrument contact dynamics." *J. Sound Vib.*
  339, 262–279.
  [doi:10.1016/j.jsv.2014.11.017](https://doi.org/10.1016/j.jsv.2014.11.017).
- W. A. Hibbert, S. Taherzadeh & D. B. Sharp (2017). "Virtual pitch and
  pitch shifts in church bells." *Open J. Acoust.* 7(3), 52–68.
  [doi:10.4236/oja.2017.73006](https://doi.org/10.4236/oja.2017.73006).

**Earlier models and synthesis projects.**
- A. J. M. Houtsma & H. J. G. M. Tholen (1987). "II. A perceptual
  evaluation." *Music Perception* 4(3), 255–266.
  [doi:10.2307/40285369](https://doi.org/10.2307/40285369). Listening
  tests on computer-synthesised carillons of major-third, minor-third and
  "neutral-third" bells.
- M. Karjalainen, V. Välimäki & P. A. A. Esquef (2002). "Efficient
  modeling and synthesis of bell-like sounds." *Proc. DAFx-02*, Hamburg,
  181–186. [PDF](https://www.dafx.de/paper-archive/2002/DAFX02_Karjalainen_Valimaki_Esquef_bell-like_sounds.pdf).
  Source–filter and inharmonic digital-waveguide models, with parallel
  resonators for beating doublets, fitted to a handbell.
- E. K. Canfield-Dafilou & K. J. Werner (2017). "Modal audio effects: a
  carillon case study." *Proc. DAFx-17*, Edinburgh, 247–254.
  [PDF](https://www.dafx.de/paper-archive/2017/papers/DAFx17_paper_22.pdf).
  Modal analysis and resynthesis of recordings of the 60 bells of the
  Lurie Carillon (University of Michigan).
- R. Michon, S. R. Martin & J. O. Smith (2017). "MESH2FAUST: a modal
  physical model generator for the Faust programming language –
  application to bell modeling." *Proc. ICMC 2017*, Shanghai.
  [hal-03162901](https://hal.science/hal-03162901v1). Turns a
  finite-element modal analysis of a 3D mesh into a Faust modal model;
  demonstrated on bells.
- [Faust physmodels.lib bell models](https://faustlibraries.grame.fr/libs/physmodels/)
  (GRAME Faust libraries, 2017): modal church, English, French, German
  and Russian bell models generated with Mesh2Faust, with strike position
  and sharpness controls.
- M. Rau, O. Das & E. K. Canfield-Dafilou (2019). "Improved carillon
  synthesis." *Proc. DAFx-19*, Birmingham.
  [PDF](https://www.dafx.de/paper-archive/2019/DAFx2019_paper_34.pdf).
  Modal model of a Hoover Tower (Stanford) carillon bell with resolved
  doublets, a clapper excitation fitted to accelerometer data, and modal
  belfry reverberation.
- M. Carvalho, V. Debut & J. Antunes (2021). "Physical modelling
  techniques for the dynamical characterization and sound synthesis of
  historical bells." *Heritage Science* 9, 157.
  [doi:10.1186/s40494-021-00620-2](https://doi.org/10.1186/s40494-021-00620-2).
  3D scans, finite-element modal models checked against measured modes,
  and time-domain synthesis for chosen clapper and impact point; includes
  two 18th-century Mafra carillon bells.
- [Pianoteq "Church bells and carillons"](https://www.modartt.com/pianoteq_free)
  (Modartt, by 2011): free add-on for the physically modelled Pianoteq
  engine, based on bells recorded at the European Bell Institute; the
  companion Tubular Bells add-on (2011) offers partials retuned to major
  and minor patterns.
- [Chromaphone 3](https://www.applied-acoustics.com/chromaphone-3/)
  (Applied Acoustics Systems, 2020; first version 2011): synthesiser of
  coupled modelled resonators (strings, plates, membranes, beams, bars,
  tubes), with bells and chimes among its presets.
