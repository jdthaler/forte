// shell.js — everything a Forte instrument page has in common, so an
// instrument's own main.js only contains its physics and its views.
//
//   import { createShell } from '../../shared/shell.js';
//   const shell = createShell({ … });   // see the config notes below
//
// Expected DOM (copy docs/template/index.html):
//   #start #midi-btn #midi #cpu #panic   header buttons / status pills
//   #preset #reset #groups               sidebar: presets and parameter groups
//   #keyboard #oct #toast                keys, octave readout, toast
//   optional: #ctl-read (readout of the ↑/↓ parameter), #hold (Space indicator)
//
// Config:
//   id            instrument slug (localStorage key)
//   groups        parameter groups: [{ title, open?, params: [{ id, label, min, max, def, step?, log?,
//                 fmt?, hint?, type?: 'select' | 'checkbox', options?: [[value, name]…], showIf?(P) }] }]
//   presets       [{ name, p: { …overrides } }]
//   keep          param ids kept when switching presets (e.g. ['volume', 'room'])
//   range         [lowest MIDI key, highest MIDI key]   (default [36, 96])
//   base          MIDI note of the lower-row "Z" key    (default 48)
//   worklet       { modules: ['src/x-engine.js'], engine: 'XEngine', outputs?: 2 }
//                 uses shared/worklet.js (see the engine contract there); or give
//                 { modules: […, 'src/x-worklet.js'], processor: 'x-processor' } for a custom one
//   chain         { volume: param id, room?: param id (0..1), tone?: param id (Hz) }
//                 node → [tone low-pass] → master (+ room reverb) → limiter → speakers; analyser on node
//   engineParams(P)   what the engine's setParams receives (default: all of P); posted on start and on change
//   noteData(key, vel)  extra data attached to each noteOn message (e.g. a precomputed modal model)
//   space         'sustain' (Space / CC64 = damper pedal, sent to the engine) | 'hold' (keys latch
//                 while Space is down; shell sends the noteOffs on release) | null
//   arrows        { param: id, step } — ↑/↓ nudge that parameter (by `step`; a log parameter by 1/24 of its range)
//   modWheel      param id driven by MIDI CC1
// Hooks (all optional, all in addition to the default engine messages):
//   onAudio(audio)  once, with { ctx, node, tone, master, roomGain, analyser }
//   onMessage(msg)  messages from the engine ('stats' already updates #cpu)
//   onNoteOn(key, vel)  onNoteOff(key)  onSustain(on)  onPanic()  onCC(cc, value)
//   onPressure(value, key|null)  onBend(value)   (MIDI aftertouch 0..1 and pitch bend −1..1; the
//                   engine also receives { type: 'pressure', value, key } and { type: 'bend', value })
//   onParam(id, value, P, param, dragging)   id = '*' after a preset or reset

