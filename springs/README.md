# Spring Keyboard

A keyboard of struck steel springs. Each key is a helical spring of steel
wire with a small magnetic bead at each end, the kind a spring-reverb tank
hangs between its transducers. A mallet taps the bead at one end; the bead
at the other end is the pickup. Waves on a helix are strongly dispersive:
below a transition frequency F_C, the higher a component, the slower it
travels, and above it the order reverses. So a click at one end reaches the
far end as a chirp, and every echo after it is a longer chirp. Here every
spring is cut so that its slowest round trip, the echo time T_D, is about
one period of its note: the echoes repeat at the pitch you play, and the
chirps ride above it, up to F_C. An estimate of the pitch the ear hears
then fine-tunes each key. The waves come from Wittrick's equations for a
helical rod, solved for each key; the reduced curved-rod model that the
spring-reverb literature uses, Parker & Bilbao's F_C and the slinky line
are its checks. Nothing is sampled. You can put one, two or three springs
on each key, as reverb tanks do, wind wider or steeper coils, drive the
beads in rotation or along the axis, damp the springs with their mounts,
an oil bath or a hand, and play a Slinky whose echoes are falling
whistles.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/springs/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (76 springs, A0–C7) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how hard the mallet taps the bead |
| `Space` | sustain: holds the felt dampers off the springs |
| MIDI | notes, velocity, release velocity (how fast the damper falls), sustain pedal (CC64); the mod wheel (CC1) lays a hand on the springs |

## The physics

### 1. A spring, and the waves on it

A helical spring is a wire of radius r wound into a helix of radius R at a
helix angle α (the angle its coils climb at), N turns long, so its wire
is L = 2πRN/cos α long. Its material is spring steel: E = 200 GPa,
ρ = 7850 kg/m³, ν = 0.29, so √(E/ρ) = 5048 m/s (the model's choice of
typical values). The C4 spring is a reverb tank's: a 0.45 mm wire on a
5.4 mm coil (r/R = 1/12), α = 3°, 39.8 cm of wire in 23.6 turns, 21 mm
long and half a gram.

A wave along such a wire is never just one thing. The wire bends, twists,
stretches and shears, and because it is curved and twisted (curvature
cos²α/R, torsion sin α cos α/R), each motion drags the others along. At low frequency the spring behaves as a uniform line with two
waves: it winds and unwinds about its axis (the rotation wave), and it
stretches and compresses along it (the axial, slinky wave). Bending of the
coil's own wire carries the first, twisting of the wire the second. At
higher frequency both become bending waves on a curved wire, and the
curvature is what makes them strange.

### 2. Wittrick's helical rod

Wittrick (1966) wrote the twelve first-order equations of a helical rod
with shear and rotary inertia: three forces, three moments, three
displacements u and three rotations θ, all in the moving frame of the wire
(normal n toward the axis, binormal b, tangent t). For a helix the frame
turns at a constant rate, the Darboux vector D = (0, cos²α, sin α cos α)/R,
so plane waves e^(−iks) along the wire are exact. Their strains are

  γ = (−ik + D×) u + t × θ        (two shears and the stretch)
  χ = (−ik + D×) θ                 (two bendings and the twist)

and the energy ½Σ Cᵢ|strainᵢ|² with C = (κ_s GA, κ_s GA, EA, EI, EI, GJ),
against the kinetic energy with M = ρ·diag(A, A, A, I, I, J), gives a
6 × 6 eigenproblem for each wavenumber:

  K(k) y = ω² M y,        K = Σ Cᵢ bᵢ(k) bᵢ(k)ᵀ

