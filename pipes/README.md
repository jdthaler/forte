# Pipe Organ

A Baroque organ's flue pipes, sounding from the physics of the jet that
drives them. Each key opens a pallet; wind from the chest reaches the feet
of its pipes and leaves each one's flue as a thin sheet of air, a jet,
which crosses the pipe's mouth and splits on the sharp upper lip, the
labium. The air moving in and out of the pipe through the mouth pushes the
jet sideways as it leaves the flue; the push grows as the jet carries it
across, and arrives at the labium a transit time later, steering more or
less of the jet into the pipe. Timed right, that feeds the pipe's
resonance and the pipe speaks by itself. Nothing is sampled. You hear the
chiff, when upper modes speak before the fundamental; the octave a pipe
jumps to when the wind is pushed (and the far lower wind it needs to come
back); the hollow, odd-harmonic Gedackt; the Mixture's octaves and fifths;
and a wind that sags and breathes under big chords.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/pipes/>
(or locally, see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (54 keys, C–f³; A₂–c⁵ with **Full range**) |
| `←` `→` | octave |
| `↑` `↓` | velocity: how fast the key opens its pallet |
| `Space` | hold: keys stay down while it is held (an organ has no damper pedal) |
| MIDI | notes, velocity (pallet speed), release velocity (how fast the pallet shuts), hold pedal (CC64); **mod wheel = more wind** (up to 3000 Pa) |

## The physics

### 1. The instrument: compass, stops and pipes

One manual, C–f³ (54 keys, 65.4 Hz to 1.40 kHz at 8′ pitch), in equal
temperament at A = 440 Hz. Under each key is a groove, a channel its pallet
fills with wind, and on it stand six pipes, one for each rank:

- **Principal 8′**: open metal pipes at the written pitch;
- **Octave 4′**: open pipes an octave higher, half as long;
- **Gedackt 8′**: stopped pipes at the written pitch, capped at the top,
  so about half as long as an open pipe and sounding only the odd
  harmonics;
- **Mixture III**: three small open pipes per key at octaves and fifths far
  above the note, that break back an octave at each c so that they stay
  between 392 Hz and 5.6 kHz.

| keys | Mixture ranks | as harmonics of the 8′ |
|---|---|---|
| C–B | 1⅓′ 1′ ⅔′ | 6, 8, 12 |
| c–b | 2′ 1⅓′ 1′ | 4, 6, 8 |
| c¹–b¹ | 2⅔′ 2′ 1⅓′ | 3, 4, 6 |
| c²–f³ | 4′ 2⅔′ 2′ | 2, 3, 4 |
| f♯³–b³ | 5⅓′ 4′ 2⅔′ | 1.5, 2, 3 |
| c⁴–c⁵ | 8′ 5⅓′ 4′ | 1, 1.5, 2 |

The last two rows are for **Full range** (Voicing), which opens the keys
past the manual, A₂–c⁵ (A0–C8, the 88 keys of a piano): the same scales,
voicing and wind carried on. A₂'s Principal is an open pipe 5.7 m long
(27.5 Hz, of the 16′ octave) and its Gedackt a stopped one of 2.8 m; c⁵'s
Octave and top Mixture rank are pipes 10 mm long sounding 8.4 kHz, and the
Mixture's two more breaks keep it from going higher. Below C the pipes speak
slowly, as big pipes do: the fundamental's growth rate falls with its
losses (∝ σ₁, 0.5 s⁻¹ at A₂), and an open pipe's sixth mode, which the jet
drives too, sounds first. The Principal alone settles on its note in 0.5 s
at C, 1.1 s at E₁ and about 2 s at A₂.
The voicer's extra loop gain for the bass (∝ f^−0.4) stops at C: carried
further it makes A₂ whistle on that sixth mode for seconds.

The Mixture's fifths are pure (3 : 2, 701.96 ¢), as mixtures are tuned
against their unison. Drawing a stop moves its slider, which opens the
feet of that rank's pipes over 40 ms, even under held keys: a stop drawn
under a chord speaks as it would on the organ.

### 2. The pipe: a tube with two ends

A pipe is a column of air between its mouth and its top. Driven by a
pressure at the mouth, a uniform tube of effective length L_e and
cross-section S_p has modes at

  open:  fₙ = n c / 2L_e,   stopped:  fₙ = (2n − 1) c / 4L_e,   n = 1, 2, 3 …

(1 : 2 : 3 … and 1 : 3 : 5 …). Projected onto them, its wave equation gives
one oscillator per mode, all with the acoustic mass M = ρL_e/2S_p in terms
of the volume flow Q through the mouth:

  M (ẍₙ + 2σₙẋₙ + ωₙ²xₙ) = Δp,   Q = Σ ẋₙ

The model keeps up to 10 modes of an open pipe and 6 of a stopped one, all
below 15 kHz.

**End corrections.** The air just outside each opening moves with the
column, so L_e is the pipe's length L plus a correction at each open end.
At the open top it is Levine & Schwinger's 0.6133 a (a the radius, the
unflanged pipe at low frequency). The mouth is a slot in the pipe's side and
needs far more. Rayleigh's conductivity of a hole in a thin wall gives it:
for an elliptic hole with semi-axes a ≥ b,

  K = 2a·AGM(1, b/a) = πa / K(e),   ΔL_mouth = S_p / K

