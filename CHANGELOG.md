# Changelog

Forte and each instrument have their own [semantic version](https://semver.org).
Forte's version covers the site and the shared code (`shared/`, the
landing page and the tools). An instrument's version covers its folder,
its tests and its demos. Everything is pre-release (0.x) for now, so any
release may change the sound or the parameters.

Versions change only when `main` is released to `live`, the branch the site
is published from: each pull request into `main` leaves a note in `changes/`
(`changes/README.md`), and `node tools/release.mjs` gathers them into one
entry here, bumping each version once. Until Forte 0.30.1 every change
bumped its versions itself.

Releases up to Forte 0.3.0 are tagged in git as `forte-vX.Y.Z` or
`<instrument>-vX.Y.Z`, for example `piano-v0.1.0`. Later releases are not
tagged; this changelog and the commit titles record them.

## 2026-10-31 — Forte's f mark in Safari

### Forte 0.42.2
- **Forte's f mark shows in Safari:** the mark before each instrument's name, in the instrument menu, on the credits and missing pages and in the plugins' window was the character MUSICAL SYMBOL FORTE, which Safari (and the plugins' window on macOS) has no font for and drew as a stand-in of horizontal lines. It is now a bold italic serif f, which every browser has.

## 2026-10-31 — Regal: repeated notes stay in tune; saved states written as the plugins save them

### Forte 0.42.1
- `tools/contract.mjs --save-states` writes a value as the plugins save it: a value off its step
  on the step (the strike angle in the carillon’s *Major-third bells, warbling*, 11.25° on a 0.5° step, saves as
  11.5°), and a tiny one with its whole exponent (Project 8's gas, 1e-10 mbar, had been written
  as 1e-1). The two states 0.42.0 wrote are written again, so the plugins' saved-state test
  passes and the 0.42.0 plugins can be built.

### Regal 0.1.1
- **A note played again and again no longer creeps sharp.** The voicer's ear, which hears each
  reed while its key is held and retunes it on the next press, counted the silence since the last
  press when a key came down again before its reed had fallen quiet, heard the note flat, and pushed
  every following press sharper (by up to three semitones). It now listens to each press alone.

## 2026-10-31 — the Chladni Plate; Clavichord; search and filters on the front page; Ion Chain; a pinned header on phones, and no fade above it; more presets on most instruments; the Ondes Martenot; a guided tour of each instrument's physics; Regal; Magnetic Resonator Piano; the Telharmonium; virginals and the lute-harpsichord

### Forte 0.42.0
- **Search the front page:** a search box in the bar with the tabs finds instruments by their name, what they are after, their tagline, their physics or their section, a word at a time, ignoring case and accents ("karman", "rhodes", "flame organ"), and marks what it matched in the cards. Each tab says how many it holds that match; `/` jumps to the box, Escape clears it, and Enter opens the only match.
- **Filters:** chips under the bar narrow the cards by what sounds (strings, bars and bells, air, circuits, space, particles) and by whether the notes ring out or sustain while held, each saying how many it would show. The search and the filters are kept in the address, so a filtered list can be shared.
- On a phone the search takes its own row and the tabs and the filters scroll sideways, and on a phone on its side the bar keeps to one row.
- Every instrument in the registry names its filter options (`vibrates`, `notes`), and the site tests check them.
- **No fade at the top of the home-screen app on iPhone:** iOS 26 and later still faded the top
  of the page into a haze below a solid status bar, because nothing was pinned to the top of the
  page. Every page now starts with an invisible bar pinned there, in the colour of its header,
  and WebKit extends that colour under the status bar instead of drawing the haze.
- **The header stays put on phones:** the instrument's name, Start audio, Quality and Panic stick
  to the top of the screen while the views and controls scroll under them, and the Controls bar
  sticks just below it.
- **A guided tour of the physics on every instrument page:** *Tour*, in the header just
  before *How it works*, opens a card that walks through the instrument a step at a time. Each step says
  what to listen and look for, shows the views that make it visible, sets the instrument up
  (a preset, or a few parameters) with the controls it moves outlined, and plays a short
  phrase on the keys (*▶ Play* again, *◀ Back*, *Next ▶*). The card sits at the bottom right on
  a tablet or a computer and folds to its title; on a phone it opens above the views, in the
  page. Closing it (✕, *Done* or Escape) puts back the views, the preset and every setting
  you had, and your volume is never touched.
- **One file per instrument** (`<slug>/src/<slug>-tour.js`, written with `shared/tour.js`):
  `tools/new-instrument.mjs` copies the template's, `test/tour-tests.mjs` checks every step's
  views, presets, parameters and keys against the instrument, and `tools/check-pages.mjs`
  takes each tour from start to end on a computer and a phone.
- `tools/gen-native-params.mjs` refuses an instrument parameter named `preset`, `touch`, `quality` or `mpe`, the ids the plugins save their own parameters under.

### Ribbon Piano 0.12.0
- **Three new presets**, after the others: *Brass strings*, *Titanium strings*, *Three strings a note, una corda*.
- **A guided tour of its physics** in 6 steps: A hammer meets the strings; Two decays, from the unison; Where the hammer strikes; Stiff wire: stretched partials; From strings to ribbons; Una corda.

### Harpsichord 0.9.0
- **A guided tour of its physics** in 6 steps: A quill slips off a string; Where it is plucked: the comb; Registers: two 8′ choirs; Lute and buff; The 4′ and the full harpsichord; Meantone thirds.
- **Virginals and the lute-harpsichord:** a new *Instrument* choice builds the same jacks,
  plectra and strings three more ways. The **muselar** and **spinett** virginals have one choir
  across a rectangular case with both bridges on its soundboard, so each string drives the board
  at both ends (its even partials in opposite phase at the two), plucked near the middle (round,
  flute-like) or near one end (bright); *Jack line moved* slides their jacks along the strings.
  The muselar's **arpichordium** sets lead hooks against the bass strings, which rattle on them.
  The **lute-harpsichord** (Bach's *Lautenwerck*) strings the two 8′ choirs in gut on a shorter
  scale with a brass 4′: gut's bending loss (η_E ≈ 0.04) rolls off the upper partials, and it
  stretches less under a pluck. The harpsichord itself sounds as before.
- Nine presets for them, at the end of the list, and three demos (09–11).
- Its guided tour has two more stops: the virginals (with the arpichordium) and the lute-harpsichord.

### Pipe Organ 0.9.0
- **A guided tour of its physics** in 6 steps: A jet of air, steered; Chiff: the attack; Open and stopped pipes; Overblowing, with a memory; A wind that breathes; The plenum.

### Free-Reed Organ 0.10.0
- **Two new presets**, after the others: *16′ and 8′: the bourdon under the note*, *Lossy reeds (Q 80): they need more wind to start*.
- **A guided tour of its physics** in 6 steps: A reed that swings through a slot; Why it swings by itself; Musette: reeds that beat; The wind decides the pitch; The bellows; The accordion’s cassotto.

### Vibraphone 0.10.0
- **Three new presets**, after the others: *Soft yarn mallets: dark and round*, *Slow motor: a lazy 1.6 Hz tremolo*, *Struck off the edge: the bars twist*.
- **A guided tour of its physics** in 6 steps: A tuned bar; Tuned against plain bars; The resonator; Two oscillators, sharing air; The motor: vibrato that is really tremolo; Discs out of step.

### Carillon 0.7.0
- **Three new presets**, after the others: *Light clappers (1 kg): a thin, bright strike*, *Hard baton strokes: a brighter, shorter contact*, *Major-third bells, warbling*.
- **A guided tour of its physics** in 5 steps: A bell and its partials; The strike note: a pitch that isn’t there; Minor and major third bells; Warble: a bell not quite round; Under the tower, across the square.

### Celesta 0.5.0
- **Three new presets**, after the others: *Soft felt, slow hammers: a hush*, *Heavy hammers: more fundamental, less shimmer*, *Thin bars, 1.5 mm*.
- **A guided tour of its physics** in 5 steps: Steel bars over wooden boxes; Bar and box trade energy; Without its boxes; Where the hammer lands; The keyboard glockenspiel.

### Kalimba 0.4.0
- **Three new presets**, after the others: *Plucked near the bridge: bright overtones*, *Thin tines: soft and quiet in the bass*, *Two bottle caps on a box kalimba*.
- **A guided tour of its physics** in 5 steps: A plucked steel tine; Behind the bridge; Nail or flesh; The box and its sound hole; Mbira with bottle caps.

### Steel Pan 0.4.0
- **Three new presets**, after the others: *Struck at the centre: the octave from the dome alone*, *A rough tuning (15 ¢): the partials beat*, *Cello pans: long skirts, warm and long*.
- **A guided tour of its physics** in 5 steps: Notes hammered into a drum; The tuner’s harmonics; Hard strokes bloom; Flat notes, high domes; Neighbours ring along.

### Hydraulis 0.2.0
- **A guided tour of its physics** in 5 steps: Wind held up by water; The rim: a safety valve; Tired pumpers; The ranks; Slides, not keys.

### Regal 0.1.0
- New instrument, in the traditional section: the Renaissance reed organ, as Praetorius draws it
  (1619) and Monteverdi scores it for Charon in *L'Orfeo*. Four octaves, C2–C6, with Full range
  for A0–C8; Regal 8′, Regal 4′ and Sordun 16′ ranks, and a tremulant.
- **The beating reed:** a brass tongue as a curved cantilever in one mode (Rayleigh's, within
  1.5 % of the exact beam), rolling shut on its shallot from the root out (a penalty contact
  along it, hard for bare brass and padded for a leathered shallot), driven by the Bernoulli jet
  through the gap and fed from its own boot through the key's pallet.
- **The resonators:** each reed's shallot and resonator as Kelly–Lochbaum tubes radiating from
  the open end: short cylinders, funnels, capped balls with holes, or bare shallots, each cut a
  quarter of a harmonic off one of the note's so that the tongue keeps its beat.
- **The wind:** two weighted wedge bellows, one sinking (the wind rising about 3 % as it does)
  while the calcant raises the other, the board bouncing on its air when a chord draws on it,
  and the change from one to the other; a tremulant venting the trunk; or a steady blower.
- **The pitch:** a regal's tongue sets its pitch, so the wind's movements move it. Each reed is
  cut by a measured table (`tools/regal-tuning.mjs`) and retuned, by running it faster or slower,
  for its voicing and the weight on the bellows; knobs moved together are put right by ear from
  the second press of a key. Pitch bend and MPE (±7 semitones) run each key's reeds faster or
  slower. Every reed steps at 48 kHz (96 kHz from 250 Hz), whatever the host's rate.
- Views: the tongue on its shallot, one beat replayed slowly with its pressures and flow; the
  resonator to scale with its impedance; the bellows and the wind; the spectrum and spectrogram.
- Fourteen presets, six demos, a guided tour, and the plugins (AU code `Rega`).

### Clavichord 0.1.0
- **A new instrument: the Clavichord**, after the German clavichord of C. P. E. Bach's day, FF–f³ (A0–C8 with *Full range*), in Traditional. Nothing is sampled: the brass tangent strikes the strings and stays on them as the end of the speaking length, so every partial starts at once and the note lasts as long as the key is held.
- **The finger holds the note.** The tangent rests where the strings' pull balances the finger's force; pressing harder stretches the strings and the note goes sharp (aftertouch, polyphonic or channel, and MPE pressure press harder). The Bebung, the finger rocking on the key, is on the mod wheel with its rate, or a note's own on MPE's slide.
- **Key-up and the listing:** the tangent drops away, the whole string rings for a moment and the listing cloth stops it; thin the listing out and the afterlengths ring along at their own pitches.
- **Double-fretted pairs** (C–C♯, E♭–E, F–F♯, G–G♯, B♭–B; D and A free): the higher tangent takes the strings, and when it lets go the lower one speaks again. **4′ strings in the bass**, as on Hass's large instruments.
- The tuning allows for the tangent's give (the key and finger ride on the strings), solved for each string.
- Views: the strings and tangent from the side with the engine's partials in slow motion, the finger's force and the pitch over the last five seconds, the spectrum with the partials marked, a spectrogram and the course's wire and tensions. Ten presets, six demos, a guided tour in six steps, the plugin (AU code Clvd).

### Electric Grand 0.10.0
- **Three new presets**, after the others: *Hard, worn felt: a bright clank*, *Struck near the end: every partial bright*, *Strong sympathetic resonance (hold the pedal)*.
- **A guided tour of its physics** in 6 steps: Strings heard through the bridge; Why the piezo is bright; Frame or soundboard; Short bass strings; Two strings, two decays; The preamp’s tremolo.

### Tonewheel Organ 0.12.0
- **Three new presets**, after the others: *On 50 Hz mains — a minor third flat*, *Old B-3 — drifted capacitors, leaky wheels*, *Key click — 88 8000 000, worn contacts*.
- **A guided tour of its physics** in 6 steps: Ninety-one spinning wheels; Drawbars: harmonics from shared wheels; Percussion; The scanner vibrato; The Leslie: Doppler, rotating; Tube drive.

### Tine Piano 0.11.0
- **Two new presets**, after the others: *Long cable: the top end rolled off*, *Amp pushed: tines into a breaking amp*.
- **A guided tour of its physics** in 6 steps: A tuning fork with one thin prong; The bell of the attack; Harmonics made by the pickup; Voicing: where the tip sits; The tone bar; The Suitcase’s vibrato.

### Reed Piano 0.10.0
- **Three new presets**, after the others: *Fast tremolo (9 Hz)*, *Soft felt hammers: a round attack*, *Struck near the clamp: a small, clean swing*.
- **A guided tour of its physics** in 5 steps: A struck steel reed; The bark comes from the pickup; Voicing: where the reed rides; Solder tips; Tremolo through the speakers.

### Tangent Clavier 0.10.0
- **Three new presets**, after the others: *Funk · upper pickup, brilliant, muted*, *Growl · magnets close, loud notes double*, *Hard tips · little squeeze, little bend*.
- **A guided tour of its physics** in 5 steps: A string pinched by its key; Two pickups, a comb; Release: the thunk; Velocity: brighter, not louder; Stiff strings, and a glide.

### Sticky-Pad Piano 0.10.0
- **Two new presets**, after the others: *Stiff foam: a louder middle and treble*, *Light solder tips: longer reeds, more overtones*.
- **A guided tour of its physics** in 5 steps: Plucked by sticking; Touch: how fast the bond breaks; Pads that age; Inharmonic reed, harmonic pickup; Pianet N: an electrostatic pickup.

### Trautonium 0.2.0
- **Two new presets**, after the others: *Vowel “ah” (700 Hz and 1.1 kHz)*, *All four circuits*.
- **A guided tour of its physics** in 5 steps: A neon lamp that flashes; Formants: a voice that keeps its vowel; Undertones: the Mixtur; Weak sync: dividers that slip; One wire, sliding.

### Telharmonium 0.1.0
- **Thaddeus Cahill's Telharmonium (1906), the electric music plant on Broadway**, in the electric section: alternators on twelve pitch-shafts geared to one motor (or the eight built in 1906, whose missing keys played the just thirds of A, D, E and G), each key's harmonics the alternators with two to eight times its teeth on its own shaft, so keys that share an alternator share its wave, in phase.
- **The circuits:** every winding is a circuit of one time constant L/R, so each relay's closing leaves an offset that decays (the thump that began every note), and its contacts slide home over a few milliseconds while the current follows them. Each manual's eight harmonic buses carry stops of induction coils, and the notes on a bus share its load: a chord robs its own notes, more so on soft stops.
- **The motor** sags flat under the load with the flywheel's time constant and comes back as the notes let go; pitch bend turns its field rheostat.
- **Down the line:** each manual's music goes out on its own telephone line, the telegrapher's line solved exactly (city cable or open wire on poles, up to 250 km), to a receiver whose magnet pulls a clamped soft-iron diaphragm (Cahill's thin one near 1 kHz, or Arthur Cahill's near 300 Hz) with the square of the flux, so loud bass growls and harmonics without their ground tone bring it back, through a paper horn that resonates on every c/2L.
- Pierce's intonation takes thirds and sevenths just from a held key's shaft; key touch, aftertouch and the swell pedal (CC11, the mod wheel).
- The page draws the shafts and their alternators in use, every bus's current against a lone note's, the line's and the receiver's response under the focused key's harmonics, the key's alternator and harmonics, the spectrum and the spectrogram. Seventeen presets, eight demos, the plugin (AU code Telh).

### Magnetic Resonator Piano 0.1.0
- New instrument: Andrew McPherson's Magnetic Resonator Piano (2009), a grand piano with an
  electromagnet over the strings of every note, fed from one pickup on the soundboard through a
  band-pass filter and a phase-locked loop, so each coil pulls its strings in step with their own
  motion. Notes grow out of silence and sustain as long as the key is down, or sing one harmonic
  alone; the hammers can strike too. All 88 keys.
- **The strings:** a concert grand's stiff strings (the Ribbon Piano's scale), one to three a
  key, each partial integrated exactly, the unisons coupled through a shared resistive bridge
  (prompt sound and aftersound), felt hammers and dampers.
- **The coil:** where McPherson hung them (a fifth of the length in the bass to a third in the
  treble), 21 mm wide, pulling as i²/g² on a biased current that never goes negative, clipped at
  the amplifier's rails and slowed by the coil's 3 kHz corner. A partial with its node under the
  coil cannot be driven (the 5th at C2 and C3, the 4th at C4, the 3rd from C5, as McPherson
  found); a coil set too close makes the string slap it.
- **The loop:** the pickup a block late, a Q-50 band-pass on the driven partial, a phase-locked
  loop and a second oscillator at the calibrated phase; filters a semitone either side hold the
  loop when a neighbour is louder; fifteen channels, as the MRP had. Harmonic (any of the first
  eight, or two or three partials at once), drive waveform (sine, rich, odd, noise), brightness
  on the mod wheel, phase error, an open loop, bias, gap, coil position, swell time.
- The page draws the string under the coil in slow motion, the swell and the loop's lock over
  eight seconds, what the coil can reach of each partial, a spectrum and a spectrogram. Seven
  demos, ten presets, and a guided tour in seven steps.
- **Quality:** 16 and 8 partials a string instead of up to 32, and two strings a key at Low.
- The plugins (AU, VST3, CLAP) and the Forte app play it too.

### Ondes Martenot 0.1.0
- **A new electric instrument: Maurice Martenot's ondes musicales (1928).** The note is the beat of two radio-frequency oscillators, stepped exactly each sample through Adler's equation (1946), so the oscillators pull on each other as they near: within the lock range the beat stops, and above it the low notes' harmonics fall only as rⁿ, r = (Δ − √(Δ² − K²))/K. Every key is trimmed so the pulled beat lands on its note.
- **Keys or the ribbon:** an ondes for every key (chords), or the instrument as built, one tone whose ring slides evenly in semitones to each key pressed while another is held. The keyboard's side-to-side vibrato is on the mod wheel; pitch bend and MPE slide the note (±48 semitones), CC74 rocks its own key, pressure presses harder.
- **The intensity key:** velocity and aftertouch press a bag of graphite and mica powder (0.3 to 9.6 N), and the level follows Quartier et al.'s measurements (2015): 45 dB SPL at 0.39 N to 95 dB at 9.6 N. It squeezes in and lets go fast, and its contact opens at the top.
- **The drawer's timbres:** onde (the detector's envelope, with a balance from a pure sine to a full-wave rectified one), creux, petit gambe, gambe, nasillard (with its pulse width), octaviant and souffle, any of them at once, band-limited with polyBLEP and polyBLAMP where the beat's phase crosses their steps and corners.
- **The four diffuseurs:** the principal loudspeaker; the Résonance's seven brass springs (their modes from the curved-rod dispersion relation, chirping below their 368 Hz transition); the Métallique's tam-tam (the free plate's modes, solved from Kirchhoff's frequency equation, driven at the voice coil, 40–75 cm across); and the Palme's 24 strings in two chromatic octaves from A3, rung through their bridge. Each stands at its own place across the stereo field.
- **Thermal drift:** the oscillators wander by hertz as their valves warm, the same hertz on every note (off by default).
- **A guided tour** in seven steps: the beat, the intensity key, pulling, the drawer, the ribbon, the diffuseurs, and all of them together.
- Quality: Medium plays 12 voices, four springs and the tam-tam's modes to 3 kHz; Low 6 voices, two springs and modes to 1.5 kHz.

### Viola Organista 0.11.0
- **Three new presets**, after the others: *Motor drive: no treadle swing*, *Coarse rosin: a grainy tone*, *Lively soundboard: louder, shorter notes*.
- **A guided tour of its physics** in 5 steps: Strings bowed by a wheel; Schelleng’s window; Where the wheel touches; The attack; Sympathetic strings.

### Glass Armonica 0.10.0
- **Three new presets**, after the others: *Ridged fingertips: a breath of hiss*, *An uneven foot: a big treadle swing*, *Lossy glass: the bowls stop soon after the finger*.
- **A guided tour of its physics** in 6 steps: A wet finger on spinning glass; Why it warbles; The treadle’s speed; How hard to press; Water in the bowl; The free bowl turns its pattern.

### Clavicylinder 0.3.0
- **Two new presets**, after the others: *One layer of cloth: the key’s knock shows*, *Heavy flywheel: chords keep the speed*.
- **A guided tour of its physics** in 4 steps: Iron bars rubbed by glass; A threshold, then a swell; Only the lowest mode; Cloth wet, cloth soaked.

### Hurdy-Gurdy 0.2.0
- **Two new presets**, after the others: *Four coups a turn*, *Cotton on the strings: a soft, wide grip*.
- **A guided tour of its physics** in 5 steps: A wheel for a bow; The buzzing bridge; Coups: rhythm from the wrist; Sec and gras; Too slow for the top.

### Pyrophone 0.10.0
- **Two new presets**, after the others: *Heard side-on: the octave cancels, a hollow tone*, *Turbulent flames: breathy*.
- **A guided tour of its physics** in 5 steps: Flames that sing; Born of an instability; Hysteresis: tubes that remember; Where the flame sits: Rayleigh’s map; Glass that warms.

### Singing Arc 0.9.0
- **Three new presets**, after the others: *A short arc (1 mm): low voltage, a gentle curve*, *A lossy coil: the notes grow slowly and quietly*, *Low current (1.5 A): the steepest curve*.
- **A guided tour of its physics** in 6 steps: A lamp that sings; A loop, not a line; Too slow to sing high; Keys add capacitors; Singing and hissing; The talking arc.

### Huygens Keyboard 0.11.0
- **A new preset**, after the others: *High supply (380 V): straighter, brighter ramps*.
- **A guided tour of its physics** in 5 steps: Oscillators that pull each other; Locked chords stop beating; Arnold tongues; Too strong: intervals collapse; Out of tune, played in tune.

### Gong Keyboard 0.10.0
- **Three new presets**, after the others: *Aluminium gong: light, and quick to die*, *Wind gong: thin and flat, struck near the rim*, *A hand on the gong: choked on release*.
- **A guided tour of its physics** in 6 steps: A plate that rings; Harder: the crash; Opera gongs: pitch that glides; Where the mallet lands; Thick bells, thin crashes; A tam-tam roll.

### Black-Hole Keyboard 0.10.0
- **Three new presets**, after the others: *GW190814-like: a lopsided merger (q = 9, a = 0.28)*, *Seen face-on (ι = 0°): circular polarisation*, *A long inspiral: three octaves of chirp*.
- **A guided tour of its physics** in 5 steps: A black hole rings; Two cycles and gone; Spin it up; How it was struck; Chirp, merger, ringdown.

### Quantum Keyboard 0.10.0
- **Three new presets**, after the others: *Morse molecule near dissociation: bright and lopsided*, *Long revivals: eight beats*, *Velocity detector: softer overtones*.
- **A guided tour of its physics** in 5 steps: A wavepacket in a box; Revivals; The harmonic oscillator never dephases; Octave echoes: a molecule; Decoherence: no way back.

### Bubble Organ 0.9.0
- **Two new presets**, after the others: *Pressurised tank (4 atm): about an octave up*, *90 % glycerol: thick, but the treble still rings*.
- **A guided tour of its physics** in 5 steps: A bubble is a spring and a mass; One frequency, no overtones; Deeper, the spring stiffens; Other gases; Rising to the surface.

### Spring Keyboard 0.7.0
- **A new preset**, after the others: *Thick wire: the chirps go up*.
- **A guided tour of its physics** in 5 steps: A spring that echoes; Chirps: dispersion; Wider coils, lower chirps; Springs together: a wash; The Slinky.

### Star Keyboard 0.7.0
- **Two new presets**, after the others: *A lighter track (0.9 M☉)*, *Steep linewidths: the high modes blur*.
- **A guided tour of its physics** in 5 steps: Stars that ring; Driven by convection; A comb of modes; Down the track: dwarfs to red giants; Rotation splits the modes.

### Wind Harp 0.8.0
- **A new preset**, after the others: *Slow, gentle gusts: the strings sway in and out*.
- **A guided tour of its physics** in 5 steps: Strings played by the wind; Lock-in: wake and string agree; A rising wind climbs the harmonics; A gusty evening; Kircher’s harp.

### Storage Ring 0.6.0
- **Three new presets**, after the others: *One button pickup on both channels*, *A slow pickup: the low harmonics weakened*, *A long-lived beam: slow damping, long notes*.
- **A guided tour of its physics** in 5 steps: A bunch going round; Betatron oscillation: sidebands; Decoherence and recoherence; Octupoles: filamentation for good; Near the half-integer.

### RF Cavity Bells 0.5.0
- **Three new presets**, after the others: *Read at the far end: the transmitted power alone*, *Long bunches: only the lowest modes*, *Far off the axis: the dipole band rings*.
- **A guided tour of its physics** in 5 steps: A bell made of microwaves; Nine cells, nine modes: a passband; In step, out of step; Higher-order modes; Warmer than 2 K.

### Collider Showers 0.4.0
- **Three new presets**, after the others: *A long crystal (50 X₀): nothing leaks*, *A lossy crystal (Q 200): short notes*, *Piezo at the middle: the even harmonics silent*.
- **A guided tour of its physics** in 5 steps: A crystal heated by a shower; Where the heat lands sets the tone; Electrons, photons, pions; Off the axis, and on the crack; Pile-up.

### Whistlers 0.4.0
- **Two new presets**, after the others: *By day: a low ionosphere (70 km), higher tweeks*, *Dense plasma: slow, drawn-out whistlers*.
- **A guided tour of its physics** in 5 steps: Lightning heard from space; The nose; Echoes; The plasmapause; Dawn chorus.

### Early Universe 0.3.0
- **Three new presets**, after the others: *No neutrinos: an earlier equality*, *A red tilt (n_s = 0.9): the low harmonics loud*, *No helium: the plasma holds the light longer*.
- **A guided tour of its physics** in 5 steps: Sound in the early universe; Harmonics: the acoustic peaks; Baryons load the odd harmonics; Silk damping; Dark matter’s wells.

### Hydrogen Lamp 0.3.0
- **Two new presets**, after the others: *A cool lamp (5,000 K): only the first lines*, *A hot lamp (80,000 K): far up the series*.
- **A guided tour of its physics** in 5 steps: The light of hydrogen, as sound; The cascade; A lamp and a nebula; Other windows: Lyman and Paschen; Crowded by ions: Stark broadening.

### Project 8 0.4.0
- **Two new presets**, after the others: *A shallow trap: hardly any vibrato*, *Tritium in the antenna ring: shifted harmonics*.
- **A guided tour of its physics** in 5 steps: An electron’s radio song; A magnetic bottle; Gas cuts the tracks; Tritium and the neutrino’s mass; Relativistic electrons.

### ABRACADABRA 0.4.0
- **A new preset**, after the others: *A fast stream (700 km/s): a second line, sharp of the halo*.
- **A guided tour of its physics** in 5 steps: Listening for dark matter; A note that swells on its own; Buried in noise; The halo’s fingerprint; Where it sits.

### TESS 0.3.0
- **Two new presets**, after the others: *A faint star (magnitude 13): dips in the hiss*, *A hot star (6,800 K): flat-bottomed dips*.
- **A guided tour of its physics** in 5 steps: A planet crossing its star; Kepler’s third law; Limb darkening and grazing; Photon noise; Real planets.

### CUORE 0.2.0
- **Two new presets**, after the others: *Firm holders: the heat drains fast, short pulses*, *Loose holders: the heat lingers*.
- **A guided tour of its physics** in 5 steps: A thermometer for single decays; A formant from heat flow; Warmer, quieter, darker; Saturation; A smaller crystal.

### Ion Chain 0.1.0
- New instrument, in the devices section: a string of trapped ions, the crystal of a trapped-ion
  quantum computer. Every key is a Paul trap whose axial frequency is the note (slowed a thousand
  times: A4 is a trap at 440 kHz), holding 1 to 20 ions.
- **The crystal:** solved from the trap's pull against the ions' Coulomb repulsion, a line or,
  once the radial pull is weaker than the line's own push, a zigzag; its normal modes from the
  Hessian, so a note's partials are 1, √3, √(29/5) … times the note, one more for every ion. The
  tests hold it to James (1998)'s equilibria and modes and the closed forms for two and three ions.
- **The kick:** a laser pulse across the chain, its place, width, angle and length choosing which
  modes ring: an end ion rings them all, the centre ion only the odd ones, a beam along the axis
  only the centre of mass (Kohn's theorem), and a long pulse only the low ones.
- **The electrodes:** two, one a channel, hear the image current the ions drive (Shockley–Ramo):
  far away only the centre of mass, close or beside the chain the other modes. Their resistor
  cools the modes it hears while a key is held; letting go turns on the cooling laser, on every ion
  or only the end one (sympathetic cooling). Space and the pedal keep it off.
- **Playing:** the mod wheel weakens the radial pull through the linear–zigzag transition while
  notes ring (their motion carried onto the new modes); pitch bend and MPE change the trap's
  frequency.
- Views: the crystal as a camera sees it, each ion smeared over its motion, with the electrodes
  and the laser; every normal mode's shape and how loud it is; the spectrum, the spectrogram and
  the trap's numbers.
- Twelve presets, eight demos, and the plugins (AU code `Ionc`).
- **A guided tour of its physics** in 6 steps: One, two, three ions; A chain rings like a bell; Where the laser lands; A beam along the axis; What the electrodes hear; The zigzag.

### Chladni Plate 0.1.0
- New instrument, in the phenomena section: Chladni's bowed plates (1787). Every key is a square
  brass plate clamped at its centre, bowed at its edge while the key is held, with a fingertip
  resting on one of the figure's nodal lines; sand on the plate runs off the parts that swing and
  draws the figure.
- **The plate:** Kirchhoff's thin plate solved by Rayleigh–Ritz in Legendre polynomials (four
  symmetry blocks of 144), free or clamped at its centre by a stiff disc; the free square matches
  Leissa's frequencies within 0.05 %. Every key's plate is cut so the chosen figure's mode sounds
  its note (10.5 cm across at A4 for the diagonals in 1.5 mm brass), in brass, glass, steel or
  aluminium.
- **The bow:** stick and slip against up to 64 modes a plate, solved implicitly every sample. The
  force is set as a multiple of the figure's speaking threshold from linear stability; velocity,
  aftertouch and the bow's first bite press harder. Two fingers on the figure's nodal lines damp
  its rivals. Lift them, move the bow along the edge (the mod wheel, or MPE slide) or press too
  hard, and another mode takes the bow.
- **The page:** the plate with its sand, the bow and the fingers; the ten figures' nodal lines;
  the spectrum with the plate's modes; the mode table. Six demos, eleven presets.

## 2026-10-31 — Hurdy-Gurdy

### Forte 0.41.1
- `tools/loudness.mjs` measures a keyboard that stops short of C4 on the key nearest it.

### Hurdy-Gurdy 0.1.0
- New instrument, in the experimental section: the French vielle à roue of the 18th century, in
  G/C. A cranked, rosined wheel bows two chanterelles, stopped by the keys' tangents (G4 to G6),
  over the gros bourdon, the petit bourdon, the mouche and the trompette.
- **The wheel:** every string a bowed waveguide string, the rosin's friction solved implicitly
  at the wheel as on the Viola Organista. The chanterelles share the middle bridge and each drone
  has its own; Schelleng's bounds set how hard each bears on the wheel, so the open strings speak
  cleanly and a slow crank makes the top notes crunch. Each tangent is set so that its note
  sounds in tune when bowed (within 3 ¢), as a maker sets it by ear.
- **The chien:** the trompette's loose bridge, a 1.2 g mass held on the soundboard by the
  tirant's pull and lifted by the string's. Past the crank speed where the wheel's drag beats the
  tirant it lifts once a period and lands on the board (a one-sided contact with the chosen
  bounce): the buzz. The threshold is worked out from the string and shown live.
