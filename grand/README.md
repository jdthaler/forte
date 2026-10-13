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
| `Z…/` and `Q…]` rows | play (73 keys, E1–E7) |
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
has three. (Sources: Wikipedia's *Yamaha CP-70* page; the SMEM museum
and Hollowsun descriptions.) The model follows this. *Strings per note*
also offers a 1/2/3 acoustic-grand stringing.

**Scale and inharmonicity.** A stiff string pinned at both ends has

  ωₙ² = (T kₙ² + EI kₙ⁴)/μ,  kₙ = nπ/L,  so fₙ = n f₀ √(1 + Bn²)/√(1 + B),  B = π³Ed⁴/(64TL²)

(Fletcher 1964). The length follows a piano-like L ∝ f^−0.9 in the treble,
folded into the harp's depth so that the lowest string is 0.68 m. Plain
steel wire runs from ⌀1.06 mm at C4 to ⌀0.81 mm at E7. Below F3 the strings
are copper-wound to a tension of 500 N, because a short string needs a lot
of mass to reach a low pitch. Each key's tension is *solved* so the stiff
string's fundamental is exactly on 12-TET: T = 4L²f₀²μ − EI k₁². The concert
scale (*Scale design*) reuses the Ribbon Piano's smoothed concert-grand
layout. Both use the same steel (E = 200 GPa).

| key | L (cm) | wire | T (N) | B | partial 10 | concert grand: L, B, partial 10 |
|---|---|---|---|---|---|---|
| E1 | 68.0 | ⌀1.49 core, wound ⌀5.5 | 499 | 2.0e-3 | +159 ¢ | 198 cm, 5.6e-5, +5 ¢ |
| E2 | 67.9 | ⌀1.31 core, wound ⌀2.7 | 499 | 1.2e-3 | +100 ¢ | 162 cm, 8.3e-5, +7 ¢ |
| C3 | 67.1 | ⌀1.21 core, wound ⌀1.7 | 500 | 9.1e-4 | +75 ¢ | 113 cm, 1.9e-4, +16 ¢ |
| C4 | 52.8 | ⌀1.06 plain | 533 | 8.4e-4 | +69 ¢ | 62 cm, 4.4e-4, +37 ¢ |
| A4 | 34.4 | ⌀1.00 plain | 563 | 1.5e-3 | +117 ¢ | 39 cm, 8.6e-4, +71 ¢ |
| E7 | 6.9 | ⌀0.81 plain | 519 | 1.7e-2 | — | 8 cm, 8.6e-3, — |

So a short string must be thick and heavily loaded to sound low, and
B ∝ d⁴/(TL²) punishes exactly that. The CP-70's E1 is 37× more
inharmonic than a concert grand's. Its 10th partial is 1.6 semitones
sharp of 10f₁ and its 20th is 5 semitones sharp. That stretched, clangy
series is the electric grand's bass "zing". Measurements on real pianos show
the same trend: the smaller the piano, the larger B (Young 1952; Fletcher &
Rossing, ch. 12). The tensions sit at 13–46 % of breaking stress. *Wire bending
stiffness* scales EI, and 0 makes the strings ideal and harmonic.

**Strings in modal form.** Each partial n of each unison string, in each
polarisation, is a damped oscillator advanced with the exact two-pole
recursion (impulse-invariant), so the tuning is exact at every frequency.
Internal losses are σ = b₁ + b₃ω², with b₁ = 0.35 s⁻¹ (air) and
b₃ = 2·10⁻⁹ s (internal friction), raised ×1.5 and ×2.25 for wound strings.
This is the form Chaigne & Askenfelt (1994) use. The unisons are mistuned by
±d/2. *Unison mistuning* sets d, and it varies 0.6–1.4× from key to key, the
way a tuner's errors do. Partials run up to *Highest partial* (10 kHz):
142 oscillators for E1 and 116 for the bichord C4.

