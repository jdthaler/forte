# a Seaboard RISE's faders and XY pad move every instrument

### Forte (minor)
- **Faders and an XY pad:** a ROLI Seaboard RISE's three touch faders and its XY pad (CC 107,
  109, 111, then 113 and 114 for X and Y, in its MIDI mode) move five of each instrument's
  controls, on every page, in the plugins and in the Forte app; any controller sending those CCs
  does the same. Each moves its control across the slider's whole range (in log(value) for a log
  one, as the slider does; a stop from halfway up), and the first touch of each says on the page
  which control it moves. README.md lists them.
- **A Seaboard plays as MPE from the start:** when MIDI connects a Seaboard, the page announces
  its MPE zone for it (channels 2–16, ±48 semitones, ROLI Dashboard's defaults), so MPE on Auto
  decodes it even if it never sends the MPE Configuration Message. Off still ignores it.
- The plugins' MIDI controllers on a log parameter move it in log(value), and on a choice step
  through its options, as the pages do.
- The descriptor's other controllers (the Trautonium's CC11) now reach the pages through the shell.

### Ribbon Piano (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Damper strength, Sympathetic resonance, Soundboard body; the pad Felt hardness (X) and Strike position (Y).

### Harpsichord (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Front 8′, Back 8′, 4′; the pad Front 8′ from the nut (X) and Back 8′ from the nut (Y).

### Pipe Organ (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Principal 8′, Octave 4′, Mixture III; the pad Wind: steady … flexible (X) and Wind pressure (Y).

### Free-Reed Organ (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move 16′, 8′, 4′; the pad Pumping (X) and Bellows pressure (Y).

### Vibraphone (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Mallet hardness, Bar–tube gap, Damper felt; the pad Strike point (X) and Shaft speed (Y).

### Carillon (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Clapper face, Strike height, Clapper mass; the pad Listener round the bell (X) and Distance from the tower (Y).

### Celesta (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Off the centre line, Damper felt, Box tuning; the pad Strike point (X) and Hammer felt (Y).

### Kalimba (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Buzzers, Sound hole, Release; the pad Pluck point (X) and Hole covered (Y).

### Steel Pan (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Roll speed, Hand mute, Off the long axis; the pad Strike point (X) and Roll (Y).

### Hydraulis (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Open rank, Stopped rank, Stopped rank, octave above; the pad Gurgle (X) and Pumping effort (Y).

### Electric Grand (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Bass, Middle, Treble; the pad Tremolo rate (X) and Tremolo depth (Y).

### Tonewheel Organ (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move 16' drawbar, 8' drawbar, 4' drawbar; the pad Tube drive (X) and Expression pedal (Y).

### Tine Piano (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Amp drive, Speaker top end, Tip hardness; the pad Stereo vibrato rate (X) and Stereo vibrato depth (Y).

### Reed Piano (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Preamp drive, Hammer felt hardness, Strike point; the pad Tremolo rate (X) and Tremolo depth (Y).

### Tangent Clavier (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Felt pressure, Key pressure, Treble loss; the pad Upper pickup, from tailpiece (X) and Amplifier gain (Y).

### Sticky-Pad Piano (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Tack F₀, Pole gap at C4, Pad damping c_p; the pad Tone (X) and Amp drive (Y).

### Trautonium (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Sync pulse, Circuit 1 resonance, Circuit 2 resonance; the pad Circuit 2 tuning (X) and Circuit 1 tuning (Y).

### Viola Organista (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Key pressure, Treadle unevenness, Rosin grain; the pad Bow position β (X) and Wheel speed (Y).

### Glass Armonica (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Skin moisture, Treadle unevenness, Water in the bowls; the pad Finger pressure (X) and Treadle speed (Y).

### Clavicylinder (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Foot’s push, Cloth wetness, Grip; the pad Key pressure (X) and Treadle speed (Y).

### Pyrophone (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Flame lag τ, Flame turbulence, Listening point; the pad Flame position x_f / L (X) and Flame power K (Y).

### Singing Arc (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Hissing, Column time constant τ, Listening distance; the pad Electrode gap (X) and Arc current (Y).

### Huygens Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Rail-sag coupling, Random mistuning, Resonant body; the pad Tone (X) and Pulse coupling (Y).

### Gong Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Mallet mass, Hand damping on release, Microphone distance; the pad Head stiffness (X) and Strike point (Y).

### Black-Hole Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Mass ratio q, Viewing inclination ι, Overtone strength; the pad Tone (X) and Spin (Y).

### Quantum Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Mean level n̄, Level spread σₙ, Lifetime T₁; the pad Pump detuning δ (X) and Pure dephasing rate Γ_φ (Y).

### Bubble Organ (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Size spread, Nozzle depth, Air pressure above the water; the pad Irregularity (X) and Bubbles per second (Y).

### Spring Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Damper, Length difference, Bead inertia; the pad Oil bath (X) and Hand on the spring (Y).

### Star Keyboard (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Flare kick, Inclination, Core spins faster by; the pad Convective driving (X) and Rotation period (Y).

### Wind Harp (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Gust time scale, String Q, String mass; the pad Gustiness (X) and Wind speed (Y).

### Storage Ring (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Betatron tune, Amplitude detuning, Momentum spread; the pad Injection kick (X) and Chromaticity (Y).

### RF Cavity Bells (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Bunch length, Bunch spacing, Lorentz-force detuning; the pad Beam current (X) and Beam offset (Y).

### Collider Showers (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Pile-up, Piezo position, Crystal Q; the pad Particle energy (X) and Impact point (Y).

### Whistlers (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Ducts, Echoes, Plasma density; the pad Sferic (X) and Chorus (Y).

### Early Universe (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Dark matter density, Time to recombination, Neutrino species; the pad Baryon density (X) and Spectral tilt (Y).

### Hydrogen Lamp (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Shutter on release, Time in the glow, Laser level n; the pad Temperature (X) and Density (Y).

### Project 8 (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Magnetic field, Energy, Receiver noise; the pad Trap depth (X) and Gas pressure (Y).

### ABRACADABRA (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Stream speed, Stream, SQUID noise; the pad Coupling to photons (X) and Halo speed (Y).

### TESS (minor)
- **A Seaboard RISE's faders and XY pad:** the faders move Temperature, Star radius, Orbit at A4; the pad Planet radius (X) and Impact parameter (Y).
