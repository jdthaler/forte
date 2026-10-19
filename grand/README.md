# Electric Grand

A physically modelled electric grand after the Yamaha CP-70: a real piano
action and real, short strings on a cast frame, with **no soundboard**. A
piezo under the bridge measures the force the strings push on it. Every
partial of every string, in both directions of vibration, is integrated
live. You can move the same strings onto a spruce soundboard and hear them
through microphones instead, so you can tell what the piezo, the frame and
the short scale each do to the sound.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/grand/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8) |
| `←` `→` | octave |
| `↑` `↓` | velocity (hammer speed 0.25–6 m/s) |
| `Space` | sustain pedal (lifts the dampers) |
| MIDI | notes, velocity, sustain pedal (CC64) |

## The physics

**The instrument.** The CP-70 (1976) has 73 keys and a grand action. Its
harp, the strings on a cast frame, sits in a separate case from the
keyboard. It has no soundboard. Each string has its own piezoelectric
pickup on the harp casting, feeding a preamp with a three-band EQ. The
bass strings are 67.9 cm (26¾ in), about a third of a concert grand's. The
lowest 15 keys have one string each and the rest have two, where a piano
has three. The model plays the 88 keys of the CP-80, A0–C8: its scale
carried on below E1 and above E7 (below). (Sources: Wikipedia's [*Yamaha CP-70*](https://en.wikipedia.org/wiki/Yamaha_CP-70)
page; the SMEM museum and Hollowsun descriptions. More under *Prior art
and references* below.) The model follows this. *Strings per note*
also offers a 1/2/3 acoustic-grand stringing.

**Scale and inharmonicity.** A stiff string pinned at both ends has

  ωₙ² = (T kₙ² + EI kₙ⁴)/μ,  kₙ = nπ/L,  so fₙ = n f₀ √(1 + Bn²)/√(1 + B),  B = π³Ed⁴/(64TL²)

(Fletcher 1964). The length follows a piano-like L ∝ f^−0.9 in the treble,
folded into the harp's depth so that the lowest string is 0.68 m. Plain
steel wire runs from ⌀1.06 mm at C4 to ⌀0.81 mm at E7. From E1 to F3
(keys 28–53) the strings are copper-wound, to a tension of 500 N at their
12-TET pitch, because a short string needs a lot of mass to reach a low
pitch. Each key's tension is *solved* so the stiff string's fundamental
lands exactly on its tuning target f₀: T = 4L²f₀²μ − EI k₁². The target is a
stretched scale (below). Past the CP-70's keys the CP-80's go on: below E1
the strings stay 0.68 m and wound to 500 N; above E7 the length falls as
1/f, since a plain wire's stress is 4ρ(Lf)² whatever its gauge, so C8
(4.3 cm) stays at E7's 48 % of breaking. The concert scale (*Scale design*) reuses the
Ribbon Piano's smoothed concert-grand layout. Both use the same steel
(E = 200 GPa).

| key | L (cm) | wire | T (N) | B | partial 10 | concert grand: L, B, partial 10 |
|---|---|---|---|---|---|---|
| E1 | 68.0 | ⌀1.49 core, wound ⌀5.5 | 492 | 2.1e-3 | +161 ¢ | 198 cm, 5.6e-5, +5 ¢ |
| E2 | 67.9 | ⌀1.31 core, wound ⌀2.7 | 496 | 1.3e-3 | +101 ¢ | 162 cm, 8.3e-5, +7 ¢ |
| C3 | 67.1 | ⌀1.21 core, wound ⌀1.7 | 497 | 9.2e-4 | +75 ¢ | 113 cm, 1.9e-4, +16 ¢ |
| C4 | 52.8 | ⌀1.06 plain | 532 | 8.4e-4 | +69 ¢ | 62 cm, 4.4e-4, +37 ¢ |
| A4 | 34.4 | ⌀1.00 plain | 563 | 1.5e-3 | +117 ¢ | 39 cm, 8.6e-4, +71 ¢ |
| E7 | 6.9 | ⌀0.81 plain | 535 | 1.6e-2 | — | 8 cm, 8.4e-3, — |

