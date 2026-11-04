// Render Ringing Planets demos, each isolating one physical effect, to examples/planets/*.wav
// Usage: node tools/render-planets.mjs        (then node tools/encode-examples.mjs planets)
//
// Name demos NN-what-you-hear; the landing page plays the first one.

import { INSTRUMENT, DEFAULTS, PRESETS } from '../planets/src/planets-instrument.js';
import { loadEngine } from './engine.mjs';
import { renderEngine, withRoom, saveExample } from './audio-util.mjs';

const PlanetEngine = await loadEngine(INSTRUMENT);

const FS = 48000, SLUG = 'planets';
const named = (name) => { const p = PRESETS.find((x) => x.name.startsWith(name)); if (!p) throw new Error(name); return p.p; };
const preset = (name, o = {}) => ({ ...DEFAULTS, ...named(name), ...o });
const play = (P, seconds, events) => { const e = new PlanetEngine(FS); e.setParams(P); return renderEngine(e, seconds, events, FS); };
const notes = (t0, dt, keys, vel, len = dt) => keys.flatMap((k, i) => [[t0 + i * dt, 'on', k, vel], [t0 + i * dt + len, 'off', k]]);
const cat = (...parts) => [0, 1].map((c) => Float64Array.from(parts.flatMap((p) => [...p[c]])));
// one quake on one key, left to ring under the pedal
const ring = (P, key, seconds, vel = 0.9) => play(P, seconds, [[0, 'sus', true], [0.05, 'on', key, vel], [0.3, 'off', key]]);

const demos = [
  // a tune on the Moon, whose dry rock hardly damps the ringing: each moonquake rings on under the pedal
  ['01-moon-rings-a-tune', () => play(preset('Moon: a deep moonquake'), 12, [
    [0, 'sus', true],
    ...notes(0.1, 0.9, [60, 64, 67, 72, 71, 67, 64, 62], 0.7, 0.4),
    [7.6, 'on', 48, 0.8], [7.6, 'on', 55, 0.7], [7.6, 'on', 64, 0.7], [8.1, 'off', 48], [8.1, 'off', 55], [8.1, 'off', 64],
  ])],
  // a slow tune of great quakes, each Earth ringing on under the pedal: the crack, then ₀S₂ and ₀S₀
  ['02-earth-rings-a-tune', () => play(preset('Earth: a great megathrust'), 12, [
    [0, 'sus', true],
    ...notes(0.1, 1.1, [55, 60, 64, 62, 60, 67, 64], 0.75, 0.5),
    [8, 'on', 48, 0.9], [8, 'on', 55, 0.8], [8, 'on', 60, 0.8], [8.5, 'off', 48], [8.5, 'off', 55], [8.5, 'off', 60],
  ])],
  // the same quake on a still Earth, on the Earth's own day and spun up eight times: ₀S₂ split into five that beat
  ['03-spin-splits-the-tone', () => cat(...[0, 1, 8].map((spin) => ring(preset('Earth: a great megathrust', { spin }), 55, 4)))],
  // an explosion heard 90° away (every odd degree on a node), then 45° away: half the tones come back
  ['04-explosion-heard-at-90-then-45-degrees', () => cat(
    ring(preset('Earth: an explosion'), 55, 3.5),
    ring(preset('Earth: an explosion', { distance: 45 }), 55, 3.5))],
  // a shallow quake rings the surface-wave modes; one 640 km down rings the overtones
  ['05-shallow-then-deep-quake', () => cat(
    ring(preset('Earth: a great megathrust'), 55, 3.5),
    ring(preset('Earth: a deep quake'), 55, 3.5))],
  // the same key on the Earth, Mars and the Moon: Mars's lossy mantle dies fast, the dry Moon rings on
  ['06-earth-mars-moon', () => cat(
    ring(preset('Earth: a great megathrust'), 60, 3.5),
    ring(preset('Mars: a great marsquake'), 60, 3.5),
    ring(preset('Moon: a meteorite'), 60, 6))],
  // a strike-slip quake heard sideways, north on the left and east on the right: the twisting (toroidal) modes
  ['07-twisting-modes-in-stereo', () => play(preset('Earth: twisting modes'), 7, [
    [0, 'sus', true], ...notes(0.1, 1.2, [52, 59, 64, 67], 0.85, 0.4),
  ])],
];

for (const [name, fn] of demos) saveExample(SLUG, name, await withRoom(fn(), 0.2, FS), FS);
