// engine.mjs — the engine class a test or tool should play: the instrument's C++ engine
// (native/instruments/<slug>), built as WebAssembly (docs/PLUGINS.md), with the engine
// contract of shared/worklet.js.
//
//   import { INSTRUMENT } from '../<slug>/src/<slug>-instrument.js';
//   const XEngine = await loadEngine(INSTRUMENT);

export async function loadEngine(instrument) {
  if (!instrument.wasm) throw new Error(`${instrument.id} has no WebAssembly build`);
  const mod = await import(instrument.wasm.module);
  await mod.ready?.();
  const E = mod[instrument.wasm.name];
  if (typeof E !== 'function') throw new Error(`${instrument.wasm.module} exports no ${instrument.wasm.name}`);
  return E;
}