So a short string must be thick and heavily loaded to sound low, and
B ∝ d⁴/(TL²) punishes exactly that. The CP-70's E1 is 37× more
inharmonic than a concert grand's. Its 10th partial is 1.6 semitones
sharp of 10f₁ and its 20th is 5 semitones sharp. That stretched, clangy
series is the electric grand's bass "zing". Measurements on real pianos show
the same trend: the smaller the piano, the larger B (Young 1952; Fletcher &
Rossing, ch. 12). The tensions sit at 11–48 % of breaking stress. *Wire bending
stiffness* scales EI, and 0 makes the strings ideal and harmonic.

**Stretch tuning.** A stiff string's partial 2 sits above twice its
fundamental, by s = 1200 log₂(√(1 + 4B)/√(1 + B)) ≈ 2600 B cents, so on this
scale 12-TET octaves beat: A5–A6 at 10 Hz, C6–C7 at 15 Hz, E6–E7 at 25 Hz. A
tuner sets each octave beatless instead, with partial 2 of the lower note on
the fundamental of the upper. *Stretch tuning* (on by default) does the same,
outward from a temperament octave around A4 (E♭4–D5, A4 at 440 Hz, the
stretch spread evenly across it), with each key's own B: a Railsback curve.
On the CP-70 scale it runs from −12 ¢ at E1 through −1.5 ¢ at C4 to +17 ¢ at
C7 and +25 ¢ at E7 (−16 ¢ at A0, +48 ¢ at C8). The concert scale, five times less inharmonic in the
bass, needs −1.5 to +14 ¢. The tests check that every 2:1 octave coincides
(to 10⁻³ Hz in the model, and within 0.5 Hz in the output at C6–C7 and
A5–A6), and that with it off every key is within 3 ¢ of 12-TET.

**Strings in modal form.** Each partial n of each unison string, in each
polarisation, is a damped oscillator advanced with the exact two-pole
recursion (impulse-invariant), so the tuning is exact at every frequency.
Internal losses are σ = b₁ + b₃ω², with b₁ = 0.35 s⁻¹ (air) and
b₃ = 2·10⁻⁹ s (internal friction), raised ×1.5 and ×2.25 for wound strings.
This is the form Chaigne & Askenfelt (1994) use. The unisons are mistuned by
±d/2. *Unison mistuning* sets d, and it varies 0.6–1.4× from key to key, the
way a tuner's errors do. Partials run up to *Highest partial* (10 kHz):
142 oscillators for E1 and 116 for the bichord C4. A voice stops
integrating its top partials once each has died below −140 dBFS (until the
key is struck again), so a held or pedalled note gets cheaper as its treble
fades (see *CPU* below).

**Hammer.** A felt hammer is a mass on a nonlinear, hysteretic spring,
F = K[δᵖ + α d(δᵖ)/dt]₊. It uses Chaigne & Askenfelt's graded values (C2 / C4 /
C7: M = 4.9 / 2.97 / 2.2 g per string, p = 2.3 / 2.5 / 3.0), α = 50 µs, and a
contact patch from 18 mm in the bass to 3 mm in the treble (a Hann window
that filters the partials whose wavelength it spans). The contact is solved
implicitly every sample, with a scalar Newton iteration against all modes,
as in the [Ribbon Piano](../piano/README.md). Key velocity maps to 0.25–6 m/s (Askenfelt &
Jansson 1991). At C4 mf (2.3 m/s) the felt is in contact for 2.0 ms and
peaks at 19 N. Harder felt and faster blows shorten the contact. Above E7,
where the data stop, the felt hardens so the contact keeps to E7's two
periods (τ ∝ (M/K)^(1/(p+1)), 0.5 ms at C8): carried on as it was, it
would last three periods at C8 and leave it 15 dB quieter than E7.
*Strike position* (default 0.12 L, about L/8.3) weakens the partials with a
node near the hammer, the 8th most. The action needs about 60 ms to bring
the hammer back for another blow, so a key repeated faster than that (16
times a second) gets no new blow.

