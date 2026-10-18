// grand-main.js — the page: wires the shell to the engine and draws the views.
// The slow-motion view re-runs the focused key's strike on the main thread
// with the same engine, sample by sample, and records the string: the
// engine and model built as WebAssembly from the C++, as the worklet runs it.
// It also keeps the engine's oscillator budget in step with the audio thread's
// measured load.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './grand-instrument.js';
import { wasmModel } from './grand-wasm.js';

const model = await wasmModel();
const MODE_BUDGET = 4000; // the engine's default oscillator budget (grand-engine.h)

const $ = (s) => document.querySelector(s);
const FS = 48000, TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'));
let focus = 60, focusVel = 0.7, sim = null, board = null, boardKey = '', timer = 0, t0 = performance.now();

// CPU: the worklet reports the share of each render quantum spent in the engine
// (about four times a second). Over 60 % on average, or 90 % in the worst
// block, the budget of oscillators shrinks by a quarter (the quietest, oldest
// voices fade); under 30 % it grows back by a tenth. Touch devices, usually
// slower, start from and return to a lower ceiling.
const CEILING = matchMedia('(pointer: coarse)').matches ? 2400 : MODE_BUDGET;
let budget = CEILING;
const sendBudget = () => shell.post({ type: 'budget', modes: budget });
function adapt({ load, peak }) {
  if (!Number.isFinite(load)) return;
  const hot = load > 0.6 || peak > 0.9, cool = load < 0.3 && !(peak > 0.6);
  const next = hot ? Math.max(800, Math.round(budget * 0.75)) : cool ? Math.min(CEILING, Math.round(budget * 1.1)) : budget;
  if (next !== budget) { budget = next; sendBudget(); }
}

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => { spectrum.setAnalyser(a.analyser); sendBudget(); },
  onMessage: (m) => { if (m.type === 'stats') adapt(m); },
  onNoteOn: (key, vel) => { focus = key; focusVel = vel; schedule(); },
  onParam: (id) => { if (id !== 'volume' && id !== 'room' && id !== 'velocity') schedule(); },
});

function schedule() { clearTimeout(timer); timer = setTimeout(update, 40); }

function getBoard(P) {
  if (P.mount !== 'board') return null;
  if (boardKey !== String(P.boardH)) { board = model.boardModel(P); boardKey = String(P.boardH); }
  return board;
}

// Re-run the strike of `key` and record string 0's vertical shape, the hammer,
// and the bridge and contact forces, for a few periods.
function simulate(key, vel) {
  const P = shell.P, eng = new model.Engine(FS);
  eng.setParams({ ...P });
  const v = eng.noteOn(key, vel), d = v.data, S = d.S, nP = d.partials.length;
  const dur = Math.min(0.08, Math.max(0.02, 2.5 / S.f0)), pre = 0.15 * dur;
  const nS = Math.round(dur * FS), nPre = Math.round(pre * FS), stride = Math.max(1, Math.round((nS + nPre) / 400));
  const NX = 121, nrm = Math.sqrt(2 / (S.mu * S.L)), phi = new Float64Array(nP * NX);
  for (let j = 0; j < nP; j++) for (let i = 0; i < NX; i++) phi[j * NX + i] = nrm * Math.sin((d.partials[j].k * S.L * i) / (NX - 1));
  const frames = [], eta = [], fB = new Float64Array(nPre + nS), fC = new Float64Array(nPre + nS);
  const v0 = model.hammerSpeed(vel), etaStart = v.eta;
  for (let s = -nPre; s < 0; s += stride) { frames.push(new Float32Array(NX)); eta.push(etaStart + (v0 * s) / FS); }
  const L1 = new Float32Array(1), R1 = new Float32Array(1);
  let lastEta = v.eta, lastVel = v0, tOff = 0;
  for (let s = 0; s < nS; s++) {
    eng.process(L1, R1, 1);
    fB[nPre + s] = v.FV; fC[nPre + s] = v.hammerOn ? v.F : 0;
    if (v.hammerOn) { lastEta = v.eta; lastVel = (v.eta - v.etaPrev) * FS; tOff = s; }
    if (s % stride === 0) {
      const y = new Float32Array(NX);
      for (let j = 0; j < nP; j++) { const q = v.q[j * d.ns]; for (let i = 0; i < NX; i++) y[i] += q * phi[j * NX + i]; }
      frames.push(y); eta.push(v.hammerOn ? v.eta : lastEta + (lastVel * (s - tOff)) / FS);
    }
  }
  // modal amplitudes of string 0 (V) after the strike (the strings of a partial sit side by side)
  const amp = new Float64Array(nP);
  for (let j = 0; j < nP; j++) { // amplitude of a sinusoid from two consecutive samples
    const i = j * d.ns, c = Math.cos((TAU * d.freq[i]) / FS), q0 = v.q[i], q1 = v.q1[i];
    amp[j] = Math.sqrt(Math.max(0, (q0 * q0 + q1 * q1 - 2 * q0 * q1 * c) / (1 - c * c)));
  }
  let maxY = 1e-9;
  for (const y of frames) for (let i = 0; i < NX; i++) maxY = Math.max(maxY, Math.abs(y[i]));
  for (const e of eta) if (Number.isFinite(e)) maxY = Math.max(maxY, Math.min(Math.abs(e), 3 * maxY));
  let Fm = 1e-9, Fc = 1e-9;
  for (let s = 0; s < fB.length; s++) { Fm = Math.max(Fm, Math.abs(fB[s])); Fc = Math.max(Fc, fC[s]); }
  const out = { d, S, frames, eta, fB, fC, Fm, Fc, amp, stride, nPre, dur, pre, maxY, contactMs: (v.contactSamples / FS) * 1000, Fmax: v.Fmax, v0, P: { ...P } };
  eng.destroy?.(); // the WebAssembly engine's memory
  return out;
}

