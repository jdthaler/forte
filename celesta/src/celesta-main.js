// celesta-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { INSTRUMENT } from './celesta-instrument.js';
import { wasmModel } from './celesta-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const DAMPER_X = 0.07, DAMPER_W = 0.08; // the felt damper: its centre (× L) from the bar's end, and its length (celesta-model.h)
const EB = model.BETA_L.map((b) => (b / model.BETA_L[0]) ** 2); // Euler–Bernoulli's ratios, for comparison
const spectrum = new SpectrumView($('#spectrum'), { fLo: 100, fHi: 20000 });
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 72, live = null, history = [];

const shell = createShell({
  ...INSTRUMENT,
  base: 60, // Z = C4: the celesta starts there
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { if (key !== focus) history = []; focus = key; shell.keys.focus(key); update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type !== 'cel') return;
    live = { ...m, amp: Float64Array.from(m.amp), t: performance.now() / 1000 };
    if (m.key === focus) {
      history.push({ t: live.t, Eb: m.Eb, Et: m.Et });
      while (history.length && history[0].t < live.t - 3) history.shift();
    }
  },
});

// ---- the focus key: its bar, box and mode table ---------------------------------------------------
let B = null, BS = null;
const fmtHz = (f) => (f < 1000 ? f.toFixed(1) : f.toFixed(0));
function update() {
  const P = shell.P;
  B = model.bar(focus, P.thick);
  BS = model.boxState(focus, P);
  const name = noteName(focus), f1 = B.modes[0].f;
  $('#focus-name').textContent = name; $('#bar-key').textContent = name;
  $('#focus-size').textContent = `${(1000 * B.L).toFixed(0)} × ${(1000 * B.b).toFixed(0)} × ${(1000 * B.h).toFixed(2)} mm · ${(1000 * B.mass).toFixed(0)} g`;
  // each mode's share at the strike point, relative to the strongest
  const yb = P.across * (B.b / 2), at = (m) => { const u = P.strike * (B.NX - 1), j = Math.min(B.NX - 2, Math.floor(u)), fr = u - j; return m.w[j] * (1 - fr) + m.w[j + 1] * fr; };
  const ex = B.modes.map((m) => Math.abs(at(m) * (m.kind === 'tors' ? yb : 1)));
  const exMax = Math.max(...ex, 1e-12);
  const rows = B.modes.map((m, i) => {
    const T60 = 6.91 / (m.sigTE + m.sigSup + m.sigRad + Math.PI * m.f * P.eta), db = 20 * Math.log10(ex[i] / exMax);
    const label = m.kind === 'bend' ? `bending ${m.n}` : `torsion ${m.n}`;
    const thin = m.kind === 'bend' ? EB[m.n - 1].toFixed(3) : '';
    return `<tr class="${m.kind}"><td>${label}</td><td>${fmtHz(m.f)}</td><td>${m.ratio.toFixed(3)}</td><td>${thin}</td><td>${T60 < 10 ? T60.toFixed(2) : T60.toFixed(1)}</td><td>${db > -60 ? db.toFixed(0) : '—'}</td></tr>`;
  });
  const kappa = -BS.M12 / Math.sqrt(BS.M11 * BS.M22), ft = Math.sqrt(BS.Ka / BS.M22) / TAU, H = model.hammer(focus, P);
  const pair = model.twoOscillator(f1 / Math.sqrt(BS.M11), ft, kappa);
  $('#modes').innerHTML = '<tr><th>mode</th><th>f (Hz)</th><th>× f₁</th><th>thin bar</th><th>T₆₀ alone (s)</th><th>at strike (dB)</th></tr>' + rows.join('')
    + `<tr><td colspan="6" class="note">A plain steel bar: shear and rotary inertia (Timoshenko) put its overtones a little below a thin bar’s. Blocks at ${B.nodes.map((x) => `${(100 * x / B.L).toFixed(1)} %`).join(' and ')}. T₆₀ alone: the bar without its box (internal friction, the blocks, heat flow, radiation).<br>`
    + `Box: mouth ${(1000 * B.box.w).toFixed(0)} × ${(1000 * B.box.l).toFixed(0)} mm, ${(1000 * BS.depth).toFixed(0)} mm deep; coupling κ = ${kappa.toFixed(4)}; with its bar it rings at ${fmtHz(pair[0])} and ${fmtHz(pair[1])} Hz. `
    + `Hammer ${(1000 * H.m).toFixed(1)} g, ${(H.K * 1e-3 ** H.p).toFixed(0)} N at 1 mm.</td></tr>`;
  spectrum.set(f1, B.modes.map((m) => ({ f: m.f, color: m.kind === 'tors' ? css('--accent-2') : '#e6c15a', alpha: 0.85 })).concat(P.boxes ? [{ f: ft, color: css('--accent'), alpha: 0.6 }] : []));
}