(AGM the arithmetic–geometric mean, K(e) the complete elliptic integral;
2r for a circle). Taking the mouth as an ellipse of its area and shape, a
diapason mouth, a quarter of the circumference wide and cut up a quarter
of that, corrects the length by 1.58 D, where Ingerslev & Frobenius
measured nearly 1.5 D on real pipes (as Fletcher 1998 reports). The mouth's
correction (1.2–2.1 D here) dwarfs the top's (0.31 D).

**Scale.** Diameters follow Töpfer's normal scale (Normalmensur): 155.5 mm
for an open pipe sounding 8′ C, halving on the 17th note, so that the
cross-section falls by 1 : √8 per octave and D ∝ f^−3/4. The Gedackt is
0.85 × as wide at the same pitch. Every mouth is a quarter of its pipe's
circumference wide, H = πD/4, and the flue (the windway the jet leaves by)
is h = 1.2 mm × (D/155.5 mm)^3/4 high.

**Losses.** Each mode loses energy to the wall's viscous and thermal
boundary layer (Kirchhoff) and by radiation from each opening, which
breathes the mode's volume flow out as a monopole,

  σ_wall = c α,   α = (1/ac)√(ων/2) (1 + (γ − 1)/√Pr) = 2.96×10⁻⁵ √f / a  m⁻¹
  σ_rad = (ka)² c / 4L_e per opening (two for an open pipe, the mouth alone for a stopped one)

the second being an unflanged end's reflection |R| ≈ 1 − (ka)²/2. The
fundamental's Q is 127 at 8′ C, mostly lost to the wall, and 42 at f³,
mostly radiated.

| pipe | f (Hz) | Ø (mm) | mouth H × W (mm) | cut-up W/H | flue (mm) | length (m) | Q₁ |
|---|---|---|---|---|---|---|---|
| C Principal | 65.4 | 155.5 | 122.1 × 37.3 | 0.31 | 1.20 | 2.35 | 127 |
| c Principal | 130.8 | 92.5 | 72.6 × 18.7 | 0.26 | 0.81 | 1.14 | 100 |
| c¹ Principal | 261.6 | 55.0 | 43.2 × 9.3 | 0.22 | 0.55 | 0.548 | 78 |
| c² Principal | 523.3 | 32.7 | 25.7 × 4.7 | 0.18 | 0.37 | 0.261 | 61 |
| c³ Principal | 1046.5 | 19.4 | 15.3 × 2.3 | 0.15 | 0.25 | 0.122 | 47 |
| C Gedackt | 65.4 | 132.2 | 103.8 × 52.2 | 0.50 | 1.06 | 1.15 | 124 |
| c¹ Gedackt | 261.6 | 46.7 | 36.7 × 13.1 | 0.36 | 0.49 | 0.260 | 80 |
| f³ Mixture 2′ | 5588 | 5.5 | 4.3 × 0.44 | 0.10 | 0.10 | 0.017 | 24 |

### 3. The jet

The jet leaves the flue at the speed the foot pressure p gives it,
U_j = √(2p/ρ): 34.2 m/s at 700 Pa. The flow through the mouth, at speed
v = Q/S_m across the mouth's area S_m = HW, displaces it as it leaves the
flue; the displacement travels along the jet at c_p = 0.4 U_j (as measured;
models use 0.4–0.5 U_j) and grows on the way, reaching the
labium a transit time τ later. The jet splits there as its velocity
profile (a Bickley jet, half-width b = 2h/5) falls either side of the
labium's edge, which sits y₀ off its axis:

  τ = W / c_p,   η(t) = (hA / U_j) · H[v](t − τ)
  Q_in = b H U_j [1 + tanh((η − y₀)/b)]

The share Q_in that goes into the pipe changes as the jet swings, and
pushing that flow into and out of the mouth makes a pressure across it,
two sources of flow δ_d apart (the jet drive); where the acoustic flow
separates at the labium's sharp edge it sheds vortices, which costs
pressure:

  Δp = (ρδ_d / S_m) dQ_in/dt − ½ρ (v/α_vc)² sgn v,   δ_d = (4/π)√(2hW),   α_vc = 0.6

and Δp drives the pipe's modes (section 2). This is the jet-drive model of
Verge et al. (1994, 1997), Fabre & Hirschberg (2000) and Auvray, Fabre &
Lagrée (2012), with the picture of the jet as a delayed, amplified response
to the flow through the mouth that Coltman (1968, 1976) and Fletcher (1976)
measured and modelled. The jet's displacement at the flue is (h/U_j)·v, as
in those jet-drive models, amplified by A by the time it reaches the labium
(section 4).

One addition is this model's own: H is a first-order low-pass on the jet's
response, with its corner where the jet carries 3 radians of a wave across
the mouth (ω_c τ = 3). A pure delay would let a jet carry two or three
wavelengths of a high mode to the labium undiminished; a real jet's
disturbance smears out as it travels. Without it, the upper modes of the
bigger pipes run away in the jet's second and third windows (section 5).

### 4. Voicing

The voicer makes each pipe speak its note promptly at the playing wind, and
here does it by rule:

