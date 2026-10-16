// reeds-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, css } from '../../shared/views.js';
import { INSTRUMENT, reedModel } from './reeds-instrument.js';
import { capCurve, pickupNode, electrostaticShift, hammerSpeed } from './reeds-model.js';
import { traceStrike } from './reeds-engine.js';
import { MotionView, PickupView } from './reeds-views.js';

const $ = (s) => document.querySelector(s);
const FS = 48000; // the views' rate
const spectrum = new SpectrumView($('#spectrum'));
const motion = new MotionView($('#motion'));
const pickup = new PickupView($('#pickup'), motion);
let focus = 60, lastVel = 0.6, traceTimer = 0;

// The modal model of a key (the descriptor's, which also sends it with each noteOn).
const modelFor = (key) => reedModel(key, shell.P, FS);

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key, vel) => { focus = key; lastVel = vel; shell.keys.focus(key); update(true); },
  onParam: (id, v, P, p, dragging) => {
    if (id === 'velocity') lastVel = v;
    // re-simulate the strike for the views, but not on every slider tick
    clearTimeout(traceTimer);
    traceTimer = setTimeout(() => update(true), dragging ? 120 : 0);
    if (!dragging) update(false);
  },
});

function update(retrace) {
  const P = shell.P, model = modelFor(focus), info = model.info, T = capCurve(P.gap);
  const f0 = info.f0, node = pickupNode(P), es = electrostaticShift(model, P);
  $('#focus-name').textContent = noteName(focus);
  $('#info-title').textContent = noteName(focus);
  $('#info-sub').textContent = `${f0.toFixed(2)} Hz`;
  spectrum.set(f0, model.modes.map((m) => ({ f: m.f, color: m.n ? css('--accent-2') : css('--accent'), alpha: m.n ? 0.6 : 0.85 })));
  let trace = null;
  if (retrace) {
    trace = traceStrike(INSTRUMENT.noteData(focus, lastVel, P, FS), P, lastVel, FS, 0.12, Math.round(2 * FS * Math.min(0.06, 5 / f0)));
    motion.set(trace, model, P, T);
    pickup.set({ T, y0: P.offset * 1e-3, trace, f0 });
  } else {
    motion.setGap(P.gap);
    if (motion.D) { motion.D.P = P; motion.cap = T; }
    pickup.set({ ...(pickup.D || {}), T, y0: P.offset * 1e-3, f0 });
  }
  const tr = trace || pickup.D?.trace;
  const wt = node.tau * 2 * Math.PI * f0;
  const regime = wt > 5 ? 'constant charge' : wt < 0.2 ? 'constant voltage' : 'between the two';
  const rows = [
    ['free length', `${(info.L * 1000).toFixed(1)} mm  (tongue ${(info.h * 1000).toFixed(2)} × ${(info.b * 1000).toFixed(1)} mm)`],
    ['solder blob', `${(info.M * 1000).toFixed(info.M < 1e-4 ? 3 : 2)} g = ${info.ratio.toFixed(2)} × tongue · ~${(info.blobSide * 1000).toFixed(1)} mm lump`],
    ['hammer', `${(info.hammer.mass * 1000).toFixed(2)} g at ${(info.xh * 1000).toFixed(1)} mm, ${hammerSpeed(lastVel).toFixed(2)} m/s${tr ? ` · contact ${tr.contactMs.toFixed(2)} ms` : ''}`],
    ['pickup node', `τ = RC₀ = ${(node.tau * 1000).toFixed(2)} ms, corner ${node.fc.toFixed(1)} Hz · ωτ = ${wt.toFixed(1)}: ${regime}`],
    ['field pull', `k = −½V²C″ = ${es.kE.toExponential(2)} N/m → ${es.cents >= 0 ? '+' : ''}${es.cents.toFixed(3)} ¢`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const amps = tr && tr.amps && tr.amps.length === model.modes.length ? tr.amps : null;
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>f / f₁</th><th>bare</th><th>T60 (s)</th><th>at slot</th></tr>'
    + model.modes.map((m, i) => `<tr><td>${i + 1}</td><td>${m.f.toFixed(1)}</td><td>${m.ratio.toFixed(2)}</td><td>${m.bare.toFixed(2)}</td><td>${(6.91 / m.sigma).toFixed(2)}</td><td>${amps ? (amps[i] > 0 ? `${(20 * Math.log10(amps[i] / amps[0])).toFixed(0)} dB` : '—') : ''}</td></tr>`).join('');
  $('#pickup-read').textContent = `rest ${P.offset >= 0 ? '+' : '−'}${Math.abs(P.offset).toFixed(2)} mm · gap ${P.gap.toFixed(2)} mm`;
  $('#motion-read').textContent = `${noteName(focus)} · velocity ${lastVel.toFixed(2)}`;
}

$('#replay').addEventListener('click', (e) => { motion.replay(); e.currentTarget.blur(); });
shell.keys.focus(focus);
update(true);
