# Forte

**Keyboard instruments built from physics.** Play them at
**<https://forte.jthaler.net>**. Vibe coded by Jesse Thaler.

Every sound in Forte is computed live in the browser from the equations of
motion of its instrument: stiff strings and felt hammers, gear-driven
tonewheels, steel tines in a magnetic field, neon lamps that pull each
other into tune, black holes ringing down. There are no samples. You play
with the computer keyboard or a MIDI keyboard, and you can turn the knobs
that real instruments hide: the shape of the string, where the hammer
lands, the pickup's offset, how fast the black hole spins.

## Instruments

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Ribbon Piano](piano/) | the concert grand | modal stiff strings, nonlinear felt hammers, a shared bridge; strings swappable for square/triangular bars and twisting ribbons |
| ✅ | [Tonewheel Organ](organ/) | Hammond B-3 + Leslie 122 | gear ratios and shared wheels, contact bounce, LC-ladder scanner vibrato, rotating Doppler horn and drum |
| ✅ | [Tine Piano](tines/) | Fender Rhodes | finite-element tine + tone bar as an asymmetric tuning fork, nonlinear electromagnetic pickup |
| ✅ | [Electric Grand](grand/) | Yamaha CP-70 | short stiff strings in two polarisations, a piezo under the bridge (or a soundboard, for comparison) |
| ✅ | [Reed Piano](reeds/) | Wurlitzer 200A | solder-tuned steel reeds, an electrostatic pickup whose capacitance comes from Laplace's equation, photocell tremolo |
| ✅ | [Tangent Clavier](clavier/) | Hohner Clavinet D6 | tangent strikes and clamps the string on an anvil (Hertzian contacts), pressure bends the pitch, four pickup combinations, tone tabs, mute bar |
| ✅ | [Sticky-Pad Piano](pianet/) | Hohner Pianet | reeds plucked by rate-dependent adhesion (fracture mechanics of the pad), magnetic or electrostatic pickup |
| ✅ | [Viola Organista](bowed/) | Leonardo da Vinci (1488) | strings bowed by a rosined wheel: implicit stick–slip friction, Helmholtz motion, live Schelleng diagram, sympathetic strings on a shared soundboard |
| ✅ | [Glass Armonica](glass/) | Benjamin Franklin (1761) | wet-finger stick–slip on Rayleigh shell modes; split doublets warble as the bowls turn (Bryan effect); water loading |
| ✅ | [Pyrophone](pyrophone/) | Frédéric Kastner (1873) | flame-driven Rijke tubes on a subcritical Hopf bifurcation: slow self-excited onsets, hysteresis, warm-up drift |
| ✅ | [Harpsichord](harpsichord/) | Flemish double-manual (Ruckers) | plectra as tapered cantilevers that catch, bend and slip off stiff strings (implicit contacts with friction); three choirs, coupler, buff and lute stops, a modal soundboard |
| 🛠 | Pipe Organ | Baroque organ | jet–edge feedback in flue pipes, chiff, overblowing, wind sag |
| 🛠 | Carillon | Flemish carillon (Hemony) | bell shell modes and the strike note: a pitch not in the spectrum |
| ✅ | [Vibraphone](vibraphone/) | Deagan vibraharp (1927) | undercut bars tuned 1 : 4 : 10 by finite elements, each coupled to a stopped tube; motor-driven discs open and close the tubes (tremolo) |
| ✅ | [Free-Reed Organ](harmonium/) | harmonium and accordion | brass reeds driven through their slots by the inertia of the air that feeds them (implicit reed–air coupling, thresholds from a linear analysis); musette, 16′ and 4′ ranks, reservoir and expression stop, cassotto |
| 🛠 | Singing Arc | Duddell's singing arc (1900) | negative-resistance arc driving an LC circuit; the arc is the loudspeaker |
| ✅ | [Huygens Keyboard](huygens/) | — | pulse-coupled relaxation oscillators that lock chords into just intonation (Arnold tongues) |
| ✅ | [Black-Hole Keyboard](blackhole/) | — | Kerr quasinormal modes from the Teukolsky equation, h₊ and h× in stereo |
| ✅ | [Gong Keyboard](gongs/) | — | von Kármán plates and shallow shells in modal form (energy-stable SAV scheme): bell → shimmer → crash with how hard you strike, pitch glides down (flat) or up (domed) |
| ✅ | [Quantum Keyboard](quantum/) | — | exact wavepackets in square, Morse, hydrogen-Rydberg, gravitational and harmonic wells: collapse, fractional and full revivals, decoherence |
| 🛠 | Star Keyboard | — | asteroseismology: stochastically driven p-modes, échelle combs, rotation splitting |
| 🛠 | Wind Harp | — | vortex shedding locking onto string harmonics, with hysteresis |
| ✅ | [Bubble Organ](bubbles/) | — | Minnaert bubbles with heat flow, radiation and viscosity; the free surface above raises the pitch; depth, pressure, gas and liquid retune the keyboard |
| 🛠 | Spring Keyboard | — | dispersive waves on helical springs: every note a chirp |

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
**Enable MIDI** connects a MIDI keyboard (Chrome, Edge and Firefox; no
browser on iPhone or iPad has Web MIDI, so the button is hidden there),
including velocity, the sustain pedal, aftertouch and, where it means
something, the mod wheel.

**On a tablet or phone**, play the on-screen keys with as many
fingers as you like. Slide across the keys for a glissando, and strike
lower on a key, or press harder with an Apple Pencil, to play louder. ◀ ▶
move the octave window, and the pedal button next to them stands in for
`Space`. **Controls** and **Views ▾** in the header choose what is on
screen; hide everything for a full-screen keyboard. On a phone the page
scrolls above the keys, which stay put; turn it sideways for wider keys.
Use *Share → Add to Home Screen* to run Forte as a full-screen app.

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
examples/<instrument>/       rendered demos (.m4a)
docs/INSTRUMENT_GUIDE.md     how to build a new instrument
docs/WORKSHOP.md             briefs for the instruments in the workshop
docs/template/               the starting point (struck bars)
```

To add an instrument, run
`node tools/new-instrument.mjs <slug> <EngineName> "<Name>"` and follow
[docs/INSTRUMENT_GUIDE.md](docs/INSTRUMENT_GUIDE.md).

## Versions

Forte and each instrument carry their own
[semantic version](https://semver.org), shown on each page and on the
landing page. They are listed in `shared/registry.js` (and in
`package.json` for Forte), logged in [CHANGELOG.md](CHANGELOG.md), and
tagged in git as `forte-vX.Y.Z` or `<instrument>-vX.Y.Z`. Everything is
pre-release (0.x) for now:

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

[MIT](LICENSE) © 2026 Jesse Thaler. Instrument names such as Hammond,
Leslie, Rhodes, Wurlitzer, Clavinet, Pianet and Yamaha are trademarks of
their owners. Forte's instruments are physical models inspired by them and
are not affiliated with or endorsed by those companies.
