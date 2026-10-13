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
| `↑` `↓` | expression pedal |
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

Two consequences you can hear in `examples/organ/04-…wav`:

* Inside one note, the non-octave drawbars slowly slide in phase against the
  octaves (2⅔′ at about 0.6 Hz for C4, 1⅗′ at about 11 Hz). The waveform is
  never quite static. Watch the scope.
* Across a chord, coinciding tones come from the same wheel. C4's 1⅗′ *is*
  E4's 2′, so tempered chords cannot beat on a Hammond. Switch **Tuning** to
  *Ideal harmonics*: now C's true 5th harmonic (1307.7 Hz) beats against E's
  4th (1318.5 Hz) at 10.8 Hz, the way an acoustic instrument's would.

The top drawbars fold back an octave once they run out of wheels (above F♯5
for the 1′), shown in red in the table.

**Contacts and busbars.** Each key closes nine spring contacts onto nine
busbars, at slightly different points of its travel, with a little bounce.
Each contact connects a wheel that is already spinning, so the waveform
steps from zero to its instantaneous value. That step is the key click. A
faster key press (MIDI velocity) closes the contacts closer together.
"Contact softness" ramps the connection, which acts like a click filter.
The busbars are loaded (Millman's theorem with a source/load resistance
ratio), so each extra key on a busbar adds less than the last and full
chords compress.

**Percussion.** This is a decaying gate on the 2nd or 3rd harmonic wheel. As
on the B-3, it borrows the 1′ contacts (so the 1′ drawbar goes silent), drops
the drawbars 3 dB at normal volume, and is single-trigger: it re-arms only
when every key is up, so legato playing does not re-strike it.

**Scanner vibrato.** The signal runs down an LC ladder delay line, simulated
as a circuit (18 sections, √LC = 50 µs, 2× oversampled). A rotating
capacitive scanner sweeps across the taps, blending neighbouring taps as its
plates overlap. The changing delay is the vibrato. The pitch swing for V3
measures ±25 ¢, against ±21 ¢ for an ideal line; the difference is the
ladder's own dispersion. The ladder's cutoff (≈6 kHz) is why vibrato darkens
the tone. Chorus (C1–C3) mixes the scanned signal with the dry one. The
scanner is gear-driven, so it slows down with the motor too.

**Tube drive.** An asymmetric soft clip, which adds even harmonics, followed
by a DC blocker. The expression pedal sits before it, so it changes the grit
as well as the volume.

**Leslie.** An 800 Hz crossover splits the signal between a horn (radius
18 cm) and a drum, each a moving source with its own directivity. Each mic
hears every source through a time-varying fractional delay, so the Doppler
shift is exact. The horn tip moves at 7.6 m/s on fast, giving ±38 ¢, which
is v/c as the tests confirm. An image source in the cabinet's rear wall
adds the second, opposite Doppler path. The rotors approach their target
speeds with separate time constants: the light horn takes ~0.7 s, the heavy
drum ~4.5 s. That lag is why the speed change sounds like two things
happening.

## Files

```
organ/index.html, style.css      UI
organ/src/tonewheels.js          gears, wheels, drawbar → wheel map, foldback, analysis
organ/src/organ-engine.js        DSP: generator, contacts, busbars, percussion, LC scanner, drive, Leslie
organ/src/organ-worklet.js       AudioWorklet wrapper
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
