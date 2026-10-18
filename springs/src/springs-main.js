// springs-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT, KEY_MIN, KEY_MAX } from './springs-instrument.js';
import { wasmModel } from './springs-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const TAU = 2 * Math.PI;
const cents = (f, g) => 1200 * Math.log2(f / g);
// A spring scaled in every dimension by 1/ρ: every mode, F_C and echo × ρ (the shape is unchanged),
// as the tuning plays it.
const scaleSpring = (sp, rho) => ({
  ...sp, R: sp.R / rho, r: sp.r / rho, L: sp.L / rho, TD: sp.TD / rho, Fc: sp.Fc * rho, kc: sp.kc * rho,
  height: sp.height / rho, mass: sp.mass / rho ** 3, scale: rho,
});

const $ = (s) => document.querySelector(s);
let focus = 60, echo = null, analyser = null, strikeAt = -1, strikeVel = 0.7;
const rate = () => shell?.audio?.ctx.sampleRate || 48000;

// ---- the springs and their modes, sent with each note ----------------------------------------------
// (a few hundred 6 × 6 eigenproblems for a bass key: too slow for the audio thread, so the page
// builds them with its model, which keeps them, and works through the keyboard in spare moments
// after a change). The engine takes them packed; the views draw them.
const springsFor = (key, P = shell.P, fs = rate()) => model.keySprings(key, P, fs);
const noteData = (key, vel, P, fs) => model.keySprings(key, P, fs).packed;
let warmTimer = 0;
function prewarm() {
  clearTimeout(warmTimer);
  const keys = [];
  for (let d = 0; d <= KEY_MAX - KEY_MIN; d++) for (const k of [focus - d, focus + d]) if (k >= KEY_MIN && k <= KEY_MAX && !keys.includes(k)) keys.push(k);
  const step = () => { const k = keys.shift(); if (k !== undefined) { noteData(k, 0.7, shell.P, rate()); warmTimer = setTimeout(step, 4); } };
  warmTimer = setTimeout(step, 300);
}

const shell = createShell({
  ...INSTRUMENT,
  noteData,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => { analyser = a.analyser; prewarm(); },
  onNoteOn: (key, vel) => { focus = key; strikeAt = performance.now() / 1000; strikeVel = vel; shell.keys.focus?.(key); update(); },
  onParam: (id, v, P, p, dragging) => { if (!dragging || !['coil', 'wire', 'helix'].includes(id)) update(); else updateSoon(); prewarm(); },
  onMessage: (m) => { if (m.type === 'echo') { echo = m; echoImage = null; } },
});

