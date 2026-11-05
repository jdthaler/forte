// in-plugin.js — an instrument's page inside its plugin's window. The window
// (native/plugin/editor.html) shows the page in a frame above the plugin's own controls and keys,
// and the page shows only its views (shared/layout.js, layout.css), drawing what the plugin plays:
//   - the parameters, the keys sounding and the pedal, as the plugin has them (the host's
//     automation, its presets, MIDI and the window's own controls all move them);
//   - the engine's messages (Engine::post), turned into the page's as its WebAssembly module
//     turns them (wasm.js: the engine class's `translate`);
//   - the engine's sound, before the output chain, as the page's analyser hears it: a stand-in
//     for the Web Audio graph (AnalyserNode and its context) that the views read.
// The page plays nothing itself: the window plays the keys, and the plugin the notes.
//
// The window hands the frame `window.forteViews` (editor.html):
//   describe        the plugin's describe(): its parameters, in its order
//   fs              the plugin's sample rate
//   listen(f)       f(update) after each of the window's polls: { p: [[index, x, text, value]…],
//                   keys: [key…], vel: [velocity…], pedal, m: [[type, key, values…]…], s: the sound
//                   since the last poll, as base64 float32 }

export const host = (() => {
  try { return window.parent !== window ? window.parent.forteViews ?? null : null; } catch { return null; } // another origin's frame: not ours
})();
export const inPlugin = !!host;
if (inPlugin) {
  document.documentElement.classList.add('in-plugin');
  // The window is a desktop's, whatever the frame's height: the phones' layout (a page that
  // scrolls, layout.css) never applies in it.
  const phone = /max-height:\s*500px|^\(max-width:\s*600px\)$/;
  const strip = () => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i--) if (rules[i].media && phone.test(rules[i].conditionText ?? rules[i].media.mediaText)) sheet.deleteRule(i);
    }
  };
  strip();
  addEventListener('DOMContentLoaded', strip);
}

// ---- the sound: what the plugin heard, played back at the rate it comes in ------------------------
const RING = 1 << 17; // samples kept: the longest analyser (32768) and then some
const ring = new Float32Array(RING);
let written = 0, head = 0, headAt = 0, fs = host?.fs || 48000;
export function hear(b64) {
  if (!b64) return;
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const x = new Float32Array(bytes.buffer, 0, bytes.length >> 2);
  for (let i = 0; i < x.length; i++) ring[(written + i) % RING] = x[i];
  written += x.length;
}
// The newest sample the views see: a little behind the newest heard, moving on in real time, so
// each animation frame sees the sound move on as it would in Web Audio.
function now() {
  const t = performance.now();
  head = Math.min(written, head + ((t - headAt) * fs) / 1000);
  headAt = t;
  if (written - head > 0.25 * fs) head = written - 0.05 * fs; // fell behind (a hidden window): catch up
  return Math.floor(head);
}