**Hammer.** A felt hammer is a mass on a nonlinear, hysteretic spring,
F = K[δᵖ + α d(δᵖ)/dt]₊. It uses Chaigne & Askenfelt's graded values (C2 / C4 /
C7: M = 4.9 / 2.97 / 2.2 g per string, p = 2.3 / 2.5 / 3.0), α = 50 µs, and a
contact patch from 18 mm in the bass to 3 mm in the treble (a Hann window
that filters the partials whose wavelength it spans). The contact is solved
implicitly every sample, with a scalar Newton iteration against all modes,
as in `piano/src/engine.js`. Key velocity maps to 0.25–6 m/s (Askenfelt &
Jansson 1991). At C4 mf (2.3 m/s) the felt is in contact for 2.0 ms and
peaks at 19 N. Harder felt and faster blows shorten the contact.
*Strike position* (default L/8) removes the partials with a node there.

**The bridge, two polarisations, Weinreich.** The string pushes on the
bridge with

  F = T ∂y/∂x + bending shear = Σ bₙqₙ,  bₙ = ±√(2/μL) (T kₙ + EI kₙ³).

A bridge of admittance G (velocity per force) moves with G·F. In modal form
that is a rank-one damping matrix c cᵀ, with cₙ = √G bₙ/ωₙ, shared by every
mode of every unison string in that direction. On its own, a mode drains
σ_b = G(T + EIkₙ²)/L into the bridge. This is the small-G root of the exact
end condition tan kL = iG√(Tμ), and the tests check the two against each
other. Shared, it is Weinreich's (1977) coupled-strings physics. In-phase
unison motion drains N σ_b, antiphase motion none. The hammer starts both
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
or 2√(E T/L) per joule of modal energy. So the piezo hears the strings
bright. For C4 the spectral centroid of the partials goes from 296 Hz in
displacement to 429 Hz in bridge force. A short string makes more force per
joule, but the top octave and a half still takes little energy from the
hammer, because the felt's contact (0.7–1.5 ms) outlasts the string's period
(0.4–0.8 ms). Those piezos are trimmed up to +4.5 dB, the way a technician
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
  slowly. On C4, T60 is 1.2 s for partial 6 and 8.9 s for the fundamental.
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
  the plate's acceleration.

The soundboard costs the strings their sustain. Over eight keys, a note
falls 23.6 dB in 3 s on the board against 16.7 dB on the frame. It adds the
Weinreich double decay. It colours the sound: some partials and some notes
(E4) are loud, others weak, and the hammer's push, passed to the bridge,
knocks the board's low modes. The microphones are trimmed to sit about 4 dB
below the piezo, so that the board's loudest note stays under the limiter.

## What to listen for

`examples/grand/`, each isolating one effect:

1. **CP-70 ballad**: pedalled chords over the short bass strings.
2. **Piezo, then soundboard (piezo), then soundboard (microphones)**: the
   same C3–G3–E4 chord three times.
   * On the frame it falls 12 dB in 2 s.
   * On the soundboard, through the same piezo, it falls 20 dB in 2 s. Only
     the bridge changed.
   * Through the microphones you hear the board's resonant colour and knock,
     and about 4 dB less level.
3. **Bass: CP-70 strings, then concert-grand strings**: E1, then A1 + E2.
   The short strings' upper partials are stretched by over a semitone, so
   you hear a metallic, clangy zing. The long strings sound round and
   harmonic.
4. **Weinreich: one string, then two, on a soundboard**: middle C. One
   string, struck square on, decays as one exponential (5.3 then
   5.1 dB/s). Two strings with 1.5 ¢ of mistuning and a 10° tilt give a
   prompt sound at 10.2 dB/s, then an aftersound at 2.8 dB/s.
5. **Strike position**: C3 struck at L/8, then at L/2, then at L/25.
   * At L/2 the even partials vanish: the 250 Hz octave band (the 2nd
     partial) falls by 29 dB, and the note is hollow and clarinet-like.
   * At L/25 the note is bright and thin.
6. **Preamp**: a riff three times. First flat; then a stage EQ (bass +4,
   middle −5, treble +7 dB); then a 22 kΩ preamp input, whose 723 Hz
   high-pass takes the body out of the piezo (7 dB quieter, thin).
