// How loud is each instrument at its defaults? One held C4 at the computer keyboard's
// default velocity, through the page's own dry chain (shared/chain.js: tone, body and
// volume, the convolvers scaled as a ConvolverNode scales them). The figure is
// the loudest momentary (400 ms) K-weighted loudness in the first 2 s, in LUFS (BS.1770).
// The registry's `trim` (dB) evens instruments out; test/level-tests.mjs keeps them even.
//
// Usage: node tools/loudness.mjs        (prints the table and the trims that would hit TARGET)

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
function measure([L, Rr]) {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
  const kL = kWeight(L), kR = kWeight(Rr), W = Math.round(0.4 * FS), hop = Math.round(0.1 * FS);
  let m = -Infinity;
  for (let s = 0; s + W <= 2 * FS; s += hop) {
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
    const out = pl.render(SEC, [[0, 'on', KEY, P.velocity ?? I.keyVelocity ?? 0.75]]);
    const [L, Rr] = applyChain({ ...I, id: '' }, out, P, FS, { room: false }); // trim: added by the caller
    rows.push({ id, ...measure([L, Rr]) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { byId } = await mod('shared/registry.js');
  const rows = await measureAll();
  rows.sort((a, b) => b.lufs - a.lufs);
  console.log('instrument   LUFS (raw)   peak dBFS   trim now   LUFS trimmed   trim for target');
  for (const r of rows) {
    const t = byId(r.id)?.trim ?? 0;
    console.log(`${r.id.padEnd(12)} ${r.lufs.toFixed(1).padStart(8)} ${r.peak.toFixed(1).padStart(11)} ${t.toFixed(1).padStart(10)} ${(r.lufs + t).toFixed(1).padStart(14)} ${(TARGET - r.lufs).toFixed(1).padStart(17)}`);
  }
}
