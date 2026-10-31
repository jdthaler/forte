# Forte

**Keyboard instruments built from physics.** Play them at
**<https://forte.jthaler.net>**. Vibe coded by Jesse Thaler.

Every sound in Forte is computed live in the browser from the equations of
motion of its instrument: stiff strings and felt hammers, gear-driven
tonewheels, steel tines in a magnetic field, neon lamps that pull each
other into tune, black holes ringing down. There are no samples. You play
with the computer keyboard, a touch screen or a MIDI keyboard, and you can turn the knobs
that real instruments hide: the shape of the string, where the hammer
lands, the pickup's offset, how fast the black hole spins.

## Instruments

The front page sorts them into five kinds, as here, and finds them by a search
(name, origins, tagline or physics) and by filters: what sounds (strings, bars and
bells, air, circuits, space, particles) and whether the notes ring out or sustain.

### Traditional instruments

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Ribbon Piano](piano/) | the concert grand | modal stiff strings, nonlinear felt hammers, a shared bridge; strings swappable for square/triangular bars and twisting ribbons |
| ✅ | [Harpsichord](harpsichord/) | Flemish double-manual (Ruckers); also their muselar and spinett virginals and a gut-strung lute-harpsichord | plectra as tapered cantilevers that catch, bend and slip off stiff strings (implicit contacts with friction); three choirs, coupler, buff and lute stops, a modal soundboard; virginals with both bridges on the board and a buzzing arpichordium; gut's bending losses |
| ✅ | [Pipe Organ](pipes/) | Baroque organ | flue pipes as tubes in modal form driven by a delayed, amplified jet that splits on the labium (jet drive with vortex shedding; speaking windows from a linear analysis): chiff with the pallet's speed, overblowing with hysteresis; Principal, Octave, stopped Gedackt and Mixture; a wind chest that sags and breathes, tremulant |
| ✅ | [Free-Reed Organ](harmonium/) | harmonium and accordion | brass reeds driven through their slots by the inertia of the air that feeds them (implicit reed–air coupling, thresholds from a linear analysis); musette, 16′ and 4′ ranks, reservoir and expression stop, cassotto |
| ✅ | [Vibraphone](vibraphone/) | Deagan vibraharp (1927) | undercut bars tuned 1 : 4 : 10 by finite elements, each coupled to a stopped tube; motor-driven discs open and close the tubes (tremolo) |
| ✅ | [Carillon](carillon/) | Flemish carillon (Hemony) | bronze bells solved by axisymmetric finite elements and tuned by their profile (minor- or major-third), struck by a Hertzian clapper; doublets that warble with asymmetry and strike angle; air absorption over distance; the strike note found by subharmonic summation |
| ✅ | [Celesta](celesta/) | Mustel celesta (1886) | plain steel bars solved as Timoshenko beams, each coupled through the air in the gap to a stopped wooden box tuned to it; felt hammers (Hertzian, implicit), felt dampers and a damper pedal |
| ✅ | [Kalimba](kalimba/) | Hugh Tracey's kalimba and the mbira | spring-steel tines as clamped–supported–free beams (the length behind the bridge sets the overtones), plucked from their static deflection by a thumb that lets go slowly or fast; a box whose top and sound-hole air are two coupled oscillators (cover the hole for a wah); bottle caps that rattle once the top outruns gravity |
| ✅ | [Steel Pan](steelpan/) | Trinidad steelpan (1940s) | note areas as plates tuned by hammering to octave and twelfth, whose domes couple their modes (a 1 : 2 : 3 internal resonance: the octave blooms on hard strokes); neighbours coupled through the steel in a fourths-and-fifths layout; the skirt's radiation; rolls |
| ✅ | [Hydraulis](hydraulis/) | Ctesibius's water organ (3rd century BC), the organs of Dion and Aquincum | hand pumps push air through their valves into a bowl standing in water: the hydrostatic head is the wind, capped at the rim where it bubbles out (Minnaert bubbles), the water bouncing on the air shut in the bowl; slides whose holes open as overlapping circles, sprung back; the Pipe Organ's flue pipes on an ancient, nearly constant bore in four ranks, one open and three stopped |

