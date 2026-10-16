// engine.mjs — the engine class a test or tool should play: the instrument's JavaScript
// engine, or its WebAssembly build when FORTE_ENGINE=wasm (docs/PLUGINS.md). Both have
// the same contract (shared/worklet.js).
//
//   import { INSTRUMENT } from '../<slug>/src/<slug>-instrument.js';
//   const XEngine = await loadEngine(INSTRUMENT);

export const ENGINE = process.env.FORTE_ENGINE || 'js';

export async function loadEngine(instrument, kind = ENGINE) {
  if (kind === 'wasm') {
    if (!instrument.wasm) throw new Error(`${instrument.id} has no WebAssembly build yet (FORTE_ENGINE=wasm)`);
    const mod = await import(instrument.wasm.module);
    await mod.ready?.();
    return mod[instrument.wasm.name];
  }
  if (kind !== 'js') throw new Error(`FORTE_ENGINE=${kind}: use js or wasm`);
  const E = (await import(instrument.engine.module))[instrument.engine.name];
  if (typeof E !== 'function') throw new Error(`${instrument.engine.module} exports no ${instrument.engine.name}`);
  return E;
}
