// ionchain-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/ionchain): IonChainWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './ionchain-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'ionchain', name: 'IonChainWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/ionchain.wasm', import.meta.url).href };

// The C++ engine's two messages (ionchain-engine.h, msg) as the page's 'ions': the newest voice's
// key, its trap's axial frequency (heard), whether the cooling light is on, and each ion's RMS
// displacement along the axis (z) and across it (x), in ℓ.
function ions(m, engine) {
  if (m.type === 1) { engine.pending = { key: m.key, f: m.values[0], cooled: m.values[1] > 0, z: Array.from(m.values.subarray(2)) }; return null; }
  if (m.type === 2 && engine.pending?.key === m.key) {
    const out = { type: 'ions', ...engine.pending, x: Array.from(m.values) };
    engine.pending = null;
    return out;
  }
  return null;
}

const Base = wasmEngine(BUILD, { messages: ions });

// The engine, with the tests' hook: e.voices, each sounding voice's state and its modes (velocity
// amplitude, frequency in Hz, decay rate per second).
export class IonChainWasmEngine extends Base {
  constructor(fs) {
    super(fs);
    this.e = Base.exports.forte_engine(this.h);
  }
  get voices() {
    const x = Base.exports, s = scratch(x), out = [];
    for (let i = 0; i < x.ionchain_pool(); i++) {
      x.ionchain_voice(this.e, i, s.at);
      const head = s.f64(10);
      if (!head[0]) continue;
      const M = head[6], a = s.f64(10 + 3 * M);
      out.push({ slot: i, held: a[1] > 0, cooled: a[2] > 0, stolen: a[3] > 0, key: a[4], N: a[5], M, f0: a[7], bend: a[8], on: a[9],
        modes: Array.from({ length: M }, (_, m) => ({ amp: a[10 + 3 * m], f: a[11 + 3 * m], sigma: a[12 + 3 * m] })) });
    }
    return out;
  }
}
export const ready = () => IonChainWasmEngine.ready();

// The model (ionchain-model.h), computed by the WebAssembly: the constants; lengthScale(fz), ℓ in
// metres for a ⁴⁰Ca⁺ trap at fz; pulse(f, τ), the half-sine pulse's spectrum; linearChain(N), the
// line's equilibrium; zigzagAlpha(N), α_c; and modes(P): the crystal for the parameters P with its
// modes and couplings, as the engine builds them.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  x.ionchain_constants(s.at);
  const [SLOW, MAXN, ION_U] = s.f64(3);
  const setP = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at; }; // a choice as its index
  return {
    SLOW, MAXN, ION_U,
    lengthScale: (fz) => x.ionchain_length_scale(fz),
    pulse: (f, tau) => x.ionchain_pulse(f, tau),
    linearChain(N) { x.ionchain_linear_chain(N, s.at); return Array.from(s.f64(N)); },
    zigzagAlpha: (N) => x.ionchain_zigzag_alpha(N),
    modes(P) {
      const at = setP(P), out = at + 8 * params.length, M = x.ionchain_modes(at, out);
      const a = new Float64Array(x.memory.buffer, out, 5 + 2 * (M / 2) + 6 * M + M * M);
      const N = a[0];
      let o = 5;
      const take = (n) => { const v = Array.from(a.subarray(o, o + n)); o += n; return v; };
      const xs = take(N), zs = take(N), lam = take(M), kick = take(M), wl = take(M), wr = take(M), sR = take(M), sD = take(M);
      const B = Array.from({ length: M }, () => take(M)); // B[d][m]
      return { N, M, zigzag: a[2] > 0, reach: a[3], spacing: a[4], x: xs, z: zs, lam, kick, wl, wr, sR, sD, B };
    },
  };
}

globalThis.IonChainWasmEngine = IonChainWasmEngine;
