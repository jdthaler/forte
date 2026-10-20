// quality.js — the Quality setting: how much of its physics an instrument plays (forte/engine.h,
// Quality). High plays everything, as the instruments always have; Medium and Low trim what costs
// the most and is heard the least, for phones and older computers. It belongs to the device, not
// the sound: one choice for every page in this browser, kept in localStorage, in no preset or link.
// The plugins have it as a parameter of their own (native/plugin/plugin.cpp).
//
//   connectQuality(node, { toast })  a page's engine (its forte-processor node): sent the choice
//                                    now and whenever it changes; its CPU reports, watched for
//                                    dropouts, suggest a lower setting (once a visit)
//   qualityControl()                 the choice, as the last group of the page's controls

import { QUALITY_LEVELS } from './wasm.js';

export const QUALITIES = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const KEY = 'forte.quality';
export const QUALITY_HINT = 'How much of the physics this device plays. If the sound crackles or drops out, Medium and Low play fewer voices, partials and optional effects (each instrument’s notes say which), and cost less. It applies to every instrument in this browser; presets and links leave it alone.';

let level = read();
const nodes = new Set(), listeners = new Set();
let suggested = false;

function read() {
  try { const q = localStorage.getItem(KEY); return QUALITY_LEVELS.includes(q) ? q : 'high'; } catch { return 'high'; }
}
export const quality = () => level;
export function setQuality(q) {
  if (!QUALITY_LEVELS.includes(q) || q === level) return;
  level = q;
  try { localStorage.setItem(KEY, q); } catch { /* private mode: for this page only */ }
  for (const n of nodes) n.port.postMessage({ type: 'quality', level });
  for (const f of listeners) f(level);
}
// another tab changed it: this one follows
globalThis.addEventListener?.('storage', (e) => { if (e.key === KEY) setQuality(read()); });

// The engine's node: its quality now and on every change, and its CPU reports watched. Over budget
// in three of the last six reports (about 1.5 s): the worst block took longer than the block lasts,
// or the engine averaged over 70 % of it, which a phone's audio thread rarely survives.
export function connectQuality(node, { toast = () => {} } = {}) {
  nodes.add(node);
  node.port.postMessage({ type: 'quality', level });
  const recent = [];
  node.port.addEventListener('message', (e) => {
    const m = e.data;
    if (m?.type !== 'stats' || suggested || level === 'low') return;
    recent.push((m.peak ?? 0) > 1 || m.load > 0.7);
    if (recent.length > 6) recent.shift();
    if (recent.filter(Boolean).length < 3) return;
    suggested = true;
    const next = level === 'high' ? 'Medium' : 'Low';
    toast(`The audio is struggling on this device. Try Quality: ${next}, in the CPU group of controls.`);
  });
  node.port.start?.();
  return () => nodes.delete(node);
}

// The choice, in a "CPU" group after the page's own (in #groups, or the controls panel).
export function qualityControl() {
  if (document.querySelector('#quality')) return null;
  const host = document.querySelector('#groups') ?? document.querySelector('#controls');
  if (!host) return null;
  const det = document.createElement('details');
  det.className = 'group quality-group'; det.open = true;
  det.innerHTML = '<summary>CPU</summary>';
  const wrap = document.createElement('div');
  wrap.className = 'param';
  wrap.innerHTML = '<label for="quality">Quality</label>';
  const sel = document.createElement('select');
  sel.id = 'quality';
  for (const [id, name] of QUALITIES) sel.add(new Option(name, id));
  sel.value = level;
  sel.addEventListener('change', () => { setQuality(sel.value); sel.blur(); });
  listeners.add((q) => { sel.value = q; });
  const hint = document.createElement('div');
  hint.className = 'hint'; hint.textContent = QUALITY_HINT;
  wrap.append(sel, hint);
  det.append(wrap);
  host.append(det);
  return sel;
}
