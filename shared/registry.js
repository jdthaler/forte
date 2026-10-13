// registry.js — every Forte instrument, for the landing page and the header
// switcher. `ready: false` instruments are listed as "in the workshop".
//
// Versions follow semantic versioning (https://semver.org), one for Forte
// itself (the site and shared/) and one per instrument. 0.x is pre-release.
// Keep FORTE_VERSION equal to package.json's, and log every bump in
// CHANGELOG.md (test/site-tests.mjs checks both).

export const FORTE_VERSION = '0.2.0';

export const SECTIONS = [
  { id: 'history', title: 'Instruments from history', blurb: 'Real keyboards — some famous, some forgotten — rebuilt from their physics, with every mechanism exposed as a knob.' },
  { id: 'new', title: 'Instruments only physics can build', blurb: 'Keyboards that could not exist, or never have: synchronising circuits, chaotic plates, black holes and wavefunctions.' },
];

export const INSTRUMENTS = [
  {
    id: 'piano', name: 'Ribbon Piano', section: 'history', ready: true, version: '0.1.1',
    after: 'the concert grand',
    tagline: 'Stiff strings, felt hammers and a shared bridge — then swap the strings for square bars, triangular bars or twisting ribbons.',
    physics: 'Modal strings · nonlinear hammers · torsion',
    accent: '#5aa9ff',
  },
  {
    id: 'grand', name: 'Electric Grand', section: 'history', ready: false,
    after: 'the Yamaha CP-70',
    tagline: 'A real piano action with no soundboard: piezo pickups under the bridge hear the strings directly.',
    physics: 'Bridge force · piezoelectric pickup',
    accent: '#7fb2ff',
  },
  {
    id: 'organ', name: 'Tonewheel Organ', section: 'history', ready: true, version: '0.1.1',
    after: 'the Hammond B-3 and Leslie',
    tagline: '91 spinning gear-driven wheels, bouncing key contacts, a scanner on an LC delay line and a rotating Doppler horn.',
    physics: 'Gear ratios · shared wheels · Doppler',
    accent: '#f0b35a',
  },
  {
    id: 'tines', name: 'Tine Piano', section: 'history', ready: true, version: '0.1.1',
    after: 'the Fender Rhodes',
    tagline: 'Each key an asymmetric tuning fork of steel tine and brass bar, heard through a nonlinear magnetic pickup.',
    physics: 'Coupled cantilevers · pickup nonlinearity',
    accent: '#ef5a4a',
  },
  {
    id: 'reeds', name: 'Reed Piano', section: 'history', ready: false,
    after: 'the Wurlitzer 200A',
    tagline: 'Struck steel reeds tuned with solder, sensed as one plate of a charged capacitor.',
    physics: 'Cantilever reeds · electrostatic pickup',
    accent: '#e8a0c8',
  },
  {
    id: 'clavier', name: 'Tangent Clavier', section: 'history', ready: false,
    after: 'the Hohner Clavinet',
    tagline: 'A rubber tangent pins the string to an anvil; two magnetic pickups comb-filter the twang.',
    physics: 'Impact on an anvil · pickup position',
    accent: '#c6e36a',
  },
  {
    id: 'pianet', name: 'Sticky-Pad Piano', section: 'history', ready: false,
    after: 'the Hohner Pianet',
    tagline: 'No hammers at all: tacky pads grab each reed and let it go.',
    physics: 'Adhesion and release · reed pickup',
    accent: '#ffcf70',
  },
  {
    id: 'bowed', name: 'Viola Organista', section: 'history', ready: false,
    after: "Leonardo da Vinci's design (1488)",
    tagline: 'Rosined wheels bow the strings while you hold the keys: stick–slip friction, from scratch.',
    physics: 'Friction · Helmholtz motion',
    accent: '#d79a62',
  },
  {
    id: 'glass', name: 'Glass Armonica', section: 'history', ready: false,
    after: "Benjamin Franklin's armonica (1761)",
    tagline: 'Wet fingers on spinning glass bowls: friction drives the shell modes, water tunes them.',
    physics: 'Shell modes · friction · fluid loading',
    accent: '#9fe7ff',
  },
  {
    id: 'pyrophone', name: 'Pyrophone', section: 'history', ready: false,
    after: "Frédéric Kastner's flame organ (1873)",
    tagline: 'Flames in glass tubes sing by themselves once they cross a threshold — and remember having sung.',
    physics: 'Thermoacoustics · Hopf bifurcation',
    accent: '#ff7a45',
  },
  {
    id: 'huygens', name: 'Huygens Keyboard', section: 'new', ready: true, version: '0.1.1',
    tagline: 'Relaxation oscillators that pull each other into just intonation — Arnold tongues you can play.',
    physics: 'Pulse-coupled oscillators · mode locking',
    accent: '#ff8a3d',
  },
  {
    id: 'gongs', name: 'Gong Keyboard', section: 'new', ready: false,
    tagline: 'Thin plates whose stiffness grows with amplitude: strike softly for a bell, hard for a crash.',
    physics: 'Von Kármán plates · wave turbulence',
    accent: '#e6c15a',
  },
  {
    id: 'blackhole', name: 'Black-Hole Keyboard', section: 'new', ready: true, version: '0.1.1',
    tagline: 'Every key a Kerr black hole, ringing in quasinormal modes computed from the Teukolsky equation.',
    physics: 'General relativity · quasinormal modes',
    accent: '#b18cff',
  },
  {
    id: 'quantum', name: 'Quantum Keyboard', section: 'new', ready: false,
    tagline: 'Each key a wavepacket in a potential well: notes that fade away and come back at the revival time.',
    physics: 'Schrödinger equation · quantum revivals',
    accent: '#73e2b8',
  },
];

export const byId = (id) => INSTRUMENTS.find((i) => i.id === id);
