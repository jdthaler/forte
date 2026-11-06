# Lift on every instrument

### Forte (minor)
- **Lift on every instrument:** how fast a key comes up (release velocity: a Seaboard's Lift, or a keyboard that sends it) now shapes every instrument's release, and every page and plugin has the Lift switch. A slow lift lets a note go gently, up to twice as long as usual; a fast one ends it as much sooner, and on some sets off what only a quick hand does (a mallet's touch, a grace stroke). A key let go with no release velocity (the computer keys, the pedal, a keyboard that sends none) or a middling one plays exactly as before.
- `native/core/include/forte/lift.h` gives the engines one scale for it (`liftScale`, `liftPast`, `LiftTouch`); `test/lift-tests.mjs` checks every instrument.

### Ribbon Piano (minor)
- **Lift:** How fast the damper falls: a slow lift leaves a longer tail, a fast one stops the string sooner. It can be turned off in the Expression group.

### Vibraphone (minor)
- **Lift:** A fast lift lets the mallet rest on the bar a moment, damping it even with the pedal down. It can be turned off in the Expression group.

### Carillon (minor)
- **Lift:** A fast lift lets go of the wire so sharply that the clapper swings back for a grace stroke. It can be turned off in the Expression group.

### Celesta (minor)
- **Lift:** How fast its felt damper falls: a slow lift leaves a longer tail, a fast one stops the bar sooner. It can be turned off in the Expression group.

### Kalimba (minor)
- **Lift:** A fast lift brushes the thumb back over the tine; with the tines damped on release, a slow lift lets the fingertip settle gently. It can be turned off in the Expression group.

### Steel Pan (minor)
- **Lift:** The hand muting on release: a slow lift lands gently (a longer tail), a fast one firmly; with the notes let ring, a fast lift rests the stick on the note a moment. It can be turned off in the Expression group.

### Hydraulis (minor)
- **Lift:** How the finger lets the slide go back: a slow lift holds it against its spring, closing the pipe gently; a fast one flicks it home. It can be turned off in the Expression group.

### Brass (minor)
- **Lift:** How the breath stops: a slow lift tapers the note, a fast one is a tongue stop. It can be turned off in the Expression group.

### Timpani and Tabla (minor)
- **Lift:** The hand damping the head: a slow lift lets it ring on, a fast one stops it (with the heads let ring, only a fast lift brings the hand down). It can be turned off in the Expression group.

### Marimba and Xylophone (minor)
- **Lift:** A fast lift lets the mallet rest on the bar a moment, damping it. It can be turned off in the Expression group.

### Gamelan (minor)
- **Lift:** The damping hand: on release, a slow lift lets it settle gently (a longer tail) and a fast one stops the bar; damping at the next stroke, a fast lift damps at once. It can be turned off in the Expression group.

### Cimbalom (minor)
- **Lift:** With the dampers on the keys, how fast the felt falls back on the course: a slow lift leaves a longer tail, a fast one stops it sooner. It can be turned off in the Expression group.

### Musical Saw (minor)
- **Lift:** How the bow leaves the blade: a fast lift springs it clear and the trapped note rings on, a slow one drags it off, damping the blade. It can be turned off in the Expression group.

### Tubular Bells (minor)
- **Lift:** How fast the damper bar falls: a slow lift leaves a longer tail, a fast one stops the tube sooner. It can be turned off in the Expression group.

### Electric Grand (minor)
- **Lift:** How fast the damper falls: a slow lift leaves a longer tail, a fast one stops the strings sooner. It can be turned off in the Expression group.

### Tonewheel Organ (minor)
- **Lift:** The key's speed coming up: a slow lift opens its nine contacts one by one, each with its click; a fast one nearly together. It can be turned off in the Expression group.

### Tine Piano (minor)
- **Lift:** How fast the damper falls: a slow lift leaves a longer tail, a fast one stops the tine sooner. It can be turned off in the Expression group.

### Reed Piano (minor)
- **Lift:** How fast the damper falls: a slow lift leaves a longer tail, a fast one stops the reed sooner. It can be turned off in the Expression group.

### Tangent Clavier (minor)
- **Lift:** How fast the tangent leaves the string: a fast lift pulls it off sharply, with its thwack; a slow one eases it off. It can be turned off in the Expression group.

### Sticky-Pad Piano (minor)
- **Lift:** The pad's return: a slow lift lets the reed ring on, a fast one slaps the pad back onto it. It can be turned off in the Expression group.

### Trautonium (minor)
- **Lift:** How fast the finger leaves the wire: a slow lift eases off as the resistance rises, so the pitch slides up; a fast one lets go at once. It can be turned off in the Expression group.

### Telharmonium (minor)
- **Lift:** How fast the relay opens: a slow lift parts its contacts gently, a softer click; a fast one sharply. It can be turned off in the Expression group.

### Magnetic Resonator Piano (minor)
- **Lift:** How fast the drive ramps down and the damper falls: a slow lift lets the string sing on, a fast one stops it sooner. It can be turned off in the Expression group.

### Ondes Martenot (minor)
- **Lift:** How the intensity key lets go: a slow lift fades the note, a fast one cuts it. It can be turned off in the Expression group.

### Cellulophone (minor)
- **Lift:** How fast the key's mirror tilts back out of the beam: a slow lift fades the note, a fast one cuts it. It can be turned off in the Expression group.

### Viola Organista (minor)
- **Lift:** How fast the key lifts the string off the wheel: 60 ms for a slow lift, the tone thinning as it goes, 4 ms for a fast one. It can be turned off in the Expression group.

### Glass Armonica (minor)
- **Lift:** How fast the finger leaves the glass: a slow lift drags off it, damping the bowl; a fast one leaves it ringing. It can be turned off in the Expression group.

### Clavicylinder (minor)
- **Lift:** How fast the bar's cloth leaves the glass: a slow lift drags it off, quieting the bar; a fast one leaves it ringing. It can be turned off in the Expression group.

### Hurdy-Gurdy (minor)
- **Lift:** A slow lift lets the tangent sag off the string: the pitch slides down to the next stop or the open string. It can be turned off in the Expression group.

### Pyrophone (minor)
- **Lift:** How fast the parted flames close up: a slow lift lets the tone fade as they rejoin, a fast one stops it. It can be turned off in the Expression group.

### Singing Arc (minor)
- **Lift:** How fast the key's contacts part: a slow lift lets the spark die away in a long hiss, a fast one snaps them open. It can be turned off in the Expression group.

### Singing Voice (minor)
- **Lift:** How fast the breath falls: a slow lift is a sighing release, a fast one a clean stop. It can be turned off in the Expression group.

### Cristal Baschet (minor)
- **Lift:** How fast the wet fingers leave the rods: a slow lift drags them off, the rods singing on a moment; a fast one leaves them ringing free. It can be turned off in the Expression group.

### Huygens Keyboard (minor)
- **Lift:** How fast the key's supply falls: a slow lift lets the lamp flash on more and more slowly as it fades, a fast one cuts it. It can be turned off in the Expression group.

### Gong Keyboard (minor)
- **Lift:** The hand damping the plate on release: a slow lift lands gently (a longer tail), a fast one firmly. It can be turned off in the Expression group.

### Black-Hole Keyboard (minor)
- **Lift:** A fast lift sets off a second, smaller merger: a black hole of half the mass rings down an octave up. It can be turned off in the Expression group.

### Quantum Keyboard (minor)
- **Lift:** The measurement that ends the note: a fast lift collapses the state at once, a slow one lets it decohere slowly. It can be turned off in the Expression group.

### Bubble Organ (minor)
- **Lift:** How fast the nozzle shuts: a slow lift still lets bubbles go as it closes, a fast one snaps it shut on a last small bubble. It can be turned off in the Expression group.

### Star Keyboard (minor)
- **Lift:** A slow lift lets the convection's driving die away rather than stop at once. It can be turned off in the Expression group.

### Storage Ring (minor)
- **Lift:** How the beam is dumped: a slow lift scrapes it away gently, a fast one fires the abort kicker. It can be turned off in the Expression group.

### RF Cavity Bells (minor)
- **Lift:** How fast the RF is ramped down: a slow lift lets the cavity ring on, a fast one stops it. It can be turned off in the Expression group.

### Collider Showers (minor)
- **Lift:** A fast lift is a pile-up: a second, smaller shower lands in the crystal. It can be turned off in the Expression group.

### Whistlers (minor)
- **Lift:** A slow lift lets the whistler fade slowly; a fast one sends an echo hopping back from the other hemisphere. It can be turned off in the Expression group.

### Early Universe (minor)
- **Lift:** When recombination comes: a fast lift freezes the sound at once, a slow one lets it stream away. It can be turned off in the Expression group.

### Hydrogen Lamp (minor)
- **Lift:** The afterglow when the discharge stops: a slow lift draws it out, a fast one cuts it short. It can be turned off in the Expression group.

### Project 8 (minor)
- **Lift:** How the trap opens: a slow lift lets the electron drift out, its signal fading; a fast one loses it at once. It can be turned off in the Expression group.

### ABRACADABRA (minor)
- **Lift:** How fast the magnet ramps down: a slow lift over up to four times the ramp, a fast one in a quarter of it. It can be turned off in the Expression group.

### TESS (minor)
- **Lift:** A slow lift fades the light curve out through its dips; a fast one cuts it at once. It can be turned off in the Expression group.

### CUORE (minor)
- **Lift:** A slow lift fades the pulses out, the heater firing ever weaker; a fast one cuts the crystal's cooling tail short. It can be turned off in the Expression group.

### Ion Chain (minor)
- **Lift:** The cooling laser: a fast lift cools the ions at once, a slow one gently, letting them ring on. It can be turned off in the Expression group.

### Chladni Plate (minor)
- **Lift:** How the bow leaves the plate: a fast lift springs it clear and the plate rings on, a slow one drags it off, damping it. It can be turned off in the Expression group.

### Birdsong (minor)
- **Lift:** How fast the air sacs empty: a slow lift lets the song fall away, a fast one clips it. It can be turned off in the Expression group.

### Ringing Planets (minor)
- **Lift:** How the recording stops: a slow lift fades the ringing, a fast one cuts it. It can be turned off in the Expression group.

### Pulsars (minor)
- **Lift:** A slow lift fades the pulse train out before the pulsar switches off; a fast one cuts it, the dispersed tail too. It can be turned off in the Expression group.

### Singing Dunes (minor)
- **Lift:** How fast the flow drains when the push stops: a slow lift lets the boom run on, a fast one stops it. It can be turned off in the Expression group.

### NMR Spin Echo (minor)
- **Lift:** How the receiver closes: a slow lift fades the echoes out, a fast one cuts them. It can be turned off in the Expression group.
