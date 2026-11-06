// How loud is each instrument at its defaults? One held C4 (or the key nearest it, on a keyboard
// that stops short of C4) at the computer keyboard's default velocity, through the page's own dry
// chain (shared/chain.js: tone, body and volume, the convolvers scaled as a ConvolverNode scales
// them). The figure is
// the loudest momentary (400 ms) K-weighted loudness in the first 2 s, in LUFS (BS.1770).
// The registry's `trim` (dB) evens instruments out; test/level-tests.mjs keeps them even.
//
// Usage: node tools/loudness.mjs        (prints the table and the trims that would hit TARGET)
//        node tools/loudness.mjs presets [ids]   (every factory preset against its defaults)

export const TARGET = -23; // LUFS, momentary max of one mf C4
const FS = 48000, SEC = 2.5, KEY = 60;
const R = new URL('../', import.meta.url);
const mod = (p) => import(new URL(p, R));

function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
// BS.1770 K-weighting at 48 kHz: high shelf, then high-pass
const kWeight = (x) => biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
export function measure([L, Rr], upTo = 2) {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
  const kL = kWeight(L), kR = kWeight(Rr), W = Math.round(0.4 * FS), hop = Math.round(0.1 * FS);
  let m = -Infinity;
  for (let s = 0; s + W <= Math.min(upTo * FS, L.length); s += hop) {
    let e = 0;
    for (let i = s; i < s + W; i++) e += kL[i] * kL[i] + kR[i] * kR[i];
    m = Math.max(m, -0.691 + 10 * Math.log10(e / W + 1e-30));
  }
  return { lufs: m, peak: 20 * Math.log10(pk + 1e-30) };
}

// Each instrument is played from its descriptor (<id>/src/<id>-instrument.js) as its page plays
// it (tools/headless.mjs): its engine, then its dry chain (no room, no trim),
// at the velocity its computer keys play: P.velocity, or the descriptor's keyVelocity, or 0.75.

export async function measureAll() {
  const rows = [];
  const { INSTRUMENTS } = await mod('shared/registry.js');
  const { loadInstrument, Player, applyChain, defaultsOf } = await mod('tools/headless.mjs');
  const { loadEngine } = await mod('tools/engine.mjs');
  for (const { id } of INSTRUMENTS.filter((i) => i.ready)) {
    const I = await loadInstrument(id), P = defaultsOf(I);
    const pl = new Player(I, await loadEngine(I), FS, P);
    const key = Math.min(Math.max(KEY, I.range[0]), I.range[1]);
    const out = pl.render(SEC, [[0, 'on', key, P.velocity ?? I.keyVelocity ?? 0.75]]);
    const [L, Rr] = applyChain({ ...I, id: '' }, out, P, FS, { room: false }); // trim: added by the caller
    rows.push({ id, ...measure([L, Rr]) });
  }
  return rows;
}

// How loud is each factory preset next to its instrument's defaults? One note at each of KEYS
// (clamped to the instrument's range), each at the computer keys' velocity for the preset, through
// the same dry chain; a preset's figure is its loudest key, in LU against the defaults at that key.
// A first pass listens to 1.2 s; a preset that seems quiet is heard again for 4 s, since a
// bowed or blown note may take its time to speak.
export const PRESET_KEYS = [60, 67, 72, 79, 84];
export async function measurePresets({ only } = {}) {
  const rows = [];
  const { INSTRUMENTS } = await mod('shared/registry.js');
  const { loadInstrument, Player, applyChain, defaultsOf, withPreset } = await mod('tools/headless.mjs');
  const { loadEngine } = await mod('tools/engine.mjs');
  for (const { id } of INSTRUMENTS.filter((i) => i.ready && (!only?.length || only.includes(i.id)))) {
    const I = await loadInstrument(id), Engine = await loadEngine(I);
    if (!I.presets?.length) continue;
    const keys = [...new Set(PRESET_KEYS.map((k) => Math.min(Math.max(k, I.range[0]), I.range[1])))];
    const levels = (P, sec) => keys.map((key) => {
      const pl = new Player(I, Engine, FS, P);
      const out = pl.render(sec, [[0, 'on', key, P.velocity ?? I.keyVelocity ?? 0.75]]);
      pl.engine.destroy?.(); // a WebAssembly engine's memory is its own until it is let go
      return measure(applyChain({ ...I, id: '' }, out, P, FS, { room: false }), sec).lufs;
    });
    const best = (a, b) => Math.max(...a.map((x, j) => x - b[j]));
    const def = { 1.2: levels(defaultsOf(I), 1.2) };
    I.presets.forEach((pr, k) => {
      const P = withPreset(I, k);
      let lu = best(levels(P, 1.2), def[1.2]);
      if (lu < PRESET_FLOOR) { def[4] ??= levels(defaultsOf(I), 4); lu = best(levels(P, 4), def[4]); }
      rows.push({ id, name: pr.name, lu });
    });
  }
  return rows;
}
// no factory preset should be this much quieter than its defaults (LU, at its loudest key)
export const PRESET_FLOOR = -25;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { byId } = await mod('shared/registry.js');
  if (process.argv[2] === 'presets') {
    for (const r of (await measurePresets({ only: process.argv.slice(3) })).sort((a, b) => a.lu - b.lu)) console.log(`${r.lu.toFixed(1).padStart(6)} LU  ${r.id.padEnd(12)} ${r.name}`);
    process.exit(0);
  }
  const rows = await measureAll();
  rows.sort((a, b) => b.lufs - a.lufs);
  console.log('instrument   LUFS (raw)   peak dBFS   trim now   LUFS trimmed   trim for target');
  for (const r of rows) {
    const t = byId(r.id)?.trim ?? 0;
    console.log(`${r.id.padEnd(12)} ${r.lufs.toFixed(1).padStart(8)} ${r.peak.toFixed(1).padStart(11)} ${t.toFixed(1).padStart(10)} ${(r.lufs + t).toFixed(1).padStart(14)} ${(TARGET - r.lufs).toFixed(1).padStart(17)}`);
  }
}