**Tension modulation.** A hard blow stretches the string, so its tension
rises by ΔT = (E A_core/2L)·∫y_x² dx (Kirchhoff 1883; Carrier 1945) and
every partial goes sharp, then glides back as the note decays. In modal
form ∫y_x² = Σ (kₙ²/μ) qₙ² over both polarisations, and kₙ²/μ is also how
much ωₙ² rises per newton, so each unison string's ΔT moves all of its
partials, each sample, through its recursion coefficient (to first order,
with ΔT held below T/10 so the step stays stable). Only the steel core
stretches; the copper winding adds mass, not stiffness. These short, stiff
strings stretch a lot. On one string at full velocity (6 m/s), E1 starts
45 ¢ sharp, is 25 ¢ sharp after half a second and 6 ¢ after 1.8 s; E2
starts 35 ¢ sharp; C4 18 ¢. It goes with the square of the blow: at
velocity 0.6, E2 starts 3 ¢ sharp and C4 1 ¢, and at 0.2 E2 moves 0.2 ¢
(tested). Once ΔT has fallen below 10⁻⁵ T (a hundredth of a cent) the voice
runs linear again until the next blow; while it glides it costs about 40 %
more. *Tension modulation* under *Strings* switches it off.

**The bridge, two polarisations, Weinreich.** The string pushes on the
bridge with

  F = T ∂y/∂x + bending shear = Σ bₙqₙ,  bₙ = ±√(2/μL) (T kₙ + EI kₙ³).

A bridge of admittance G (velocity per force) moves with G·F. In modal form
that is a rank-one damping matrix c cᵀ, with cₙ = √G bₙ/ωₙ, shared by every
mode of every unison string in that direction. On its own, a mode drains
σ_b = G(T + EIkₙ²)/L into the bridge. This is the small-G root of the exact
end condition tan kL = iG√(Tμ), and the tests check the two against each
other. Shared, it is Weinreich's (1977) coupled-strings physics. In-phase
unison motion drains N σ_b, antiphase motion none. The engine solves this
damping implicitly, with the bridge velocity centred on each step (a
rank-one Sherman–Morrison solve: one scalar per polarisation per sample),
and sets each mode's recursion so that on its own it decays at exactly
σ_int + σ_b. A bridge velocity lagged by a sample would drain the top
partials too weakly (by 30 % at 15 kHz). Every partial up to 15 kHz now
drains at its model rate, at 44.1 and 48 kHz alike (tested to 3 %). The hammer starts both
strings in phase, so with a mobile bridge the note first falls fast (the
prompt sound) and then rings on in what does not reach the bridge (the
aftersound). Each string vibrates in two polarisations:

* **V**, along the piezo's axis. It couples through G_V.
* **H**, sideways. The bridge yields less sideways, so G_H = 0.2 G_V
  (*Sideways / vertical admittance*).

The hammer's blow is tilted by α = 6° from the bridge's stiff axis
(*Polarisation mixing angle*), so H gets sin²α ≈ 1 % of the energy. This is
the same as Weinreich's off-diagonal bridge admittance, written in the
bridge's principal axes. A springy sideways support of stiffness K_H
lengthens the string by T/K_H. That puts H flat by T/(K_H L), about 0.2 ¢
at C4 for K_H = 10⁷ N/m, and H beats against V.

