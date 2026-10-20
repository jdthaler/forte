// universe-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './universe-instrument.js';
import { wasmModel } from './universe-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
const H = model.HARMONICS, NT = model.NT, FADE_FROM = 4 * Math.PI, FADE_TO = 6 * Math.PI;
let focus = 60, sent = null, state = null, stateAt = 0;
let uni = null, bg = null, curve = null, curveFor = '', curveTimer = 0;

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => { spectrum.setAnalyser(a.analyser); sent = null; },
  // the universe the engine plays, built here once for each cosmology, so the audio thread needn't
  noteData: (key, vel, P) => {
    const u = model.universe(P);
    if (sent === u.id) return undefined;
    sent = u.id;
    return u.offer;
  },
  onNoteOn: (key) => { focus = key; state = null; update(); },
  onParam: () => update(),
  onMessage: (m) => { if (m.type === 'state' && m.key === focus) { state = m; stateAt = performance.now(); } },
});

const j0 = (x) => (Math.abs(x) < 1e-4 ? 1 - (x * x) / 6 : Math.sin(x) / x);
const j1 = (x) => (Math.abs(x) < 1e-3 ? x / 3 : Math.sin(x) / (x * x) - Math.cos(x) / x);

function update() {
  const P = shell.P;
  uni = model.universe(P);
  bg = model.background(P);
  const f1 = tunedFreq(P, focus);
  const top = Math.min(20000, 0.45 * 48000);
  spectrum.set(f1, Array.from({ length: H }, (_, m) => ({ f: (m + 1) * f1, alpha: m % 2 ? 0.35 : 0.75 })).filter((x) => x.f < top));
  $('#focus-name').textContent = noteName(focus);
  const id = uni.id;
  if (curveFor !== id) { clearTimeout(curveTimer); curveTimer = setTimeout(() => buildCurve(P, id), 150); }
  table();
}

// The waves between the harmonics too, for the picture: KN wavelengths from long to short, each
// evolved as the engine's harmonics are (in the background update() set).
const KN = 96, HMAX = 12.5;
function buildCurve(P, id) {
  if (model.universe(P).id !== id) return;
  model.background(P);
  const ts = Array.from({ length: NT }, (_, j) => (bg.tauStar * j) / (NT - 1));
  const hs = Array.from({ length: KN }, (_, i) => 0.15 + ((HMAX - 0.15) * i) / (KN - 1));
  const rows = hs.map((h) => model.evolve(h * uni.k1, ts));
  curve = { hs, sky: rows.map((r) => Float32Array.from(r, (o) => o.sky)), doppler: rows.map((r) => Float32Array.from(r, (o) => o.doppler)), plasma: rows.map((r) => Float32Array.from(r, (o) => o.plasma)) };
  curveFor = id;
}

// Where the struck note is: u (conformal time over recombination's), and once the light is free, x1
function now() {
  const P = shell.P;
  if (!state) return { u: 1, x1: 0, streaming: false, idle: true };
  const dt = (performance.now() - stateAt) / 1000;
  if (!state.streaming) return { u: Math.min(1, state.u + dt / P.recombination), x1: 0, streaming: false };
  const rate = state.released ? Math.PI / P.release : (uni.k1 * uni.tauStar) / P.recombination;
  return { u: state.u, x1: state.x1 + dt * rate, streaming: true, from: state.u };
}
// a wave's temperature and Doppler part now, from its table rows (sky, doppler, plasma at NT times)
function valueOf(sky, dop, pl, h, t) {
  const plasma = shell.P.listener === 'plasma', withDop = !plasma && shell.P.doppler;
  const at = (row, u) => { const j = Math.min(1, u) * (NT - 1), i = Math.min(NT - 2, Math.floor(j)), w = j - i; return row[i] + w * (row[i + 1] - row[i]); };
  if (!t.streaming) return { e: at(plasma ? pl : sky, t.u), q: withDop ? at(dop, t.u) : 0 };
  const x = h * t.x1, fade = t.x1 <= FADE_FROM ? 1 : t.x1 >= FADE_TO ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (t.x1 - FADE_FROM)) / (FADE_TO - FADE_FROM));
  if (plasma) return { e: fade * (at(pl, t.from) * j0(x) - Math.sqrt(3) * at(dop, t.from) * j1(x)), q: 0 };
  return { e: fade * at(sky, t.from) * j0(x), q: withDop ? fade * at(dop, t.from) * j0(x) : 0 };
}

