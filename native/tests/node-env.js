// Emscripten's getenv reads its own ENV, not Node's: hand the tests CI, so the CPU timing tests
// skip on GitHub as the Linux ones do. A module that never calls getenv has no ENV.
Module['preRun'] = [].concat(Module['preRun'] || [], () => {
  if (process.env.CI && typeof ENV !== 'undefined') ENV['CI'] = process.env.CI;
});
