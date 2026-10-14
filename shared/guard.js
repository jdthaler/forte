// guard.js — used by every AudioWorklet wrapper. A thrown error or a NaN must not
// silence the page for good (a NaN would also lodge in the room reverb and limiter
// downstream): zero the block, stop the voices, tell the page (at most once a second).

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function runGuarded(proc, L, R, n, stopAll) {
  try { proc.engine.process(L, R, n); } catch (err) { return fail(proc, L, R, stopAll, `Audio engine error: ${err.message}`); }
  for (let i = 0; i < n; i++) if (!Number.isFinite(L[i] + R[i])) return fail(proc, L, R, stopAll, 'The model went numerically unstable at these settings; its notes were stopped.');
}

function fail(proc, L, R, stopAll, message) {
  L.fill(0); R.fill(0);
  try { stopAll(); } catch { /* keep going */ }
  const t = now();
  if (!(t - (proc.lastFail ?? -Infinity) < 1000)) { proc.lastFail = t; proc.port.postMessage({ type: 'error', message }); }
}
