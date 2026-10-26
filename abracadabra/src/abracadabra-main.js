// abracadabra-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, SpectrogramView, fit, css, animate } from '../../shared/views.js';
import { tunedFreq } from '../../shared/tuning.js';
import { INSTRUMENT } from './abracadabra-instrument.js';
import { sci } from './abracadabra-params.js';
import { wasmModel } from './abracadabra-wasm.js';

// The views draw what the engine plays: its model, from the same C++, built as WebAssembly.
const model = await wasmModel();
const K = model.constants;

const $ = (s) => document.querySelector(s);
const spectrum = new SpectrumView($('#spectrum'));
new SpectrogramView($('#spectrogram'), { spectrum });
let focus = 60;
let frame = { at: 0, voices: [] }; // every charged key, from the engine's frames

// The search: the last key struck, mixed down to its axion, averaged in spectra of SEG samples
// (Hann, half overlapping), as the experiment averages its.
const SEG = 256;
const search = { key: -1, rate: 64, re: [], im: [], sum: null, n: 0, bins: [], held: 0 };
function resetSearch(key) { Object.assign(search, { key, re: [], im: [], sum: null, n: 0, held: 0 }); }

const now = () => performance.now() / 1000;
const faOf = (P, key) => K.SCALE * tunedFreq(P, key);
const fmtHz = (f) => (f >= 1e6 ? `${(f / 1e6).toFixed(3)} MHz` : f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f.toFixed(f < 10 ? 2 : 1)} Hz`);
const fmtMass = (m) => (m >= 1e-9 ? `${(m * 1e9).toFixed(2)} neV` : `${(m * 1e12).toFixed(0)} peV`);
const fmtT = (t) => (t >= 60 ? `${(t / 60).toFixed(1)} min` : t >= 1 ? `${t.toFixed(1)} s` : `${(t * 1000).toFixed(0)} ms`);

const shell = createShell({
  ...INSTRUMENT,
  arrows: { param: 'velocity', step: 0.05 },
  onAudio: (a) => spectrum.setAnalyser(a.analyser),
  onNoteOn: (key) => { focus = key; update(); },
  onParam: () => { update(); resetSearch(search.key); },
  onMessage: (m) => {
    if (m.type === 'frame') frame = { at: now(), voices: m.voices };
    else if (m.type === 'base') {
      if (m.key !== search.key) resetSearch(m.key);
      search.rate = m.rate;
      search.re.push(...m.re); search.im.push(...m.im);
      while (search.re.length >= SEG) { accumulate(); search.re.splice(0, SEG / 2); search.im.splice(0, SEG / 2); }
    }
  },
});

// The bins the search shows: from a little below the axion's rest frequency to well past its
// line, at the segment's resolution.
function binsFor(P, key) {
  const fa = faOf(P, key), mean = model.lineMean(fa, P.halo, K.V_LAB), spread = model.lineSpread(fa, P.halo, K.V_LAB);
  const df = search.rate / SEG, top = Math.min(search.rate / 2 - df, Math.max(8 * df, mean + 4 * spread, P.stream > 0 ? 1.6 * fa * P.streamSpeed ** 2 / (2 * K.C_KMS ** 2) : 0));
  const lo = -Math.max(3 * df, top / 4), bins = [];
  for (let d = Math.floor(lo / df) * df; d <= top; d += df) bins.push(d);
  return bins;
}
function accumulate() {
  const P = shell.P;
  if (!search.sum) { search.bins = binsFor(P, search.key); search.sum = new Float64Array(search.bins.length); }
  let w2 = 0;
  for (let i = 0; i < SEG; i++) w2 += (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SEG)) ** 2;
  search.bins.forEach((d, b) => {
    let re = 0, im = 0;
    for (let i = 0; i < SEG; i++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SEG), a = (-2 * Math.PI * d * i) / search.rate, c = Math.cos(a), s = Math.sin(a);
      re += h * (search.re[i] * c - search.im[i] * s); im += h * (search.re[i] * s + search.im[i] * c);
    }
    search.sum[b] += (re * re + im * im) / (search.rate * w2) / 2; // one-sided, as the real signal's
  });
  search.n++;
}

function update() {
  const P = shell.P, f = tunedFreq(P, focus), fa = K.SCALE * f;
  const offset = model.lineMean(fa, P.halo, K.V_LAB);
  spectrum.set(f + offset, [{ f: f + offset, alpha: 0.9 }]);
  $('#focus-name').textContent = noteName(focus);
  const flux = model.pickupFlux(P.coupling, K.RHO_DM, P.field, P.size / 100);
  $('#toroid-read').textContent = `axion ${fmtMass(model.axionMass(fa))}, ${fmtHz(fa)} · coherent for ${fmtT(model.coherenceTime(fa, P.halo, K.V_LAB))} · ${sci(flux / K.PHI0, 1)} Φ₀ in the pickup`;
}

const hue = (key) => `hsl(${(((key - 21) * 47) % 360 + 360) % 360} 70% 66%)`;

// The toroid, seen from above at an angle: its field circling inside it, and the axion's flux
// through the pickup loop in the hole, slowed to a swing a second.
let swing = 0, lastT = now();
animate(() => {
  const { ctx, w, h } = fit($('#toroid'));
  ctx.clearRect(0, 0, w, h);
  const t = now(), dt = Math.min(0.1, t - lastT); lastT = t;
  const P = shell.P, v = frame.voices.find((x) => x.key === focus) ?? frame.voices[frame.voices.length - 1];
  const charge = v ? v.charge : 0, amp = v ? v.field * v.charge : 0;
  swing += 2 * Math.PI * dt;
  const a = amp * Math.cos(swing);
  // ABRACADABRA-10 cm's proportions: 3 to 6 cm in radius, 12 cm tall, the loop 2 cm across the hole
  const sq = 0.42, tilt = Math.sqrt(1 - sq * sq), cx = w / 2;
  const R = Math.max(10, Math.min(w * 0.4, (h - 30) / (2 * sq + (2 * tilt * K.ABRA_H) / (2 * K.ABRA_R_OUT))));
  const Ri = (R * K.ABRA_R_IN) / K.ABRA_R_OUT, H = (R * tilt * K.ABRA_H) / K.ABRA_R_OUT;
  const top = 4 + R * sq + Math.max(0, (h - 22 - 2 * R * sq - H) / 2), bot = top + H, ym = (top + bot) / 2;
  const ell = (r, y, start = 0, end = 2 * Math.PI, ccw = false) => ctx.ellipse(cx, y, r, r * sq, 0, start, end, ccw);
  const copper = css('--accent-2'), axion = css('--accent');
  ctx.strokeStyle = copper; ctx.lineWidth = 1.2;
  // the hole's far wall and floor, seen through the front
  ctx.globalAlpha = 0.45; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ell(Ri, bot, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ell(R, bot, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - Ri, top); ctx.lineTo(cx - Ri, bot); ctx.moveTo(cx + Ri, top); ctx.lineTo(cx + Ri, bot); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // the pickup loop at mid-height, glowing with the flux through it
  const rl = (Ri * K.ABRA_LOOP) / K.ABRA_R_IN;
  ctx.strokeStyle = axion; ctx.lineWidth = 1.5 + 3 * Math.min(1, Math.abs(a)); ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, Math.abs(a));
  ctx.beginPath(); ell(rl, ym); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // the axion's field through the hole: an arrow up or down, as long as the flux
  const len = Math.max(-1, Math.min(1, a)) * H * 0.8;
  if (Math.abs(len) > 2) {
    ctx.strokeStyle = axion; ctx.fillStyle = axion; ctx.lineWidth = 2.5;
    const y0 = ym + len / 2, y1 = ym - len / 2, dir = Math.sign(len);
    ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, y1 - dir * 6); ctx.lineTo(cx - 5, y1 + dir * 2); ctx.lineTo(cx + 5, y1 + dir * 2); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
  }
  // the near walls, see-through: the outer one and the hole's
  ctx.strokeStyle = copper; ctx.fillStyle = 'rgba(224,154,90,0.16)';
  ctx.beginPath(); ctx.moveTo(cx - R, top); ctx.lineTo(cx - R, bot); ell(R, bot, Math.PI, 0, true); ctx.lineTo(cx + R, top); ell(R, top, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - R, top); ctx.lineTo(cx - R, bot); ell(R, bot, Math.PI, 0, true); ctx.lineTo(cx + R, top); ctx.stroke();
  ctx.beginPath(); ell(Ri, bot, 0, Math.PI); ctx.stroke();
  // the top face, an annulus, brighter as the magnet charges
  ctx.beginPath(); ell(R, top); ell(Ri, top, 2 * Math.PI, 0, true);
  ctx.fillStyle = `rgba(224,154,90,${0.14 + 0.3 * charge})`; ctx.fill();
  ctx.beginPath(); ell(R, top); ctx.stroke(); ctx.beginPath(); ell(Ri, top); ctx.stroke();
  // the magnet's field circling on the top face, and the effective current along it, which swings
  const N = 18, rm = (R + Ri) / 2;
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N + 0.15 * t, x = cx + rm * Math.cos(th), y = top + rm * sq * Math.sin(th);
    const tx = -Math.sin(th), ty = Math.cos(th) * sq, m = Math.hypot(tx, ty), ux = tx / m, uy = ty / m, L = Math.min(9, R / 10);
    ctx.globalAlpha = 0.25 + 0.75 * charge; ctx.strokeStyle = copper; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - ux * L, y - uy * L); ctx.lineTo(x + ux * L, y + uy * L); ctx.lineTo(x + ux * L - (ux * 4 - uy * 3), y + uy * L - (uy * 4 + ux * 3)); ctx.stroke();
    if (Math.abs(a) > 0.02) {
      const s = Math.sign(a), r = 1.5 + 3 * Math.min(1, Math.abs(a));
      ctx.globalAlpha = Math.min(1, Math.abs(a)); ctx.fillStyle = axion;
      ctx.beginPath(); ctx.arc(x + s * ux * L * 0.4, y + s * uy * L * 0.4, r, 0, 2 * Math.PI); ctx.fill();
    }
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  ctx.fillText(`${(P.size < 100 ? `${P.size.toFixed(0)} cm` : `${(P.size / 100).toFixed(1)} m`)} · ${(P.field * charge).toFixed(2)} T of ${P.field.toFixed(P.field < 1 ? 2 : 1)} T`, 6, h - 6);
  if (v) { ctx.textAlign = 'right'; ctx.fillText(`${(v.flux * v.field).toFixed(v.flux < 1 ? 3 : 1)} μΦ₀ at the SQUID · noise ${v.noise.toFixed(1)} μΦ₀`, w - 6, h - 6); ctx.textAlign = 'left'; }
}, $('#toroid'));

// The search: the averaged spectrum near the last key's axion, with the noise floor and the line
// the halo predicts.
animate(() => {
  const { ctx, w, h } = fit($('#search'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, key = search.key >= 0 ? search.key : focus, fa = faOf(P, key);
  const bins = search.sum ? search.bins : binsFor(P, key), df = search.rate / SEG;
  const sig = model.squidFlux(P.coupling, K.RHO_DM, P.field, P.size / 100) * (frame.voices.find((x) => x.key === key)?.charge ?? 1);
  const floor = P.noise ** 2;
  // what the halo predicts in each bin: the line's power in it, per Hz, over the floor
  const expect = bins.map((d) => {
    let s = 0;
    for (let j = 0; j < 8; j++) {
      const x = d - df / 2 + (df * (j + 0.5)) / 8;
      s += (1 - P.stream) * model.linePdf(x, fa, P.halo, K.V_LAB) + (P.stream > 0 ? P.stream * streamPdf(x, fa, P.streamSpeed) : 0);
    }
    return floor + sig * sig * s / 8;
  });
  const avg = search.sum ? Array.from(search.sum, (v) => v / search.n) : null;
  const all = [...expect, ...(avg ?? [])].filter((v) => v > 0);
  let lo = Math.log10(Math.max(1e-6, Math.min(...all, floor || 1e9) * 0.5)), hi = Math.log10(Math.max(...all) * 2);
  if (!(hi > lo)) { lo = -2; hi = 2; }
  const padL = 34, padB = 16, X = (d) => padL + ((d - bins[0] + df / 2) / (bins.length * df)) * (w - padL - 6);
  const Y = (v) => h - padB - ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo)) * (h - padB - 8);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.strokeStyle = css('--grid');
  for (let e = Math.ceil(lo); e <= hi; e++) { ctx.beginPath(); ctx.moveTo(padL, Y(10 ** e)); ctx.lineTo(w - 6, Y(10 ** e)); ctx.stroke(); ctx.fillText(e === 0 ? '1' : `10${String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])}`, 2, Y(10 ** e) + 3); }
  const step = [0.25, 0.5, 1, 2, 5, 10].find((s) => (bins.length * df) / s <= 8) ?? 10;
  for (let d = Math.ceil(bins[0] / step) * step; d <= bins[bins.length - 1]; d += step) { ctx.fillText(`${+d.toFixed(2)}`, X(d) - 6, h - 3); }
  ctx.fillText('Hz', w - 18, h - 3);
  if (avg) {
    ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.85;
    avg.forEach((v, b) => { const x = X(bins[b] - df / 2), y = Y(v); ctx.fillRect(x + 0.5, y, Math.max(1, X(df) - X(0) - 1), h - padB - y); });
    ctx.globalAlpha = 1;
  }
  if (floor > 0) { ctx.strokeStyle = css('--muted'); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(floor)); ctx.lineTo(w - 6, Y(floor)); ctx.stroke(); ctx.setLineDash([]); }
  ctx.strokeStyle = css('--accent-2'); ctx.lineWidth = 1.5; ctx.beginPath();
  expect.forEach((v, b) => { const x0 = X(bins[b] - df / 2), x1 = X(bins[b] + df / 2), y = Y(v); if (b) ctx.lineTo(x0, y); else ctx.moveTo(x0, y); ctx.lineTo(x1, y); });
  ctx.stroke(); ctx.lineWidth = 1;
  // the readout: how long it has averaged, and how far the axion's bins stand above the noise
  let read = `${noteName(key)}: hold a key to average`;
  if (avg && search.n > 0) {
    let excess = 0, m = 0;
    expect.forEach((v, b) => { if (v > floor * 1.05 || floor === 0) { excess += avg[b] - floor; m++; } });
    const T = (SEG / search.rate) * (search.n + 1) / 2;
    read = `${noteName(key)}: ${search.n} spectr${search.n === 1 ? 'um' : 'a'}, ${T.toFixed(0)} s`;
    if (floor > 0 && m > 0) read += ` · the axion's bins ${(excess / (floor * Math.sqrt(m / search.n))).toFixed(1)} σ above the noise`;
  }
  $('#search-read').textContent = read;
}, $('#search'));

