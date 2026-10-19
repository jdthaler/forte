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

The front page sorts them into four kinds, as here.

### Traditional instruments

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Ribbon Piano](piano/) | the concert grand | modal stiff strings, nonlinear felt hammers, a shared bridge; strings swappable for square/triangular bars and twisting ribbons |
| ✅ | [Harpsichord](harpsichord/) | Flemish double-manual (Ruckers) | plectra as tapered cantilevers that catch, bend and slip off stiff strings (implicit contacts with friction); three choirs, coupler, buff and lute stops, a modal soundboard |
| ✅ | [Pipe Organ](pipes/) | Baroque organ | flue pipes as tubes in modal form driven by a delayed, amplified jet that splits on the labium (jet drive with vortex shedding; speaking windows from a linear analysis): chiff with the pallet's speed, overblowing with hysteresis; Principal, Octave, stopped Gedackt and Mixture; a wind chest that sags and breathes, tremulant |
| ✅ | [Free-Reed Organ](harmonium/) | harmonium and accordion | brass reeds driven through their slots by the inertia of the air that feeds them (implicit reed–air coupling, thresholds from a linear analysis); musette, 16′ and 4′ ranks, reservoir and expression stop, cassotto |
| ✅ | [Vibraphone](vibraphone/) | Deagan vibraharp (1927) | undercut bars tuned 1 : 4 : 10 by finite elements, each coupled to a stopped tube; motor-driven discs open and close the tubes (tremolo) |
| ✅ | [Carillon](carillon/) | Flemish carillon (Hemony) | bronze bells solved by axisymmetric finite elements and tuned by their profile (minor- or major-third), struck by a Hertzian clapper; doublets that warble with asymmetry and strike angle; air absorption over distance; the strike note found by subharmonic summation |
| ✅ | [Kalimba](kalimba/) | Hugh Tracey's kalimba and the mbira | spring-steel tines as clamped–supported–free beams (the length behind the bridge sets the overtones), plucked from their static deflection by a thumb that lets go slowly or fast; a box whose top and sound-hole air are two coupled oscillators (cover the hole for a wah); bottle caps that rattle once the top outruns gravity |

### Electric instruments

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Electric Grand](grand/) | Yamaha CP-70 | short stiff strings in two polarisations, a piezo under the bridge (or a soundboard, for comparison) |
| ✅ | [Tonewheel Organ](organ/) | Hammond B-3 + Leslie 122 | gear ratios and shared wheels, contact bounce, LC-ladder scanner vibrato, rotating Doppler horn and drum |
| ✅ | [Tine Piano](tines/) | Fender Rhodes | finite-element tine + tone bar as an asymmetric tuning fork, nonlinear electromagnetic pickup |
| ✅ | [Reed Piano](reeds/) | Wurlitzer 200A | solder-tuned steel reeds, an electrostatic pickup whose capacitance comes from Laplace's equation, photocell tremolo |
| ✅ | [Tangent Clavier](clavier/) | Hohner Clavinet D6 | tangent strikes and clamps the string on an anvil (Hertzian contacts), pressure bends the pitch, four pickup combinations, tone tabs, mute bar |
| ✅ | [Sticky-Pad Piano](pianet/) | Hohner Pianet | reeds plucked by rate-dependent adhesion (fracture mechanics of the pad), magnetic or electrostatic pickup |

### Experiments from history