- **The hand:** the crank's speed on the mod wheel; the coup de poignet (a surge of the wheel
  that sets off the buzz) on Space, the sustain pedal, aftertouch, keys struck hard, or one to
  eight times a turn; the hand's unevenness and the wheel's inertia. The wheel stops when the
  last key lets go (or keeps turning, as a player's does, with the open G4 under the drones),
  and the cotton on the strings damps them.
- Views: the wheel and strings from above, each string's motion and the chien; the chien's lift
  and the trompette's pull against the tirant; the crank's speed over the threshold, with each
  burst of buzz; the spectrum and the spectrogram.
- A Seaboard RISE's faders move Coup strength, Wheel pressure and Bounce on the soundboard; its
  XY pad the tirant (X) and the crank's speed (Y).
- Twelve presets (sec and gras, bourrée and mazurka coups, drones in C), seven demos, and the
  plugins (AU code `Hrdy`).

## 2026-10-30 — vapour in the bubbles, and the surface's echo; the Tangent Clavier's frame knock; CUORE; the Electric Grand's longitudinal modes; the harpsichord's sideways swing; Hydraulis; the Hydrogen Lamp's notes end sooner; the controls' chevron works on phones; the Ribbon Piano's longitudinal modes; a Seaboard RISE's faders and XY pad move every instrument; the stars' linewidths grow with frequency; the steel pan's harmonics climb; the steel pan's skirt rings; Trautonium

### Forte 0.41.0
- tools/pipes-tuning.mjs exports its pitch measurement for tools/hydraulis-tuning.mjs.
- **The controls' open/close button does what it shows on a phone:** the controls sit below the
  views, out of sight under the bar above the keys, so the chevron used to fold and unfold them
  with nothing on screen changing. Now, while they are out of sight, it points up and scrolls them
  into view; opening them scrolls to them; and once they are in view it folds them away.
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

### Ribbon Piano 0.11.0
- **Longitudinal modes and phantom partials:** a string stretched by its own swing now pulls on the
  bridge along its length too, and that pull rings in the string's longitudinal modes, about 15
  times its pitch (A0's first at 378 Hz, G1's at 704 Hz). Pairs of partials drive them at the sums
  of their frequencies, so a forte bass note grows extra partials between its overtones, as in
  Bank & Sujbert's measured G1, louder the harder it is struck (four times the share for twice the
  blow) and fading up the keyboard. **Longitudinal modes** (×1, off for none) sets how much the
  board takes up. A passage costs about a fifth more CPU at High; Medium keeps the first two
  modes, Low none. The demos are rendered again.
- **A Seaboard RISE's faders and XY pad:** the faders move Damper strength, Sympathetic resonance, Soundboard body; the pad Felt hardness (X) and Strike position (Y).

### Harpsichord 0.8.0
- **Sideways motion, the two-stage decay:** the plectrum drags the string sideways as it slides
  along it, so the string swings sideways too when it lets go. The bridge gives far less that way,
  so that swing starts some 20 dB down but drains more slowly, and late in a note it takes over:
  a knee in the decay, with a slow beat where the two swings cross. **Sideways motion** (20 %, 0
  for off) under *Strings and soundboard*. About 15 % more CPU at High; Medium keeps eight
  sideways partials, Low none. The demos are rendered again.
- **A Seaboard RISE's faders and XY pad:** the faders move Front 8′, Back 8′, 4′; the pad Front 8′ from the nut (X) and Back 8′ from the nut (Y).

### Pipe Organ 0.8.0
- The flue pipe moves to its own files (native/instruments/pipes/pipes-flue.h), shared with the
  Hydraulis. The sound is the same, to the bit.
- **A Seaboard RISE's faders and XY pad:** the faders move Principal 8′, Octave 4′, Mixture III; the pad Wind: steady … flexible (X) and Wind pressure (Y).

### Free-Reed Organ 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move 16′, 8′, 4′; the pad Pumping (X) and Bellows pressure (Y).

### Vibraphone 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Mallet hardness, Bar–tube gap, Damper felt; the pad Strike point (X) and Shaft speed (Y).

### Carillon 0.6.0
- **A Seaboard RISE's faders and XY pad:** the faders move Clapper face, Strike height, Clapper mass; the pad Listener round the bell (X) and Distance from the tower (Y).

### Celesta 0.4.0
- **A Seaboard RISE's faders and XY pad:** the faders move Off the centre line, Damper felt, Box tuning; the pad Strike point (X) and Hammer felt (Y).

### Kalimba 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Buzzers, Sound hole, Release; the pad Pluck point (X) and Hole covered (Y).

### Steel Pan 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Roll speed, Hand mute, Off the long axis; the pad Strike point (X) and Roll (Y).
- **A hard stroke climbs the note's harmonics:** the dome now couples every mode of a note to the
  pairs whose sum tone it is (1 + 1 → 2, 1 + 2 → 3, 2 + 2 → 4, 3 + 3 → 6, ...), not just the
  fundamental, octave and twelfth. A forte stroke pumps the octave, the octave the double octave,
  and so on, and the energy swings back and forth: the bright, wobbling bloom of a real pan. The
  coupling's strength, a stroke's size (a full stroke moves the note 1.2 thicknesses) and the
  damping are set from measurements of a struck G3 note (Monteil, Thomas & Touzé 2015), which the
  tests now follow.
- **Damping vs frequency** defaults to 0: the octave and double octave ring as long as the
  fundamental, as measured, instead of dying faster. A full stroke starts about fifteen cents
  sharp and settles.
- **The skirt rings:** the drum's side wall is now a ring of 18-gauge steel 57 cm across with
  modes of its own (its 15th at 832 Hz, where Hansen & Rossing measured one), which every note
  pushes on where it sits round the drum. A partial in tune with one beats with it and drains
  into it (G♯4's octave), and the skirt hands it on to the other ringing notes that share it. It
  radiates almost nothing itself. **Skirt coupling** (0.3 %, 0 for off) sets how strongly.
- **Neighbours sing along with the whole ladder:** a struck note's upper modes now couple to its
  neighbours' too (C4's double octave sets C5's octave ringing), not only its tuned three.
- A demo, *The skirt takes a partial*. At Medium and Low only the tuned modes meet the
  neighbours', and at Low the skirt stays still.

### Hydraulis 0.1.0
- New instrument, in the traditional section: the water organ of Ctesibius (3rd century BC), as
  Hero and Vitruvius describe it and the organs of Dion and Aquincum show it. Two octaves, G3–G5,
  with Full range for A0–C8.
- **The wind:** pumpers push air through their pistons' valves into a bronze bowl standing upside
  down in a cistern. The head of water between inside and outside is the wind, p = ρg·ΔV(1/A_in +
  1/A_out), capped where the water inside reaches the rim and the air bubbles out, each bubble
  ringing at its Minnaert frequency. The water under the rim bounces on the air shut in the bowl
  and chest (about 2.6 Hz) when a key opens or a stroke starts. A pump gives more as the wind
  sags, no faster than the pumpers' pace; tired pumpers let it sag under chords and the pipes
  droop, eager ones overfill the bowl and it gurgles.
- **The slides:** each key pushes a perforated slide whose holes open as two overlapping circles,
  as fast as the velocity says, and a preloaded spring pulls it back.
- **The pipes:** the Pipe Organ's flue pipes on an ancient, nearly constant bore, in four ranks
  as at Aquincum: open, stopped, stopped an octave below and stopped an octave above, each with
  its stopcock. Each pipe is cut to sound its note (tools/hydraulis-tuning.mjs).
- Playing: the mod wheel and key pressure make the pumpers work harder; MPE bends; pumping effort
  on the hardware strip.
- Views: the cistern and the pumps as they move, the wind over the last eight seconds, the four
  ranks lighting on their slides, the spectrum and the spectrogram.
- Sixteen presets, six demos, and the plugins (AU code `Hdls`).
- **A Seaboard RISE's faders and XY pad:** the faders move Open rank, Stopped rank, Stopped rank, octave above; the pad Gurgle (X) and Pumping effort (Y).

### Electric Grand 0.9.0
- **Longitudinal modes and phantom partials:** as on the Ribbon Piano, a string stretched by its
  own swing pulls on the bridge along its length, and that pull rings in the string's
  longitudinal modes, 14–18 times its pitch. The piezo hears it: hard bass notes grow partials
  between their overtones, set so a forte G1's are about as loud as the partials beside them, as
  in Bank & Sujbert's measured grand, fading up the keyboard. **Longitudinal modes** (×1, off for
  none) under *Strings*. A passage costs about a fifth more CPU at High; Medium keeps the first two
  modes, Low none. The demos are rendered again.
- **A Seaboard RISE's faders and XY pad:** the faders move Bass, Middle, Treble; the pad Tremolo rate (X) and Tremolo depth (Y).

### Tonewheel Organ 0.11.0
- **A Seaboard RISE's faders and XY pad:** the faders move 16' drawbar, 8' drawbar, 4' drawbar; the pad Tube drive (X) and Expression pedal (Y).

### Tine Piano 0.10.0
- **A Seaboard RISE's faders and XY pad:** the faders move Amp drive, Speaker top end, Tip hardness; the pad Stereo vibrato rate (X) and Stereo vibrato depth (Y).

### Reed Piano 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Preamp drive, Hammer felt hardness, Strike point; the pad Tremolo rate (X) and Tremolo depth (Y).

### Tangent Clavier 0.9.0
- **Frame knock:** each strike slams the string onto its steel stud, and the rail and case ring
  for a moment under the pickups, which hear that motion under all sixty strings: a short knock
  under every note, most noticeable in the quiet top octave, as on recordings. The frame is an
  estimate (three modes, 0.5–3.3 kHz). **Frame knock** (×1, 0 for off) under *Key and tangent*;
  the out-of-phase pickup setting cancels it. No more CPU to speak of. The demos are rendered
  again.
- **A Seaboard RISE's faders and XY pad:** the faders move Felt pressure, Key pressure, Treble loss; the pad Upper pickup, from tailpiece (X) and Amplifier gain (Y).

### Sticky-Pad Piano 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Tack F₀, Pole gap at C4, Pad damping c_p; the pad Tone (X) and Amp drive (Y).

### Trautonium 0.1.0
- **A Seaboard RISE's faders and XY pad:** the faders move Sync pulse, Circuit 1 resonance, Circuit 2 resonance; the pad Circuit 2 tuning (X) and Circuit 1 tuning (Y).
- New instrument, in the electric section: Friedrich Trautwein's Trautonium (1930) and Oskar
  Sala's Mixtur-Trautonium (1952). A neon lamp across a capacitor charged through a resistance
  wire: wherever the finger presses the wire sets the pitch.
- **The lamp:** the capacitor charges toward the supply and the lamp dumps it from 90 V to 60 V,
  its firing time solved within each sample from the charging curve (every key on pitch to
  0.01 ¢), the sawtooth band-limited with polyBLEP. The supply voltage bows the ramp: near the
  strike voltage a rounder tone.
