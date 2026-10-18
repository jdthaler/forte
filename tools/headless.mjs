// headless.mjs — play an instrument in Node from its descriptor
// (<slug>/src/<slug>-instrument.js), as its page does: the parameters, the Space mode and the
// mod wheel, through its engine (tools/engine.mjs: the C++ built as WebAssembly), and then its
// output chain.

import { existsSync } from 'node:fs';
import { loadEngine } from './engine.mjs';
import { convolve, FS_SHIM, webAudioIR } from './audio-util.mjs';
import { roomIR, soundboardIR } from '../shared/impulses.js';
import { chainGains, ROOM, TONE_Q } from '../shared/chain.js';
import { wheelValue } from '../shared/midi.js';
import { byId } from '../shared/registry.js';

const R = new URL('../', import.meta.url);

// Where an instrument lives: <slug>/, or docs/template/ for the template.
export const instrumentDir = (slug) => (slug === 'template' ? 'docs/template' : slug);

export async function loadInstrument(slug) {
  const url = new URL(`${instrumentDir(slug)}/src/${slug}-instrument.js`, R);
  if (!existsSync(url)) throw new Error(`${slug}: no ${instrumentDir(slug)}/src/${slug}-instrument.js`);
  const { INSTRUMENT } = await import(url);
  await INSTRUMENT.load?.();
  return INSTRUMENT;
}

export const paramsOf = (I) => I.groups.flatMap((g) => g.params);
// (with a console's state, which the page keeps in P beside the groups: the organ's drawbars)
export const defaultsOf = (I) => ({ ...Object.fromEntries(paramsOf(I).map((p) => [p.id, p.def])), ...structuredClone(I.console?.defaults ?? {}) });

// Parameters after choosing preset i from P (the shell's rule: defaults, then the kept
// parameters, then the preset's own values).
export function withPreset(I, i, P = defaultsOf(I)) {
  const keep = Object.fromEntries((I.keep || []).map((k) => [k, P[k]]));
  return { ...defaultsOf(I), ...keep, ...I.presets[i].p };
}

// One instrument, played block by block (128 samples, like the AudioWorklet).
export class Player {
  constructor(I, Engine, fs, P = defaultsOf(I)) {
    this.I = I; this.fs = fs; this.engine = new Engine(fs);
    this.sustained = false; this.latched = new Set();
    this.setParams(P);
    if (I.space === 'sustain') this.engine.setSustain?.(false);
  }
  // the engine takes all the parameters and computes its own per-note data
  setParams(P) { this.P = { ...P }; this.engine.setParams({ ...this.P }); }
  set(id, v) { this.setParams({ ...this.P, [id]: v }); }
  noteOn(key, vel) {
    const [lo, hi] = this.I.range || [36, 96];
    if (key < lo || key > hi) return;
    this.latched.delete(key);
    this.engine.noteOn(key, vel);
  }
  noteOff(key, vel) {
    if (this.I.space === 'hold' && this.sustained) { this.latched.add(key); return; }
    this.engine.noteOff(key, vel);
  }
  // Space or CC64: the damper ('sustain') or the latch ('hold')
  pedal(on) {
    this.sustained = on;
    if (this.I.space === 'sustain') this.engine.setSustain?.(on);
    if (this.I.space === 'hold' && !on) { for (const k of this.latched) this.engine.noteOff(k); this.latched.clear(); }
  }
  // CC1, 0..127: rest = the parameter's default, full = its maximum (or the descriptor's max)
  modWheel(v) {
    if (!this.I.modWheel) return;
    const mw = typeof this.I.modWheel === 'string' ? { param: this.I.modWheel } : this.I.modWheel;
    const p = paramsOf(this.I).find((q) => q.id === mw.param);
    this.set(p.id, wheelValue(p, v, mw.max ?? p.max));
  }
  // another controller (the descriptor's controllers: CC → parameter): a toggle is on at 64 and
  // above; any other parameter moves across its range. Or a switch between two values of P's:
  // { param, values: [below 64, at 64 and above] }, or { param, toggle: [a, b] } flipped by each
  // press (a value other than those is left alone).
  cc(n, v) {
    const id = this.I.controllers?.[n];
    if (!id) return;
    if (typeof id === 'object') {
      const last = (this.ccs ??= {})[n] ?? 0, [a, b] = id.values ?? id.toggle, now = this.P[id.param];
      this.ccs[n] = v;
      if (now !== a && now !== b) return;
      if (id.values) this.set(id.param, v >= 64 ? b : a);
      else if (v >= 64 && last < 64) this.set(id.param, now === a ? b : a);
      return;
    }
    const p = paramsOf(this.I).find((q) => q.id === id);
    this.set(id, p.type === 'checkbox' ? v >= 64 : p.min + ((p.max - p.min) * v) / 127);
  }
  pressure(value, key = null) { this.engine.handle?.({ type: 'pressure', value, key }); }
  bend(value) { this.engine.handle?.({ type: 'bend', value }); }
  panic() { this.latched.clear(); this.sustained = false; this.engine.allNotesOff?.(); }