- **the cut-up** W puts θ = U_j/(fW), the jet's speed in mouths-per-cycle,
  at 14 for open pipes and 10 for stopped ones at 700 Pa: W = U_j/(θf). The
  jet then takes 0.18 of a period to cross an open pipe's mouth (ωτ = 1.12
  rad), which with the low-pass's 0.36 rad of lag is close to the quarter
  period at which the jet drives the fundamental hardest. The cut-ups come
  out as on real pipes: a third of the mouth's width in the bass, a sixth
  in the treble, a half to a third for the Gedackt's high mouths;
- **the jet's amplification** A is set, as a voicer sets it with the flue,
  the languid and its nicks, so that the jet's small-signal loop gain on
  the fundamental's resonance is 6 (raised as (f/262 Hz)^−0.4 below c¹, to
  10.4 at C, so that the big pipes speak sooner). ln A is 1.5 for the
  smallest Mixture pipe, whose jet is only 4 flue-heights long, where the
  growth rate jet-drive models take for short recorder jets (about 0.4/h)
  gives 1.6; on the bass pipes' long jets (W/h up to 49) it is
  4.4–4.7, where that rate would give 12 or more: a long jet turns
  turbulent and grows far less;
- **the labium** sits y₀ = 0.4 b off the jet's axis, so that the jet splits
  unevenly and the even harmonics sound.

The **Cut-up**, **Jet gain** and **Labium offset** knobs change these on
the next keys pressed. The cut-up keeps the pipes' lengths, so their mouth
corrections and their pitch move with it, and re-voices the jet to keep
its gain.

### 5. Why it speaks: the linear analysis

While the jet is small, a disturbance ∝ e^(st) obeys

  1 = Y(s) · s Kj A H(s) e^(−sτ),   Y(s) = Σ (1/M) s / (s² + 2σₙs + ωₙ²),   Kj = ρδ_d H h sech²(y₀/b) / S_m²

and the model solves it by Newton, following each mode's root from the
bare mode as the jet is turned on. A root with Re s > 0 grows: the
pipe speaks. On a mode's resonance Y is real, so near it the loop gain is
g·cos φ with φ = π/2 − ωτ − atan(ωτ/3): the jet drives the mode where its
transit puts φ within ±acos(1/g) of zero. For c¹'s fundamental alone that is
6.6 < θ < 145; a voicer would not go near the top of that range, because
the next mode takes over long before (section 7). Every mode also has
windows a whole jet wavelength further on (ωτ ≈ 2π, 4π …), and those are
the chiff's: as the wind rises at the start of a note, θ climbs through the
upper modes' windows first.

At the default wind the fundamental grows at 14/s (8′ C), 50/s (c¹) and
320/s (c³), 23/s for the Gedackt's c, and the engine matches the model's
growth within 10 % and its frequency within 3 ¢. The big pipes are unstable
in more than one mode: in 8′ C the sixth harmonic's root grows at 19/s, a
little faster than the fundamental's. The fundamental still wins on every
key, because the rising pressure brings it in first and its swinging jet
starves the others. The tests play every key on every stop to check it,
and it holds at the softest and the hardest touch too.

### 6. Speech: pallet, groove and chiff

The pallet takes 12 ms to open at velocity 0.7 (the **Pallet** knob), half
that at full velocity and four times it at 0.1. The groove under the pipes
fills through the pallet's opening a as fast as the air can flow, so its
pressure follows the opening:

  p = P a² / (a² + k²),   k = Σ hH / c_d A_pal,   A_pal = 6 × the key's flue area,   c_d = 0.61

so the groove holds 99 % of the chest's pressure with one stop drawn and
93 % with all four. The pipes' feet are taken as open (open-toe voicing,
the wind regulated at the flue), so the jets see the groove's pressure.

At the default wind each key reaches half its full level within 10–305 ms
on the Principal (C slowest), 5–160 ms on the Octave, 15–410 ms on the
Gedackt and within 45 ms on every Mixture rank. How the pressure rises at
the foot shapes the attack (Nolle & Finch 1992). A pallet slammed open
makes the jet arrive all at once, a jump in Q_in that rings every mode, and
the upper modes, with their broader resonances, answer first: the chiff. In
the first 30 ms of sound, harmonics 2–8 against the fundamental are 18.5 dB
(8′ C), 14.9 dB (c) and 6.1 dB (c¹) with a 1.5 ms pallet, and 6.7, 0.9 and
0.1 dB with a 40 ms one. A low cut-up adds to it, putting more of the
upper modes' windows on the way up: Hruška & Dlask (2020) found the
transients of an adjustable flue pipe, over blowing pressure and cut-up,
described by one parameter that follows the inverse Strouhal number.
**Velocity** therefore shapes the attack, not the level: an organ has no
loudness touch.

### 7. Overblowing and hysteresis

More wind shortens the jet's transit. Past a point the fundamental's phase
has drifted so far, and the next mode's has come so close to its best, that
the pipe jumps: an open pipe to its octave, a stopped one to its twelfth
(the 3rd harmonic is its second mode). Coming back, the overblown regime
holds on to far below where it began.

