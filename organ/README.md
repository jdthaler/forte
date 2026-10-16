# Tonewheel Organ

A Hammond B-3 and Leslie 122, modelled from the motor up: gears, spinning
wheels, key contacts, busbars, percussion, the scanner vibrato's LC delay
line, a tube drive, and a rotating horn and drum heard by two microphones.
There are no samples and no envelopes. The attack is the key contacts
closing.

Play it at <https://forte.jthaler.net/organ/> (or locally — see the
[main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (61-key manual, C2–C7) |
| `←` `→` | octave |
| `↑` `↓`, or the **Swell** pedal beside the drawbars | expression pedal (drag or scroll the pedal; it is there for tablets) |
| `Space` | Leslie slow ↔ fast |
| `` ` `` | generator motor on / off |
| drawbars | drag, scroll, or type a registration like `88 8000 000` |
| MIDI | notes; CC1 or a sustain pedal (CC64) toggles the Leslie; CC11 = expression |

## The signal chain, and what is physical about each step

**Motor and gears.** A synchronous motor locks to the mains: 1200 rpm, so
20 rev/s on the main shaft. Twelve gear pairs (85/104 for C … 108/70 for B)
step that up or down by small-integer approximations of 2^(k/12), and each
wheel's frequency is 20 rev/s × ratio × teeth. A4 is exactly 440 Hz. Every
other wheel is within 0.71 ¢ of equal temperament (worst: G♯, 96/74). The top
seven wheels have 192 teeth and ride on the shaft a fifth below, so they are
pure 3:2 fifths of it and run 1.3–2 ¢ sharp. The generator map shows all of
this; hover a wheel for its gear and tooth count.

The pickup voltage is the rate of change of flux, so it is proportional to
shaft speed. Switch the motor off and the generator coasts down
(viscous + Coulomb drag), with pitch and level falling together. Set the
mains to 50 Hz and the whole organ drops 316 ¢.

**Shared wheels: the defining trait.** Each key draws nine tones from the
same 91 wheels, so the drawbar "harmonics" are tempered intervals:

| drawbar | is supposed to be | actually plays | error |
|---|---|---|---|
| 5⅓′, 2⅔′, 1⅓′ | harmonics 1.5, 3, 6 | tempered fifths | −2 ¢ (−1.4 ¢ with the real gears at C) |
| 1⅗′ | harmonic 5 | tempered major third | **+14 ¢** |
| 16′, 8′, 4′, 2′, 1′ | octaves | octaves (same gear, phase-locked) | 0 |

Two consequences you can hear in `examples/organ/04-tuning-real-gears-then-ideal-harmonics.m4a`:

* Inside one note, the non-octave drawbars slowly slide in phase against the
  octaves (2⅔′ at about 0.6 Hz for C4, 1⅗′ at about 11 Hz). The waveform is
  never quite static. Watch the scope.
* Across a chord, coinciding tones come from the same wheel. C4's 1⅗′ *is*
  E4's 2′, so tempered chords cannot beat on a Hammond. Switch **Tuning** to
  *Ideal harmonics*: now C's true 5th harmonic (1307.7 Hz) beats against E's
  4th (1318.4 Hz) at 10.7 Hz, the way an acoustic instrument's would.

The top drawbars fold back an octave once they run out of wheels (above F♯5
for the 1′), shown in red in the table.

**Contacts and busbars.** Each key closes nine spring contacts onto nine
busbars, at slightly different points of its travel, with a little bounce.
Each contact connects a wheel that is already spinning, so the waveform
steps from zero to its instantaneous value. That step is the key click. A
faster key press (MIDI velocity) closes the contacts closer together.
"Contact softness" ramps the connection, which acts like a click filter.
The busbars are loaded. By Millman's theorem, n wheels of source resistance
R_s on one busbar, loaded by R_L, give Σv·(1 + λ)/(1 + λn) with
λ = R_L/R_s (the *Busbar loading* slider). The larger λ, the more the keys
average instead of adding, so each extra key on a busbar adds less than the
last and full chords compress.

**Percussion.** This is a decaying gate on the 2nd or 3rd harmonic wheel. As
on the B-3, it borrows the 1′ contacts (so the 1′ drawbar goes silent), drops
the drawbars 3 dB at normal volume, and is single-trigger: it re-arms only
when every key is up, so legato playing does not re-strike it.

**Scanner vibrato.** The signal runs down an LC ladder delay line, simulated
as a circuit (18 sections, √LC = 50 µs, 2× oversampled). A rotating
capacitive scanner sweeps across the taps, blending neighbouring taps as its
plates overlap. The changing delay is the vibrato. An ideal line of the same
total delay (18 × 50 µs) would swing V3 by ±2Nτ·f_scan = ±21.3 ¢; the
measured swing is ±22 ¢ most of the time, with extremes of ±23 ¢ at A4 and
±25 ¢ at A5. That is not dispersion, which is small here (the total delay is
only 1 % long at 880 Hz). It is how the delay is shared out. The resistive
terminations do not match a lumped ladder's frequency-dependent impedance,
so the phase step from tap to tap ripples along the line (±9 % at 440 Hz,
±17 % at 880 Hz), and the first section, next to the driven end, gives only
about 0.6 τ, so the rest give a little more. The scanner sweeps the taps at
a steady rate, so the pitch follows the local step: the median sits 2–5 %
above the ideal line, and the extremes grow with frequency. The ladder's
cutoff (≈6 kHz) is why vibrato darkens the tone. Chorus (C1–C3) mixes the scanned signal with the dry one. The
scanner is gear-driven, so it slows down with the motor too.

**Tube drive.** A triode biased off-centre: y ∝ tanh(k·x + b₀) − tanh b₀,
with gain k = 15 × drive² and a fixed bias b₀ = 0.25 outside the gain, then
the coupling capacitor (a DC blocker). The bias makes the curve asymmetric,
which adds even harmonics (the 2nd rises from −53 dB at drive 0.15 to
−22 dB at full drive on one note). The output is scaled so a full chord
keeps its level, so more drive compresses the dynamics rather than making
everything louder, and the output is bounded: ten keys with every drawbar
out, at full drive, peak at 0.37. The expression pedal sits before it, so
it changes the grit as well as the volume.

Live controls (expression, drive, crossover, balance, reflections, busbar
loading) glide to a new setting over about 15 ms, as a pot or pedal would,
instead of jumping once per audio block, which clicks.

**Leslie.** An 800 Hz crossover splits the signal between a horn (radius
18 cm) and a drum, each a moving source with its own directivity. Each mic
hears every source through a time-varying fractional delay, so the Doppler
shift is exact. The horn tip moves at 7.6 m/s on fast, giving ±38 ¢, which
is v/c as the tests confirm. An image source in the cabinet's rear wall
adds the second, opposite Doppler path. The rear wall is 32 cm behind the
rotor axis, or 4 cm behind the horn mouth if you make the horn longer than
28 cm, and the mics are kept at least 8 cm outside the cabinet, so the horn
can never sweep through them. The rotors approach their target
speeds with separate time constants: the light horn takes ~0.7 s, the heavy
drum ~4.5 s. That lag is why the speed change sounds like two things
happening.

## Files

```
organ/index.html, style.css      UI
organ/src/tonewheels.js          gears, wheels, drawbar → wheel map, foldback, analysis
organ/src/organ-instrument.js    the instrument without its page: parameters, presets, engine, output chain
organ/src/organ-engine.js        DSP: generator, contacts, busbars, percussion, LC scanner, drive, Leslie
organ/src/organ-main.js          console, drawbars, keyboard / MIDI, views
organ/src/organ-viz.js           generator map, Leslie top view, spectrum + scope, scanner
organ/src/organ-params.js        parameters and registrations
test/organ-tests.mjs             node test/organ-tests.mjs
tools/render-organ.mjs           node tools/render-organ.mjs → examples/organ/
```

## Not modelled (yet)

The lower manual and pedals; the B-3's per-key resistance wires and wheel
filter networks, which shape the level across the keyboard; motor "hunting";
the preamp's frequency response; and cabinet resonances beyond one reflection.
The tonewheel waveform is a sine plus adjustable 2nd and 3rd harmonics, not
a computed tooth-and-pickup field.

## Prior art and references

### The original instruments and their inventors

Laurens Hammond patented the tonewheel organ in 1934. John M. Hanert, at
Hammond, patented the scanner vibrato (an artificial transmission line read
by a rotating capacitive scanner) and the harmonic percussion. Don Leslie
patented the rotating-speaker cabinet.

* Hammond, L. (1934). "Electrical musical instrument." US 1,956,350.
  [Google Patents](https://patents.google.com/patent/US1956350A/en)
* Hanert, J. M. (1945). "Electrical musical apparatus." US 2,382,413.
  [Google Patents](https://patents.google.com/patent/US2382413A/en):
  vibrato from an artificial line of many sections, its phase scanned at
  about 6 Hz.
* Hanert, J. M. (1950). "Electrical musical apparatus." US 2,509,923.
  [Google Patents](https://patents.google.com/patent/US2509923A/en):
  a rotating capacitor plate scanning the taps of the line; vibrato and
  chorus.
* Hammond, L. & Hanert, J. M. (1951). "Vibrato apparatus." US 2,560,568.
  [Google Patents](https://patents.google.com/patent/US2560568A/en):
  the scanning rotor and line assembly.
* Hanert, J. M. (1960). "Electrical musical instrument with percussion
  apparatus." US 2,951,412 (filed 1954).
  [Google Patents](https://patents.google.com/patent/US2951412A/en):
  a percussion envelope applied to the second- or third-harmonic busbar.
* Leslie, D. J. (1949). "Rotatable tremulant sound producer." US 2,489,653.
  [Google Patents](https://patents.google.com/patent/US2489653A/en)
* Leslie, D. J. (1963). "Speaker system for adding tremolo." US 3,080,786.
  [Google Patents](https://patents.google.com/patent/US3080786A/en)

### Physics and engineering literature

* Millman, J. (1940). "A useful network theorem." *Proceedings of the IRE*
  28(9), 413–417.
  [doi:10.1109/JRPROC.1940.225885](https://doi.org/10.1109/JRPROC.1940.225885)
  (the busbar loading above).
* Henricksen, C. A. (1981). "Unearthing the mysteries of the Leslie
  cabinet." *Recording Engineer/Producer*, April 1981.
  [Online copy](http://www.theatreorgans.com/hammond/faq/mystery/mystery.html)
* Allen, J. B. & Berkley, D. A. (1979). "Image method for efficiently
  simulating small-room acoustics." *J. Acoust. Soc. Am.* 65(4), 943–950.
  [doi:10.1121/1.382599](https://doi.org/10.1121/1.382599) (image sources,
  as used for the cabinet's rear wall).
* Laakso, T. I., Välimäki, V., Karjalainen, M. & Laine, U. K. (1996).
  "Splitting the unit delay." *IEEE Signal Processing Magazine* 13(1),
  30–60. [doi:10.1109/79.482137](https://doi.org/10.1109/79.482137)
  (fractional delay lines, as used for the Doppler paths).
* Werner, K. J. & Abel, J. S. (2016). "Modal processor effects inspired by
  Hammond tonewheel organs." *Applied Sciences* 6(7), 185.
  [doi:10.3390/app6070185](https://doi.org/10.3390/app6070185)

### Earlier models and syntheses

Academic:

* Smith, J., Serafin, S., Abel, J. & Berners, D. (2002). "Doppler
  simulation and the Leslie." *Proc. 5th Int. Conf. Digital Audio Effects
  (DAFx-02)*, Hamburg, 13–20.
  [DAFx archive](https://dafx.de/paper-archive/details/WPBALpaJ-PqTYEeC5oevig):
  the horn as a moving source through interpolating delay lines, with
  angle-dependent filters calibrated on a measured Leslie horn (modelled).
* Kronland-Martinet, R. & Voinier, T. (2008). "Real-time perceptual
  simulation of moving sources: application to the Leslie cabinet and 3D
  sound immersion." *EURASIP J. Audio, Speech, and Music Processing* 2008,
  849696. [doi:10.1155/2008/849696](https://doi.org/10.1155/2008/849696):
  a perceptual moving-source model applied to the Leslie.
* Herrera, J., Hanson, C. & Abel, J. S. (2009). "Discrete time emulation of
  the Leslie speaker." *127th AES Convention*, New York, paper 7925.
  [CCRMA](https://ccrma.stanford.edu/papers/discrete-time-emulation-of-leslie-speaker):
  horn and drum as time-varying FIR filters interpolated from impulse
  responses measured over rotor angle, with first-order speed changes
  that have different time constants up and down (hybrid: measured
  responses).
* Pekonen, J., Pihlajamäki, T. & Välimäki, V. (2011). "Computationally
  efficient Hammond organ synthesis." *Proc. 14th Int. Conf. Digital Audio
  Effects (DAFx-11)*, Paris, 19–22.
  [DAFx archive](https://dafx.de/paper-archive/details/Va-Hsjj4g396c-1d8ofv2w):
  additive tonewheel synthesis with a key-click model, and a Leslie built
  from time-varying spectral delay filters (signal model).
* Werner, K. J., Dunkel, W. R. & Germain, F. G. (2016). "A computational
  model of the Hammond organ vibrato/chorus using wave digital filters."
  *Proc. 19th Int. Conf. Digital Audio Effects (DAFx-16)*, Brno, 271–278.
  [DAFx archive](https://dafx.de/paper-archive/details/nd_rFZKONvryB6uA-7xKrg):
  the scanner's LC ladder as a wave digital filter, with a simplified,
  physically informed scanner (circuit-modelled).

Software and instruments:

* [setBfree](https://setbfree.org/) (open source; Fredrik Kilander's
  Beatrix engine, packaged and extended by Robin Gareus and others): a DSP
  tonewheel organ emulator with a Leslie simulation.
* [VB3-II](https://www.genuinesoundware.com/?a=showproduct&b=44) (GSi,
  2023; first released as VB3 in 2006): a modelled 91-wheel tonewheel
  generator with virtual nine-contact keying and a rotary-speaker simulator.
* [EVB3](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_7_section_1.html)
  (Apple, Logic Pro): component-modelling synthesis of the tonewheel
  generator, with scanner vibrato, percussion and a rotor-cabinet emulation.
* [B-3 V](https://www.arturia.com/products/software-instruments/b-3-v/overview)
  (Arturia): a component model of the tonewheel organ with a rotary-speaker
  emulation.
* [Hammond B-3X](https://www.ikmultimedia.com/products/hammondb3x/)
  (IK Multimedia): a physically modelled B-3 and Leslie, licensed by Hammond.
* [Nord Organ 3](https://www.nordkeyboards.com/products/nord-organ-3/)
  (Nord Keyboards): a hardware B3 organ model with chorus/vibrato and a
  rotary-speaker emulation.
* [XK-5](https://hammondorganco.com/products/portables/xk-5) (Hammond):
  Hammond's own digital re-creation of the tonewheel generator, with a
  hybrid multi-contact keying system (three mechanical contacts per key,
  each triggering three virtual ones) and a digital Leslie.
* [Vintage Organs](https://www.native-instruments.com/en/products/komplete/keys/vintage-organs/)
  (Native Instruments): sampled organs with a real-time rotary-speaker and
  cabinet emulation (hybrid).
