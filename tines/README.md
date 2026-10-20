# Tine Piano

A physically modelled Rhodes-style electric piano: steel tines, brass tone
bars, neoprene hammers, and electromagnetic pickups whose nonlinearity *is*
the sound. Play it at <https://forte.jthaler.net/tines/> (or locally — see the
[main README](../README.md)).

Keys: same rows as the piano (`Z…/`, `Q…]`); `←→` octave; `↑↓` velocity; hold
`Space` for sustain; MIDI notes, velocity and CC64 work after **Enable MIDI**.
88 keys, A0–C8, as on the 88-key Mark I and Mark II (the Stage 73 has
E1–E7). The keys past E1–E7 carry on the same design: each tine's length
solved for its pitch, and the hammer, pickup gap and grommet graded as at
E1 or E7. As on the real instrument the top is quiet and short: C8 starts
about 7 dB below E7 and is gone in half a second.

## The model

**Tine.** A steel cantilever (Euler–Bernoulli, 24 Hermite finite elements)
clamped in a block, with the tuning spring as a point mass. Its overtones
are not harmonic. A bare cantilever's are at 6.27, 17.5, 34.4 × f₁; the
spring lowers f₁ more than the overtones, so with the default spring the
"bell" partial sits at 8.2 × f₁. The geometry is self-similar, so
f₁ ∝ 1/L². Each key's tine length is *solved* to hit its pitch: 16 cm for
E1, 2 cm for E7 (19 cm for A0, 1.6 cm for C8). The FEM matches the analytic cantilever to 1e-5.

**Tone bar: an asymmetric tuning fork.** Tine, tone bar and mounting block
are coupled through the block's inertia, with participation factors
Γ = ∫ m φ dx. The block sits on a lossy rubber grommet. The coupled
eigenproblem gives:

* an **antisymmetric fork mode** exactly on pitch, in which the shear forces of
  tine and bar cancel at the block. The block stays still, no energy leaks
  into the mount, and the note sustains: A4 T60 ≈ 16 s.
* a **symmetric mode** about +90 ¢ up that shakes the block and dies in tens
  of ms, giving a shimmer in the attack;
* a **mount mode** well below the pitch: a short knock.

Remove the tone bar and A4's sustain collapses to 0.6 s, because the tine now
shakes its own mount. Detune the bar by 40 ¢ and the sustain drops to 5.7 s.
This is the job the tone bar does.

**Hammer.** A mass on a nonlinear, hysteretic tip, F = K[δ^p + α d(δ^p)/dt]₊,
graded softer in the bass. It is solved implicitly against all modes. It
strikes 8 mm from the clamp, where every mode shape goes like x², so the
higher (bell) modes get relatively more energy. Strike closer to the clamp
and the bell gets louder.

**Pickup.** The flux through the coil is modelled as the axial field of a pole
at distance w: Φ(Y) = (1 + (Y/w)²)^(−3/2), where Y is the tip's height relative
to the pole axis and w² = gap² + pole radius². The output is −dΦ/dt,
computed at 2× oversampling and then decimated.

* Soft notes barely move along the curve: nearly a sine.
* Hard notes swing across the steep flank: the "bark". On A3 the 2nd
  harmonic goes from −34 dB to −7 dB re the fundamental between soft and hard.
* A tine **centred** on the pole swings symmetrically over the top of the
  bump, so the fundamental cancels and you hear the octave. Technicians voice a
  Rhodes by moving the pickups (the *Vertical voicing* and *Gap* sliders).

The pickup sliders (gap, vertical voicing, pole radius, register voicing)
act live, even on a ringing note. The pickup moves to its new place over
about 40 ms, starting and stopping smoothly, and the change of flux through
the coil is heard as a soft thump rather than a click. The tine, tone-bar,
hammer and damping sliders rebuild the key's modes, so you hear them from
the next note.

**Electrical and amp.** About 1 H of pickup coils against the cable
capacitance makes a resonant low-pass (≈5 kHz with 1 nF). After that come the
Suitcase-style stereo vibrato (an auto-pan), a soft-clipping power amp, a
speaker roll-off and a room. Their controls glide to a new setting over about
10 ms instead of jumping once per audio block, which would click.