import { roomIR } from './impulses.js';
import { createKeyboard } from './keyboard.js';

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
  const load = () => { try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS }; } catch { return { ...DEFAULTS }; } };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(shell.P)); } catch { /* storage unavailable */ } };

  const shell = { P: load(), DEFAULTS, ALL, audio: null, base: cfg.base ?? 48, sustain: false };
  const held = new Map(), sounding = new Map(), latched = new Set();

  // ---- audio ---------------------------------------------------------------
  let starting = null;
  shell.startAudio = () => {
    if (shell.audio) { if (shell.audio.ctx.state !== 'running') shell.audio.ctx.resume(); return Promise.resolve(shell.audio); }
    if (starting) return starting;
    starting = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const w = cfg.worklet;
      if (!ctx.audioWorklet) throw new Error(window.isSecureContext ? 'this browser has no AudioWorklet support' : 'audio needs a secure page — open it with https://');
      for (const m of w.modules) await ctx.audioWorklet.addModule(m);
      if (!w.processor) await ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
      const node = new AudioWorkletNode(ctx, w.processor || 'forte-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [w.outputs || 2],
        processorOptions: { engine: w.engine },
      });
      const ch = cfg.chain || {};
      let out = node;
      let tone = null;
      if (ch.tone) { tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.6; out.connect(tone); out = tone; }
      const master = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12; limiter.attack.value = 0.002; limiter.release.value = 0.15;
      out.connect(master);
      let roomGain = null;
      if (ch.room) {
        const room = ctx.createConvolver(); room.buffer = roomIR(ctx, 2.0);
        roomGain = ctx.createGain(); out.connect(room).connect(roomGain).connect(master);
      }
      const analyser = ctx.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0.55;
      out.connect(analyser);
      master.connect(limiter).connect(ctx.destination);
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'stats' && $('#cpu')) {
          const el = $('#cpu');
          el.textContent = m.load !== undefined ? `CPU ${(m.load * 100).toFixed(0)} %${m.voices !== undefined ? ` · ${m.voices} voices` : ''}` : `${m.voices} voices`;
          el.classList.toggle('hot', (m.load || 0) > 0.7);
        }
        else if (m.type === 'error') toast(m.message);
        cfg.onMessage?.(m);
      };
      shell.audio = { ctx, node, tone, master, roomGain, analyser };
      shell.applyMix();
      sendParams();
      if (cfg.space === 'sustain') node.port.postMessage({ type: 'sustain', on: shell.sustain });
      cfg.onAudio?.(shell.audio);
      if (ctx.state !== 'running') await ctx.resume();
      if ($('#start')) { $('#start').textContent = `Audio on · ${(ctx.sampleRate / 1000).toFixed(1)} kHz`; $('#start').classList.add('running'); }
      return shell.audio;
    })();
    starting.catch((err) => { toast(`Audio failed to start: ${err.message}`); starting = null; });
    return starting;
  };
  const sendParams = () => shell.post({ type: 'params', params: cfg.engineParams ? cfg.engineParams(shell.P) : { ...shell.P } });
  shell.sendParams = sendParams;
  shell.post = (m) => { if (shell.audio) shell.audio.node.port.postMessage(m); else if (starting) starting.then((a) => a.node.port.postMessage(m)); };
  shell.applyMix = () => {
    const a = shell.audio, ch = cfg.chain || {}, P = shell.P;
    if (!a) return;
    const t = a.ctx.currentTime;
    if (a.tone && ch.tone) a.tone.frequency.setTargetAtTime(P[ch.tone], t, 0.02);
    if (a.roomGain && ch.room) a.roomGain.gain.setTargetAtTime(0.6 * P[ch.room], t, 0.02);
    if (ch.volume) a.master.gain.setTargetAtTime(P[ch.volume], t, 0.02);
  };

  // ---- notes ---------------------------------------------------------------
  async function down(key, vel) {
    if (key < LO || key > HI) return;
    latched.delete(key);
    sounding.set(key, (sounding.get(key) || 0) + 1);
    shell.keys.set(key, true);
    await shell.startAudio();
    shell.post({ type: 'noteOn', key, velocity: vel, data: cfg.noteData?.(key, vel) });
    cfg.onNoteOn?.(key, vel);
  }
  function up(key) {
    const n = (sounding.get(key) || 0) - 1;
    if (n > 0) { sounding.set(key, n); return; }
    sounding.delete(key);
    if (cfg.space === 'hold' && shell.sustain) { latched.add(key); return; }
    shell.keys.set(key, false);
    const off = () => { shell.post({ type: 'noteOff', key }); cfg.onNoteOff?.(key); };
    if (shell.audio) off(); else if (starting) starting.then(off);
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
  }
  shell.panic = () => { sounding.clear(); latched.clear(); held.clear(); shell.keys.clearAll(); shell.post({ type: 'panic' }); cfg.onPanic?.(); };

  // ---- computer keyboard -----------------------------------------------------
  const codeToKey = (code) => { let i = LOW.indexOf(code); if (i >= 0) return shell.base + i; i = HIGH.indexOf(code); return i >= 0 ? shell.base + 12 + i : null; };
  const labels = () => { const m = new Map(); LOW_LBL.forEach((l, i) => m.set(shell.base + i, l)); HIGH_LBL.forEach((l, i) => { if (!m.has(shell.base + 12 + i)) m.set(shell.base + 12 + i, l); }); return m; };
  const typing = (t) => t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
  const kbVel = () => (shell.P.velocity !== undefined ? shell.P.velocity : 0.75);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const onSlider = e.target?.tagName === 'INPUT';
    if (e.code === 'Space' && cfg.space) { e.preventDefault(); if (!e.repeat) setSustain(true); return; }
    if (!onSlider && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); shiftOctave(e.code === 'ArrowLeft' ? -12 : 12); return; }
    if (!onSlider && cfg.arrows && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
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
    if (e.code === 'Space' && cfg.space) { setSustain(false); return; }
    const key = held.get(e.code);
    if (key !== undefined) { held.delete(e.code); up(key); }
  });
  window.addEventListener('blur', () => { for (const k of held.values()) up(k); held.clear(); });
  function shiftOctave(d) {
    const nb = shell.base + d;
    if (nb < LO - 12 || nb > HI - 12) return;
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
  shell.keys = createKeyboard($('#keyboard'), { lo: LO, hi: HI, onDown: (k, f) => down(k, 0.2 + 0.8 * f), onUp: up });

  // ---- MIDI ----------------------------------------------------------------------
  function initMIDI() {
    if (!navigator.requestMIDIAccess) { $('#midi').textContent = 'Web MIDI unsupported (use Chrome/Edge)'; return; }
    navigator.requestMIDIAccess().then((acc) => {
      const bind = () => {
        const names = [];
        for (const inp of acc.inputs.values()) { inp.onmidimessage = onMIDI; names.push(inp.name); }
        $('#midi').textContent = names.length ? `MIDI: ${names.join(', ')}` : 'MIDI: no devices';
      };
      bind(); acc.onstatechange = bind; $('#midi-btn').hidden = true;
    }, () => { $('#midi').textContent = 'MIDI: permission denied'; });
  }
  function onMIDI(ev) {
    const [st, d1, d2] = ev.data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) down(d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) up(d1);
    else if (cmd === 0xb0) {
      if (d1 === 64 && cfg.space) setSustain(d2 >= 64);
      else if (d1 === 1 && cfg.modWheel) {
        const p = ALL.find((q) => q.id === cfg.modWheel);
        shell.setParam(p.id, p.log ? p.min * (p.max / p.min) ** (d2 / 127) : p.min + ((p.max - p.min) * d2) / 127);
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
      let input, val = null;
      if (p.type === 'select') {
        wrap.innerHTML = `<label for="p-${p.id}">${p.label}</label>`;
        input = document.createElement('select'); input.id = `p-${p.id}`;
        for (const [k, name] of p.options) input.add(new Option(name, k));
        input.addEventListener('change', () => { shell.setParam(p.id, typeof p.def === 'number' ? +input.value : input.value); input.blur(); });
        wrap.appendChild(input);
      } else if (p.type === 'checkbox') {
        wrap.classList.add('check');
        input = document.createElement('input'); input.type = 'checkbox'; input.id = `p-${p.id}`;
        input.addEventListener('change', () => shell.setParam(p.id, input.checked));
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
    else { if (!dragging) c.input.value = toSlider(c.p, v); c.val.textContent = c.p.fmt ? c.p.fmt(v) : String(v); }
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
      ps.blur();
    });
  }
  $('#reset')?.addEventListener('click', () => { shell.setAll({ ...DEFAULTS }); if ($('#preset')) $('#preset').value = ''; });
  $('#start')?.addEventListener('click', (e) => { shell.startAudio(); e.currentTarget.blur(); });
  $('#midi-btn')?.addEventListener('click', (e) => { initMIDI(); e.currentTarget.blur(); });
  $('#panic')?.addEventListener('click', (e) => { shell.panic(); e.currentTarget.blur(); });

  for (const id of controls.keys()) refresh(id);
  refreshVisibility();
  shell.keys.labels(labels());
  updateHelp();
  return shell;
}