const sci = (v) => v.toExponential(1);
function update() {
  const P = shell.P, B = getBoard(P);
  sim = simulate(focus, focusVel); t0 = performance.now();
  const { d, S, amp } = sim, ps = d.partials, ns = d.ns, mic = P.mount === 'board' && P.listen > 0.5;
  shell.keys.focus(focus);
  $('#focus-name').textContent = noteName(focus);
  $('#info-sub').textContent = `${S.f0.toFixed(1)} Hz · ${ns} string${ns > 1 ? 's' : ''}`;

  // per-partial levels after the strike: displacement, bridge force, microphone
  const disp = ps.map((p, j) => amp[j]), force = ps.map((p, j) => Math.abs(p.b) * amp[j]);
  const micL = B ? ps.map((p, j) => force[j] * model.boardResponse(B, d.seg, p.f, 0)) : null;
  const dB = (arr) => { const m = Math.max(...arr, 1e-30); return arr.map((a) => 20 * Math.log10(Math.max(a, 1e-30) / m)); };
  sim.levels = { disp: dB(disp), force: dB(force), mic: micL ? dB(micL) : null };
  const heard = mic ? sim.levels.mic : sim.levels.force;
  spectrum.set(S.f0, ps.map((p, j) => ({ f: p.f, alpha: 0.12 + 0.8 * 10 ** (heard[j] / 40) })));
  const centroid = (arr) => { let a = 0, b = 0; arr.forEach((x, j) => { a += ps[j].f * x * x; b += x * x; }); return a / b; };
  $('#weights-read').textContent = `centroid: displacement ${centroid(disp).toFixed(0)} Hz · piezo ${centroid(force).toFixed(0)} Hz${micL ? ` · mic ${centroid(micL).toFixed(0)} Hz` : ''}`;
  $('#mic-legend').hidden = !B;

  const sb = ps[0].bridgeV, dw = TAU * S.f0 * (2 ** (Math.max(...d.det) / 1200) - 2 ** (Math.min(...d.det) / 1200));
  const rows = [
    ['String', `L = ${(S.L * 100).toFixed(1)} cm · ${S.wound ? `⌀${(S.d * 1e3).toFixed(2)} mm core, copper-wound to ⌀${(S.dOut * 1e3).toFixed(1)} mm` : `plain steel ⌀${(S.d * 1e3).toFixed(2)} mm`}`],
    ['Tension', `${S.T.toFixed(0)} N (${((100 * S.stress) / 2.2e9).toFixed(0)} % of breaking) · μ = ${(S.mu * 1e3).toFixed(1)} g/m`],
    ['Inharmonicity', `B = ${S.B.toExponential(2)}${ps[9] ? ` · 10th partial ${ps[9].stretch >= 0 ? '+' : ''}${ps[9].stretch.toFixed(0)} ¢` : ''}`],
    ['Tuning', P.stretch === false ? '12-TET' : `${S.cents >= 0 ? '+' : ''}${S.cents.toFixed(1)} ¢ from 12-TET (stretched: every octave beatless)`],
    ['Hammer', `${(d.hammer.mass / ns * 1e3).toFixed(1)} g at ${sim.v0.toFixed(2)} m/s, x = ${(d.xh * 100).toFixed(1)} cm · contact ${sim.contactMs.toFixed(2)} ms, peak ${sim.Fmax.toFixed(0)} N`],
    ['Bridge', B ? `soundboard: Re Y(f₁) = ${sci(ps[0].GV)} s/kg (board mean ${sci(B.Ginf)}) · σ_b = ${sb.toFixed(2)} s⁻¹` : `frame: G = ${sci(P.gFrame)} s/kg · σ_b = ${sb.toFixed(3)} s⁻¹ per string`],
    ['Unison', ns > 1 ? `coupling ${ns}σ_b = ${(ns * sb).toFixed(3)} s⁻¹ vs mistuning 2πΔf = ${dw.toFixed(3)} s⁻¹ → ${dw > ns * sb ? 'they beat' : 'they lock'}` : 'one string'],
    ['Polarisation', `H sits ${(1200 * Math.log2(ps[0].fH / ps[0].f)).toFixed(2)} ¢ from V · gets sin²α = ${(100 * Math.sin((P.tilt * Math.PI) / 180) ** 2).toFixed(1)} % of the blow's energy`],
  ];
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const t60 = (s) => (6.91 / s >= 100 ? '>100' : (6.91 / s).toFixed(s > 3 ? 2 : 1));
  $('#modes').innerHTML = `<tr><th>n</th><th>f (Hz)</th><th>¢ vs n·f₁</th><th>T60 prompt</th><th>T60 after</th><th>strike</th><th>${mic ? 'mic' : 'piezo'}</th></tr>`
    + ps.slice(0, 40).map((p, j) => {
      const r = model.decayRates(p, ns);
      return `<tr><td>${p.n}</td><td>${p.f.toFixed(1)}</td><td>${p.stretch >= 0 ? '+' : ''}${p.stretch.toFixed(1)}</td><td>${t60(r.prompt)} s</td><td>${t60(r.after)} s</td><td>${sim.levels.disp[j].toFixed(0)} dB</td><td>${heard[j].toFixed(0)} dB</td></tr>`;
    }).join('');
}