// ---- the bar on its box, and its modes ----------------------------------------------------------
const MODE_COL = ['#e6c15a', '#ef8a5a', '#d860a0'];
const bcv = $('#bar');
animate(() => {
  if (!B) return;
  const { ctx, w, h } = fit(bcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, x0 = 18, x1 = w - 18, sx = (x1 - x0) / B.L, X = (x) => x0 + x * sx;
  const fresh = live && live.key === focus;
  // the bar, to scale along its length, thickness ×4; the box below, its depth to the same scale (cut off at the bottom)
  const ex = Math.min(4 * sx, 0.04 * h), top = 18, yb = top + ex * B.h;
  const steel = ctx.createLinearGradient(0, top, 0, yb);
  steel.addColorStop(0, '#e4e8ee'); steel.addColorStop(1, '#8b939c');
  ctx.fillStyle = steel; ctx.fillRect(X(0), top, B.L * sx, Math.max(2, yb - top));
  const gapPx = Math.max(3, Math.min(30, (P.gap / 1000) * sx)), mouthY = yb + gapPx + 4;
  const rowTop = Math.min(h * 0.62, mouthY + Math.max(26, Math.min(80, BS.depth * sx)));
  // the blocks at mode 1's nodes, the box's mouth between them
  ctx.fillStyle = '#7a5a3a';
  for (const xn of B.nodes) ctx.fillRect(X(xn) - 4, yb, 8, gapPx + 4);
  if (P.boxes) {
    ctx.strokeStyle = '#a07a50'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(B.nodes[0]), mouthY); ctx.lineTo(X(B.nodes[0]), rowTop - 6); ctx.lineTo(X(B.nodes[1]), rowTop - 6); ctx.lineTo(X(B.nodes[1]), mouthY); ctx.stroke();
    ctx.lineWidth = 1;
    // the air in the box, by its share of the energy
    const share = fresh && live.Eb + live.Et > 0 ? live.Et / (live.Eb + live.Et) : 0;
    ctx.fillStyle = `rgba(95,208,200,${(0.08 + 0.8 * Math.sqrt(share)).toFixed(3)})`;
    ctx.fillRect(X(B.nodes[0]) + 1, mouthY, (B.nodes[1] - B.nodes[0]) * sx - 2, rowTop - 7 - mouthY);
  }
  // hammer and damper
  const xs = X(P.strike * B.L);
  const hamUp = fresh && live.hammerOn ? 2 : 12;
  ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.moveTo(xs, top - hamUp + 10); ctx.lineTo(xs - 6, top - hamUp); ctx.lineTo(xs + 6, top - hamUp); ctx.closePath(); ctx.fill();
  const damped = fresh ? live.damp > 0.5 : !(shell.sustain || P.pedalLock);
  ctx.fillStyle = damped ? '#8a6d5a' : 'rgba(138,109,90,0.35)';
  ctx.fillRect(X((DAMPER_X - DAMPER_W / 2) * B.L), top - (damped ? 5 : 11), Math.max(6, DAMPER_W * B.L * sx), 4);
  // bending modes 1–3, moving with their live amplitudes (slowed: mode n at 0.5·(f_n/f₁)^½ Hz)
  const now = performance.now() / 1000, rowH = (h - rowTop - 4) / 3;
  const bends = B.modes.filter((m) => m.kind === 'bend').slice(0, 3);
  const amps = bends.map((m, i) => (fresh ? live.amp[i] * m.ratio * m.ratio : 0)); // weighted by ω²: what you hear
  const amax = Math.max(...amps, 1e-12);
  ctx.font = '10px system-ui, sans-serif';
  bends.forEach((m, i) => {
    const yc = rowTop + (i + 0.5) * rowH, A = rowH * 0.38, rel = fresh ? amps[i] / amax : 0;
    ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    let wm = 1e-12; for (const v of m.w) wm = Math.max(wm, Math.abs(v));
    const ph = Math.cos(TAU * 0.5 * Math.sqrt(m.ratio) * now + i), sc = (fresh ? 0.15 + 0.85 * Math.sqrt(rel) : 1) * ph;
    ctx.strokeStyle = MODE_COL[i]; ctx.lineWidth = 2; ctx.globalAlpha = fresh ? 0.35 + 0.65 * Math.sqrt(rel) : 0.8;
    ctx.beginPath();
    for (let k = 0; k < B.NX; k++) { const Xp = X((k / (B.NX - 1)) * B.L), Yp = yc - (A * sc * m.w[k]) / wm; if (k) ctx.lineTo(Xp, Yp); else ctx.moveTo(Xp, Yp); }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    const dbs = fresh && amps[i] > 0 ? ` · ${(20 * Math.log10(amps[i] / amax)).toFixed(0)} dB` : '';
    const label = `mode ${i + 1}: ${fmtHz(m.f)} Hz = ${m.ratio.toFixed(3)} × f₁${dbs}`, ly = yc - rowH / 2 + 10;
    ctx.fillStyle = css('--card') || '#1a1a1e'; ctx.globalAlpha = 0.75; ctx.fillRect(x0 + 18, ly - 9, ctx.measureText(label).width + 6, 12); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--muted'); ctx.fillText(label, x0 + 21, ly);
  });
  $('#bar-read').textContent = fresh && live.contactMs ? `hammer contact ${live.contactMs.toFixed(2)} ms, peak force ${live.Fmax.toFixed(1)} N` : `${(1000 * B.L).toFixed(0)} mm long, ratios ${bends[1]?.ratio.toFixed(2) ?? '—'} : ${bends[2]?.ratio.toFixed(2) ?? '—'}`;
}, bcv);

