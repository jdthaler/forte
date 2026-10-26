// registry.js — every Forte instrument, for the landing page and the header
// switcher, in five sections (SECTIONS; `short` names the landing page's tabs),
// ready instruments first in each. `ready: false` instruments are listed as
// "in the workshop".
//
// Versions follow semantic versioning (https://semver.org), one for Forte
// itself (the site and shared/) and one per instrument. 0.x is pre-release.
// Keep FORTE_VERSION equal to package.json's, and log every bump in
// CHANGELOG.md (test/site-tests.mjs checks both).
//
// `plugin.code` is the instrument's Audio Unit subtype (four characters, unique; the
// manufacturer is Frte), for its native plugin (docs/PLUGINS.md). Never change it: hosts
// find saved projects' plugins by it. The VST3 class ids are in native/ids.json.
// `plugin.ready` marks an instrument whose native port is built and released as plugins (it has
// a native/instruments/<id>/ folder); the landing page lists those under Plugins.

export const FORTE_VERSION = '0.37.0';

export const SECTIONS = [
  { id: 'traditional', title: 'Traditional instruments', short: 'Traditional',
    blurb: 'Acoustic keyboards of strings, pipes, reeds and bars, rebuilt from their physics with every mechanism exposed as a knob.' },
  { id: 'electric', title: 'Electric instruments', short: 'Electric',
    blurb: 'Pianos and organs that vibrate metal and listen to it with pickups: tonewheels, tines, reeds, strings and sticky pads, with their electronics modelled too.' },
  { id: 'experimental', title: 'Experiments from history', short: 'Experimental',
    blurb: 'Inventions that never caught on: strings bowed by wheels, singing glass, flames in tubes and an arc lamp that sings.' },
  { id: 'phenomena', title: 'Physical phenomena', short: 'Phenomena',
    blurb: 'Keyboards made of phenomena rather than mechanisms: synchronising oscillators, nonlinear plates, black holes, wavefunctions, bubbles, stars, lightning\'s whistlers and the early universe\'s sound, each played from the keys. Several have been modelled or sonified before; see the prior art and credits.' },
  { id: 'devices', title: 'Devices built to study physics', short: 'Devices',
    blurb: 'Keyboards made of the apparatus physicists build to study nature: an accelerator\'s storage ring and its RF cavities, a collider\'s calorimeter crystals and the trap that weighs the neutrino, each heard through the pickups and antennas that read it out.' },
];

