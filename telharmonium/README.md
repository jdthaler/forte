# Telharmonium

Thaddeus Cahill's Telharmonium, the electric music plant that played from
Telharmonic Hall on Broadway in 1906–1908. Every note was made by an
alternator: a toothed steel rotor turning past a coil on one of the
pitch-shafts, twelve in Cahill's design (eight were built), each geared to
one motor and carrying a pitch class's alternators. A key's relay switched
its own alternator and the ones turning two, three … eight times as fast
onto its manual's harmonic buses, where stops of induction coils mixed
them, and the music went out down telephone lines to receivers with paper
horns in hotels, restaurants and homes. Here every alternator is a sine
locked to its shaft's angle, every winding a circuit of its own time
constant, every bus a load the notes on it share, the line the exact
telegrapher's line and the receiver a magnet pulling an iron diaphragm. You
can hear what a sample cannot give you: notes that share alternators adding
in phase; a chord that robs its own notes; the thump of each relay's closing;
the whole machine sagging flat under a big chord and coming back; the tone of
the line changing with the distance; the receiver's magnet growling on loud
bass and making a phantom ground tone out of its harmonics.

Part of [Forte](../README.md). Play it at <https://forte.jthaler.net/telharmonium/>
(or locally — see the [main README](../README.md)).

| Input | |
|---|---|
| `Z…/` and `Q…]` rows | play (88 keys, A0–C8); a note sounds while its key is held |
| `←` `→` | octave |
| `↑` `↓` | velocity |
| `Space` | hold the keys that are down (the relays stay closed) |
| MIDI | notes and velocity (as far as the key touch lets it); aftertouch presses a key further in; **pitch bend turns the motor's field rheostat** (±2 semitones, through the flywheel); **mod wheel opens the swell** from where it rests; **CC11 = the swell pedal**; sustain pedal = hold |
| MPE | every alternator turns with the motor, so no note bends alone; a note's pressure presses its own key |

**Playing.** Keys from the *Melody manual from* key up play Manual II, the
melody, with its own stops, line and receivers (to the right); the keys
below play Manual I, the accompaniment (to the left). In New York the two
went out on separate lines, which let each be balanced on its own.

## The pitch-shafts and the alternators

An inductor alternator with T teeth on a shaft turning at Ω revolutions a
second makes T·Ω hertz. Cahill put each pitch class on its own shaft and
geared the shafts to one another in equal temperament; along a shaft the
teeth go up as the harmonics do. The 1906 C-shaft's C3 alternator had 4 teeth
(129.33 Hz at A = 435), its octave 8, its twelfth 12, and so on (Weidenaar
1995, Table 4): key k's own alternator has 4·2^octave teeth, and its n-th
harmonic is the alternator with n times those teeth **on the same shaft**.
Two keys that use the same alternator (C4's octave and C5's ground tone) get
the same wave, in phase, because it is one machine. Each alternator here is
a phasor locked to its shaft's angle, with a fixed offset of its own (where
its rotor was keyed to the shaft).

The rotor's teeth were milled to make the flux nearly a sine; *Rotor-tooth
error* leaves a little of its third harmonic, a faint twelfth over every
alternator. *Highest harmonic alternator* is the fastest one a shaft
carries: the 1906 machine reached about 4 kHz (McAllister, in Weidenaar), so
high notes have fewer harmonics and the top octave is bare (every key keeps
its own alternator).

**Eight shafts.** Only C, D, E♭, E, F, G, A and B♭ were built. The keys of the
missing four played the alternators on A, D, E and G's shafts that make
their just major thirds (their fifth harmonics), so C♯, F♯, G♯ and B sound
13.7 ¢ flat of equal temperament (`shafts` = eight).

**Pierce's intonation.** Each shaft also carries its notes' 5th and 7th
harmonics: a just major third and a just minor seventh above. Edwin Hall
Pierce, who played the instrument, described keybanks wired to these so a
player could take thirds and sevenths just (Pierce 1924). Here, with
*Pierce*, a key a major third or a minor seventh above a key already held
sounds from that key's shaft, 5 : 4 or 7 : 4 (13.7 ¢ and 31.2 ¢ flatter than
tempered), in any octave above it; a key struck up to 40 ms before its root
(a chord's keys arrive one after another) moves to it. Fifths stay tempered.

**The motor.** All the shafts were geared to one large motor, which slowed
under the alternators' load: Weidenaar describes the instrument "suddenly
drifting down in pitch" and the player reaching for the master tuning
rheostat. Here the shafts' speed, in cents, glides towards −droop × load with
the flywheel's time constant, where the load counts each winding's current
on its bus in units of a full note's (1 = ten notes with every stop full
out). Pitch bend turns the field rheostat: the whole machine follows it, as
slowly.

## The windings, the relays and the buses

An inductor alternator's EMF is iω times its flux; through its winding's
resistance R and inductance L the current is

    y = Φ · iωτ / (1 + iωτ) / τ,   τ = L/R