`examples/tines/` has short renders, one effect each: velocity → bark,
centred vs off-centre pickup, tone bar matched vs removed vs detuned,
strike point, and stereo vibrato. Regenerate with `node tools/render-tines.mjs`.
Tests: `node test/tines-tests.mjs`.

The model and the engine are C++, run on this page as WebAssembly: the page
builds each key's modes with the WebAssembly model and sends them with the
note, and the views (info panel, mode table, slow motion, pickup transfer)
call that model too. They also run as plugins (CLAP, VST3, AU and a
standalone app), with MIDI velocity as hammer speed (0.25–5 m/s), CC64 the
damper pedal, and the room in the plugin's own output chain; there each
key's modes are built on a background thread. The two eigen-solves per key
are badly conditioned (the tine's finite-element stiffnesses span about ten
decades); they run on Eigen. Ten notes take about 13 % of a core.

## Files

* `src/tines-instrument.js`: the descriptor (parameters, presets, range,
  output chain); `src/rhodes-params.js`: the parameters and presets.
* `src/tines-wasm.js`: the engine and the model, the C++ built as
  WebAssembly (`wasm/tines.wasm`, from `native/instruments/tines/`).
* `src/rhodes-main.js`: the page (audio, keys, MIDI, controls);
  `src/rhodes-viz.js`: the views; `src/tine.js`: the key range, note names
  and the tone bar's drawn shape.

## Simplifications

The tine moves in one plane. Real tines also whirl a little, and the tip
moves on an arc, slightly changing the gap. The pickup field is an analytic
stand-in, not a magnetostatic solution for the real pole piece. The tone
bar is a single mode. The grommet's resonance is set per register as a
fraction of each note's frequency. The damper is a viscous felt at 60% of
the tine length, and the hammer has no escapement mechanics.

## Quality

High plays every mode of every voice, twice oversampled, as above. Medium
stops working out a mode once it has decayed 60 dB below the strongest one
in its voice (a fresh strike brings it back), ends a ringing note 60 dB below
its loudest, and lets 16 notes sound at once (40 at High): it sounds the
same. Low does the same with 10 notes, and plays the keys below the top two
octaves at the output rate instead of twice it, which changes a note's level
by a few tenths of a dB at most; in a long pedalled run the quietest notes
give way sooner.

## Prior art and references

### The original instrument and its inventor

Harold Rhodes patented the struck tine with its resonant inertia bar and
electromagnetic pickup, and then a series of refinements of this
"asymmetrical tuning fork", one of them with Clarence L. Fender.