**Sympathetic strings.** Every other key's strings meet the same bridge, and
while their dampers are up (the pedal down, the key held, or the keys above
E6, which have none) they ring along with whatever sounds. Each string's
motion splits, by superposition, into what its own hammer started (its
voice, unchanged) and what the others drive: a *group* per key, its unison's
in-phase motion (couplings √ν c, draining at ν c²/2 as the voice's bridge
drains it), its lowest 16 partials below 4 kHz in V (in H too when H drains
at least a quarter as fast; at the default 0.2 it does not). A group feels
the bridge velocity S = Σ c q̇ of every voice and every other group, times κ
(*Sympathetic resonance*: the share of the bridge's motion one string feels
from another's, 1 if they all met it at one point), and never its own key's
voice. Its own bridge loss is in its decay rate, so the strings also take
back what they give, and for κ ≤ 1 they only lose energy. The piezo and the
soundboard hear a group's force on the bridge as they hear a voice's. Hold C4
and strike C3, and C4 rings along about 90 times as strongly as C♯4 would
(in energy). On the iron frame that is faint, more than 30 dB under the
note, as on a real CP-70; a soundboard's bridge moves about 20 times more,
and the strings ring along about 14 times as strongly. With the pedal down
841 partials run, about twice what four sustained notes cost.

**No soundboard: the frame.** The CP-70's bridge sits on the cast harp. We
take its admittance to be G = 5·10⁻⁵ s/kg (*Frame admittance*), 30× below a
soundboard's mean. That figure is an estimate; we found no measurement. At
C4 it drains σ_b = 0.05 s⁻¹ per string, against 0.36 s⁻¹ of internal loss.
The strings keep their energy, as on a solid-body electric guitar. C4's
fundamental has T60 = 15 s and decays almost as one exponential. Weinreich's
effect is weak, and the unisons simply beat: the mistuning, 2πΔf = 0.84 s⁻¹,
is far above the coupling, 2σ_b = 0.10 s⁻¹. The info panel shows this
comparison for every key.

**Piezo and preamp.** A piezo stack under the bridge gives a charge
Q = d₃₃·F_V. Sideways force reaches it only weakly: we use g_H = 0.25 of
F_H (*Piezo sideways sensitivity*). The element is a capacitor
(C = 10 nF). Loaded by the preamp's input resistance R, it is a
first-order high-pass at 1/(2πRC): 34 Hz at 470 kΩ, 723 Hz at 22 kΩ
(*Preamp input resistance*). The force weights each partial by its slope,
not its displacement: by n(1 + Bn²)/(1 + B) relative to the displacement,
or 2√((T + EIkₙ²)/L) newtons per √J of modal energy. So the piezo hears
the strings bright. For C4 the spectral centroid of the partials goes from 296 Hz in
displacement to 429 Hz in bridge force. A short string makes more force per
joule, but the top octave and a half still takes little energy from the
hammer, because the felt's contact (0.9–1.3 ms at mf) outlasts the string's
period (0.4–1.1 ms). Those piezos are trimmed up to +4.5 dB, the way a technician
voices a scale. The pickups are panned by their place along the bridge to
the preamp's stereo outputs.

**EQ.** The preamp's three bands are analog stages discretised with the
bilinear transform (prewarped):

* bass and treble are first-order RC shelves, (s + gω)/(s + ω) at 120 Hz
  and (gs + ω)/(s + ω) at 3.5 kHz, each mirrored for cuts;
* the middle is a second-order active band (RBJ peaking) at 1 kHz, Q = 0.8.

Each stage is ±15 dB. The engine's response matches the analog prototypes
to 0.5 dB, measured on note partials. The EQ applies only to the piezo.

**The acoustic alternative: a soundboard.** *Bridge mounted on → A spruce
soundboard* glues the same bridge to a plate. We model it as an equivalent
isotropic, simply supported plate, 1.3 × 0.77 m, with ρh = 6.7 kg/m² and
D = 1040 N·m at 9 mm (spruce plus ribs smeared in) and loss factor 3 %. Its
first mode is at 45 Hz. It has one mode per 25 Hz (Weyl: n(f) = (S/2)√(ρh/D)),
so 225 modes below 6 kHz, and its coincidence frequency is 1.5 kHz. These
numbers are in the range reported for piano soundboards (e.g. Ege, Boutillon
& Rébillat 2013); they are not a particular piano's.

* **Bridge admittance.** The bridge drives the plate at three points (bass,
  middle, treble). The modal sum Y(ω) = Σ φₖ² iω/(ωₖ² − ω² + 2iσₖω), with a
  50 g bridge mass in series, gives each string partial its own bridge
  conductance Re Y(ωₙ). Its mean over frequency is 1/(8√(Dρh)) = 1.5·10⁻³
  s/kg, the infinite-plate value (Cremer & Heckl); the test finds it within
  5 %. Partials that land on a board resonance drain fast and the rest
  slowly. On C4, T60 is 1.2 s for partial 6 and 9.0 s for the fundamental.
  Near a resonance the drain is capped at what the board itself can
  dissipate, ηω/4: past that, string and board share the energy rather than
  pass it on (Gough 1981).
* **Radiation.** Each plate mode radiates toward two far-field microphones
  35° off the normal, one leaning toward the bass end and one toward the
  treble. This is the baffled Rayleigh integral, in closed form
  (∫₀ᵃ sin(mπx/a) e^{iκx} dx), with κ = (ω/c) sin θ. At low frequency, modes
  with an even index nearly cancel themselves, and odd–odd modes radiate as
  monopoles. The board is not baffled, so below c/(2πℓ) ≈ 110 Hz (ℓ = 0.5 m)
  its two faces short-circuit, a first-order high-pass. The microphones hear
  the plate's acceleration. Each mode's radiation phase is kept as a sign,
  relative to the board's centre (the delay common to every mode is
  dropped): monopole-like modes reach both microphones in phase and
  dipole-like ones in antiphase. On a phrase the two channels correlate at
  0.95, so the pair sums to mono without loss.
