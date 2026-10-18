# a velocity curve, sostenuto and soft pedals, and pitch bend on three more instruments

### Forte (minor)
- **A velocity curve for your keyboard:** next to Enable MIDI, a menu picks Soft, Normal or Hard
  touch for the velocities a MIDI keyboard sends. Soft makes a light touch louder, Hard asks for a
  firmer one. Every page remembers the choice. The plugins and the Forte app have it as a
  *Velocity curve* parameter (in its own MIDI group), saved with the song. The computer keys and
  the on-screen keys are not affected.
- **Sostenuto (CC66):** pressing the middle pedal holds the keys down at that moment until it is
  lifted, and keys played after it are not held, as on a grand piano. This works on every page
  and in every plugin.
- **Soft pedal (CC67):** keys struck while it is down play softer. On the Ribbon Piano, CC67 is
  still the una corda.
- Pitch bend's range is ±2 semitones on every instrument that bends (`kBendSemitones`).

### Tonewheel Organ (minor)
- **Pitch bend:** the wheel moves the generator's supply frequency, as a variac on a real organ
  would. The whole organ, the vibrato scanner and the tonewheels bend together, ±2 semitones,
  while the motor runs.
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

### Singing Arc (minor)
- **Pitch bend:** the wheel slides the tank coil's iron core, so the arc's note follows, ±2
  semitones. In the talking mode it bends the voice.

### Pyrophone (minor)
- **Pitch bend:** the wheel turns the burner's gas up or down. The hotter gas carries sound
  faster, so every tube's note follows, ±2 semitones.

### Ribbon Piano (minor)
- Velocity curve and sostenuto on the page's MIDI.

### Tine Piano (minor)
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

### Black-Hole Keyboard (minor)
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

### Huygens Keyboard (minor)
- Sostenuto on the page's MIDI.