| c¹, cut-up | 0.5 | 0.6 | 0.7 |
|---|---|---|---|
| Principal: to the octave at | 671 Pa | 1251 Pa | 1804 Pa |
| U_j/(fW) there | 27.4 | 31.2 | 32.1 |
| back to the fundamental at | 148 Pa | 221 Pa | 300 Pa |
| U_j/(fW) there | 12.9 | 13.1 | 13.1 |
| Gedackt: to the twelfth at | 1325 Pa | 2080 Pa | 2991 Pa |
| U_j/(fW) there | 27.5 | 28.7 | 29.5 |
| back at | 622 Pa | 944 Pa | 1276 Pa |
| U_j/(fW) there | 18.9 | 19.4 | 19.3 |

The return comes at the same θ whatever the cut-up, so its pressure scales
as (fW)²; the jump up does nearly so (Auvray, Fabre & Lagrée 2012 study such
thresholds and their hysteresis in recorder-like instruments). The
overblown Gedackt sounds 2.84–2.92 times its fundamental, a twelfth a little
flat: the jet's phase pulls it below its second resonance. At the voiced
cut-up the Principal's c² jumps at 4.0 kPa and its c³ at 3.1 kPa, its c¹
at 5.4 kPa straight to the twelfth, and the bass and the Gedackt need more
wind than the knob gives; lower the cut-up to bring them within reach.

### 8. Tuning

