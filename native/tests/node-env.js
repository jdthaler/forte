// node-env.js — linked into the native tests built as WebAssembly (--pre-js): Emscripten's getenv
// doesn't see Node's environment, so copy CI across, and the tests skip their timing checks on
// CI as they do natively.
Module['preRun'] = [].concat(Module['preRun'] || [], () => { if (process.env.CI) ENV['CI'] = process.env.CI; });