flat above 1/(2πτ), so every alternator gives the same current for the same
flux. Cahill voiced the machine with rheostats on the alternators' field
coils, setting each alternator's output "to compensate for the tendency of
receiver diaphragms to produce some tones at different volumes" (Weidenaar).
*Field voicing* does that against the 1906 receiver's response and a
1.8 m horn's mouth: (Q·√(1 + 1/(ka)²) / |H_receiver(f)|)^v, at most 60 (35 dB).

**The switch.** A sine switched into such a circuit at any instant leaves an
offset that decays as e^{−t/τ}, as large as the steady current would be at
that instant: the "little explosive puffs" that began every note. A relay's
knife blades take a few milliseconds (*Relay contacts*) to slide home, and
while they do the winding's circuit follows them: their conductance κ
(0 apart, 1 home) puts R/κ in the circuit, so

    τκ y' + y = κ e/R,

solved exactly at each sample with κ held across it. Parting is the same
in reverse, and what current is left when the blades separate sparks across
them. With *instant* contacts the switch is ideal and the edge rings the
diaphragms, "the rap of a metal mallet".

**Robbing.** Every key's n-th harmonic flows through bus n of its manual: a
transformer coil, with the stop (a rheostat of induction coils, 3 dB a step,
0 the bus open) in series. N windings of impedance Z_s in parallel on one
load Z_L each carry

    I = e / (Z_s + N Z_L),

so each note added takes current from the others; a soft stop adds to the
load, so it robs more. With ρ the coil's own ratio Z_L/Z_s (*Bus load*) and a
stop set so a note alone gets its level ℓ of a full stop's current, the bus's
ratio is ρ_ℓ = (1 + ρ)/ℓ − 1 and each of N notes gets (1 + ρ)/(1 + Nρ_ℓ). A
winding switched in starts where its share of the bus's flux puts it, so the
bus's current stays continuous.

**Touch.** The 1906 relays switched at full strength (touch 0). The third
Telharmonium (1911) added an induction coil to each key's circuit for touch;
*Key touch* lets the velocity set the level that far, and aftertouch presses
the key in to full.

## The swell, the line and the receiver

Each manual's buses are mixed through the output transformers (a 16 Hz
high-pass) and the swell, a brush on a foot pedal cutting 48 induction coils
in or out. Then each goes out on its own line.

**The line** is the telegrapher's line with R, L and C a kilometre (G = 0),
between the transformer's 600 Ω and the receivers' 600 Ω, solved exactly:

    H(f) = (R_s + R_r) / ((R_s + R_r) cosh γℓ + (Z₀ + R_s R_r / Z₀) sinh γℓ),
    γ = √(zy), Z₀ = √(z/y), z = R + iωL, y = iωC.

A city cable (#19 gauge, paper insulated: 52.8 Ω, 0.62 mH and 52 nF a
kilometre) is mostly R and C and loses the highs quickly; open wire on poles
(104-mil copper a foot apart: 2.6 Ω, 2.2 mH, 5.3 nF) carries them almost as
well as the lows, at nearly the speed of light. The output transformer's tap
makes up the loss at 300 Hz but lifts no frequency more than 6 dB over what
it would get with no line, so a short line changes the tone and a long city
cable fades the music away. The engine plays the line as its impulse
response, sampled from H (16384 points, the top fifth of the band tapered
off), through a convolver.

**The receiver** is a telephone receiver: a soft-iron diaphragm pulled by a
permanent magnet and the line's current through its coil. The pull goes as
the square of the total flux, so the force is u + u²/(2m) with m the magnet's
flux as the current that would match it (*Receiver magnet*): the music adds
its own square, sum and difference tones that grow with it, the "growling"
of loud bass chords Weidenaar reports, and from harmonics without their
ground tone a phantom ground tone, which Robert Hope-Jones heard. The
diaphragm's first mode is a clamped circular plate's (Leissa 1969):

    f₀₁ = λ²/(2πa²) · √(D/ρh),   D = E h³ / (12 (1 − ν²)),   λ² = 10.2158.

Cahill's was 1/100 inch thick; a 5 cm disc of soft iron (E 200 GPa, ρ 7870,
ν 0.29) rings at 1005 Hz. Arthur T. Cahill's (1911) had ten times the area
and three times the thickness, so 0.3 of that: 301 Hz. The diaphragm is a
resonator of Q 4 (loaded by its horn), discretised exactly (zero-order hold,
by the matrix exponential).

**The horn** is a paper cone five or six feet long (*Horn length*): a
waveguide with a delay L/c each way, the throat's reflection −0.8 and the
mouth's −1/(1 + iω/ω_m) with ω_m = c/(0.17 L), so it resonates near every
multiple of c/2L, like a pipe open at both ends, and lets the highs out of
its mouth. No horn is the bare receiver, which radiates the diaphragm's
acceleration. Manual I's receivers stand to the left, Manual II's to the
right.

## What to listen for

The demos in `examples/telharmonium/`:

1. **A tune in Telharmonic Hall**: a melody on Manual II over chords on
   Manual I, at the defaults.
2. **The stops drawn one by one**: a held C4, its harmonics added a second
   apart.
3. **Tempered, then Pierce's just**: a dominant seventh, then the same
   chord with its third and seventh from the C's shaft; the beating stops.
