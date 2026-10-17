// pianet-wasm.js — the engine and model built as WebAssembly from the same physics in C++
// (native/instruments/pianet): PianetWasmEngine, with the engine contract, and the model's
// functions for the views. The page runs it when it can and falls back to the JavaScript
// (pianet-engine.js, pianet-model.js).

import { GROUPS } from './pianet-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'pianet', name: 'PianetWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/pianet.wasm', import.meta.url).href };

// The C++ engine's messages (pianet-engine.h, msg) back into the JavaScript engine's: 'release'
// (where the pad let go) and 'error'.
function messages(m) {
  if (m.type === 1) { const [y, F, v, t, V] = m.values; return { type: 'release', key: m.key, y, F, v, t, V }; }
  if (m.type === 2) return { type: 'error', message: 'numerical instability', key: m.key };
  return null;
}

export const PianetWasmEngine = wasmEngine(BUILD, { messages });
export const ready = () => PianetWasmEngine.ready();

// The model's functions the views call (pianet-model.js's keyReed, simulatePluck, releaseCurve,
// keySpeed, workOfAdhesion, voicing, voicingT and PAD), computed by the WebAssembly.
const MODE = ['f', 'sigma', 'T60', 'ratio', 'phiC', 'phiT', 'release'];
const PAD_KEYS = ['a0', 'Estar', 'v0', 'aMin', 'heal', 'preload', 'travel', 'vRet'];
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const pad = (P) => [P.tack, P.rate, P.padK, P.padC, P.tipMass, P.loss];
  x.pianet_pad(s.at);
  const PAD = Object.fromEntries(PAD_KEYS.map((k, i) => [k, s.f64(PAD_KEYS.length)[i]]));
  const keyReed = (m, P, fs = 96000) => {
    const n = x.pianet_reed(m, P.tipMass, P.loss, fs, s.at), a = s.f64(n).slice();
    const [key, f0, L, b, h, mu, EI, r, Msolder, xc, kc, tipGain, N] = a;
    const modes = Array.from({ length: N }, (_, j) => Object.fromEntries(MODE.map((k, i) => [k, a[13 + 7 * j + i]])));
    const { tipMass, loss } = P;
    return { key, f0, L, b, h, mu, EI, r, Msolder, xc, kc, tipGain, modes, shape: (j, xm) => x.pianet_reed_shape(m, tipMass, loss, fs, j, xm) };
  };
  return {
    keyReed,
    simulatePluck(m, P, vel, { fs = 96000, periods = 6, frames = 480, maxT = 0.4 } = {}) {
      s.f64(6).set(pad(P));
      const p = x.pianet_simulate(m, s.at, vel, fs, periods, frames, maxT);
      const a = new Float64Array(x.memory.buffer, p, x.pianet_result_size()).slice(); // (the memory may have grown)
      const [released, y, F, v, t, V, tEnd, N, nf] = a;
      let i = 9;
      const take = (k) => { const out = a.slice(i, i + k); i += k; return out; };
      const out = { kr: keyReed(m, P, fs), rel: released ? { y, F, v, t, V } : null, tEnd };
      for (const k of ['t', 'h', 'face', 'yc', 'y', 'F', 'a']) out[k] = take(nf);
      out.q = Array.from({ length: nf }, () => take(N));
      return out;
    },
    releaseCurve(m, P, vels, fs = 96000) {
      s.f64(6).set(pad(P));
      s.f64(vels.length, 48).set(vels);
      const at = 48 + 8 * vels.length;
      x.pianet_release_curve(m, s.at, s.at + 48, vels.length, fs, s.at + at);
      const o = s.f64(7 * vels.length, at);
      return vels.map((_, j) => {
        const [vel, V, y, F, v, t, stuck] = o.subarray(7 * j, 7 * j + 7);
        return stuck ? { vel, V, y, F, v, t, stuck: true } : { vel, V, y, F, v, t };
      });
    },
    keySpeed: (vel) => x.pianet_key_speed(vel),
    workOfAdhesion: (F0) => x.pianet_work_of_adhesion(F0),
    voicing: (m) => x.pianet_voicing(m),
    voicingT: (m) => x.pianet_voicing_t(m),
    PAD,
  };
}

globalThis.PianetWasmEngine = PianetWasmEngine;
