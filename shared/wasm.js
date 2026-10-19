// wasm.js — an instrument's WebAssembly build (native/, docs/PLUGINS.md) in JavaScript: loading it
// in a page, an AudioWorklet or Node, and a class with the engine contract (shared/worklet.js)
// over the C functions of native/web/engine-api.cpp, which the worklet, the tests and the tools play.
//
//   export const XWasmEngine = wasmEngine({ id, name: 'XWasmEngine', groups: GROUPS,
//     binary: () => new URL('../wasm/x.wasm', import.meta.url).href });  // in <slug>/src/<slug>-wasm.js
// (Not the descriptor itself: an AudioWorklet has no URL, so a module that builds one at import
// fails there, silently.)
//   await XWasmEngine.ready();                            // page and Node: fetch or read the .wasm
//   XWasmEngine.load(bytes);                              // AudioWorklet: from the bytes the page sends
//   const e = new XWasmEngine(sampleRate);                // then as any engine

// Parameters in the order the native tables have them (tools/gen-native-params.mjs): the
// descriptor's, less those only a page uses (the computer keys' velocity), then its console's.
export const PAGE_ONLY = ['velocity'];
export function nativeParams(I) {
  const skip = I.pageOnly ?? PAGE_ONLY;
  return [...I.groups, ...(I.console?.groups ?? [])].flatMap((g) => g.params).filter((p) => !skip.includes(p.id));
}
// A parameter's number for the native code: a choice's index, a toggle's 0 or 1.
export function nativeValue(p, v) {
  if (p.type === 'select') { const k = p.options.findIndex(([x]) => x === v); return k < 0 ? p.options.findIndex(([x]) => x === p.def) : k; }
  if (p.type === 'checkbox') return v ? 1 : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : p.def;
}

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';

// Compile and instantiate synchronously (an AudioWorklet or Node may; a page's main thread may
// not for anything but tiny modules, so it uses instantiateAsync). Imports are stubs: the
// builds need none but Emscripten's memory-growth notice.
export function instantiate(bytes) {
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module, stubs(module));
  instance.exports._initialize?.();
  return instance.exports;
}
export async function instantiateAsync(url) {
  let bytes;
  if (isNode) bytes = (await import('node:fs')).readFileSync(new URL(url));
  else bytes = await (await fetch(url)).arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, stubs(module));
  instance.exports._initialize?.();
  return instance.exports;
}
function stubs(module) {
  const imports = {};
  for (const { module: m, name, kind } of WebAssembly.Module.imports(module)) {
    if (kind !== 'function') throw new Error(`the WebAssembly imports ${m}.${name} (${kind})`);
    (imports[m] ??= {})[name] = () => 0;
  }
  return imports;
}

// an ASCII C string (an AudioWorklet may have no TextDecoder)
const cString = (x, p) => { const b = new Uint8Array(x.memory.buffer); let s = ''; while (b[p]) s += String.fromCharCode(b[p++]); return s; };

// The engine class for an instrument: { id, name, groups, console?, pageOnly?, binary: () => URL
// of its .wasm }. A console (the descriptor's: state the page keeps in P beside the groups, such as
// the organ's drawbars) gives its parameters from every P set so far, from its defaults on. `messages(m, engine)`, if given, turns an engine's posted Message ({ type, key,
// values }) into what its page expects, or into nothing (null) while it gathers several.
export function wasmEngine(I, { messages } = {}) {
  const params = nativeParams(I);
  let x = null;
  const check = (exports) => { // a stale build would set the wrong parameters: refuse it
    const n = exports.forte_param_count();
    const ids = Array.from({ length: n }, (_, i) => cString(exports, exports.forte_param_id(i)));
    if (ids.join() !== params.map((p) => p.id).join()) throw new Error(`${I.id}: the WebAssembly's parameters (${ids}) are not the descriptor's; rebuild it`);
    return exports;
  };
  class WasmEngine {
    // The page's main thread and Node: load the build (once).
    static async ready() { x ??= check(await instantiateAsync(I.binary())); return x; }
    // An AudioWorklet: from the bytes the page fetched.
    static load(bytes) { x ??= check(instantiate(bytes)); return x; }
    static get exports() { return x; }
    // It takes all the parameters and computes per-note data itself.
    static fullParams = true;

    constructor(fs) {
      if (!x) throw new Error(`${I.id}: the WebAssembly is not loaded (await ready() or load(bytes))`);
      this.fs = fs;
      this.h = x.forte_create(fs);
    }
    setParams(P) {
      if (I.console) P = { ...P, ...I.console.get(Object.assign(this.consoleState ??= JSON.parse(JSON.stringify(I.console.defaults)), P)) };
      const a = new Float64Array(x.memory.buffer, x.forte_params(this.h), params.length);
      params.forEach((p, i) => { if (p.id in P) a[i] = nativeValue(p, P[p.id]); });
      x.forte_set_params(this.h);
    }
    noteOn(key, velocity) { x.forte_note_on(this.h, key, velocity); }
    noteOff(key, velocity) { x.forte_note_off(this.h, key, velocity ?? -1); }
    setSustain(on) { x.forte_set_sustain(this.h, on ? 1 : 0); }
    allNotesOff() { x.forte_all_notes_off(this.h); }
    handle(m) {
      if (m.type === 'pressure') x.forte_pressure(this.h, m.value, m.key ?? -1);
      else if (m.type === 'bend') x.forte_bend(this.h, m.value);
      else if (m.type === 'noteBend') x.forte_note_bend(this.h, m.value, m.key);
      else if (m.type === 'slide') x.forte_slide(this.h, m.value ?? NaN, m.key);
    }
    voiceCount() { return x.forte_voice_count(this.h); }
    // the keyboard's tuning the C++ makes of the parameters set (forte/tuning.h): each pitch
    // class's cents from equal temperament at A = 440 Hz (the tests compare it with shared/tuning.js)
    tuningCents() { const s = scratch(x); return x.forte_tuning_cents(this.h, s.at) ? Array.from(s.f64(12)) : null; }
    process(L, R, n) {
      for (let at = 0; at < n; at += 128) {
        const m = Math.min(128, n - at);
        x.forte_process(this.h, m);
        L.set(new Float32Array(x.memory.buffer, x.forte_left(this.h), m), at);
        R.set(new Float32Array(x.memory.buffer, x.forte_right(this.h), m), at);
      }
      if (this.post && messages) {
        for (let p; (p = x.forte_message(this.h));) {
          const v = new DataView(x.memory.buffer, p, 128);
          const count = v.getUint16(4, true), values = new Float32Array(x.memory.buffer, p + 8, count).slice();
          const m = messages({ type: v.getUint16(0, true), key: v.getInt16(2, true), values }, this);
          if (m) this.post(m);
        }
      }
    }
    destroy() { x.forte_destroy(this.h); this.h = 0; }
  }
  Object.defineProperty(WasmEngine, 'name', { value: I.name });
  return WasmEngine;
}

// A model function's arguments and results go through a scratch area in the module's memory.
export function scratch(exports) {
  const at = exports.forte_scratch(), size = exports.forte_scratch_size();
  return { at, f64: (n, offset = 0) => new Float64Array(exports.memory.buffer, at + offset, n), size };
}