Writing u = (y₁, iy₂, iy₃) and θ = (y₄, iy₅, iy₆) makes every strain a
real combination bᵢ·y, so K is real and symmetric and its six roots ω²(k)
are the six sheets of the dispersion relation. κ_s = 6(1+ν)/(7+6ν) = 0.886
is Cowper's (1966) shear coefficient for a round wire. Two sheets lie in
the audio band; the other four (the wire's own stretch, twist and shears)
start at 210 kHz on the C4 spring, and above 50 kHz on the largest. In units of R and √(E/ρ) the sheets depend only on
the shape, r/R, α and ν: ω = (√(E/ρ)/R)·Ω(kR).

The model (`native/instruments/springs/springs-model.cpp`) solves the 6 × 6
problem by Jacobi rotations and gets each sheet's group velocity dω/dk
exactly from the eigenvector (Hellmann–Feynman, dω²/dk = yᵀ(dK/dk)y). The
tests check it against:

- **the ring.** At α = 0 and k = n/R it is a closed ring with n waves round
  it. The in-plane sheet gives Hoppe's (1871) ω² = (EI/ρAR⁴)·n²(n²−1)²/(n²+1),
  the out-of-plane sheet the classical n²(n²−1)²/(n² + EI/GJ) (Michell
  1890), within 0.2 % for n = 2–6 at r/R = 0.01.
- **rigid motion.** Both sheets go to zero frequency as k → 0 (turning about
  and sliding along the axis) and at k = cos α/R, where a wave moves every
  turn of the coil alike: sideways translations and tilts.
- **the slinky line** (section 4).
- **the thin spring** (section 3).

The WebAssembly offers the rod at any shape and wavenumber for these
(`springs_rod`, the model's `rodSolve`).

### 3. The thin spring

The spring-reverb papers (Bilbao & Parker 2010; McQuillan & van Walstijn
2021) use the reduced, zero-helix-angle curved-rod model of Fletcher,
Tarnopolskaya & de Hoog (2001): the coil as a ring stack, moving in its
plane, with transverse displacement u (toward the axis) and longitudinal v.
Written here in our variables,

  ρA u_tt = −EI (∂ₓ² + ε²)² u + EA ε (∂ₓv − εu)
  ρA v_tt = EA ∂ₓ(∂ₓv − εu),        ε = 1/R

and plane waves give

  (ω² − κ²(k² − ε²)² − γ²ε²)(ω² − γ²k²) = γ⁴ε²k²,        κ² = EI/ρA = r²E/4ρ,   γ² = E/ρ

The lower root carries the chirps. Since κε ≪ γ, it is very nearly

  ω² ≈ κ²k²(ε² − k²)²/(ε² + k²)

It rises from zero, peaks at k = 0.530ε, falls back to zero at k = ε (the
whole coil moving sideways) and then climbs as a bending wave,
ω ≈ κ(k² − ε²).

Against Wittrick's model at α = 1°, the reduced model's low branch has the
same wavenumber within 0.02 % and the same group delay within 0.33 % up to
0.95 F_C, and the same F_C within 0.3 %. Its upper branch agrees within
1.6 % from k = 1.45/R to 2.2/R (3–10 F_C). Between k = 1/R and about 1.4/R
the helix angle mixes in the axial family, and the reduced model is off by
up to 5 % there at α = 1° (13 % at 2°). The instrument plays Wittrick's
model; the knob for the helix angle exists because of that difference.

### 4. The echo time T_D and the slinky line

At low frequency the lower root is ω = κεk: a wave of constant speed
c₀ = κ/R = (r/2R)√(E/ρ) along the wire, 210 m/s for every key here. Parker
& Bilbao (2009) define the echo time T_D as the time a wave takes to
travel the spring's length twice in this limit:

  T_D = 2L/c₀ = 4LR/(r√(E/ρ))

At low frequency the spring is a slinky line, a uniform rod with a
compliance and a mass. An axial force P and a torque M about the axis load
every section of wire with a twisting moment M sin α + PR cos α, a bending
moment M cos α − PR sin α, a tension P sin α and a shear P cos α. The strain
energy then gives the open-coiled spring's compliance per length of wire,

  C_PP = R²(cos²α/GJ + sin²α/EI) + sin²α/EA + cos²α/κ_sGA
  C_MM = sin²α/GJ + cos²α/EI,        C_PM = R sin α cos α (1/GJ − 1/EI)

and the line's two wave speeds follow from it and from the line's mass and
moment of inertia. They are Wittrick's two low-frequency slopes, within
10⁻⁵ over the helix angle's range, 1–20°. For a close-coiled spring they
reduce to the classical c_rotation = √(EI/ρA)/R (the reduced model's κε)
and c_axial = √(GJ/ρA)/R.
Turning the spring bends its wire; stretching it twists the wire. Their
ratio, √(EI/GJ) = √(1+ν) = 1.136, is why an axially driven spring must be
cut about 1.14 times shorter for the same note.

### 5. The transition frequency F_C

The low branch's peak is where the chirps end:

  ω_C = 0.3367 κε²,        F_C = 0.0268 r√(E/ρ)/R²

Parker & Bilbao (2009) give F_C ≈ 3r√(E/ρ)/(16√5 π R²), which is the same
branch taken at k = ε/2. It is 0.4 % lower than the exact peak of the
reduced model, and 1.7 % lower than Wittrick's at α = 3° (4192 Hz against
4265 Hz for the C4 spring). F_C ∝ r/R²: double the wire and F_C doubles,
double the coil and it falls to a quarter. A steeper helix raises it
(5750 Hz at 15°, 4211 Hz at 1°, on C4). Above F_C there is no slow wave
left, and a spring tank's response changes character there.

### 6. Group delay, and which way the chirps sweep

A component at frequency f crosses the spring in its group delay

  τ_g(f) = L·dk/dω = L/c_g(f)

and its echoes come back every 2L/c_g(f). On the C4 spring the round trip
along the low branch is 1.03 T_D at F_C/4, 1.16 T_D at F_C/2, 1.53 T_D at
3F_C/4, 2.35 T_D at 0.9 F_C, and grows without limit at F_C, where c_g = 0.
So below F_C each echo is a **rising chirp**: the low frequencies arrive
first, the ones near F_C last and later every time round. Parker (2011)
describes the same main series of chirps below F_C, with the group delay
peaking at F_C. Above F_C the upper branch is a bending wave, ω ≈ κ(k² − ε²),
whose group delay falls with frequency: 0.47 T_D at 1.5 F_C, 0.34 T_D at
4 F_C. These are **falling chirps**: the high frequencies arrive first.
Parker describes a second set of echoes spanning the whole band, with its
group delay greatest at low frequency and falling as frequency rises;
Parker & Bilbao (2009) found the region above F_C much quieter than the one
below in most of the springs they measured. Here the beads couple to the upper branch at 5–23 % of the low
branch's strength between 1.5 and 4 F_C. A Slinky's F_C lies below
hearing, so all of its sound is on this branch. Its echoes are falling
whistles; Parker, Penttinen, Bilbao & Abel (2010) report high frequencies
travelling faster than low on the Slinky.

The Echoes view draws the engine's own response to the last strike as a
short-window spectrogram with the model's arrival times (2j+1)·L/c_g(f)
over it. The tests band-pass the engine's impulse response by complex
demodulation and find the first arrival at L/c_g(f) within 3 %, and the
echo spacing at 2L/c_g(f) within 4 % (1.005 T_D to 1.125 T_D at 0.1–0.45 F_C).

### 7. A finite spring: modes and beads

The engine is modal, like McQuillan & van Walstijn's (2021) modal spring
reverb, but its modes come straight from Wittrick's sheets. The standing
waves are taken as

  k_n = nπ/L,        n = 1, 2, …

those whose displacement toward the axis vanishes at the ends (∝ sin ks)
while the motions along and round the axis are free there (∝ cos ks). The
writing u = (y₁, iy₂, iy₃) above puts every component in one of these two
families. Each n gives a mode on each of the two sheets, at
f_n = ω(k_n)/2π.

Each bead sits on the spring's axis, clamped to the end of the wire by a
short radial tail, so it moves as the wire's end section does. A bead
driven in rotation turns with the section's rotation about the axis, θ_z.
A bead driven axially slides by u_z + Rθ_φ (the tail's lever). The mallet
taps the bead at s = 0, the pickup bead at s = L reads its velocity, and
mode n has the weight

  w_n = (2/L)·d_n²·(−1)ⁿ

with d_n the M-normalised eigenvector's share along the bead's motion; 2/L
is the reciprocal of the modal mass. The sign (−1)ⁿ sends the first
arrival after one length, the echoes after three, five, … A mode coupled
less than 0.003 times as strongly as a pure rotation wave is left out, as
is anything above 18 kHz. That leaves about 365 modes per spring on A0, 240 on C2,
140 on C4 and 100 on C6, 25 of them on the low branch below F_C.

**Why the keyboard stops at C7.** Every key's spring is the C4 one scaled,
so F_C rises an octave with every octave: 450 Hz on A0, 4.3 kHz on C4,
17 kHz on C6. Just past C6 it leaves the 18 kHz ceiling, and the band
holds only the lower part of the chirp: on C7 (F_C 34 kHz) 31 modes per
spring, the highest at half F_C, where the echoes still come 16 % late.
Above C7 there would be fewer still, all far below F_C and nearly
harmonic (five on C8, at group delays within 17 % of each other): a short
plucked wire, not a spring. So the keys stop at C7.

A sideways sway of the coil moves the end of the wire without turning it,
so the sway modes near k = 1/R are neither driven nor heard. Strictly the
sway pushes the bead sideways, and its mount takes that push. Each bead's
inertia μ (as a share of the spring's moment of inertia) passes less of the
higher modes, in and out:

  H(f) = 1/(1 + (f/f_b)²),        f_b = f₀/πμ        (31.8 f₀ at the default 1 %)

### 8. Tuning: every key the same spring, then tuned by ear

In units of R the dispersion depends only on the shape, so a spring scaled
in every dimension by s has every mode, F_C and echo time scaled by 1/s.
Every key starts as the C4 spring scaled by f(C4)/f₀ (coil, wire and
length), with its wire cut so that its lowest mode on the drive's sheet,
k₁ = π/L, sits on the note. Its echo rate 1/T_D is then within 1.4 cents of
the note.

That is not yet what you hear. The dispersion packs the overtones together
on the way up to F_C: modes 1–4 sit at 1, 1.9960, 2.9840 and 3.9601 × the
lowest, so a struck spring sounds flat of its lowest mode. And the scaled
copies do not sound alike, because the mallet, the steel's loss and the
ear's own dominance region do not scale with the spring. The same mallet
reaches fewer of a small spring's modes, so the treble springs sound nearer
their lowest mode than the bass ones.

So each key is tuned by ear. Its virtual pitch is estimated by subharmonic
summation (Hermes 1988), adapted from the Carillon's strike-note estimator,
on the partials the pickups hear in the first 0.4 s after an mf strike
(velocity 0.7). Each mode's amplitude includes the mallet's spectrum, the
beads' inertia and its spring's share of the force, averaged in power over
0.4 s of its decay (mounts, steel, oil). The partials go onto a
log-frequency axis, 96 points an octave, each a triangle ±50 ¢ wide, so
modes too close to resolve add in power. The axis is weighted by the region
where virtual pitch forms and compressed (amplitude^0.6, from 50 dB below
the loudest):

  W(f) = [1 + (f/2500)²]^(−½) · [1 + (300/f)²]^(−½)

A candidate's pitch strength is the sum of the axis at f, 2f, … 15f, the
k-th weighted 0.75^(k−1). The estimate is the strongest candidate within
half an octave of the note. (On C2 and C♯2 the strongest of all lies an
octave up, because W(f) favours the second harmonic of a 65 Hz note: the
method's octave ambiguity.) With springs in parallel each spring's series
makes its own peak. The set's pitch is the whole set's peak within 40 ¢ of
the mean of the springs' own pitches, or that mean where springs far apart
make no common peak.

Then the whole set of springs is scaled by a factor ρ until the estimate
lands on the note: a fixed point, with a bisection where the estimate
jumps between neighbouring peaks. The shape is untouched, so only the
frequencies and lengths change and nothing is solved again. This happens
whenever a key's springs are built, with the knobs as they are. Coil,
wire, helix, drive, springs per key, spread, mallet, bead, mounts, steel
and oil all retune the next strike, while a ringing spring keeps its own.
The Slinky's whistles give the estimator no steady pitch (its estimates
wander over ±6 semitones), so the Slinky keeps its length rule (section 12).

At the defaults (two springs a key, 1.5 % apart):

| key | heard before | heard after | lowest mode | coil ⌀ | wire ⌀ | wire L | F_C | T_D | modes / spring |
|---|---|---|---|---|---|---|---|---|---|
| A0 | −24.2 ¢ | +0.2 ¢ | +24.2 ¢ | 50.7 mm | 4.22 mm | 3.765 m | 451 Hz | 35.84 ms | 366 |
| C2 | −20.8 ¢ | +0.3 ¢ | +20.8 ¢ | 21.3 mm | 1.78 mm | 1.586 m | 1070 Hz | 15.10 ms | 244 |
| C3 | −17.0 ¢ | −0.1 ¢ | +17.4 ¢ | 10.7 mm | 0.89 mm | 0.795 m | 2136 Hz | 7.56 ms | 183 |
| C4 | −13.8 ¢ | 0.0 ¢ | +14.1 ¢ | 5.36 mm | 0.45 mm | 0.398 m | 4265 Hz | 3.79 ms | 143 |
| C5 | −10.3 ¢ | +0.2 ¢ | +9.6 ¢ | 2.69 mm | 0.22 mm | 0.200 m | 8507 Hz | 1.90 ms | 117 |
| C6 | −8.8 ¢ | +0.3 ¢ | +4.9 ¢ | 1.35 mm | 0.11 mm | 0.100 m | 16968 Hz | 0.952 ms | 102 |
| C7 | −6.9 ¢ | +0.2 ¢ | +4.1 ¢ | 0.67 mm | 0.06 mm | 0.050 m | 33920 Hz | 0.476 ms | 31 |

"Heard" is the estimate against the note, before and after the correction.
"Lowest mode" is where the pair's lowest modes are centred: the two
springs' own sit 13 ¢ either side of it. The dimensions are the centre's.
Before the correction the keyboard drifted by 12 ¢ from bass to treble
(−19 ¢ to −3 ¢ with one spring a key). After it, every key is within
0.3 ¢ of its note at the defaults, and within 10 ¢ (mostly within 1 ¢) with
one spring, three springs 3 % apart, wide coils of thick wire, a steep
helix on lossy heavy mounts, or a soft mallet. The engine's own sound, put
through the same estimator (its spectrum over the first 0.4 s), lands within
10 ¢ of the note on every key (worst 9 ¢). The echo rate 1/T_D still follows
the lowest mode within 3 ¢.

This family suits the keyboard because its timbre is the same on every
key. A family of equal coils cut to length, as in a reverb tank, would chirp
richly in the bass but keep only a handful of modes below F_C in the
treble, and it would cost twice as much in the bass.

The coil and wire knobs reshape every spring alike, and each spring is
retuned. Wider coils (same wire) bring F_C down as 1/R²: at × 1.7 the C4
spring's F_C is 1489 Hz on 23.1 cm of wire, its lowest mode 28 ¢ sharp. An
axially driven spring is tuned on the axial sheet (35.0 cm on C4, F_C
3736 Hz).

### 9. Losses

Three losses, each a rate σ (s⁻¹) per mode:

  σ_n = σ_oil + π f_n η + (ℓ ln10/20)·|c_g(f_n)|/L

- **The mounts.** A fraction is lost each time a wave reaches a bead, ℓ dB
  per reflection (0.06 dB by default). Waves that come back often lose
  more: the rate is the reflections per second, |c_g|/L. Near F_C the waves
  crawl and are hardly damped by the ends, so that band rings longest. A
  note's T₆₀ is proportional to its period: the fundamental rings 7.2 s on
  C2, 1.8 s on C4 and 0.46 s on C6; just below F_C, 9.7, 2.4 and 0.61 s.
- **The steel.** A loss factor η = 2 × 10⁻⁴: σ = πfη, the high modes first.
- **Oil.** Hammond hung his springs in oil-damped tubes. A viscous drag
  σ_oil damps every mode alike (0 by default; the Hammond preset uses 6 s⁻¹).
- **A hand** on the coils adds σ = 60h² s⁻¹ (h from 0 to 1, on the mod
  wheel). **The damper**, a felt pad, falls on the springs when the key
  comes up and adds σ = ln 1000/T₆₀ (T₆₀ = 0.3 s by default). It grips over
  0.04/(0.4 + v) s, 29–100 ms, faster for a faster MIDI release velocity v.
  The pedal (Space or CC64) holds it off.

The tests measure each mode's decay in the engine at the model's σ within
4 %, and the damper and the hand within 10 %.

### 10. The mallet

The mallet is a half-sine pulse of force on the driving bead, its impulse
the key velocity. Its length falls with the strike, as a Hertzian contact's
does (τ ∝ v^(−1/5)):

  F(t) = (πI/2τ) sin(πt/τ),  0 < t < τ,        τ = τ_m (0.7/v)^(1/5)

τ_m is 0.35 ms at mf (0.33 ms at full velocity). The pulse's spectrum falls
to its first zero at 1.5/τ, about 4.3 kHz, so a short tap reaches the
chirps up to F_C and a soft one (2–5 ms) only the low echoes. The force is
laid onto every mode sample by sample while it lasts. The springs are
linear, so a second strike on a ringing spring simply adds to its motion.
The test checks that two strikes sound as the sum of each alone.

### 11. Springs in parallel

Reverb tanks hang two or three springs side by side, cut a little apart, so
that their echoes do not line up. Here 1–3 springs share each key's
mallet, each taking a third (or half) of the force. Neighbours are cut the
spread apart, centred on the note: (1 + spread·o) long with o = ±½ for two
springs and 0, ±1 for three (1.5 % by default). Their fundamentals part by
as much, and their echoes drift apart a little more every round trip. By the
seventh arrival the three springs' echoes no longer add up. Each spring has
its own pickup, panned left and right of the key's place: a physical
reason for stereo.

### 12. The Slinky

The **Slinky** spring family hangs one wide, slack coil on every key: a 35 mm
coil radius, 0.7 mm wire (round wire standing in for the toy's flat
ribbon), at a 6° helix angle in its preset. Its F_C is 41 Hz, below hearing,
so everything it does is on the bending branch, ω ≈ κk², where the group
velocity 2√(κω) rises with frequency. Each echo is a falling whistle, and
the whistles stretch out every round trip. On C4 (3.5 m of wire, 15.8
turns) the first one sweeps from 2.5 kHz at 14 ms to 300 Hz at 36 ms. In
that limit, scaling the length by s scales every mode by 1/s², so the key
sets the length ∝ f₀^(−1/2), and the whole sound transposes with the key.
The pitch is approximate, but an octave up halves every echo time. Crawford
(1987) heard these slinky whistlers; Crawford (1990) argued for a dispersion
relation of this form, ω ∝ k² times the coil radius. Modes stop at 3 kHz
(310 on C4, 620 on C2).

### 13. The engine

- **Modes as two-pole recursions**, exact in frequency and decay (the
  impulse-invariant discretisation of shared/dsp.js's `modeCoeffs`), four
  interleaved in one loop while the springs ring freely, two while the
  mallet pushes.
- **The page builds the springs.** The few hundred 6 × 6 eigenproblems a
  bass key needs (a few ms) are solved on the page. It keeps them per key
  and geometry and works through the keyboard in spare moments, then sends
  them with each note. Without them (in Node, or a plugin) the engine builds
  its own.
- **Pruning.** A mode 90 dB below the voice's loudest moment (in power,
  over all its modes) is let go entirely. A voice is done when all its
  modes are.
- **Voices.** One per key. Re-striking a sounding key strikes the same
  springs as they move. Changing the geometry (family, coil, wire, helix,
  drive, springs, spread) hangs new springs for the next strike, and the
  old ones fade. Beyond 16 sounding keys the quietest one older than 50 ms
  fades out over 30 ms.
- **Knobs glide** over 30 ms: losses, the hand and the bead per block, the
  output gains per sample. No allocation in `process()`.
- **Voicing.** +3 dB an octave up the keyboard (the treble springs, tiny,
  hold fewer modes within the mallet's reach, and they die sooner). The
  Slinky's pickups sit 30 dB lower: its bending waves turn the beads hard.
  A forte note peaks at 0.17–0.29.
- **The page's views.** The engine keeps the first moments of the latest
  strike, up to ten round trips (0.65 s at most), and posts them for the
  Echoes view.
- **Cost.** Ten keys across the compass, two springs each, struck in turn
  and left ringing take about 8–10 % of one core at 48 kHz, all ten at once
  about 10 %; a key's springs take about 3 ms to build.
- **In C++** (`native/instruments/springs`): the engine and the model, run
  as WebAssembly on this page and as plugins (CLAP, VST3, AU and a
  standalone app), where CC64 is the damper pedal and the mod wheel the
  hand on the springs. The page builds each key's springs with the
  WebAssembly model and sends them with the note; a plugin builds every key
  on a worker thread as soon as the geometry settles, and a note whose
  springs aren't ready yet waits a few milliseconds for them. The C++ was
  ported from the JavaScript this page first ran, operation for operation,
  with V8's own `sin`, `cos`, `exp`, `pow` and `log2`, and played it bit
  for bit.

## What to listen for

`examples/springs/` (regenerate with `node tools/render-springs.mjs`):

1. **01-a-tune-on-the-springs**: a walking bass on the big springs under a
   tune on the small ones, two springs a key. Each note is a buzz at its
   own echo rate, with a bright, chirping halo above it.
2. **02-one-spring-struck-at-c2-c3-and-c4**: one spring, nearly lossless.
   On C2 the echoes come every 15 ms and each is a rising "pew" up to
   F_C = 1.07 kHz; C3 and C4 are the same spring scaled, twice and four
   times as fast and as high.
3. **03-one-then-two-then-three-springs**: the same phrase on one, two and
   three springs a key, 3 % apart. One spring echoes crisply; three
   blur into a shimmering wash.
4. **04-light-mounts-then-an-oil-bath**: light beads on stiff mounts (long,
   bright, the band below F_C singing on), then Hammond's oil bath (every
   mode damped alike: short and dry).
5. **05-the-coil-widens-and-the-chirps-come-down**: one key (C3), struck as
   the coil widens from × 0.7 to × 2. F_C falls from 4.3 kHz to 540 Hz and the
   chirps' ceiling comes down with it, while the note stays put.
6. **06-soft-mallet-then-hard-tap**: a 2.5 ms mallet reaches only the low
   echoes, a round, pitched tone; a 0.08 ms tap reaches F_C and the falling
   chirps above it.
7. **07-slinky-whistles**: the Slinky struck on C3, C4 and G4. Every echo
   is a falling whistle, each longer than the last, faster on the higher
   keys.

On the page, **Echoes** draws what the far bead heard after the last strike
(a short-window spectrogram from the engine), with the model's arrival
times dotted over it: rising chirps below F_C, faint falling ones above.
**Dispersion** shows the two sheets of Wittrick's helix, bright where the
beads drive them, with the spring's modes on them, and the round trip's
group delay against frequency, with T_D and F_C marked. **The spring** shows
the struck spring slowed down so that a round trip takes two seconds: the
twist leaves the struck bead and spreads as it goes, its ripples trailing.
**Spectrogram** is the live output, with the note and F_C ticked on its
axis.

## Files

```
springs/index.html, style.css            page
springs/src/springs-instrument.js        the descriptor: parameters, presets, key range, the engine
springs/src/springs-params.js            parameters and presets
springs/src/springs-main.js              page wiring, building the springs for each note, and views
springs/src/springs-wasm.js              the C++ engine and model as WebAssembly (springs/wasm/springs.wasm)
native/instruments/springs/              the C++: Wittrick's helical rod (6 × 6 per wavenumber), F_C, group delay, tuning,
                                         modes, bead coupling, losses, mallet, and the engine (plugins and WebAssembly)
test/springs-tests.mjs                   node test/springs-tests.mjs (23 tests, about 10 s)
tools/render-springs.mjs                 node tools/render-springs.mjs → examples/springs/
```

## Simplifications

- **Standing waves at k_n = nπ/L.** The modes are those of ends that hold
  the wire's distance from the axis and leave it free along and round the
  axis. Real ends, clamped to a bead, mix the wave families at each
  reflection and shift the modes slightly. The bead's inertia filters the
  coupling but does not move the modes, so a heavy bead does not detune
  the note here as it would a little in a real tank.
- **The bead turns with the wire's end section.** Its tail is rigid and the
  bead is held sideways by its mount, which is not modelled, so the coil's
  sway modes play no part. A bead free to move sideways, or a flexible
  tail, would let them in.
- **Straight helix, no gravity or tension.** Real reverb springs hang
  stretched between their beads under some tension and sag a little; the
  prestress terms of the linearised rod equations are left out, as is any
  contact between coils (below about 1.5° the C4 spring's coils would
  touch).
- **Losses are three numbers.** Viscous drag, a constant loss factor and a
  loss per reflection. Air's frequency-dependent drag, thermoelastic loss
  and the transducers' electrical damping are folded into them.
- **The mallet is a prescribed force,** not a contact against the moving
  bead; the transducers are ideal velocity sensors apart from the bead's
  inertia.
- **The Slinky's wire is round.** A toy Slinky is a flat ribbon, much
  stiffer one way than the other, and it is usually heard held in the hand
  or hanging; its key-to-length rule is chosen here so that it transposes.
- **The pitch is one estimator's.** Subharmonic summation with a weighting
  and a compression chosen here (section 8) decides where each key's
  springs are cut. It is a model of virtual pitch, not a listening test,
  and three springs far apart (3 % and more) make a chorus with no single
  pitch to land on.

## Prior art and references

**History and invention.**
- L. Hammond (1941). "Electrical musical instrument." US Patent 2,230,836
  (filed 15 July 1939, granted 4 February 1941).
  [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/2230836).
  A mechanical reverberator for the electric organ: helical springs in
  oil-damped tubes between a drive transducer and a pickup.
- J. D. Stack (1948). "Sound reverberating device." US Patent 2,437,445
  (filed 7 November 1944, granted 9 March 1948; assigned to Twentieth
  Century-Fox). [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/2437445).
  Coil-spring delay and reverberation for film sound.
- F. S. Crawford (1987). "Slinky whistlers." *Am. J. Phys.* 55(2),
  130–134. [doi:10.1119/1.15229](https://doi.org/10.1119/1.15229).
  The dispersive chirp of a struck Slinky, compared with ionospheric
  whistlers.
- F. S. Crawford (1990). "Slinky-whistler dispersion relation from
  'scaling'." *Am. J. Phys.* 58, 916.
  [doi:10.1119/1.16299](https://doi.org/10.1119/1.16299). A dispersion
  relation ω ∝ k² times the coil radius, from how Slinkys of different sizes
  sound.

**The physics.**
- R. Hoppe (1871). "Vibrationen eines Ringes in seiner Ebene." *J. reine
  angew. Math.* 73, 158–170.
  [doi:10.1515/crll.1871.73.158](https://doi.org/10.1515/crll.1871.73.158).
  A ring's in-plane modes, the first check of the helical-rod solver.
- J. H. Michell (1890). "The small deformation of curves and surfaces with
  application to the vibrations of a helix and a circular ring." *Messenger
  of Mathematics* 19, 68–82 (no DOI;
  [list of Michell's papers](https://mathshistory.st-andrews.ac.uk/Extras/Michell_publications)).
  The first treatment of a thin ring's vibrations out of its plane, the
  second check.
- D. J. Hermes (1988). "Measurement of pitch by subharmonic summation."
  *J. Acoust. Soc. Am.* 83(1), 257–264.
  [doi:10.1121/1.396427](https://doi.org/10.1121/1.396427). The pitch
  estimator each key is tuned by, adapted from the Carillon's.
- G. R. Cowper (1966). "The shear coefficient in Timoshenko's beam theory."
  *J. Appl. Mech.* 33(2), 335–340.
  [doi:10.1115/1.3625046](https://doi.org/10.1115/1.3625046). The shear
  coefficient 6(1+ν)/(7+6ν) for the round wire.
- W. H. Wittrick (1966). "On elastic wave propagation in helical
  springs." *Int. J. Mech. Sci.* 8(1), 25–47.
  [doi:10.1016/0020-7403(66)90061-0](https://doi.org/10.1016/0020-7403%2866%2990061-0).
- L. Della Pietra & S. della Valle (1982). "On the dynamic behaviour of
  axially excited helical springs." *Meccanica* 17(1), 31–43.
  [doi:10.1007/BF02156005](https://doi.org/10.1007/BF02156005).
- T. Tarnopolskaya, F. R. de Hoog & N. H. Fletcher (1999). "Low-frequency
  mode transition in the free in-plane vibration of curved beams."
  *J. Sound Vib.* 228(1), 69–90.
  [doi:10.1006/jsvi.1999.2400](https://doi.org/10.1006/jsvi.1999.2400).
- N. H. Fletcher, T. Tarnopolskaya & F. R. de Hoog (2001). "Wave
  propagation on helices and hyperhelices: a fractal regression."
  *Proc. R. Soc. Lond. A* 457(2005), 33–43.
  [doi:10.1098/rspa.2000.0654](https://doi.org/10.1098/rspa.2000.0654).
  The zero-helix-angle curved-rod model whose dispersion relation the
  spring-reverb papers use.
- S. V. Sorokin (2009). "Linear dynamics of elastic helical springs:
  asymptotic analysis of wave propagation." *Proc. R. Soc. A* 465(2105),
  1513–1537. [doi:10.1098/rspa.2008.0468](https://doi.org/10.1098/rspa.2008.0468).
- J. Parker & S. Bilbao (2009). "Spring reverberation: a physical
  perspective." *Proc. 12th Int. Conf. Digital Audio Effects (DAFx-09)*,
  Como. [PDF](https://www.dafx.de/paper-archive/2009/papers/paper_84.pdf).
  Measured impulse responses, and the echo time T_D and transition
  frequency F_C in terms of the spring's geometry.

**Earlier models and synthesis projects.**
- J. S. Abel, D. P. Berners, S. Costello & J. O. Smith III (2006). "Spring
  reverb emulation using dispersive allpass filters in a waveguide
  structure." *AES 121st Convention*, San Francisco (no DOI). Waveguide
  loop with cascaded dispersive allpass filters.
- S. Bilbao & J. Parker (2010). "A virtual model of spring
  reverberation." *IEEE Trans. Audio Speech Lang. Process.* 18(4),
  799–808. [doi:10.1109/TASL.2009.2031506](https://doi.org/10.1109/TASL.2009.2031506).
  Finite-difference simulation of the curved-rod spring model.
- V. Välimäki, J. Parker & J. S. Abel (2010). "Parametric spring
  reverberation effect." *J. Audio Eng. Soc.* 58(7/8), 547–562 (no
  DOI). Parametric model with chirp-generating allpass chains and delay
  lines.
- J. Parker, H. Penttinen, S. Bilbao & J. S. Abel (2010). "Modeling
  methods for the highly dispersive Slinky spring: a novel musical toy."
  *Proc. DAFx-10*, Graz.
  [PDF](https://www.dafx.de/paper-archive/2010/DAFx10/ParkerPenttinenBilbaoAbel_DAFx10_P80.pdf).
  Finite-difference and waveguide Slinky models, played as a MIDI
  instrument.
- J. Parker (2011). "Efficient dispersion generation structures for
  spring reverb emulation." *EURASIP J. Adv. Signal Process.* 2011,
  646134. [doi:10.1155/2011/646134](https://doi.org/10.1155/2011/646134).
- H. Gamper, J. Parker & V. Välimäki (2011). "Automated calibration of a
  parametric spring reverb model." *Proc. DAFx-11*, Paris, 37–44.
  [PDF](https://www.dafx.de/paper-archive/2011/Papers/39_e.pdf).
- V. Välimäki, J. D. Parker, L. Savioja, J. O. Smith & J. S. Abel (2012).
  "Fifty years of artificial reverberation." *IEEE Trans. Audio Speech
  Lang. Process.* 20(5), 1421–1448.
  [doi:10.1109/TASL.2012.2189567](https://doi.org/10.1109/TASL.2012.2189567).
  Review, including the history and modelling of spring reverbs.
- S. Bilbao (2013). "Numerical simulation of spring reverberation."
  *Proc. DAFx-13*, Maynooth.
  [PDF](https://www.dafx.de/paper-archive/2013/papers/22.dafx2013_submission_19.pdf).
  Finite-difference schemes for the full helical-spring model.
- M. van Walstijn (2020). "Numerical calculation of modal spring reverb
  parameters." *Proc. DAFx2020*, Vienna, 38–45 (no DOI found).
  [DAFx archive](https://dafx.de/paper-archive/details/q7OfubAkCxyC9vgJE32SIQ).
  Modal parameters for a spring reverb from a semi-discretisation in space
  and its eigenvalues.
- J. McQuillan & M. van Walstijn (2021). "Modal spring reverb based on
  discretisation of the thin helical spring model." *Proc. DAFx-20in21*,
  191–198. [doi:10.23919/DAFx51585.2021.9768284](https://doi.org/10.23919/DAFx51585.2021.9768284).
- J. McQuillan, M. van Walstijn, J. D. Parker & M. Ortiz (2025). "Physical
  modeling of a spring reverb tank incorporating helix angle, damping, and
  magnetic bead coupling." *J. Audio Eng. Soc.* 73(6), 312–330.
  [doi:10.17743/jaes.2022.0199](https://doi.org/10.17743/jaes.2022.0199).
- [Dual Spring Reverb](https://physicalaudio.co.uk/products/dual-spring-reverb/)
  (Physical Audio, Edinburgh): plug-in built on a modal model of wave
  propagation in helical springs, with no samples or impulse responses.
- [Spring Reverb](https://www.softube.com/plug-ins/spring-reverb)
  (Softube): plug-in that Softube describes as built with component and
  physical modelling.
- [Springs](https://www.audiothing.net/effects/springs/) (AudioThing,
  2019): hybrid; AudioThing describes it as a combination of convolution
  and modelling.