- **The dividers:** four more lamps a manual, each ganged to the wire to run a little slower than
  f/n (÷1 to ÷24, as Sala's switches) and fired by the master's sync pulse, as the Huygens
  Keyboard's lamps fire each other. The capture window gives where each divides true, slips flat
  or fires a flash early (in closed form, and the tests hold the engine to it).
- **The resonant circuits:** four, tuned in hertz and left there, each rung by every flash from
  its instant (a damped sinusoid), so the harmonics under a peak stand out on every note: a vowel.
  The mod wheel sweeps the first one (MPE: CC74, a note's own).
- **Playing:** *Keys* (a manual per key) or *One wire*, a single tone that slides along the wire
  to each key pressed while another is held, 1/f moving evenly as the finger does. Velocity and
  aftertouch press the wire (the loudness, as on Sala's manuals), a volume pedal on CC11, pitch
  bend, and MPE bends of up to four octaves.
- Views: the lamps' capacitor voltages over the master's flashes, with the sync pulse's band and
  each divider's kicks; the circuits' response under the note's harmonics; the spectrum and the
  spectrogram.
- Twelve presets, eight demos, and the plugins (AU code `Trau`).

### Viola Organista 0.10.0
- **A Seaboard RISE's faders and XY pad:** the faders move Key pressure, Treadle unevenness, Rosin grain; the pad Bow position β (X) and Wheel speed (Y).

### Glass Armonica 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Skin moisture, Treadle unevenness, Water in the bowls; the pad Finger pressure (X) and Treadle speed (Y).

### Clavicylinder 0.2.0
- **A Seaboard RISE's faders and XY pad:** the faders move Foot’s push, Cloth wetness, Grip; the pad Key pressure (X) and Treadle speed (Y).

### Pyrophone 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Flame lag τ, Flame turbulence, Listening point; the pad Flame position x_f / L (X) and Flame power K (Y).

### Singing Arc 0.8.0
- **A Seaboard RISE's faders and XY pad:** the faders move Hissing, Column time constant τ, Listening distance; the pad Electrode gap (X) and Arc current (Y).

### Huygens Keyboard 0.10.0
- **A Seaboard RISE's faders and XY pad:** the faders move Rail-sag coupling, Random mistuning, Resonant body; the pad Tone (X) and Pulse coupling (Y).

### Gong Keyboard 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Mallet mass, Hand damping on release, Microphone distance; the pad Head stiffness (X) and Strike point (Y).

### Black-Hole Keyboard 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Mass ratio q, Viewing inclination ι, Overtone strength; the pad Tone (X) and Spin (Y).

### Quantum Keyboard 0.9.0
- **A Seaboard RISE's faders and XY pad:** the faders move Mean level n̄, Level spread σₙ, Lifetime T₁; the pad Pump detuning δ (X) and Pure dephasing rate Γ_φ (Y).

### Bubble Organ 0.8.0
- **Vapour in the bubbles** (under *Gas and liquid*, off by default): water vapour inside each
  bubble condenses and evaporates as the wall moves, so only the gas is a spring (Brennen's
  ω₀² = [3κ(p₀ − p_v) + 2(3κ−1)σ/R]/ρR²). Every pitch drops by about p_v/2p₀: 20 ¢ at the
  defaults, 75 ¢ under a quarter of an atmosphere; glycerol has almost none.
- **Surface echo at the hydrophones** (under *Output*, off by default): each hydrophone also hears
  every bubble's inverted image above the surface, later and fainter, from where the bubble is as
  it rises. Near the surface it cancels the bass (7 dB on A3 at 30 cm, 22 dB in a 10 cm tank) and
  combs the treble; 20 m down it is a slap 27 ms after each bubble. About twice the CPU while on.
- Three presets and two demos for them.
- **A Seaboard RISE's faders and XY pad:** the faders move Size spread, Nozzle depth, Air pressure above the water; the pad Irregularity (X) and Bubbles per second (Y).

### Spring Keyboard 0.6.0
- **A Seaboard RISE's faders and XY pad:** the faders move Damper, Length difference, Bead inertia; the pad Oil bath (X) and Hand on the spring (Y).

### Star Keyboard 0.6.0
- **A Seaboard RISE's faders and XY pad:** the faders move Flare kick, Inclination, Core spins faster by; the pad Convective driving (X) and Rotation period (Y).
- **Linewidths grow with frequency:** a star's upper modes are damped harder than its lower ones,
  Γ ∝ (ν/ν_max)^α as Kepler measured it (α from Lund et al.'s fit: about 3 for the Sun, 1.5 for
  red giants). So a released star darkens as it rings down, and while it is driven its upper
  modes breathe faster. **Linewidth slope** (×1, 0 for one width per star) under *Convection*. No
  more CPU. The demos are rendered again.

### Wind Harp 0.7.0
- **A Seaboard RISE's faders and XY pad:** the faders move Gust time scale, String Q, String mass; the pad Gustiness (X) and Wind speed (Y).

### Storage Ring 0.5.0
- **A Seaboard RISE's faders and XY pad:** the faders move Betatron tune, Amplitude detuning, Momentum spread; the pad Injection kick (X) and Chromaticity (Y).

### RF Cavity Bells 0.4.0
- **A Seaboard RISE's faders and XY pad:** the faders move Bunch length, Bunch spacing, Lorentz-force detuning; the pad Beam current (X) and Beam offset (Y).

### Collider Showers 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Pile-up, Piezo position, Crystal Q; the pad Particle energy (X) and Impact point (Y).

### Whistlers 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Ducts, Echoes, Plasma density; the pad Sferic (X) and Chorus (Y).

### Early Universe 0.2.0
- **A Seaboard RISE's faders and XY pad:** the faders move Dark matter density, Time to recombination, Neutrino species; the pad Baryon density (X) and Spectral tilt (Y).

### Hydrogen Lamp 0.2.0
- **A shutter on release:** when a key comes up (or the pedal, for a lamp it held), the
  spectrometer's shutter closes over the lamp's light, 60 dB down in *Shutter on release*
  (1 s by default, in Perform too). Not physics, an ending: the atoms' own fade took about 10 s
  at the default slow motion. All the way up the shutter stays open and the lamp fades as before.
- **A Seaboard RISE's faders and XY pad:** the faders move Shutter on release, Time in the glow, Laser level n; the pad Temperature (X) and Density (Y).

### Project 8 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Magnetic field, Energy, Receiver noise; the pad Trap depth (X) and Gas pressure (Y).

### ABRACADABRA 0.3.0
- **A Seaboard RISE's faders and XY pad:** the faders move Stream speed, Stream, SQUID noise; the pad Coupling to photons (X) and Halo speed (Y).

### TESS 0.2.0
- **A Seaboard RISE's faders and XY pad:** the faders move Temperature, Star radius, Orbit at A4; the pad Planet radius (X) and Impact parameter (Y).

### CUORE 0.1.0
- New instrument, in the devices section: the crystals of CUORE, the Cryogenic Underground
  Observatory for Rare Events, the neutrinoless double beta decay search under the Gran Sasso.
  Every key is a 5 cm cube of tellurium dioxide at 10 mK, read by a germanium thermistor; its
  heater fires a pulse of heat at the key's rate, sped up (1,320 times at the defaults), and the
  thermistor's voltage is the sound.
- **The bolometer:** the CUORE collaboration's electrothermal model, stepped every sample (ROS2,
  split where a pulse lands): the bias circuit (60 GΩ loads, the wires' 500 pF), the thermistor's
  electrons (R₀ exp(√(T₀/T)), Joule heating, electron–phonon coupling), the crystal's Debye T³
  heat capacity (2.2 nJ/K at 10 mK) and the Teflon clips to the copper. A 2,528 keV pulse is
  370 µV, rising in 76 ms and falling in 316 ms, against CUORE's measured 55 and 220 ms.
- **What you hear:** every key's pulses pass through the same bolometer, so its rise and fall are
  one formant over the keyboard: low keys buzz, high keys pile up and round off. Big pulses
  saturate the thermistor (mellower, not as much louder); the mod wheel warms the heat sink to
  14 mK (twenty times quieter, slower pulses); 8 mK's hot electrons fall fast. Velocity is the
  pulse's energy (2,528 keV at full, the decay's Q-value), aftertouch adds to it, and pitch bend
  and MPE bend the heater's rate.
- **Views:** the pulses in the crystal's own time, with the proportional answer dashed, and the
  bolometer, each part glowing as it warms.
- Presets: CUORE at 10 mK, its real heater (a pulse every 300 s on A4), warmer, colder, big
  pulses, Cuoricino's 3 cm crystal, long wires, piled up.
- Its plugins (CLAP, VST3, AU and standalone, AU code `Cuor`), with the others.

## 2026-10-30 — Hydrogen Lamp; no haze over the header in the iPhone home-screen app; Perform gives the views the presets' bar; Perform keeps the screen awake

### Forte 0.40.0
- **No haze over the header in the home-screen app on iPhone:** every page asks iOS for a solid
  black status bar instead of a see-through one. iOS 26 blurred and dimmed the page wherever it ran
  under a see-through status bar, about 40 points deep, which hid the instrument's name, Quality
  and Panic. An icon added to the home screen before this keeps the old status bar until it's
  removed and added again.
- Bars that stick to the top while the page scrolls (the front page's kinds of instrument, the
  Controls bar on a phone) and the "Forte was updated" warning stop below the status bar wherever
  the page still runs under one.
- **In Perform the presets sit beside the keys:** the presets and More controls move to the end of the bar above the keys, and the bar that held only them goes, so the views are 40–50 px taller. Where the bar above the keys stacks (a phone upright, a tablet), they share the line its volume and pedals take; where even that line is full (the Ribbon Piano's, on a phone or a tablet), they take a line of their own, about the height the old bar had. A phone held sideways keeps them where they were, a scroll down the page, since its keyboard bar is full. Discover is unchanged.
- **Perform keeps the screen on while you play:** once the audio has started, an instrument page in Perform asks the browser to keep the screen from dimming and locking (the Screen Wake Lock: Chrome, Edge, and Safari from iOS 16.4), so a phone or tablet on a stand, or a projector, stays lit through a long note or a MIDI performance. Discover, a hidden page and stopped audio let it sleep as usual.

### Hydrogen Lamp 0.1.0
- New instrument: a tube of glowing hydrogen as a keyboard. Every key plays the tube's spectrum,
  each line at its exact frequency ratio to Hα, with Hα on the key's note: Hβ 27/20 above it, the
  Balmer series crowding up to a just minor seventh, the Lyman series two octaves and a fourth up,
  the infrared series below.
- **The atom:** every level to n = 50 and every l (1275 states, 40 425 dipole transitions), with
  Einstein coefficients from the exact radial integrals (NIST's to the digits it gives), the 2s
  level's two-photon decay, and the radiative cascade from level to level down to 1s.
- **The excitation:** a discharge (van Regemorter's electron collisions from the ground state), a
  nebula's recombination (coefficients computed from Coulomb functions in
  `tools/hydrogen-native-table.mjs`, matching Storey & Hummer's; Case B's Balmer decrement 2.83
  against their 2.86), or a laser into one np level. Case A or B: the Lyman lines escaping or
  trapped.
- **The cascade in slow motion:** a key switches the excitation on and its release off; the
  atoms' time runs 3 × 10⁷ times slower (a knob), so the low lines light first and the high ones
  after, and the light fades as the levels empty. A *Time in the glow* drains every level.
- **The widths:** each line a Lorentzian as wide as its levels' lifetimes in slow motion (the
  atoms' light as a random process), plus Doppler widths from the temperature and Stark widths
  from the density (Holtsmark's field, set by Hβ's measured width and checked against Inglis and
  Teller's limit); the mod wheel is the density.
- **The spectrometer:** a window (visible, ultraviolet, infrared or every line), pitch bend as a
  redshift (MPE: each lamp's own, and with CC74 its own density), and a what-if fine-structure
  constant up to 40 times the real one, which splits each line into Dirac's components.
- Views: a spectroscope (the lines at their wavelengths, in their colours, lit as they sound) and
  the energy levels, lit by their populations, with the lines heard between them; the spectrum and
  the spectrogram.
- Eleven presets, eight demos, and the plugins (AU code `Hydr`).

## 2026-10-30 — front-page cards a row shorter; Clavicylinder

### Forte 0.39.1
- **The front page's cards keep their buttons on one row:** an instrument's plugin download is a small "↓ Plugin" link beside its version at the card's top right, so Play, Listen and How it works no longer leave Plugin wrapped onto a line of its own (each card is about 40 px shorter on a desktop).

### Clavicylinder 0.1.0
- New instrument: Ernst Chladni's clavicylinder (1800), rebuilt from his own account of it in the
  *Beyträge zur praktischen Akustik* (1821). A straight iron bar for every key, free at both ends
  and tied on cork at the nodes of its lowest mode; the key lifts it against a turning glass
  cylinder wetted with a sponge, and strips of cloth on the glass keep it singing as long as the
  key is down. Chladni's compass, C2–F6, and the rest of the 88 keys with Full range.
- **The bar:** an Euler–Bernoulli free–free beam (modes 1 : 2.76 : 5.40 …), cut to its note from
  its thickness (Chladni's bars were ⅜ inch wide and about a line thick, middle C about 21 cm),
  rubbed on a riveted iron post ⅜ of its length from the back below E4 and on its bent-up back
  end above, as he built it. The friction drives the lowest mode along its own motion, his rule.
- **The cloth on the glass:** a pad of wet broadcloth between the glass and the rubbed point,
  sticking and slipping on friction that falls with sliding speed, solved implicitly every sample.
  Each key is regulated to speak alike; a key speaks once its pressure passes the threshold that
  linear stability predicts (the page shows it), swells in when pressed gently and speaks at once
  when pressed firmly; letting off fades the note away. Once it sings, more pressure adds only a
  little loudness and some edge, as the Paris Institut's report of 1808 found ("limited from
  medium to loudest", fading away "eminent").
- Chladni's faults and remedies as presets: soaked cloth (the high bars stop speaking), soap and
  pumice, cords on the wrong nodes (an overtone takes over), posts all the way up, a light
  flywheel and a slow treadle. The cylinder is a flywheel kept turning by the foot and slowed by
  every bar that drags on it.
- The page draws the bar under the glass in slow motion with the cloth sticking and slipping,
  the slip speed under the cloth, a spectrum and spectrogram, the bar's modes, and the force each
  key needs to speak. Seven demos.
- **Quality:** 4 and 2 of the bar's modes instead of 8, and 24 and 12 released bars left ringing.
- The plugins (AU, VST3, CLAP) and the Forte app play it too.

## 2026-10-29 — controls drawn as hardware; a picture for every shared link; more room for the views on a phone held sideways; Project 8's perfect vacuum and more electrons; fixes from a review of the whole site; TESS

### Forte 0.39.0
- **Every slider is a fader:** a ribbed cap in a slot over a scale of tenths, the slot lit from its left end to the cap so the setting reads at a glance. Every checkbox in the Controls panel is a button whose lamp lights.
- **Output is a small console on every page:** Venue is a five-position selector knob (Studio, Room, Recital, Hall, Cathedral) and Room an amp knob.
- **The pedals look like pedals:** Sustain and Hold above the keys, and the pedal switches beside them, show a brass pedal that goes down when held.
- **Three new faces an instrument can give a control** (`face` in its parameters, `shared/faces.js`): a rotary selector for a short dropdown, a lab dial (a knurled knob over a printed scale, its value in a readout) for a slider, and a toggle switch with a pilot lamp for a checkbox; and a bank of rocker tabs for a dropdown.
- **A shared link shows the instrument:** a link to any instrument's page now shows, in Messages, Slack and social sites, a picture of the page playing a chord, with the instrument's name and tagline; a link to the front page shows sixteen of them under Forte's name. `tools/make-previews.mjs` makes the pictures and writes the tags, and the tests check every page has them.
- **The views get more of a phone held sideways:** the keys are a third shorter there (24 % of the screen's height, not 36 %), the header and the keyboard bar are slimmer, and in Perform Discover | Perform floats over the views as on a desktop. At 750×340 the first view shows 102 px as the page opens in Discover (40 before) and 149 px in Perform (42 before).
- **Long readouts wrap in their column:** a value such as the Celesta's "2.50 mm at C4 → 2.00 mm at C8" ran into the next column's controls; a long one now wraps within its share of the row, and a short one never does.
- **The views come first for the keyboard too:** Tab reaches the views' bar before the controls, in the order they are on screen. The pedal and Latch buttons tell a screen reader whether they are on.
- **The octaves' names on the white keys are easier to read:** darker and a little larger (contrast 2.9 : 1 before, about 5 : 1 now). The front page's tab counts are a little brighter too.
- **How it works no longer opens with the README's line for GitHub** ("Part of Forte. Play it at …").
- **About Forte describes the page as it is now:** the presets in the controls' bar, and Perform showing the views you choose.
- **The front page's words caught up with the instruments:** the Phenomena blurb names the springs and the wind harp, the Devices blurb the axion search, and the experiments from history "came and went".
- **A page for a wrong address:** a mistyped address shows Forte's own page, listing every instrument.

### Ribbon Piano 0.10.0
- **Una corda above the keys is drawn as a pedal.**
- **Volume reads in dB and Room in %, as on every other page** (0.80 is −1.9 dB); the computer keys' hammer speed is called Velocity, as on the Electric Grand. The plugins show the same text.

### Free-Reed Organ 0.8.0
- **The Expression stop is a drawknob among the stops,** as a harmonium's is.

### Vibraphone 0.8.0
- **The motor box:** the Motor is a switch knob (Run, discs open, discs closed) and the shaft speed an amp knob. The pedal above the keys is drawn as a pedal.

### Carillon 0.5.2
- **No Sustain button:** a carillon has no dampers, so the button did nothing; Space and the sustain pedal still change nothing.

### Celesta 0.3.0
- **The pedal above the keys is drawn as a pedal.**

### Tonewheel Organ 0.10.0
- **The console as the B-3 has it:** the percussion switches are four ivory tilt tabs with both legends (On/Off, Soft/Normal, Fast/Slow, Third/Second); the vibrato is the six-position V1–C3 knob with its on tab; the Leslie is the half-moon switch (slow, stop, fast) with a tab that bypasses it; the generator's motor is a Run switch.
- **Volume reads in dB and Room in %, as on every other page.** The plugins show the same text.

### Tine Piano 0.9.2
- **Its knobs, faders and the Output console come from Forte's shared faces,** as on every other page.
- **Volume reads in dB and Room in %, as on every other page;** the computer keys' hammer speed is called Velocity. The plugins show the same text.

### Tangent Clavier 0.8.0
- **The pickup selector is a bank of rocker tabs** (A, B, A+B, A−B) beside the tone tabs, one down at a time.

### Viola Organista 0.9.0
- **Dampers lifted, above the keys, is drawn as a pedal.**

### Singing Arc 0.7.0
- **The arc current is a rheostat dial;** the talking arc's microphone level a knob.

### Huygens Keyboard 0.9.0
- **The bench supply:** the supply voltage is a lab dial and the pitch-hold servo a toggle switch.
- **Volume reads in dB and Room in %, as on every other page.** The plugins show the same text.

### Black-Hole Keyboard 0.8.2
- **Its faders, lamp buttons and the Output console come from Forte's shared faces,** as on every other page.
- **Volume reads in dB and Room in %, as on every other page.** The plugins show the same text.

### Quantum Keyboard 0.8.0
- **The detector is a selector knob** (electrode, coil, antenna); the coherent restrike and the tempo lock are toggle switches.

### Star Keyboard 0.5.2
- **Its tagline says what it plays:** stars from dwarfs like the Sun to red giants, not only Sun-like ones.

### Storage Ring 0.4.0
- **The control room's knobs:** the pickup is a selector, the betatron tune and the synchrotron frequency lab dials.

### RF Cavity Bells 0.3.0
- **The RF rack:** the probes are a selector, the beam current and the input coupler lab dials.

### Collider Showers 0.2.0
- **The test beam's settings:** the particle and the sensor are selectors, the particle energy a lab dial.

### Whistlers 0.2.0
- **The VLF receiver's panel:** the receiver is a selector knob (far end, near) and the real travel time a toggle switch.

### Project 8 0.2.0
- **The rack:** the source and the receiver are selectors, the magnetic field a lab dial.
- **A perfect vacuum is one:** the gas's lowest setting is now no gas at all (the slider says
  "none"), so the "Perfect vacuum, quiet amplifier" preset no longer has collisions. At
  10⁻¹¹ mbar there was still one every 40 s or so, enough to nudge one note in a few.
- **More electrons at once:** High Quality now plays up to 48 (it was 24); Medium and Low stay
  at 16 and 10.

### ABRACADABRA 0.2.0
- **The toroid's supply:** the magnetic field is a lab dial.

### TESS 0.1.0
- New instrument: every key a planet crossing its star, heard as NASA's Transiting Exoplanet
  Survey Satellite sees it, by the star's light, A0–C8. The light is sped up until the planet's
  year is the key's note (a one-day year plays A4 at the default speed-up of 38 million), so each
  transit is one cycle of the waveform and the dip's shape is the timbre.
- **The transit:** the light a dark disc blocks from a limb-darkened star (quadratic limb
  darkening, Claret 2017's TESS-band coefficients by temperature), integrated ring by ring and
  checked against Mandel and Agol's uniform-star overlap; Kepler's third law sets each key's
  orbit from the star's mass, so low keys (far, short dips) buzz and high keys (close, long
  dips) are round. The impact parameter is on the mod wheel: toward the star's edge the dips
  get shorter and shallower, V-shaped, until the planet misses.
- **TESS's noise:** photon counting from the star's TESS magnitude (Sullivan et al. 2015's
  photon rate, collecting area, read noise and zodiacal light, and the 60 ppm-in-an-hour
  floor), heard at the speed-up. Velocity is the star's brightness: a harder key's dips stand
  clearer of the hiss.
- Presets from TESS's discoveries, each planet's own year on A4: π Mensae c, LHS 3844 b,
  TOI-700 d, WD 1856+534 b; and the Earth and the Sun. Eight demos. The page draws the star with
  its planets crossing it, the light curve with a simulated sector of TESS's two-minute data and
  whether TESS would find the planet, a spectrum and a spectrogram.
- **Quality:** fewer planets at once (24 and 12, against 48) and the light curve's harmonics cut
  at 12 or 8 kHz instead of 20 kHz.
- The plugins (AU, VST3, CLAP) and the Forte app play it too.

## 2026-10-26 — ABRACADABRA; controls drawn as the instruments have them; the controls grouped alike on every instrument; Phenomena apart from the devices built to study them; the presets menu outlined; Project 8; only volume, velocity and pedals above the keys, in the keyboard's bar; the views above the controls, sharing the height

### Forte 0.38.0
- **Controls can wear the instrument's own shape:** a drawknob, a harpsichord's hand stop, a Clavinet's rocker tab or an amp's knob, in the Controls panel. Each still works from the keyboard and a screen reader, and a knob turns with a drag up or right (Shift for fine) and goes back to its default with two taps.
- **Output is the same group on every instrument:** Room, Venue and Volume, and nothing else. What used to share it now has a group of its own (Listening, Amp, Cassotto, Sound and the like), and the plugins' windows group them the same way.
- A control surface (the organ's drawbars) sits among the groups in the Controls panel, two columns wide, rather than across the top of it.
- The ⓘ on a control in the keyboard bar is round again.
- **No Enable MIDI button in a browser without Web MIDI** (Safari on a Mac, as on iPhone and iPad); About Forte says where MIDI works.
- **The keyboard bar:** key size (− +) on the left with ⌨ and ◀ ▶, the velocity, volume and pedal on the right.
- **The CPU readout and Quality are one pill**, lined up, and the readout shows only the share of the time the audio takes; hover over it for the worst moment and the voices sounding.
- **A Devices section beside Phenomena:** the front page, its tabs and every page's instrument menu
  now keep the physical phenomena (Huygens, gongs, black holes, wavefunctions, bubbles, springs,
  stars, the wind harp, whistlers and the early universe) apart from the devices physicists build
  to study physics (the Storage Ring, RF Cavity Bells, Collider Showers and Project 8).
- The presets menu in the controls' bar is outlined in the instrument's colour, so it is easy to find.
- **The strip right above the keys keeps to what matters mid-phrase:** the volume, the computer keys' velocity and a pedal (the vibraphone's and celesta's held pedal, the piano's una corda, the clavier's mute, the viola organista's lifted dampers, the kalimba's and steel pan's let-ring). They are small tiles in the keyboard's own bar, beside ◀ ▶, the key size and the pedal button, so the keys have one bar above them, not two; where the line is too short (an upright phone, a tablet, a narrow window) the tiles take a line of their own above the rest. Every other control (stops, tremolo, strike point, motor and the like) stays in its group in the Controls panel, now always just above. In Perform, the chevron on the controls' bar is More controls. A parameter goes in the strip with `strip: true`; `perform: true` still picks the plugins' window's row; a control surface marked `data-control` heads the Controls panel with a toggle of its own.
- **The controls always sit below the views, right above the keys:** the switch that put them beside the views is gone, on every screen.
- **Share the height between the views and the controls:** drag the handle on the controls' bar (or the bar itself), all the way to either end; the chevron at the end of each bar folds its panel away and brings it back. Arrows, Home and End move the handle too, and two taps on it go back to the usual share. The share is the same on every page.
- **Each panel has a bar:** the views' bar holds the views' toggles and Discover | Perform; the controls' bar the groups' toggles and the presets (which leave the keyboard bar, and on a phone the controls above the keys). In Perform the mode floats over the views' corner and the presets stay above the keys. On an upright phone the controls' bar sticks just above the keys.
- **The views arrange themselves to their room:** as many abreast as gives each the most space, so a short panel puts them side by side.

### Harpsichord 0.7.1
- The registers, the coupler and the buff stop are hand stops, slid across to bring a row on.
- Strings and tuning becomes Strings and soundboard (the Soundboard switch joins it), and the tuning moves to a Tuning group at the end, as on every other instrument.
- Above the keys: Volume. Play on, Coupler, Front 8′, Back 8′, 4′, Lute row and Buff stop move to their groups in the Controls panel.

### Pipe Organ 0.7.1
- The stops are drawknobs that stand out when drawn.
- Above the keys: Volume. Principal 8′, Octave 4′, Gedackt 8′, Mixture III and Tremulant move to their groups in the Controls panel.

### Free-Reed Organ 0.7.1
- The stops are drawknobs that stand out when drawn.
- Cassotto and output becomes Cassotto, then Output.
- Above the keys: Volume. 8′, Musette, 16′, 4′, Percussion, Bellows pressure and Expression stop move to their groups in the Controls panel.

### Vibraphone 0.7.1
- Above the keys: Velocity, Pedal held down and Volume. Motor and Shaft speed move to their groups in the Controls panel.

### Carillon 0.5.1
- Above the keys: Velocity and Volume. Distance from the tower moves to its group in the Controls panel.

### Kalimba 0.2.1
- Above the keys: Velocity, Let the tines ring and Volume. Hole covered moves to its group in the Controls panel.

### Steel Pan 0.2.1
- Above the keys: Velocity, Let notes ring and Volume. Strike point and Roll move to their groups in the Controls panel.

### Electric Grand 0.8.1
- The EQ and the tremolo are knobs.
- Highest partial moves from Output to Strings.
- Above the keys: Velocity and Volume. Tremolo depth and Tremolo rate move to their groups in the Controls panel.

### Tonewheel Organ 0.9.1
- The console is split up: the drawbars and swell keep their panel, and each switch joins its group, so the Leslie's Bypass, Stop, Slow and Fast sit with its rotors, the percussion tabs with the percussion's decays, the vibrato and chorus with the scanner, and the motor with the tone generator. Percussion, Scanner vibrato and Leslie speaker come first. Amp & output becomes Amp, then Output.
- Above the keys: Volume. The drawbars and switches move to the top of the Controls panel, with a toggle of their own (Drawbars and switches); Tube drive moves to its group there.

### Tine Piano 0.9.1
- The suitcase's vibrato, drive and top end are knobs.
- Suitcase & amp becomes Suitcase and amp, then Output; Tone bar & mount becomes Tone bar and mount.
- Above the keys: Keyboard velocity and Volume. Stereo vibrato depth and Stereo vibrato rate move to their groups in the Controls panel.

### Reed Piano 0.8.1
- The preamp's drive and the tremolo are knobs.
- Above the keys: Velocity and Volume. Tremolo depth and Tremolo rate move to their groups in the Controls panel.

### Tangent Clavier 0.7.1
- The four tone tabs are rocker tabs, as on the Clavinet.
- Pickups and tone splits into Pickups and Tone tabs.
- Above the keys: Velocity, Mute engaged and Volume. Pickup selector, Soft, Medium, Treble and Brilliant move to their groups in the Controls panel.

### Sticky-Pad Piano 0.8.1
- The tone and the amp's drive are knobs.
- Tone, Amplifier and Amp drive move from Output to an Amp group.
- Above the keys: Velocity and Volume. Tone and Amp drive move to their groups in the Controls panel.

### Viola Organista 0.8.1
- Above the keys: Dampers lifted and Volume. Wheel speed, Bow position β and Key pressure move to their groups in the Controls panel.

### Glass Armonica 0.8.1
- Above the keys: Volume. Finger pressure and Treadle speed move to their groups in the Controls panel.

### Pyrophone 0.8.1
- Listening point moves from Output to a Listening group.
- Above the keys: Velocity and Volume. Flame power K moves to its group in the Controls panel.

### Singing Arc 0.6.1
- Listening distance moves from Output to a Listening group.
- Above the keys: Volume. Arc current and Electrode gap move to their groups in the Controls panel.

### Huygens Keyboard 0.8.1
- Sound keeps Tone, Resonant body and Stereo spread; Room, Venue and Volume move to an Output group.
- Above the keys: Volume. Pulse coupling and Tone move to their groups in the Controls panel.

### Gong Keyboard 0.8.1
- Hand damping on release joins the mallet (Mallet and hand); Microphone distance gets a Listening group, and Nonlinear voices and Coupling terms an Accuracy group.
- Above the keys: Velocity and Volume. Strike point moves to its group in the Controls panel.

### Black-Hole Keyboard 0.8.1
- Room, Venue and Volume move from Listening to an Output group.
- Above the keys: Volume. Spin, Play the inspiral first and Tone move to their groups in the Controls panel.

### Quantum Keyboard 0.7.1
- Above the keys: Velocity and Volume. Coherent restrike moves to its group in the Controls panel.

### Bubble Organ 0.7.1
- Above the keys: Velocity and Volume. Bubbles per second and Irregularity move to their groups in the Controls panel.

### Spring Keyboard 0.5.1
- Above the keys: Velocity and Volume. Hand on the spring moves to its group in the Controls panel.

### Star Keyboard 0.5.1
- Above the keys: Volume. Convective driving and Flare kick move to their groups in the Controls panel.

### Wind Harp 0.6.1
- Above the keys: Velocity and Volume. Wind speed and Gustiness move to their groups in the Controls panel.

### Storage Ring 0.3.1
- Above the keys: Velocity and Volume. Injection kick and Chromaticity move to their groups in the Controls panel.

### RF Cavity Bells 0.2.1
- Couplers and cryostat splits into Couplers (with Probes) and Cryostat.
- Above the keys: Velocity and Volume. Beam offset and Beam current move to their groups in the Controls panel.

### Collider Showers 0.1.1
- Above the keys: Velocity and Volume. Particle, Particle energy and Impact point move to their groups in the Controls panel.

### Whistlers 0.1.1
- Above the keys: Velocity and Volume. Sferic, Ducts, Echoes and Chorus move to their groups in the Controls panel.

### Early Universe 0.1.1
- Above the keys: Velocity and Volume. Baryon density, Dark matter density, Spectral tilt and Time to recombination move to their groups in the Controls panel.

### Project 8 0.1.0
- New instrument: every key a magnetic trap holding one electron, heard by its cyclotron radiation
  as the Project 8 neutrino-mass experiment hears it (cyclotron radiation emission spectroscopy),
  A0–C8. The key's note is the electron's starting frequency, about 26 GHz in Phase II's
  0.959 T, moved down to the keyboard by one factor for every frequency; time is left alone, so
  the electron cools, bounces and escapes as fast as in the real trap.
- **The chirp:** the electron radiates (Larmor's power, the radiation reaction in Landau and
  Lifshitz's closed form), loses energy, and so climbs sharp, about 18 cents in its first second
  in Phase II's field (Project 8 measured 352 ± 55 MHz/s; the model gives 317), until its pitch
  angle has opened past the trap's and it leaves.
- **The trap:** a harmonic magnetic bottle whose depth and length set which pitch angles stay and
  how fast they bounce; the waveguide hears the bounce as a Doppler vibrato (Project 8's
  modulation index), the antenna ring hears the harmonics instead (Schott's Bessel functions).
- **The gas:** hydrogen at the cell's 85 K, its pressure on the mod wheel: each collision is a
  jump in pitch, and most knock the electron out; at Phase II's pressure a track lasts a fifth
  of a millisecond.
- **The sources:** krypton-83m's 17.8 keV line, tritium's β spectrum (every key's note a
  different electron, sharp of it by what its neutrino took), or any energy from 1 to 300 keV.
- The receiver's noise in each key's channel; the pitch bend moves the field; the pedal keeps the
  traps closed.
- Nine presets and eight demos. The page draws the receiver's waterfall, the trap with its
  electrons bouncing, the energies over the β spectrum, a spectrum and a spectrogram.
- **Quality:** fewer electrons at once (16 and 10, against 24) and fewer antenna harmonics (6 and
  3, against 12).
- The plugins (AU, VST3, CLAP) and the Forte app play it too.
- Above the keys: Velocity and Volume. Trap depth, Gas pressure and Receiver move to their groups in the Controls panel.

### ABRACADABRA 0.1.0
- New instrument: every key a universe whose dark matter is an axion of that key's mass, heard
  as the ABRACADABRA experiment would hear it, A0–C8. The axion's frequency in kHz is the key's
  note in Hz (A4 is 1.82 neV, 440 kHz); its line, the SQUID's noise and every time stay in real
  hertz and seconds.
- **The flux:** the axion turns the toroid's field into an effective current, g √2ρ cos(mt) B,
  which threads a flux through the pickup loop in the hole: ABRACADABRA-10 cm's g √ρ 𝒢 V B_max
  (3–6 cm, 12 cm tall, 1 T, 𝒢 = 0.027, V = 890 cm³) and its SQUID coupling (M_in / L_T). The model
  also computes 𝒢 for a rectangular toroid by Maxwell's mutual inductance.
- **The halo:** 64 waves per key, their speeds from the Standard Halo Model (v₀ 220 km/s, the lab
  at 232 km/s), so the tone is a one-sided line a millionth of its frequency wide and its
  amplitude wanders, Rayleigh-distributed, over the coherence time (a second at A4). The field
  lives on while a key is up. A cold stream (O'Hare and Green's) adds a second line that beats.
- **The readout:** each key's channel hisses with the SQUID's 1 μΦ₀/√Hz; the louder of the axion
  and the noise sets the level, so a weak coupling sinks the tone into the hiss. Velocity charges
  the magnet over the ramp time; the pedal keeps it charged.
- Knobs for the coupling, the halo's speed (the mod wheel; CC74 per key over MPE), the stream,
  the field, the toroid's size and the ramp. Five views (the toroid, the search's averaged
  spectrum with the halo's predicted line, where it sits in coupling against mass, spectrum,
  spectrogram), eight presets, eight demos, a Quality trim, the plugin (AU Abra), icon, saved
  state and reference.

## 2026-10-20 — the controls no longer show above their toggles as they scroll; Early Universe; the Quality choice in the top bar; the site goes live before the plugins finish building; Whistlers

### Forte 0.37.0
- **Scrolled, the controls pass under their row of toggles:** they showed in a strip above it,
  in the panel's top padding, both below the views and beside them.
- `tools/check-pages.mjs` scrolls the Controls panel in both arrangements and fails if anything
  shows above its toggles.
- **Quality** moves from the controls to the top bar, beside the CPU readout: until the audio
  starts it is a pill of its own ("Quality High"), then the two read as one ("CPU 12 % · 3
  voices | High"), so what the page costs and what to do about it sit together. The suggestion
  after dropouts points there.
- The velocity curve and MPE menus are drawn as pills on the Ribbon Piano, Tonewheel Organ,
  Tine Piano and Huygens Keyboard pages too.
- **A release puts the site up in minutes:** its pull request into `live` builds the plugins on
  Linux only, like any other, and the macOS and Windows builds, auval and the release archives
  run on `live` after the merge. The plugin release follows when that run is green.
- **The downloads say which plugin release they are:** under the downloads, All Plugins and each
  instrument's Plugin dialog name the latest plugin release, and say so when this version of the
  site or the instrument is newer and its plugins are still to come. An instrument not in a plugin
  release yet shows no downloads until it is.

### Whistlers 0.1.0
- New instrument: lightning's radio crack, dispersed along the Earth's magnetic field into a
  falling tone, a whistler, for every key, A0–C8. Each key is the dipole field line (L = 4.2 at
  C8 out to 23 at A0) whose nose, the frequency that arrives first, is the note: the group delay
  is the cold-plasma whistler's exact group index integrated along the line, through Carpenter
  and Anderson's plasmasphere, plasmapause and trough. Below the nose the tone falls as
  Eckersley's 1/√f; above it a short branch rises to the duct's cutoff at half the
  gyrofrequency. The tests check the delays against Eckersley's law, a polyline integral and the
  nose's tuning (within a hundredth of a cent, in any tuning).
- **The plasma:** the plasmapause (with the Kp that puts it there) and the density; inside the
  plasmasphere, a hundred times thicker, the top keys' whistlers are slower than the ones below.
- **Ducts and echoes:** up to five ducts side by side for multi-path whistlers; the ionosphere's
  reflection sends echoes back along the line, each slower and thinner, heard at the line's far
  end (1, 3, 5 hops) or near the lightning (2, 4, 6).
- **The crack:** a click and its tweeks, the Earth–ionosphere waveguide's modes ringing down
  onto their cutoffs, set by the stroke's distance and the ionosphere's height. **Real travel
  time** plays the crack first and the whistler when it would arrive.
- **Chorus:** held keys sing rising elements, as hot electrons do at dawn; the mod wheel sets how
  many, key pressure brings more.
- Ten presets, from a quiet week to a magnetic storm, an echo train and dawn chorus; eight demos.
  The page draws the field line with the whistler's frequencies travelling along it, a
  spectrogram, the dispersion, the spectrum and the plasma's density.
- **Quality:** fewer strokes at once (16 and 10, against 24), ducts (3 and 2), echoes (cut at
  −40 and −30 dB), tweek modes and chorus elements.
- The plugins (AU, VST3, CLAP) and the Forte app play it too.

### Early Universe 0.1.0
- New instrument: a young universe for every key, A0–C8, its harmonics the sound waves of the
  photon–baryon plasma that the microwave background's acoustic peaks show. Harmonic m is the
  wave of the m-th peak, k = mπ/r_s; pressing the key starts that universe's clock at the
  beginning, each harmonic follows its wave through the radiation era, equality and
  recombination, and the note then holds what the sky shows. Each universe is scaled so its first
  peak is the note.
- **The physics, from the ingredients:** the waves are Ma and Bertschinger's equations in the
  conformal Newtonian gauge (the tightly coupled fluid, cold dark matter, free-streaming
  neutrinos, Einstein's equations), from adiabatic initial conditions; recombination is Saha's
  equation for helium and hydrogen, then Peebles's three-level atom (RECFAST's fudge); Silk
  damping is the diffusion integral with Kaiser's 16/15. From Planck 2018's ω_b and ω_c it gives
  z* = 1089.5, r_s* = 144.5 Mpc, k_D = 0.1407 Mpc⁻¹ and z_eq = 3403, within Planck's errors or
  a few tenths of a percent of them. The tests also check the exact potentials of a radiation
  universe, Kodama and Sasaki's 9/10 through equality, the waves' phase and (1 + R)^(−1/4), Saha
  and Peebles, and the damping, against calculations done independently.
- **A knob per cosmological parameter:** baryon density (more of it, the odd harmonics, the
  compressions, ring louder, and the upper ones last longer), dark matter density (less of it, a
  later equality, the waves driven harder by radiation), neutrino species, helium fraction (more
  of it, the light diffuses and the upper harmonics fade) and the spectral tilt n_s (the mod
  wheel).
- **Listening:** the sky (the temperature with its climb out of the potential well, the
  Sachs–Wolfe effect, and the Doppler shift a quarter cycle on, which can be switched off) or
  inside the plasma, where the note fades by itself once the light goes free. Time to
  recombination sets the clock; letting go of the key sets the light free, and what is left
  streams away as j₀, the upper harmonics first. The pedal keeps the notes.
- Views: each harmonic's wave through the history, with the epochs; a patch of sky made of the
  note's waves in Planck's colours; spectrum, spectrogram and a table of this universe's history
  against Planck's. Eleven presets, seven demos. Plugins and WebAssembly from the start.

## 2026-10-20 — black-hole spheroidal harmonics; Collider Showers; a toggle for every group of controls, and the controls beside or below the views; only controls for playing above the keys, and each row of toggles at the head of its side; the Electric Grand's stereo tremolo; MPE: each note bends and slides on its own; a Quality setting for phones and older computers; Ramsey fringes on the Quantum Keyboard; tunings and temperaments; view toggles that turn their views on and off

### Forte 0.36.0
- **Every group of controls has a toggle,** in a row at the top of the Controls panel: a tap shows or
  hides that group in the Controls panel, in place of folding it. Every group is on at first,
  each page remembers which are on, and a group added later gets a toggle of its own.
- **The Controls panel beside the views or below them:** a switch in the top bar (on wide
  screens) puts the groups in a column beside the views, as before, or side by side below them.
  The choice holds on every page. Tablets and phones always put them below the views, where the
  views and the controls scroll together; on a phone each row of toggles slides sideways.
- **More controls is for Perform:** Discover has the toggles, and Perform hides the toggles and
  the panel until More controls brings the panel back.
- `tools/check-pages.mjs` flips every group's toggle as it does the views', and on the desktop
  tries the switch both ways.
- **The views' toggles head the views and the controls' toggles head the Controls panel,** so the
  two sides read apart; the controls' row stays at the top of the panel as it scrolls, and with
  every group off the panel keeps its toggles.
- `docs/INSTRUMENT_GUIDE.md` says which controls belong above the keys: only what a player changes
  while playing, not the instrument's build, its voicing or the room.
- **MPE (MIDI Polyphonic Expression)** on every page and in every plugin: a controller that gives
  each note a channel of its own (a ROLI Seaboard, a LinnStrument, an Expressive E Osmose) bends,
  slides (CC74) and presses each note alone, wherever the instrument can. Lower and upper zones,
  the MPE Configuration Message, ±48 semitones per note until RPN 0 sets another range; a bend
  follows the keyboard's tuning, so a slide onto the next key lands on its tuned pitch.
- **An MPE menu** beside Enable MIDI (Auto, On, Off; not on phones) and an *MPE* plugin parameter
  (the same three, saved with the song). Auto, the default, turns MPE on only when the controller
  announces it, so an ordinary keyboard and saved songs play as before; a toast says when it
  turns on.
- **The plugins take CLAP's per-note expressions** (tuning, brightness, pressure), and the VST3
  asks for 16 MIDI channels and those note expressions.
- **Pitch bend and channel pressure reach the AU plugins:** clap-wrapper hands them on as
  expressions for every note, which the plugins used to drop, so the wheel did nothing in Logic
  or MainStage.
- **The engine contract** gains `noteBend(ratio, key)` and `slide(value, key)`
  (`forte/expression.h` keeps them per key), and each descriptor says what its notes do with
  them (`mpe: { bend, slide }`); `test/mpe-tests.mjs` checks every instrument against it.
- **Quality** (High, Medium, Low) on every instrument page and in every plugin, for phones and older
  computers: High plays all the physics, exactly as before; Medium and Low play less of what costs
  the most and is heard the least (fewer voices at once, fewer partials or modes, the sympathetic
  strings lighter or off). On the pages it is the last group of controls, CPU: one choice for every
  instrument in the browser, which presets and links leave alone. When the audio starts to drop out,
  the page suggests a lower setting.
- In the plugins Quality is a parameter of its own after the velocity curve, kept with the
  project and in no preset; the Forte app keeps it when you change instrument. A VST3 or CLAP
  host that renders offline (a bounce, a freeze) gets High whatever it is set to.
- `node tools/bench.mjs [slug…]` measures each instrument's engine at each Quality;
  `test/quality-tests.mjs` checks every instrument's High is unchanged to the bit and its Medium
  and Low still play the passage; `tools/check-pages.mjs` checks every page has the choice and
  can change it while the audio plays. The template's engine plays fewer bars at once at Low,
  as an example for new instruments.
- **Tunings and temperaments** on every instrument, the same on the pages and in the plugins: a
  pitch standard (A4 = 440 Hz, 415, 392, 422.5, 430, 435, 442, 443 or 466), a temperament (equal,
  ¼- and ⅙-comma meantone, Werckmeister III, Kirnberger III, Vallotti, Young, Pythagorean, 5-limit
  just, or custom) built on a chosen root key, and the custom temperament's cents note by note.
  The historical temperaments are built from their circles of fifths and checked against their
  published tables. The instruments are retuned, not resampled: each key's pitch target moves,
  and the strings, bars, bells, pipes and oscillators are tuned to it as they are to their note.
  Equal temperament at 440 Hz, the default, sounds exactly as before. Presets keep the tuning;
  your own presets and shared links carry it.
- **Scala files** (.scl, twelve notes to the octave): *Load a Scala file* under Temperament on the
  pages, and in the plugins a menu of the files in a Tunings folder beside the presets' (on a Mac,
  ~/Library/Audio/Presets/Forte/Tunings), which it can open. A scale Forte can't play (not twelve
  notes, not repeating at the octave) says why.
- The plugin window shows the temperament's root only for a temperament, and the custom cents only
  for Custom.
- **Every view's toggle works:** on thirteen instrument pages some toggles did nothing (the RF
  Cavity Bells' passband among them). A view named by its title was looked up under a name that
  changed once its ⓘ was added.
- `tools/check-pages.mjs` turns every view's toggle off and on at every size, and on the desktop
  checks that the views turned on are still on after a reload and all show in Perform.
- **The native tests include `<algorithm>` for `std::clamp`,** which MSVC needs spelled out (the MPE, Reed Piano and plugin tests).
- **The plugin tests use `std::numbers::pi` in place of `M_PI`,** which MSVC leaves undefined.

### Ribbon Piano 0.9.0
- **Above the keys, only controls for playing:** keyboard velocity, una corda and volume. Felt
  hardness, soundboard body and room are in the Controls panel; the plugin window's row follows.
- **Quality:** Medium builds each voice with fewer modes (none above 7 kHz but each family's
  first eight, none past the 80th partial), lowers the oscillator budget to 60 %, lets an
  undamped voice go a little sooner and keeps three partials on each sympathetic string; Low
  stops at 5 kHz, a 35 % budget, and turns the sympathetic strings off. About 60 % and 30 % of
  High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Harpsichord 0.7.0
- **Above the keys, only controls for playing:** the manuals, coupler and stops, and volume. Room
  is in the Controls panel; the plugin window's row follows.
- **Quality:** Medium plays 12 released and 16 sounding keys at most (High 16 and 24), fewer
  partials (none above 7 kHz but the first sixteen, none past the 64th) and three partials on
  each sympathetic string; Low 8 and 10 keys, 5 kHz, and no sympathetic strings. About 60 % and
  30 % of High's work.
- **Tuning:** its Pitch and Temperament become the keyboard's tuning, which every instrument now
  has: seven more pitch standards (392 to 466 Hz), ⅙-comma meantone, Kirnberger III, Vallotti,
  Young, Pythagorean and just intonation besides equal, ¼-comma meantone and Werckmeister III, a
  root for the temperament, and a custom temperament from cents or a Scala file. Saved settings
  and presets keep their pitch and temperament; choosing a preset now keeps the tuning, as it
  keeps the room.

### Pipe Organ 0.7.0
- **Above the keys, only controls for playing:** the stops, tremulant and volume. Wind pressure
  and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, an octave either way:** the air in one key's pipes warms or cools alone.
- **Quality:** each pipe keeps at most eight modes up to 10 kHz at Medium and five up to 7 kHz at
  Low (ten up to 15 kHz at High), and 12 and 8 keys sound at once (20). About 66 % and 44 % of
  High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Free-Reed Organ 0.7.0
- **Above the keys, only controls for playing:** the stops, bellows pressure, expression and
  volume. Room is in the Controls panel; the plugin window's row follows.
- **Per-note bend, an octave either way:** one key's tongues stiffen or soften alone. Further, its
  throat and cell no longer drive the reed.
- **Quality:** 8 keys at once at Medium and 5 at Low (16 at High); every reed that sounds is
  played in full.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Vibraphone 0.7.0
- **Above the keys, only controls for playing:** motor, shaft speed, velocity, pedal and volume.
  Mallet hardness and room are in the Controls panel; the plugin window's row follows.
- **Quality:** modes above 16 kHz (Medium) or 12 kHz (Low) are left out, a bar is let go at −70 or
  −60 dB, and 12 or 8 bars ring at once (16 at High).
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Carillon 0.5.0
- **Above the keys, only controls for playing:** velocity, distance from the tower and volume. The bell's
  profile, asymmetry, clapper, strike angle and the belfry are in the Controls panel; the plugin
  window's row follows.
- **Quality:** a bell leaves out its modes above 16 kHz (Medium) or 12 kHz (Low), lets a mode go
  70 or 60 dB under its loudest, and 24 or 12 bells ring at once (36 at High). About 55 % and
  34 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Celesta 0.2.0
- **Above the keys, only controls for playing:** velocity, pedal and volume. Hammer felt and room
  are in the Controls panel; the plugin window's row follows.
- **Per-note slide: each key's own hammer felt**, taken as the hammer is thrown.
- **Quality:** modes above 16 kHz (Medium) or 12 kHz (Low) are left out, a bar is let go at −70 or
  −60 dB, and 16 or 10 bars ring at once (24 at High).
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Kalimba 0.2.0
- **Above the keys, only controls for playing:** velocity, let the tines ring, hole covered and
  volume. Release, buzzers and room are in the Controls panel; the plugin window's row follows.
- **Quality:** a tine is let go at −80 dB (Medium) or −60 dB (Low), and past 32 or 16 ringing
  tines the oldest is stilled.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Steel Pan 0.2.0
- **Above the keys, only controls for playing:** strike point, roll, velocity, let notes ring and
  volume. Dome rise, stick contact and room are in the Controls panel; the plugin window's row
  follows.
- **Per-note slide: each note's own roll.**
- **Quality:** a stroke rings at most eight modes at Medium and six at Low (twelve at High), the
  three tuned ones always among them, and notes go quiet sooner.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Electric Grand 0.8.0
- **Above the keys, only controls for playing:** velocity, tremolo depth and rate, and volume.
  Felt hardness, the pickup mix, the three-band EQ and room are in the Controls panel; the plugin
  window's row follows.
- **Stereo tremolo:** the CP's preamp tremolo, after the EQ. An oscillator lights a photocell on
  each output in turn, so in stereo the sound swings from side to side, quick to duck and slow to
  come back. *Tremolo depth* (off by default, so saved songs and presets sound as before; in the
  strip above the keys) and *Tremolo rate* (1–10 Hz, in Controls) are plugin parameters too, with
  a new *Stereo tremolo* preset and a demo, slow then fast.
- **Quality:** Medium strikes fewer partials (none above 6 kHz but the first eight, none past the
  80th), lets fading ones go sooner, caps the oscillators at 2400 (the page's own adaptive budget
  still works under it) and keeps three partials on each sympathetic string; Low stops at
  4.5 kHz, caps at 1400 and turns the sympathetic strings off. About 55 % and 27 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Tonewheel Organ 0.9.0
- **Above the keys, only controls for playing:** the drawbars and switches, tube drive and volume.
  Room is in the Controls panel; the plugin window's row follows.
- **An MPE controller's member channels no longer bend the whole organ**: one generator shaft
  turns every wheel, so its notes cannot bend alone.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.
- The tuning moves each tonewheel, on top of the gear ratios (or exact equal temperament, or
  ideal harmonics) and the mains frequency.

### Tine Piano 0.9.0
- **Above the keys, only controls for playing:** keyboard velocity, stereo vibrato depth and rate,
  and volume. Amp drive, speaker top end and room are in the Controls panel; the plugin window's
  row follows.
- **Per-note bend, ±4 octaves:** a key's tuning spring slides alone, as the wheel slides them all.
- **The page passes the pitch wheel on**, which it used to drop.
- **Quality:** a mode 60 dB under its voice's strongest stops being worked out, a voice ends 60 dB
  under its loudest, and 16 voices (Medium) or 10 (Low) sound at once (40 at High); at Low the
  keys below C6 run at the output rate. About 65 % and 38 % of High's work, and far less with
  long pedalled notes.
- Its output stage works out the drive and decimation once instead of twice when the vibrato is
  off: the same samples, a little cheaper.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Reed Piano 0.8.0
- **Above the keys, only controls for playing:** velocity, tremolo depth and rate, and volume.
  Preamp drive, output and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, ±4 octaves:** one reed stiffens or softens alone, as the wheel does them all.
- **Quality:** the reeds run at the output rate instead of twice it, without modes above 16 kHz,
  pruned as they decay (80 dB down at Medium, 60 at Low); 20 and 10 voices (32 at High). About
  40 % and 28 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Tangent Clavier 0.7.0
- **Above the keys, only controls for playing:** velocity, the pickup selector and tone tabs, the
  mute and volume. Room is in the Controls panel; the plugin window's row follows.
- **Per-note bend presses that key harder**, as the wheel presses them all: up only, as far as
  the wheel at full.
- **Quality:** at most 16 voices at Medium and 10 at Low (24 at High); a single note sounds the
  same at every quality.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Sticky-Pad Piano 0.8.0
- **Above the keys, only controls for playing:** velocity, tone, amp drive and volume. The
  amplifier and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, an octave either way:** one reed alone; further down it would swing into the
  pickup's pole piece.
- **Quality:** 16 voices at Medium and 10 at Low (40 at High), a reed rested 70 or 60 dB under its
  loudest, and at Low no reed modes above 12 kHz.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Viola Organista 0.8.0
- **Above the keys, only controls for playing:** wheel speed, bow position, key pressure, dampers
  lifted and volume. Key travel time and room are in the Controls panel; the plugin window's row
  follows.
- **Per-note bend, an octave either way:** one key's bridge slides alone, its string staying in
  Helmholtz motion.
- **Quality:** with the dampers lifted the sympathetic strings ring from C2 to B3 at Medium and
  not at all at Low (C2–C6 at High); the soundboard runs at half rate and released strings stop
  sooner. A held note bows as at High, in pitch and in kind.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Glass Armonica 0.8.0
- **Above the keys, only controls for playing:** finger pressure, treadle speed and volume. Skin
  moisture and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, ±4 octaves:** one bowl's glass stiffens or softens alone.
- **Quality:** three mode families a bowl at Medium and two at Low, 24 and 16 bowls at once (only
  released ones are let go, never a touched one), quiet bowls stopped sooner, and a leaner
  friction solver.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Pyrophone 0.8.0
- **Above the keys, only controls for playing:** flame power, velocity and volume. Key-up flame
  power, turbulence and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, ±4 octaves** (one tube's gas heats or cools alone) and **per-note slide: each
  tube's own flame power.**
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Singing Arc 0.6.0
- **Above the keys, only controls for playing:** arc current, electrode gap and volume. The
  column's time constant, the arcs, the coil and room are in the Controls panel; the plugin
  window's row follows.
- **Per-note bend, an octave either way:** one coil's iron core slides alone. With one arc it
  follows its newest key, as it plays.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Huygens Keyboard 0.8.0
- **Above the keys, only controls for playing:** pulse coupling, tone and volume. The tuning, its
  tonic, key attack and release, and room are in the Controls panel; the plugin window's row
  follows.
- **Per-note bend, ±4 octaves:** one lamp's timing resistor turns alone; the pitch servo holds a
  bent lamp at its bent pitch.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.
- The tuning moves each oscillator's design pitch, on top of the keyboard's own just tuning and
  mistuning, which stay as they were.

### Gong Keyboard 0.8.0
- **Above the keys, only controls for playing:** strike point, velocity and volume. Dome rise,
  asymmetry, head stiffness, strike angle, hand damping and room are in the Controls panel; the
  plugin window's row follows.
- **Per-note slide: where each key's mallet lands**, taken as it strikes.
- **Quality:** at most two gongs on the nonlinear coupling at Medium and one at Low (never more
  than *Nonlinear voices*), 12 and 8 gongs at once (16 at High), a gong let go 60 dB under the
  loudest, and at Low one gong at a time taking extra substeps. About 57 % and 36 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Black-Hole Keyboard 0.8.0
- **Spheroidal harmonics:** each quasinormal mode is now seen through its spin-weighted
  spheroidal harmonic ₋₂S_lm(ι; aω) instead of the spherical ₋₂Y_lm, so at high spin the modes
  mix in other l, as general relativity says. The harmonics come from the spectral method and
  match Leaver's separation constants to better than 10⁻¹². Near extremality, seen at 30°, the (2,2) mode is
  about a tenth louder, (3,3) a third and (4,4) a half; at the default spin, a few per cent.
- **Above the keys, only controls for playing:** spin, the inspiral, tone and volume. Mass ratio,
  inclination and room are in the Controls panel; the plugin window's row follows.
- **Per-note slide: each key's own black hole's spin**, taken at the strike.
- **Quality:** at most 24 ringdowns at Medium and 12 at Low (48 at High); a note alone sounds
  the same at every quality.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Quantum Keyboard 0.7.0
- **Above the keys, only controls for playing:** velocity, coherent restrike and volume. The
  potential, tempo, revival time, dephasing and room are in the Controls panel; the plugin
  window's row follows.
- **Per-note slide: each key's own well's dephasing.**
- **Quality:** a pair budget of 1500 at Medium and 800 at Low (3000 at High), 14 and 9 voices
  (24), and a new note's pairs 50 or 40 dB under its strongest left out. About 61 % and 35 % of
  High's work.
- **Coherent restrike (Ramsey fringes)**, off by default: a key struck again while its packet still
  rings sends a second, phase-locked pulse into the same atom instead of a fresh one, and the two
  pulses' amplitudes add. On a full revival the note follows Ramsey's formula,
  1 + ρ² + 2ρ cos(2πδT − φ) times a fresh note: four times as strong in phase, gone out of phase.
  On the square well's half revival the second pulse leaves every other level, which the box's
  dipole cannot join, so the note goes silent (a dark state). Elsewhere the pulses write fringes
  across the levels and the restrike changes the note's colour and its later revivals with the
  delay. Dephasing between the pulses washes the fringes out.
- Two knobs go with it: the pump's detuning δ from the central level's line (−4 to +4 Hz: the
  fringes as a function of the delay, one every 1/δ seconds) and the pulse pair's phase φ.
- A new preset, *Coherent restrike: Ramsey fringes*. Existing presets and saved settings sound as
  before.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Bubble Organ 0.7.0
- **Above the keys, only controls for playing:** bubbles per second, irregularity, velocity and
  volume. Nozzle depth, gas and room are in the Controls panel; the plugin window's row follows.
- **Per-note bend, ±2 octaves, from the next bubble on**, and **per-note slide: each nozzle's own
  bubble rate.**
- **Quality:** at most 80 bubbles ringing at Medium and 50 at Low (160 at High), each freed 70 or
  60 dB under its peak (80 at High).
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Spring Keyboard 0.5.0
- **Above the keys, only controls for playing:** velocity, hand on the spring and volume. Springs per key,
  the mounts' loss, mallet contact and room are in the Controls panel; the plugin window's row
  follows.
- **Per-note slide: a hand on each key's own springs.**
- **Quality:** a mode is let go 65 dB (Medium) or 60 dB (Low) under the voice's loudest (90 at
  High), and a strike doesn't start modes it would leave below that; 10 and 6 keys at once (16 at
  High). About 55 % and 36 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Star Keyboard 0.5.0
- **Above the keys, only controls for playing:** convective driving, flare kick and volume.
  Rotation period, inclination and room are in the Controls panel; the plugin window's row
  follows.
- **Per-note slide: each key's own star's spin.**
- **Quality:** Medium plays each star's strongest 60 % of modes and Low its strongest 40 %, as
  the observer hears them, raised to keep the note's level; 11 and 8 stars at once (14 at High).
  About 48 % and 25 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.
- **No error when the spectrogram is on as the page loads:** it could draw before the page had
  set up the star it labels its axis from.

### Wind Harp 0.6.0
- **Above the keys, only controls for playing:** wind speed, gustiness, velocity and volume. Room
  is in the Controls panel; the plugin window's row follows.
- **Per-note bend, an octave either way:** one key's strings tighten or slacken alone; a string
  bent out of its band moves to the harmonic the wake picks.
- **Quality:** 8 strings at Medium and 6 at Low ring once released (held and pedalled strings
  always sound), and released strings stop sooner. A held string sounds as at High.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.
- **The top strings stay stable and in tune in strong winds.** A wake shedding close to the sample
  rate (C7 at 12 m/s and 44.1 kHz) could blow up into silence; such a string now steps its wake
  two to eight times a sample, so it sheds at its true frequency (E7 at 8 m/s sounds about twice
  as loud as before). The reference wind sounds as before.

### Storage Ring 0.3.0
- **Above the keys, only controls for playing:** injection kick, chromaticity, velocity and volume.
  Synchrotron frequency, bunch length, pickup and room are in the Controls panel; the plugin
  window's row follows.
- **Per-note slide: each key's own ring's chromaticity.**
- **Quality:** past 24 (Medium) or 12 (Low) beams stored under the pedal, the oldest is scraped
  away; a single beam sounds the same at every quality.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### RF Cavity Bells 0.2.0
- **Above the keys, only controls for playing:** velocity, beam offset, beam current and volume.
  Bunch length, cell-to-cell coupling, input coupler, helium bath and room are in the Controls
  panel; the plugin window's row follows.
- **Per-note bend, ±4 octaves** (one cavity squeezed alone, its bunch train keeping step) and
  **per-note slide: each cavity's own beam offset.** A mode bent past the Nyquist frequency takes
  no kick.
- **Quality:** a bunch rings only the modes heard within 40 dB (Medium) or 30 dB (Low) of the
  cavity's loudest, modes and keys are let go sooner, and 16 or 8 keys sound at once (24 at
  High). About 51 % and 27 % of High's work.
- **Tuning:** a Tuning group under More controls, kept across presets: the pitch standard
  (A = 440 Hz as before, or 415, 392, 422.5, 430, 435, 442, 443, 466), the temperament on a root
  key, and a custom temperament from cents or a Scala file. Equal temperament at 440 Hz, the
  default, sounds as before.

### Collider Showers 0.1.0
- New instrument: a collider calorimeter's lead tungstate crystal for every key, A0–C8, rung by
  the particle shower it catches. The shower's energy heats the crystal at once, and the heat's
  thermal expansion rings it (the thermo-acoustic effect, as in the RAP experiment's bars rung by
  an electron beam): its stretching modes, a harmonic series flattened by the crystal's lateral
  inertia (Love's rod theory), by the overlap of the heat with each mode's strain, and its
  bending modes, inharmonic (a free–free beam), when the heat lies off the axis. The crystals are
  CMS's by default, 25.8 radiation lengths deep and 1.12 Molière radii wide, scaled so the first
  mode is the note. The tests check the profiles against the incomplete gamma function and the
  textbooks' containment, and the kicks against the wave and beam equations solved numerically.
- **The shower:** electrons follow PDG's gamma profile, peaking deeper by the logarithm of the
  energy, so low energies ring bright and TeV showers, peaking near the middle, ring the odd
  harmonics and hardly the even ones. Photons convert at a random depth first (9/7 X₀ on
  average); charged pions cross as a track to a random first interaction and split into photons
  and hadrons (Groom's electromagnetic fraction, Bock et al.'s profile, invisible energy), so no
  two notes are alike. Velocity is the energy: harder is louder and darker.
- **Sideways:** the shower's radial profile (Grindhammer & Peters, 90 % within a Molière radius)
  shares it with the crystals a semitone either side; the impact point (the mod wheel) bends the
  crystal and, on the crack, splits the shower between two keys. Narrow crystals spread it more.
- **Pile-up:** held keys keep catching soft photons from other collisions, at a rate key pressure
  raises: a crackle at the crystal's harmonics.
- A piezo on the side reads the strain (both kinds of mode; its position silences the modes with
  a node there) or an accelerometer on the back face the stretching modes alone. Dampers on
  release; the pedal keeps them off.
- Views: the row of crystals with the particle, its cascade, the heat it leaves and the crystals
  stretching and bending in slow motion; the shower's deposit along the crystal against the mean
  profile with each mode's strain shape and level; spectrum, spectrogram and a table of the
  modes. Eight demos. Plugins and WebAssembly from the start.
- **Above the keys, only controls for playing:** velocity, particle, energy, impact point and
  volume. Pile-up, crystal Q and room are in the Controls panel; the plugin window's row follows.
- **Quality:** 20 crystals ring at once at Medium and 12 at Low (32 at High); a single crystal
  sounds the same at every quality.

## 2026-10-19 — a new instrument: the celesta; the site's links to the changelog and docs show what is published; Gong twins; a kalimba; RF Cavity Bells; spectrogram labels on the right, where the sound comes in; a new instrument: the Steel Pan; sympathetic strings: undamped strings ring along; tension modulation: hard notes start sharp and glide down; licence notices in the downloads; the vibraphone's resonator fittings lose energy; a toggle for every view; your own presets, and links that share settings

### Forte 0.35.0
- **Links show the published files:** the changelog, the install guide, the licence, the credits
  and the links inside each instrument's How it works now open the files on `live`, the branch
  the site is published from, instead of `main`, where unreleased work lands first.
- **The spectrogram's frequency labels and the model's ticks are on the right too**, beside "now", where the newest sound comes in, as well as on the left. A canvas narrower than 240 px keeps only the left ones.
- **The plugin downloads carry the licences:** every archive now holds Forte's `LICENSE.txt` and
  `THIRD-PARTY-NOTICES.md`, the notices of the open-source code compiled into the plugins and the
  site's WebAssembly (Eigen, fdlibm, CLAP, clap-wrapper, the VST 3 and Audio Unit SDKs, RtAudio,
  RtMidi, CHOC, Microsoft's WebView2 loader on Windows), as their licences ask. The credits and
  the README link to it.
- **Every view has a toggle:** a row above the views on every instrument page turns each one on
  or off, in place of the main views and the tabs underneath them. The views that are on share
  the space in rows (side by side on a wide screen, stacked on a tall one); the main ones are on
  at first, and each page remembers which are on.
- **Perform shows the views you chose,** any number of them, without the toggles.
- **Your own presets:** the Presets menu on every page saves the page's settings under a name in
  your browser and lists them beside the factory presets. *Your presets and files…* plays, links,
  saves to a file and deletes them, and opens a preset file.
- **Share a link:** *Copy a link to these settings* makes a link that opens the page playing them
  (the parameters that differ from the defaults, in the link's `#`).
- **Presets in the plugins:** the window's Presets menu saves your own presets as files in a
  presets folder per instrument, lists them, and opens the folder. The files are the site's, so a
  preset moves between the site, the plugins and the Forte app.
- A preset names the parameters as the instrument's contract does, with a format version, so
  what you save keeps working as Forte changes.
- The plugins' preset tests pass on Windows: they open a preset whose name is not plain ASCII
  (¼-comma meantone, an em dash) by its UTF-8 path, as the plugin saves it, and the site's
  preset files they compare against keep `\n` line endings in a Windows checkout.

### Ribbon Piano 0.8.0
- **Sympathetic resonance:** every key whose damper is up (the pedal down, the key held, the
  undamped treble) rings along through the bridge with whatever sounds, and gives back what it
  takes. Each key is its unison's lowest 16 partials below 4 kHz, driven by every other string's
  bridge velocity and never by its own voice. Hold C4 and strike C3: C4 rings along about a
  thousand times as strongly as C♯4 would, about 30 dB under the attack. With the pedal down it
  costs about one and a half times what four sustained notes cost; with it up, almost nothing.
- New slider *Sympathetic resonance* under *Damping & bridge*, 25 % by default (parameter
  `sympathy`): the share of the bridge's motion one string feels from another. 0 turns it off.
- The page hands every key's strings to the engine in the background, so they are ready before
  the pedal goes down.
- **Tension modulation (Kirchhoff–Carrier):** a hard blow stretches the string, so its tension
  and every partial's pitch rise, then glide back as the note decays. Each unison string has its
  own tension, from both bending families (torsion neither stretches nor feels it); tapered
  members use their Ritz shapes. One C3 string at 5 m/s starts 5 ¢ sharp and is within 0.5 ¢
  after 1.8 s; a soft blow does not move. A voice costs about a third more while it glides and
  nothing more once the glide is under a hundredth of a cent.
- New checkbox *Tension modulation (pitch glide)* under *String*, on by default (parameter `kc`).

### Harpsichord 0.6.0
- **Sympathetic resonance:** while a key is held, its strings whose jacks have risen ring along
  with the strings that sound, whether their row plucks or not: on the lower manual with the 4′
  off, a held key's 4′ string still sounds an octave up. A key's two 8′ strings drive each other
  too, so a held note's fundamental decays a little faster (Weinreich's coupled unison).
- New slider *Sympathetic resonance* under *Strings and tuning*, 25 % by default (parameter
  `sympathy`).
- Fixed: once a bridge segment fell silent (the 4′'s, after its strings stopped), the soundboard's
  filters there decayed into subnormal numbers and the page's CPU climbed several times over.
- **Tension modulation (Kirchhoff–Carrier):** the pluck's 2–4 mm lift stretches the wire, so each
  note starts sharp and settles: c¹ about 5 ¢, c³ about 25 ¢ (short strings plucked near the nut
  stretch most), FF about 9 ¢ held through its long decay. Touch hardly changes it, as the
  plectrum lets go where it lets go. About 30 % more CPU while a string glides.
- New checkbox *Tension modulation (pitch glide)* under *Strings and tuning*, on by default
  (parameter `kc`).

### Vibraphone 0.6.0
- **The tube's fittings drain it:** the boundary layers on the motor's shaft and disc at the mouth
  (viscous) and on the bottom plug (thermal) add to the walls' loss, scaled from it per unit area:
  14 % more at F3 with the disc open, 91 % with it face-on, since the flow squeezing past a closing
  disc loses as 1/s². F3's tube goes from Q ≈ 95 to 88, and on the default gap's leaky side its bar
  rings a little longer (4.7 s against 4.1 s). The tremolo's pulse and pitch wobble move by under
  1 dB and 2 ¢.

### Celesta 0.1.0
- **The celesta (Mustel, Paris, 1886):** felt hammers strike plain steel bars, each resting on two
  blocks at its fundamental's nodes over a wooden box tuned to it. The bars are Timoshenko beams,
  solved exactly (shear and rotary inertia put the overtones a little below a thin bar's 2.76 and
  5.40), 2.5 mm thick at C4 and 2 mm at C8, cut to pitch (224 mm at C4, 50 mm at C8). Bar mode 1
  and the box's air trade energy through the gap between them; the felt hammer is a Hertz contact
  (F = Kδ^2.5), lighter and harder up the compass; a felt damper rests on every bar whose key is
  up, and the pedal lifts them all.
- The four-octave compass C4–C8 plays by default; *Full range* opens A0–C8. Mod wheel: the hammer
  felt. Knobs for the bar thickness, the steel's internal friction, the boxes (on or off, the gap,
  their tuning), the hammers (felt, mass, strike point, off the centre line, speed) and the dampers;
  ten presets, among them a keyboard glockenspiel.
- Its plugins (CLAP, VST3, AU, standalone, and in the Forte app), AU code `Cele`.

### Kalimba 0.1.0
- **A new instrument: the kalimba.** Every key is a spring-steel tine, clamped under a bar,
  resting on a bridge and free at the tip, over a wooden box with a sound hole. The tine is a
  clamped–supported–free beam (Chapman 2012): the part behind the bridge vibrates too, so its
  overtones sit 5.6 times the fundamental, not a cantilever's 6.27. The thumb pushes the tine
  down and lets go: where it pushes and how fast it lets go choose the modes. The box is the top's
  first mode and the air in the sound hole, coupled through the cavity (Christensen and Vistisen's
  two-oscillator model), with the top's higher modes above them. A finger over the hole (the mod
  wheel) makes the kalimba player's wah. Optional bottle caps on the top leave it when it
  accelerates down faster than gravity and rattle as they land, so loud notes buzz and soft ones
  don't.
- C4–E6, a 17-tine kalimba's span, with *Full range* opening A0–C8. Tines ring until they die
  away; untick *Let the tines ring* and releasing a key lays a finger on its tine. Presets include
  an mbira with bottle caps, a marimbula (bass box), and the tine clamped right at the bridge.
- Plugins (AU code `Kali`) and a place in the Forte app.

### Steel Pan 0.1.0
- **A new instrument after the Trinidad steelpan:** every key a note area of thin steel, its
  modes those of a plate, the lowest three hammered by the tuner to the fundamental, the octave and
  the twelfth (or double octave, or left untuned as sunk). Struck by a rubber-tipped stick whose
  contact shortens as a Hertz contact on harder strokes and higher notes.
- **The dome couples the note's modes** (a 1 : 2 : 3 internal resonance, after Monteil, Touzé,
  Thomas and Benacchio): a hard stroke pumps the octave and twelfth out of the fundamental, so the
  tone blooms and brightens; *Dome rise* sets it, and flat notes stay linear.
- **Neighbours ring along:** the steel between notes couples each note's tuned modes to its
  neighbours', which the fourths-and-fifths layout (Anthony Williams, 1953) puts on shared
  partials; a chromatic layout for comparison. The skirt decides how much of each partial
  radiates, from a tenor's 14 cm to a bass's whole drum.
- The steel band's A1–F♯6 by default, all 88 keys with *Full range*. Rolls on held notes from the
  mod wheel or aftertouch; a hand mutes a note on key-up unless *Let notes ring* or the sustain
  pedal. Views of the pan with every note glowing as it rings, the struck note's three tuned modes
  trading energy, the note area's mode shapes, the spectrum and spectrogram. Plugins (CLAP, VST3,
  AU, standalone) and a place in the Forte app.

### Electric Grand 0.7.0
- **Sympathetic resonance:** every key whose damper is up (the pedal down, the key held, the keys
  above E6) rings along through the bridge, heard by the piezo and the soundboard alike. On the
  iron frame it is faint, as on a real CP-70; on the soundboard it is about 14 times stronger.
  Coincident partials ring along about 90 times as strongly as others. With the pedal down it
  costs about twice what four sustained notes cost.
- New slider *Sympathetic resonance* under *Action*, 25 % by default (parameter `sympathy`).
- **Tension modulation (Kirchhoff–Carrier):** the CP-70's short, stiff strings stretch a lot under
  a hard blow: at full velocity E1 starts 45 ¢ sharp and is 6 ¢ sharp after 1.8 s, C4 18 ¢. It
  grows with the square of the blow, so at velocity 0.6 E2 starts 3 ¢ sharp. Only the steel core
  stretches; the winding adds mass. About 40 % more CPU while a note glides.
- New checkbox *Tension modulation (pitch glide)* under *Strings*, on by default (parameter `kc`).

### Gong Keyboard 0.7.0
- Every asymmetric mode now has its twin (sin mθ beside cos mθ), so a gong has 77 modes instead of 41. A small mass asymmetry splits each pair, and a strike off its heavy axis rings both: the gong beats, its nodal lines wander, and a crash trades energy between the twins.
- New *Asymmetry ε* (0.5 % by default; 0 is a perfectly round gong) and *Strike angle* (20° from the heavy axis by default) parameters, and a preset *Perfectly round: the twins in tune, no shimmer*.
- *Coupling terms* now counts the round gong's terms, each with its twins', and defaults to 300 instead of 600, so the page uses about the CPU it did before.
- The gong view draws the twins and the heavy axis; the mode table lists each twin (primed).

### Wind Harp 0.5.1
- **The spectrogram is the shared one**: the same colours as the other instruments, with the string's modes and the shedding frequency as ticks on both sides.

### RF Cavity Bells 0.1.0
- New instrument: a superconducting accelerator cavity for every key, A0–C8, rung by the bunch
  that crosses it. Nine coupled pillbox cells (TESLA's cavity) make a passband of nine modes,
  ω = ω_c/√(1 + k cos φ) (Nagle, Knapp & Knapp 1967), whose accelerating π mode is the note; the
  higher-order modes (TM011, TM110, TM111, TM012, TM020, TM120) stand at the pillbox's
  Bessel-zero ratios, a bell's inharmonic partials. The tests check the Bessel zeros, the coupled
  cells' eigenproblem solved as a matrix, the transit-time integral and the stored energy
  integrated over the cell.
- **The bunch:** velocity is its charge; its speed against the cells' design speed keeps it in
  step with the π mode or rings the rest of the passband, which beats; its length weighs the
  modes by the Gaussian form factor; off the axis (the mod wheel) it rings the dipole modes.
- **Losses:** the input coupler on the first cell, HOM couplers at both ends notched at the
  accelerating passband (trapped modes ring on), and the niobium's BCS surface resistance at the
  helium bath's temperature, fitted to TESLA's 15 nΩ at 2 K and 800 nΩ at 4.2 K; above 9.25 K
  the cavity is a normal metal and only clicks. Letting go pushes the coupler in; the pedal keeps
  it back.
- **Beam loading:** held keys send a bunch train (key pressure adds current) that builds the field
  up to where the losses take what the beam gives; Lorentz-force detuning pulls hard strikes
  flat through the walls' mechanical mode; past the quench field the cavity goes normal, the
  field collapses, and it recovers. Pitch bend is the tuner (±2 semitones).
- Views: the cells in section with their field, the bunch, the Lorentz squeeze and a quench; the
  passband's dispersion curve with every mode's level; spectrum, spectrogram and a table of the
  strongest modes. Nine demos. Plugins and WebAssembly from the start.

## 2026-10-18 — every key of an 88-key keyboard; All Plugins says every instrument is there; the page check plays the front page's demos; the tonewheel organ's B-3 levels, filters, waveform and swell; the Storage Ring's difference pickup at a fuller level; a choice of rooms; the apps' windows stay quiet at keys that play nothing; a spectrum and a spectrogram on every instrument; the Forte app on its own, and app icons

### Forte 0.34.0
- **Every instrument plays the 88 keys of a piano keyboard, A0–C8,** unless its physics stops
  short (five do, and each one's notes say why). The keys past what an instrument used to play
  are made by carrying its own design on, and the keys it played before sound as they did.
- **Full range:** an instrument with a historical compass (the harpsichord's five octaves, the
  Clavinet's sixty keys) plays it by default, and a Full range checkbox, on the page and as a
  plugin parameter, opens the rest. The page's keys, the computer keys, MIDI, the plugins and
  the plugin window all follow it.
- New instruments start from the template with all 88 keys.
- **All Plugins says every instrument is there:** the front page's overlay no longer says more instruments will follow; it says all of them come as plugins and standalone apps, with the Forte app that plays them all, instead of listing each by name.
- `tools/check-pages.mjs` checks the front page's Listen buttons: one for each instrument with a
  demo, and two in turn switch to ■ Stop and play their own demo (each served demo plays as a
  short WAV, since Playwright's Chromium decodes no AAC).
- **Venue:** the room reverb can be one of five spaces, on the pages and in the plugins alike:
  Studio, Room (the original, still the default), Recital hall, Concert hall and Cathedral. The
  four new ones are built from their physics: a shoebox of a given size, walls that absorb each
  octave as their materials do and the air's absorption give each octave its reverberation time
  (Eyring); image sources give the early reflections and a decaying noise in octave bands the
  tail, heard by two microphones 60 cm apart. Each carries the original room's energy, so the Room
  amount means the same amount of reverb in every space. Choosing a new venue lets the old room
  ring out.
- Plugins build a venue chosen while playing on a worker thread; the cathedral's 6 s tail costs
  about 4.5 % of a core at 48 kHz.
- Picking from a dropdown or ticking a box under Controls no longer sends a stray note-off (an
  error in the console), and gives the keys their focus back.
- **No beep at an unassigned key:** in the plugins' and standalone apps' windows, a computer key
  that plays no note (A, F, Enter, a digit…) is now silent; on a Mac it used to sound the system's
  error beep. Tab, the arrows up and down, Page Up/Down, Home and End still do what they did, a
  menu still picks by letter, and ⌘ shortcuts still reach the app's menus.
- **`SpectrogramView`** (`shared/views.js`): a scrolling spectrogram of the live output, coloured from the page's accent, at a set number of seconds across whatever the frame rate. It follows a `SpectrumView` (its analyser, range and markers, drawn as ticks), or takes its own, and can be linear over a narrow band.
- The template has both views, so a new instrument starts with them.
- **The Forte app on its own:** each system's box under All Plugins has a **Forte app** link,
  `Forte-app-<system>`, with just the one app that plays every instrument, and its Makefile
  (`make install-app`). It is in the release beside the other archives.
- **Icons for the standalone apps:** on macOS and Windows the Forte app has the site's icon and
  each instrument's app the same drawing in its instrument's colour (`native/icons/`, drawn by
  `tools/make-icons.py`). Linux's apps are plain executables and have none.

### Ribbon Piano 0.7.0
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram**, its ticks the struck string's partials coloured by family.

### Harpsichord 0.5.0
- **Full range (A0–C8)** opens the keys past FF–f³: the same scale of strings carried on, iron
  at the same stress up to 4.5 cm at C8, brass a little thicker per key below FF.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram**, its ticks the comb's notches of each row that plucks: move a plucking point and the dark gaps move with it.

### Pipe Organ 0.6.0
- **Full range (A0–C8)** opens the keys past the C–f³ manual, A₂ to c⁵: the same scales and
  voicing carried on, down to a Principal pipe 5.7 m long that is slow to speak, as big pipes
  are, and up to c⁵. The Mixture breaks back twice more (at F♯6 and C7), the pipes from 6 kHz up
  run 4× oversampled, and the tuning table reaches the new pipes.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Free-Reed Organ 0.6.0
- **Full range (A0–C8)** opens the keys past C2–C7: every rank's reeds designed and voiced the
  same way, the 16′ down to 13.75 Hz and the 4′ up to 8.4 kHz (which, from A7 up, needs more
  wind than the default to speak promptly).
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A live spectrum and a spectrogram**, marked with the last key on every rank that speaks.

### Vibraphone 0.5.0
- **Full range (A0–C8)** opens the keys past F3–F6: bars cut from the end bars' blanks and
  tuned to 1 : 4 : 10 like the rest, 94 cm long at A0 and 7.5 cm at C8, each over its own tube.
- Bar modes at or above 0.45 × the sample rate are left out: the top bars' fifth bending mode
  (from C♯6 at 48 kHz) used to fold back as an alias.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Carillon 0.4.0
- **Full range (F2–C8)** opens the keys past the four-octave C3–C7: the bass rib cast larger
  down to F2 (a 19 t bell, about the largest ever hung in a carillon) and the treble rib
  smaller up to C8. Lower still, a bell would outweigh any ever cast.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Electric Grand 0.6.0
- **All 88 keys, A0–C8,** as on the CP-80 (it was E1–E7). Above E7 the strings shorten as 1/f
  at the same stress and the hammer felt hardens, so C8 sounds as loud as E7.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Tonewheel Organ 0.8.0
- **All 88 keys, A0–C8,** each on its own tonewheels (it was the 61-key manual, C2–C7, with the
  page folding other keys in by octaves and the plugins dropping them). Below C1 the 8′ folds
  up an octave, as the generator has no lower wheels.
- **Key scaling:** every key's nine contacts feed their busbars through the B-3's resistance
  wires (six gauges, 10.5–103.5 Ω, from a measured B-3), so the upper drawbars are loud in the bass
  and taper off by 10–20 dB in the treble while the 8′ stays even. The 16′ folds back in the
  bottom octave, as on a B-3.
- **Wheel levels and filters:** each wheel's output follows measured B-3 and C-3 levels (about
  18 dB from the bottom wheel to the top), and wheels 44–91 pass through their reactor or tuned
  filter, which strips their harmonics and most of the crosstalk. *Filter capacitor drift*
  detunes the filters as aged capacitors do.
- **A computed waveform:** the tooth and pickup give each wheel its 2nd and 3rd harmonics
  (*Tooth relief*), strongest on the coarse bass wheels. It replaces *Wheel harmonics*.
- **The swell pedal keeps the bass:** shut, it lets through a low-passed share of the signal, as the
  AO-28's vane does, so the treble falls by up to 40 dB and the bass by about 25.
- *Levels* (B-3 or Flat) turns the levels, filters and wiring off, for an even keyboard.
- The parameter `wheelHarm` is gone, so songs saved with earlier organ plugins lose that one
  value. The tests' saved 0.6.0 state is removed and the 0.7.0 one saved again with today's
  parameters, since neither loads in full any more.
- The views' table shows each tone's level through its wire.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram**, its ticks the last key's nine tones in drawbar colours: watch the Leslie's horn and drum change speed.

### Tine Piano 0.8.0
- **All 88 keys, A0–C8,** as on the 88-key Rhodes (it was E1–E7): tines solved to pitch, 19 cm
  at A0 and 1.6 cm at C8.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram**, its ticks the coupled modes coloured as in the spectrum.

### Reed Piano 0.7.0
- **Full range (A0–C8)** opens the keys past the 200A's A1–C7: the same reeds, the solder
  graded on past them and each cut to pitch.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Tangent Clavier 0.6.0
- **Full range (A0–C8)** opens the keys past F1–E6: the scale carried on down to A0, and above
  E6 the length halving each octave on a wire one size lighter, so the tangent still lifts the
  string off the anvil at C8.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Sticky-Pad Piano 0.7.0
- **Full range (A0–C8)** opens the keys past the Pianet's C2–C7: the same reeds, each cut to
  length for its pitch, 93 mm at A0 and 7.8 mm at C8.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Viola Organista 0.7.0
- **A0–D7** (it was C2–C6). Below C2 the strings are 2 m long, wound on C2's core; above C6
  they halve in length each octave at C6's stress and run 8× oversampled. Above D7 a string
  bowed at the voiced touch no longer settles into Helmholtz motion, so the keyboard stops there.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Glass Armonica 0.7.0
- **Full range (A0–C8)** opens the keys past F3–A6: Franklin's scale of bowls carried on, a
  15-inch bowl at A0 and a 1.7-inch one at C8.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Pyrophone 0.7.0
- **All 88 keys, A0–C8** (it was C3–C6). A tube's modes at or above 0.45 × the sample rate are
  left out, and the flame's delay line is long enough for the bass.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Singing Arc 0.5.0
- **All 88 keys, A0–C8** (it was C3–C6). Each key's capacitor is found to 0.1 ¢ and corrected
  for the integrator's frequency warping, which also tunes the old keys by under 0.3 ¢.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Huygens Keyboard 0.7.0
- **All 88 keys, A0–C8** (it was C2–C7).
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A live spectrum and a spectrogram**, marked with each held note as it plays and as it was designed: watch the lines move to just ratios as a chord locks.

### Gong Keyboard 0.6.0
- **All 88 keys, A0–C8** (it was C2–C6): a 1.16 m, 53 kg gong at A0, and at the top less
  oversampling, so a tiny gong keeps seven modes.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A live spectrum**, marked with the last gong's modes (gold: the strike tone), brighter where the mallet excites them. The spectrogram now uses Forte's shared one, with those modes as ticks.

### Black-Hole Keyboard 0.7.0
- **All 88 keys, A0–C8** (it was C2–C7): holes from 621 solar masses at A0 to 4 at C8.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** with a short window, its ticks the last note's quasinormal modes (beside the strain's spectrum, which was already there).

### Quantum Keyboard 0.6.0
- **All 88 keys, A0–C8** (it was C2–C7).
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Bubble Organ 0.6.0
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

### Spring Keyboard 0.4.0
- **A0–C7** (it was C2–C6). Above C7 the spring's dispersion corner leaves the audio band and
  only a few nearly harmonic modes are left, so there is no chirp: the keyboard stops there.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A live spectrum**, marked with the note and F_C. The spectrogram now uses Forte's shared one, with those two as ticks.

### Star Keyboard 0.4.0
- **All 88 keys, A0–C8** (it was C2–C7). The H–R view's axes follow the coolest and faintest
  stars.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the focus star's band, linear in frequency and labelled in μHz, its modes as ticks coloured by degree: the comb breathes as convection kicks each mode.

### Wind Harp 0.5.0
- **A0–E7** (it was G3–C7), ropes in the bass. Above E7 no string sheds vortices at its note in
  the reference wind, so the keyboard stops there.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A live spectrum**, marked with the string's modes and the frequency its wake sheds at in the wind now.

### Storage Ring 0.2.0
- **All 88 keys, A0–C8** (it was C2–C7).
- **The Difference pickup is as loud as the others:** it was about 19 dB quieter. It is now read in units of the injected oscillation, as a position monitor's gain is set to its beam, so every note starts at the same height whatever the kick and the beam size, and its loudest notes stay under the limiter.
- **Venue:** a choice of room under Output, kept across presets: Studio, Room (as before), Recital
  hall, Concert hall or Cathedral.
- **A spectrogram** of the live output, its ticks the spectrum's markers, with a caption on what to watch for.

## 2026-10-18 — the Mac apps pick their MIDI inputs; pitch bend on nine more instruments; releases reach main through a pull request

### Forte 0.33.0
- **The Mac standalone apps pick their MIDI inputs:** Audio/MIDI Settings lists every MIDI input
  with a tick box where it said "Coming Soon". All are ticked at first, as before; an unticked one
  is disconnected, and stays so the next time the app opens, while an input plugged in later is
  connected. It is a change to clap-wrapper kept in `native/cmake/patches/` and applied when the
  build fetches it. Windows already had a picker; Linux's apps still connect every input.
- A pull request that brings a release from `live` back into `main` passes the release-note check:
  only what it adds beyond `live` is checked (`tools/release.mjs --check-pr`).

### Pipe Organ 0.5.0
- **Pitch bend:** the organ's air warms or cools, so sound and the jets cross every pipe
  faster or slower, ±2 semitones.

### Free-Reed Organ 0.5.0
- **Pitch bend:** the wheel stiffens or softens every tongue, ±2 semitones.

### Tine Piano 0.7.0
- **Pitch bend:** the wheel slides every fork's tuning spring, so a ringing note follows it,
  ±2 semitones.

### Reed Piano 0.6.0
- **Pitch bend:** the wheel stiffens or softens every reed, so a sounding note follows it,
  ±2 semitones.

### Sticky-Pad Piano 0.6.0
- **Pitch bend:** the wheel stiffens or softens every reed, ringing or resting under its pad,
  ±2 semitones.

### Viola Organista 0.6.0
- **Pitch bend:** the wheel slides the strings' bridges, shortening or lengthening every
  sounding string. A bowed note follows ±2 semitones and stays in Helmholtz motion, and the
  twist's resonance moves with it.

### Glass Armonica 0.6.0
- **Pitch bend:** every bowl's modes move together, ±2 semitones. No real armonica can bend;
  this one behaves as if its glass grew stiffer or softer.

### Bubble Organ 0.5.0
- **Pitch bend:** the pump pushes on the air above the water until the pressure at the nozzles
  is ×r². New bubbles sound ±2 semitones off (Minnaert), and bubbles already rising are squeezed
  or swell with it.

### Wind Harp 0.4.0
- **Pitch bend:** the wheel tightens or slackens every string, ±2 semitones, while the wind
  stays the same. A string bent out of its lock-in band moves to the harmonic the wake picks,
  as a real one would. At the reference wind, C4 bent fully up falls to its 2nd harmonic.

## 2026-10-18 — every page checked in a browser on every pull request; one Forte app with every instrument; ready for 1.0: saved songs kept, and Windows downloads that install themselves; a velocity curve, sostenuto and soft pedals, and pitch bend on three more instruments

### Forte 0.32.0
- **`tools/check-pages.mjs` opens every page in headless Chromium** at the phone, tablet and desktop sizes, with the menus, Controls and views open and audio started, and fails on console errors, sideways scrolling, or perform controls, ⓘ buttons, "Default settings" or keys gone missing; `--base main` lists every count that differs from main. CI's new `pages` job runs it on every push and pull request.
- **The Forte app:** one standalone app with every instrument, picked from an Instrument menu at
  the top of its window; it reopens on the last one played. It comes in the plugin downloads with
  every instrument (`Forte-plugins-<system>` and `Forte-plugins-app-<system>`), beside the
  instruments' own apps, which are unchanged. New instruments join it as they are ported.
- **Saved songs are watched:** each instrument's parameters and presets, as songs saved with its
  plugins rely on them, are listed in `native/instruments/<slug>/<slug>-contract.json`. A pull
  request that removes, renames or rescales a parameter, or moves, renames or changes a preset, is
  warned about now and will need a major version from 1.0 on (`tools/contract.mjs`). Release notes
  take a `major` kind, which takes 0.x to 1.0.0.
- Every release keeps the state its plugins save (`native/tests/states/`), and the plugin tests
  load every one into today's plugins with its values.
- **The Windows downloads install themselves:** double-click `install.cmd` to put the VST3s and
  CLAPs where every DAW looks (Windows asks once for administrator rights) and the apps in your
  own Programs folder with Start menu shortcuts, and to clear the download mark SmartScreen warns
  about. `install.cmd verify`, `uninstall`, `check` and `unblock` work as the Makefile's do on
  macOS and Linux, one format at a time too.
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

### Ribbon Piano 0.6.0
- Velocity curve and sostenuto on the page's MIDI.

### Tonewheel Organ 0.7.0
- **Pitch bend:** the wheel moves the generator's supply frequency, as a variac on a real organ
  would. The whole organ, the vibrato scanner and the tonewheels bend together, ±2 semitones,
  while the motor runs.
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

### Tine Piano 0.6.0
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

### Pyrophone 0.6.0
- **Pitch bend:** the wheel turns the burner's gas up or down. The hotter gas carries sound
  faster, so every tube's note follows, ±2 semitones.

### Singing Arc 0.4.0
- **Pitch bend:** the wheel slides the tank coil's iron core, so the arc's note follows, ±2
  semitones. In the talking mode it bends the voice.

### Huygens Keyboard 0.6.0
- Sostenuto on the page's MIDI.

### Black-Hole Keyboard 0.6.0
- Velocity curve, sostenuto and soft pedal on the page's MIDI.

## 2026-10-18 — a live branch, and versions bumped only when it is released; the controls above the keys are back; the JavaScript engines are retired; storage ring

### Forte 0.31.0
- **Releases:** the site is published from a `live` branch, and `main` is where pull requests
  land. A pull request bumps no version: it adds a note to `changes/` (`changes/README.md`), and
  releasing `main` to `live` (`node tools/release.mjs`) gathers the notes into the changelog and
  bumps each version once. The `tests` workflow checks both rules on every pull request.
- **CI:** pull requests into `main` build and validate the plugins on Linux only, without packaging
  them; macOS, Windows, auval and the release archives run on a pull request into `live`, on
  `live` itself, or when started by hand. The plugin release follows a green `native` run on
  `live` instead of `main`.
- An instrument's version reaches its plugins from `<slug>-info.cmake` when they are built, not
  through `<slug>-params.h`, so the WebAssembly no longer carries it and a version bump leaves the
  committed `.wasm` files alone. Every `.wasm` is rebuilt once for this; the sound and the
  parameters are unchanged.
- **The strip of controls above the keys is back on every instrument page:** since the pages wait
  for their WebAssembly model before building their controls, the layout placed them before they
  existed, leaving every control in the sidebar and "More controls" alone above the keys (and the
  presets without "Default settings"). The layout now places controls whenever the page adds them.
- **The C++ plays everywhere:** every page runs its instrument's C++ engine, built as
  WebAssembly, and its views draw the C++ model. The header's **C++ | JS** switch is gone, and
  so are `?engine=js`, the worklet's fallback to JavaScript and the views' JavaScript models.
  A page now waits for its WebAssembly model before it draws.
- `shared/shell.js` takes the descriptor's `wasm` and no longer `engine`, `worklet` or
  `engineParams`; the worklet runs only WebAssembly, and parameters go to it whole
  (`{ type: 'params', P }`).
- The tests, `tools/headless.mjs` and the render tools play the C++ (`tools/engine.mjs` has no
  `FORTE_ENGINE` any more), and check it against independent physics written in the tests.
  `tools/render-reference.mjs` saves the C++'s sound when a change to it is meant.
- The template has no JavaScript engine or model: `tools/new-instrument.mjs` starts an
  instrument whose physics is C++ only, and says to build its WebAssembly first.

### Ribbon Piano 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and each note still brings the strings its key's WebAssembly model built on the page.

### Harpsichord 0.4.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the plectrum and string views draw the C++ model.
- The WebAssembly's slow-motion pluck takes the tests' plectrum friction and bridge scale and reports the string's modes, and it exports the board's admittance and bridge points, so the ideal-pluck, 192 kHz energy, frictionless-release and σ_b = Re Y checks run on the C++.

### Pipe Organ 0.4.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the jet, spectrum and pipe readouts use the C++ model.
- The WebAssembly exports the linear analysis (`linearRoot`, `loopGain`, `speakingWindow`), `chestPan`, the wind system and `modeFreq`, so the tests run them on the C++. `tools/pipes-tuning.mjs` measures the build and has a `--check` mode.

### Free-Reed Organ 0.4.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The WebAssembly exports the reed's steady state and linear root, the cassotto and the slot's gap, so the tests run them on the C++. `tools/harmonium-tuning.mjs` measures the build, writes the recut table (which takes effect once the WebAssembly is rebuilt) and has a `--check` mode.

### Vibraphone 0.4.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the page sends each note its bar from the WebAssembly model. `bar.js` keeps only what designs the bars' table.

### Carillon 0.3.0
- **The JavaScript engine is gone:** the C++ engine and model always play and draw. The bell FEM stays in JavaScript, where it designs the ribs and the table.

### Electric Grand 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The WebAssembly exports the board's modes, `sinFT` and a widened modal band (defaults unchanged), so the Rayleigh-integral board test and the residual-path test run on the C++.

### Tonewheel Organ 0.6.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the generator map, the key analysis and the Leslie view come from the C++ model.

### Tine Piano 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the tone-bar and pickup views draw from its model.
- The tests check the tine's participation Γ₁²/mt = 0.6131 on the C++ (`tines_gamma`).

### Reed Piano 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views draw the C++'s reeds, pickup and hammer.
- The tests check the hammer's energy conservation and the reed's independence of width on the C++ (`reeds_lossless_strike`, `reeds_fem`).

### Tangent Clavier 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model. A new test measures the tone tabs in the output against the analogue networks.

### Sticky-Pad Piano 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The tests check the unit reed (point tip mass, 30-mode static compliance), the pickups' closed forms, the plate rail's high-pass and the T's end stop on the C++, through new test-only exports; the unit reed can hold every mode of its mesh.

### Viola Organista 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views use the C++ model.
- The string-alone tests and `tools/bowed-tuning.mjs` bow the C++ string, exported alone (`bowed_string_*`), and the board's tests (Weyl count, Wallace radiation, the strings' load) run on the C++; `bowed-tuning.mjs --check` measures the build.

### Glass Armonica 0.5.0
- **The JavaScript engine is gone:** the C++ engine and model always play and draw. The tests check the C++'s bowls against Rayleigh's integrals and a closed-form radiation efficiency.

### Pyrophone 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the page hands it each tube's tuning from the C++ model.
- `pyrophone_root` can Taylor-expand the delay as Magri & Juniper do, so the tests hold their published eigenvalues to 5×10⁻⁵ on the C++.

### Singing Arc 0.3.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views and the capacitor bank come from the C++ model.
- `arc_linear` returns all four roots and `arc_steady` takes its starting kick, so the tests check every root against the state matrix and the bistable cycle from a 0.8 I kick.

### Huygens Keyboard 0.5.0
- **The JavaScript engine is gone:** the C++ engine and model play the page and its lock map.

### Gong Keyboard 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays and builds its own coupling tables; the page no longer builds or sends them.

### Black-Hole Keyboard 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, building each key's voice from the QNM table as the note starts; the views use the same C++ model. The Leaver solver stays in JavaScript, to make the table and check the C++.

### Quantum Keyboard 0.5.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the wavefunctions come from the C++ model.

### Bubble Organ 0.4.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the tank, the latest-bubble readout and the damping plot come from the C++ model.
- The glide is one C++ function (`glideRing`) that the engine and a test-only export share, and a liquid and gas of the test's own bring back the exact √p₀, Minnaert and √γ limits.

### Spring Keyboard 0.3.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the views come from the C++ model.
- The WebAssembly solves the rod at any shape and wavenumber (`springs_rod`), so the tests check the closed ring against Hoppe and Michell and the rigid-body motion at k = cos α/R.

### Star Keyboard 0.3.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the page builds each star with the C++ model.

### Wind Harp 0.3.0
- **The JavaScript engine is gone:** the C++ engine always plays, and the lock-in map and table come from the C++ model.
- The WebAssembly exports the single-mode harmonic balance and its locked state, so the test that the locked state solves its equations runs on the C++.

### Storage Ring 0.1.0
- New instrument: a particle accelerator's storage ring for every key, C2–C7, heard through a
  beam pickup. The bunch passes the pickup once a turn, so the revolution frequency is the
  note, and its Gaussian length sets the harmonics' roll-off, exp(−(2πnσ)²/2).
- **Betatron oscillation:** injection kicks the bunch off orbit, and the pickup hears its
  oscillation as sidebands at (n ± Q)·f_rev. It decoheres through the chromaticity and recoheres
  every synchrotron period, exp(−2(Q′σδ/Qs)² sin²(πQsN)), and through the octupoles' amplitude
  detuning, which never comes back (Meller, Chao, Peterson, Peggs & Furman 1987); the tests
  check both formulas against particles tracked turn by turn.
- **RF:** an injection phase error is a vibrato at the synchrotron frequency; key pressure
  raises the RF voltage (fs ∝ √V, the bunch shortens as V^(−¼)); radiation damps it all.
- Two buttons on the two channels, one button, or their difference; the mod wheel turns up the
  chromaticity; the pedal keeps released beams stored. Views: the bunch in phase space and the
  pickup's reading turn by turn. Plugins and WebAssembly from the start.

## 2026-10-18 — MIDI that turns itself on says so

### Forte 0.30.1
- **MIDI turned on again by itself shows its status.** A page turns MIDI on with no click when
  the site had it on before and the browser still grants it, and hides "Enable MIDI"; the status
  pill stayed hidden too, since it waited for a click on the button, so the button flashed and
  vanished with nothing in its place. The pill now shows as soon as MIDI reports anything
  ("MIDI: <device>", "MIDI: no devices", "MIDI: permission denied"), however it was turned on.
- **A MIDI key before the first click asks for one.** A key on a MIDI keyboard is not a user
  gesture, so until the page has had a click or a key press the browser won't let it start the
  sound. Such notes are now dropped with a toast saying to click the page once, instead of
  starting the audio in a state that only a reload could undo.

## 2026-10-18 — the black hole's spin reads as itself in the plugins

### Forte 0.30.0
- A plugin parameter's text can be scale·10^(−v) + offset, and an exponent can be written with
  superscripts, ×10⁻⁴, as the pages write it (`forte::FormatSegment`'s `pow10neg` and
  `superscript`, which default to off, so other generated tables are unchanged). Such a text reads
  back as the value it shows. `tools/gen-native-params.mjs` finds them by sampling `fmt`, reading
  a superscript exponent as an exponent only where that matches every text the old reading did,
  and more.
- Every instrument's committed WebAssembly is rebuilt, because the shared text code changed;
  the sound and the parameters are unchanged.

### Black-Hole Keyboard 0.4.1
- **The plugins show the spin as the page does:** a = 0.690, a = 0.9900, and from a = 0.99 up
  a = 1 − 1.0×10⁻⁴, instead of the slider's raw position (0.509), and a typed spin reads back.

### Vibraphone 0.3.1
- **The plugins show the internal friction as the page does** (2.2×10⁻⁵, not 2.15e-5), except
  at the very top of each decade, where the page writes 10.0×10⁻⁵ and the plugins 1.0×10⁻⁴.

## 2026-10-18 — download one plugin format at a time

### Forte 0.29.0
- **One format at a time**: in each instrument's Plugin dialog and the front page's All
  Plugins, each system's box reads `All | AU · VST3 · CLAP · app`: All downloads every format,
  and each format's link just that one (`Forte-<id>-<format>-<system>`, e.g. `Forte-gongs-au-macos.zip`,
  and `Forte-plugins-<format>-<system>` for every instrument). Each holds INSTALL.md and, on
  macOS and Linux, the Makefile, which works on whatever formats are in its folder.
- `tools/package-plugins.sh` packs them, the release checks they are all there, and the
  `native` workflow checks that a one-format archive holds only that format.

## 2026-10-17 — the tonewheel organ in C++ (step 4, last batch)

### Tonewheel Organ 0.5.0
- **Ported to C++** (`native/instruments/organ`): the tone generator and the engine (the motor,
  91 wheels, the key contacts with their seeded bounce, the busbars, percussion, the scanner's LC
  line, the tube drive and the Leslie), operation for operation, with V8's fdlibm.
  - **Plugins:** Tonewheel Organ as CLAP, VST3, AU v2 and a standalone app. The console is
    parameters of its own: nine drawbars, percussion on, soft, fast and third, vibrato and chorus,
    the Leslie bypassed, slow, fast or stopped, and the motor; the nine presets set all of it. The
    mod wheel puts the Leslie on fast, each press of a sustain pedal or the window's Space bar
    flips it, and CC11 is the expression pedal. The generator's tables are rebuilt in place
    without allocating. Ten keys with every drawbar, chorus, drive and the Leslie take 2.5 % of a
    core.
  - **WebAssembly:** 61 KB in `organ/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**, falling back to the JavaScript (`?engine=js` forces it); the header has
    the C++ | JS switch, and the analysis table, generator map and Leslie view call its model.

### Forte 0.28.0
- A descriptor's `console` (state the page keeps beside its parameter groups) becomes plugin
  parameters, set by the presets and passed to a WebAssembly engine (`tools/gen-native-params.mjs`,
  `shared/wasm.js`, `tools/headless.mjs`).
- `controllers` can switch a choice between two values, by level (`values`) or flipped by each
  press (`toggle`); the plugin window's Space bar plays a CC64 toggle, and CC1 reaches
  `controllers` when an instrument has no mod-wheel parameter.
- `forte/fdlibm.h`: V8's `tanh`, `expm1` and `Math.hypot`.
- Every instrument's committed WebAssembly is rebuilt, because the shared controller table grew;
  the sound and the parameters are unchanged.

## 2026-10-17 — clear the quarantine where the plugins are

### Forte 0.27.0
- **`make unquarantine`** in the downloads' Makefile clears macOS's download quarantine on the
  plugins in the unpacked folder, where they are, so the standalone opens from there without
  being moved or installed. `make unquarantine-app` (or `-au`, `-vst3`, `-clap`) does one
  format, and naming a folder clears the copies there instead, e.g.
  `make unquarantine-app APP_DIR=/Applications`. On Linux there is nothing to clear and it says
  so. `make check` and `make verify` now point at it when they find a quarantined plugin.
- The `native` workflow quarantines the standalones, unpacked and installed, and checks that
  `make unquarantine-app` clears them; the site test covers the Linux path.

## 2026-10-17 — one plugin format at a time, and the standalone checked where it is

### Forte 0.25.0
- **One format at a time** in the downloads' Makefile: `make install-au`, `install-vst3`,
  `install-clap` and `install-app` (the standalone), and the same for `verify-` and
  `uninstall-`.
- **`make check`** checks the plugins in the unpacked folder without installing anything: the
  signature and the download quarantine on a Mac, the libraries they need on Linux, and
  clap-validator for the CLAPs when it is installed. `make check-app` checks just the
  standalone, which runs from the folder.
- The `native` workflow also runs `make check`, a format alone, and `make check-app` on a
  quarantined copy of the standalones (which it must refuse) on macOS and Linux; the site test
  covers them on a stand-in download. `install.sh` keeps to macOS's bash 3.2.

## 2026-10-17 — the table-driven instruments in C++ (step 4, fifth batch)

### Black-Hole Keyboard 0.4.0
- **Ported to C++** (`native/instruments/blackhole`): the quasinormal-mode bank with its cubic
  Hermite interpolation, the spherical harmonics, the merger's excitation, each key's voice, the
  inspiral's chirp and the strain curve, and the ringdown engine, operation for operation, with V8's
  fdlibm, `Math.log10` and `Math.hypot`. Leaver's table is converted number for number to
  `qnm-table.h` (`node tools/blackhole-native-table.mjs`, also written by `tools/qnm-table.mjs`),
  and a test keeps it fresh.
  - **Plugins:** Black-Hole Keyboard as CLAP, VST3, AU v2 and a standalone app: velocity^1.5 as on
    the page, the spin on the mod wheel, the ten presets. A key's voice is built from the table in
    microseconds as the note starts. Ten voices take about 1.5 % of a core.
  - **WebAssembly:** 159 KB in `blackhole/wasm/` (mostly the table). The test suite passes on it,
    and it plays what the JavaScript plays bit for bit, inspirals included.
  - **The page runs it**: the QNM plane, the strain plot and the mode table call the WebAssembly
    model and each note plays the voice they show, falling back to the JavaScript; the header has
    the C++ | JS switch.
- **Cheaper:** a mode that has died away goes to zero instead of decaying into denormals beside
  a long fundamental, which made the JavaScript engine four times costlier on near-extremal
  rings. The sound is unchanged.

### Quantum Keyboard 0.4.0
- **Ported to C++** (`native/instruments/quantum`): the five wells' spectra and matrix elements,
  the tempo lock, each key's wavepacket, the exact phasor sum with T₁, dephasing, the pump's ramp,
  voice stealing and the 3000-pair budget, and the views' eigenfunctions, operation for operation,
  with V8's fdlibm.
  - **Plugins:** Quantum Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 the damper, the
    mod wheel the dephasing rate, the nine presets. Each key's packet is built on a worker thread
    for the knobs as they are. Ten voices take about 4 % of a core (12 % with hydrogen at σ = 4 on
    the antenna).
  - **WebAssembly:** 76 KB in `quantum/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**, and computes its packets and eigenfunctions with the WebAssembly model,
    falling back to the JavaScript.

### Star Keyboard 0.2.0
- **Ported to C++** (`native/instruments/stars`): the model (the scaling relations, the track, the
  asymptotic and mixed modes, the tuning of every key, the δ Scuti stars) and the engine (the
  stochastically driven modes, the flare, the Landau growth), operation for operation, with V8's
  fdlibm and the JavaScript's seeded generators, its warm-up included.
  - **Plugins:** Star Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 the sustain pedal,
    the mod wheel spins the stars up, aftertouch drives the convection harder, the eleven presets.
    Each key's star is built on a worker thread when the kind, mass or speed-up changes. Ten stars
    take about 12 % of a core.
  - **WebAssembly:** 86 KB in `stars/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, its random convection and flares included.
  - **The page runs it**: it builds each key's star with the WebAssembly model and sends it with
    the note, and its views use that model, falling back to the JavaScript.

### Spring Keyboard 0.2.0
- **Ported to C++** (`native/instruments/springs`): the helical springs' rods (the same Jacobi
  rotations, and the same solver cache, so neighbouring keys share a solver as in the JavaScript),
  the tuning by ear, the dispersion and the engine, operation for operation, with V8's fdlibm.
  - **Plugins:** Spring Keyboard as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    damper pedal, the mod wheel the hand on the springs, the eleven presets. Each key's springs
    (about 3 ms) are built on a worker thread as soon as the geometry settles. Ten keys take about
    8–10 % of a core.
  - **WebAssembly:** 88 KB in `springs/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**: it builds each key's springs with the WebAssembly model and sends them
    with the note, and the echo and dispersion views draw from the WebAssembly, falling back to the
    JavaScript.

### Forte 0.24.0
- **The plugins' tone low-pass** passes everything at or above Nyquist, as Web Audio's does,
  instead of going unstable (clap-validator's 8 kHz run gave NaN with the black hole's 14 kHz
  tone). Below Nyquist it computes what it did; no WebAssembly changed.
- **`forte/fdlibm.h`** gains V8's `tan`, `log1p`, `log2` and `log10` (the star keyboard's tuning).
- **Tools:** `tools/blackhole-native-table.mjs` (new) writes the QNM table's C++ copy.
- **`plugin.ready`** for the four, so they are on the front page's Plugins section and in the next
  release; the template's generated files and WebAssembly carry Forte 0.24.0.

## 2026-10-17 — the self-oscillators in C++ (step 4, fourth batch)

### Huygens Keyboard 0.4.0
- **Ported to C++** (`native/instruments/huygens`): the tuning and the theory of synchronisation
  (δ, the lock ratio), and the neon engine (the analytic firing times, the kick cascade, polyBLEP,
  the keyer, the coupling capacitor, rail sag, drift and the pitch-hold servo), operation for
  operation, with V8's fdlibm and its `Math.log2`.
  - **Plugins:** Huygens Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel the pulse coupling, the ten presets. The engine retunes held keys itself when the
    tuning changes. Ten coupled keys take about 2 % of a core.
  - **WebAssembly:** 35 KB in `huygens/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit.
  - **The page runs it**: its notes' tunings and the lock map (its worker included) come from the
    WebAssembly model, falling back to the JavaScript, and the header has the C++ | JS switch.
- **Repeatable:** each key's starting phase and the lamps' drift come from a seeded generator, not
  `Math.random()`, so renders and tests repeat exactly.

### Singing Arc 0.2.0
- **Ported to C++** (`native/instruments/arc`): Ayrton's curve and the Mayr column with its
  hot-carbon floor, the circuit's linear analysis, the steady note and each key's capacitor, the
  engine (Duddell's circuit at four times the sample rate, the contacts, the seeded flicker and
  hiss, the thermophone) and Simon's talking arc, operation for operation, with V8's fdlibm.
  - **Plugins:** Singing Arc as CLAP, VST3, AU v2 and a standalone app: CC64 latches the keys, the
    mod wheel raises the arc current, the eleven presets. Each key's capacitor is cut on a worker
    thread when a knob it depends on settles; until then a key plays its last one. Six singing
    lamps (the most there are) take about 20 % of a core.
  - **WebAssembly:** 73 KB in `arc/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit and cuts the same capacitors to the last bit.
  - **The page runs it**: it sends the capacitor bank it has cut with each note, so the audio
    thread never cuts one, and its views use the WebAssembly model, falling back to the JavaScript.

### Pyrophone 0.4.0
- **Ported to C++** (`native/instruments/pyrophone`): the Rijke tube (modes, losses, King's law,
  linear stability, Hopf points, harmonic balance, the branches and the tuning table) and the
  engine with its seeded turbulence, operation for operation, with V8's fdlibm and `Math.hypot`.
  - **Plugins:** Pyrophone as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 holds the
    keys, the mod wheel the flame's power, aftertouch parts the flames, the eight presets. The
    tuning table (harmonic balance) is built on a worker thread; while a tube knob moves, the tubes
    are cut from the last one. Ten tubes take 2–3 % of a core.
  - **WebAssembly:** 78 KB in `pyrophone/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, turbulence included.
  - **The page runs it**: it builds the tuning table with its WebAssembly model and sends it to the
    worklet, and the bifurcation diagram and orbits come from the same model, falling back to the
    JavaScript.

### Wind Harp 0.2.0
- **Ported to C++** (`native/instruments/windharp`): the model (the Strouhal–Reynolds fit and the
  onset, the strings and their courses, de Langre's linear analysis, the harmonic balance and the
  locked range) and the engine (the van der Pol wake stations, the strings' modes, the low strings
  at a half or a quarter of the rate, the seeded gusts and turbulence, the soundbox, the
  shutters), operation for operation, with V8's fdlibm.
  - **Plugins:** Wind Harp as CLAP, VST3, AU v2 and a standalone app: velocity sets the shutter's
    speed and release velocity how fast it shuts, CC64 keeps the shutters open, the mod wheel blows
    the wind up to 8 m/s, aftertouch (channel or per key) blows harder, the tuning as a dropdown,
    the seven presets. Ten keys (15 strings) take about 10 % of a core.
  - **WebAssembly:** 72 KB in `windharp/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays bit for bit, gusts included: blocks longer than 128 samples are played whole,
    as the JavaScript plays them, since the wind changes once a block.
  - **The page runs it**, and its lock-in map and string table come from the WebAssembly model,
    falling back to the JavaScript.

### Ribbon Piano 0.4.1
- Its "real-time budget" timing test is skipped on CI like every other suite's timing tests: the
  hyphen had kept it out of the skip, so it failed on loaded machines.

### Tonewheel Organ 0.4.4
- Its "real-time budget" timing test is skipped on CI, as the Ribbon Piano's is.

### Forte 0.23.0
- **No fused multiply-adds in the plugins** (`-ffp-contract=off` on `forte_core` and every
  instrument): on Apple silicon clang fused them, so the macOS plugins differed from the
  JavaScript in the last bit (the wind harp's native test caught it). The WebAssembly is unchanged.
- **Native parameters:** a default that sits off its parameter's step (the pyrophone's flame at ⅓
  on a 0.001 step) reads back as itself, so a saved state reloads exactly (clap-validator's state
  reproducibility test).
- **`plugin.ready`** for the four, so they are on the front page's Plugins section and in the next
  release, each with the plugin window (controls and keyboard) in its page's colour; the
  template's generated files and WebAssembly carry Forte 0.23.0.
## 2026-10-17 — make install and make verify in the plugin downloads

### Forte 0.22.0
- **A Makefile in each macOS and Linux download**, one instrument's or all of them:
  `make install` copies the plugins to the plugin folders (the standalones to `~/Applications`
  or `~/.local/bin`) and, on a Mac, clears the download quarantine and makes Logic, MainStage
  and GarageBand look again; `make verify` checks each one is installed, unquarantined and
  correctly signed, and loads (auval for the Audio Units, missing libraries on Linux,
  clap-validator for the CLAPs when it is installed); `make uninstall` removes them. The work
  is in `install.sh` next to it (`native/install.sh`, `native/install.mk`), so macOS's old make
  3.81 runs it, and it works without make. Nothing needs sudo.
- The `native` workflow runs `make install`, `make verify` and `make uninstall` on the
  all-instruments archive on macOS and Linux before keeping it, and a site test runs
  `install.sh` on a stand-in download. Windows has no make, so its archives keep INSTALL.md's
  steps.

## 2026-10-17 — 6 ms less between a key and its sound

### Forte 0.21.1
- **The pages' limiter no longer delays the sound:** Web Audio's DynamicsCompressorNode looks
  6 ms ahead, so every note on every page came out 6 ms late, whatever played it (computer
  keys, on-screen keys or MIDI). The pages now limit with `shared/limiter.js`, the plugins'
  limiter (`native/core/src/limiter.cpp`) in JavaScript, run as the `forte-limiter` processor
  in `shared/worklet.js`: the same curve and makeup gain, so levels below the threshold are
  unchanged, and no look-ahead, so a loud chord's first 2 ms may overshoot the threshold as in
  the plugins. A browser that can't make the processor falls back to the old node.
- **Output latency on the Audio on button:** its tooltip gives the browser's audio buffer plus
  the audio device's latency, as the browser reports them, to tell a slow setup (Bluetooth
  headphones, a large system buffer) from the page.
- **A Bluetooth warning:** when the browser reports 80 ms or more between the page and the
  speakers (Bluetooth headphones and speakers add 100–200 ms), a page says so once per visit
  and suggests wired ones. The front page's About Forte and the README's Playing section say
  the same.

### Huygens Keyboard 0.3.4
- Its worklet test picks the instrument's processor by name now that `shared/worklet.js`
  registers two.


## 2026-10-17 — a window for the plugins: controls and a keyboard

### Forte 0.21.0
- **The plugins have a window**: every format (CLAP, VST3, AU and the standalone app) shows the
  instrument's controls in their groups, the presets, the controls a player reaches for above
  the keys, and a keyboard to play with the mouse, a finger or the computer's keys (Z…/ and
  Q…], ◀ ▶ or ← → for the octave, Space for the pedal), as on the instrument's page and in its
  colour. Keys played by MIDI light up, and the host's automation moves the sliders. The
  standalone apps no longer need a MIDI keyboard. Moving a slider records automation in a DAW
  (gesture begin and end); double-clicking one sets its default.