// ---- slow motion ------------------------------------------------------------
let speed = 0.005;
$('#speed').addEventListener('change', (e) => { speed = +e.target.value; t0 = performance.now(); e.target.blur(); });
$('#replay').addEventListener('click', (e) => { t0 = performance.now(); e.currentTarget.blur(); });

const motionCanvas = $('#motion'), weightsCanvas = $('#weights');
animate(() => {
  if (motionCanvas.offsetParent === null) return; // card hidden
  const { ctx, w, h } = fit(motionCanvas);
  ctx.clearRect(0, 0, w, h);
  if (!sim || w < 80 || h < 60) return;
  const { d, S, frames, eta, fB, fC, Fm, Fc, stride, dur, pre, maxY } = sim;
  const total = pre + dur, tw = ((performance.now() - t0) / 1000) % (total / speed + 0.8);
  const t = Math.min(total, tw * speed), fi = Math.min(frames.length - 1, Math.floor((t * FS) / stride));
  const y = frames[fi], NX = y.length;
  const accent = css('--accent'), accent2 = css('--accent-2'), muted = css('--muted'), text = css('--text'), str = css('--string') || text;
  ctx.font = '10px system-ui, sans-serif';

  // string, hammer, bridge
  const x0 = 30, x1 = w - 46, hTop = h * 0.56, yc = hTop * 0.45, A = (hTop * 0.32) / maxY;
  const X = (u) => x0 + u * (x1 - x0);
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
  ctx.fillStyle = muted; ctx.fillRect(x0 - 8, yc - 14, 8, 28); // agraffe
  ctx.fillText('agraffe', x0 - 10, yc + 26);
  const xh = X(d.beta), ww = Math.max(8, (d.wH / S.L) * (x1 - x0)), et = eta[fi];
  if (Number.isFinite(et)) {
    const top = Math.min(hTop - 4, yc - A * et); // up = the direction of the blow
    ctx.fillStyle = accent2; ctx.globalAlpha = 0.85;
    const hh = Math.max(2, hTop * 0.3), rr = Math.max(0, Math.min(ww / 2, hh / 2));
    ctx.beginPath(); ctx.roundRect(xh - ww / 2, top, ww, hh, [rr, rr, 0, 0]); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = str; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < NX; i++) { const px = X(i / (NX - 1)), py = yc - A * y[i]; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.stroke(); ctx.lineWidth = 1;
  // bridge on its piezo; the bar shows the vertical force now
  const Fnow = fB[Math.min(fB.length - 1, Math.round(t * FS))];
  ctx.fillStyle = muted; ctx.beginPath(); ctx.moveTo(x1, yc); ctx.lineTo(x1 - 9, yc + 18); ctx.lineTo(x1 + 9, yc + 18); ctx.fill();
  ctx.fillStyle = accent; ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, Math.abs(Fnow) / Fm);
  ctx.fillRect(x1 - 11, yc + 19, 22, 9); ctx.globalAlpha = 1;
  ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1 + 22, yc + 8); ctx.lineTo(x1 + 22, yc + 8 - (Fnow / Fm) * hTop * 0.3); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('bridge + piezo', x1, yc + 40);
  ctx.fillText(`x = ${(100 * d.beta).toFixed(1)} % of L`, xh, Math.min(hTop - 2, yc + hTop * 0.5));
  ctx.textAlign = 'left';
  ctx.fillText(`t = ${((t - pre) * 1000).toFixed(2)} ms · string ×${(A * 1e-3).toFixed(0)} px/mm`, x0, 12);

  // force traces
  const tx0 = x0, tx1 = w - 10, ty0 = hTop + 14, ty1 = h - 14, mid = (ty0 + ty1) / 2;
  const TX = (s) => tx0 + (s / (fB.length - 1)) * (tx1 - tx0);
  const sc = (ty1 - ty0) / 2;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(tx0, mid); ctx.lineTo(tx1, mid); ctx.stroke();
  const trace = (arr, m, col) => {
    ctx.strokeStyle = col; ctx.beginPath();
    const step = Math.max(1, Math.floor(arr.length / (tx1 - tx0)));
    for (let s = 0; s < arr.length; s += step) { const px = TX(s), py = mid - (arr[s] / m) * sc * 0.95; if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  };
  trace(fC, Fc, accent2); ctx.lineWidth = 1.5; trace(fB, Fm, accent); ctx.lineWidth = 1;
  const cx = TX(Math.min(fB.length - 1, t * FS));
  ctx.strokeStyle = text; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(cx, ty0); ctx.lineTo(cx, ty1); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = accent; ctx.fillText(`bridge force (±${Fm.toFixed(1)} N)`, tx0, ty0 - 2);
  ctx.fillStyle = accent2; ctx.fillText(`felt contact force (peak ${Fc.toFixed(0)} N)`, tx0 + 150, ty0 - 2);
  ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(`${(dur * 1000).toFixed(0)} ms`, tx1, ty1 + 11); ctx.textAlign = 'left';
}, motionCanvas);