// An FFT of n (a power of two) points, in place: re and im.
const plans = new Map();
function plan(n) {
  if (plans.has(n)) return plans.get(n);
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  // the Blackman window Web Audio's analyser applies (α = 0.16)
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
  const p = { rev, cos, sin, win, re: new Float64Array(n), im: new Float64Array(n) };
  plans.set(n, p);
  return p;
}
export function fft(re, im, p = plan(re.length)) {
  const n = re.length;
  for (let i = 0; i < n; i++) { const j = p.rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let s = 0; s < n; s += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const a = s + k, b = a + half, c = p.cos[t], d = p.sin[t];
        const xr = re[b] * c - im[b] * d, xi = re[b] * d + im[b] * c;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

// An AnalyserNode's reading of the sound, as Web Audio defines it: the last fftSize samples,
// Blackman-windowed, |X[k]| / fftSize smoothed over time by smoothingTimeConstant, in dB.
class Analyser {
  constructor(context) {
    this.context = context;
    this.fftSize = 2048; this.smoothingTimeConstant = 0.8; this.minDecibels = -100; this.maxDecibels = -30;
    this.mag = null; this.at = -1;
  }
  get frequencyBinCount() { return this.fftSize / 2; }
  connect(x) { return x; }
  disconnect() {}
  last(out) { // the newest out.length samples
    const end = now();
    for (let i = 0; i < out.length; i++) { const t = end - out.length + i; out[i] = t >= 0 && t > written - RING ? ring[((t % RING) + RING) % RING] : 0; }
  }
  spectrum() {
    const n = this.fftSize, end = now();
    if (this.mag && this.mag.length === n / 2 && end === this.at) return this.mag; // read twice in a frame: once
    const p = plan(n), { re, im, win } = p;
    for (let i = 0; i < n; i++) { const t = end - n + i; re[i] = t >= 0 && t > written - RING ? ring[t % RING] * win[i] : 0; im[i] = 0; }
    fft(re, im, p);
    if (!this.mag || this.mag.length !== n / 2) this.mag = new Float64Array(n / 2);
    const tau = Math.min(1, Math.max(0, this.smoothingTimeConstant));
    for (let k = 0; k < n / 2; k++) {
      const v = tau * this.mag[k] + (1 - tau) * (Math.hypot(re[k], im[k]) / n);
      this.mag[k] = Number.isFinite(v) ? v : 0;
    }
    this.at = end;
    return this.mag;
  }
  getFloatFrequencyData(out) { const m = this.spectrum(), k = Math.min(out.length, m.length); for (let i = 0; i < k; i++) out[i] = 20 * Math.log10(m[i]); }
  getByteFrequencyData(out) {
    const m = this.spectrum(), k = Math.min(out.length, m.length), lo = this.minDecibels, span = this.maxDecibels - lo;
    for (let i = 0; i < k; i++) out[i] = Math.max(0, Math.min(255, Math.floor((255 * (20 * Math.log10(m[i]) - lo)) / span)));
  }
  getFloatTimeDomainData(out) { this.last(out); }
  getByteTimeDomainData(out) { const x = new Float32Array(out.length); this.last(x); for (let i = 0; i < x.length; i++) out[i] = Math.max(0, Math.min(255, Math.floor(128 * (1 + x[i])))); }
}

// What a page's onAudio gets: the context (its rate, analysers), the engine's node (its port's
// onmessage hears the engine; connecting an analyser to it is all a page does with it), and the
// chain, which the plugin runs itself.
export function graph() {
  const ctx = {
    sampleRate: fs, state: 'running', baseLatency: 0, outputLatency: 0,
    get currentTime() { return performance.now() / 1000; },
    resume: async () => {}, suspend: async () => {}, close: async () => {},
    createAnalyser: () => new Analyser(ctx),
  };
  const node = { context: ctx, port: { onmessage: null, postMessage() {} }, connect: (x) => x, disconnect() {} };
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55; // as shell.js's
  return { ctx, node, analyser, tone: null, master: null, roomGain: null, chain: { tap: node, apply() {} } };
}

// The page's audio, from the plugin: { ctx, node, analyser, chain, … } as shell.startAudio makes
// them. wasm: the descriptor's (its module and class, for the messages); onUpdate(u) hears each
// of the window's polls before the engine's messages go to node.port.onmessage.
export async function pluginAudio(wasm, onUpdate) {
  fs = host.fs || fs;
  let translate = null;
  try { translate = (await import(new URL(wasm.module, location.href).href))[wasm.name]?.translate ?? null; } catch { /* no messages, then */ }
  const audio = graph(), state = { fs };
  host.listen((u) => {
    hear(u.s);
    onUpdate?.(u);
    const port = audio.node.port;
    if (!translate || !u.m?.length || !port.onmessage) return;
    for (const [type, key, ...values] of u.m) {
      let m = null;
      try { m = translate({ type, key, values: Float32Array.from(values) }, state); } catch { continue; } // one that reads the engine's memory (it isn't here)
      if (m) port.onmessage({ data: m });
    }
  });
  return audio;
}

// A parameter's value on the page, from the plugin's (a choice's index, a toggle's 0 or 1).
export function pageValue(p, v) {
  if (p.type === 'select') return (p.options[Math.round(v)] ?? p.options.find(([k]) => k === p.def) ?? [p.def])[0];
  if (p.type === 'checkbox') return v > 0.5;
  return v;
}

// The keys and the pedal as the plugin has them: calls on(key, velocity) and off(key) for each
// change, and pedal(on), from each of the window's polls.
export function keysFrom({ on, off, pedal }) {
  let down = new Set(), was = false;
  return (u) => {
    const next = new Set(u.keys || []);
    for (const k of down) if (!next.has(k)) off(k);
    (u.keys || []).forEach((k, i) => { if (!down.has(k)) on(k, u.vel?.[i] ?? 0.75); });
    down = next;
    if (!!u.pedal !== was) { was = !!u.pedal; pedal?.(was); }
  };
}

// The computer's keys play the window's instrument: the frame passes them on to the window.
if (inPlugin) {
  for (const type of ['keydown', 'keyup']) {
    addEventListener(type, (e) => {
      if (e.target?.closest?.('input, select, textarea')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      window.parent.dispatchEvent(new KeyboardEvent(type, { key: e.key, code: e.code, repeat: e.repeat, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey }));
    }, true);
  }
}

// For a page that keeps its own parameters and notes (not shared/shell.js's: the piano, organ,
// tines, Huygens and black hole pages): its audio from the plugin, the plugin's values set on its
// P (set(changes): { id: value }, only those that changed, P() the page's object now), its keys
// played and let go by its own on(key, velocity) and off(key) (their messages to the engine go
// nowhere), its pedal by pedal(on), and the engine's messages to message(m).
export async function follow({ wasm, params, P, set, on, off, pedal, message }) {
  const byIndex = host.describe.params.map((q) => params.find((p) => p.id === q.id) ?? null);
  const keys = keysFrom({ on, off, pedal });
  const audio = await pluginAudio(wasm, (u) => {
    const changes = {};
    let n = 0;
    for (const [i, , , v] of u.p || []) {
      const p = byIndex[i];
      if (!p || v === undefined) continue;
      const x = pageValue(p, v);
      if (P()[p.id] !== x) { changes[p.id] = x; n++; }
    }
    if (n) set(changes);
    keys(u);
  });
  audio.node.port.onmessage = (e) => message?.(e.data);
  return audio;
}