// ---- energy in bar and box --------------------------------------------------------------------------
const ecv = $('#energy');
animate(() => {
  const { ctx, w, h } = fit(ecv);
  ctx.clearRect(0, 0, w, h);
  const px = 8, py = 8, pw = w - 16, ph = h - 16;
  ctx.strokeStyle = css('--grid'); ctx.strokeRect(px, py, pw, ph);
  for (let d = 1; d < 6; d++) { const y = py + (d / 6) * ph; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); }
  if (history.length > 1) {
    const t1 = history[history.length - 1].t, Emax = Math.max(...history.map((p) => Math.max(p.Eb, p.Et)), 1e-30);
    const Y = (E) => py + Math.min(ph, (-10 * Math.log10(Math.max(E, 1e-40) / Emax) / 60) * ph);
    for (const [key, col] of [['Eb', '#e6c15a'], ['Et', css('--accent')]]) {
      if (key === 'Et' && !shell.P.boxes) continue;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      history.forEach((p, i) => { const Xp = px + pw * (1 - (t1 - p.t) / 3); if (i) ctx.lineTo(Xp, Y(p[key])); else ctx.moveTo(Xp, Y(p[key])); });
      ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  const fresh = live && live.key === focus;
  $('#energy-read').textContent = !shell.P.boxes ? 'boxes off' : fresh ? `κ ${live.kappa.toFixed(4)} · box at ${fmtHz(live.ft)} Hz` : 'strike a key';
}, ecv);

update();