* **Above the modal band.** The plate's modes are integrated one by one up
  to 6 kHz. The modes above still radiate, and through each mode's mass line
  the integrated ones do too. A residual path carries the rest: per
  microphone, a 4th-order high-pass at the band's edge and six 4th-order
  band-passes a third of an octave wide (×1.25), up to 3.8 × 6 kHz. Each band's
  power is the diffuse-field estimate n(f) ω ⟨(Rφ)²⟩/(4η) from the same
  plate's modes in that band, and the band gains are solved together so
  their skirts are accounted for. Against the same plate integrated mode by
  mode to 25 kHz, every band from 6 to 16 kHz is within 1.5 dB for boards
  9–16 mm thick (tested at 9 and 14 mm). Without the residual the 9 mm board
  was 1–5 dB short there. The strings drain into the board at the
  infinite-plate conductance above 6 kHz, as before.

The soundboard costs the strings their sustain. Over eight keys, a note
falls 23.6 dB in 3 s on the board against 16.8 dB on the frame. It adds the
Weinreich double decay. It colours the sound: some partials and some notes
(E♭4) are loud, others weak, and the hammer's push, passed to the bridge,
knocks the board's low modes. The microphones are trimmed to sit about 4 dB
below the frame's piezo (on an mf phrase, −4.2 dB both in mono and in
stereo), so that the board's loudest note (E♭4, peaking at 0.56 at ff)
stays under the limiter.

**CPU.** Every oscillator costs about the same, so the engine keeps a
budget (4000 by default). Past it, the quietest, oldest voices fade out.
Partials that have died away stop being integrated, so the cost follows
what is still sounding. In Node on an Apple M2 Max, ten voices take 7–9 %
of a core, a pedalled 25-note arpeggio 13–16 %, the concert-grand preset
14–17 % and acoustic stringing to 16 kHz 15–18 % (before: 13, 25, 27 and
36 %);
just after a big chord is struck it costs the full count for a moment. On
the page the budget follows the audio thread's measured load. Over 60 % on
average, or 90 % in the worst block, it shrinks by a quarter, and under
30 % it grows back by a tenth. Touch devices, usually slower, start from a
ceiling of 2400.

**In C++.** The engine and model are C++ (`native/instruments/grand`). They
run as WebAssembly on this page, where the slow-motion view and the mode
table re-run the strike with them, and as plugins (CLAP, VST3, AU and a
standalone app), where CC64 is the damper pedal. In the plugins, a key's
partials (and the soundboard, a few milliseconds) are built on a worker
thread for the parameters they depend on; the WebAssembly builds them when
they are first needed. Ten bass-heavy voices take about 6 % of a core in
C++.

## What to listen for

`examples/grand/`, each isolating one effect:

1. **CP-70 ballad**: pedalled chords over the short bass strings.
2. **Piezo, then soundboard (piezo), then soundboard (microphones)**: the
   same C3–G3–E4 chord three times.
   * On the frame it falls 14 dB in 2 s.
   * On the soundboard, through the same piezo, it falls 18 dB in 2 s. Only
     the bridge changed.
   * Through the microphones you hear the board's resonant colour and knock,
     and about 5 dB less level than on the frame.