export const INSTRUMENTS = [
  {
    id: 'piano', name: 'Ribbon Piano', section: 'traditional', ready: true, version: '0.9.0', trim: 3,
    plugin: { code: 'Ribn', ready: true },
    after: 'the concert grand',
    tagline: 'Stiff strings, felt hammers and a shared bridge — then swap the strings for square bars, triangular bars or twisting ribbons.',
    physics: 'Modal strings · nonlinear hammers · torsion',
    accent: '#5aa9ff',
  },
  {
    id: 'harpsichord', name: 'Harpsichord', section: 'traditional', ready: true, version: '0.7.0', trim: -2,
    plugin: { code: 'Hrps', ready: true },
    after: 'the Flemish double-manual harpsichord (Ruckers, 1600s)',
    tagline: 'A quill bends, slips off the string and plucks it; stops change where and how it plucks.',
    physics: 'Plectrum contact and release · plucked stiff strings',
    accent: '#f4d39b',
  },
  {
    id: 'pipes', name: 'Pipe Organ', section: 'traditional', ready: true, version: '0.7.0', trim: 2,
    plugin: { code: 'Pipe', ready: true },
    after: 'the Baroque pipe organ',
    tagline: 'Air jets flutter against the pipe mouths: each note starts with a chiff, overblows when pushed, and sags when the wind runs short.',
    physics: 'Jet–edge feedback · flue pipes · shared wind',
    accent: '#9fb4ff',
  },
  {
    id: 'harmonium', name: 'Free-Reed Organ', section: 'traditional', ready: true, version: '0.7.0', trim: -7,
    plugin: { code: 'Harm', ready: true },
    after: 'the harmonium and the accordion',
    tagline: 'Brass reeds driven by the airflow they choke; paired reeds tuned a little apart give the musette shimmer.',
    physics: 'Self-excited free reeds · bellows pressure',
    accent: '#ff9fb0',
  },
  {
    id: 'vibraphone', name: 'Vibraphone', section: 'traditional', ready: true, version: '0.7.0', trim: 3,
    plugin: { code: 'Vibe', ready: true },
    after: 'the Deagan vibraharp (1927)',
    tagline: 'Undercut aluminium bars over tuned tubes, with motor-driven discs that open and close the resonators.',
    physics: 'Tuned bars · coupled resonators · rotating valves',
    accent: '#5fd0c8',
  },
  {
    id: 'carillon', name: 'Carillon', section: 'traditional', ready: true, version: '0.5.0', trim: 3.5,
    plugin: { code: 'Carl', ready: true },
    after: 'the Flemish carillon (Hemony bells, 1650s)',
    tagline: 'Bronze bells tuned partial by partial; the note you hear, the strike note, is a virtual pitch made by partials an octave and more above it.',
    physics: 'Bell modes by finite elements · Hertz clapper · virtual pitch',
    accent: '#d9b45f',
  },
  {
    id: 'celesta', name: 'Celesta', section: 'traditional', ready: true, version: '0.2.0', trim: 0.5,
    plugin: { code: 'Cele', ready: true },
    after: 'the Mustel celesta (Paris, 1886)',
    tagline: 'Felt hammers strike thin steel bars, each over a wooden box tuned to it: the bell-like sugar-plum sound.',
    physics: 'Timoshenko bars · bar–box air coupling · felt hammers',
    accent: '#b9a4ff',
  },
  {
    id: 'kalimba', name: 'Kalimba', section: 'traditional', ready: true, version: '0.2.0', trim: -4.5,
    plugin: { code: 'Kali', ready: true },
    after: 'the African mbira and Hugh Tracey’s kalimba (1950s)',
    tagline: 'Steel tines clamped behind a bridge and plucked by the thumbs, over a wooden box whose sound hole a finger can cover.',
    physics: 'Clamped–supported–free beams · Helmholtz box · rattling caps',
    accent: '#d9a066',
  },
  {
    id: 'steelpan', name: 'Steel Pan', section: 'traditional', ready: true, version: '0.2.0', trim: 2.5,
    plugin: { code: 'Stee', ready: true },
    after: 'the Trinidad steelpan (1940s)',
    tagline: 'Domed note areas sunk into an oil drum, hammered until octave and twelfth ring true; struck hard, the dome pumps the octave out of the fundamental.',
    physics: 'Tuned shallow shells · 1 : 2 : 3 internal resonance · coupled notes',
    accent: '#ffb347',
  },
  {
    id: 'grand', name: 'Electric Grand', section: 'electric', ready: true, version: '0.8.0', trim: 3.5,
    plugin: { code: 'EGrd', ready: true },
    after: 'the Yamaha CP-70',
    tagline: 'A real piano action with no soundboard: piezo pickups under the bridge hear the strings directly.',
    physics: 'Bridge force · piezoelectric pickup',
    accent: '#7fb2ff',
  },
  {
    id: 'organ', name: 'Tonewheel Organ', section: 'electric', ready: true, version: '0.9.0', trim: 2,
    plugin: { code: 'Tonw', ready: true },
    after: 'the Hammond B-3 and Leslie',
    tagline: '91 spinning gear-driven wheels, bouncing key contacts, a scanner on an LC delay line and a rotating Doppler horn.',
    physics: 'Gear ratios · shared wheels · Doppler',
    accent: '#f0b35a',
  },
  {
    id: 'tines', name: 'Tine Piano', section: 'electric', ready: true, version: '0.9.0', trim: -3,
    plugin: { code: 'Tine', ready: true },
    after: 'the Fender Rhodes',
    tagline: 'Each key an asymmetric tuning fork of steel tine and brass bar, heard through a nonlinear magnetic pickup.',
    physics: 'Coupled cantilevers · pickup nonlinearity',
    accent: '#ef5a4a',
  },
  {
    id: 'reeds', name: 'Reed Piano', section: 'electric', ready: true, version: '0.8.0', trim: -1,
    plugin: { code: 'Reed', ready: true },
    after: 'the Wurlitzer 200A',
    tagline: 'Struck steel reeds tuned with solder, sensed as one plate of a charged capacitor.',
    physics: 'Cantilever reeds · electrostatic pickup',
    accent: '#e8a0c8',
  },
  {
    id: 'clavier', name: 'Tangent Clavier', section: 'electric', ready: true, version: '0.7.0', trim: 4.5,
    plugin: { code: 'Clav', ready: true },
    after: 'the Hohner Clavinet',
    tagline: 'A rubber tangent pins the string to an anvil; two magnetic pickups comb-filter the twang.',
    physics: 'Impact on an anvil · pickup position',
    accent: '#c6e36a',
  },
  {
    id: 'pianet', name: 'Sticky-Pad Piano', section: 'electric', ready: true, version: '0.8.0', trim: -4.5,
    plugin: { code: 'Pnet', ready: true },
    after: 'the Hohner Pianet',
    tagline: 'No hammers at all: tacky pads grab each reed and let it go.',
    physics: 'Adhesion and release · reed pickup',
    accent: '#ffcf70',
  },
  {
    id: 'bowed', name: 'Viola Organista', section: 'experimental', ready: true, version: '0.8.0', trim: 3,
    plugin: { code: 'Viol', ready: true },
    after: "Leonardo da Vinci's design (1488)",
    tagline: 'Rosined wheels bow the strings while you hold the keys: stick–slip friction, from scratch.',
    physics: 'Friction · Helmholtz motion',
    accent: '#d79a62',
  },
  {
    id: 'glass', name: 'Glass Armonica', section: 'experimental', ready: true, version: '0.8.0', trim: 0.5,
    plugin: { code: 'Glas', ready: true },
    after: "Benjamin Franklin's armonica (1761)",
    tagline: 'Wet fingers on spinning glass bowls: stick–slip friction drives the shell modes, and rotation makes the doublets warble.',
    physics: 'Shell modes · friction · fluid loading',
    accent: '#9fe7ff',
  },
  {
    id: 'pyrophone', name: 'Pyrophone', section: 'experimental', ready: true, version: '0.8.0', trim: -3.5,
    plugin: { code: 'Pyro', ready: true },
    after: "Frédéric Kastner's flame organ (1873)",
    tagline: 'Flames in glass tubes sing by themselves once they cross a threshold — and remember having sung.',
    physics: 'Thermoacoustics · Hopf bifurcation',
    accent: '#ff7a45',
  },
  {
    id: 'arc', name: 'Singing Arc', section: 'experimental', ready: true, version: '0.6.0', trim: 7,
    plugin: { code: 'SArc', ready: true },
    after: "William Duddell's singing arc (1900)",
    tagline: 'An electric arc lamp that sings: its negative resistance drives an LC circuit, and the arc itself is the loudspeaker.',
    physics: 'Negative resistance · LC oscillator · plasma heating',
    accent: '#ffe36b',
  },
  {
    id: 'huygens', name: 'Huygens Keyboard', section: 'phenomena', ready: true, version: '0.8.0', trim: 9.5,
    plugin: { code: 'Huyg', ready: true },
    tagline: 'Relaxation oscillators that pull each other into just intonation — Arnold tongues you can play.',
    physics: 'Pulse-coupled oscillators · mode locking',
    accent: '#ff8a3d',
  },
  {
    id: 'gongs', name: 'Gong Keyboard', section: 'phenomena', ready: true, version: '0.8.0', trim: 7,
    plugin: { code: 'Gong', ready: true },
    tagline: 'Thin plates whose stiffness grows with amplitude: strike softly for a bell, hard for a crash.',
    physics: 'Von Kármán plates · wave turbulence',
    accent: '#e6c15a',
  },
  {
    id: 'blackhole', name: 'Black-Hole Keyboard', section: 'phenomena', ready: true, version: '0.8.0', trim: 14,
    plugin: { code: 'BHol', ready: true },
    tagline: 'Every key a Kerr black hole, ringing in quasinormal modes computed from the Teukolsky equation.',
    physics: 'General relativity · quasinormal modes',
    accent: '#b18cff',
  },
  {
    id: 'quantum', name: 'Quantum Keyboard', section: 'phenomena', ready: true, version: '0.7.0', trim: 9.5,
    plugin: { code: 'Qntm', ready: true },
    tagline: 'Each key a wavepacket in a potential well: notes that collapse, return an octave up as the packet splits, and revive on the beat.',
    physics: 'Schrödinger equation · quantum revivals',
    accent: '#73e2b8',
  },
  {
    id: 'bubbles', name: 'Bubble Organ', section: 'phenomena', ready: true, version: '0.7.0', trim: 1.5,
    plugin: { code: 'Bubl', ready: true },
    tagline: 'Every note a bubble ringing at its Minnaert frequency; depth, gas and pressure retune it.',
    physics: 'Bubble acoustics · Minnaert resonance',
    accent: '#6fb8ff',
  },
  {
    id: 'springs', name: 'Spring Keyboard', section: 'phenomena', ready: true, version: '0.5.0', trim: 11.5,
    plugin: { code: 'Sprg', ready: true },
    tagline: 'Struck steel coils, each cut to sound its note; their waves travel at different speeds by pitch, so every echo arrives as a chirp.',
    physics: 'Helical rods (Wittrick) · dispersion · chirped echoes',
    accent: '#c0c0d8',
  },
  {
    id: 'stars', name: 'Star Keyboard', section: 'phenomena', ready: true, version: '0.5.0', trim: 7,
    plugin: { code: 'Star', ready: true },
    tagline: 'Every key a Sun-like star whose oscillations are rung continuously by convection: combs of modes that breathe rather than strike.',
    physics: 'Asteroseismology · stochastically driven modes',
    accent: '#ff6f91',
  },
  {
    id: 'windharp', name: 'Wind Harp', section: 'phenomena', ready: true, version: '0.6.0', trim: -4,
    plugin: { code: 'WHrp', ready: true },
    tagline: 'Strings sung by the wind: the vortices they shed lock onto one of their harmonics, and hop up the series as the wind rises.',
    physics: 'Vortex shedding · lock-in · wake oscillators',
    accent: '#a8e6a1',
  },
  {
    id: 'ring', name: 'Storage Ring', section: 'devices', ready: true, version: '0.3.0', trim: -0.5,
    plugin: { code: 'Stor', ready: true },
    tagline: 'Every key a particle accelerator\'s storage ring, heard through a beam pickup: kicked bunches whose oscillation fades and recoheres.',
    physics: 'Accelerator physics · betatron decoherence · synchrotron motion',
    accent: '#6ec6ff',
  },
  {
    id: 'cavity', name: 'RF Cavity Bells', section: 'devices', ready: true, version: '0.2.0', trim: 4,
    plugin: { code: 'Rfca', ready: true },
    tagline: 'Every key a superconducting accelerator cavity, rung by the bunch that crosses it: nine coupled cells that beat, higher-order modes for a bell\'s partials.',
    physics: 'RF cavities · coupled-cell passbands · beam loading',
    accent: '#9fb4ff',
  },
  {
    id: 'showers', name: 'Collider Showers', section: 'devices', ready: true, version: '0.1.0', trim: 4,
    plugin: { code: 'Shwr', ready: true },
    tagline: 'Every key a crystal of a collider\'s calorimeter, rung by the heat of the particle shower inside it: deeper showers for higher energies, a darker note.',
    physics: 'Calorimetry · electromagnetic and hadronic showers · the thermo-acoustic effect',
    accent: '#8fd4ff',
  },
  {
    id: 'whistlers', name: 'Whistlers', section: 'phenomena', ready: true, version: '0.1.0', trim: 4.5,
    plugin: { code: 'Whis', ready: true },
    tagline: 'Lightning\'s radio crack, drawn out along the Earth\'s magnetic field into falling tones: every key a field line, its whistler\'s nose the note.',
    physics: 'Magnetospheric physics · whistler-mode dispersion · the plasmasphere',
    accent: '#7dffb0',
  },
  {
    id: 'universe', name: 'Early Universe', section: 'phenomena', ready: true, version: '0.1.0', trim: 2,
    plugin: { code: 'Univ', ready: true },
    tagline: 'Every key a young universe, its plasma ringing with the sound waves the microwave background shows: baryons make the odd harmonics louder, diffusion fades the high ones.',
    physics: 'Cosmology · acoustic oscillations of the photon–baryon fluid · recombination and Silk damping',
    accent: '#ff9a62',
  },
  {
    id: 'project8', name: 'Project 8', section: 'devices', ready: true, version: '0.1.0', trim: -2,
    plugin: { code: 'Proj', ready: true },
    tagline: 'Every key a magnetic trap holding one electron, heard by its cyclotron radiation as the Project 8 neutrino-mass experiment hears it: a tone that chirps up as the electron cools, wavers as it bounces, and stops when it escapes.',
    physics: 'Cyclotron radiation emission spectroscopy · relativistic radiation reaction · magnetic bottles',
    accent: '#c99bff',
  },
  {
    id: 'abracadabra', name: 'ABRACADABRA', section: 'phenomena', ready: true, version: '0.1.0', trim: 3,
    plugin: { code: 'Abra', ready: true },
    tagline: 'Every key a universe whose dark matter is an axion of that key\'s mass, heard as the ABRACADABRA experiment would hear it: a toroidal magnet turns the axion into a faint flux through a pickup loop, a tone that swells and fades as the halo\'s waves drift in and out of step, over the hiss of the SQUID.',
    physics: 'Axion electrodynamics · the Standard Halo Model · SQUID readout',
    accent: '#7fd8c4',
  },
];

// The template (docs/template/), the starting point for new instruments: not listed, but it
// is built as a plugin too, so it has a code.
export const TEMPLATE = {
  id: 'template', name: 'Template Bars', accent: '#e6c15a', plugin: { code: 'Tmpl' },
  tagline: 'The starting point for a new instrument: struck free–free bars.',
};

export const byId = (id) => INSTRUMENTS.find((i) => i.id === id);

// Output trim (`trim`, dB) so that instruments sit at about the same loudness at their
// defaults (tools/loudness.mjs measures them; test/level-tests.mjs keeps them there).
export const trimGain = (id) => 10 ** ((byId(id)?.trim ?? 0) / 20);