// The stream's line: a narrow Maxwellian at speed vs, 20 km/s across (the C++ draws the waves;
// this is its shape, for the curve).
function streamPdf(d, fa, vs) {
  if (d <= 0) return 0;
  const v = K.C_KMS * Math.sqrt((2 * d) / fa), s = K.STREAM_SIGMA * Math.SQRT2;
  return (model.speedPdf(v, s, vs) * K.C_KMS ** 2) / (fa * v);
}

// Where it sits: coupling against mass, log–log.
animate(() => {
  const { ctx, w, h } = fit($('#plane'));
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, m0 = -11, m1 = -6, g0 = -20, g1 = -5, padL = 34, padB = 16;
  const X = (m) => padL + ((Math.log10(m) - m0) / (m1 - m0)) * (w - padL - 6), Y = (g) => h - padB - ((Math.log10(g) - g0) / (g1 - g0)) * (h - padB - 6);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted');
  for (let e = m0; e <= m1; e++) { ctx.beginPath(); ctx.moveTo(X(10 ** e), 6); ctx.lineTo(X(10 ** e), h - padB); ctx.stroke(); if (e > m0 && e < m1) ctx.fillText(`10${String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])}`, X(10 ** e) - 10, h - 3); }
  for (let e = g0; e <= g1; e += 5) { ctx.beginPath(); ctx.moveTo(padL, Y(10 ** e)); ctx.lineTo(w - 6, Y(10 ** e)); ctx.stroke(); ctx.fillText(`10${String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])}`, 2, Y(10 ** e) + 3); }
  ctx.textAlign = 'right'; ctx.fillText('mass, eV', w - 8, h - padB - 4); ctx.textAlign = 'left';
  ctx.fillText('g, GeV⁻¹', padL + 4, 16);
  // the keyboard's masses
  const kLo = model.axionMass(faOf(P, 21)), kHi = model.axionMass(faOf(P, 108));
  ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.08; ctx.fillRect(X(kLo), 6, X(kHi) - X(kLo), h - padB - 6); ctx.globalAlpha = 1;
  // CAST and the stars: everything above is ruled out
  ctx.fillStyle = css('--muted'); ctx.globalAlpha = 0.18; ctx.fillRect(padL, 6, w - padL - 6, Y(6.6e-11) - 6); ctx.globalAlpha = 1;
  ctx.fillStyle = css('--muted'); ctx.fillText('CAST, stars: ruled out', padL + 4, Y(6.6e-11) - 14);
  // ABRACADABRA-10 cm: the masses it searched, and its best limit
  ctx.strokeStyle = css('--accent-2'); ctx.fillStyle = css('--accent-2');
  const yA = Y(3.2e-11);
  ctx.beginPath(); ctx.moveTo(X(0.41e-9), yA + 8); ctx.lineTo(X(0.41e-9), yA + 12); ctx.lineTo(X(8.27e-9), yA + 12); ctx.lineTo(X(8.27e-9), yA + 8); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(2.99e-9), yA, 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillText('ABRACADABRA-10 cm', X(8.27e-9) + 4, yA + 12);
  // the QCD axion: g = (α / 2π f_a) |E/N − 1.92|, m = 5.70 μeV × 10¹² GeV / f_a (KSVZ: E/N = 0; DFSZ: 8/3)
  const qcd = (m, c) => ((7.2973525693e-3 / (2 * Math.PI)) * c * m) / (5.7e-6 * 1e12);
  ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.6;
  for (const c of [1.92, Math.abs(8 / 3 - 1.92)]) { ctx.beginPath(); ctx.moveTo(X(10 ** m0), Y(qcd(10 ** m0, c))); ctx.lineTo(X(10 ** m1), Y(qcd(10 ** m1, c))); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = css('--text'); ctx.fillText('QCD axion', X(1e-8), Y(qcd(1e-8, 1.92)) - 6);
  // this universe's coupling, and the keys sounding
  ctx.strokeStyle = css('--accent'); ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(kLo), Y(P.coupling)); ctx.lineTo(X(kHi), Y(P.coupling)); ctx.stroke(); ctx.setLineDash([]);
  for (const v of frame.voices) { ctx.fillStyle = hue(v.key); ctx.beginPath(); ctx.arc(X(model.axionMass(faOf(P, v.key))), Y(P.coupling), 3 + 3 * Math.min(1, v.field * v.charge), 0, 2 * Math.PI); ctx.fill(); }
}, $('#plane'));

update();
