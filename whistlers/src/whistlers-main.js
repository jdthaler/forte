// whistlers-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './whistlers-instrument.js';
import { wasmModel } from './whistlers-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const K = model.constants;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum, fLo: 25 });
let focus = 60;
const strokes = new Map(); // the last stroke on each key, as the engine told it, and when
const sparks = [];         // chorus elements on the played key, as they start

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type === 'stroke') { strokes.set(m.key, { ...m, at: performance.now(), packets: null }); if (m.key === focus) packets = null; }
    else if (m.type === 'chorus' && m.key === focus) { sparks.push({ ...m, at: performance.now() }); if (sparks.length > 30) sparks.shift(); }
  },
});

const fmtT = (t) => (t < 1 ? `${(t * 1000).toFixed(0)} ms` : t < 120 ? `${t.toFixed(t < 10 ? 2 : 1)} s` : `${(t / 60).toFixed(1)} min`);
const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const hops = (P) => (P.receiver === 'source' ? 2 : 1);

let line = null, track = null, packets = null;
// the field lines of every C, for scale (the nose hardly moves with the plasma, so these are
// rebuilt only when the tuning changes)
let cs = [], csKey = '';

function update() {
  const P = shell.P, f = tunedFreq(P, focus);
  line = model.line(model.lineFor(f, P), P);
  track = model.track(line.L, P);
  packets = null;
  const key = [P.pitch, P.temperament, P.tuningRoot, P.density, P.plasmapause, ...Array.from({ length: 11 }, (_, i) => P[`cents${i + 1}`])].join();
  if (key !== csKey) {
    csKey = key;
    cs = [24, 36, 48, 60, 72, 84, 96, 108].map((k) => ({ key: k, L: model.lineFor(tunedFreq(P, k), P) }));
  }
  const markers = [{ f: line.nose.f, alpha: 0.9 }, { f: K.DUCT_CUTOFF * line.fce, alpha: 0.7, color: css('--accent-2') }];
  if (P.sferic > 0) for (let m = 1; m <= 4; m++) markers.push({ f: model.tweekCutoff(m, P.iono), alpha: 0.35, color: css('--muted') });
  spectrum.set(0, markers);
  $('#focus-name').textContent = noteName(focus);
  $('#focus-name2').textContent = noteName(focus);
  $('#line-read').textContent = `L = ${line.L.toFixed(2)} · nose ${fmtF(line.nose.f)} · f_ce ${fmtF(line.fce)} · one hop ${fmtT(line.nose.tau)}`;
}

// A frequency's colour: the nose and the octaves under it bright, the lower ones amber.
const tint = (u) => (u < 0.5 ? css('--accent') : css('--accent-2')); // u = 0 the nose … 1 five octaves below

// For each of a few frequencies on the played line, its delay from the southern foot to each
// latitude: the packets' paths. Built once per stroke.
function buildPackets(s) {
  const P = shell.P, ln = model.line(s.L, P), N = 96, lam0 = ln.lam0;
  const fs = [];
  for (let k = 0; k <= 10; k++) fs.push({ f: ln.nose.f * 2 ** (-k / 2), u: k / 10 });
  for (const r of [1.08, 1.16]) if (r * ln.nose.f < K.DUCT_CUTOFF * ln.fce) fs.push({ f: r * ln.nose.f, u: 0 });
  const lam = Array.from({ length: N + 1 }, (_, j) => -lam0 + (2 * lam0 * j) / N);
  return fs.map(({ f, u }) => {
    const cum = [0];
    for (let j = 1; j <= N; j++) {
      const at = (j - 0.5) / N, l = -lam0 + 2 * lam0 * at, sn = Math.sin(l), c = Math.cos(l), q = Math.sqrt(1 + 3 * sn * sn);
      const fce = (ln.fce * q) / c ** 6, n = ln.neq * c ** (-2 * ln.alpha);
      const ng = model.groupIndex(K.FPE_K * Math.sqrt(n), fce, f);
      cum.push(cum[j - 1] + (ng * ln.L * K.RE_KM * c * q * (lam[j] - lam[j - 1])) / K.C_KM);
    }
    return { f, u, cum, lam, total: cum[N] };
  });
}