  // Play `events` for `seconds`: [t, 'on', key, vel] | [t, 'off', key] | [t, 'pedal', bool] |
  // [t, 'wheel', 0..127] | [t, 'cc', n, 0..127] | [t, 'pressure', value, key?] | [t, 'bend', value] |
  // [t, 'param', id, value] | [t, 'preset', i]
  render(seconds, events = []) {
    const n = Math.round(seconds * this.fs), L = new Float64Array(n), Rr = new Float64Array(n);
    const bl = 128, bL = new Float32Array(bl), bR = new Float32Array(bl);
    const ev = events.map(([t, ...a]) => ({ s: Math.round(t * this.fs), a })).sort((x, y) => x.s - y.s);
    let j = 0;
    for (let s = 0; s < n; s += bl) {
      while (j < ev.length && ev[j].s <= s) this.event(ev[j++].a);
      this.engine.process(bL, bR, bl);
      for (let i = 0; i < bl && s + i < n; i++) { L[s + i] = bL[i]; Rr[s + i] = bR[i]; }
    }
    return [L, Rr];
  }
  event([type, a, b]) {
    if (type === 'on') this.noteOn(a, b);
    else if (type === 'cc') this.cc(a, b);
    else if (type === 'off') this.noteOff(a, b);
    else if (type === 'pedal') this.pedal(a);
    else if (type === 'wheel') this.modWheel(a);
    else if (type === 'pressure') this.pressure(a, b ?? null);
    else if (type === 'bend') this.bend(a);
    else if (type === 'param') this.set(a, b);
    else if (type === 'preset') this.setParams(withPreset(this.I, a, this.P));
    else throw new Error(`unknown event ${type}`);
  }
}

export async function player(slug, fs = 48000, P) {
  const I = await loadInstrument(slug);
  return new Player(I, await loadEngine(I), fs, P);
}

// The output chain offline (shared/chain.js), without the limiter: tone low-pass, body,
// room, volume × the registry's trim. Gains are applied as constants.
export function applyChain(I, [L, Rr], P, fs, { room = true } = {}) {
  const ch = I.chain, g = chainGains(ch, P, 10 ** ((byId(I.id)?.trim ?? 0) / 20));
  let out = [L, Rr];
  if (ch.tone) out = out.map((x) => lowpass(x, g.tone, fs));
  if (ch.body) {
    const ir = webAudioIR(soundboardIR(FS_SHIM(fs), ch.body.seconds), fs);
    out = out.map((x, c) => { const w = convolve(x, ir[c]); return x.map((v, i) => g.dry * v + g.body * w[i]); });
  }
  if (ch.room && room) {
    const ir = webAudioIR(roomIR(FS_SHIM(fs), ch.roomSeconds ?? ROOM.seconds), fs);
    out = out.map((x, c) => { const w = convolve(x, ir[c]); return x.map((v, i) => v + g.room * w[i]); });
  }
  return out.map((x) => x.map((v) => g.master * v));
}

// Web Audio's low-pass BiquadFilterNode (its Q is in dB)
export function lowpass(x, f, fs, Qdb = TONE_Q) {
  const w0 = (2 * Math.PI * f) / fs, Q = 10 ** (Qdb / 20), al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al;
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
