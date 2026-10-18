// shell.js — everything a Forte instrument page has in common, so an
// instrument's own main.js only contains its physics and its views.
//
//   import { createShell } from '../../shared/shell.js';
//   const shell = createShell({ … });   // see the config notes below
//
// Expected DOM (copy docs/template/index.html):
//   #start #midi-btn #midi #cpu #panic   header buttons / status pills
//   #preset #reset #groups               sidebar: presets (shared/layout.js moves them to the header) and parameter groups
//   #keyboard #oct #toast                keys, octave readout, toast
//   optional: #ctl-read (readout of the ↑/↓ parameter), #hold (Space indicator)
//
// Config: the instrument's descriptor (<slug>/src/<slug>-instrument.js: id, groups, presets, keep,
// range, space, modWheel, wasm, noteData, chain), spread in, plus the page's own:
//   id            instrument slug (localStorage key)
//   groups        parameter groups: [{ title, open?, params: [{ id, label, min, max, def, step?, log?,
//                 fmt?, hint?, type?: 'select' | 'checkbox', options?: [[value, name]…], showIf?(P),
//                 perform? }] }]   perform: true puts the control in Perform's strip above the keys
//   presets       [{ name, p: { …overrides } }]
//   keep          param ids kept when switching presets (e.g. ['volume', 'room'])
//   range         [lowest MIDI key, highest MIDI key]   (default [36, 96])
//   base          MIDI note of the lower-row "Z" key    (default 48)
//   wasm          { name: 'XWasmEngine', module: URL of src/x-wasm.js, binary: URL of wasm/x.wasm }:
//                 the engine, the C++ in native/instruments/<slug> built as WebAssembly
//                 (shared/wasm.js), run by shared/worklet.js (the engine contract is there)
//   chain         the output chain (shared/chain.js): { volume, room?, tone?, body?, … }
//                 node → [tone low-pass] → [body] → master (+ room reverb) → limiter → speakers; analyser before the body
//   noteData(key, vel, P, fs)  extra data attached to each noteOn message: what the page offers the
//                 engine so the audio thread needn't build it (e.g. a key's model, from its WebAssembly model)
//   space         'sustain' (Space / CC64 = damper pedal, sent to the engine) | 'hold' (keys latch
//                 while Space is down; shell sends the noteOffs on release) | null
//   arrows        { param: id, step } — ↑/↓ nudge that parameter (by `step`; a log parameter by 1/24 of its range)
//   modWheel      param id driven by MIDI CC1 (wheel at rest = the default, fully up = the maximum),
//                 or { param, max } to stop short of the slider's maximum
//   holdHint      { text, ms } for an instrument that speaks only while a key is held: the first
//                 time a key is let go within `ms` (default 300), `text` shows as a toast
// Hooks (all optional, all in addition to the default engine messages):
//   onAudio(audio)  once, with { ctx, node, tone, master, roomGain, analyser, chain }
//   onMessage(msg)  messages from the engine ('stats' already updates #cpu)
//   onNoteOn(key, vel)  onNoteOff(key)  onSustain(on)  onPanic()  onCC(cc, value)
//   onPressure(value, key|null)  onBend(value)   (MIDI aftertouch 0..1 and pitch bend −1..1; the
//                   engine also receives { type: 'pressure', value, key } and { type: 'bend', value })
//   onParam(id, value, P, param, dragging)   id = '*' after a preset or reset

import { createChain } from './chain.js';
import { createKeyboard } from './keyboard.js';
import { trimGain } from './registry.js';
import { controlOwns, focusedByPointer } from './focus.js';
import { startMIDI, resumeMIDI, wheelValue } from './midi.js';
// after a change, a control picked with the pointer lets go of the focus (the keys go back to the
// instrument); one reached with Tab keeps it, so the next Space or arrow works it again
const release = (el) => { if (focusedByPointer(el)) el.blur(); };

const $ = (s) => document.querySelector(s);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const keyFreq = (m) => 440 * 2 ** ((m - 69) / 12);

const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma', 'KeyL', 'Period', 'Semicolon', 'Slash'];
const LOW_LBL = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/'];
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];
const HIGH_LBL = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p', '[', '=', ']'];

let toastTimer = 0;
export function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

