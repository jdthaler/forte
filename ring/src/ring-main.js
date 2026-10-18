// ring-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './ring-instrument.js';
import { PICKUP_SIGMA } from './ring-model.js';
import { wasmModel } from './ring-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
let focus = 60, injected = -1e9, kick = 0; // the last key played, when (performance.now), and its kick

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; injected = performance.now(); kick = shell.P.kick; update(); },
  onParam: () => update(),
});

// The lines the pickup's spectrum shows: the harmonics, weighed by the bunch's form factor, and
// the betatron sidebands beside them.
function spectrumLines(r, P, fmax = 12000) {
  const out = [], sig = Math.hypot(r.sigma, PICKUP_SIGMA * r.frev);
  for (let n = 1; n * r.frev < fmax; n++) {
    const a = model.formFactor(n, sig);
    out.push({ f: n * r.frev, amp: a, kind: 'harmonic' });
    if (P.kick > 0) for (const s of [n - P.tune, n + P.tune]) out.push({ f: s * r.frev, amp: a * Math.min(1, P.kick * P.size), kind: 'sideband' });
  }
  return out;
}

function update() {
  const P = shell.P, r = model.ringOf(focus, P);
  const lines = spectrumLines(r, P).filter((l) => l.amp > 0.02);
  spectrum.set(r.frev, lines.map((l) => ({ f: l.f, alpha: 0.2 + 0.6 * l.amp, color: l.kind === 'sideband' ? css('--accent-2') : undefined })));
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name2').textContent = noteName(focus);
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  $('#ringtab').innerHTML = [
    row('revolution frequency f_rev', `${r.frev.toFixed(2)} Hz`),
    row('synchrotron frequency', `${r.fsyn.toFixed(2)} Hz (Qs = ${r.Qs.toFixed(4)})`),
    row('betatron sidebands', `(n ± ${P.tune.toFixed(3)})·f_rev: ${((1 - P.tune) * r.frev).toFixed(1)}, ${((1 + P.tune) * r.frev).toFixed(1)} Hz, …`),
    row('chromaticity of this ring', `Q′ = ${r.chroma.toFixed(1)}`),
    row('dephasing D = Q′σδ/Qs', `${r.D.toFixed(2)}: the signal falls to ${(100 * Math.exp(-2 * r.D * r.D)).toPrecision(2)} % half way`),
    row('bunch length', `${(100 * r.sigma).toFixed(2)} % of the ring: harmonic ${Math.max(1, Math.round(1 / (2 * Math.PI * r.sigma)))} is down 4.3 dB`),
    row('amplitude detuning', `μ = ${(r.mu * 1e4).toFixed(2)}×10⁻⁴ per turn at 1σ`),
  ].join('');
}

// Deterministic Gaussian particles: their transverse place (x, p), their momentum's synchrotron
// coordinates (a, b, in units of σδ) and an equilibrium place for when radiation has damped them.
const parts = (() => {
  let s = 12345;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return Array.from({ length: 360 }, () => ({ x: g(), p: g(), a: g(), b: g(), ex: g(), ep: g() }));
})();

// Phase space, in the frame turning with the tune: each particle's phase slips by its amplitude
// detuning and its chromatic phase, (Q′/Qs)·δ's swing; radiation pulls them back to equilibrium.
animate(() => {
  const { ctx, w, h } = fit($('#phase'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, r = model.ringOf(focus, P), N = (Math.max(0, performance.now() - injected) / 1000) * r.frev;
  const cx = w / 2, cy = h / 2, sc = Math.min(w, h) / (2 * (Math.max(kick, 1) + 3.2));
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  for (const rr of [1, 2, 3]) { ctx.beginPath(); ctx.arc(cx, cy, rr * sc, 0, 2 * Math.PI); ctx.stroke(); }
  const phiS = 2 * Math.PI * r.Qs * N, d = Math.exp(-N / (r.frev * P.damping)), e = Math.sqrt(1 - d * d);
  const chr = (r.chroma * r.sigmaDelta) / r.Qs, sn = Math.sin(phiS), cs = 1 - Math.cos(phiS);
  let mx = 0, my = 0;
  ctx.fillStyle = css('--accent');
  ctx.globalAlpha = 0.75;
  for (const q of parts) {
    const x = q.x + kick, p = q.p, ph = 2 * Math.PI * r.mu * (x * x + p * p) * N + chr * (q.a * sn + q.b * cs);
    const X = d * (x * Math.cos(ph) - p * Math.sin(ph)) + e * q.ex, Y = d * (x * Math.sin(ph) + p * Math.cos(ph)) + e * q.ep;
    mx += X; my += Y;
    ctx.fillRect(cx + X * sc - 1.5, cy - Y * sc - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  mx /= parts.length; my /= parts.length;
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx + mx * sc, cy - my * sc, 7, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`turn ${Math.floor(N)}`, 8, 14);
  ctx.fillText('x / σ', w - 34, cy - 4);
}, $('#phase'));

// The pickup's reading on every turn since the last note (the last two seconds of it), and the
// model's envelope ±|x̄|.
animate(() => {
  const { ctx, w, h } = fit($('#bpm'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, r = model.ringOf(focus, P), now = Math.max(0, performance.now() - injected) / 1000;
  const span = 2, t0 = Math.max(0, now - span), cy = h / 2, sc = (h / 2 - 10) / Math.max(kick, 0.5);
  const X = (t) => 6 + ((w - 12) * (t - t0)) / span;
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  for (let k = Math.ceil(t0 * r.fsyn); k / r.fsyn < t0 + span; k++) { const x = X(k / r.fsyn); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } // synchrotron periods
  if (!(kick > 0) || now > 60) return;
  ctx.fillStyle = css('--accent-2'); ctx.globalAlpha = 0.18; ctx.beginPath();
  const cols = Math.max(2, Math.floor(w / 2)), env = [];
  for (let i = 0; i <= cols; i++) { const t = t0 + (span * i) / cols; env.push(t <= now ? model.centroid(t * r.frev, focus, P, kick).env : 0); }
  env.forEach((v, i) => { const x = 6 + ((w - 12) * i) / cols; if (i) ctx.lineTo(x, cy - v * sc); else ctx.moveTo(x, cy - v * sc); });
  for (let i = cols; i >= 0; i--) ctx.lineTo(6 + ((w - 12) * i) / cols, cy + env[i] * sc);
  ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--accent');
  const n0 = Math.ceil(t0 * r.frev), n1 = Math.floor(now * r.frev), step = Math.max(1, Math.floor((n1 - n0) / 4000));
  for (let n = n0; n <= n1; n += step) { const c = model.centroid(n, focus, P, kick); ctx.fillRect(X(n / r.frev) - 1, cy - c.x * sc - 1, 2, 2); }
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`${now.toFixed(2)} s · lines: synchrotron periods`, 8, 14);
}, $('#bpm'));

update();
