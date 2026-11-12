// breitwigner-wasm.js — the engine and model, built as WebAssembly from the physics in C++
// (native/instruments/breitwigner): BreitWignerWasmEngine, with the engine contract, and the
// model's functions for the views and the tests.

import { GROUPS } from './breitwigner-params.js';
import { wasmEngine, nativeParams, nativeValue, scratch } from '../../shared/wasm.js';

// (the descriptor's wasm field names it; this module also runs in the AudioWorklet, which has no URL)
const BUILD = { id: 'breitwigner', name: 'BreitWignerWasmEngine', groups: GROUPS, binary: () => new URL('../wasm/breitwigner.wasm', import.meta.url).href };

// The C++ engine's messages (breitwigner-engine.h) into the page's: 'frame', every state ringing
// now: its key, |ψ| (1: made at full velocity), and its frequency and full width in the lab (Hz).
// The engine sends a frame as several messages, each saying how many states are still to come.
function views(m, at) {
  if (m.type !== 0) return null;
  const v = m.values, states = (at.frame ??= []);
  for (let i = 0; i + 3 < v.length; i += 4) states.push({ key: v[i], amp: v[i + 1], f: v[i + 2], fwhm: v[i + 3] });
  if (m.key > 0) return null;
  at.frame = null;
  return { type: 'frame', states };
}

export const BreitWignerWasmEngine = wasmEngine(BUILD, { messages: views });
export const ready = () => BreitWignerWasmEngine.ready();

// The model, computed by the WebAssembly (breitwigner-model.cpp).
export async function wasmModel() {
  const x = await ready(), s = scratch(x);
  const params = nativeParams(BUILD);
  const read = (at, n) => Array.from(new Float64Array(x.memory.buffer, at, n));
  return {
    REF_KEY: x.breitwigner_constant(0), SHARE_MAX: x.breitwigner_constant(1), BOOST_SEMITONES: x.breitwigner_constant(2),
    // a key's state at rest: its mass (Hz), its own Γ/M, full width (Hz) and lifetime (s), and its
    // width and lifetime with the key-up channel open
    key(key, P) {
      s.f64(params.length).set(params.map((p) => nativeValue(p, P[p.id]))); // a choice as its index, as the engine gets it
      const out = s.at + 8 * params.length;
      x.breitwigner_key(key, s.at, out);
      const [mass, share, fwhm, tau, fwhmUp, tauUp] = read(out, 6);
      return { mass, share, fwhm, tau, fwhmUp, tauUp };
    },
    keyShare: (key, width, power) => x.breitwigner_key_share(key, width, power),
    totalWidth: (mass, share, channels) => x.breitwigner_total_width(mass, share, channels),
    lifetime: (fwhm) => x.breitwigner_lifetime(fwhm),
    // a state boosted by γ, in the lab: { f, fwhm } in Hz, and the boost's speed over c
    boosted(mass, fwhm, gamma) {
      x.breitwigner_boosted(mass, fwhm, gamma, s.at);
      const [f, w, speed] = read(s.at, 3);
      return { f, fwhm: w, speed };
    },
    line: (f, f0, fwhm) => x.breitwigner_line(f, f0, fwhm),
    heard: (f, f0, fwhm, phase) => x.breitwigner_heard(f, f0, fwhm, phase),
  };
}

globalThis.BreitWignerWasmEngine = BreitWignerWasmEngine;
