// gamelan-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/gamelan): GamelanWasmEngine, with the engine contract, and the model's
// functions for the views and the tests.

import { GROUPS } from './gamelan-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'gamelan', name: 'GamelanWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/gamelan.wasm', import.meta.url).href };

// The C++ engine's messages (gamelan-engine.h, Msg) as the page's 'gamelan' message: the last struck
// key's pair (beat, age, family, the partners' notes), then every sounding key's level.
function views(m, e) {
  const s = (e.views ??= { type: 'gamelan', focus: -1, beat: 0, age: 0, family: 0, f: [0, 0], voices: [] });
  if (m.type === 1) {
    s.focus = m.key; s.beat = m.values[0]; s.age = m.values[1]; s.family = m.values[2]; s.f = [m.values[3], m.values[4]];
    return m.values[1] === 0 ? { ...s, struck: true } : null;
  }
  if (m.type !== 2) return null;
  s.voices = Array.from({ length: m.key }, (_, i) => [m.values[2 * i], m.values[2 * i + 1]]);
  return { ...s };
}

const Base = wasmEngine(BUILD, { messages: views });

// The engine, with the tests' hooks on a key's voice: active(key), modes(key) (how many each
// partner rings), partners(key) (1 or 2), beat(key) (Hz), damped(key), level(key), partnerF1(key, s)
// and displacement(key, s, p) (mode p of partner s; −1: its tube).
export class GamelanWasmEngine extends Base {
  constructor(fs) { super(fs); this.e = Base.exports.forte_engine(this.h); }
  active(key) { return Base.exports.gamelan_active(this.e, key) > 0; }
  modes(key) { return Base.exports.gamelan_modes(this.e, key); }
  partners(key) { return Base.exports.gamelan_partners(this.e, key); }
  beat(key) { return Base.exports.gamelan_beat(this.e, key); }
  damped(key) { return Base.exports.gamelan_damped(this.e, key) > 0; }
  level(key) { return Base.exports.gamelan_level(this.e, key); }
  partnerF1(key, s) { return Base.exports.gamelan_partner_f1(this.e, key, s); }
  displacement(key, s, p) { return Base.exports.gamelan_displacement(this.e, key, s, p); }
}
export const ready = () => GamelanWasmEngine.ready();

export const FAMILIES = ['gangsa', 'saron', 'bonang', 'gong'];
export const KINDS = ['bend', 'torsion', 'round', 'diameters', 'rim', 'air'];

// The model, computed by the WebAssembly (gamelan-model.cpp): design(key, P, v), a key's modes and
// its bar, tube and gong; noteFreq(key, P); larasCents(key, laras) and larasDegree(key, laras);
// register(key, instrument) { family, band, name }; huang(b, r, s), Huang's determinant;
// timoshenko(hL, n), its roots b; betaL(n), bendShape(n, u); torsionFreq(L, w, h, n), torsionK(w, h);
// bar(family, f1, thick) { L, w, h }; tube(w, f) { f, sigma, a }; gongTable(which); pulse(f, tau);
// contact(family, softness, f, v); ringTime(family, t60, f); and the constants.
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const index = (id) => (typeof id === 'number' ? id : params.find((p) => p.id === 'instrument').options.findIndex(([v]) => v === id));
  const larasIndex = (l) => (typeof l === 'number' ? l : params.find((p) => p.id === 'laras').options.findIndex(([v]) => v === l));
  const put = (P) => { s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); return s.at + 8 * params.length; };
  const cstr = (ptr) => { const b = new Uint8Array(x.memory.buffer, ptr); let n = 0; while (b[n]) n++; return new TextDecoder().decode(b.subarray(0, n)); };
  return {
    kCurve: x.gamelan_constant(0), kHarden: x.gamelan_constant(1), kGongF1: x.gamelan_constant(2),
    bronze: { E: x.gamelan_constant(3), rho: x.gamelan_constant(4), nu: x.gamelan_constant(5), kappa: x.gamelan_constant(6) },
    design(key, P, v = 0.7) {
      const out = put(P), n = x.gamelan_key_design(key, s.at, v, out), h = new Float64Array(x.memory.buffer, out, 16 + 6 * n);
      const modes = Array.from({ length: n }, (_, i) => {
        const o = 16 + 6 * i;
        return { f: h[o], sigma: h[o + 1], amp: h[o + 2], out: h[o + 3], kind: KINDS[h[o + 4]], order: h[o + 5] };
      });
      return {
        modes, family: FAMILIES[h[1]], band: h[2], f1: h[3], bar: h[4] ? { L: h[4], w: h[5], h: h[6] } : null,
        tube: h[7] ? { f: h[7], sigma: h[8], a: h[9], k: h[10] } : null, round2: h[11], G: h[12], Gamma: h[13], tau: h[14], pairs: h[15] > 0,
      };
    },
    noteFreq: (key, P) => { const at = put(P); return x.gamelan_note_freq(key, at - 8 * params.length); },
    larasCents: (key, laras) => x.gamelan_laras_cents(key, larasIndex(laras)),
    larasDegree: (key, laras) => x.gamelan_laras_degree(key, larasIndex(laras)),
    register: (key, instrument) => ({ family: FAMILIES[x.gamelan_family(key, index(instrument))], band: x.gamelan_band(key, index(instrument)), name: cstr(x.gamelan_register_name(key, index(instrument))) }),
    huang: (b, r, q) => x.gamelan_huang(b, r, q),
    timoshenko(hL, n) { const k = x.gamelan_timoshenko(hL, n, s.at); return Array.from(s.f64(k)); },
    betaL: (n) => x.gamelan_beta_l(n),
    bendShape: (n, u) => x.gamelan_bend_shape(n, u),
    torsionFreq: (L, w, h, n) => x.gamelan_torsion_freq(L, w, h, n),
    torsionK: (w, h) => x.gamelan_torsion_k(w, h),
    bar(family, f1, thick = 1) { x.gamelan_bar(FAMILIES.indexOf(family), f1, thick, s.at); const m = s.f64(3); return { L: m[0], w: m[1], h: m[2] }; },
    tube(w, f) { x.gamelan_tube(w, f, s.at); const m = s.f64(3); return { f: m[0], sigma: m[1], a: m[2] }; },
    gongTable(which) {
      const n = x.gamelan_gong_table(which === 'gong' ? 1 : 0, s.at), m = s.f64(3 * n);
      return Array.from({ length: n }, (_, i) => ({ ratio: m[3 * i], m: m[3 * i + 1], kind: KINDS[m[3 * i + 2]] }));
    },
    pulse: (f, tau) => x.gamelan_pulse(f, tau),
    contact: (family, soft, f, v) => x.gamelan_contact(FAMILIES.indexOf(family), soft, f, v),
    ringTime: (family, t60, f) => x.gamelan_ring_time(FAMILIES.indexOf(family), t60, f),
  };
}

globalThis.GamelanWasmEngine = GamelanWasmEngine;
