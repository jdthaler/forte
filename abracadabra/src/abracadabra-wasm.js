// abracadabra-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/abracadabra): AbracadabraWasmEngine, with the engine contract, and the
// model's functions for the views and the tests.

import { GROUPS } from './abracadabra-params.js';
import { wasmEngine, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'abracadabra', name: 'AbracadabraWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/abracadabra.wasm', import.meta.url).href };

// The C++ engine's messages (abracadabra-engine.h) into the page's: 'frame', every charged key now
// (its magnet's charge, the field's amplitude against its mean, the axion's flux and the channel's
// noise in μΦ₀ rms); 'base', the last key struck mixed down to its axion's frequency, complex
// samples in μΦ₀ at `rate` Hz.
function views(m) {
  const v = m.values;
  if (m.type === 0) {
    const voices = [];
    for (let i = 0; i + 4 < v.length; i += 5) voices.push({ key: v[i], charge: v[i + 1], field: v[i + 2], flux: v[i + 3], noise: v[i + 4] });
    return { type: 'frame', voices };
  }
  if (m.type === 1) {
    const n = (v.length - 1) / 2;
    return { type: 'base', key: m.key, rate: v[2 * n], re: Array.from({ length: n }, (_, i) => v[2 * i]), im: Array.from({ length: n }, (_, i) => v[2 * i + 1]) };
  }
  return null;
}

export const AbracadabraWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => AbracadabraWasmEngine.ready();

// The model (abracadabra-model.cpp), computed by the WebAssembly.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const C = (i) => x.abracadabra_constant(i);
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  const K = {
    C_KMS: C(0), H_EV: C(1), HBARC_GEV_M: C(2), PHI0: C(3), RHO_DM: C(4), V0: C(5), V_LAB: C(6), STREAM_V: C(7), STREAM_SIGMA: C(8),
    ABRA_R_IN: C(9), ABRA_R_OUT: C(10), ABRA_H: C(11), ABRA_V: C(12), ABRA_G: C(13), ABRA_LOOP: C(14), ABRA_B: C(15), M_IN: C(16),
    L_T: C(17), SQUID_NOISE: C(18), SCALE: C(19), CHANNEL_Q: C(20), MAX_WAVES: C(21), STREAM_WAVES: C(22),
  };
  return {
    constants: K,
    axionFrequency: (m) => x.abracadabra_axion_frequency(m),
    axionMass: (f) => x.abracadabra_axion_mass(f),
    couplingPerMeter: (g, rho) => x.abracadabra_coupling_per_meter(g, rho),
    pickupFlux: (g, rho, B, size) => x.abracadabra_pickup_flux(g, rho, B, size),
    squidFlux: (g, rho, B, size) => x.abracadabra_squid_flux(g, rho, B, size),
    channelNoise: (noise, f) => x.abracadabra_channel_noise(noise, f),
    geometryFactor: (a, R, Ro, h) => x.abracadabra_geometry(a, R, Ro, h),
    ellipK: (k) => x.abracadabra_ellip_k(k),
    ellipE: (k) => x.abracadabra_ellip_e(k),
    speedPdf: (v, v0, vlab) => x.abracadabra_speed_pdf(v, v0, vlab),
    linePdf: (d, fa, v0, vlab) => x.abracadabra_line_pdf(d, fa, v0, vlab),
    lineMean: (fa, v0, vlab) => x.abracadabra_line_mean(fa, v0, vlab),
    lineSpread: (fa, v0, vlab) => x.abracadabra_line_spread(fa, v0, vlab),
    coherenceTime: (fa, v0, vlab) => x.abracadabra_coherence_time(fa, v0, vlab),
    // a test universe: seed it, then read its field at t, or its waves' speeds
    seedField: (seed) => x.abracadabra_field_seed(seed >>> 0),
    fieldAt(t, fa, { halo = K.MAX_WAVES, stream = K.STREAM_WAVES, v0 = K.V0, vlab = K.V_LAB, vs = K.STREAM_V, share = 0 } = {}) {
      x.abracadabra_field_at(t, fa, halo, stream, v0, vlab, vs, share, s.at);
      const [re, im] = read(s.at, 2);
      return { re, im };
    },
    fieldSpeeds(v0 = K.V0, vlab = K.V_LAB, vs = K.STREAM_V) {
      const n = K.MAX_WAVES + K.STREAM_WAVES;
      x.abracadabra_field_speeds(v0, vlab, vs, s.at);
      const a = read(s.at, n);
      return { halo: a.slice(0, K.MAX_WAVES), stream: a.slice(K.MAX_WAVES) };
    },
  };
}

globalThis.AbracadabraWasmEngine = AbracadabraWasmEngine;
