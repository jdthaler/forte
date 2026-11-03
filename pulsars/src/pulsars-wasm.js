// pulsars-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/pulsars): PulsarsWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './pulsars-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'pulsars', name: 'PulsarsWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/pulsars.wasm', import.meta.url).href };

// The C++ engine's messages (pulsars-engine.h) into the page's: 'pulsar', a key's pulsar switching
// on, with its geometry (angles in rad, lengths in km) and its way here (s).
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    return { type: 'pulsar', key: m.key, f: v[0], alpha: v[1], zeta: v[2], beta: v[3], rho: v[4], rlc: v[5], rem: v[6], dm: v[7], tauS: v[8],
      smearL: v[9], smearR: v[10], dedisp: v[11], harmonics: v[12], velocity: v[13], sweep: v[14], smear: v[15] };
  }
  return null;
}

export const PulsarsWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => PulsarsWasmEngine.ready();

// The model (pulsars-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const C = (i) => x.pulsars_constant(i);
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  return {
    constants: { K_DM: C(0), C_KM: C(1), LC_SHARE: C(2), CORE_W: C(3), CONE_AT: C(4), CONE_W: C(5), BHAT: [C(6), C(7), C(8), C(9)],
      RIM_KM: C(10), M_SUN: C(11), FASTEST: C(12), BREAK_UP: C(13), NTAB: C(14), FLOOR_T: C(15) },
    // a key's pulsar: { f, alpha, zeta, beta, rho, rlc, rem, tauS, smearL, smearR, sweep } (rad, km, s)
    geometry(key, P, dm = P.dm) {
      const out = put(P); x.pulsars_geometry(key, s.at, dm, out);
      const a = read(out, 11);
      return { f: a[0], alpha: a[1], zeta: a[2], beta: a[3], rho: a[4], rlc: a[5], rem: a[6], tauS: a[7], smearL: a[8], smearR: a[9], sweep: a[10] };
    },
    // the intrinsic profile, peak 1, at m phases from −½ to ½ turn
    profile(key, P, m = 256) { if (8 * (params.length + m) > s.size) throw new Error('profile: too many phases'); const out = put(P); x.pulsars_profile(key, s.at, m, out); return read(out, m); },
    // the engine's tables (mean added back) at m phases: { L, R, dcL, dcR, harmonics, peak (the beam's own) }
    tables(key, P, { dm = P.dm, top = 20000, pieces = 256, m = 256 } = {}) {
      if (8 * (params.length + 2 * m + 4) > s.size) throw new Error(`tables: ${m} phases don't fit the scratch space`);
      const out = put(P); x.pulsars_tables(key, s.at, dm, top, pieces, m, out);
      const a = read(out, 2 * m + 4);
      return { L: a.slice(0, m), R: a.slice(m, 2 * m), dcL: a[2 * m], dcR: a[2 * m + 1], harmonics: a[2 * m + 2], peak: a[2 * m + 3] };
    },
    // one narrow channel at f MHz, w MHz wide, folded at m phases (the intrinsic profile's scale)
    channel(key, P, f, w, m = 128) { if (8 * (params.length + m) > s.size) throw new Error('channel: too many phases'); const out = put(P); x.pulsars_channel(key, s.at, f, w, m, out); return read(out, m); },
    // sub-band b's response at ω (rad/s): [re, im]
    transfer(key, P, b, w, { dm = P.dm, pieces = 256 } = {}) { const out = put(P); x.pulsars_transfer(key, s.at, dm, b, w, pieces, out); return read(out, 2); },
    arrived(key, P, b, t) { put(P); return x.pulsars_arrived(key, s.at, b, t); },
    delay: (dm, f) => x.pulsars_delay(dm, f),
    scatter: (dm, f, scale = 1) => x.pulsars_scatter(dm, f, scale),
    beamRadius: (r, rlc) => x.pulsars_beam_radius(r, rlc),
    beam: (xr, core) => x.pulsars_beam(xr, core),
    lightCylinder: (f) => x.pulsars_light_cylinder(f),
  };
}

// For the tests: a key's voice's harmonics and table size, on an engine instance.
export async function engineProbe() {
  const x = await ready();
  return { harmonics: (e, key) => x.pulsars_harmonics(x.forte_engine(e.h), key), tableSize: (e, key) => x.pulsars_table_size(x.forte_engine(e.h), key) };
}

globalThis.PulsarsWasmEngine = PulsarsWasmEngine;