3. **Bass: CP-70 strings, then concert-grand strings**: E1, then A1 + E2.
   The short strings' upper partials are stretched by over a semitone, so
   you hear a metallic, clangy zing. The long strings sound round and
   harmonic.
4. **Weinreich: one string, then two, on a soundboard**: middle C. One
   string, struck square on, decays as one exponential (4.9 dB/s
   throughout, the model's σ_int + σ_b). Two strings with 1.5 ¢ of mistuning
   and a 10° tilt give a prompt sound at 7.8 dB/s in the first half second,
   then fall at 4.4 dB/s on average over the next three, through the slow
   beat of the mistuned pair.
5. **Strike position**: C3 struck at L/8, then at L/2, then at L/25.
   * At L/2 the even partials vanish: the 250 Hz octave band (the 2nd
     partial) falls by 29 dB, and the note is hollow and clarinet-like.
   * At L/25 the note is bright and thin.
6. **Preamp**: a riff three times. First flat; then a stage EQ (bass +4,
   middle −5, treble +7 dB); then a 22 kΩ preamp input, whose 723 Hz
   high-pass takes the body out of the piezo (7 dB quieter, thin).
7. **Unisons in tune, then honky-tonk**: an A major chord with 0.3 ¢ and
   then 10 ¢ between each note's two strings. The envelope roughness (the
   spread of the 20 ms level about its trend) rises from 0.3 to 1.8 dB. This
   is the out-of-tune CP-70 sound many remember. (With the octaves stretched,
   A3 and A4 no longer beat against each other; in 12-TET the in-tune take
   measures 0.95 dB.)

On the page, the slow-motion view replays the focused key's strike. You
see the kink leave the hammer and reflect, and the bridge force (what the
piezo hears) stepping at each arrival. The table lists each partial's
frequency, its stretch, its prompt and aftersound T60, and its level in
displacement and at the transducer. *Why the piezo is bright* plots those
two (and the microphone's) side by side.

Regenerate the demos with `node tools/render-grand.mjs`. Run the tests with
`node test/grand-tests.mjs` (33 tests, ~30 s).

## Files

```
grand/index.html, style.css          page
grand/src/grand-params.js            parameters and presets
grand/src/grand-main.js              page wiring; slow-motion string, modes table, spectrum, partial weights; load-following oscillator budget
grand/src/grand-wasm.js              the engine and model as WebAssembly (grand/wasm/grand.wasm), for the page and the tests
native/instruments/grand/            the physics in C++: model (scale, strings, hammer, bridge, soundboard), engine (modes, implicit hammer, bridge channels, board, piezo, EQ), generated tables, reference
test/grand-tests.mjs                 node test/grand-tests.mjs
tools/render-grand.mjs               node tools/render-grand.mjs → examples/grand/
```

## Simplifications

* **No longitudinal modes.** Tension modulation gives the pitch glide, but
  its stretch only retunes the transverse modes: the longitudinal modes it
  drives, and the phantom partials at sums of transverse frequencies, are
  left out. With short, stiff, heavily wound strings these would matter
  more than on a concert grand.
* **The frame's admittance is a guess** (5·10⁻⁵ s/kg, frequency-independent,
  real). We have found no measurement of the CP-70's bridge mobility. The
  piezo's capacitance (10 nF) and the preamp's EQ corners are typical
  values, not Yamaha's. The scale (lengths and gauges) is a smooth design
  through the one published length, not a measured string list.
* **Bridge coupling is resistive.** The reactive part of the admittance
  appears only as the sideways spring's frequency shift. On the soundboard,
  the strings drain into the plate (Re Y), but the plate does not pull their
  frequencies, and the board is driven one way: the plate's vibration does
  not act back on the strings. Different keys couple only through the
  bridge's signal, scaled by *Sympathetic resonance* (below), not through the
  plate's modes, and a sympathetic string is its unison's in-phase motion,
  its lowest 16 partials below 4 kHz, without tension modulation.