* Rhodes, H. B. (1961). "Electrical musical instrument in the nature of a
  piano." US 2,972,922.
  [Google Patents](https://patents.google.com/patent/US2972922A/en): a
  small-diameter tine with a resonated inertia bar and an electromagnetic
  pickup.
* Rhodes, H. B. (1968). "Electric piano incorporating multicomponent tuning
  forks." US 3,418,417.
  [Google Patents](https://patents.google.com/patent/US3418417A/en)
* Fender, C. L. & Rhodes, H. B. (1972). "Tone generator with vibratory
  bars." US 3,644,656.
  [Google Patents](https://patents.google.com/patent/US3644656A/en): a
  light round tine and a heavy twisted inertia bar cantilevered from a
  common base.
* Rhodes, H. B. & Woodyard, S. J. (1983). "Tuning fork mounting assembly in
  electromechanical pianos." US 4,373,418.
  [Google Patents](https://patents.google.com/patent/US4373418A/en):
  a single-screw, elastomer-isolated fork mount to lengthen the sustain of
  the treble forks.

### Physics and engineering literature

* Han, S. M., Benaroya, H. & Wei, T. (1999). "Dynamics of transversely
  vibrating beams using four engineering theories." *J. Sound Vib.*
  225(5), 935–988.
  [doi:10.1006/jsvi.1999.2257](https://doi.org/10.1006/jsvi.1999.2257)
  (the Euler–Bernoulli cantilever and its overtones).
* Hunt, K. H. & Crossley, F. R. E. (1975). "Coefficient of restitution
  interpreted as damping in vibroimpact." *J. Appl. Mech.* 42(2), 440–445.
  [doi:10.1115/1.3423596](https://doi.org/10.1115/1.3423596)
* Stulov, A. (1995). "Hysteretic model of the grand piano hammer felt."
  *J. Acoust. Soc. Am.* 97(4), 2577–2585.
  [doi:10.1121/1.411912](https://doi.org/10.1121/1.411912)
* Horton, N. G. & Moore, T. R. (2009). "Modeling the magnetic pickup of an
  electric guitar." *Am. J. Phys.* 77(2), 144–150.
  [doi:10.1119/1.2990663](https://doi.org/10.1119/1.2990663)
* Shear, G. & Wright, M. (2011). "The electromagnetically sustained Rhodes
  piano." *Proc. NIME 2011*, Oslo, 14–17.
  [doi:10.5281/zenodo.1178161](https://doi.org/10.5281/zenodo.1178161)
* Muenster, M., Pfeifle, F., Weinrich, T. & Keil, M. (2014).
  "Nonlinearities and self-organization in the sound production of the
  Rhodes piano." *J. Acoust. Soc. Am.* 136(4), 2164 (abstract).
  [doi:10.1121/1.4899833](https://doi.org/10.1121/1.4899833)
* Pfeifle, F. & Münster, M. (2017). "Tone production of the Wurlitzer and
  Rhodes e-pianos." In A. Schneider (ed.), *Studies in Musical Acoustics
  and Psychoacoustics*, Springer, 75–107.
  [doi:10.1007/978-3-319-47292-8_3](https://doi.org/10.1007/978-3-319-47292-8_3):
  high-speed camera measurements and finite-difference models of both
  instruments.

### Earlier models and syntheses

Academic:

* Falaize, A. & Hélie, T. (2017). "Passive simulation of the nonlinear
  port-Hamiltonian modeling of a Rhodes Piano." *J. Sound Vib.* 390,
  289–309. [doi:10.1016/j.jsv.2016.11.008](https://doi.org/10.1016/j.jsv.2016.11.008):
  a nonlinear hammer, a modal Euler–Bernoulli tine and a nonlinear
  magnetic pickup, joined as one power-balanced port-Hamiltonian system
  with a passivity-preserving scheme (modelled).
* Pfeifle, F. (2017). "Real-time physical model of a Wurlitzer and Rhodes
  electric piano." *Proc. 20th Int. Conf. Digital Audio Effects (DAFx-17)*,
  Edinburgh, 17–24.
  [DAFx archive](https://dafx.de/paper-archive/details/W0D0fMDJBUxiacAi_398wg):
  finite-difference models of the vibrating parts and of the pickup, run
  on FPGA hardware and compared with measurements (modelled).
* Sønderbo, T. L. (2024). *Real-time physical model of the Rhodes Electric
  Piano.* Master's thesis, Aalborg University.
  [AAU](https://projekter.aau.dk/real-time-physical-model-of-the-rhodes-electric-piano-3db454c0.html):
  FDTD tine, hammer and damper with MPE control, and a non-physical pickup
  (modelled).

Software and instruments:

* [EVP88](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_9_section_1.html)
  (Apple, Logic Pro): component modelling of Rhodes, Wurlitzer and Hohner
  Electra pianos, including the tines, tone bars and reeds in their
  pickups' fields.
* [Lounge Lizard EP-5](https://www.applied-acoustics.com/lounge-lizard-ep-5/)
  (Applied Acoustics Systems): a physical-modelling engine with dedicated
  tine and reed models.
* [Pianoteq Electric Pianos](https://www.modartt.com/electric) (Modartt):
  physically modelled Vintage Tines MKI and MKII.
* [Stage-73 V](https://www.arturia.com/products/software-instruments/stage-73-v/overview)
  (Arturia): a physically modelled tine piano with pedal and amp models.
* [Magic Tines](https://www.genuinesoundware.com/?a=showproduct&b=64)
  (GSi): a tine piano combining sampling and modelling (hybrid).