- It is a web view (choc, ISC): WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux
  (the Linux plugins now need WebKitGTK 4.1, `native/INSTALL.md`). The page is
  `native/plugin/editor.html`, built into each plugin; `tests/plugin-tests.cpp` drives its calls.
- `<slug>-info.cmake` carries the page's colour (`FORTE_ACCENT`) for the window.
## 2026-10-17 — the front page's overlays, and each plugin in its own dialog

### Forte 0.20.0
- **Plugin and How it works are separate**: an instrument's ↓ Plugin button (and `…/#plugin`)
  opens a dialog of its own with the downloads, and How it works holds just the notes. On
  phones, where the ↓ Plugin button doesn't fit, a line at the top of How it works opens it.
- **The front page offers every instrument's plugins together only**: the per-instrument rows
  are gone (each instrument's download is on its page), and the downloads move from the bottom
  of the page into an **All Plugins** overlay (also at `#plugins`).
- **Credits is an overlay** on the front page too (also at `#credits`), rendering
  `docs/PRIOR_ART.md` as `credits/` does; `credits/` stays for links from elsewhere.
- **About Forte shows the app's icon**, and the cards' **Play** buttons light up, lift and nudge
  their arrow forward under the pointer.

## 2026-10-17 — the reeds and pickups in C++ (step 4, third batch)

### Tine Piano 0.4.0
- **Ported to C++** (`native/instruments/tines`): the finite-element tine with its tuning spring,
  the coupled tine, tone bar and block, the hammer tips and pickups, and the engine (the implicit
  hysteretic hammer, the nonlinear pickup, the harp's resonance, the stereo vibrato, the amp's
  drive, the half-band decimation, the speaker), operation for operation.
  - **Plugins:** Tine Piano as CLAP, VST3, AU v2 and a standalone app: velocity as the hammer's
    speed (0.25–5 m/s), CC64 the damper pedal, the ten presets, the room in the output chain. Each
    key's modes are built on a worker thread. Ten notes take about 13 % of a core.
  - **WebAssembly:** 118 KB in `tines/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to within 4 × 10⁻⁶ of the peak: the tine's eigenproblem is badly
    conditioned, so Eigen and `linalg.js` round it differently.
  - **The page runs it**: it builds each key's modes with its WebAssembly model and sends them with
    the note, and the info panel, mode table, spectrum and slow motion call that model, all falling
    back to the JavaScript.

### Reed Piano 0.4.0
- **Ported to C++** (`native/instruments/reeds`): the reed's finite elements, tuning, losses and
  felt hammers, the slot's C(y) (`slot-table.h`, converted from `slot-table.js` by
  `node tools/reeds-native-table.mjs`), and the engine with its implicit felt contact, frame stop,
  gliding slot, comb node, photocell tremolo, preamp, decimator and speakers.
  - **Plugins:** Reed Piano as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the damper
    pedal, the nine presets. Every reed is built on a worker thread when Solder mass, Strike point
    or Hammer felt hardness settles. Ten voices take about 5 % of a core.
  - **WebAssembly:** 138 KB in `reeds/wasm/`. The test suite passes on it; on the same reed it
    plays what the JavaScript plays to float32 rounding (5 × 10⁻⁸ of the peak), with its own reeds
    to 5 × 10⁻⁶ (the eigensolver).
  - **The page runs it**: it builds each key's reed with the WebAssembly model and sends it with the
    note, and its views call that model, falling back to the JavaScript.

### Sticky-Pad Piano 0.4.0
- **Ported to C++** (`native/instruments/pianet`): the reeds, the pad's bond and its peel, and the
  pickups, with V8's fdlibm for their sines and exponentials.
  - **Plugins:** Sticky-Pad Piano as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    sustain pedal, the ten presets, the pickup and amplifier as dropdowns. Each key's reed is built
    on a worker thread for the tip mass and loss. Ten voices take about 1 % of a core.
  - **WebAssembly:** 116 KB in `pianet/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to float32 rounding (within 6 × 10⁻⁸ of the peak).
  - **The page runs it**; its slow motion, mode table and release plot use the WebAssembly model,
    falling back to the JavaScript.
- **Fixed:** Panic, voice stealing past 40 voices and re-pressing a key after a new tip mass or
  loss made the engine throw (a retired voice's fade was read out of scope), and a retired voice
  that had gone to sleep never faded out.
- **Cheaper:** the free pad face no longer decays into denormals, which made every voice ten times
  as costly on the page.

### Free-Reed Organ 0.3.0
- **Ported to C++** (`native/instruments/harmonium`): the tip-weighted tongue, the slot's area, the
  voicer's design and the threshold analysis, the implicit reed step with 2× oversampling, the wind
  and the cassotto. `tuning-table.h` is the C++ copy of the tuning table
  (`node tools/harmonium-tuning.mjs --native`), and a test keeps it fresh.
  - **Plugins:** Free-Reed Organ as CLAP, VST3, AU v2 and a standalone app: velocity opens the
    pallet, CC64 holds the keys, the mod wheel raises the bellows' pressure (to 2500 Pa),
    aftertouch blows harder, the fifteen presets. Each key's reeds are designed on a worker thread
    when the voicing knobs change. Ten keys take about 7 % of a core, 20 % with the three-reed
    musette.
  - **WebAssembly:** 69 KB in `harmonium/wasm/`. The test suite passes on it, and it plays what
    the JavaScript plays to within 1.2 × 10⁻⁸ of the peak.
  - **The page runs it**, and its views use the WebAssembly model, falling back to the JavaScript.

### Pipe Organ 0.3.0
- **Ported to C++** (`native/instruments/pipes`): the pipes' scale, end corrections and losses, the
  voicing and the jet's linear analysis, and the engine (the jet's delay and low-pass, the
  labium, the pipes' modes, 2× oversampling, pallets, sliders, the wind and the tremulant, the
  same seeded turbulence). `tuning-table.h` is the C++ copy of the tuning table
  (`node tools/pipes-tuning.mjs --native`), and a test keeps it fresh.
  - **Plugins:** Pipe Organ as CLAP, VST3, AU v2 and a standalone app: velocity sets the pallet's
    speed (the chiff), CC64 holds the keys, the mod wheel raises the wind (to 3000 Pa), the
    seventeen presets. The worker voices every key ahead; the 40 voices and their delay lines are
    set aside in advance (about 7 MB an instance). Ten keys of three stops take about 15 % of a
    core.
  - **WebAssembly:** 71 KB in `pipes/wasm/`. The test suite passes on it, and it plays what the
    JavaScript plays to within 2 × 10⁻⁸ of the peak (most reference scripts bit for bit).
  - **The page runs it**: it voices each key's pipes with its WebAssembly model and sends them with
    the note, and its views call that model, falling back to the JavaScript.

### Viola Organista 0.4.1
- `bowed.wasm` rebuilt now that V8's fdlibm lives in `native/core`: it plays the same, sample for
  sample.

### Forte 0.19.0
- **V8's fdlibm moves to `native/core`** (`forte/fdlibm.h`), now that the Viola Organista and the
  Sticky-Pad Piano both use it.
- **Notes wait for the engine:** when a page has a C++ build, starting audio waits (up to a
  second) for the worklet to say which engine it runs, so the first note's page-built data is
  never sent to an engine that cannot read it.
- **Native tests as WebAssembly see `CI`** (`native/tests/node-env.js`), so they skip the CPU
  timing tests on GitHub as the Linux ones do.
- **Tools** write the new ports' C++ tables: `tools/reeds-native-table.mjs` (new),
  `tools/harmonium-tuning.mjs --native` and `tools/pipes-tuning.mjs --native`.
- **`plugin.ready`** for the five, so they are on the front page's Plugins section and in the
  next release; the template's generated files and WebAssembly carry Forte 0.19.0.

## 2026-10-17 — the presets above the keys

### Forte 0.18.0
- **The presets move above the keys:** into the keyboard bar, beside the range overview, on a
  tablet or a computer, and on a phone (where that bar is full) the first control in the strip
  above the keys. No more opening More controls to change preset. "Default settings" works as
  before, and no page's layout grows (phones scroll that strip as before).

## 2026-10-17 — each instrument's plugins on its page, released by themselves

### Forte 0.17.0
- **Each instrument's plugins alone**: a release now holds `Forte-<slug>-macos.zip`,
  `-windows.zip` and `-linux.tar.gz` for each instrument with plugins, next to every instrument
  together (`Forte-plugins-…`). `tools/package-plugins.sh` makes them all in the `native`
  workflow; `shared/plugins.js` names them for the pages.
- **On each instrument's page**: a ↓ Plugin button next to How it works opens the notes at the
  instrument's downloads (also at `…/#plugin`), and the front page's Plugins section lists each
  instrument with its macOS, Windows and Linux downloads under the downloads of all of them.
  The cards' *Plugin* links go to the instrument's downloads.
- **Releases publish themselves**: `release-plugins` runs after every green `native` run on
  main, and releases when an instrument's version or anything under `native/` changed since the
  latest release (its `manifest.txt`), so a newly ported instrument is downloadable once it is
  merged. The batch 1 instruments were missing from the downloads because a release had to be
  started by hand. Tags are `plugins-v<Forte version>`, then `-2`, `-3`… within one version.

## 2026-10-17 — the strings in C++ (step 4, second batch)

### Ribbon Piano 0.4.0
- **Ported to C++** (`native/instruments/piano`): the string model (closed form, and Rayleigh–Ritz
  for tapered members, on Eigen) and the modal engine with its felt hammers, shared bridge,
  dampers and una corda, operation for operation.
  - **Plugins:** Ribbon Piano as CLAP, VST3, AU v2 and a standalone app: velocity as the hammer's
    speed, CC64 the damper pedal, CC67 una corda, the thirteen presets, the soundboard and room in
    the output chain. Each key's modes are built on a worker thread. Ten notes take about 4 % of a
    core.
  - **WebAssembly:** 134 KB in `piano/wasm/`. The test suite and the reference pass on it, and it
    plays what the JavaScript plays to within 2 × 10⁻⁹ of the peak.
  - **The page runs it**: it builds each key's modes with its own WebAssembly model and sends them
    with the note, and the info panel, cross-section, partials and slow motion use that model, all
    falling back to the JavaScript (`?engine=js` forces it).

### Harpsichord 0.3.0
- **Ported to C++** (`native/instruments/harpsichord`): the strings (modal partials with implicit
  contacts for the plectra, the damper felt and the buff), the plectra (the cantilever, friction,
  the slip off the tip) and the soundboard, operation for operation.
  - **Plugins:** Harpsichord as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys down
    as Space does, a note-off's release velocity sets how fast the jacks fall, the thirteen
    presets. Each key's strings are built on a worker thread when a physics knob changes. Ten keys
    of 8′ 8′ 4′ take about 5 % of a core.
  - **WebAssembly:** 92 KB in `harpsichord/wasm/`. The 21-test suite passes on it, and it plays
    what the JavaScript plays to within 10⁻⁸ of the peak (most presets bit for bit).
  - **The page runs it**, and its views (the slow-motion pluck, the scale, the comb) call the
    WebAssembly model, falling back to the JavaScript.

### Electric Grand 0.4.0
- **Ported to C++** (`native/instruments/grand`): the stretch tuning, the soundboard's modes and
  residual path, each key's partials, the implicit bridge and the felt hammer, the piezo's RC and
  the preamp's EQ, operation for operation.
  - **Plugins:** Electric Grand as CLAP, VST3, AU v2 and a standalone app: velocity, CC64 the
    damper pedal, the ten presets, the scale, stringing and mount as dropdowns. Keys and the
    soundboard are built on a worker thread. Ten voices take about 5 % of a core.
  - **WebAssembly:** 103 KB in `grand/wasm/`. The 31-test suite passes on it, and it plays what the
    JavaScript plays to within 4 × 10⁻⁹ of the peak.
  - **The page runs it**; the slow motion and the mode table re-run the strike with the
    WebAssembly engine and model, falling back to the JavaScript.

### Tangent Clavier 0.4.0
- **Ported to C++** (`native/instruments/clavier`): the model (the scale and the wound strings'
  cores, the rubber tip and its wrap, the speaking and yarn modes, the pickups and the tone tabs,
  the released string's modes) and the engine (the tangent, the anvil and the felt solved together
  every sample, the tension following the stretch and the wrap, the amplifier).
  - **Plugins:** Tangent Clavier as CLAP, VST3, AU v2 and a standalone app: velocity as the
    tangent's speed, CC64 the mute bar, aftertouch and the pitch wheel pressing held keys harder,
    the nine presets. Ten bass voices take about 14 % of a core.
  - **WebAssembly:** 106 KB in `clavier/wasm/`. The 23-test suite passes on it, and it plays what
    the JavaScript plays to float32 rounding (10⁻⁷ of the peak).
  - **The page runs it**; its views, the slow motion included, draw from the WebAssembly model and
    engine, falling back to the JavaScript.

### Viola Organista 0.4.0
- **Ported to C++** (`native/instruments/bowed`): the strings' waveguides with their friction,
  rosin and torsion, the shared bridge, the soundboard and the treadle. `bowed-tuning.h` is the
  C++ copy of the tuning table (`node tools/bowed-tuning.mjs --native`), and a test keeps it fresh.
  - **Bit for bit:** the friction is chaotic, so the last bit matters: the port uses the same seeded
    grain noise and V8's own fdlibm (`fdlibm.cpp`, from V8's `ieee754.cc`, Sun's and V8's notices
    kept) for every sin, cos, exp, log and pow. The WebAssembly plays exactly what the JavaScript
    plays on every reference script.
  - **Plugins:** Viola Organista as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel is the treadle (the swell), aftertouch presses harder, the nine presets. Ten voices take about
    6 % of a core, 18 % with the dampers lifted.
  - **WebAssembly** in `bowed/wasm/`; the 29-test suite passes on it. **The page runs it**, and
    the loop design, voicing and attack map use the same C++, falling back to the JavaScript.