### Electric instruments

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Electric Grand](grand/) | Yamaha CP-70 | short stiff strings in two polarisations, a piezo under the bridge (or a soundboard, for comparison) |
| ✅ | [Tonewheel Organ](organ/) | Hammond B-3 + Leslie 122 | gear ratios and shared wheels, contact bounce, LC-ladder scanner vibrato, rotating Doppler horn and drum |
| ✅ | [Tine Piano](tines/) | Fender Rhodes | finite-element tine + tone bar as an asymmetric tuning fork, nonlinear electromagnetic pickup |
| ✅ | [Reed Piano](reeds/) | Wurlitzer 200A | solder-tuned steel reeds, an electrostatic pickup whose capacitance comes from Laplace's equation, photocell tremolo |
| ✅ | [Tangent Clavier](clavier/) | Hohner Clavinet D6 | tangent strikes and clamps the string on an anvil (Hertzian contacts), pressure bends the pitch, four pickup combinations, tone tabs, mute bar |
| ✅ | [Sticky-Pad Piano](pianet/) | Hohner Pianet | reeds plucked by rate-dependent adhesion (fracture mechanics of the pad), magnetic or electrostatic pickup |
| ✅ | [Trautonium](trautonium/) | Trautwein's Trautonium (1930), Sala's Mixtur-Trautonium (1952) | a neon lamp's relaxation sawtooth, its capacitor charged through a resistance wire (exact firing times, polyBLEP); four dividers, lamps ganged to the wire and fired by the master's sync pulse on every n-th flash, whose capture window gives where they divide true, slip or fire a flash early; four fixed resonant circuits rung by every flash (formants); one wire that slides between keys or a manual per key; finger pressure, a volume pedal, pitch bend and MPE |
| ✅ | [Telharmonium](telharmonium/) | Cahill's Telharmonium (1906) | inductor alternators on twelve (or the eight built) geared pitch-shafts, each key's harmonics on its own shaft so shared alternators sound in phase; each winding's L/R and the relays' contacts (the switching thump); harmonic buses whose notes rob one another; the motor sagging under the load; the telegrapher's line solved exactly (city cable or open wire); a magnetic receiver pulled by the flux squared (growl, a phantom ground tone) and a paper horn; Pierce's just thirds and sevenths |
| ✅ | [Magnetic Resonator Piano](resonator/) | Andrew McPherson's MRP (2009) | a grand's stiff strings and coupled unisons, an electromagnet over each note pulling ∝ i²/g² on a biased current, driven from one soundboard pickup through a band-pass, a phase-locked loop and a calibrated phase: notes grow out of silence, sustain, sing one harmonic or two at once; nodes under the coil, fifteen channels, hammers if you want them |