export function createShell(cfg) {
  const [LO, HI] = cfg.range || [36, 96];
  const ALL = cfg.groups.flatMap((g) => g.params);
  const DEFAULTS = Object.fromEntries(ALL.map((p) => [p.id, p.def]));
  const STORE = `forte/${cfg.id}/params/v1`;
  // Stored settings may be from an older version: keep only known ids, with valid values.
  const valid = (p, v) => {
    if (p.type === 'select') return p.options.some(([k]) => k === v) ? v : p.def;
    if (p.type === 'checkbox') return typeof v === 'boolean' ? v : p.def;
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
  };
  const load = () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* corrupt */ }
    return Object.fromEntries(ALL.map((p) => [p.id, s && p.id in s ? valid(p, s[p.id]) : p.def]));
  };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(shell.P)); } catch { /* storage unavailable */ } };

  const shell = { P: load(), DEFAULTS, ALL, audio: null, base: cfg.base ?? 48, sustain: false };
  const held = new Map(), sounding = new Map(), latched = new Set();

  // ---- audio ---------------------------------------------------------------
  let starting = null;
  shell.startAudio = () => {
    if (shell.audio) { if (shell.audio.ctx.state !== 'running') shell.audio.ctx.resume(); return Promise.resolve(shell.audio); }
    if (starting) return starting;
    let ctx = null;
    starting = (async () => {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
      // the engine's WebAssembly: its bytes go to the worklet, which compiles them
      const bytes = await (await fetch(cfg.wasm.binary)).arrayBuffer();
      await ctx.audioWorklet.addModule(cfg.wasm.module);
      await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url)); // forte-processor, and the chain's limiter
      const node = new AudioWorkletNode(ctx, 'forte-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { wasm: { name: cfg.wasm.name, bytes } },
      });
      const chain = createChain(ctx, node, cfg.chain || {});
      const analyser = ctx.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55;
      chain.tap.connect(analyser);
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'stats' && $('#cpu')) {
          const el = $('#cpu');
          const pct = (x) => `${(x * 100).toFixed(0)} %`;
          el.textContent = `CPU ${pct(m.load)}${m.peak !== undefined ? ` (peak ${pct(m.peak)})` : ''}${m.voices !== undefined ? ` · ${m.voices} voices` : ''}`;
          el.title = 'Average and worst audio-block time, as a share of the time available. A peak over 100 % is an audible dropout.';
          el.classList.toggle('hot', (m.peak ?? m.load) > 0.8);
        }
        else if (m.type === 'error') toast(m.message);
        cfg.onMessage?.(m);
      };
      node.onprocessorerror = () => toast('The audio engine stopped. Reload the page to restart it.');
      // Params go first, straight to the port. Everything else waits for `starting` and is
      // posted in order (shell.post), so a quick note-off can never overtake its note-on.
      node.port.postMessage(paramsMessage());
      if (cfg.space === 'sustain') node.port.postMessage({ type: 'sustain', on: shell.sustain });
      if (ctx.state !== 'running') await ctx.resume();
      shell.audio = { ctx, node, tone: chain.tone, master: chain.master, roomGain: chain.roomGain, analyser, chain };
      shell.applyMix();
      cfg.onAudio?.(shell.audio);
      if ($('#start')) {
        const btn = $('#start');
        btn.textContent = `Audio on · ${(ctx.sampleRate / 1000).toFixed(1)} kHz`; btn.classList.add('running');
        // the browser's and the audio device's share of a key's delay (outputLatency settles once
        // sound flows; Safari doesn't report it)
        const latency = () => {
          const ms = Math.round(1000 * ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)));
          if (ms) btn.title = `Output latency ≈ ${ms} ms (the browser's audio buffer and the audio device${ctx.outputLatency ? '' : ', not counting the device'}). Bluetooth headphones and speakers add 100–200 ms; wired ones far less.`;
        };
        latency(); setTimeout(latency, 1000);
      }
      return shell.audio;
    })();
    starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); ctx?.close?.().catch(() => {}); starting = null; });
    return starting;
  };
  const paramsMessage = () => ({ type: 'params', P: { ...shell.P } });
  const sendParams = () => shell.post(paramsMessage());
  shell.sendParams = sendParams;
  shell.post = (m) => { if (shell.audio) shell.audio.node.port.postMessage(m); else if (starting) starting.then((a) => a.node.port.postMessage(m), () => {}); };
  shell.applyMix = () => { if (shell.audio) shell.audio.chain.apply(shell.P, trimGain(cfg.id)); };

  // ---- notes ---------------------------------------------------------------
  // an instrument that speaks only while held says so the first time a key is let go too soon
  const pressedAt = new Map();
  let holdHinted = false;
  async function down(key, vel) {
    if (key < LO || key > HI) return;
    if (cfg.holdHint) pressedAt.set(key, performance.now());
    latched.delete(key);
    sounding.set(key, (sounding.get(key) || 0) + 1);
    shell.keys.set(key, true);
    if (shell.audio) shell.startAudio(); // resumes a suspended context; no await, so order is kept
    else try { await shell.startAudio(); } catch { return; }
    shell.post({ type: 'noteOn', key, velocity: vel, data: cfg.noteData?.(key, vel, shell.P, shell.audio.ctx.sampleRate) });
    cfg.onNoteOn?.(key, vel);
  }
  function up(key, velocity) { // velocity: a MIDI note-off's release velocity (0..1), if it sent one
    const n = (sounding.get(key) || 0) - 1;
    if (n > 0) { sounding.set(key, n); return; }
    sounding.delete(key);
    if (cfg.holdHint && !holdHinted && !shell.sustain && performance.now() - (pressedAt.get(key) ?? -Infinity) < (cfg.holdHint.ms ?? 300)) {
      holdHinted = true; toast(cfg.holdHint.text);
    }
    if (cfg.space === 'hold' && shell.sustain) { latched.add(key); return; }
    shell.keys.set(key, false);
    const off = () => { shell.post({ type: 'noteOff', key, velocity }); cfg.onNoteOff?.(key); };
    if (shell.audio) off(); else if (starting) starting.then(off, () => {});
  }
  shell.noteOn = down; shell.noteOff = up;
  shell.activeKeys = () => [...new Set([...sounding.keys(), ...latched])].sort((a, b) => a - b);
  function setSustain(on) {
    shell.sustain = on;
    const el = $('#hold');
    if (el) { el.textContent = on ? 'on' : 'off'; el.className = on ? 'on' : 'off'; }
    if (cfg.space === 'sustain') shell.post({ type: 'sustain', on });
    if (cfg.space === 'hold' && !on) { for (const k of latched) { shell.keys.set(k, false); shell.post({ type: 'noteOff', key: k }); cfg.onNoteOff?.(k); } latched.clear(); }
    cfg.onSustain?.(on);
    document.dispatchEvent(new CustomEvent('forte-sustain', { detail: on })); // the on-screen pedal and Latch follow
  }
  // Panic lets go of everything, the pedal (and Latch) included
  shell.panic = () => { sounding.clear(); latched.clear(); held.clear(); shell.keys.clearAll(); if (shell.sustain) setSustain(false); shell.post({ type: 'panic' }); cfg.onPanic?.(); };

  // ---- computer keyboard -----------------------------------------------------
  const codeToKey = (code) => { let i = LOW.indexOf(code); if (i >= 0) return shell.base + i; i = HIGH.indexOf(code); return i >= 0 ? shell.base + 12 + i : null; };
  const labels = () => { const m = new Map(); LOW_LBL.forEach((l, i) => m.set(shell.base + i, l)); HIGH_LBL.forEach((l, i) => { if (!m.has(shell.base + 12 + i)) m.set(shell.base + 12 + i, l); }); return m; };
  const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
  let spaceHeld = false; // the real Space bar (the on-screen pedal sends synthetic events)
  const kbVel = () => (shell.P.velocity !== undefined ? shell.P.velocity : 0.75);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    // a control reached with Tab keeps its own keys (Space ticks a stop, arrows move a slider);
    // one last touched with the mouse or a finger hands them back (shared/focus.js)
    if (controlOwns(e)) return;
    // a <select> picked from with the pointer would swallow note keys, or step to the next preset
    // on an arrow: hand them back
    if (e.target?.tagName === 'SELECT') { if (e.code === 'Space' || e.code.startsWith('Arrow') || codeToKey(e.code) !== null) e.target.blur(); else return; }
    if (e.code === 'Space' && cfg.space) { e.preventDefault(); if (e.isTrusted) spaceHeld = true; if (!e.repeat) setSustain(true); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
    if (cfg.arrows && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      const p = ALL.find((q) => q.id === cfg.arrows.param), dir = e.code === 'ArrowUp' ? 1 : -1;
      // linear parameters step by `step`; log parameters by 1/24 of the slider's travel
      let v = p.log ? shell.P[p.id] * (p.max / p.min) ** (dir / 24) : shell.P[p.id] + dir * cfg.arrows.step;
      if (p.step) v = Math.round(v / p.step) * p.step;
      shell.setParam(p.id, Math.min(p.max, Math.max(p.min, v)));
      return;
    }
    const key = codeToKey(e.code);
    if (key === null) return;
    e.preventDefault();
    if (e.repeat || held.has(e.code)) return;
    held.set(e.code, key);
    down(key, kbVel());
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && cfg.space && !controlOwns(e)) { if (e.isTrusted) spaceHeld = false; setSustain(false); return; }
    const key = held.get(e.code);
    if (key !== undefined) { held.delete(e.code); up(key); }
  });
  // Losing focus means no keyup will come: release held keys and a held Space bar.
  const letGo = () => { for (const k of held.values()) up(k); held.clear(); if (spaceHeld) { spaceHeld = false; setSustain(false); } };
  window.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
  function shiftOctave(d) {
    const nb = shell.base + d;
    if (nb + 11 < LO || nb > HI - 12) return; // never a whole row of computer keys out of range
    for (const k of held.values()) up(k);
    held.clear(); shell.base = nb; shell.keys.labels(labels()); updateHelp();
  }
  function updateHelp() {
    if ($('#oct')) $('#oct').textContent = `${noteName(Math.max(LO, shell.base))}–${noteName(Math.min(HI, shell.base + 31))}`;
    if ($('#ctl-read') && cfg.arrows) {
      const p = ALL.find((q) => q.id === cfg.arrows.param);
      $('#ctl-read').textContent = p.fmt ? p.fmt(shell.P[p.id]) : String(shell.P[p.id]);
    }
  }

  // ---- on-screen keyboard (multi-touch; shared/keyboard.js) ----------------------
  if (cfg.space && !document.body.dataset.space) document.body.dataset.space = cfg.space === 'hold' ? 'Hold' : 'Sustain';
  shell.keys = createKeyboard($('#keyboard'), {
    lo: LO, hi: HI, onDown: (k, f) => down(k, 0.2 + 0.8 * f), onUp: up,
    onPressure: (key, value) => { shell.post({ type: 'pressure', value, key }); cfg.onPressure?.(value, key); }, // as MIDI poly aftertouch
  });

  // ---- MIDI ----------------------------------------------------------------------
  function initMIDI() {
    startMIDI({ onMIDI, status: (t) => { if ($('#midi')) $('#midi').textContent = t; }, button: $('#midi-btn') });
  }
  function onMIDI(ev) {
    const [st, d1, d2] = ev.data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) down(d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) up(d1, cmd === 0x80 ? d2 / 127 : undefined);
    else if (cmd === 0xb0) {
      if (d1 === 64 && cfg.space) setSustain(d2 >= 64);
      else if (d1 === 1 && cfg.modWheel) {
        // The wheel rests at 0, so rest = the parameter's default and full = its maximum
        // (a resting wheel must not drag the instrument to the bottom of its range).
        const mw = typeof cfg.modWheel === 'string' ? { param: cfg.modWheel } : cfg.modWheel;
        const p = ALL.find((q) => q.id === mw.param);
        shell.setParam(p.id, wheelValue(p, d2, mw.max ?? p.max));
      } else if (d1 === 120 || d1 === 123) shell.panic();
      cfg.onCC?.(d1, d2);
    } else if (cmd === 0xd0 || cmd === 0xa0) { // channel / polyphonic aftertouch
      const value = (cmd === 0xd0 ? d1 : d2) / 127, key = cmd === 0xa0 ? d1 : null;
      shell.post({ type: 'pressure', value, key });
      cfg.onPressure?.(value, key);
    } else if (cmd === 0xe0) { // pitch bend, −1 … 1
      const value = Math.max(-1, ((d2 << 7) + d1 - 8192) / 8191);
      shell.post({ type: 'bend', value });
      cfg.onBend?.(value);
    }
  }

  // ---- parameters ------------------------------------------------------------------
  const controls = new Map();
  const toSlider = (p, v) => (p.log ? (1000 * Math.log(v / p.min)) / Math.log(p.max / p.min) : (1000 * (v - p.min)) / (p.max - p.min));
  const fromSlider = (p, t) => {
    let v = p.log ? p.min * (p.max / p.min) ** (t / 1000) : p.min + ((p.max - p.min) * t) / 1000;
    if (p.step) v = Math.round(v / p.step) * p.step;
    return Math.min(p.max, Math.max(p.min, v));
  };
  for (const g of cfg.groups) {
    const det = document.createElement('details');
    det.className = 'group'; det.open = g.open !== false;
    det.innerHTML = `<summary>${g.title}</summary>`;
    for (const p of g.params) {
      const wrap = document.createElement('div');
      wrap.className = 'param';
      if (p.perform) wrap.dataset.perform = ''; // shown above the keys in Perform (shared/layout.js)
      let input, val = null;
      if (p.type === 'select') {
        wrap.innerHTML = `<label for="p-${p.id}">${p.label}</label>`;
        input = document.createElement('select'); input.id = `p-${p.id}`;
        for (const [k, name] of p.options) input.add(new Option(name, k));
        input.addEventListener('change', () => { shell.setParam(p.id, typeof p.def === 'number' ? +input.value : input.value); release(input); });
        wrap.appendChild(input);
      } else if (p.type === 'checkbox') {
        wrap.classList.add('check');
        input = document.createElement('input'); input.type = 'checkbox'; input.id = `p-${p.id}`;
        input.addEventListener('change', () => { shell.setParam(p.id, input.checked); release(input); });
        const lab = document.createElement('label'); lab.htmlFor = input.id; lab.textContent = p.label;
        wrap.append(input, lab);
      } else {
        wrap.innerHTML = `<div class="row"><label for="p-${p.id}">${p.label}</label><span class="val"></span></div>`;
        val = wrap.querySelector('.val');
        input = document.createElement('input');
        input.type = 'range'; input.min = 0; input.max = 1000; input.step = 1; input.id = `p-${p.id}`;
        input.addEventListener('input', () => shell.setParam(p.id, fromSlider(p, +input.value), true));
        input.addEventListener('dblclick', () => shell.setParam(p.id, p.def));
        wrap.appendChild(input);
      }
      if (p.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = p.hint; wrap.appendChild(h); }
      det.appendChild(wrap);
      controls.set(p.id, { p, input, val, wrap });
    }
    $('#groups').appendChild(det);
  }
  function refresh(id, dragging = false) {
    const c = controls.get(id);
    if (!c) return;
    const v = shell.P[id];
    if (c.p.type === 'select') c.input.value = v;
    else if (c.p.type === 'checkbox') c.input.checked = !!v;
    else {
      if (!dragging) c.input.value = toSlider(c.p, v);
      c.val.textContent = c.p.fmt ? c.p.fmt(v) : String(v);
      c.input.setAttribute('aria-valuetext', c.val.textContent);
    }
  }
  const refreshVisibility = () => { for (const { p, wrap } of controls.values()) wrap.hidden = p.showIf ? !p.showIf(shell.P) : false; };
  shell.setParam = (id, v, dragging = false) => {
    if (shell.P[id] === v) return;
    shell.P[id] = v;
    refresh(id, dragging); refreshVisibility(); save(); updateHelp();
    if ($('#preset')) $('#preset').value = '';
    shell.applyMix(); sendParams();
    cfg.onParam?.(id, v, shell.P, ALL.find((q) => q.id === id), dragging);
  };
  shell.setAll = (np) => {
    shell.P = { ...DEFAULTS, ...np };
    for (const id of controls.keys()) refresh(id);
    refreshVisibility(); save(); updateHelp(); shell.applyMix(); sendParams();
    cfg.onParam?.('*', null, shell.P, null, false);
  };
  if ($('#preset')) {
    const ps = $('#preset');
    ps.add(new Option('Presets…', ''));
    (cfg.presets || []).forEach((pr, i) => ps.add(new Option(pr.name, i)));
    ps.addEventListener('change', () => {
      if (ps.value === '') return;
      const keep = Object.fromEntries((cfg.keep || []).map((k) => [k, shell.P[k]]));
      shell.setAll({ ...DEFAULTS, ...keep, ...cfg.presets[+ps.value].p });
      release(ps);
    });
  }
  $('#reset')?.addEventListener('click', () => { shell.setAll({ ...DEFAULTS }); if ($('#preset')) $('#preset').value = ''; });
  $('#start')?.addEventListener('click', (e) => { shell.startAudio(); e.currentTarget.blur(); });
  $('#midi-btn')?.addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
  resumeMIDI(initMIDI); // MIDI was on before and the browser still grants it: on again, no click
  $('#panic')?.addEventListener('click', (e) => { shell.panic(); e.currentTarget.blur(); });

  for (const id of controls.keys()) refresh(id);
  refreshVisibility();
  shell.keys.labels(labels());
  updateHelp();
  return shell;
}