// the universe's age at conformal time τ (Mpc): ∫ a dτ, with a = Aτ² + Bτ
const MPC_YEARS = 3.0856775814913673e22 / 299792458 / 3.15576e7;
const ageAt = (tau) => (bg.A * tau ** 3 / 3 + bg.B * tau ** 2 / 2) * MPC_YEARS;
const fmtN = (v, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
function table() {
  const k1 = Math.PI / bg.rsStar;
  const rows = [
    ['Matter–radiation equality', `z = ${fmtN(bg.zEq)}`, 'z = 3402'],
    ['Recombination (the visibility\'s peak)', `z = ${fmtN(bg.zStar, 1)}`, 'z = 1089.92'],
    ['The universe\'s age then', `${fmtN(bg.ageStar / 1000)} thousand years`, ''],
    ['Sound horizon then, r_s*', `${bg.rsStar.toFixed(1)} Mpc`, '144.43 Mpc'],
    ['Baryon loading then, R*', bg.RStar.toFixed(3), ''],
    ['Damping wavenumber, k_D', `${bg.kdStar.toFixed(4)} Mpc⁻¹ (harmonic ${(bg.kdStar / k1).toFixed(1)})`, '0.1409 Mpc⁻¹'],
    ['First harmonic\'s wave, π / r_s*', `${k1.toFixed(4)} Mpc⁻¹, ${(2 * bg.rsStar).toFixed(0)} Mpc long`, ''],
  ];
  $('#cosmo').innerHTML = '<tr><th></th><th>this universe</th><th>Planck 2018</th></tr>'
    + rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('');
}

// The waves: every wavelength's temperature now, the harmonics as bars, and the history below.
animate(() => {
  const { ctx, w, h } = fit($('#waves'));
  ctx.clearRect(0, 0, w, h);
  if (!uni) return;
  const t = now(), padL = 8, padR = 8, padT = 10, histH = 26, padB = 16 + histH, W = Math.max(10, w - padL - padR), Hh = Math.max(10, h - padT - padB);
  const hmax = Math.max(4, Math.min(HMAX, Math.floor(W / 28))), X = (x) => padL + (W * x) / hmax, y0 = padT + Hh / 2;
  // the scale: the largest the harmonics reach at recombination
  let top = 0.5;
  for (let m = 0; m < H; m++) top = Math.max(top, Math.abs(uni.sky[m][NT - 1]), Math.abs(uni.plasma[m][NT - 1]));
  const Y = (v) => y0 - (0.46 * Hh * v) / top;
  ctx.strokeStyle = css('--grid');
  ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(w - padR, y0); ctx.stroke();
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let m = 1; m <= hmax; m++) ctx.fillText(String(m), X(m), padT + Hh + 11);
  ctx.textAlign = 'left';
  // the harmonics: bars, the odd ones (compressions at recombination) in the accent
  const bw = Math.max(3, Math.min(14, W / hmax / 3));
  for (let m = 1; m <= Math.min(hmax, H); m++) {
    const v = valueOf(uni.sky[m - 1], uni.doppler[m - 1], uni.plasma[m - 1], m, t);
    ctx.fillStyle = m % 2 ? css('--accent') : css('--accent-2');
    ctx.globalAlpha = 0.85;
    const a = Y(v.e);
    ctx.fillRect(X(m) - bw / 2, Math.min(a, y0), bw, Math.abs(a - y0));
    if (v.q) { ctx.globalAlpha = 0.35; const b = Y(v.q); ctx.fillRect(X(m) + bw / 2, Math.min(b, y0), bw / 2, Math.abs(b - y0)); }
    ctx.globalAlpha = 1;
  }
  // every wave between them
  if (curve && curveFor === uni.id) {
    for (const [part, dash] of [['e', []], ['q', [3, 3]]]) {
      if (part === 'q' && (shell.P.listener === 'plasma' || !shell.P.doppler)) continue;
      ctx.strokeStyle = css('--text'); ctx.globalAlpha = part === 'e' ? 0.75 : 0.45; ctx.setLineDash(dash);
      ctx.beginPath();
      curve.hs.forEach((hh, i) => {
        if (hh > hmax + 0.2) return;
        const v = valueOf(curve.sky[i], curve.doppler[i], curve.plasma[i], hh, t)[part];
        if (i) ctx.lineTo(X(hh), Y(v)); else ctx.moveTo(X(hh), Y(v));
      });
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // the history: from the beginning to recombination (and the light streaming away after)
  const hy = h - histH + 6, hx0 = padL, hx1 = w - padR - 40, HX = (u) => hx0 + (hx1 - hx0) * Math.min(1, u);
  ctx.strokeStyle = css('--grid'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx0, hy); ctx.lineTo(hx1, hy); ctx.stroke();
  ctx.strokeStyle = css('--accent'); ctx.beginPath(); ctx.moveTo(hx0, hy); ctx.lineTo(HX(t.streaming ? t.from : t.u), hy); ctx.stroke();
  ctx.lineWidth = 1;
  const ueq = bg.tauEq / bg.tauStar;
  ctx.fillStyle = css('--muted');
  if (ueq < 1) { ctx.fillRect(HX(ueq) - 0.5, hy - 5, 1, 10); ctx.fillText('equality', Math.min(HX(ueq) + 3, hx1 - 110), hy + 13); }
  ctx.fillRect(HX(1) - 0.5, hy - 6, 1, 12);
  ctx.textAlign = 'right'; ctx.fillText('recombination', HX(1), hy + 13); ctx.textAlign = 'left';
  const label = t.idle ? 'at recombination' : t.streaming ? 'the light streams away' : `${fmtN(ageAt(t.u * bg.tauStar))} years`;
  if (t.streaming) ctx.fillText('→ free', hx1 + 6, hy + 3);
  $('#epoch').textContent = label;
}, $('#waves'));

// The sky: a patch made of the note's waves, in every direction, coloured as the microwave
// background's maps are.
const SKY = 80, MAXH = 12;
let sky = null;
function skyWaves() {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const waves = [];
  const span = 3; // the patch: three sound horizons across, so harmonic m's wave (k = mπ / r_s*) turns 3πm across it
  for (let m = 1; m <= MAXH; m++) {
    const n = 2 + m;
    for (let d = 0; d < n; d++) {
      const th = 2 * Math.PI * rnd(), ph = 2 * Math.PI * rnd(), kx = Math.PI * m * Math.cos(th) * span, ky = Math.PI * m * Math.sin(th) * span;
      const c = new Float32Array(SKY * SKY), s = new Float32Array(SKY * SKY);
      for (let j = 0; j < SKY; j++) for (let i = 0; i < SKY; i++) { const a = (kx * i + ky * j) / SKY + ph; c[j * SKY + i] = Math.cos(a); s[j * SKY + i] = Math.sin(a); }
      waves.push({ m, c, s, w: 1 / Math.sqrt(n) });
    }
  }
  return waves;
}
const field = new Float32Array(SKY * SKY);
const offscreen = document.createElement('canvas');
offscreen.width = offscreen.height = SKY;
let skyTop = 1;
// Planck's colours: blue, through white, to orange and red
const CMB = [[0, 0, 0.55], [0.1, 0.45, 1], [0.85, 0.92, 1], [1, 0.85, 0.45], [1, 0.4, 0.05], [0.6, 0, 0]];
function cmb(v) {
  const x = Math.max(0, Math.min(0.9999, 0.5 + 0.5 * v)) * (CMB.length - 1), i = Math.floor(x), f = x - i;
  return CMB[i].map((a, k) => 255 * (a + f * (CMB[i + 1][k] - a)));
}
animate(() => {
  const { ctx, w, h } = fit($('#sky'));
  ctx.clearRect(0, 0, w, h);
  if (!uni) return;
  sky ??= skyWaves();
  const t = now(), tilt = 0.5 * (shell.P.tilt - 2);
  const amp = Array.from({ length: MAXH }, (_, m) => {
    const v = valueOf(uni.sky[m], uni.doppler[m], uni.plasma[m], m + 1, t);
    return { e: v.e * (m + 1) ** tilt, q: v.q * (m + 1) ** tilt };
  });
  field.fill(0);
  for (const wv of sky) {
    const { e, q } = amp[wv.m - 1], a = e * wv.w, b = q * wv.w;
    if (!a && !b) continue;
    const c = wv.c, s = wv.s;
    for (let i = 0; i < field.length; i++) field[i] += a * c[i] + b * s[i];
  }
  let mx = 0;
  for (let i = 0; i < field.length; i++) mx = Math.max(mx, Math.abs(field[i]));
  skyTop = Math.max(mx, skyTop * 0.98, 1e-6);
  const g = offscreen.getContext('2d'), img = g.createImageData(SKY, SKY);
  for (let i = 0; i < field.length; i++) { const [r, gg, b] = cmb(field[i] / skyTop); img.data[4 * i] = r; img.data[4 * i + 1] = gg; img.data[4 * i + 2] = b; img.data[4 * i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const side = Math.max(4, Math.min(w, h - 14));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offscreen, (w - side) / 2, 0, side, side);
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`${(3 * bg.rsStar).toFixed(0)} Mpc across, three sound horizons`, (w - side) / 2, side + 11);
}, $('#sky'));

update();