| | Instrument | after | the physics |
|---|---|---|---|
| ✅ | [Viola Organista](bowed/) | Leonardo da Vinci (1488) | strings bowed by a rosined wheel: implicit stick–slip friction, Helmholtz motion, live Schelleng diagram, sympathetic strings on a shared soundboard |
| ✅ | [Glass Armonica](glass/) | Benjamin Franklin (1761) | wet-finger stick–slip on Rayleigh shell modes; split doublets warble as the bowls turn (Bryan effect); water loading |
| ✅ | [Pyrophone](pyrophone/) | Frédéric Kastner (1873) | flame-driven Rijke tubes on a subcritical Hopf bifurcation: slow self-excited onsets, hysteresis, warm-up drift |
| ✅ | [Singing Arc](arc/) | William Duddell (1900) | Ayrton's falling arc characteristic with a Mayr-type thermal column driving Duddell's tuned circuit: each note grows at the rate a linear analysis gives and sounds about 1 % below Kelvin's formula; a floor from the hot carbons holds the first kind, a higher re-strike voltage the second; capacitors in parallel on one arc, several lamps, hiss, Simon's talking arc; the arc radiates as a thermophone, ∝ dP/dt |

### Instruments only physics can build

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
| ✅ | [Storage Ring](ring/) | a particle accelerator's storage ring heard through a beam pickup: a Gaussian bunch's pulse train at the revolution frequency, betatron sidebands at (n ± Q)·f_rev after an injection kick, decoherence by chromaticity that recoheres every synchrotron period and by octupole amplitude detuning that never does (Meller et al.'s closed forms, checked against tracked particles); RF voltage under key pressure, adiabatic bunch shortening, radiation damping, two-button or difference pickups |
| ✅ | [RF Cavity Bells](cavity/) | superconducting accelerator cavities rung by a passing bunch: nine coupled pillbox cells whose passband beats (Nagle, Knapp & Knapp's circuit model), higher-order modes at Bessel-zero ratios for a bell's partials, kicks from the transit-time integral, offset and bunch-length form factors; input and HOM couplers, BCS surface resistance against the helium bath, beam loading from a bunch train, Lorentz-force detuning through the walls' mechanical mode, quench and recovery |

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
including velocity (with a Soft, Normal or Hard curve), the sustain,
sostenuto and soft pedals, aftertouch and, where it means something, the
mod wheel and pitch bend. Once MIDI is on, every other instrument page
turns it on by itself.

**Latency:** play through wired headphones or speakers. Bluetooth ones
delay every note by 100–200 ms, enough to make any instrument feel
sluggish; a page warns you once when the browser reports that much (Safari
doesn't report it). The browser's own audio buffer adds about 10–30 ms, and
a computer keyboard a few more than a MIDI keyboard. For the least delay,
play the plugins in a DAW with a small buffer.

Each instrument page reads top to bottom. At the top, the instrument's
name opens the menu of every instrument (and Forte's home page), next to
**How it works** and the mode. In the middle are the views,
pictures of the physics as it plays: the main ones large, the rest behind
tabs underneath. At the bottom, right above the keys, are the controls a
player reaches for (stops and registrations, tremolo, drive, the mallet,
the spin, the room and the volume, or the organ's drawbars), with **More
controls** for everything else, and the presets just above the keys (the
first control on a phone). Each shows its name, and its value while
you move it. Explanations wait behind ⓘ buttons.

**Your own presets** live in the same menu. *Save these settings…* keeps
the page's settings under a name in your browser, and *Copy a link to
these settings* makes a link that opens the page playing them, to send
to someone. *Your presets and files…* lists yours, and saves them to a
file or opens one: the plugins read and write the same files.

There are two modes. **Discover** shows it all. **Perform** shows just
the main views, filling the screen, with no text in them: for playing,
or for a projector (**Full screen** fills it). The controls stay where
they are.

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
computer keys. The handle on top of the controls folds them away. On a
phone the page scrolls above the keys, which stay put; turn it sideways
for wider keys, with the controls beside the keyboard's tools. Use
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

Releases publish themselves: after each green `native` run on `live` (the branch the site is
published from), the **release-plugins** workflow releases that run's plugins if an instrument's
version or anything under `native/` changed since the latest release (tagged `plugins-v<Forte version>`, with `-2`, `-3`… when
Forte's version didn't change). It can also be started by hand from the Actions tab.

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