// ---- partial weighting -------------------------------------------------------
animate(() => {
  if (weightsCanvas.offsetParent === null) return; // card hidden
  const { ctx, w, h } = fit(weightsCanvas);
  ctx.clearRect(0, 0, w, h);
  if (!sim?.levels || w < 60 || h < 40) return;
  const { disp, force, mic } = sim.levels, nP = Math.min(disp.length, 36);
  const padL = 30, padB = 16, padT = 6, top = 0, range = 60;
  const Y = (v) => padT + ((h - padT - padB) * (top - Math.max(-range, v))) / range;
  const bw = (w - padL - 6) / nP, series = mic ? [[disp, css('--string')], [force, css('--accent')], [mic, css('--accent-2')]] : [[disp, css('--string')], [force, css('--accent')]];
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid'); ctx.textAlign = 'right';
  for (let v = 0; v >= -range; v -= 20) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - 6, Y(v)); ctx.stroke(); ctx.fillText(`${v}`, padL - 4, Y(v) + 3); }
  ctx.textAlign = 'center';
  for (let j = 0; j < nP; j++) {
    const xb = padL + j * bw, sw = (bw * 0.8) / series.length;
    series.forEach(([arr, col], s) => { ctx.fillStyle = col; const yv = Y(arr[j]); ctx.fillRect(xb + bw * 0.1 + s * sw, yv, Math.max(1, sw - 0.5), h - padB - yv); });
    if ((j + 1) % (nP > 20 ? 5 : 2) === 0 || j === 0) { ctx.fillStyle = css('--muted'); ctx.fillText(`${j + 1}`, xb + bw / 2, h - 4); }
  }
}, weightsCanvas);

update();