### Forte 0.16.0
- **`forte/background.h`**: without threads (WebAssembly), per-key data an engine replaced is
  freed once no voice holds it, instead of kept until the engine goes (memory grew each time a
  physics knob moved). The vibraphone's and glass armonica's WebAssembly are rebuilt.
- **Native tests** run as WebAssembly with the 256 KB stack the instruments' modules have:
  Eigen keeps blocks of up to 128 KB on it.
- **The engine switch** (C++ | JS) on the Ribbon Piano's page too, which has its own page code:
  `shared/shell.js` exports `engineSwitch()`.
- **`plugin.ready`** for the five, so the front page's Plugins section lists them; the template's
  generated files and WebAssembly carry Forte 0.16.0.

## 2026-10-17 — an engine switch on the ported pages, the presets in Controls

### Forte 0.15.0
- **Engine switch:** every page with a C++ build (Bubble Organ, Vibraphone, Carillon, Glass
  Armonica, Gong Keyboard, and each port to come) has a **C++ | JS** switch in its header,
  beside Discover | Perform. Picking the other engine reloads the page with it, views included,
  and every page remembers the choice. If the C++ fails to load, the switch shows JS in amber.
  `?engine=js` or `?engine=wasm` in the address still overrides it. It is for the beta, and goes
  when the JavaScript engines do.