* **The soundboard is a stand-in.** It is a flat, isotropic, simply
  supported rectangle. A real board is crowned, ribbed, orthotropic and
  irregular, and its modes above ~1 kHz localise between ribs. The
  radiation phase of each mode is kept only as a sign. The two microphones
  are in the far field, with no room. The shell's *Room* adds one. Above
  6 kHz the board radiates through the statistical residual. On thin boards
  (5–7 mm), whose radiation toward the microphones peaks just above 6 kHz
  and then falls very steeply, it runs up to 9 dB hot between 6 and 12 kHz
  (without it they were 10–22 dB short).
* **Hammer and dampers.** The hammer has no shank flex or escapement, and it
  strikes all of a key's strings equally. A real hammer's uneven contact
  also starts the antiphase unison motion directly. The damper is a felt
  pad at 16 % of the length, so partials with a node under it ring on.
  Keys above E6 have no dampers.
* **Stretch tuning is octaves only.** It sets every 2:1 octave beatless, from a
  temperament octave in which the stretch is spread evenly. A tuner would
  weigh fifths and the 4:2 and 6:3 octaves too, especially in the bass.
* The CP-70's tremolo (an electronic amplitude modulation, on some units)
  is left out.

## Prior art and references

### The original instrument

Yamaha's CP-70 was first made in 1976, with 73 keys. The 88-key CP-80 and
the CP-70B followed at the 1978 NAMM show, and production ran to 1985. The
strings are heard through piezoelectric pickups mounted on the harp
casting ([Wikipedia](https://en.wikipedia.org/wiki/Yamaha_CP-70)). Nippon
Gakki (Yamaha) patented the pickups:

* Katayama, S. & Murakami, K. [US 4,189,969](https://patents.google.com/patent/US4189969A/en),
  "Pickup unit and pickup assembly for musical instrument" (Nippon Gakki;
  priority 1976, granted 1980): a piezoelectric element moulded into a
  resin block whose crest carries the string.
* Murakami, K. [US 4,211,139](https://patents.google.com/patent/US4211139A/en),
  "Pickup mechanism" (Nippon Gakki; priority 1977, granted 1980): an
  electric piano's bridge on a vibration-transmitting plate that carries
  the pickup.

Earlier pianos that picked up their strings electrically:

* The [Neo-Bechstein](https://bechstein.com/die-welt-von-bechstein/tradition/1930-1945/)
  (Bechstein, Walther Nernst and Siemens & Halske, shown in 1931): a short
  grand without a soundboard, its strings in groups of five over
  microphone-like capsules.
* Benioff, H. [US 3,049,958](https://patents.google.com/patent/US3049958A/en),
  "Electro-piano" (priority 1959, granted 1962): piano strings picked up
  piezoelectrically.
* Martin, D. W. & Stein, J. L. [US 3,519,721](https://patents.google.com/patent/US3519721A/en),
  "Electropiano with plural piezoelectric pickups on unitary acoustic
  rail" (granted 1970).

### The physics

The string, hammer and coupled-string literature is listed under the
[Ribbon Piano](../piano/README.md#prior-art-and-references). The papers
this page draws on directly:

* Kirchhoff, G. (1883). *Vorlesungen über Mechanik*. Teubner, Leipzig, and
  Carrier, G. F. (1945). "On the non-linear vibration problem of the
  elastic string." *Q. Appl. Math.* 3(2), 157–165.
  [doi:10.1090/qam/12351](https://doi.org/10.1090/qam/12351). Tension
  modulation.
* Railsback, O. L. (1938). "Scale temperament as applied to piano tuning."
  *J. Acoust. Soc. Am.* 9, 274 (abstract).
  [doi:10.1121/1.1902056](https://doi.org/10.1121/1.1902056). The
  stretched tuning curve.
* Young, R. W. (1952). "Inharmonicity of plain wire piano strings."
  *J. Acoust. Soc. Am.* 24, 267–273.
  [doi:10.1121/1.1906888](https://doi.org/10.1121/1.1906888)
* Fletcher, H. (1964). "Normal vibration frequencies of a stiff piano
  string." *J. Acoust. Soc. Am.* 36, 203–209.
  [doi:10.1121/1.1918933](https://doi.org/10.1121/1.1918933)
* Wallace, C. E. (1972). "Radiation resistance of a rectangular panel."
  *J. Acoust. Soc. Am.* 51, 946–952.
  [doi:10.1121/1.1912943](https://doi.org/10.1121/1.1912943). Radiation of
  a baffled plate's modes.
* Weinreich, G. (1977). "Coupled piano strings." *J. Acoust. Soc. Am.* 62,
  1474–1484. [doi:10.1121/1.381677](https://doi.org/10.1121/1.381677)
* Gough, C. E. (1981). "The theory of string resonances on musical
  instruments." *Acustica* 49, 124–141.
* Askenfelt, A. & Jansson, E. V. (1991). "From touch to string vibrations.
  II: The motion of the key and hammer." *J. Acoust. Soc. Am.* 90,
  2383–2393. [doi:10.1121/1.402043](https://doi.org/10.1121/1.402043)
* Chaigne, A. & Askenfelt, A. (1994). "Numerical simulations of piano
  strings. I. A physical model for a struck string using finite difference
  methods." *J. Acoust. Soc. Am.* 95, 1112–1118.
  [doi:10.1121/1.408459](https://doi.org/10.1121/1.408459). And "II.
  Comparisons with measurements and systematic exploration of some
  hammer-string parameters." 95, 1631–1640.
  [doi:10.1121/1.408549](https://doi.org/10.1121/1.408549)
* Giordano, N. (1998). "Mechanical impedance of a piano soundboard."
  *J. Acoust. Soc. Am.* 103, 2128–2133.
  [doi:10.1121/1.421358](https://doi.org/10.1121/1.421358)
* Fletcher, N. H. & Rossing, T. D. (1998). "The Piano." Ch. 12 of *The
  Physics of Musical Instruments*, 2nd ed., Springer, 352–398.
  [doi:10.1007/978-0-387-21603-4_12](https://doi.org/10.1007/978-0-387-21603-4_12)
* Cremer, L., Heckl, M. & Petersson, B. A. T. (2005). *Structure-Borne
  Sound*, 3rd ed. Springer.
  [doi:10.1007/b137728](https://doi.org/10.1007/b137728). The
  infinite-plate mobility.
* Ege, K., Boutillon, X. & Rébillat, M. (2013). "Vibroacoustics of the
  piano soundboard: (Non)linearity and modal properties in the low- and
  mid-frequency ranges." *J. Sound Vib.* 332, 1288–1305.
  [doi:10.1016/j.jsv.2012.10.012](https://doi.org/10.1016/j.jsv.2012.10.012)
* Bristow-Johnson, R. [*Audio EQ Cookbook*](https://www.w3.org/TR/audio-eq-cookbook/),
  W3C Working Group Note (2021, ed. R. Toy). The peaking-filter design
  used for the middle band.

### Earlier models of the electric grand

* [CP-80](https://www.modartt.com/cp-80) for Pianoteq (Modartt, 2007): a
  CP-80 add-on for Pianoteq's physically modelled engine, now in Modartt's
  KIViR collection of historical instruments.
* [Electric Grand EG70](https://rekkerd.org/soundfontsit-releases-electric-grand-eg70/)
  (SoundFonts.it, 2008): announced as a physical-modelling simulation of
  the CP-70.
* [CP-70 V](https://www.arturia.com/products/software-instruments/cp-70-v/overview)
  (Arturia): sampling combined with modelled circuitry.
* [Electric Grand CP-70](https://www.spectrasonics.net/products/keyscape/models/electric-grand-cp70/)
  (Spectrasonics): a CP-70 in the Keyscape keyboard collection.
* [EGP](https://www.uvi.net/egp) (UVI): a sample-based electric grand
  inspired by the CP-70.
* [cp80-model](https://github.com/beneke7/cp80-model) (2026): an
  open-source real-time model of the CP-70/CP-80 with modal strings,
  nonlinear hammer contact and a piezo readout of the bridge force.
* The acoustic-piano models (Pianoteq, Roland's V-Piano and the academic
  ones) are listed under the
  [Ribbon Piano](../piano/README.md#prior-art-and-references).