### Experiments from history

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Viola Organista](bowed/) | Leonardo da Vinci (1488) | strings bowed by a rosined wheel: implicit stick–slip friction, Helmholtz motion, live Schelleng diagram, sympathetic strings on a shared soundboard |
| ✅ | [Glass Armonica](glass/) | Benjamin Franklin (1761) | wet-finger stick–slip on Rayleigh shell modes; split doublets warble as the bowls turn (Bryan effect); water loading |
| ✅ | [Clavicylinder](clavicylinder/) | Ernst Chladni (1800) | iron free–free bars pressed by their keys against a turning wet glass cylinder, from Chladni's own account (1821): implicit stick–slip of a cloth pad on the glass, posts and bent ends rubbed along the lowest mode, keys regulated to the threshold linear stability gives, soaked cloth silencing the treble, cords off the nodes freeing an overtone |
| ✅ | [Hurdy-Gurdy](hurdygurdy/) | the French vielle à roue (18th century) | a cranked, rosined wheel bowing every string (implicit stick–slip, as the Viola Organista's): two chanterelles stopped by tangents tuned as the bowed notes sound, four drones on bridges of their own; the trompette's chien, a mass on a one-sided contact with the soundboard lifted by the string once the wheel's drag beats the tirant: a buzz from a threshold worked out from the string, set off by coups of the wrist on the crank |
| ✅ | [Pyrophone](pyrophone/) | Frédéric Kastner (1873) | flame-driven Rijke tubes on a subcritical Hopf bifurcation: slow self-excited onsets, hysteresis, warm-up drift |
| ✅ | [Singing Arc](arc/) | William Duddell (1900) | Ayrton's falling arc characteristic with a Mayr-type thermal column driving Duddell's tuned circuit: each note grows at the rate a linear analysis gives and sounds about 1 % below Kelvin's formula; a floor from the hot carbons holds the first kind, a higher re-strike voltage the second; capacitors in parallel on one arc, several lamps, hiss, Simon's talking arc; the arc radiates as a thermophone, ∝ dP/dt |

### Physical phenomena

| | Instrument | the physics |
|---|---|---|
| ✅ | [Huygens Keyboard](huygens/) | pulse-coupled relaxation oscillators that lock chords into just intonation (Arnold tongues) |
| ✅ | [Gong Keyboard](gongs/) | von Kármán plates and shallow shells in modal form (energy-stable SAV scheme): bell → shimmer → crash with how hard you strike, pitch glides down (flat) or up (domed) |
| ✅ | [Black-Hole Keyboard](blackhole/) | Kerr quasinormal modes from the Teukolsky equation, h₊ and h× in stereo |
| ✅ | [Quantum Keyboard](quantum/) | exact wavepackets in square, Morse, hydrogen-Rydberg, gravitational and harmonic wells: collapse, fractional and full revivals, decoherence |
| ✅ | [Bubble Organ](bubbles/) | Minnaert bubbles with heat flow, radiation and viscosity; the free surface above raises the pitch; depth, pressure, gas and liquid retune the keyboard |
| ✅ | [Spring Keyboard](springs/) | struck helical springs in modal form, from Wittrick's helical-rod dispersion: each key's spring cut so its heard pitch lands on the note, every echo a chirp rising to the transition frequency F_C; one to three springs a key, magnetic beads in rotation or along the axis, oil and mount damping, and a Slinky whose whistles fall |
| ✅ | [Star Keyboard](stars/) | asteroseismology on an evolutionary track (dwarfs to red giants, sped up 510,800 times): p modes driven at random by convection, each a Lorentzian of its own linewidth, from the asymptotic relation and the scaling relations; mixed modes in red giants, rotational splitting, inclination, a flare kick, and self-excited δ Scuti stars |
| ✅ | [Wind Harp](windharp/) | stiff nylon strings in a wind, each with van der Pol wake oscillators along it (Facchinetti, de Langre & Biolley): the wake locks onto a harmonic inside the band a linear analysis predicts (de Langre's coupled-mode flutter) and holds on past it (hysteresis, from a harmonic balance); every string cut to lock on its note at 4 m/s, so the wind hops each string up or down its own series; shutters that slide open, seeded gusts, mass–damping, Kircher's unison harp, the aeolian tone as a dipole |
| ✅ | [Whistlers](whistlers/) | lightning's VLF crack dispersed along the Earth's magnetic field into falling tones: every key the dipole field line whose whistler's nose is the note, the exact cold-plasma group delay integrated through Carpenter and Anderson's plasmasphere, plasmapause and trough; Eckersley's 1/√f below the nose and a rising branch to the duct's half-gyrofrequency cutoff above it; multi-path ducts, echo trains, one- and two-hop receivers, the crack's tweeks in the Earth–ionosphere waveguide, and dawn chorus on held keys |
| ✅ | [Early Universe](universe/) | the photon–baryon plasma's sound waves, the acoustic peaks of the microwave background, as a key's harmonics: Ma & Bertschinger's equations from adiabatic initial conditions to recombination (Saha, then Peebles's three-level atom), free-streaming neutrinos, Silk damping; checked against Planck 2018's z*, r_s*, k_D and z_eq; a knob per cosmological parameter: baryons make the odd harmonics louder, dark matter sets the radiation driving, neutrinos, helium, the spectral tilt on the mod wheel; listen from the sky (Sachs–Wolfe and Doppler) or inside the plasma, and let the light stream away |
| ✅ | [Hydrogen Lamp](hydrogen/) | a tube of glowing hydrogen as a keyboard: every key its spectrum, each line at its exact ratio with Hα on the note (Hβ 27/20 above, the Balmer series crowding up to a just minor seventh); Einstein coefficients from the exact wavefunctions for every level to n = 50, the radiative cascade solved in slow motion so the low lines light first and the high ones after, each as wide as its levels' lifetimes make it; a discharge (van Regemorter), a nebula's recombination (Storey & Hummer's Balmer decrement, Cases A and B) or a laser into one level; Stark broadening on the mod wheel to the Inglis–Teller limit, Doppler widths, pitch bend as a redshift, a spectrometer window (visible, ultraviolet, infrared), and a what-if fine-structure constant |
| ✅ | [Chladni Plate](chladni/) | Chladni's bowed plates (1787): every key a square plate clamped at its centre, its Kirchhoff modes by Rayleigh–Ritz (Ritz's own method for Chladni's square), bowed at its edge by implicit stick–slip friction while two fingers on the figure's nodal lines damp its rivals; the force set from the figure's speaking threshold; sand on the plate gathers on the nodal lines as it plays |

### Devices built to study physics

| | Instrument | the physics |
|---|---|---|
| ✅ | [Storage Ring](ring/) | a particle accelerator's storage ring heard through a beam pickup: a Gaussian bunch's pulse train at the revolution frequency, betatron sidebands at (n ± Q)·f_rev after an injection kick, decoherence by chromaticity that recoheres every synchrotron period and by octupole amplitude detuning that never does (Meller et al.'s closed forms, checked against tracked particles); RF voltage under key pressure, adiabatic bunch shortening, radiation damping, two-button or difference pickups |
| ✅ | [RF Cavity Bells](cavity/) | superconducting accelerator cavities rung by a passing bunch: nine coupled pillbox cells whose passband beats (Nagle, Knapp & Knapp's circuit model), higher-order modes at Bessel-zero ratios for a bell's partials, kicks from the transit-time integral, offset and bunch-length form factors; input and HOM couplers, BCS surface resistance against the helium bath, beam loading from a bunch train, Lorentz-force detuning through the walls' mechanical mode, quench and recovery |
| ✅ | [Collider Showers](showers/) | a collider calorimeter's lead tungstate crystals (CMS's) rung by the heat of the particle showers they catch, the thermo-acoustic effect: PDG's electromagnetic shower profiles, photon conversion, charged pions' hadronic showers that differ every time, the Molière-radius spread into neighbouring crystals; stretching modes (Love's rod theory) rung by where along the crystal the shower peaks, so TeV showers ring the odd harmonics; bending modes from an off-axis impact; pile-up; piezo or accelerometer readout |
| ✅ | [Project 8](project8/) | an electron in a magnetic trap heard by its cyclotron radiation, as the Project 8 neutrino-mass experiment hears it (CRES): every key a trap, its note the electron's starting frequency; Larmor's power and the radiation reaction in Landau and Lifshitz's closed form make it chirp sharp as it cools until its pitch angle leaves the bottle; the bounce as a waveguide's Doppler vibrato or an antenna ring's Schott harmonics; collisions with the gas on the mod wheel, each a jump or the end; krypton-83m's line, tritium's β spectrum or any energy to 300 keV; Phase II's field, trap, waveguide and noise |
| ✅ | [ABRACADABRA](abracadabra/) | the axion dark-matter search as a keyboard: every key a universe whose axion has the key's mass (its frequency in kHz the note in Hz), heard through ABRACADABRA-10 cm's toroid, pickup loop and SQUID; the Standard Halo Model's waves make each tone a millionth-wide line whose amplitude swells and fades over its coherence time; the coupling decides whether you hear it over the SQUID's noise; a cold stream, a hot halo, a meter-scale toroid |
| ✅ | [TESS](tess/) | a planet crossing its star as NASA's Transiting Exoplanet Survey Satellite sees it: every key a planet whose year, sped up 38 million times, is its note, and the star's light the waveform; the limb-darkened disc's dip (ring by ring, Claret's TESS-band coefficients), Kepler's third law setting how much of its year it spends in front (low keys buzz, high keys are round); the impact parameter on the mod wheel; TESS's photon, read and zodiacal noise at the star's magnitude, velocity its brightness; π Mensae c, LHS 3844 b, TOI-700 d and WD 1856+534 b on A4 |
| ✅ | [CUORE](cuore/) | a tellurium dioxide crystal at ten millikelvin, as the CUORE neutrinoless double beta decay search reads it: every key a crystal whose heater fires at the note's rate, sped up 1,320 times, and the germanium thermistor's voltage the waveform; the collaboration's electrothermal model (bias circuit, the thermistor's hot electrons, the crystal's Debye T³ heat capacity, the Teflon clips), so the bolometer's rise and fall are one formant over every key; electrothermal feedback; big pulses saturate the thermistor; the heat sink's temperature on the mod wheel |
| ✅ | [Ion Chain](ionchain/) | a string of trapped ions, the crystal of a trapped-ion quantum computer: every key a Paul trap whose axial frequency is the note, slowed a thousand times; the crystal solved from the trap's pull against Coulomb's law (James 1998's equilibria), a line or past the transition a zigzag, and its normal modes (1, √3, √(29/5) … of the note); a laser pulse whose place, width, angle and length choose which modes ring (Kohn's theorem for a uniform push); two electrodes that hear the image current (Shockley–Ramo) and cool what they hear; the cooling laser on key-up, on every ion or only the end one; the radial pull on the mod wheel, through the zigzag while notes ring |

✅ playable · 🛠 in the workshop ([build briefs](docs/WORKSHOP.md)). Each instrument's README has its equations,
numbers, sources, and a list of what is simplified. The same notes open on
the instrument's page under **How it works**, next to its name.

## Playing

The bottom two letter rows are the keyboard: `Z`–`/` for the white keys
from C, with the black keys on the row above. `Q`–`]` continues an octave
up. `←`/`→` shift the octave, and `↑`/`↓` adjust each instrument's main
control (usually velocity). `Space` is the sustain pedal or that
instrument's equivalent (hold, mute bar, Leslie speed), on every
instrument except the black hole, where there is nothing to hold.
**Enable MIDI** connects a MIDI keyboard (Chrome, Edge and Firefox;
Safari, and every browser on iPhone or iPad, has no Web MIDI, so the button
is hidden there),
including velocity (with a Soft, Normal or Hard curve), the sustain,
sostenuto and soft pedals, aftertouch and, where it means something, the
mod wheel and pitch bend. Once MIDI is on, every other instrument page
turns it on by itself.

**MPE:** a controller that gives each note a channel of its own (a ROLI
Seaboard, a LinnStrument, an Expressive E Osmose) bends, slides and presses
each note alone, wherever the instrument can: a reed, a pipe, a string or a
bow bends; a struck bar or bell keeps its pitch, but its slide (CC74) still
moves what the mod wheel moves, for that note. The MPE menu beside Enable
MIDI is on Auto, which turns MPE on when the controller announces it (its
MPE Configuration Message) and leaves any other keyboard as it was; On
reads channels 2–16 as MPE without the announcement, and Off never does.
The plugins have the same choice as their MPE parameter, and also take
CLAP's per-note expressions. A Seaboard plays as MPE from the moment MIDI
connects it, since it may not announce itself.

**Faders and an XY pad:** a ROLI Seaboard RISE's three touch faders and its
XY pad (CC 107, 109 and 111, and 113 and 114 for X and Y, as it sends them
in its MIDI mode: press its mode button until the faders' lights are white;
in cyan they set the Seaboard's own Glide, Slide and Press sensitivity)
move five of each instrument's controls, on the pages, in the plugins and
in the Forte app, and any controller sending those CCs does the same. Each
moves its control across the slider's whole range; a fader on a stop pulls
it at halfway up. The first touch of each shows which control it moves. Pad Y
is the mod wheel's control wherever the instrument has one.

<details><summary>What the faders and the pad move</summary>

| Instrument | Faders 1 · 2 · 3 | Pad X | Pad Y |
|---|---|---|---|
| Ribbon Piano | Damper strength · Sympathetic resonance · Soundboard body | Felt hardness | Strike position |
| Harpsichord | Front 8′ · Back 8′ · 4′ | Front 8′ from the nut | Back 8′ from the nut |
| Pipe Organ | Principal 8′ · Octave 4′ · Mixture III | Wind: steady … flexible | Wind pressure |
| Free-Reed Organ | 16′ · 8′ · 4′ | Pumping | Bellows pressure |
| Vibraphone | Mallet hardness · Bar–tube gap · Damper felt | Strike point | Shaft speed |
| Carillon | Clapper face · Strike height · Clapper mass | Listener round the bell | Distance from the tower |
| Celesta | Off the centre line · Damper felt · Box tuning | Strike point | Hammer felt |
| Kalimba | Buzzers · Sound hole · Release | Pluck point | Hole covered |
| Steel Pan | Roll speed · Hand mute · Off the long axis | Strike point | Roll |
| Hydraulis | Open rank · Stopped rank · Stopped rank, octave above | Gurgle | Pumping effort |
| Electric Grand | Bass · Middle · Treble | Tremolo rate | Tremolo depth |
| Tonewheel Organ | 16' drawbar · 8' drawbar · 4' drawbar | Tube drive | Expression pedal |
| Tine Piano | Amp drive · Speaker top end · Tip hardness | Stereo vibrato rate | Stereo vibrato depth |
| Reed Piano | Preamp drive · Hammer felt hardness · Strike point | Tremolo rate | Tremolo depth |
| Tangent Clavier | Felt pressure · Key pressure · Treble loss | Upper pickup, from tailpiece | Amplifier gain |
| Sticky-Pad Piano | Tack F₀ · Pole gap at C4 · Pad damping c_p | Tone | Amp drive |
| Trautonium | Sync pulse · Circuit 1 resonance · Circuit 2 resonance | Circuit 2 tuning | Circuit 1 tuning |
| Telharmonium | Manual II's 1st, 3rd and 5th harmonic stops | Distance down the line | Swell pedal |
| Magnetic Resonator Piano | Drive (coil current) · Swell time · Hammer | Phase error | Brightness |
| Viola Organista | Key pressure · Treadle unevenness · Rosin grain | Bow position β | Wheel speed |
| Glass Armonica | Skin moisture · Treadle unevenness · Water in the bowls | Finger pressure | Treadle speed |
| Clavicylinder | Foot’s push · Cloth wetness · Grip | Key pressure | Treadle speed |
| Hurdy-Gurdy | Coup strength · Wheel pressure (string height) · Bounce on the soundboard | Tirant (chien pressure) | Crank speed |
| Pyrophone | Flame lag τ · Flame turbulence · Listening point | Flame position x_f / L | Flame power K |
| Singing Arc | Hissing · Column time constant τ · Listening distance | Electrode gap | Arc current |
| Huygens Keyboard | Rail-sag coupling · Random mistuning · Resonant body | Tone | Pulse coupling |
| Gong Keyboard | Mallet mass · Hand damping on release · Microphone distance | Head stiffness | Strike point |
| Black-Hole Keyboard | Mass ratio q · Viewing inclination ι · Overtone strength | Tone | Spin |
| Quantum Keyboard | Mean level n̄ · Level spread σₙ · Lifetime T₁ | Pump detuning δ | Pure dephasing rate Γ_φ |
| Bubble Organ | Size spread · Nozzle depth · Air pressure above the water | Irregularity | Bubbles per second |
| Spring Keyboard | Damper · Length difference · Bead inertia | Oil bath | Hand on the spring |
| Star Keyboard | Flare kick · Inclination · Core spins faster by | Convective driving | Rotation period |
| Wind Harp | Gust time scale · String Q · String mass | Gustiness | Wind speed |
| Storage Ring | Betatron tune · Amplitude detuning · Momentum spread | Injection kick | Chromaticity |
| RF Cavity Bells | Bunch length · Bunch spacing · Lorentz-force detuning | Beam current | Beam offset |
| Collider Showers | Pile-up · Piezo position · Crystal Q | Particle energy | Impact point |
| Whistlers | Ducts · Echoes · Plasma density | Sferic | Chorus |
| Early Universe | Dark matter density · Time to recombination · Neutrino species | Baryon density | Spectral tilt |
| Hydrogen Lamp | Shutter on release · Time in the glow · Laser level n | Temperature | Density |
| Project 8 | Magnetic field · Energy · Receiver noise | Trap depth | Gas pressure |
| ABRACADABRA | Stream speed · Stream · SQUID noise | Coupling to photons | Halo speed |
| TESS | Temperature · Star radius · Orbit at A4 | Planet radius | Impact parameter |
| Chladni Plate | Bow speed · Rosin · Ring time | Bow force (× threshold) | Bow shift along the edge |

</details>

**Latency:** play through wired headphones or speakers. Bluetooth ones
delay every note by 100–200 ms, enough to make any instrument feel
sluggish; a page warns you once when the browser reports that much (Safari
doesn't report it). The browser's own audio buffer adds about 10–30 ms, and
a computer keyboard a few more than a MIDI keyboard. For the least delay,
play the plugins in a DAW with a small buffer.

Each instrument page reads top to bottom. At the top, the instrument's
name opens the menu of every instrument (and Forte's home page), next to
**How it works**. In the middle are the views, pictures of the physics as
it plays, and below them the rest of the controls, grouped. Each has a
bar on top: the views' turns each view on or off and holds the mode, the
controls' turns each group of controls on or off and holds the presets.
The main views and every group are on at first, and the page remembers
your choice. Drag the handle on the controls' bar to share the height
between the two, all the way to either end, or fold either away with the
chevron at the end of its bar. The few you reach for mid-phrase (the
volume, the computer keys' velocity, a pedal) sit in the keyboard's own
bar, right above the keys, each with its name and its value.
Explanations wait behind ⓘ buttons.

**Your own presets** live in the same menu. *Save these settings…* keeps
the page's settings under a name in your browser, and *Copy a link to
these settings* makes a link that opens the page playing them, to send
to someone. *Your presets and files…* lists yours, and saves them to a
file or opens one: the plugins read and write the same files.

**Tuning**, among the controls, is the same on every instrument: the
**pitch** standard (A = 440 Hz, or 415 for baroque pitch, 392, 422.5, 430,
435, 442, 443 or 466), the **temperament** (equal, ¼- and ⅙-comma
meantone, Werckmeister III, Kirnberger III, Vallotti, Young, Pythagorean
or just intonation) and the **root** it is built on (meantone on D is
purest in D). **Custom** sets each note's cents from equal temperament
by hand, or from a **Scala file** (`.scl`, twelve notes to the octave):
*Load a Scala file* opens one. The instrument is retuned, not
resampled: at 415 Hz the strings are slacker, the bars and bells cut for
their new notes. Presets keep your tuning; your own presets and links
carry it.

**Quality**, beside the CPU readout at the top of the page (the share of the
time the audio takes; hover over it for the worst moment and the voices
sounding), is for phones and older computers. **High** plays all the physics, as the instruments always have;
**Medium** and **Low** play less of what costs the most and is heard the
least (fewer voices sounding at once, fewer partials, the sympathetic
strings lighter or off), and each instrument's notes say what. It belongs
to the device, not the sound: one choice for every instrument in this
browser, which presets and links leave alone. If the sound starts to
crackle, the page suggests a lower setting.

There are two modes. **Discover** shows it all. **Perform** shows just
the views you turned on, filling the screen, with no toggles and no text
in them: for playing,
or for a projector (**Full screen** fills it). The controls in the
keyboard's bar stay where they are, the presets join them, and the
chevron beside the presets (**More controls**) brings back the rest.
Once the audio is on, Perform keeps the screen from dimming and locking
(where the browser can: Chrome, Edge, and Safari from iOS 16.4).

**▶ Tour**, at the start of the views' bar, is a guided tour of the
instrument's physics: a card that walks through it a step at a time,
each step showing the views that make it visible, setting the
instrument up and playing a short phrase while it says what to listen
for, and why. ▶ plays a step again; ✕ (or Esc) ends the tour and puts
back your views and settings.

**The keys** fill the width at the key size you choose (− +), like
GarageBand's: a phone shows an octave or so, a laptop most of the range.
◀ ▶ move an octave, and the overview of the whole range above them drags
anywhere. On a tablet or phone, play with as many fingers as you like:
slide across the keys for a glissando, and strike lower on a key, or
press harder with an Apple Pencil, to play louder. On the nine with
aftertouch (Viola Organista, Tangent Clavier, Free-Reed Organ, Glass
Armonica, Pyrophone, Gong Keyboard, Bubble Organ, Star Keyboard and Wind
Harp), lean on a held key: slide the finger along it, either way, to
press harder. The pedal button stands in for `Space`, and ⌨ lists the
computer keys. On a
phone the page scrolls between the header and the keys, which stay put, with the
controls' bar and its presets just above the keys; turn it sideways
for wider keys. Use
*Share → Add to Home Screen* to run Forte as a full-screen app.

## Plugins

Every instrument (all 25) also comes as a plugin for a DAW: AU,
VST3 and CLAP, and a standalone app, for macOS, Windows and Linux. Download every instrument
together from **All Plugins** on the front page, or one instrument from **↓ Plugin** next to
**How it works** on its page, in every format or one format alone (just the AU, say); both are also in the
[latest release](https://github.com/jdthaler/forte/releases/latest). Then follow
[native/INSTALL.md](native/INSTALL.md): on macOS and Linux, `make install` and `make verify` in
the unpacked folder do it all. They are unsigned, so a Mac needs one Terminal command (`xattr`,
which `make install` runs) before it loads them. The download with every instrument also has the
Forte app, one standalone that plays any of them from its Instrument menu.

In a plugin's window the Presets menu has your own presets too: *Save these settings…* writes
one as a file in a presets folder for that instrument (`~/Library/Audio/Presets/Forte/<id>` on a
Mac, `%APPDATA%\Forte\Presets\<id>` on Windows, `~/.local/share/forte/presets/<id>` on
Linux), and *Open the presets folder* shows it, so a file saved on the site can go there too.
Scala files for the custom temperament go in the `Tunings` folder beside the instruments' (on a
Mac, `~/Library/Audio/Presets/Forte/Tunings`): the menu under Temperament lists them and opens the
folder.

**Quality** (in the CPU group) is in every plugin too, kept with the project and in no preset.
A VST3 or CLAP host that bounces or freezes a track offline gets High whatever it says; the AU
isn't told, so set it back to High before a bounce in Logic.

Releases publish themselves: the site goes live first, and after the green `native` run on
`live` (the branch the site is published from) that follows, the **release-plugins** workflow releases that run's plugins if an instrument's
version or anything under `native/` changed since the latest release (tagged `plugins-v<Forte version>`, with `-2`, `-3`… when
Forte's version didn't change). It can also be started by hand from the Actions tab. Until it
has, the downloads are the latest release's, and they say which release that is and when an
instrument's newer version is still to come.

## Running locally

There is no build step. Serve the folder over HTTP, since AudioWorklets
need it:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/>.

## Tests

Each instrument has a physics test suite: Node ≥ 18, no dependencies.

```bash
npm test
```

It runs the suites in parallel and reports every failure. It includes a
site check (registry, versions, presets) and a level check: every
instrument is trimmed to about the same loudness at its defaults
(`tools/loudness.mjs`).

You can also run one suite, e.g. `node test/blackhole-tests.mjs`. The
suites compare the models with independent results: Euler–Bernoulli
cantilever ratios, Hammond gear tables, published Kerr quasinormal
frequencies, Adler's locking range, and more. They then check that each
engine plays what its model predicts.

## Layout

```
index.html, landing.*        the landing page
<instrument>/                one folder per instrument: page, src/, README
shared/                      shell, generic AudioWorklet, DSP and linear algebra, nav, notes, registry, styles
test/<instrument>-tests.mjs  physics and engine tests
tools/                       demo renderers, data generators, scaffolding
native/                      the instruments' physics in C++: plugins and WebAssembly (docs/PLUGINS.md)
examples/<instrument>/       rendered demos (.m4a)
docs/INSTRUMENT_GUIDE.md     how to build a new instrument
docs/WORKSHOP.md             briefs for the instruments in the workshop
docs/ROADMAP.md              the road to 1.0, and the feature wishlist
docs/template/               the starting point (struck bars)
```

To add an instrument, run
`node tools/new-instrument.mjs <slug> <EngineName> "<Name>"` and follow
[docs/INSTRUMENT_GUIDE.md](docs/INSTRUMENT_GUIDE.md).

## Versions

Forte and each instrument carry their own
[semantic version](https://semver.org), shown on each page and on the
landing page. They are listed in `shared/registry.js` (and in
`package.json` for Forte) and logged in [CHANGELOG.md](CHANGELOG.md);
releases are not tagged. Everything is pre-release (0.x) for now
([docs/ROADMAP.md](docs/ROADMAP.md) says what 1.0 will take):

* **MINOR** (0.**x**.0) for new features, or for changes to an
  instrument's sound or parameters.
* **PATCH** (0.x.**y**) for fixes that leave the intended sound alone.

From 1.0 on, an instrument's MAJOR version will change only when saved
settings or the sound of existing presets break.

## Credits

Forte builds on decades of musical acoustics and physical-modelling
synthesis: the inventors of the instruments it models, the physicists who
worked out how they vibrate, and the researchers and companies who built
physical-modelling instruments first. [docs/PRIOR_ART.md](docs/PRIOR_ART.md),
also at <https://forte.jthaler.net/credits/>, credits the field. Each
instrument's README (its **How it works** notes) ends with its own prior
art and references.

## License

[MIT](LICENSE) © 2026 Jesse Thaler. The WebAssembly and the plugins compile in open-source
libraries (Eigen, fdlibm, CLAP, clap-wrapper, the VST 3 and Audio Unit SDKs, RtAudio, RtMidi,
CHOC and others), whose licences and notices are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); the plugin downloads include it. Instrument names such as Hammond,
Leslie, Rhodes, Wurlitzer, Clavinet, Pianet and Yamaha are trademarks of
their owners. Forte's instruments are physical models inspired by them and
are not affiliated with or endorsed by those companies.