Each pipe is cut to sound its note at 700 Pa. The linear analysis places the
resonance where the jet will make the pipe sound the note (the jet's phase
pulls the pitch off the resonance: c³'s Principal sounds 11 ¢ above it). The
full, saturated jet then moves the pitch again: the open pipes sound 6–17 ¢
flat of the linear prediction and the stopped ones 15–27 ¢ sharp. So
`tools/pipes-tuning.mjs` blows every pitch the organ has in the engine and
corrects it, as a voicer trims a pipe (the engine is then rebuilt on the new
table; `--check` measures the build). Every key on every rank then sounds
within 0.4 ¢ of its note at 48 kHz (and the keys the tests check at
44.1 kHz within 0.5 ¢). The keys past the manual were tuned after it
(`--extend`, which leaves every row a pipe of C–f³ reads as it was): they
sound within 2 ¢, the worst a pipe at 4.98 kHz that sits between two rows
the manual's pipes need, just under a mode's step at 5 kHz.

### 9. The wind

The bellows' weights set the pressure P_set. The wind reaches the chest
through a trunk with air mass M_t and resistance R_t; the chest has volume
V_c, so compliance C_c = V_c/ρc², and every speaking pipe drains it through
its flue (hH·U_j: 5.0 L/s for 8′ C, 0.81 L/s for c¹; a ten-key chord on three
stops draws 16 L/s). A Schwimmer, a small spring-loaded regulator inside
the chest, can hold the chest's pressure directly:

  C_r dP_r/dt = G_r (P_set − P_r) − Q_t
  M_t dQ_t/dt = P_r − P_c − R_t Q_t
  C_c dP_c/dt = Q_t + G_s (P_set − P_c) − Σ Q_pipes − Q_trem

with V_c = 0.8 m³ (C_c = 5.7×10⁻⁶ m³/Pa), R_t = 1000 Pa·s/m³, a reservoir
that recovers in 0.25 s (G_r = 2×10⁻³ m³/s per Pa), and the **Wind** knob s
moving from a steady wind (Schwimmer G_s = 2.5×10⁻³ (1 − s)² m³/s per Pa, a
short wide trunk, M_t = 5 kg/m⁴) to the Baroque flexible wind (no Schwimmer,
a long trunk, M_t = 150 kg/m⁴). The chest then rings at
f_w = 1/2π√(M_t C_c), from 30 Hz to 5.5 Hz. Under that ten-key chord the
steady wind sags 0.7 %, the default (s = 0.35) 1.3 %, and the flexible one
3.4 %, after a first dip of 9 % that rings at 5.5 Hz for about a second
while the trunk's air catches up: the wind breathes.

**Pitch and the wind.** If the pitch followed the jet, f ∝ √p, 5 % less
wind would drop it by ½Δp/p, 44 ¢. But the resonator sets the pitch:
the jet's phase moves by about ½(Δp/p)(ωτ + 0.33) and the resonance turns
that into Δf/f ≈ Δφ/2Q: 0.4 ¢ for 5 % less wind at c¹. In the engine, whose
saturated jet about doubles that, 5 % less wind lowers 8′ C (Q 127) by
0.35 ¢, c¹ (Q 78) by 0.89 ¢ and f³ (Q 42) by 2.2 ¢: far less than 44 ¢,
and least for the highest-Q pipes. (Mallock 1918 measured how the pitch of
organ pipes moves with the wind.) A big chord on the flexible wind drops a held
c¹'s foot pressure 3 % and its pitch 0.5 ¢; what you hear is its loudness
following the wind.

**The tremulant** is a valve that opens and shuts a leak from the chest
(up to 120 cm², c_d √(2P_c/ρ) through it) **Tremulant rate** times a
second. At half depth it pulses the default wind by ±4.8 %, and the pipes'
loudness with it. On a flexible wind, near the chest's own 5.5 Hz, it rocks
the whole wind system.

### 10. The sound and the stereo

The sound is the mouth's volume flow's rate of change, a monopole
p = ρ/4πr · dQ/dt (the output's scale is ρ/4πr at 1.2 m). An open pipe's
top breathes out the same flow: heard from in front the two ends
interfere, but in a church their powers add (at every mode the ends are a
whole number of half-wavelengths apart, so the cross term averages out),
and the mouth's flow stands for both. The Principal peaks at 0.30 (8′ C) to
0.05 (c³); a ten-key full-organ chord peaks at about 1.7 and goes through the
page's limiter. The jet's turbulence (velocity fluctuations at the flue
within ±0.1 % of U_j, from a seeded table, smeared by the jet like the
acoustic ones; the **Turbulence** knob) seeds every onset and leaves wind
noise 36 dB under the tone.

Many organs stand their pipes on two chests: the C side (C, D, E, F♯, G♯,
B♭) and the C♯ side, with the biggest pipes outermost. Each key is panned
where its pipes stand: C-side keys left, C♯-side keys right, the bass wide
and the treble near the middle.

### 11. The engine

- **Each step**, a sounding pipe reads the flow through its mouth a transit
  time earlier from a delay line (Catmull–Rom), at τ − 1 samples because one
  sample of the loop's delay is in the held pressure and the backward
  difference. The jet's low-pass is a backward-Euler step; tanh is a Padé
  approximant, x(27 + x²)/(27 + 9x²), smooth to its first derivative where
  it meets ±1 at ±3. Each mode advances exactly over the step under the
  pressure held, and the vortex-shedding loss is taken at the new mouth
  speed (a quadratic, solved exactly), so no extreme of wind or cut-up blows
  up.
- **Oversampling.** Pipes sounding 2 kHz or more (the Octave's top notes and
  the Mixture's upper pipes) run at twice the sample rate, brought down by a 63-tap
  half-band FIR. Past the manual, pipes of 6 kHz or more run at four times
  it, through the same half-band twice: their jet crosses the mouth in as
  little as 21 µs (c⁵'s 4′), and the delay line's interpolation needs more
  than two steps of it. Below that, at the sample rate, aliased lines stay about
  60 dB under the strongest harmonic.
- **Voices.** One voice per key holds its six pipes; pressing it again
  reopens the same pallet. Beyond 20 keys the quietest released key fades
  out over 30 ms, never one under 50 ms old. Voicing knobs give the next
  press new pipes and fade the old.
- **Release.** The pallet shuts in 8 ms (3–20 ms with MIDI release
  velocity) and the pipe rings down at its own losses: c¹ falls 40 dB within
  0.4 s, while 8′ C, with its Q of 127, takes more than a second.
- **Allocation.** None in `process()`: the voices and their delay lines are
  set aside in advance, and a key's pipes are voiced off the audio thread
  (below).
- **In C++**: the engine and the model are C++, run as WebAssembly on this
  page and as plugins (CLAP, VST3, AU and a standalone app), where the Space
  pedal is Hold on CC64 and the mod wheel raises the wind from 700 to
  3000 Pa. A key's six pipes are voiced off the audio thread (the plugins'
  worker; on the page, its own WebAssembly model, which sends them with the
  note), and the voices and their delay lines are set aside in advance. The
  views' pipes come from the WebAssembly model too.
- **Cost.** Ten held keys of Principal, Octave and Gedackt (30 pipes) take
  about 13–16 % of a core at 48 kHz on the shared machine this was built
  on, ten Principal pipes about 7–8 %.

## What to listen for

`examples/pipes/` (regenerate with `node tools/render-pipes.mjs`):

1. **01-toccata-in-d-minor-opening-on-the-plenum**: the opening gestures of
   the Toccata in D minor, BWV 565 (attributed to J. S. Bach), on Principal
   8′, Octave 4′ and Mixture with a quick touch, each gesture an octave
   lower, then a D minor chord over the low D: the chiff on every note, the
   bass slower to speak.
2. **02-principal-gedackt-octave-and-mixture-in-turn**: one phrase on each
   stop alone. The Gedackt is hollow (no even harmonics); the Mixture
   sounds octaves and fifths above the notes.
3. **03-a-fast-pallet-then-a-slow-one-the-chiff**: c, g and c¹ with the
   pallet opening in 1.5 ms (the upper modes speak first), then in 60 ms
   (the pipes swell in).
4. **04-the-wind-rises-the-pipe-overblows-and-drops-back-late**: c¹ on a
   low-cut Principal while the wind rises from 250 to 3000 Pa and falls
   back: it jumps to its octave near 2 kPa and drops back only near 300 Pa.
5. **05-a-big-chord-on-a-steady-wind-then-a-flexible-one**: a held c¹ that
   an eight-note chord joins, on a steady wind (barely a change) and on a
   flexible one, where the wind dips and breathes and the held note swells
   with it.
6. **06-gedackt-then-with-the-tremulant**: a phrase on the Gedackt, then
   with the tremulant beating 5.5 times a second.
7. **07-cut-up-high-then-as-voiced-then-low**: the same arpeggio with the
   mouths cut high (×1.5: round and slow), as voiced, and low (×0.8:
   bright and chiffy).

On the page, the **Jet in the mouth** view replays one cycle of the last
key's pipe slowed down, the jet drawn from its recorded motion; **Pressure
against flow** shows the drive and the jet's flips; **The wind** each
chord's sag; and the **Spectrum** marks the pipe's modes.

## Files

```
pipes/index.html, style.css           page
pipes/src/pipes-instrument.js         the descriptor: parameters, presets, range, engine, output chain
pipes/src/pipes-wasm.js               the engine and the model: the C++ as WebAssembly (pipes/wasm/pipes.wasm)
pipes/src/pipes-data.js               compass, stops and ranks, organ names, for the page
pipes/src/tuning-table.js             each pipe's correction from the linear analysis to its sounding pitch (the C++ copy's source)
pipes/src/pipes-params.js             parameters and presets
pipes/src/pipes-main.js               page wiring and views
native/instruments/pipes/             the C++ port: model, engine, generated tables, reference (plugins and WebAssembly)
test/pipes-tests.mjs                  node test/pipes-tests.mjs (27 tests, ~15 s)
tools/pipes-tuning.mjs                node tools/pipes-tuning.mjs → pipes/src/tuning-table.js and native/instruments/pipes/tuning-table.h (--check: the build)
tools/render-pipes.mjs                node tools/render-pipes.mjs → examples/pipes/
```

## Simplifications

- **The jet.** The receptivity (h/U_j)·v, a constant phase velocity of
  0.4 U_j (measured values rise with frequency), a delay rather than the
  jet's full transfer function, and the low-pass of section 3, which is
  this model's assumption. The jet's amplification is set by voicing rather
  than computed: the growth of long, turbulent organ-pipe jets has no simple
  law. The vortices at the labium are a quasi-steady loss, not the
  discrete-vortex dynamics that Auvray et al. (2014) compare with jet drive.
- **The resonator.** Exactly harmonic modes: the end corrections are held
  at their low-frequency values, though an open end's shrinks as ka grows,
  and the mouth's depends on frequency too. The mouth is a thin-walled
  ellipse, with no ears, languid or upper-lip thickness (Ernoult & Fabre
  2017 show how much these matter). The walls are smooth metal that does
  not vibrate. Only radiation and the walls take energy from a pipe whose
  jet has stopped, so the bass rings on longer after release than it may on
  an organ.
- **The voicing** follows rules (one θ per kind of pipe, one gain law, the
  flue and stopped scales), not a historical organ's pipes. The rules were
  chosen so that every pipe speaks its fundamental promptly at the default
  wind.
- **The wind.** The groove fills quasi-statically and the feet are open, so
  there are no pressure waves along the note channel (Finch & Nolle 1986)
  and no toe regulation. The reservoir recovers at one rate, the trunk is
  one air mass and resistance, the Schwimmer one conductance and the
  tremulant a leak.
- **The organ.** One manual, no pedal; four stops, and the Mixture three
  ranks where a Baroque mixture often has four to six (to stay within the
  CPU budget); equal temperament at A = 440 Hz, where Baroque organs were
  usually in meantone or a well-temperament, and often at a higher pitch.
- **The sound.** Each pipe radiates from its mouth as a monopole: no
  directivity, no case or façade, and the church is the page's synthetic
  room.

## Quality

Medium and Low give each pipe fewer modes: at most 8 up to 10 kHz at
Medium and 5 up to 7 kHz at Low (10 up to 15 kHz at High), never fewer than
its lowest three. The partials they carried are the pipe's weakest, so the
Principal loses a little of its edge at Low, while pitch and loudness stay
(within a fraction of a cent and a few tenths of a dB). They also let fewer
keys sound at once, 12 at Medium and 8 at Low against 20, the quietest
released key fading first: with every stop drawn each key is six pipes.
The jets keep their oversampling, which their timing needs.

## Prior art and references

**The original instrument.**
- Vitruvius (1914). *The Ten Books on Architecture*, trans. M. H. Morgan.
  Harvard University Press, Cambridge, Mass.
  [Project Gutenberg](https://www.gutenberg.org/ebooks/20239). Book IX
  ch. 8 credits Ctesibius with the first water organs; Book X ch. 8
  describes the water organ, its windchest, sliders and water-filled wind
  regulator.
- M. Praetorius (1619). *Syntagma musicum*, vol. II, *De Organographia*.
  Wolfenbüttel. [archive.org](https://archive.org/details/SyntagmaMusicumBd.21619).
- F. Bédos de Celles (1766–1778). *L'art du facteur d'orgues*, 4 parts.
  Académie royale des sciences, Paris.
  [IMSLP (BnF scans)](https://imslp.org/wiki/L'art_du_facteur_d'orgues_%28B%C3%A9dos_de_Celles_de_Salelles,_Fran%C3%A7ois_Lamathe%29).
- J. G. Töpfer (1855). *Lehrbuch der Orgelbaukunst*, vol. 1. Voigt,
  Weimar. [archive.org](https://archive.org/details/bub_gb_8FlDAAAAcAAJ).
  Includes the scaling (Mensur) of flue stops.
- P. Williams (1993). *The Organ in Western Culture, 750–1250*. Cambridge
  University Press. [archive.org](https://archive.org/details/organinwesterncu0000will).
- B. Owen (2001). "Tremulant." *Grove Music Online*.
  [doi:10.1093/gmo/9781561592630.article.49736](https://doi.org/10.1093/gmo/9781561592630.article.49736).

**The physics.**
- J. W. Strutt, Lord Rayleigh (1896). *The Theory of Sound*, vol. II, 2nd
  edn. Macmillan, London.
  [archive.org](https://archive.org/details/theoryofsound02raylrich). The
  conductivity of holes in a thin wall, the elliptic one among them, used
  here for the mouth's end correction.
- H. R. A. Mallock (1918). "Note on the effect of wind pressure on the
  pitch of organ pipes." *Proc. R. Soc. Lond. A* 95(666), 99–106.
  [doi:10.1098/rspa.1918.0051](https://doi.org/10.1098/rspa.1918.0051).
- F. Ingerslev & W. Frobenius (1947). "Some measurements of the
  end-corrections and acoustic spectra of cylindrical open flue organ
  pipes." *Transactions of the Danish Academy of Technical Sciences*
  1947, no. 1 (no DOI). Mouth corrections of about 1.5 D for diapason
  pipes.
- H. Levine & J. Schwinger (1948). "On the radiation of sound from an
  unflanged circular pipe." *Phys. Rev.* 73(4), 383–406.
  [doi:10.1103/PhysRev.73.383](https://doi.org/10.1103/PhysRev.73.383).
- L. Cremer & H. Ising (1967). "Die selbsterregten Schwingungen von
  Orgelpfeifen." *Acustica* 19(3), 143–153 (no DOI).
- J. W. Coltman (1968). "Sounding mechanism of the flute and organ pipe."
  *J. Acoust. Soc. Am.* 44(4), 983–992.
  [doi:10.1121/1.1911240](https://doi.org/10.1121/1.1911240).
- N. H. Fletcher (1976). "Jet-drive mechanism in organ pipes." *J. Acoust.
  Soc. Am.* 60(2), 481–483.
  [doi:10.1121/1.381105](https://doi.org/10.1121/1.381105).
- J. W. Coltman (1976). "Jet drive mechanisms in edge tones and organ
  pipes." *J. Acoust. Soc. Am.* 60(3), 725–733.
  [doi:10.1121/1.381120](https://doi.org/10.1121/1.381120).
- N. H. Fletcher (1976). "Sound production by organ flue pipes."
  *J. Acoust. Soc. Am.* 60(4), 926–936.
  [doi:10.1121/1.381174](https://doi.org/10.1121/1.381174).
- N. H. Fletcher (1976). "Transients in the speech of organ flue pipes – a
  theoretical study." *Acustica* 34(4), 224–233 (no DOI).
- T. L. Finch & A. W. Nolle (1986). "Pressure wave reflections in an organ
  note channel." *J. Acoust. Soc. Am.* 79(5), 1584–1591.
  [doi:10.1121/1.393293](https://doi.org/10.1121/1.393293).
- A. W. Nolle & T. L. Finch (1992). "Starting transients of flue organ
  pipes in relation to pressure rise time." *J. Acoust. Soc. Am.* 91(4),
  2190–2202. [doi:10.1121/1.403653](https://doi.org/10.1121/1.403653).
- M. P. Verge, R. Caussé, B. Fabre, A. Hirschberg, A. P. J. Wijnands &
  A. van Steenbergen (1994). "Jet oscillations and jet drive in
  recorder-like instruments." *Acta Acustica* 2(5), 403–419 (no DOI).
- M. P. Verge, B. Fabre, A. Hirschberg & A. P. J. Wijnands (1997). "Sound
  production in recorderlike instruments. I. Dimensionless amplitude of
  the internal acoustic field." *J. Acoust. Soc. Am.* 101(5), 2914–2924.
  [doi:10.1121/1.418521](https://doi.org/10.1121/1.418521).
- N. H. Fletcher (1998). "Organ pipes – a physicist's view." *ISO Journal*
  (International Society of Organbuilders) 3, 34–51.
  [ANU repository](https://openresearch-repository.anu.edu.au/items/323b450a-5846-4060-b3b6-1d19c4d8888e).
  Quotes Ingerslev & Frobenius's mouth correction.
- N. H. Fletcher & T. D. Rossing (1998). *The Physics of Musical
  Instruments*, 2nd edn, ch. 16 "Flutes and flue organ pipes"
  (pp. 503–551) and ch. 17 "Pipe organs" (pp. 552–580). Springer, New
  York. [doi:10.1007/978-0-387-21603-4](https://doi.org/10.1007/978-0-387-21603-4).
- P. de la Cuadra, C. Vergez & B. Fabre (2007). "Visualization and
  analysis of jet oscillation under transverse acoustic perturbation."
  *J. Flow Vis. Image Process.* 14(4), 355–374.
  [doi:10.1615/JFlowVisImageProc.v14.i4.20](https://doi.org/10.1615/JFlowVisImageProc.v14.i4.20).
- R. Auvray, B. Fabre & P.-Y. Lagrée (2012). "Regime change and
  oscillation thresholds in recorder-like instruments." *J. Acoust. Soc.
  Am.* 131(2), 1574–1585.
  [doi:10.1121/1.3672815](https://doi.org/10.1121/1.3672815).
- B. Fabre, J. Gilbert, A. Hirschberg & X. Pelorson (2012). "Aeroacoustics
  of musical instruments." *Annu. Rev. Fluid Mech.* 44, 1–25.
  [doi:10.1146/annurev-fluid-120710-101031](https://doi.org/10.1146/annurev-fluid-120710-101031).
- A. Ernoult & B. Fabre (2017). "Window impedance of recorder-like
  instruments." *Acta Acust. united Acust.* 103(1), 106–116.
  [doi:10.3813/AAA.919037](https://doi.org/10.3813/AAA.919037).
- V. Hruška & P. Dlask (2020). "On a robust descriptor of the flue organ
  pipe transient." *Archives of Acoustics* 45(3), 377–384.
  [doi:10.24425/aoa.2020.134054](https://doi.org/10.24425/aoa.2020.134054).
  An adjustable pipe's transients, over blowing pressure and cut-up,
  described by one parameter that follows the inverse Strouhal number,
  U_j/(fW).
- G. Villegas Curulla, A. Ernoult, B. Véron, B. Fabre & B. F. G. Katz
  (2026). "From bellows to pipe foot: experimental and lumped-parameter
  analysis of steady-state and transient pressure in a flue organ wind
  system." *Acta Acustica* 10, 90.
  [doi:10.1051/aacus/2026089](https://doi.org/10.1051/aacus/2026089).

**Earlier models and synthesis projects.**
- A. W. Nolle (1983). "Flue organ pipes: adjustments affecting steady
  waveform." *J. Acoust. Soc. Am.* 73(5), 1821–1832.
  [doi:10.1121/1.389405](https://doi.org/10.1121/1.389405). Compares
  pipes with an electrical oscillator analogue of the flue pipe.
- V. Välimäki, M. Karjalainen, Z. Jánosy & U. K. Laine (1992). "A
  real-time DSP implementation of a flute model." *Proc. IEEE ICASSP-92*
  2, 249–252. [doi:10.1109/ICASSP.1992.226073](https://doi.org/10.1109/ICASSP.1992.226073).
  Real-time digital-waveguide model of an air-jet instrument.
- [STK Flute class](https://ccrma.stanford.edu/software/stk/classstk_1_1Flute.html)
  (P. R. Cook & G. P. Scavone, Synthesis ToolKit): open-source
  digital-waveguide flute with a polynomial jet nonlinearity.
- M. P. Verge, A. Hirschberg & R. Caussé (1997). "Sound production in
  recorderlike instruments. II. A simulation model." *J. Acoust. Soc. Am.*
  101(5), 2925–2939. [doi:10.1121/1.419481](https://doi.org/10.1121/1.419481).
  Time-domain jet-drive simulation with vortex-shedding losses at the
  labium.
- B. Fabre & A. Hirschberg (2000). "Physical modeling of flue
  instruments: a review of lumped models." *Acta Acust. united Acust.*
  86(4), 599–610 (no DOI).
- C. Zinato (2008). "Method and electronic device used to synthesise the
  sound of church organ flue pipes by taking advantage of the physical
  modeling technique of acoustic instruments." US Patent 7,442,869 B2
  (Viscount International). [USPTO scan](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7442869).
- M. Miyamoto et al. (2013). "Numerical study on acoustic oscillations of
  2D and 3D flue organ pipe like instruments with compressible LES."
  *Acta Acust. united Acust.* 99(1), 154–171.
  [doi:10.3813/AAA.918599](https://doi.org/10.3813/AAA.918599).
  Large-eddy simulation of the flue pipe (not real time).
- S. Terrien, C. Vergez & B. Fabre (2013). "Flute-like musical
  instruments: a toy model investigated through numerical continuation."
  *J. Sound Vib.* 332(15), 3833–3848.
  [doi:10.1016/j.jsv.2013.01.041](https://doi.org/10.1016/j.jsv.2013.01.041).
  Delay, tanh nonlinearity and modal resonator, the structure of this
  model, analysed by numerical continuation.
- R. Auvray, A. Ernoult, B. Fabre & P.-Y. Lagrée (2014). "Time-domain
  simulation of flute-like instruments: comparison of jet-drive and
  discrete-vortex models." *J. Acoust. Soc. Am.* 136(1), 389–400.
  [doi:10.1121/1.4875716](https://doi.org/10.1121/1.4875716).
- L. Gabrielli, S. Tomassetti, S. Squartini, C. Zinato & S. Guaiana
  (2019). "A multi-stage algorithm for acoustic physical model parameters
  estimation." *IEEE/ACM Trans. Audio Speech Lang. Process.* 27(8),
  1229–1240. [doi:10.1109/TASLP.2019.2914530](https://doi.org/10.1109/TASLP.2019.2914530).
  Parameter estimation for a commercial flue-pipe model (jet delay,
  sigmoid nonlinearity, noise, waveguide bore).
- [Physis](https://www.viscountinstruments.com/about-us/technology/physis-tecnology/)
  (Viscount International): organs that Viscount says compute the physics
  of each pipe in real time, with a shared wind supply whose pressure
  varies with the stops drawn.
- [Organteq](https://www.modartt.com/organteq) (Modartt, 2019; Organteq 2,
  2023): pipe-organ synthesiser that Modartt describes as physically
  modelled and sample-free, covering flue and reed pipes.