4. **Robbing**: a held G4 grows quieter as each note joins it on its buses.
5. **Down the line**: one phrase in the hall, 2 km down Broadway, 25 km of
   city cable, 160 km of open wire.
6. **The motor sags**: a big chord on a struggling motor; the held C5 goes
   flat with it and comes back.
7. **A bass with no ground tone**: the receivers' magnets put it back.
8. **The relays' thumps**: short notes with a long L/R.

On the page, *Pitch-shafts* draws the alternators in use on their shafts
and the motor's speed; *Harmonic buses* each note's share of every bus now
against what it would get alone; *Line and receiver* the line's response and
the receiver and horn's, under the focused key's harmonics; *Key and shaft*
the focused key's alternator, harmonics and manual.

## Files

```
telharmonium/index.html, style.css                  page
telharmonium/src/telharmonium-params.js             parameters and presets
telharmonium/src/telharmonium-instrument.js         the descriptor: everything but the page
telharmonium/src/telharmonium-main.js               page wiring and views
telharmonium/src/telharmonium-wasm.js, telharmonium/wasm/telharmonium.wasm   the engine and model, built from the C++
native/instruments/telharmonium/                    the physics in C++: model and engine (plugins and WebAssembly)
test/telharmonium-tests.mjs                         node test/telharmonium-tests.mjs
tools/render-telharmonium.mjs                       node tools/render-telharmonium.mjs → examples/telharmonium/
```

## Simplifications

* **The alternators are ideal sources.** Their EMF is their flux times iω,
  with no armature reaction, no saturation of their fields and no losses in
  the iron; Cahill's largest gave 15 to 19 horsepower. Each alternator's
  phase on its shaft is fixed but arbitrary (a hash of its shaft and teeth).
* **One time constant** for every winding and bus coil. The real windings
  differed from alternator to alternator, and the transformers were not
  ideal.
* **The buses are resistive dividers.** Robbing is computed with real
  impedances in the ratio the stop sets; in the machine Z_L and Z_s were
  complex and the robbing changed the timbre a little as well as the level.
* **The motor** is one first-order lag on the speed, with a load from the
  windings' currents. The 1906 machine's motor and the gears that coupled the
  shafts had backlash and hunting, not modelled.
* **Eight harmonics a key.** Cahill's buses and stops went further on some
  manuals, and the keybanks' exact wiring (and which alternators the
  lowest keys borrowed to reach 40 Hz) is not known in full; the
  four-teeth-an-octave scheme of the C-shaft is applied to all twelve.
* **Pierce's mode is a reading**, not the keyboard: Pierce describes extra
  keybanks for just thirds; here the choice is made from the chord held.
* **The line** is uniform, with no loading coils, crosstalk or the
  exchanges' switching, and the same for both manuals. The receivers are one
  per manual, of one mode each, and the horns are lossless waveguides apart
  from the throat.
* **The swell** is a smooth gain; the real one stepped through its 48
  coils.

## Quality

At Medium at most 16 keys sound at once and at Low 10 (High: 32); past that
the oldest held key's relay opens. Low also leaves out the rotor-tooth
error (the alternators are pure sines), which saves the twelfth's
oscillator on every winding.

## Prior art and references

### The instrument

* Cahill, T. [US 580,035](https://patents.google.com/patent/US580035A/en),
  "Art of and apparatus for generating and distributing music
  electrically" (filed 1895, granted 1897): the alternators, the harmonic
  buses and the telephone lines. Later patents, among them US 1,213,804 and
  US 1,295,691, describe the later machines (Weidenaar).
* Weidenaar, R. (1995). *Magic Music from the Telharmonium*. Metuchen, NJ:
  Scarecrow Press. The history and the engineering, from Cahill's patents,
  papers and the press: the C-shaft's alternators (Table 4), the voicing,
  the swell, the relays' thumps, the receivers and the motor's drift. Most
  of the numbers here are from it.
* Baker, R. S. (1906). "New music for an old world." *McClure's Magazine*
  27(3), 291–301.
* McAllister, A. S. (1906). The science writer's description of the
  machine (its 40–4000 Hz range), as quoted by Weidenaar.
* Pierce, E. H. (1924). "A colossal experiment in 'just intonation'." *The
  Musical Quarterly* 10(3).

### The physics

* Heaviside, O. (1893). *Electromagnetic Theory*, vol. 1. London: The
  Electrician. The telegrapher's equations and the distortionless line.
* Leissa, A. W. (1969). *Vibration of Plates*. NASA SP-160. The clamped
  circular plate's first mode, λ² = 10.2158.
* Fletcher, N. H., and Rossing, T. D. (1998). *The Physics of Musical
  Instruments*, 2nd ed. New York: Springer. Conical horns and their
  resonances.

### Earlier models and syntheses

We did not find a published physical model of the Telharmonium. Its
descendants are the tonewheel organs: [Hammond's](https://patents.google.com/patent/US1956350A/en)
(Hammond, 1934) and this site's [Tonewheel Organ](../organ/), which build
on the same idea of geared wheels and harmonic drawbars.