- **The presets move to the top of the Controls panel** (under More controls on a phone), with
  "Default settings" as before, to make room for it in the header.

## 2026-10-17 — modal bars, bells and plates in C++ (step 4, first batch)

### Vibraphone 0.3.0
- **Ported to C++** (`native/instruments/vibraphone`): the bar's finite elements (Timoshenko
  bending and torsion, the banded Sturm-bisection eigensolver, the undercut optimiser), the
  losses, tubes, discs and mallet, and the engine, operation for operation. `bar-table.h` is the
  C++ copy of the tuned bars (`node tools/vibraphone-bars.mjs --native`), and a test keeps it
  fresh.
  - **Plugins:** Vibraphone as CLAP, VST3, AU v2 and a standalone app: CC64 is the damper pedal,
    the mod wheel the motor's speed, the eleven presets on the Preset parameter. Each bar's modes
    are built on a worker thread for the undercut the knob is at; a note whose bar isn't ready
    waits a few milliseconds for it. Ten bars take about 2 % of a core.
  - **WebAssembly:** 85 KB in `vibraphone/wasm/`. The 24-test suite passes on it, and it plays
    what the JavaScript plays to within 10⁻⁷ of the peak.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript (`?engine=js` forces it). The page builds each bar with the WebAssembly model and
    sends it with the note, so the audio thread never solves a bar.

### Carillon 0.2.0
- **Ported to C++** (`native/instruments/carillon`): the model (ribs and bell sizes, bronze's and
  radiation's losses, doublets, the historic bell's seeded casting, the clapper's Hertz contact,
  air absorption, the strike-note estimator) and the engine (the clapper solved against every
  mode, doublet resonators, pruning, voice stealing, gliding knobs). The finite-element ribs and
  modes are converted number for number to `bell-table.h` (`tools/carillon-native-table.mjs`,
  which `tools/carillon-profile.mjs` now also runs); the finite elements only design the bells,
  so nothing solves an eigenproblem while they play.
  - **Plugins:** Carillon as CLAP, VST3, AU v2 and a standalone app: velocity is the baton
    stroke, CC64 the (dampless) pedal, the profile a dropdown, the ten presets on the Preset
    parameter. Ten bells ringing take about 4 % of a core.
  - **WebAssembly:** 175 KB in `carillon/wasm/` (the bell table is most of it). The 26-test
    suite passes on it, and it plays what the JavaScript plays to within 4 × 10⁻⁸ of the peak.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript. The ribs' outline, which only the drawing uses, stays JavaScript.