// The Earth, its field lines and the plasmasphere; the stroke's crack travelling the played line.
animate(() => {
  const { ctx, w, h } = fit($('#field'));
  ctx.clearRect(0, 0, w, h);
  if (!line) return;
  const P = shell.P, now = performance.now(), Lf = line.L, rTop = 1 + K.TOP_KM / K.RE_KM;
  const s = Math.max(1e-3, Math.min((w - 24) / (Lf * 1.04 + 1.15), (h - 16) / (0.8 * Lf))), cx = 12 + 1.1 * s, cy = h / 2;
  const X = (r, l) => cx + s * r * Math.cos(l), Y = (r, l) => cy - s * r * Math.sin(l);
  const path = (L) => {
    const l0 = Math.acos(Math.sqrt(Math.min(1, rTop / L)));
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const l = -l0 + (2 * l0 * i) / 80, r = L * Math.cos(l) ** 2; if (i) ctx.lineTo(X(r, l), Y(r, l)); else ctx.moveTo(X(r, l), Y(r, l)); }
  };
  // the plasmasphere, out to the plasmapause
  if (P.plasmapause > rTop) {
    path(P.plasmapause); ctx.closePath();
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = 1;
  }
  // every C's line, and the played one
  ctx.font = '10px system-ui, sans-serif';
  for (const c of cs) {
    if (c.L > Lf * 1.06) continue;
    ctx.strokeStyle = css('--grid'); path(c.L); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.fillText(noteName(c.key), X(c.L, 0) + 2, cy - 3);
  }
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; path(Lf); ctx.stroke(); ctx.lineWidth = 1;
  // the Earth
  ctx.fillStyle = css('--card') || '#1a1a1e'; ctx.strokeStyle = css('--muted');
  ctx.beginPath(); ctx.arc(cx, cy, s, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.arc(cx, cy, s * rTop, 0, 2 * Math.PI); ctx.stroke();
  // the stroke, the crack's frequencies along the line, and its echoes
  const st = strokes.get(focus);
  const l0 = line.lam0, south = [X(rTop * 0.97, -l0), Y(rTop * 0.97, -l0)], north = [X(rTop * 0.97, l0), Y(rTop * 0.97, l0)];
  ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(...south, 2.5, 0, 2 * Math.PI); ctx.fill();
  const rx = hops(P) === 1 ? north : south;
  ctx.strokeStyle = css('--accent'); ctx.beginPath(); ctx.arc(...rx, 4, 0, 2 * Math.PI); ctx.stroke();
  if (st && Math.abs(st.L - Lf) < 1e-6 * Lf) {
    const T = st.clock + (now - st.at) / 1000;
    const flash = (now - st.at) / 1000;
    if (flash < 0.25) {
      ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.globalAlpha = 1 - flash / 0.25;
      ctx.beginPath(); ctx.moveTo(south[0] - 6, south[1] + 10); ctx.lineTo(south[0] + 2, south[1] + 3); ctx.lineTo(south[0] - 3, south[1] + 1); ctx.lineTo(...south); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    packets ??= buildPackets(st);
    for (const p of packets) {
      const k = Math.floor(T / p.total);
      const level = st.echo ** Math.max(0, k + 1 - st.hop);
      if (k > 9 || level < 0.02 || T < 0) continue;
      let t = T - k * p.total;
      if (k % 2) t = p.total - t; // back from the far end
      let j = 1;
      while (j < p.cum.length - 1 && p.cum[j] < t) j++;
      const u = (t - p.cum[j - 1]) / Math.max(1e-12, p.cum[j] - p.cum[j - 1]), l = p.lam[j - 1] + u * (p.lam[j] - p.lam[j - 1]);
      const r = Lf * Math.cos(l) ** 2;
      ctx.fillStyle = tint(p.u); ctx.globalAlpha = Math.max(0.15, Math.sqrt(level)) * (1 - 0.6 * p.u);
      ctx.beginPath(); ctx.arc(X(r, l), Y(r, l), p.u === 0 ? 3.5 : 2.5, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // chorus at the equator
  for (const sp of sparks) {
    const a = 1 - (now - sp.at) / (1000 * sp.dur + 200);
    if (a <= 0) continue;
    ctx.globalAlpha = a; ctx.fillStyle = css('--accent');
    const j = ((sp.f0 * 7919) % 1) - 0.5;
    ctx.beginPath(); ctx.arc(X(Lf, 0) + j * 6, cy + j * 10, 2, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
}, $('#field'));

// Frequency against arrival time: the first hop and its echoes, Eckersley's law, the nose.
animate(() => {
  const { ctx, w, h } = fit($('#dispersion'));
  ctx.clearRect(0, 0, w, h);
  if (!track) return;
  const P = shell.P, h0 = hops(P), fn = line.nose.f, fTop = 0.6 * line.fce, fLo = fn / K.LOW_SPAN;
  const shown = [h0];
  for (let k = 1; k < 3 && P.echo ** (2 * k) > 0.01; k++) shown.push(h0 + 2 * k);
  const tAt = (f) => model.delay(line.L, P, f);
  // the first hop down four octaves, and the first echo's nose if there is one
  const tMax = Math.max(h0 * tAt(fn / 16), shown.length > 1 ? 1.4 * shown[1] * line.nose.tau : 0);
  const padL = 44, padB = 18, padT = 8, padR = 8, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  const X = (t) => padL + (W * t) / tMax, Y = (f) => padT + H * (1 - Math.log(f / fLo) / Math.log(fTop / fLo));
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(padL, padT, W, H);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const f of [fn / 16, fn / 4, fn]) ctx.fillText(fmtF(f), padL - 3, Y(f) + 3);
  ctx.textAlign = 'left';
  ctx.fillText('0', padL, h - 4); ctx.textAlign = 'right'; ctx.fillText(fmtT(tMax), padL + W, h - 4); ctx.textAlign = 'left';
  // the duct's cutoff
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(padL, Y(K.DUCT_CUTOFF * line.fce)); ctx.lineTo(padL + W, Y(K.DUCT_CUTOFF * line.fce)); ctx.stroke();
  // where you start hearing it, when the travel time is off
  const st = strokes.get(focus);
  if (st && !st.travel && Math.abs(st.L - line.L) < 1e-6 * line.L) {
    ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.moveTo(X(st.clock), padT); ctx.lineTo(X(st.clock), padT + H); ctx.stroke();
    ctx.fillStyle = css('--muted'); ctx.fillText('key', X(st.clock) + 3, padT + 10);
  }
  ctx.setLineDash([]);
  // Eckersley's law, through the lowest frequency
  const D = tAt(fLo) * Math.sqrt(fLo);
  ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 4]);
  for (const n of shown) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const f = fLo * (fTop / fLo) ** (i / 60), t = (n * D) / Math.sqrt(f); if (i) ctx.lineTo(X(t), Y(f)); else ctx.moveTo(X(t), Y(f)); }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // the model, hop by hop
  shown.forEach((n, j) => {
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = j ? 1 : 2; ctx.globalAlpha = j ? Math.max(0.25, P.echo ** (2 * j)) : 1;
    ctx.beginPath();
    track.f.forEach((f, i) => { if (i && f <= track.f[i - 1]) return; const x = X(n * track.tau[i]), y = Y(f); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  });
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(X(h0 * line.nose.tau), Y(fn), 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = css('--muted'); ctx.fillText(`nose ${fmtF(fn)} at ${fmtT(h0 * line.nose.tau)} · D = ${D.toFixed(0)} √s`, padL + 6, padT + H - 6);
}, $('#dispersion'));

// The equatorial density against L, with the keys' lines along the top.
animate(() => {
  const { ctx, w, h } = fit($('#density'));
  ctx.clearRect(0, 0, w, h);
  if (!line) return;
  const P = shell.P, L0 = 2, L1 = 30, n0 = 0.1, n1 = 1e4;
  const padL = 40, padB = 18, padT = 18, padR = 8, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  const X = (L) => padL + (W * Math.log(L / L0)) / Math.log(L1 / L0), Y = (n) => padT + H * (1 - Math.log(n / n0) / Math.log(n1 / n0));
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(padL, padT, W, H);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const n of [0.1, 1, 10, 100, 1000, 10000]) ctx.fillText(n >= 1 ? `${n}` : '0.1', padL - 3, Y(n) + 3);
  ctx.textAlign = 'center';
  for (const L of [2, 3, 4, 6, 8, 10, 15, 20, 30]) ctx.fillText(`${L}`, X(L), h - 4);
  ctx.textAlign = 'left';
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(P.plasmapause), padT); ctx.lineTo(X(P.plasmapause), padT + H); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const L = L0 * (L1 / L0) ** (i / 200), n = Math.min(n1, Math.max(n0, model.density(L, P.plasmapause, P.density)));
    if (i) ctx.lineTo(X(L), Y(n)); else ctx.moveTo(X(L), Y(n));
  }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted');
  for (const c of cs) { ctx.fillRect(X(c.L) - 0.5, padT - 6, 1, 6); ctx.fillText(noteName(c.key), X(c.L) - 6, padT - 8); }
  ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(X(line.L), Y(Math.min(n1, Math.max(n0, line.neq))), 3.5, 0, 2 * Math.PI); ctx.fill();
}, $('#density'));

update();