7. **Unisons in tune, then honky-tonk**: an A major chord with 0.3 ¢ and
   then 10 ¢ between each note's two strings. The envelope roughness rises
   from 0.3 to 1.1 dB. This is the out-of-tune CP-70 sound many remember.

On the page, the slow-motion view replays the focused key's strike. You
see the kink leave the hammer and reflect, and the bridge force (what the
piezo hears) stepping at each arrival. The table lists each partial's
frequency, its stretch, its prompt and aftersound T60, and its level in
displacement and at the transducer. *Why the piezo is bright* plots those
two (and the microphone's) side by side.

Regenerate the demos with `node tools/render-grand.mjs`. Run the tests with
`node test/grand-tests.mjs` (23 tests, ~17 s).

## Files

```
grand/index.html, style.css          page
grand/src/grand-model.js             physics: scale, strings, hammer data, bridge, soundboard (no audio, no DOM)
grand/src/grand-engine.js            real-time engine: modes, implicit hammer, bridge channels, board, piezo, EQ
grand/src/grand-params.js            parameters and presets
grand/src/grand-main.js              page wiring; slow-motion string, modes table, spectrum, partial weights
test/grand-tests.mjs                 node test/grand-tests.mjs
tools/render-grand.mjs               node tools/render-grand.mjs → examples/grand/
```

The engine imports the felt-hammer grading and the concert scale from
`piano/src/physics.js`.

## Simplifications

* **Linear strings.** There is no tension modulation, so no pitch glide on
  hard blows, no phantom partials and no longitudinal modes. With short,
  stiff, heavily wound strings these would matter more than on a concert
  grand.
* **The frame's admittance is a guess** (5·10⁻⁵ s/kg, frequency-independent,
  real). We have found no measurement of the CP-70's bridge mobility. The
  piezo's capacitance (10 nF) and the preamp's EQ corners are typical
  values, not Yamaha's. The scale (lengths and gauges) is a smooth design
  through the one published length, not a measured string list.
* **Bridge coupling is resistive.** The reactive part of the admittance
  appears only as the sideways spring's frequency shift. On the soundboard,
  the strings drain into the plate (Re Y), but the plate does not pull their
  frequencies, and the board is driven one way: the plate's vibration does
  not act back on the strings. There is no coupling between different keys,
  so no sympathetic resonance with the pedal down.
* **The soundboard is a stand-in.** It is a flat, isotropic, simply
  supported rectangle. A real board is crowned, ribbed, orthotropic and
  irregular, and its modes above ~1 kHz localise between ribs. The
  radiation phase of each mode is kept only as a sign. The two microphones
  are in the far field, with no room. The shell's *Room* adds one.
* **Hammer and dampers.** The hammer has no shank flex or escapement, and it
  strikes all of a key's strings equally. A real hammer's uneven contact
  also starts the antiphase unison motion directly. The damper is a felt
  pad at 16 % of the length, so partials with a node under it ring on.
  Keys above E6 have no dampers.
* **Tuning is unstretched.** The fundamentals are on 12-TET. With B this
  large, a tuner would stretch the CP-70's octaves noticeably.
* The CP-70's tremolo (an electronic amplitude modulation, on some units)
  is left out.

References: H. Fletcher, JASA 36, 203 (1964); R. W. Young, JASA 24, 267
(1952); G. Weinreich, JASA 62, 1474 (1977); A. Chaigne & A. Askenfelt,
JASA 95, 1112 and 1631 (1994); A. Askenfelt & E. Jansson, JASA 90, 2383
(1991); C. Gough, Acustica 49, 124 (1981); L. Cremer, M. Heckl &
B. Petersson, *Structure-Borne Sound* (infinite-plate mobility); K. Ege,
X. Boutillon & M. Rébillat, J. Sound Vib. 332, 1288 (2013); N. Fletcher &
T. Rossing, *The Physics of Musical Instruments*, ch. 12.
