// grand-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/grand): GrandWasmEngine, with the engine contract, and the model's functions
// for the views and the tests.

import { GROUPS } from './grand-params.js';
import { wasmEngine, scratch, nativeParams, nativeValue } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'grand', name: 'GrandWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/grand.wasm', import.meta.url).href };

// The C++ engine's message (grand-engine.h, msg) as the page's 'error'.
const messages = (m) => (m.type === 1 ? { type: 'error', message: 'numerical instability', key: m.key } : null);

const Base = wasmEngine(BUILD, { messages });

// A key's model, packed by the WebAssembly (grand-web.cpp, pack): its string scale S, its partials
// and the flattened modes the engine integrates.
const SCALE = ['key', 'f0', 'cents', 'L', 'd', 'dOut', 'mu', 'muCore', 'wound', 'T', 'EI', 'B', 'stress', 'cT'];
const PARTIAL = ['n', 'k', 'f', 'w', 'b', 'sigInt', 'GV', 'GH', 'bridgeV', 'bridgeH', 'fH', 'phiH', 'damp', 'stretch'];
function unpackKey(x, at) {
  const a = new Float64Array(x.memory.buffer, at, x.grand_packed()).slice();
  const [key, ns, d0, d1, d2, seg, beta, xh, wH, xd, mass, K, p, alpha, hasDamper, n, nV, np] = a;
  let i = 18;
  const take = (m) => { const v = a.subarray(i, i + m); i += m; return v; };
  const S = Object.fromEntries(SCALE.map((k, j) => [k, a[i + j]]));
  S.wound = S.wound > 0; i += SCALE.length;
  const partials = [];
  for (let j = 0; j < np; j++) { const v = take(PARTIAL.length); partials.push(Object.fromEntries(PARTIAL.map((k, l) => [k, v[l]]))); }
  const freq = take(n), sigma = take(n), w = take(n), c = take(n), bf = take(n), damp = take(n);
  const str = Uint8Array.from(take(n)), idx = Uint16Array.from(take(n));
  return {
    key, S, ns, det: [d0, d1, d2].slice(0, ns), partials, seg, beta, xh, wH, xd,
    hammer: { mass, K, p, alpha }, hasDamper: hasDamper > 0, n, nV, freq, sigma, w, c, bf, damp, str, idx,
  };
}

// A voice of the engine, read back: its state, its modes (q and q1, live views into the engine's
// memory) and its key's model.
const STATE = ['key', 'active', 'killing', 'dead', 'struck', 'contactSamples', 'Fmax', 'eta', 'etaPrev', 'FV', 'F', 'hammerOn', 'age', 'N', 'nV', 'ns', 'keyDown', 'damped', 'peak', 'FH', 'v0'];
const FLAGS = new Set(['killing', 'dead', 'hammerOn', 'keyDown', 'damped']);
class WasmVoice {
  constructor(p) { this.p = p; }
  state(i) {
    const x = Base.exports, s = scratch(x);
    x.grand_voice_state(this.p, s.at);
    return s.f64(STATE.length)[i];
  }
  view(name, fn) { // a Float64Array over the engine's memory, renewed if the memory grew
    const x = Base.exports, k = `_${name}`;
    if (!this[k] || this[k].buffer !== x.memory.buffer) this[k] = new Float64Array(x.memory.buffer, fn(this.p), this.N);
    return this[k];
  }
  get q() { return this.view('q', Base.exports.grand_voice_q); }
  get q1() { return this.view('q1', Base.exports.grand_voice_q1); }
  get data() { return (this._data ??= unpackKey(Base.exports, Base.exports.grand_voice_model(this.p))); }
}
STATE.forEach((k, i) => Object.defineProperty(WasmVoice.prototype, k, { get() { const v = this.state(i); return FLAGS.has(k) ? v > 0 : v; } }));

// The engine, with the page's and the tests' hooks: noteOn returns the key's voice, e.voices lists
// them, and handle() takes the page's oscillator budget.
export class GrandWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  noteOn(key, velocity) {
    super.noteOn(key, velocity);
    const p = Base.exports.grand_by_key(this.e, key);
    return p ? new WasmVoice(p) : null;
  }
  handle(m) {
    if (m.type === 'budget') { if (Number.isFinite(m.modes)) Base.exports.grand_budget(this.e, m.modes); }
    else super.handle(m);
  }
  get voices() {
    const x = Base.exports;
    return Array.from({ length: x.grand_voices(this.e) }, (_, i) => new WasmVoice(x.grand_voice(this.e, i)));
  }
}
export const ready = () => GrandWasmEngine.ready();

// The model's functions the views and the tests call (grand-model.cpp's keyModel, boardModel,
// boardResponse, boardMobility, decayRates, hammerSpeed, sinFT), computed by the WebAssembly, and the
// engine itself for the slow-motion view's re-run of a strike (destroy() it after). boardModel
// returns the board's scalars (BOARD below) and its modes (m, n, omega, sigma, RL, RR and phi, K × 3);
// boardModel(P, { fmax, maxModes }) widens its modal band (the tests), and boardResponse leaves out
// the residual path above the band for a board with residual: false.
const BOARD = ['K', 'D', 'rhoh', 'fRes', 'Ginf', 'mb', 'fBridge', 'f11', 'density', 'fc', 'micGain', 'fmax'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x), params = nativeParams(BUILD);
  return {
    Engine: GrandWasmEngine,
    keyModel(m, P, board = null, fs = 48000) {
      const a = s.f64(params.length);
      params.forEach((p, i) => { a[i] = nativeValue(p, P[p.id]); });
      return unpackKey(x, x.grand_key_model(s.at, m, fs));
    },
    boardModel(P, { fmax = 0, maxModes = 0 } = {}) {
      const boardH = P.boardH ?? 9;
      x.grand_board(boardH, fmax, maxModes, s.at);
      const a = s.f64(BOARD.length), B = { boardH, maxModes };
      BOARD.forEach((k, i) => { B[k] = a[i]; });
      const K = B.K, at = x.grand_board_modes(boardH, fmax, maxModes), v = new Float64Array(x.memory.buffer, at, 9 * K); // (the call may grow the memory)
      const col = (j) => Float64Array.from({ length: K }, (_, k) => v[9 * k + j]);
      Object.assign(B, { m: col(0), n: col(1), omega: col(2), sigma: col(3), RL: col(4), RR: col(5), phi: new Float64Array(3 * K) });
      for (let k = 0; k < K; k++) for (let i = 0; i < 3; i++) B.phi[3 * k + i] = v[9 * k + 6 + i];
      return B;
    },
    boardResponse: (B, seg, f, mic) => x.grand_board_response(B.boardH, B.fmax ?? 0, B.maxModes ?? 0, B.residual === false ? 0 : 1, seg, f, mic),
    boardMobility(B, seg, f) { x.grand_board_mobility(B.boardH, seg, f, s.at); return Array.from(s.f64(2)); },
    decayRates(p, ns) { x.grand_decay_rates(p.sigInt, p.bridgeV, p.bridgeH, ns, s.at); const r = s.f64(2); return { prompt: r[0], after: r[1] }; },
    hammerSpeed: (vel) => x.grand_hammer_speed(vel),
    sinFT(q, kap, a) { x.grand_sin_ft(q, kap, a, s.at); return Array.from(s.f64(2)); },
  };
}

globalThis.GrandWasmEngine = GrandWasmEngine;
