// pianet-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/pianet): PianetWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './pianet-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'pianet', name: 'PianetWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/pianet.wasm', import.meta.url).href };

// The C++ engine's messages (pianet-engine.h, msg), as the page reads them: 'release' (where the
// pad let go) and 'error'.
function messages(m) {
  if (m.type === 1) { const [y, F, v, t, V] = m.values; return { type: 'release', key: m.key, y, F, v, t, V }; }
  if (m.type === 2) return { type: 'error', message: 'numerical instability', key: m.key };
  return null;
}

export const PianetWasmEngine = wasmEngine(BUILD, { messages });
export const ready = () => PianetWasmEngine.ready();

// The model's functions the views and the tests call, computed by the WebAssembly
// (pianet-model.cpp): keyReed(m, P), a key's reed (its modes, stiffness at the pad, mode shapes);
// simulatePluck, one press of the key recorded frame by frame; releaseCurve, where the pad lets
// go for a set of velocities; keySpeed(vel); workOfAdhesion(F0); voicing(m) and voicingT(m), the
// pickups' gaps per key; PAD, the pad and bond's constants; and, for the tests, unitReed, the
// bare finite-element strip; pluckStop, a press against the T's pole; emFlux, emH2, esCap and ES,
// the pickups' formulas; and plateRail, the N's rail.
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
    // for the tests: the unit strip (L = EI = μ = 1) with a mass r at s and rotary inertia j, up to
    // every mode of its mesh (Λ_n and its shape(n, ξ), unit modal mass)
    unitReed({ r = 0, s: at = 1, j = 0, nModes = 6 } = {}) {
      const n = x.pianet_unit_reed(r, at, j, nModes, s.at), Lam = Array.from(s.f64(n));
      return { nModes: n, Lam, shape: (k, xi) => x.pianet_unit_shape(k, xi) }; // (until the next unitReed)
    },
    // a press of key m against the T's pole as an end stop `stop` (m) under the tip: the samples
    // on the stop and the tip's lowest point
    pluckStop(m, P, vel, stop, { fs = 96000, seconds = 0.3 } = {}) {
      s.f64(6).set(pad(P));
      x.pianet_pluck_stop(m, s.at, vel, fs, stop, seconds, s.at + 48);
      const [hits, lo] = s.f64(2, 48);
      return { hits, lo };
    },
    emFlux: (y, g) => x.pianet_em_flux(y, g),
    emH2: (Y, g) => x.pianet_em_h2(Y, g),
    esCap: (y, g, ye) => x.pianet_es_cap(y, g, ye),
    ES: (() => { x.pianet_es(s.at); const [C1, Cbus, R, Vb] = s.f64(4); return { C1, Cbus, R, Vb }; })(),
    // the N's plate rail at rate fs: step(ΔC) gives its voltage swing (one rail at a time)
    plateRail(fs) { x.pianet_rail_reset(fs); return { step: (dC) => x.pianet_rail_step(dC) }; },
    keySpeed: (vel) => x.pianet_key_speed(vel),
    workOfAdhesion: (F0) => x.pianet_work_of_adhesion(F0),
    voicing: (m) => x.pianet_voicing(m),
    voicingT: (m) => x.pianet_voicing_t(m),
    PAD,
  };
}

globalThis.PianetWasmEngine = PianetWasmEngine;