### Glass Armonica 0.4.0
- **Ported to C++** (`native/instruments/glass`): the model (Rayleigh's shell modes, Bryan's
  factor, water loading, radiation, the Stribeck friction, the speaking threshold and the
  regulation) and the engine (the turning spindle, the doublets with their implicit Coriolis
  step, the skin's stick–slip contact solved every sample, the two microphones).
  - **Plugins:** Glass Armonica as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel the treadle's speed, aftertouch presses the finger harder, the nine presets on
    the Preset parameter. Each bowl's modes are rebuilt on a worker thread when the split, loss or
    water change. Ten bowls take about 5 % of a core.
  - **WebAssembly:** 47 KB in `glass/wasm/`. The 24-test suite passes on it, and it plays what
    the JavaScript plays to float32 rounding, the stick–slip included (the same seeded friction
    noise).
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript.

### Gong Keyboard 0.4.0
- **Ported to C++** (`native/instruments/gongs`): the von Kármán shell model and its eigenmodes
  (Eigen), and the engine (the SAV integrator, projection, adaptive substeps, the passivity guard,
  the linear tail, the polyphase buses). `gong-modes.h` is generated from
  `gongs/data/gong-modes.js` (`tools/gongs-native-table.mjs`), and a test keeps it fresh.
  - **Plugins:** Gong Keyboard as CLAP, VST3, AU v2 and a standalone app: CC64 is the damper
    pedal, the mod wheel the strike point, the eight presets on the Preset parameter. The coupling
    tables are built on a worker thread when Dome rise, Coupling terms or Rim change; a note waits
    for its tables. Ten gongs take about 17 % of a core, 37 % when all ten crash.
  - **WebAssembly:** 304 KB in `gongs/wasm/`. The test suite passes on it. Wherever the plate
    doesn't crash it plays what the JavaScript plays to within 5 × 10⁻⁸ of the peak; hard strikes
    are chaotic (the JavaScript drifts as far from itself when the velocity changes by 10⁻¹²), so
    those reference scripts are compared within that spread.
  - **The page runs it** and its views call the WebAssembly model, both falling back to the
    JavaScript.

### Forte 0.14.0
- **Plugins' parameters read back as written:** a value already on its step stays as it is
  (`native/core/src/params.cpp`; the vibraphone's disc size of 0.7, step 0.01, read back as
  0.7000000000000001 and failed clap-validator's state reproducibility).
- **`tools/render-reference.mjs`**: an instrument's `reference` tolerance may be a function of
  the script (`toleranceFor`), for instruments that are chaotic in some scripts only (the gongs).
- **Tools** that write the C++ copies of generated data: `tools/vibraphone-bars.mjs --native`,
  `tools/carillon-native-table.mjs`, `tools/gongs-native-table.mjs`.
- **`plugin.ready`** for the vibraphone, carillon, glass armonica and gongs, so the front page's
  Plugins section lists them. The template's generated files and WebAssembly carry Forte 0.14.0.

## 2026-10-17 — the Windows plugin download, flattened

### Forte 0.13.1
- **`Forte-plugins-windows.zip` holds just the instrument's plugins**, like the other two: the
  `native` workflow's packaging now finds the bundles wherever the build put them. Visual
  Studio nests them (`CLAP/Release/`, `VST3/`, `Standalone-…/Release/`), so the first release
  (`plugins-v0.13.0`) had those folders in its Windows zip, with the template's plugins inside.

## 2026-10-17 — plugin downloads

### Forte 0.13.0
- **Plugins on the front page** (step 5 of docs/PLUGINS.md): a Plugins section, under the
  instruments whatever the tab (and at `#plugins`, from a button at the top and a *Plugin*
  link on each ported instrument's card), names the instruments that have plugins and links
  the macOS, Windows and Linux downloads of the latest GitHub Release, with how to install
  them (`native/INSTALL.md`, which also gives the `xattr` command the unnotarised Mac builds
  need).
- **`release-plugins` workflow**, started by hand from GitHub's Actions tab on main: it takes
  the archives that the `native` run of main's latest commit built and validated, and
  publishes them as a release tagged `plugins-v<Forte version>`, with notes from
  `tools/plugin-release.mjs` (the instruments and their versions, then the install steps) and
  their SHA-256 sums.
- **The `native` workflow packages each system's plugins** as `Forte-plugins-macos.zip`,
  `Forte-plugins-windows.zip` and `Forte-plugins-linux.tar.gz` (without the template, with
  `INSTALL.md`), kept 30 days as `release-<preset>` artifacts. Unlike the plain artifacts they
  keep the executable bits and the Mac bundles' ad-hoc signatures.
- **`plugin.ready`** in `shared/registry.js` marks an instrument whose port is built as plugins;
  `test/site-tests.mjs` checks it against `native/instruments/` and checks that the archive
  names agree across CI, the release and the page.

## 2026-10-17 — the Bubble Organ in C++, as plugins and on its page

### Bubble Organ 0.3.0
- **Ported to C++** (`native/instruments/bubbles`, step 3 of docs/PLUGINS.md): the model (heat
  flow, losses, the surface's image, rise and glide) and the engine (nozzles, seeded brooks, the
  bubble pool), operation for operation.
  - **Plugins:** Bubble Organ as CLAP, VST3, AU v2 and a standalone app: CC64 holds the keys,
    the mod wheel raises the rate, aftertouch releases more bubbles, the gas and the liquid are
    dropdowns, and the twelve presets are on the Preset parameter. Ten keys at 40 bubbles/s take
    about 5 % of a core.
  - **WebAssembly:** 51 KB, committed in `bubbles/wasm/`. The test suite passes on it
    (`FORTE_ENGINE=wasm`), and it plays what the JavaScript plays to within 10⁻¹⁰: the same
    seeded random numbers, so the same brooks.
  - **The page runs it**: its worklet plays the WebAssembly engine and its views call the
    WebAssembly model, both falling back to the JavaScript (`?engine=js` forces it). The tank
    and the latest bubble's waveform look the same with either (the tank now compares a
    bubble's depth with the knob's to a tolerance, since the WebAssembly's messages are float32).

### Forte 0.12.0
- **`shared/wasm.js`**: an instrument's `messages(m, engine)` may gather several of its C++
  engine's messages into one for its page (returning null until it has one).
- **`native/web/engine-api.cpp`**: `forte_engine(handle)`, so an instrument's own exports can
  reach its engine (the bubble organ's test hooks). The template's WebAssembly is rebuilt.
- **Plugins' parameter text reads back as it was written** (clap-validator's round trip failed
  on the bubble organ's rate: "10.0 /s" just below 10 read back as 10, "10 /s"):
  `tools/gen-native-params.mjs` finds where each text format ends by bisection, to the last
  double, rather than halfway between samples; `parseValue` first looks for the segment that
  writes the text exactly (suffix, decimals, a "+"), then for one whose edge it rounds to, then
  reads typed text as before. A new native test checks the round trip on either side of every
  boundary of every instrument's parameters.
- The native tests build `<slug>-tests.cpp` for each ported instrument; native/README says how
  to build where gitlab.com can't be reached.

## 2026-10-16 — the template in C++, as plugins and on its page

### Forte 0.11.0
- **The template is the first instrument with a native port** (step 3 of docs/PLUGINS.md): its
  model and engine in C++ (`native/instruments/template`), with tables generated from its
  descriptor and a reference rendered from its JavaScript.
  - **Plugins:** Template Bars as CLAP, VST3, AU v2 and a standalone app, built and validated in
    CI on macOS, Windows and Linux (the smoke-test plugin is retired). 10 voices take under
    1 % of a core at 48 kHz.
  - **WebAssembly:** 32 KB, committed in `docs/template/wasm/`. Its test suite passes on it
    (`FORTE_ENGINE=wasm`), and it plays what the JavaScript plays to float32 rounding.
  - **The page runs it**: its worklet plays the WebAssembly engine and its views call the
    WebAssembly model, both falling back to the JavaScript if they cannot load
    (`?engine=js` in the address forces the JavaScript). The CPU pill's tooltip says which.
- **`shared/wasm.js`**: an instrument's WebAssembly loaded in a page, an AudioWorklet or Node, as
  a class with the engine contract. `shared/worklet.js` runs it when a page sends one, and the
  shell sends it when the descriptor names one (`wasm`).
- **`tools/new-instrument.mjs` starts the native port too**: the C++ engine and model, the
  generated tables and reference, a VST3 class id and an AU code. docs/INSTRUMENT_GUIDE.md has a
  new section, "The native port".

## 2026-10-16 — the shared native core

### Forte 0.10.0
- **`native/core`: what the engines share, in C++** (step 2 of docs/PLUGINS.md), checked against
  the JavaScript it ports (`tools/gen-native-vectors.mjs` writes what the JavaScript computes;
  the native tests compare, natively and as WebAssembly):
  - `shared/dsp.js` operation for operation; `shared/impulses.js` from the same seeded random
    sequence, bit for bit; `shared/linalg.js` on Eigen; `shared/guard.js`.
  - The output chain of `shared/chain.js` (tone, soundboard or body, room, volume and trim)
    and a limiter with Web Audio's compressor curve and makeup gain. The convolutions have no
    latency and spread their work: about 3 % of a core for the room at 48 kHz.
  - Real-time plumbing: a lock-free queue for what an engine posts, flush-to-zero, and
    per-key data (a page's `noteData`) built on a worker thread and handed to the audio thread
    without locks, freed when no voice holds it.
- **The plugins play through the output chain**, take MIDI controllers mapped to parameters
  (the piano's soft pedal), and are tested as a host drives them: 44.1 to 192 kHz, blocks of
  1 to 4096 samples (the same sound), notes and the pedal, presets, the mod wheel, state.

## 2026-10-16 — instruments without their pages

### Forte 0.9.0
- **Every instrument has a headless descriptor** (step 1 of docs/PLUGINS.md):
  `<slug>/src/<slug>-instrument.js` holds its parameters and presets, keys, pedal, mod
  wheel and other controllers, MIDI velocity curve, engine, `engineParams`, `noteData` and
  output chain. Pages spread it into the shell; Node plays any instrument from it
  (`tools/headless.mjs`). The sound is unchanged: every demo renders byte for byte as before,
  and every instrument measures as loud as before.
- **One engine contract and one worklet for all.** The five older pages' engines (Ribbon
  Piano, Tonewheel Organ, Tine Piano, Huygens and Black-Hole Keyboards) now have the shared
  methods and run in `shared/worklet.js`; their own worklets are gone. Engines may add
  `stats()` to the CPU pill's message.
- **`shared/chain.js`**: the output chain after the engine (tone, body or soundboard, room,
  volume × trim, limiter), built from the descriptor's `chain`. The shell and the older pages
  use it, and `tools/loudness.mjs` measures every instrument through it.
- **Tools for the native ports:**
  - `tools/gen-native-params.mjs` writes an instrument's C++ parameter and preset tables from
    its descriptor. The JavaScript `fmt` of each parameter is turned into piecewise text
    formats that match the page's text over 95–100 % of nearly every parameter's travel (10
    of 440 fall back to a plain number); `native/core` formats them exactly as JavaScript does.
  - `tools/render-reference.mjs` plays fixed scripts (notes, velocities, chords, the pedal,
    the mod wheel, aftertouch, bend, each preset) and summarises them for a port to match.
  - `tools/engine.mjs`: the test suites get their engine through `loadEngine`, so
    `FORTE_ENGINE=wasm` will run them on an instrument's WebAssembly build.
  - `test/native-tests.mjs` checks every descriptor converts and the generated files are
    fresh; `test/site-tests.mjs` checks every instrument has a descriptor its page uses.

### Ribbon Piano 0.3.3
- A descriptor, `piano/src/piano-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared engine contract and runs in `shared/worklet.js`, and the page
  builds its output chain (soundboard, room, limiter) with `shared/chain.js`. The descriptor
  has the MIDI velocity curve and the soft pedal (CC67). A key still ringing and struck again
  after a change that leaves the strings alone (a preset that changes only the mix, say) is
  struck again rather than doubled.

### Harpsichord 0.2.1
- A descriptor, `harpsichord/src/harpsichord-instrument.js`, holds everything but the page
  (step 1 of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every
  demo renders byte for byte as before.

### Pipe Organ 0.2.1
- A descriptor, `pipes/src/pipes-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Free-Reed Organ 0.2.1
- A descriptor, `harmonium/src/harmonium-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Vibraphone 0.2.2
- A descriptor, `vibraphone/src/vibraphone-instrument.js`, holds everything but the page (step
  1 of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Carillon 0.1.1
- A descriptor, `carillon/src/carillon-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Electric Grand 0.3.1
- A descriptor, `grand/src/grand-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Tonewheel Organ 0.4.3
- A descriptor, `organ/src/organ-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract (`noteOn`, `noteOff`, `allNotesOff`) and runs in
  `shared/worklet.js`; it builds its tonewheel generator itself when the tuning, mains,
  harmonics, crosstalk or leakage change, rather than being sent one. The page builds its
  output chain with `shared/chain.js`. Choosing a preset no longer redraws the key contacts'
  random bounce.

### Tine Piano 0.3.3
- A descriptor, `tines/src/tines-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js`; the page builds its
  output chain with `shared/chain.js`. The descriptor has the MIDI velocity curve. A key still
  ringing and struck again after a preset that leaves the tines alone is struck again rather
  than doubled.

### Reed Piano 0.3.1
- A descriptor, `reeds/src/reeds-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- Each reed's model is computed at the engine's own rate (it was fixed at 48 kHz; the same at
  every rate above 10 kHz). A key still ringing and struck again after a preset that leaves
  solder, strike and hardness alone is struck again rather than faded out and restarted.

### Tangent Clavier 0.3.1
- A descriptor, `clavier/src/clavier-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Sticky-Pad Piano 0.3.1
- A descriptor, `pianet/src/pianet-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Viola Organista 0.3.1
- A descriptor, `bowed/src/bowed-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Glass Armonica 0.3.2
- A descriptor, `glass/src/glass-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Pyrophone 0.3.2
- A descriptor, `pyrophone/src/pyrophone-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.

### Singing Arc 0.1.1
- A descriptor, `arc/src/arc-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- Fixed: opening the page in talk mode, or moving the current, gap, τ or re-strike there (the
  mod wheel moves the current), cut the capacitor bank with the talk circuit, and switching
  back to the arcs kept it: C4 played at 83 Hz. The bank is now always cut for the arcs.

### Huygens Keyboard 0.3.3
- A descriptor, `huygens/src/huygens-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js` (retuning arrives as a
  message); the page builds its output chain (tone, body, room) with `shared/chain.js`.

### Gong Keyboard 0.3.1
- A descriptor, `gongs/src/gongs-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.
- The plate's coupling tables are part of the descriptor's engine parameters; the page still
  sends them only when they change.

### Black-Hole Keyboard 0.3.3
- A descriptor, `blackhole/src/blackhole-instrument.js`, holds everything but the page (step 1
  of docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo
  renders byte for byte as before.
- The engine is on the shared contract and runs in `shared/worklet.js`; the QNM table loads
  through the descriptor. The page builds its output chain with `shared/chain.js`; the
  descriptor has the MIDI velocity curve.

### Quantum Keyboard 0.3.1
- A descriptor, `quantum/src/quantum-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Bubble Organ 0.2.1
- A descriptor, `bubbles/src/bubbles-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Spring Keyboard 0.1.1
- A descriptor, `springs/src/springs-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Star Keyboard 0.1.1
- A descriptor, `stars/src/stars-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

### Wind Harp 0.1.2
- A descriptor, `windharp/src/windharp-instrument.js`, holds everything but the page (step 1 of
  docs/PLUGINS.md); the page and the tests use it. The sound is unchanged: every demo renders
  byte for byte as before.

## 2026-10-16 — the native setup

### Forte 0.8.0
- **`native/`: the instruments' physics will be C++, built as plugins and as WebAssembly**
  (docs/PLUGINS.md, step 0). There is no instrument in it yet: this sets up the build, the
  shared plugin and CI.
  - One CLAP plugin serves every instrument (`native/plugin`). clap-wrapper makes its VST3, AU v2
    and standalone app, on macOS, Windows and Linux. It takes notes and MIDI as the pages do
    (velocity, the pedal or Hold, the mod wheel, aftertouch, pitch bend), has the instrument's
    parameters and a Preset parameter for its presets, saves its state, and has no latency.
  - The plan's framework, iPlug2, has no Linux support; the CLAP SDK with clap-wrapper (MIT)
    replaces it, with the same formats.
  - Every dependency is pinned to a commit, Emscripten to a version (6.0.10).
  - A new workflow, `native`, builds the plugins on all three platforms, runs the unit tests,
    clap-validator, Steinberg's VST3 validator and `auval -strict`, and keeps the plugins for
    14 days. Until the template is ported, a CI-only smoke-test plugin goes through it.
- **Plugin identities.** Each instrument has a four-character Audio Unit code in the registry
  (`plugin.code`), and a VST3 class id in `native/ids.json`; `test/site-tests.mjs` checks both
  are unique. Neither may ever change.

## 2026-10-16 — controls you can read, and room on a sideways phone

### Forte 0.7.3
- **The controls above the keys say what they are.** The value took the
  line first, so most labels were cut to a few letters ("As…", "Clap…",
  "Dome ri…"): 44 of 161 on a desktop, 66 at 900 px, 70 on an iPad. Now
  the label comes first, without its explanation ("Dome rise (curvature)"
  shows as "Dome rise"; the whole name stays in the tooltip, the ⓘ and the
  control's accessible name). The value shows beside it when both fit,
  and always while the control moves (a drag, the arrows, the mod wheel, a
  preset) and for a moment after. The tooltip has both. Cut labels: 3 on
  a desktop, 4 at 900 px, 6 on an iPad, 2 on an upright phone (18 on a
  sideways one, whose tiles are narrower).
- **A sideways phone has room for the views.** The controls, the keyboard
  bar and the keys took 261 of 340 px, leaving the views a 24 px sliver,
  and on 11 pages not one control was wholly in sight. Now the controls
  share a row with the keyboard bar (whose overview shrinks to a
  thumbnail), show one row of whole tiles and scroll a row at a time, and
  the keys take at most 36 % of the height: 207 px, and the views get
  three times the room. On phones a scroll of the controls comes to rest
  on whole tiles.
- **A second finger works the controls.** While one finger held a key, a
  tap with another on a stop, Latch, ◀ ▶, − + or a tab did nothing (the
  browser sees a two-finger gesture and sends no click). Now it clicks.
- **Aftertouch by touch.** Leaning (sliding a held finger along the key)
  counted only toward you, so a loud strike near the front edge had
  nowhere to go, and on a black key the lean slid onto the next note as a
  glissando. Now a lean either way counts, a third of the key's length
  for full pressure, past a few pixels of wobble; it stays on its key, and
  only a slide across the keys is a glissando. The nine instruments with
  aftertouch say so under *Touch* in How it works.
- **No velocity slider on touch screens.** "Velocity (computer keys)" took
  the first place above the keys on 12 pages, and a touch sets velocity by
  where it strikes. It is left out on touch screens (↑ ↓ still set it).
- **Bigger keyboard-bar buttons on touch screens** (44 px: the pedal,
  Latch, ◀ ▶, − +), and the Tangent Clavier's pickup selector fits its
  tile on a phone.

### Forte 0.7.2
- **MIDI stays on from page to page.** Each instrument is its own page, so
  moving to another one meant clicking Enable MIDI again, and a keyboard
  played on the new page made no sound until then. Now, once MIDI has been
  turned on, every page turns it on by itself while the browser still
  grants it (`shared/midi.js`). Until it has been, no page asks.
- **No stuck notes from MIDI.** Each device's notes are tracked per
  channel. A note struck again before its note-off lets the old one go
  first, so one note-off always silences it (two note-ons and one note-off
  used to leave it sounding for good). A note-off for a note that isn't
  down on that channel is dropped, so two channels holding one key keep it
  sounding until both let go. A keyboard unplugged mid-phrase lets go of
  its notes and of its sustain pedal instead of leaving them on.
- **Panic lets go of the pedal and Latch too.** It silenced the notes but
  left sustain (or Latch) on, so the next notes rang on. The on-screen
  pedal and Latch now follow Space, a MIDI pedal and Panic, and Latch goes
  off whenever sustain does.
- **A mod wheel at rest leaves the instrument at its default.** The wheel
  rests at 0, which now gives the parameter's default exactly (not a value
  rounded to its step), with the maximum fully up.
- **The octave never moves a whole row of computer keys off the
  instrument.** `←` went one octave further than any key could sound,
  leaving the bottom row dead.

### Ribbon Piano 0.3.2
- MIDI through `shared/midi.js`: on again on the next page, notes tracked
  per channel and device. Panic lets go of the pedal.

### Tine Piano 0.3.2
- MIDI through `shared/midi.js`. Panic lets go of the pedal. `←` stops
  before the bottom row of computer keys falls off the instrument.

### Tonewheel Organ 0.4.2
- MIDI through `shared/midi.js`. `←` stops before the bottom row of
  computer keys falls below the manual. It used to fold up an octave there,
  so both rows played the same notes.

### Huygens Keyboard 0.3.2
- MIDI through `shared/midi.js`. Panic lets go of Hold. `←` stops before
  the bottom row of computer keys falls off the instrument.
- **The mod wheel at rest gives the default coupling (0.055).** It gave 0,
  so a nudge of the wheel and back turned the coupling off and the clocks
  stopped locking.

### Black-Hole Keyboard 0.3.2
- MIDI through `shared/midi.js`. `←` stops before the bottom row of
  computer keys falls off the instrument.
- **The mod wheel at rest gives the default spin (a = 0.69).** It gave
  a = 0, a non-spinning hole.

### Vibraphone 0.2.1
- **`Z` plays C4.** The bars start at F3, and the keys started at C3, so
  `Z` to `E` (five keys of the bottom row) made no sound.

## 2026-10-16 — keys for the keyboard, and hold to sound

### Forte 0.7.1
- **Keyboard-only players can set stops and switches.** Space was always
  the pedal, so a stop, view toggle or checkbox reached with Tab could not
  be ticked. Now a control reached with Tab keeps the keys it uses: Space
  ticks a checkbox or presses a button, and the arrows move a slider or step
  a list (`shared/focus.js`). It keeps the focus after a change, so the next
  Space or arrow works it again.
- **A control touched with the mouse or a finger hands the keys back.**
  After dragging a slider, the arrows moved that slider instead of the
  octave and velocity. After the presets menu was opened and dismissed, the
  next ↓ silently picked "Default settings" and threw away every change.
  Now the arrows go to the instrument, and Space stays the pedal.
- **`holdHint`** (shell config): for an instrument that speaks only while
  a key is held, a toast says so the first time a key is let go too soon.
  On a phone or tablet, which hide the hints behind ⌨, nothing said so before.

### Ribbon Piano 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Tine Piano 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Huygens Keyboard 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Black-Hole Keyboard 0.3.1
- The same key rules as the other pages (`shared/focus.js`).

### Tonewheel Organ 0.4.1
- The same key rules. A drawbar or the swell pedal dragged with the mouse
  no longer takes the arrows; reached with Tab, it still moves with them.

### Glass Armonica 0.3.1
- A first very short press shows a hint: hold the key. A tap is 25–45 dB
  quieter than a held note, because the finger takes about half a second
  to set the glass singing.

### Wind Harp 0.1.1
- A first very short press shows a hint: hold the key. The wind takes up
  to a second, in the bass, to set a string singing, so a tap is close to
  silent.

### Pyrophone 0.3.1
- A first very short press shows a hint: hold the key. The flame takes a
  moment to set the tube singing; a tap on the lowest keys is about 20 dB
  quieter than a held note.

## 2026-10-15 — a compact page: controls, views and keys

### Forte 0.7.0
- **Controls and views apart.** The middle of every page is pictures only;
  every control sits at the edges. The main views (the ones Perform shows)
  are large, side by side or stacked; the others are tabs underneath, in
  a panel that folds away. Right above the keys are the controls you play
  with: the performance controls and any control surface a page marks
  `data-control` (the organ's drawbars and switches, which were a view),
  then **More controls**, which opens the rest (a column on wide screens,
  a panel over the views on narrow ones). A handle on the footer's edge
  folds the controls away.
- **The keys fill the width** at the key size you pick (− +), as in
  GarageBand: an octave or so on a phone, most of the range on a laptop.
  ◀ ▶ move an octave, and an overview of the whole range, with the keys on
  screen framed and the keys you hold lit, drags anywhere. This replaces
  the octave count and the separate key height. The keyboard's tools fit
  one row on a phone.
- **Fewer, merged buttons.** The instrument's name is now the menu of
  every instrument, with Forte's home page first (it was three things:
  the Forte link, Instruments ▾ and the title). Reset is "Default
  settings" in the presets menu. The Controls button became More
  controls, above the keys, and Views ▾ became the tabs. The footer's
  hints for the computer keyboard and MIDI, with their readouts, wait
  behind ⌨. The phone header is two rows.
- **Explanations behind ⓘ.** A view's caption opens from an ⓘ in its
  title; a parameter's hint in the Controls panel slides open from an ⓘ
  by its name.
- **More direct controls.** Above the keys, a dropdown with a few short
  choices is a row of buttons, one tap each (the harpsichord's manual,
  the vibraphone's motor, the bubble organ's gas, the clavier's pickups).
- Site test: a control surface is never marked as a Perform view. The
  guide and the README describe the new layout.

### Tonewheel Organ 0.4.0
- The console (drawbars, swell, percussion, vibrato and chorus, Leslie,
  generator motor) is a control surface above the keys, as on the real
  instrument, rather than a view. The tone generator and the Leslie are
  the main views; the output spectrum and "what a key really plays" are
  tabs.

## 2026-10-15 — views on tablets

### Forte 0.6.1
- Views no longer spill out of their cards on tablets and in narrow
  windows. Between 601 and 1050 px wide the views stack in one column
  inside a screen-high, scrolling panel, but the rows kept their
  wide-screen sizing and were squeezed to fit the screen: every page's
  230 px canvases overlapped the cards below them, at 900 px, at
  1024 × 768 and on an iPad in portrait. There, each row is now as tall as
  its content and the column scrolls.
- On every screen, a row of views directly in `#views` is never squeezed
  below its own content; its canvases still flex. This shows the
  Tonewheel Organ's whole console (the drawbars' footages, the swell and
  the vibrato and Leslie switches) and the Glass Armonica's mode table at
  1440 × 900, where they were cut off; their views now scroll a little.
- Phones and Perform are unchanged.

## 2026-10-15 — singing arc

### Singing Arc 0.1.0
- New instrument: William Duddell's singing arc (1900), C3–C6, played as he
  played it. Each key switches a capacitor across a fixed coil (20 mH) in
  parallel with a carbon arc that burns on 220 V DC through a rheostat and a
  0.5 H choke. Velocity does nothing: a key only closes a contact.
- **The arc:** Ayrton's falling characteristic for solid carbons,
  V = a + b·l + (c + d·l)/I (38.88 V, 2.074 V/mm, 11.66 W, 10.54 W/mm), is
  the static limit of a Mayr-type column whose heat loss is chosen to
  reproduce it, with a thermal time constant τ (5–300 µs, default 26 µs).
  Its small-signal impedance, derived analytically and checked against a
  numerical linearisation, has three regimes. It is negative at low
  frequency (−B/I², −4.8 Ω at 3 A), and inductive (0.40 mH: the hysteresis
  loop, and the note's flattening). It turns positive above
  ωτ = 2w√(K/R₀ − 1) (4.8 kHz): the arc's ceiling.
- **Linear analysis:** the whole circuit's quartic (musical mode, column,
  choke) gives each note's growth rate (110 /s at the defaults) and starting
  frequency (1.0–2.0 % below Kelvin's formula). The engine matches both
  within 0.11 % and 0.07 ¢, and matches the thresholds in coil resistance
  and in τ.
- **Large signal:** Ayrton's hyperbola alone is subcritical and puts the arc
  out. The white-hot carbons give the column a floor, set by a re-strike
  voltage (1.1–2.5 × the burning voltage), which holds the oscillation in
  the first kind. A high re-strike voltage gives the second kind, where the
  arc goes out and re-strikes every cycle. The arc is bistable between the
  threshold current (12 A) and the fold (about 17 A).
- **The keyboard:** each key's capacitor is cut so that its steady note is in
  tune (worst 0.08 ¢), by integrating the circuit to its cycle. A preset cuts
  them by Kelvin's formula instead: 1–5.7 % flat.
  - One arc: held keys put their capacitors in parallel and the pitch drops.
  - Several arcs: 2–6 lamps, a key each; a note can be stolen only after
    40 ms, and it fades first.
  - Contacts close in 0.5 ms. They open with a spark that fades the note in
    about 10 ms and goes out at a current zero.
- **Hiss** above a hissing current that grows with the gap (7 A at 3 mm),
  as conductance noise.
- **The sound:** the column is its own loudspeaker, radiating the
  thermophone's pressure (γ − 1)/(4π c² r)·dP/dt at a listening distance.
- **Simon's talking arc:** a synthesised singer at a microphone (a Rosenberg
  pulse, Peterson & Barney's formants), coupled into the arc through a
  transformer.
- Implicit integration (trapezoidal circuit, θ-method column, Newton) at 4×
  the sample rate: six singing arcs take about 19 % of one core.
- Views: the V–I plane with the operating point's loop drawn live, the arc's
  glow strobed into slow motion, Duddell's circuit, and a spectrum. Eight
  demos and 30 tests.

## 2026-10-15 — wind harp

### Wind Harp 0.1.0
- New instrument: the Aeolian harp made playable, G3–C7. Every key is a
  nylon string behind a shutter; pressing the key slides the shutter open
  (velocity sets how fast, 300 ms to 10 ms) and the wind sets it singing.
- **The wake:** van der Pol wake oscillators at stations along each string
  (Facchinetti, de Langre & Biolley 2004), driven by the string's local
  acceleration and loading it with their lift, with the published ε = 0.3,
  A = 12, C_L0 = 0.3 and γ = 0.8; shedding at St(Re)·U/D from Williamson &
  Brown's two-term fit, none below Re = 47 (a Landau-like onset), and Ω set
  so that a fixed cylinder's wake sheds exactly at f_s (κ = 0.99442).
- **The strings:** stiff, in modal form, one wake station per mode (8–16),
  cut so that at the reference wind of 4 m/s each sheds at its key's note
  and locks onto its 3rd harmonic (the sounding harmonic n₀ is a knob, 2–6):
  diameters 0.29–4.9 mm, lengths 30–100 cm, tensions 14–360 N, Re 77–1300.
  The treble keys have courses in unison, as fine top strings often are:
  one string to a key to B4, two from C5 to C7 (67 strings), tuned 1.2 ¢
  apart with gauges 0.5 % apart (seeded), each locking on its own, so a
  course shimmers. Every key sounds its note within 0.5 ¢.
- **The linear analysis:** de Langre's coupled-mode flutter gives each
  harmonic's lock-in band, |δ − 1| < √(AM) (about ±2.2 % in wind), and its
  growth rate; a harmonic balance of the distributed wake gives the locked
  swing and how far the lock holds beyond the band (the hysteresis). The
  engine matches both: growth within 2 % with the wake's own growth turned
  down, lock-in where the bands begin and end, the hysteresis folds within
  2 %, the locked swing within 1.5 %.
- **Wind:** a slider (and the mod wheel and aftertouch) from 1 to 8 m/s
  hops every sounding string up or down its own harmonic series; seeded
  gusts with a von Kármán-like spectrum make strings flicker between
  harmonics; the string's Q and a metal winding set the mass–damping, and
  with it the swing (which follows m*ζ alone) and the band (∝ 1/√m*).
- **Kircher's harp:** every string tuned to one note, only the gauge
  differing, so each key sounds the harmonic of the unison its gauge locks
  onto, and the wind makes chords of harmonics.
- **The sound:** the bridge force through a tapered, mass-like top with
  five broad box resonances and a first-order shelf for the top's radiation
  efficiency (rising 6 dB an octave from 500 Hz to 4 kHz), heard by two
  microphones, plus the wake's lift radiated as a dipole (the aeolian tone,
  34–42 dB under a locked key). With the courses and the tapered top this
  voices the compass evenly: a forte note peaks at 0.14–0.35 on every key.
- Low strings step at a half or a quarter of the sample rate (ωh ≤ 0.4),
  their force interpolated back: ten keys across the compass take about
  20 % of one core.
- Views: a lock-in map (the Strouhal frequency against the wind across the
  string's harmonics, with the linear bands, the hysteresis and the wind
  now), the string and its vortex street in slow motion, a spectrogram, and
  the last key's string. Six demos.
- Performance controls: wind speed, gustiness, velocity (shutter speed),
  room and volume. Perform shows the lock-in map and the vortex street.

## 2026-10-15 — star keyboard

### Star Keyboard 0.1.0
- New instrument: every key a star, C2–C7, sped up a fixed K = 510,800 times
  (μHz to Hz), chosen so that the Sun itself sounds on G6.
- **The keyboard is an evolutionary track** (0.9–1.8 M☉, 1 M☉ by default):
  dwarfs on the top keys, subgiants in the middle, red giants below (ν_max
  4123 μHz on C7 to 130 μHz on C2 at 1 M☉). The zero-age main sequence from
  Tout et al. (1996), a main sequence through the Sun, subgiants, and the
  red-giant branch on the Hayashi line; above the track's own start the path
  continues down the zero-age main sequence.
- **The modes:** Δν ∝ √(mean density) and ν_max ∝ g/√T_eff with Huber et
  al.'s solar values (135.1 and 3090 μHz); the asymptotic relation to second
  order with small separations and a curvature, under a Gaussian envelope of
  width 0.66 ν_max^0.88; visibilities 1 : 1.5 : 0.6 : 0.05 for l = 0–3;
  linewidths a power law in T_eff over a floor (1 μHz for the Sun, 0.13 μHz
  for red giants). Up to 340 m components per star.
- **Mixed modes** in subgiants and red giants from tan θ_p = q tan θ_g, every
  root found by bisection; each mode's core inertia ζ sets its period
  spacing, its share of the p mode's power (1 − ζ) and its linewidth.
- **Rotation** splits every multiplet by m(Ω/2π)(1 − C_nl), mixed modes by
  their core and envelope rates weighted by ζ; **inclination** shares each
  multiplet's power among its m components as E_lm(i) (Gizon & Solanki 2003).
- **The sound:** every mode an exact two-pole oscillator pushed once a block
  by Gaussian random forces while the key is down (convective driving), so
  each line is a Lorentzian of its own width with a set mean power; key-up
  stops the driving and every mode rings down at its linewidth; the pedal
  keeps the convection on; a flare at a random point on the star kicks every
  mode at key-down, coherently across orders, so its wave packet echoes
  every 1/Δν.
- **Tuning:** each key's star is the one on the track whose heard pitch, the
  power-weighted mean log frequency of its modes, lands on the note (within
  0.02 ¢ on every key; ν_max then sits 10–24 ¢ above it).
- **δ Scuti stars** as a second family: three radial modes at P₁/P₀ = 0.773
  and P₂/P₁ = 0.802 and a few nonradial ones, each growing by the Landau
  equation dA/dt = (γ − βA²)A to a steady amplitude, with compressed growth
  times.
- Views: the échelle diagram and the power spectrum of the focus star, its
  modes sized by their power now; the star, showing one mode's pattern
  turning at the set inclination; and a Hertzsprung–Russell diagram with
  the star on every key. Seven demos.
- Performance controls: rotation, inclination, convective driving, flare
  kick, room and volume. Perform shows the échelle diagram and the star.
  The mod wheel spins the stars up; aftertouch drives them harder.

## 2026-10-14 — spring keyboard

### Spring Keyboard 0.1.0
- New instrument: a keyboard of struck steel springs, C2–C6, each a helical
  spring with a magnetic bead at each end, as in a spring-reverb tank. A
  mallet taps one bead; the other bead is the pickup.
- **The waves:** Wittrick's helical rod (bending, twist, stretch and shear,
  with shear and rotary inertia) solved for every wavenumber as a 6 × 6
  symmetric eigenproblem, with exact group velocities. Checked against
  Hoppe's and Michell's ring modes, rigid-body motion and the slinky line
  (the open-coiled spring's compliance, both low-frequency speeds within
  10⁻⁵); the reduced thin-spring model agrees at small helix angle (low
  branch within 0.02 %, F_C within 0.3 %).
- **F_C and T_D:** the transition frequency where the slow branch ends
  (0.4 % above Parker & Bilbao's formula in the reduced model) and the echo time
  T_D = 2L/c₀; below F_C every echo is a rising chirp, above it a falling
  one, as the spring-reverb measurements describe.
- **Tuning:** every key is the C4 spring (5.4 mm coil, 0.45 mm wire, 3°,
  23.6 turns) scaled to its note, its lowest mode first put on the note,
  then the whole spring rescaled until a virtual-pitch estimate of what is
  heard (subharmonic summation, Hermes 1988, on the first 0.4 s after an mf
  strike) lands on it. That corrects a drift of −21 ¢ (C2) to −9 ¢ (C6): the
  lowest mode now sits 21 ¢ to 5 ¢ sharp. It is recomputed whenever the
  knobs that shape the sound change. F_C ≈ 16 f₀: 1.07 kHz on C2 to
  17.0 kHz on C6.
- **Sound:** modes at k = nπ/L on both acoustic sheets (101–243 per spring
  below 18 kHz), each weighted by how much it turns (or slides) the beads
  at both ends; damping from the mounts (a loss per reflection, so the band
  below F_C rings longest), the steel's loss factor, an oil bath, a hand on
  the coils (mod wheel) and a felt damper that falls on key-up (sustain
  holds it off; release velocity sets how fast).
- **Playable:** one to three springs a key cut a little apart, centred on
  the note (their echoes blur), coil radius, wire diameter and helix angle (F_C moves; the
  turning and stretching waves mix), beads driven in rotation or along the
  axis, bead inertia, mallet contact time, and a Slinky family whose F_C is
  below hearing, so every echo is a falling whistle.
- The page solves each key's springs and sends them with the note, so the
  audio thread never solves an eigenproblem.
- Views: the echoes of the last strike (a short-window spectrogram from the
  engine, with the model's arrival times), the dispersion and the round
  trip's group delay with T_D and F_C, the struck spring slowed down, and a
  live spectrogram. Seven demos.
- Performance controls: springs per key, mount loss, hand, mallet, room
  and volume. Perform shows the echoes and the spectrogram.

## 2026-10-14 — carillon

### Carillon 0.1.0
- New instrument, after the Low Countries carillon (Hemony): 49 bronze
  bells, C3–C7 at sounding pitch, each tuned by its nominal an octave
  above its key, in three registers with their own ribs, heavier towards
  the treble (wall thickness × 0.5, 0.72 and 1).
- **The bell:** axisymmetric solid finite elements (eight-node
  quadrilaterals on the rib's cross-section, one cos mθ / sin mθ family at a
  time, banded subspace iteration), checked against Hoppe's and Rayleigh's
  ring, Rayleigh's inextensional cylinder modes and the dense eigensolver,
  and converged under refinement. A thick ring shows how far thin-shell
  formulas go wrong.
- **The founder's tuning:** a Levenberg–Marquardt search moves each rib's
  thickness, radius and height at ten stations until hum, prime, tierce,
  quint and nominal sit at 0.5 : 1 : 1.2 : 1.5 : 2 (minor-third bells) or
  with the tierce at 1.25 (major-third bells, from a different starting rib,
  aiming more softly at the deciem, superquint and octave nominal too),
  moving the rib no further than it must.
  `tools/carillon-profile.mjs` writes the six ribs and their modes to
  `bell-table.js`.
- **Sound:** every mode below 8–12 × the prime as an exact two-pole
  recursion, a doublet for each m ≥ 1; damping from bronze's loss and
  multipole radiation (the hum rings longest); a radiation-weighted sum at
  the listener, with spreading and ISO 9613-1 air absorption over the
  distance from the tower.
- **Doublets:** an asymmetry ε cos 2mθ splits each pair by Δf/f = εκ/2
  (degenerate perturbation theory, κ from the FEM); the strike angle shares
  the strike between the pair as cos and sin mα, so bells warble unless
  struck on an axis.
- **The clapper:** Hertz contact solved implicitly every sample against
  every mode of the bell where it is; about 1 ms on C4; iron or a softer
  insert, its mass, the strike height and an even touch across the
  keyboard.
- **The strike note:** subharmonic summation finds it an octave below the
  nominal, live, on the partials as heard; given only the nominal,
  superquint and octave nominal it still finds it, where no partial lies.
  In the top bells it names the hum.
- **Historic bells:** untuned castings, each partial moved by the FEM's
  sensitivities to random wall errors, seeded per bell.
- Views: the bell's section and a partial's shape, from the side and from
  below, with its live level; the partial table; the strike note; the
  spectrum. Seven demos.
- Performance controls: bell profile, asymmetry, clapper face, strike
  angle, distance, room and volume. Perform shows the bell and its mode,
  and the spectrum.

## 2026-10-14 — front page by kind of instrument; Discover and Perform

### Forte 0.6.0
- **Front page:** choosing an instrument comes first. A short title with
  **About Forte** (a dialog with the introduction and the notes that were
  on the page), **Credits** and **GitHub**, then tabs for four kinds of
  instrument that stay at the top as the cards scroll: *Traditional*,
  *Electric*, *Experimental* (experiments from history) and *Phenomena*
  (instruments only physics can build), or *All*. Each tab has its own
  link (`#electric`). A whole card opens its instrument; the instruments
  in the workshop are listed by name under their kind.
- **Registry:** four sections (`traditional`, `electric`, `experimental`,
  `phenomena`) replace the two ("from history", "only physics can build"),
  with the ready instruments first in each. Every page's Instruments menu
  follows.
- **Performance controls:** each instrument's parameters marked
  `perform: true` sit in a strip above the keys, in both modes, so they
  never move; a checkbox there becomes a stop that lights up. In
  Discover, a control with a hint has an ⓘ button that opens the hint in
  a bubble above it (a tap, so it works on a tablet). The Controls panel
  keeps the rest.
- **Discover | Perform** on every instrument page. Discover is the page as
  it was. Perform shows only the one or two views each instrument marks
  `data-perform`, side by side (stacked on a tall screen) and filling it,
  with no text: no titles, readouts, captions, legends or tables, and no
  text drawn on their canvases (`fillText` is silenced there; a card with
  `data-keep-text` keeps its own). It hides How it works, starts with the
  Controls column closed, and offers **Full screen** for a projector. The
  mode is the same on every page; each page remembers its views and
  Controls in each mode.
- **Presets** and **Reset** move from the Controls panel to the header, so
  they are always in view.
- Header: once the audio is on, the CPU meter takes the place of "Start
  audio" (as it did on phones); the MIDI status shows once MIDI is asked
  for; the subtitle shows only on screens wider than 1700 px; the layout
  and audio buttons sit on the right on whichever row they land.
- The shell gives `perform: true` parameters `data-perform`; the template
  marks four, and two views. The guide and the README describe the modes.
- Site tests: four sections, ready instruments first; presets where the
  header can take them; the front page's tabs and About; 3–10 performance
  controls per instrument, volume among them; one or two views marked for
  Perform on every page.

### Ribbon Piano 0.3.0
- Performance controls: felt hardness, velocity, una corda, soundboard,
  room and volume.
- Perform shows the string in slow motion and its partials.

### Harpsichord 0.2.0
- Performance controls: the registration (manual, coupler, front and back
  8′, 4′, lute, buff), room and volume.
- Perform shows the pluck in slow motion and the comb and spectrum.

### Pipe Organ 0.2.0
- Performance controls: the stops (Principal 8′, Octave 4′, Gedackt 8′,
  Mixture III), tremulant, wind pressure, room and volume.
- Perform shows the jet in the mouth and the spectrum.

### Free-Reed Organ 0.2.0
- Performance controls: the stops (8′, musette, 16′, 4′, percussion),
  bellows pressure, expression stop, room and volume.
- Perform shows the reed in its slot and the flow loop.

### Vibraphone 0.2.0
- Performance controls: motor and shaft speed, mallet hardness, velocity,
  pedal lock, room and volume.
- Perform shows the bar and its modes, and the tube and disc.

### Electric Grand 0.3.0
- Performance controls: velocity, felt hardness, piezo ↔ microphone, the
  preamp's bass, middle and treble, room and volume.
- Perform shows the slow-motion hammer and string, and the spectrum.

### Tonewheel Organ 0.3.0
- Performance controls: tube drive, room and volume, under the console
  (drawbars, percussion, vibrato, Leslie and swell), which stays in view.
- Perform shows the console and the Leslie.

### Tine Piano 0.3.0
- Performance controls: velocity, the suitcase's vibrato depth and rate,
  amp drive, speaker top end, room and volume.
- Perform shows the tine in slow motion and the spectrum.

### Reed Piano 0.3.0
- Performance controls: velocity, preamp drive, tremolo depth and rate,
  output, room and volume.
- Perform shows the reed in slow motion and the spectrum.

### Tangent Clavier 0.3.0
- Performance controls: velocity, the pickup selector, the four tone tabs,
  the mute, room and volume.
- Perform shows the string in slow motion and the spectrum.

### Sticky-Pad Piano 0.3.0
- Performance controls: velocity, tone, amplifier and its drive, room and
  volume.
- Perform shows the pad and reed in slow motion, and the spectrum.

### Viola Organista 0.3.0
- Performance controls: wheel speed, bow position, key pressure and travel
  time, dampers lifted, room and volume.
- Perform shows the string on the wheel and its stick–slip velocity.

### Glass Armonica 0.3.0
- Performance controls: finger pressure, skin moisture, treadle speed,
  room and volume.
- Perform shows the bowl and the spectrum.

### Pyrophone 0.3.0
- Performance controls: flame power, velocity, key-up flame, flame
  turbulence, room and volume.
- Perform shows the tube and the phase portrait.

### Huygens Keyboard 0.3.0
- Performance controls: pulse coupling, tuning (and just tonic), key
  attack and release, tone, room and volume.
- Perform shows the lamp firings and the locking map.

### Gong Keyboard 0.3.0
- Performance controls: dome rise, mallet stiffness, strike point,
  velocity, hand damping, room and volume.
- Perform shows the gong and the spectrogram.

### Black-Hole Keyboard 0.3.0
- Performance controls: spin, mass ratio, inclination, the inspiral, tone,
  room and volume.
- Perform shows the black hole and its gravitational waves.

### Quantum Keyboard 0.3.0
- Performance controls: potential, tempo, revival time, dephasing,
  velocity, room and volume.
- Perform shows the quantum carpet and the wavepacket.

### Bubble Organ 0.2.0
- Performance controls: nozzle depth, gas, bubbles per second,
  irregularity, velocity, room and volume.
- Perform shows the tank and the latest bubble.

## 2026-10-14 — pipe organ

### Pipe Organ 0.1.0
- New instrument, after the Baroque pipe organ: one manual, C–f³ (54
  keys), with Principal 8′, Octave 4′, Gedackt 8′ (stopped) and a Mixture
  III of octaves and pure fifths that breaks back at each c. Six pipes a
  key on Töpfer's normal scale, each a tube in modal form (open 1 : 2 : 3,
  stopped 1 : 3 : 5) with Levine & Schwinger's open-end correction, a mouth
  correction from Rayleigh's conductivity of the mouth (1.58 D for a
  diapason mouth), and wall and radiation losses (Q₁ from 127 to 24).
- **The jet:** the jet-drive model of Verge et al. and Fabre & Hirschberg.
  The jet leaves the flue at √(2p/ρ), is bent by the flow through the
  mouth, carries the bend across the cut-up at 0.4 × its speed (through a
  low-pass), splits on the labium as a tanh, and drives the pipe with the
  rate of change of the flow it puts in, less the vortex shedding at the
  labium. A linear analysis gives every pipe's speaking window in
  U_j/(fW) and its growth, which the engine matches (10 %, 3 ¢).
- **Playing:** every key on every stop speaks its fundamental at the
  default 700 Pa (half level within 410 ms, the bass slowest), tuned to
  ±0.4 ¢ in the engine. Velocity sets how fast the pallet opens: a fast
  one brings the upper modes in first, the chiff. More wind (or a lower
  cut-up) overblows the pipes to the octave (open) or twelfth (stopped),
  and they come back only far lower, at a fixed U_j/(fW).
- **The wind:** a reservoir, a trunk with air mass and a chest that every
  pipe drains, from steady (a Schwimmer) to flexible: big chords sag the
  wind and a flexible one rings at 5.5 Hz. The pitch hardly follows (5 %
  less wind: 0.35–2.2 ¢, least for high-Q pipes). A tremulant valve.
  Stereo from the C and C♯ sides of the chest.
- Views: the jet in the mouth in slow motion, pressure against flow at the
  mouth, the chest's wind, and the spectrum with the pipe's modes. Seven
  demos.

## 2026-10-14 — free-reed organ

### Free-Reed Organ 0.1.0
- New instrument, after the harmonium and the accordion: 61 keys (C2–C7),
  each with a reed in five ranks: 8′, the musette's two 8′s tuned sharp and
  flat (±12 ¢ by default), 16′ and 4′, each opened by its stop.
- **The reed:** a brass cantilever with a tuning weight at its tip below
  G3, in two bending modes, swinging through a close-fitting slot. The
  open area follows the tongue's height along its edges: the clearance
  while it overlaps the slot, the perimeter times the distance clear of it
  outside.
- **The air:** a jet through the gap with its own air mass (unsteady
  Bernoulli), a small cell fed through a throat from the reservoir, and the
  volume the tongue sweeps. The reed is a blown-closed valve driven by the
  inertia of the air that feeds it. A linear analysis gives every reed's
  threshold (22 Pa at C1 to 258 Pa at C8) and its growth rate, which the
  engine matches.
- **Playing:** every key speaks at the default 800 Pa within 90–260 ms,
  sooner with more wind, with a fast key (the pallet opens in 3–30 ms) or
  with Martin's percussion. The pitch falls slightly as the wind rises
  (−6 ¢ from 800 to 2500 Pa). Reeds are tuned at the playing wind to ±3 ¢
  across the keyboard.
- **The wind:** feeders into a spring-loaded reservoir (a ten-key chord
  sags it 3 %), the expression stop that bypasses it, foot pumping, and the
  bellows pressure on the mod wheel and aftertouch. An accordion's
  cassotto can be put round the reeds: a Helmholtz chamber that softens
  the upper harmonics.
- Integrated per sample with an implicit (Newton, BDF2) step for the air,
  reeds above 440 Hz at twice the sample rate. Views: the reed in its slot
  in slow motion, flow against displacement, the musette's beats, and the
  wind. Eight demos.

## 2026-10-14 — harpsichord

### Harpsichord 0.1.0
- New instrument, after a Flemish Ruckers double as rebuilt in France with
  a five-octave compass (FF–f³, 61 keys): three choirs of strings (front
  8′, back 8′ and 4′), iron from B♭ up and brass below, on a Ruckers-like
  scale (c² = 355 mm, Pythagorean in the treble, foreshortened to 1.65 m
  in the bass). Each string is a stiff string in modal form (up to 90
  partials, B from 6×10⁻⁶ to 8×10⁻⁴), tuned exactly through its
  inharmonicity at A = 440 or 415 Hz, in equal temperament, ¼-comma
  meantone or Werckmeister III.
- **The pluck:** each plectrum (Delrin or quill) is a tapered cantilever
  under the string. It catches the string, bends, and the string slides out
  along it against friction and its own sideways stiffness until it slips
  off the tip. The contacts (plectra, damper felts, buff pads) are solved
  implicitly every sample. Voicing (tip stiffness and overlap), friction,
  the plucking point of each row and the stagger between rows all change
  the release, and the comb filter of the plucking point.
- **Registration as on a French double:** upper manual (front 8′, and a
  lute row plucking the back 8′ strings by the nut), lower manual (back 8′
  and 4′), and a shove coupler; the buff stop presses leather pads on the
  back 8′ strings by the nut.
- **Key up:** the jacks fall; the plectra brush past on their tongues and
  the damper felts land, more gently the slower the key comes up (MIDI
  release velocity, sent by the page; other keys use a free drop). Key and
  jack knocks reach the board. Velocity barely matters, as on a real
  harpsichord: about 1 dB and a slightly brighter pluck on one choir.
- **The soundboard:** an equivalent orthotropic plate (77 modes) driven along
  the 8′ and 4′ bridges, draining each partial at its conductance there,
  and heard by two microphones (bass end left, treble end right); it can be
  switched off to hear the bridge force alone.
- Views: the pluck in slow motion (jack, bending plectrum, string and the
  force); the scale across the compass with every row's plucking point and
  the inharmonicity; the pluck's comb over the live spectrum. Eight demos.

### Forte 0.5.2
- MIDI release velocity reaches the engines: the shell's note-off carries
  it and `shared/worklet.js` passes it on as `noteOff(key, velocity)`
  (undefined when the keyboard sends none); `tools/audio-util.mjs`
  renders can give one too. The Harpsichord uses it for how fast the
  jacks fall.
- The root README lists the Vibraphone, Bubble Organ and Harpsichord as
  playable, and `docs/WORKSHOP.md` points their briefs at the instruments.

## 2026-10-14 — bubble organ

### Bubble Organ 0.1.0
- New instrument: a row of 52 nozzles (A3–C8) on the floor of a tank.
  Each key releases a gas bubble that rings at its Minnaert frequency;
  holding a key keeps the nozzle bubbling (a brook), at a set rate with
  seeded random gaps and a size spread.
- **Each bubble** is a linearised Rayleigh–Plesset oscillator with
  Prosperetti's complex polytropic index for heat flow in the gas (checked
  against Devin's 1959 real form and both asymptotes), surface tension,
  and Devin's thermal, viscous and radiation damping. The free surface
  above acts as an inverted image source: it raises the pitch of the big
  bubbles and stops them radiating, so the bass rings for a second.
- **The tank retunes the keyboard:** nozzle depth (p₀ = p_air + ρgh, pitch
  ∝ √p₀), the air pressure above the water (a partial vacuum takes it
  about an octave down, and ringing bubbles follow), the gas (air, helium,
  argon, SF₆: helium falls short of √γ in small bubbles, which lose heat)
  and the liquid (water, 90 % glycerol, glycerol, whose viscosity kills
  the treble but not the bass). **Keep in tune** re-sizes the bubbles
  instead.
- **The kick at pinch-off** is a pressure step, a share of the Laplace
  pressure 2σ/R, ramped over the neck's snap time and integrated exactly:
  every bubble starts at the same pressure, and a slow snap barely rings
  the small ones.
- Bubbles rise at their terminal speed, swell and glide in pitch as they
  go: a few cents down when deep, up as they near the surface, where they
  burst. Two hydrophones place each nozzle in stereo.
- Views: the tank with the bubbles rising to scale, coloured by pitch; the
  latest bubble's waveform against the model's envelope; Devin's damping
  constants and κ across the keyboard; the live spectrum. Seven demos.

### Forte 0.5.1
- `tools/loudness.mjs` finds every ready shell-based instrument from the
  registry, so a new instrument no longer needs a line there.

## 2026-10-14 — prior art and credits

### Forte 0.5.0
- **Prior art and credits.** A new page at `/credits/` (from
  `docs/PRIOR_ART.md`) credits the field Forte builds on:
  - the history of physical-modelling synthesis, from Kelly & Lochbaum
    (1962) and Hiller & Ruiz (1971) to today;
  - where each technique Forte uses comes from;
  - the algorithms and data in its shared code (with licences);
  - about 45 physical-modelling instruments and projects, commercial and
    open source;
  - earlier sonifications.
  About 90 references and 180 links, each checked against a DOI record,
  publisher, patent or official page. The landing page links to it.
- Every instrument's README, which is also its **How it works** notes, now
  ends with **Prior art and references**: the original instrument and its
  patents, the physics credited to its originators, and earlier models and
  syntheses (academic and commercial), all verified. Along the way:
  - several citations were corrected (titles, pages, years and
    attributions);
  - the viola organista's "first built in 2013" now credits the bowed
    keyboards built since Haiden's Geigenwerk (c. 1575);
  - the "new physics" section no longer implies its phenomena were never
    used for sound before.
- `test/site-tests.mjs` checks that each ready instrument's README ends with
  its prior art, and that the credits page is linked. The instrument guide
  and template ask for it.
- The How it works renderer accepts link targets with parentheses, as many
  DOIs have.

### Glass Armonica 0.2.1
- The model's comment cites Rayleigh's spherical-shell pages (vol. 1,
  pp. 395–420), not the sections on bells.

### Black-Hole Keyboard 0.2.1
- The model's comment credits the amplitude fits in the form used here to
  Gossan, Veitch & Sathyaprakash (2012).

## 2026-10-14 — vibraphone

### Vibraphone 0.1.0
- New instrument, after the Deagan vibraharp (1927): 37 aluminium bars,
  F3–F6, over stopped resonator tubes, with a motor turning a butterfly
  disc in every tube's mouth.
- **Bars:** each bar's arch-shaped undercut is shaped by a Timoshenko
  beam finite-element model so that its first three bending modes sit at
  1 : 4 : 10 (every key within 0.01 ¢ in the model; a plain bar rings at
  1 : 2.76 : 5.40). Bending modes 4 and 5 and two torsional modes come
  along untuned. Losses from the aluminium, heat flow across the bar
  (Zener), the cords at mode 1's nodes, and the bar's own radiation.
- **Resonators:** bar mode 1 and the tube's quarter-wave mode are two
  oscillators sharing the air in the gap. Pressed close they split and
  trade energy (beats); at the default gap the tube draws the bar's energy
  out as sound: the fundamental is 12–34 dB louder, swells for up to
  0.35 s after the strike, and the bar's ring drops from a minute or less
  (13 s at F6) to a few seconds.
- **Motor:** a disc closing the mouth adds end correction, which detunes
  the tube and weakens its coupling. The tremolo runs at twice the shaft
  speed (1–12 Hz), the shaft spins up and parks open or closed, and the
  discs' phase can step along the shaft and between the naturals' and
  accidentals' shafts.
- **Mallets:** a yarn head on the bar as an implicit, energy-consistent
  Hertz-type contact (F = Kδ^2.3): hardness, mass, speed, and where it
  lands along and across the bar.
- **Damper:** a felt bar on every bar unless the pedal (Space, CC64) is
  down or the key is held; also a pedal lock. Air temperature detunes
  tubes and bars.
- Views: the bar to scale with its undercut and live mode shapes; the
  tube's standing wave, the disc and the coupling over one turn, with the
  energy in bar and tube; the live spectrum with the model's lines; and a
  mode table. Eight demos.

### Forte 0.4.1
- `tools/encode-examples.mjs` encodes demos with ffmpeg where macOS
  `afconvert` is missing (Linux, cloud sessions).
- `tools/loudness.mjs` measures the Vibraphone.
- The instrument guide no longer says to tag releases.

## 2026-10-14 — how it works

### Forte 0.4.0
- Every instrument page has **How it works** next to its name: the
  instrument's README (its physics, equations, numbers, sources and
  simplifications) in a dialog, without leaving the page. On a phone it
  fills the screen, and the button is an ⓘ.
  - Contents chips jump to each section. Equations are shown as display
    lines, tables scroll sideways when they are wide, and links to the
    source go to GitHub. The README's *Files* section, for developers, is
    left out.
  - Keys pressed while reading scroll the notes instead of playing the
    instrument; Escape, **Close** or a click outside closes them.
  - A link to `…/#about` opens an instrument with its notes showing. Each
    card on the landing page has a **How it works** link.
  - The instrument's version (and its changelog link) moved from the
    header into the notes, which makes room for the button: no header
    gains a row, and on an iPad the organ's and the Pianet's lose one.
    Below 1250px wide the button is just its ⓘ.
- `shared/markdown.js` renders the READMEs: a small Markdown renderer with
  no dependencies. Its output matches the `marked` library's text and
  inline markup for every README. `test/notes-tests.mjs` checks the
  renderer and renders every README.
- Tests: the Tine Piano's 20-voice timing test is now named like the other
  timing tests (`CPU: …`), so CI skips it too. It had failed once on a
  slow shared runner.

## 2026-10-14 — the workshop

### Forte 0.3.2
- Ten instruments added to the workshop (shown on the landing page and in
  the menus), each with a build brief in `docs/WORKSHOP.md`:
  - from history: Harpsichord, Pipe Organ, Carillon, Vibraphone,
    Free-Reed Organ and Duddell's Singing Arc;
  - new: Star Keyboard, Wind Harp, Bubble Organ and Spring Keyboard.

## 2026-10-14 — phones

### Forte 0.3.1
- Instrument pages lay out properly on an iPhone. In portrait they
  squeezed every view into a sliver between a three-row header and the
  keyboard; in landscape the views got no room at all.
  - On phones the page scrolls, so Safari can tuck its toolbars away, and
    the keyboard sticks to the bottom. Views keep their full size (two to
    a row in landscape), and wide tables scroll inside their card.
  - The header is two rows in portrait and one in landscape: the
    instrument's name shortens to fit, and the CPU meter takes the place
    of **Start audio** once the audio is on.
  - **Controls** replaces the views instead of sliding over a sliver of
    them, with **Close** kept in reach while you scroll.
  - The **Instruments** and **Views ▾** menus open inside the screen.
  - Keys are at most 38 % of the screen's height, and a phone starts with
    two octaves, not three.
- iPhone and iPad have no Web MIDI in any browser, so the MIDI button,
  status and hints are hidden there.
- iOS: no text inflation in landscape, no zoom when a dropdown is tapped,
  no pull-to-refresh mid-phrase on a phone, and the landing page and
  instrument pages keep clear of the notch in landscape.
- Toasts sit just above the keyboard and its tools, however they wrap.

## 2026-10-13 — review fixes

An adversarial review of the whole project (six reviewers, one per area)
found the bugs and inaccuracies below; each fix has a regression test.

### Forte 0.3.0
- **Level matching:** every instrument is trimmed (registry `trim`) to about
  −23 LUFS for one default note. The spread was 22 LU. The black hole stays
  a little quieter so its short chirps keep their headroom.
  `tools/loudness.mjs` measures this, and `test/level-tests.mjs` enforces it.
- **Start-up ordering:** messages queue in order until the audio context has
  resumed, so a quick first note-off can't overtake its note-on (shell and
  the five older pages).
- **Engine failures:** an exception or a non-finite sample in any engine
  zeroes the block, stops the voices and shows a message
  (`shared/guard.js`), instead of silencing the page or poisoning the reverb.
- **Touch aftertouch:** pressure from a held key (Apple Pencil, or sliding
  the finger toward you) reaches the engines as polyphonic aftertouch.
- **Stale caches:** a page that loads a mix of cached old and new files right
  after an update offers a reload that refreshes them (`shared/boot.js`).
- **Demos match the live mix:** render tools scale impulse responses as the
  browser's ConvolverNode does. Demos were about 9 dB too wet, and the piano
  soundboard 16 dB too strong.
- **Keyboard and pedal:** releasing a held Space bar when the window loses
  focus. Dropdowns no longer swallow note keys. Checkboxes no longer disable
  the arrow keys.
- **MIDI mod wheel:** rest is the parameter's default (with an optional
  range); it used to pull some instruments to the bottom of their range.
- **Saved state:** stored settings and layout preferences are validated.
- **Smaller fixes:** canvases no longer reset every frame at fractional
  pixel ratios; the CPU pill shows the worst block where the audio thread
  has a fine clock; screen-reader values on sliders; toasts stay clear of
  the keys.
- **Tests:** `npm test` runs every suite in parallel and reports all
  failures. A site test checks presets against their parameters. Timing
  tests skip on CI, where they had been failing on slower shared machines
  since 0.2.

### Pyrophone 0.2.0
- No NaN at maximum bore and damping: overdamped tube modes now take an
  exact cosh/sinh step.
- Flame power is set as a multiple of each tube's threshold, with a ceiling
  below the scream. A wide bore or heavy damping no longer silences every
  key, and low damping no longer screams. Presets keep their sound. The
  stored setting was renamed, so old saved values are discarded rather than
  misread.
- Released tubes that keep singing no longer drift flat: warm-up follows the
  singing, not the key.

### Gong Keyboard 0.2.0
- No energy runaway: the reviewer's settings peaked at 34× full scale, now
  about 1.1. Forcing is weighted so the scheme conserves the physical
  energy, substep changes are energy-neutral, and passivity is checked every
  step.
- When the nonlinear-voice cap demotes a gong it keeps its pitch, instead of
  snapping from a +180–570 ¢ glide back to 0.
- Physical energy is now conserved within a few percent (it grew 1.7–2.6×).
- Coupling tables are built on the page, not on the audio thread (a slider
  tick cost up to 4.9 ms there).
- The "Clamped" rim is relabelled: it is free to slide in its plane, which
  is why it isn't less nonlinear.

### Quantum Keyboard 0.2.0
- Always in tune: when the tempo lock would need an impossible n̄, the pitch
  stays exact and the revival is flagged as off the beat. Some keys were
  more than an octave out.
- No DC thump at the start of Electrode notes.
- A pair budget across voices: 24 hydrogen voices took 66 % of a core, now
  32 %.
- README: the fractional-revival harmonics for even q, and revival rates
  versus times, corrected.

### Electric Grand 0.2.0
- New **stretch tuning** (on by default): each octave's 2:1 partials
  coincide, as a tuner would set them (−12 ¢ at E1, +25 ¢ at E7). Unstretched,
  the C6–C7 octave beat at 15 Hz.
- High partials drain into the bridge at the right rate (an implicit
  bridge solve; it was 31 % slow at 15 kHz).
- Above 6 kHz the soundboard radiates through a residual path, instead of
  draining the strings silently.
- The microphones no longer cancel in mono: a phase-convention error put the
  mic path 12 dB down; it now matches the README's −4 dB.
- Re-striking a ringing note no longer doubles its voice.
- A 60 ms hammer repetition limit.
- CPU roughly halved: dead partials stop being computed, and the voice
  budget adapts to measured load, with a lower ceiling on tablets.

### Reed Piano 0.2.0
- The C(y) table now covers ±5.8 mm, with the frame as an end stop: a light
  reed at ff swung off the table and through the frame.
- No clicks when the gap, reed height or output is changed while notes
  sound.
- Re-striking a ringing note no longer doubles its voice.

### Sticky-Pad Piano 0.2.0
- Re-pressing a key with the sustain pedal down plays again: the pad
  drops, re-tacks and plucks. It used to be silent.
- The magnetic pickup's level no longer depends on the sample rate.
- Its pole-gap law corrected to a fixed magnet MMF (Φ₀ ∝ 1/(ℓ+g)), with the
  gaps re-voiced.
- No clicks when knobs move.
- Preset levels evened out.

### Tangent Clavier 0.2.0
- The rubber-tip and tip-width sliders no longer detune held notes (+32 ¢ at
  the "Soft tips" setting).
- Pickup flux is bounded beyond one field depth, and output scales with the
  gap, so a 2 mm gap no longer peaks at 1.4.
- No main-thread hitch after bass notes: released frequencies are cached,
  and the slow-motion simulation runs only while its view is visible.
- The release-pitch readout shows the coupled eigenvalue (−307 to −320 ¢,
  not the ideal −300).
- README glide figures corrected (touch matters about 4× at F1).
- Gain smoothed per sample; the mute felt is drawn when Space engages it.

### Viola Organista 0.2.0
- No more NaN: a string whose loop filter would have gone non-passive
  (β at its minimum, low losses) took the whole instrument down until Panic.
  Now it gets a flat gain, plus a per-string guard. Tested on all 49 keys
  at every extreme, at 44.1, 48 and 96 kHz.
- No DC offset or thump at key down and up: plate radiation now uses −a/ω,
  which is zero for static deflection.
- In tune at 44.1 kHz as well as 48 kHz (worst 0.89 ¢).
- Four wheels (per-register speed and bow position), and the strings damp
  the board: the keyboard's level span narrows from 19 dB to 12 dB.
- The mod wheel now drives treadle speed, the instrument's real swell, with
  a 0.5 s flywheel.

### Glass Armonica 0.2.0
- "Dry fingers" now gives a faint rubbing whisper instead of near silence.
- The "Pressing hard" preset is re-voiced (it was 16–19 dB louder than the
  defaults).
- Mod wheel: treadle 0.5–1 rev/s (beyond about 1.2 rev/s the big bowls stop
  speaking).
- README speaking times corrected.

### Ribbon Piano 0.2.0
- The top octave and a half is now audible: a refit treble hammer, with
  felt no longer extrapolated past C7. C6–C8 is within 7 dB of C4 at mf
  (it was 16–34 dB down).
- High partials now decay at the model's rate: they were damped too little,
  by 9 % at 5.7 kHz and 35 % at 12 kHz. The test now measures the engine's
  decay rates instead of checking the formula against itself.
- New chords no longer lose notes to voice stealing.
- Strike offset on tapered ribbons uses the width under the hammer.
- "Ribbon, edge-on" no longer computes an inaudible mode family (CPU
  20 % → 5 %).
- No zipper noise on bridge force or stereo spread.
- Next-note controls say so.
- New **una corda** (MIDI CC67 or a checkbox): the hammers strike 2 of 3
  strings, bringing out Weinreich's aftersound.

### Tonewheel Organ 0.2.0
- The tube drive no longer turns into a high-gain half-wave rectifier (a
  10-key chord at full drive peaked at 13; now 0.37).
- The Leslie horn can no longer sweep through the microphones.
- No zipper noise on expression.
- New on-screen **swell pedal** in the console, for tablets.
- No allocation on the audio thread.
- README: the vibrato's extra swing comes from per-tap phase ripple at the
  terminations, not ladder dispersion (the test now checks the median
  swing); busbar-loading label and gear-beat numbers corrected.

### Tine Piano 0.2.0
- The pickup controls (gap, vertical voicing, pole radius) act on sounding
  notes.
- The pickup-waveform view is no longer NaN for E1–C♯2.
- New chords no longer lose notes to voice stealing.
- No zipper noise on speaker, drive or vibrato.

### Huygens Keyboard 0.2.0
- Default coupling raised to 5.5 %: at 4.5 % no coupling could lock the
  minor sixth, so C–E–G–C′ and its inversions never went just. Now all
  nine tested voicings lock at C2–C5. The trade-off is documented: a bare
  semitone pair merges into a unison from 4.6 %. A "Weaker (4.5 %)" preset
  keeps the old behaviour.
- The Arnold-tongue staircase is now the exact, deterministic lock map
  (tongue edges (p−δ)/q ≤ r ≤ p/(q−δ)) instead of a random 0.5 s
  simulation that under-reported the fifth and fourth.
- README corrected: kicks below threshold leave no trace, there is no chaos
  between tongues, and supply voltages only rescale δ. Capture times are now
  bounded and documented.
- No more low thump on release (keyed output with a 15 Hz coupling
  capacitor).
- Lock detection from shared firings (no flicker in the bass).
- Stereo width updates sounding notes.
- The worklet posts state at ≤ 30 Hz (it took 25 % of DSP time), and views
  redraw only on change.

### Black-Hole Keyboard 0.2.0
- No notch at the chirp→ringdown handover (phase and amplitude matched).
- The inspiral control is now "octaves below ISCO" (part of the old range
  did nothing), and inspirals last at most 2 s.
- QNM table regenerated with deeper continued fractions: (2,−2,2) at
  a = 1 − 10⁻⁶ was 14 ¢ off. Interpolation uses one-sided end slopes, so
  errors are ≤ 0.021 ¢ almost everywhere, against up to 3.5 ¢ near a = 0.
- Voice stealing fades the quietest voice instead of cutting the oldest.
- The strain view is evaluated in closed form once per frame, with no
  2.5 s offline render on every key.
- README corrected: GW150914's remnant (62 M☉, ≈ 250–270 Hz, near middle C),
  the range of the excitation model, and the l ≠ m quality factors.
- New m < 0 reference values (Berti, Cardoso & Will 2006).

## 2026-10-13 — gong performance

### Gong Keyboard 0.1.1
- Performance pass for tablets. The worst 128-sample block in a loud
  pedalled melody fell from 77–213 % of its time budget to under 50 %.
  Average load roughly halved, and the first strike no longer stalls.
- The hot paths are warmed up and the buffers allocated before audio
  starts; voice fields keep fixed types, so the JIT doesn't de-optimise
  mid-note.
- New *Nonlinear voices* control (default 4). Gongs past the cap keep
  ringing linearly instead of being cut.
- A more robust switch to the linear fast path, and quiet tails use only
  their strongest couplings.
- Substeps capped. New `tools/bench-gongs.mjs` and a worst-block test.

## 2026-10-13 — new instruments

### Gong Keyboard 0.1.0
- Every key a free or clamped circular plate: 41 Bessel modes with sparse
  von Kármán coupling (angular selection rules).
- Optional shallow-shell dome, so flat gongs glide down and domed ones
  glide up.
- Exact modal recursion with an energy-stable scalar-auxiliary-variable
  nonlinearity.
- Hertz mallet, thermoelastic, internal and radiation losses.
- Views: gong surface, spectrogram, energy cascade.
- Known: heavy on CPU when many loud gongs ring at once.

### Viola Organista 0.1.0
- After Leonardo's design: steel strings bowed by a rosined wheel. Each
  string is a lossy waveguide with torsion, driven by the hyperbolic
  friction curve solved implicitly, with rosin lag and grain noise.
- A shared bridge and spruce soundboard (sympathetic strings, radiation).
- Schelleng bounds measured against theory.
- Strings tuned so the *bowed* pitch is in tune.
- Treadle speed, key pressure and aftertouch on bow force; dampers-lifted
  switch.
- Views: travelling Helmholtz corner, live Schelleng diagram, attack map.

### Forte 0.2.1
- ↑/↓ step a log-scale parameter by a fixed fraction of its range, instead
  of a fixed amount (finer control of key pressure at the low end).

### Glass Armonica 0.1.0
- After Franklin's armonica: hemispherical bowls with Rayleigh's
  inextensional shell modes (n = 2–6). Wall thickness solved for pitch
  comes out at Franklin's "tenth of an inch".
- Mode doublets integrated in the rotating bowl's frame, with Coriolis
  coupling (Bryan effect) and an adjustable split.
- A wet-skin finger pad with Stribeck friction, solved implicitly.
- Treadle speed, water loading (French), and sphere-harmonic radiation to
  two microphones.

### Tangent Clavier 0.1.0
- After the Hohner Clavinet D6: the rubber tangent strikes the string and
  clamps it on the anvil (coupled Hertzian contacts, Newton-solved).
- Speaking and yarn-damped segments of the string; release thunk.
- Key pressure / aftertouch raises the tension (ΔT = EA·ΔL/L).
- Kirchhoff–Carrier pitch glide in the bass.
- Upper and lower pickups (A, B, A+B, A−B), the four tone tabs, and the
  felt mute bar on Space.

### Quantum Keyboard 0.1.0
- Each key launches a Gaussian wavepacket, summed exactly over eigenstates
  with exact dipole matrix elements.
- Five wells: infinite square, Morse, hydrogen Rydberg, quantum bouncer and
  harmonic oscillator.
- What you hear is the electrode, coil or antenna signal (⟨x⟩, ⟨ẋ⟩, ⟨ẍ⟩).
- Revivals land on the beat (n̄ solved per key) and are sample-accurate.
- T₁ decay and pure dephasing.
- Quantum carpet, packet, return-probability and spectrum views.

### Pyrophone 0.1.0
- After Kastner's flame organ: each key is a Galerkin Rijke tube (10
  open–open modes) driven by a lagged King's-law heat source.
- A subcritical Hopf bifurcation, so tubes are bistable and notes
  "remember having sung"; the hysteresis thresholds match harmonic balance.
- Slow self-excited onsets and warm-up pitch drift (c ∝ √T).
- Bifurcation diagram, tube and phase-portrait views.

### Reed Piano 0.1.0
- After the Wurlitzer 200A: solder-tuned steel reeds (finite elements with
  tip mass and rotary inertia) and an energy-conserving felt hammer.
- An electrostatic pickup whose C(y) comes from solving Laplace's equation
  in the comb slot, with the RC feed network (constant charge to constant
  voltage) and the field's pull on the reed.
- Preamp clipping, LED/photocell tremolo, built-in speakers or direct out.

### Electric Grand 0.1.0
- After the Yamaha CP-70: stiff strings scaled to the CP-70 (one string per
  note in the bass, two above), each in two polarisations with Weinreich
  double decay.
- Felt hammers with nonlinear contact.
- A piezo pickup that senses the bridge force, with the preamp's
  high-pass and EQ, or, for comparison, a modal soundboard radiating to two
  microphones.

### Sticky-Pad Piano 0.1.0
- After the Hohner Pianet: reeds plucked by tacky pads, with release set
  by rate-dependent adhesion (Kendall flat-punch fracture).
- The pad chokes the reed when it lands again.
- Solder-tuned reeds solved by finite elements.
- Magnetic (Pianet T) or electrostatic (Pianet N) pickup.

## 2026-10-13 — tablets

### Forte 0.2.0
- Tablet-friendly layout on every instrument page:
  - the page fills the screen, with the keyboard pinned to the bottom;
  - a **Controls** toggle: a column on wide screens, a slide-over panel on
    narrow ones;
  - a **Views ▾** menu to show or hide each visualisation;
  - hiding everything leaves a full-screen keyboard;
  - choices are remembered per instrument.
- A shared on-screen keyboard (`shared/keyboard.js`):
  - multi-touch chords and glissando;
  - velocity from where you strike the key, or from Apple Pencil pressure;
  - a 2–5-octave window with ◀ ▶, and four key sizes.
- An on-screen pedal button for whatever Space does (sustain, hold,
  Leslie speed), with a latch.
- iOS:
  - an AudioContext created on a touch is resumed;
  - audio plays through the silent switch;
  - bigger touch targets, no long-press callouts, and safe areas for the
    notch and home bar.
- An app icon and web manifest, so Forte can be added to the home screen
  and run full-screen.
- Hidden views are no longer drawn, which saves battery.
- A drawing error can no longer stop a page's animation.

### Ribbon Piano 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Tonewheel Organ 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.
- The Leslie view no longer throws when its canvas is very small.

### Tine Piano 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Huygens Keyboard 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

### Black-Hole Keyboard 0.1.1
- Uses the shared multi-touch keyboard and tablet layout; skips drawing hidden views.

## 2026-10-13 — first release

### Forte 0.1.0
- Landing page, one page per instrument, instrument menu, and a version
  on every page.
- Shared page shell (keyboard, MIDI with velocity, sustain, aftertouch and
  pitch bend, parameter sidebar, presets), a generic AudioWorklet, DSP and
  view helpers, a template instrument and `tools/new-instrument.mjs`.
- Compressed audio demos, `npm test`, CI on every push, MIT license.

### Ribbon Piano 0.1.0
- Stiff strings in modal form with a nonlinear felt hammer and a shared
  bridge.
- String cross-sections: round, square, triangular, flat ribbon and
  tapered ribbon, with torsion.

### Tonewheel Organ 0.1.0
- Hammond B-3 generator with gear ratios and shared wheels.
- Contact bounce and busbar loading; single-trigger percussion.
- LC-ladder scanner vibrato, tube drive, and a Leslie 122 with Doppler
  horn and drum.

### Tine Piano 0.1.0
- Rhodes-style tine and tone bar as a finite-element asymmetric tuning
  fork.
- Neoprene and felt hammers, nonlinear electromagnetic pickup.
- Suitcase tremolo and amp.

### Huygens Keyboard 0.1.0
- Pulse-coupled neon relaxation oscillators that lock chords into just
  intonation.
- Live Arnold-tongue and devil's-staircase views.

### Black-Hole Keyboard 0.1.0
- Kerr quasinormal modes from Leaver's continued fractions.
- Spin-weighted spherical-harmonic radiation pattern, merger chirp, and
  h₊/h× in stereo.