// ---- the focus key's spring --------------------------------------------------------------------------------
let FX = null;
const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(0)} Hz`);
const fmtT = (t) => (t >= 0.1 ? `${(t * 1000).toFixed(0)} ms` : `${(t * 1000).toFixed(t >= 0.01 ? 1 : 2)} ms`);
let soon = 0;
function updateSoon() { clearTimeout(soon); soon = setTimeout(update, 60); }
function update() {
  // the first spring as played: tuned, then scaled so its virtual pitch is on the note
  const P = shell.P, data = springsFor(focus, P), sp = scaleSpring(model.tuneSpring(focus, P), data.rho);
  const fTop = sp.fMax < 10000 ? sp.fMax : Math.min(0.45 * rate(), 20000, 2.2 * sp.Fc);
  const curve = model.dispersionCurve(sp, { fTop, n: 420 });
  // the first spring's modes, for the dots and the slowed-down spring
  const s0 = data.springs[0], N = s0.f.length, A = new Float64Array(N), SIG = new Float64Array(N), K = new Float64Array(N);
  const tau = model.pulseLength(P, P.velocity), fb = s0.f0 / (Math.PI * Math.max(1e-4, P.bead / 100));
  for (let i = 0; i < N; i++) {
    const x = s0.f[i] / fb;
    A[i] = Math.abs(s0.rel[i]) * model.pulseSpectrum(s0.f[i], tau) / (1 + x * x);
    SIG[i] = model.modeSigma(s0.f[i], s0.cg[i], s0.L, P) + 60 * P.hand * P.hand;
    K[i] = (s0.n[i] * Math.PI) / s0.L;
  }
  FX = { sp, data, curve, fTop, s0, A, SIG, K, cos: null };
  const name = noteName(focus);
  $('#disp-key').textContent = name;
  $('#disp-read').textContent = `${sp.slinky ? 'Slinky · ' : ''}⌀ ${(2000 * sp.R).toFixed(sp.R < 5e-3 ? 2 : 1)} mm coil, ${(2000 * sp.r).toFixed(sp.r < 1e-4 ? 3 : 2)} mm wire · ${sp.turns.toFixed(1)} turns · ${s0.L < 1 ? `${(100 * s0.L).toFixed(1)} cm` : `${s0.L.toFixed(2)} m`}`;
  $('#spring-read').textContent = `${name} · ${N} modes · ${fmtT(sp.TD)} shown as 2 s`;
  $('#disp-key').title = `virtual pitch on the note; lowest mode ${cents(data.rho, 1) >= 0 ? '+' : ''}${cents(data.rho, 1).toFixed(1)} ¢`;
}

// ---- echoes: a short-window spectrogram of the engine's capture, against the model ------------------------
const ecv = $('#echo');
let echoImage = null;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function heat(t) { // 0..1 → dark → steel blue → accent → white
  const a = [12, 12, 18], b = [52, 58, 110], c = [192, 192, 216], d = [255, 236, 200];
  const seg = t < 0.45 ? [a, b, t / 0.45] : t < 0.85 ? [b, c, (t - 0.45) / 0.4] : [c, d, (t - 0.85) / 0.15];
  return seg[0].map((v, i) => Math.round(v + (seg[1][i] - v) * seg[2]));
}
function buildEcho(m, fTop) {
  const x = m.data.subarray(0, m.n), fs = m.fs, sp = scaleSpring(model.tuneSpring(m.key, shell.P), springsFor(m.key).rho);
  let w = 32;
  while (w < Math.min(2048, (sp.TD * fs) / 3)) w <<= 1;
  const hop = Math.max(1, w >> 3), nfft = Math.max(256, w), frames = Math.max(1, Math.floor((x.length - w) / hop));
  const bins = Math.min(nfft / 2, Math.ceil((fTop / fs) * nfft));
  const re = new Float64Array(nfft), im = new Float64Array(nfft), S = new Float32Array(frames * bins);
  let mx = 1e-30;
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < w; i++) re[i] = x[f * hop + i] * (0.5 - 0.5 * Math.cos((TAU * i) / (w - 1)));
    fft(re, im);
    for (let b = 0; b < bins; b++) { const v = re[b] * re[b] + im[b] * im[b]; S[f * bins + b] = v; if (v > mx) mx = v; }
  }
  const cv = document.createElement('canvas'); cv.width = frames; cv.height = bins;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(frames, bins);
  for (let f = 0; f < frames; f++) for (let b = 0; b < bins; b++) {
    const db = 10 * Math.log10(S[f * bins + b] / mx + 1e-30), t = Math.max(0, Math.min(1, (db + 55) / 55)), [r, g, bb] = heat(t), q = ((bins - 1 - b) * frames + f) * 4;
    img.data[q] = r; img.data[q + 1] = g; img.data[q + 2] = bb; img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { cv, key: m.key, dur: x.length / fs, fTopImg: (bins * fs) / nfft, t0: (w / 2) / fs, hopT: hop / fs };
}
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(ecv);
  ctx.clearRect(0, 0, w, h);
  const padL = 34, padB = 16, padT = 4, W = Math.max(10, w - padL - 6), H = Math.max(10, h - padB - padT);
  const fresh = echo && echo.key === focus;
  ctx.fillStyle = '#0c0c12'; ctx.fillRect(padL, padT, W, H);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  if (!fresh) { ctx.textAlign = 'center'; ctx.fillText(`strike ${noteName(focus)} to hear its echoes`, padL + W / 2, padT + H / 2); return; }
  const sp = FX.sp, fTop = FX.fTop;
  if (!echoImage || echoImage.key !== echo.key || echoImage.fTop !== fTop) { echoImage = buildEcho(echo, fTop); echoImage.fTop = fTop; }
  const E = echoImage, dur = E.dur;
  const X = (t) => padL + (W * t) / dur, Y = (f) => padT + H * (1 - f / fTop);
  ctx.imageSmoothingEnabled = true;
  // the image's frame f is centred at t0 + f·hop
  ctx.drawImage(E.cv, 0, 0, E.cv.width, E.cv.height, X(E.t0), Y(E.fTopImg), (W * E.cv.width * E.hopT) / dur, H * (E.fTopImg / fTop));
  // the model: arrivals after 1, 3, 5 … lengths, each frequency at its own group delay (plus half the mallet's pulse)
  const L = FX.s0.L, half = model.pulseLength(shell.P, echo.vel ?? strikeVel) / 2, col = [css('--accent-2'), css('--axial')];
  for (let j = 0; j < 2; j++) {
    ctx.fillStyle = col[j];
    for (const p of FX.curve[j]) {
      const rel = p.share * FX.sp.solver.rc.A;
      if (rel < 0.03 || p.f > fTop || Math.abs(p.cg) < 1e-6) continue;
      ctx.globalAlpha = Math.min(0.85, 0.9 * rel);
      for (let a = 0; a < 40; a++) { const t = ((2 * a + 1) * L) / Math.abs(p.cg) + half; if (t > dur) break; ctx.fillRect(X(t) - 0.6, Y(p.f) - 0.6, 1.2, 1.2); }
    }
  }
  ctx.globalAlpha = 1;
  if (sp.Fc < fTop) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(sp.Fc)); ctx.lineTo(padL + W, Y(sp.Fc)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = css('--text'); ctx.textAlign = 'right'; ctx.fillText('F_C', padL + W - 3, Y(sp.Fc) - 3); }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  const fStep = fTop > 8000 ? 4000 : fTop > 3000 ? 1000 : fTop > 1200 ? 500 : 200;
  for (let f = 0; f <= fTop; f += fStep) ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, padL - 4, Y(f) + 3);
  ctx.textAlign = 'center';
  const tStep = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2].find((s) => dur / s <= 8) || 0.5;
  for (let t = 0; t <= dur + 1e-9; t += tStep) ctx.fillText(`${Math.round(t * 1000)} ms`, X(t), h - 4);
  $('#echo-key').textContent = noteName(echo.key);
  $('#echo-read').textContent = `T_D ${fmtT(sp.TD)} · F_C ${fmtF(sp.Fc)}`;
}, ecv);

// ---- dispersion and group delay ----------------------------------------------------------------------------------
const dcv = $('#disp');
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(dcv);
  ctx.clearRect(0, 0, w, h);
  const { sp, curve, fTop, s0 } = FX, A = sp.solver.rc.A, R = sp.R, L = s0.L;
  const gap = 34, padL = 36, padB = 18, padT = 6, half = Math.max(40, (w - padL * 2 - gap) / 2), H = Math.max(10, h - padB - padT);
  const kTop = Math.max(...curve[0].map((p) => p.k)) * R;
  const XL = (kR) => padL + (half * kR) / kTop, YF = (f) => padT + H * (1 - f / fTop);
  const x2 = padL + half + gap + padL * 0.4, half2 = w - x2 - 6, XR = (f) => x2 + (half2 * f) / fTop;
  const tMax = sp.slinky ? 2.5 * (2 * L) / Math.max(...curve[0].filter((p) => p.f > 200).map((p) => Math.abs(p.cg)), 1) : 4 * sp.TD;
  const YT = (t) => padT + H * (1 - t / tMax);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, half, H); ctx.strokeRect(x2, padT, half2, H);
  const col = [css('--axial'), css('--accent')];
  // the two sheets, drawn point by point, bright where the beads drive them
  for (let j = 0; j < 2; j++) for (const [panel, xf, yf] of [[0, (p) => XL(p.k * R), (p) => YF(p.f)], [1, (p) => XR(p.f), (p) => YT((2 * L) / Math.abs(p.cg))]]) {
    let prev = null;
    ctx.strokeStyle = col[j]; ctx.lineWidth = 1.8;
    for (const p of curve[j]) {
      const rel = Math.min(1, p.share * A), ok = p.f <= fTop && (panel === 0 || Math.abs(p.cg) > (2 * L) / (tMax * 1.5));
      if (ok && prev) { ctx.globalAlpha = 0.12 + 0.88 * Math.sqrt(rel); ctx.beginPath(); ctx.moveTo(xf(prev), yf(prev)); ctx.lineTo(xf(p), yf(p)); ctx.stroke(); }
      prev = ok ? p : null;
    }
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // the first spring's modes on the dispersion curve
  ctx.fillStyle = css('--text');
  for (let i = 0; i < s0.f.length; i++) {
    if (s0.f[i] > fTop) continue;
    const kR = ((s0.n[i] * Math.PI) / L) * R, r = 1 + 2.2 * Math.min(1, Math.sqrt(Math.abs(s0.rel[i])));
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(XL(kR), YF(s0.f[i]), r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // F_C, T_D, the rigid-body point
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  if (sp.Fc < fTop) {
    ctx.beginPath(); ctx.moveTo(padL, YF(sp.Fc)); ctx.lineTo(padL + half, YF(sp.Fc)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(XR(sp.Fc), padT); ctx.lineTo(XR(sp.Fc), padT + H); ctx.stroke();
  }
  if (sp.TD < tMax) { ctx.beginPath(); ctx.moveTo(x2, YT(sp.TD)); ctx.lineTo(x2 + half2, YT(sp.TD)); ctx.stroke(); }
  const k0 = Math.cos(sp.alpha);
  ctx.beginPath(); ctx.moveTo(XL(k0), padT); ctx.lineTo(XL(k0), padT + H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = css('--text'); ctx.textAlign = 'left';
  if (sp.Fc < fTop) { ctx.fillText('F_C', padL + 3, YF(sp.Fc) - 4); ctx.fillText('F_C', XR(sp.Fc) + 3, padT + 10); }
  if (sp.TD < tMax) { ctx.textAlign = 'right'; ctx.fillText('T_D', x2 + half2 - 3, YT(sp.TD) - 4); ctx.textAlign = 'left'; }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  ctx.fillText('kR (wavenumber × coil radius)', padL + half / 2, h - 4);
  ctx.fillText('frequency', x2 + half2 / 2, h - 4);
  ctx.fillText('1/R', XL(k0), padT + 10);
  ctx.textAlign = 'right';
  const fStep = fTop > 8000 ? 4000 : fTop > 3000 ? 1000 : fTop > 1200 ? 500 : 200;
  for (let f = fStep; f < fTop; f += fStep) ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, padL - 3, YF(f) + 3);
  for (const fr of [1, 2, 3]) ctx.fillText(`${(fr * tMax * 250).toFixed(tMax < 0.02 ? 1 : 0)}`, x2 - 3, YT((fr * tMax) / 4) + 3);
  ctx.save(); ctx.translate(x2 - 24, padT + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('round trip, ms', 0, 0); ctx.restore();
}, dcv);

// ---- the spring, slowed down -----------------------------------------------------------------------------------------
const scv2 = $('#spring');
const NS = 240;
let vBuf = new Float64Array(NS), uBuf = new Float64Array(NS), uMax = 0, vMax = 0, uFor = null;
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(scv2);
  ctx.clearRect(0, 0, w, h);
  const { sp, s0, A, SIG, K } = FX, N = s0.f.length, L = s0.L;
  if (!FX.cos) { // cos(k_n s) at the drawing points
    FX.cos = new Float64Array(N * NS);
    for (let n = 0; n < N; n++) for (let i = 0; i < NS; i++) FX.cos[n * NS + i] = Math.cos((K[n] * L * i) / (NS - 1));
    uFor = null;
  }
  const slow = 2 / sp.TD, now = performance.now() / 1000, struck = strikeAt >= 0;
  const t = struck ? (now - strikeAt) / slow : 0;
  // the twist (displacement ∝ Σ sin ωt / ω) and its speed (Σ cos ωt) along the wire
  vBuf.fill(0); uBuf.fill(0);
  if (struck) for (let n = 0; n < N; n++) {
    const wn = TAU * s0.f[n], e = A[n] * Math.exp(-SIG[n] * t);
    if (e < 1e-6 * A[0]) continue;
    const cv = e * Math.cos(wn * t), cu = (e * Math.sin(wn * t)) / wn, c = FX.cos, o = n * NS;
    for (let i = 0; i < NS; i++) { vBuf[i] += cv * c[o + i]; uBuf[i] += cu * c[o + i]; }
  }
  if (uFor !== FX) { // scale: the twist and speed of a fresh strike's first pass
    let um = 0, vm = 0;
    for (let n = 0; n < N; n++) { um += A[n] / (TAU * s0.f[n]); vm += A[n]; }
    uMax = um * 0.35; vMax = vm * 0.35; uFor = FX;
  }
  const top = 10, stripH = Math.max(26, Math.min(56, h * 0.26)), coilH = h - stripH - top - 16;
  const x0 = 26, x1 = w - 26, yc = top + coilH / 2, Rpx = Math.min(coilH * 0.4, (x1 - x0) / 6);
  const turns = sp.turns, segs = Math.max(120, Math.round(turns * 28)), pitchPx = (x1 - x0) / Math.max(1, turns);
  // beads
  for (const [bx, i] of [[x0 - 12, 0], [x1 + 12, NS - 1]]) {
    const tw = Math.max(-1.2, Math.min(1.2, uBuf[i] / (uMax || 1)));
    ctx.fillStyle = '#5c5f70'; ctx.beginPath(); ctx.arc(bx, yc, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, yc); ctx.lineTo(bx + 8 * Math.sin(tw), yc - 8 * Math.cos(tw)); ctx.stroke();
  }
  ctx.lineWidth = 1;
  // the coil: back half first, then front half
  for (const front of [false, true]) {
    for (let q = 0; q < segs; q++) {
      const pts = [q / segs, (q + 1) / segs].map((u) => {
        const i = Math.min(NS - 1, Math.round(u * (NS - 1))), tw = Math.max(-1.2, Math.min(1.2, (0.9 * uBuf[i]) / (uMax || 1)));
        const ph = TAU * turns * u + tw;
        // seen a little from the side, so every turn is a loop
        return { x: x0 + (x1 - x0) * u + 0.45 * pitchPx * Math.sin(ph), y: yc + Rpx * Math.cos(ph), d: Math.sin(ph), v: Math.abs(vBuf[i]) / (vMax || 1) };
      });
      const isFront = pts[0].d + pts[1].d > 0;
      if (isFront !== front) continue;
      const v = Math.min(1, 0.5 * (pts[0].v + pts[1].v)), [r, g, b] = heat(0.35 + 0.65 * v);
      ctx.strokeStyle = `rgba(${r},${g},${b},${front ? 1 : 0.35})`; ctx.lineWidth = front ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
    }
  }
  // the twisting speed along the wire
  const sy = h - stripH - 4;
  ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1; ctx.strokeRect(x0, sy, x1 - x0, stripH);
  ctx.beginPath(); ctx.moveTo(x0, sy + stripH / 2); ctx.lineTo(x1, sy + stripH / 2); ctx.stroke();
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < NS; i++) { const X = x0 + ((x1 - x0) * i) / (NS - 1), Y = sy + stripH / 2 - (stripH / 2) * Math.max(-1, Math.min(1, (0.5 * vBuf[i]) / (vMax || 1))); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(struck ? `t = ${fmtT(t)} after the strike (${(t / sp.TD).toFixed(2)} round trips)` : 'strike a key', x0, h - 3);
  ctx.textAlign = 'right'; ctx.fillText('struck bead ← → pickup bead', x1, h - 3);
}, scv2);

// ---- spectrogram ------------------------------------------------------------------------------------------------------
const pcv = $('#spectro');
let spec = null, fbuf = null;
const SF = [40, 16000];
animate(() => {
  const { ctx, w, h } = fit(pcv);
  const padL = 34, padB = 16, W = Math.max(2, Math.round(w - padL)), H = Math.max(2, Math.round(h - padB));
  if (!spec || spec.width !== W || spec.height !== H) { spec = document.createElement('canvas'); spec.width = W; spec.height = H; const c = spec.getContext('2d'); c.fillStyle = '#0c0c12'; c.fillRect(0, 0, W, H); }
  const sc = spec.getContext('2d');
  sc.drawImage(spec, -2, 0);
  if (analyser) {
    if (!fbuf || fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fbuf);
    const fs = analyser.context.sampleRate, N = fbuf.length, col = sc.createImageData(2, H);
    for (let y = 0; y < H; y++) {
      const f = SF[0] * (SF[1] / SF[0]) ** (1 - y / (H - 1)), bin = Math.min(N - 1, Math.round((f * 2 * N) / fs));
      const t = Math.max(0, Math.min(1, (fbuf[bin] + 115) / 90)), [r, g, b] = heat(t);
      for (let x = 0; x < 2; x++) { const q = (y * 2 + x) * 4; col.data[q] = r; col.data[q + 1] = g; col.data[q + 2] = b; col.data[q + 3] = 255; }
    }
    sc.putImageData(col, W - 2, 0);
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(spec, padL, 0);
  const Yf = (f) => (1 - Math.log(f / SF[0]) / Math.log(SF[1] / SF[0])) * (H - 1);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, padL - 4, Yf(f) + 3);
  if (FX) { // ticks: the focus key's note and its F_C
    ctx.fillStyle = css('--accent-2');
    for (const f of [FX.sp.f0, FX.sp.Fc]) if (f > SF[0] && f < SF[1]) ctx.fillRect(padL - 3, Yf(f) - 1, 6, 2);
  }
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'center'; ctx.fillText('time →', padL + W / 2, h - 3);
}, pcv);

update();
prewarm();
