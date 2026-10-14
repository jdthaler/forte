// bubbles-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { SpectrumView, fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './bubbles-params.js';
import {
  KEY_LO, KEY_HI, ROW, HYDRO, P_ATM, G, keyFreq, nozzleX, nozzleEnv, keyRadius, acoustics, riseDistance,
  ambient, liquidOf, gasOf, peakPressure, snapGain,
} from './bubbles-model.js';

const $ = (s) => document.querySelector(s);
const TAU = 2 * Math.PI;
const spectrum = new SpectrumView($('#spectrum'), { fLo: 100, fHi: 10000, dbTop: -10, dbRange: 100 });
const now = () => performance.now() / 1000;
const cents = (a, b) => 1200 * Math.log2(a / b);

// Colour by pitch: violet for the lowest key, through blue and green, to amber for the highest.
const hue = (f) => 270 - 235 * Math.min(1, Math.max(0, Math.log(f / keyFreq(KEY_LO)) / Math.log(keyFreq(KEY_HI) / keyFreq(KEY_LO))));
const pitchColour = (f, l = 66, a = 1) => `hsla(${hue(f).toFixed(0)}, 85%, ${l}%, ${a})`;

let focus = 72, fs = 48000, wave = null, rows = [], active = 0, shownCount = -1, shownFrame = -1;
const bubbles = [], pops = [], held = new Set();

const shell = createShell({
  id: 'bubbles',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  range: [KEY_LO, KEY_HI],
  base: 60,
  worklet: { modules: ['src/bubbles-engine.js'], engine: 'BubbleEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'hold',
  arrows: { param: 'velocity', step: 0.05 },
  modWheel: 'rate',
  onAudio: (a) => { spectrum.setAnalyser(a.analyser); fs = a.ctx.sampleRate; },
  onNoteOn: (key) => { focus = key; held.add(key); shell.keys.focus(key); update(); },
  onNoteOff: (key) => { held.delete(key); update(); },
  onPanic: () => { held.clear(); bubbles.length = 0; update(); },
  onParam: () => update(),
  onMessage: (m) => {
    if (m.type === 'bubbles') {
      const t = now();
      active = m.active;
      for (let i = 0; i < m.n; i++) {
        const e = m.ev.subarray(8 * i, 8 * i + 8);
        bubbles.push({ key: e[0], t0: t - (m.frame - e[1]) / fs, R: e[2], f: e[3], b: e[4], U: e[5], d0: e[6], vel: e[7] });
      }
      if (bubbles.length > 700) bubbles.splice(0, bubbles.length - 700);
    } else if (m.type === 'wave') wave = { ...m, buf: Float32Array.from(m.buf.subarray(0, m.count)) };
  },
});

// ---- what the keyboard sounds like now: each key's bubble, its ring and its damping -------------------
function update() {
  const P = shell.P, env = nozzleEnv(P);
  rows = [];
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const R = keyRadius(k, P, env), a = acoustics(R, env, {});
    rows.push({ key: k, R, ...a });
  }
  const r = rows[focus - KEY_LO] || rows[0], p0 = ambient(P);
  const shift = cents(r.fd, keyFreq(r.key));
  $('#tank-read').textContent = `p₀ ${(p0 / P_ATM).toFixed(2)} atm · ${noteName(r.key)} ${Math.abs(shift) < 0.5 ? 'in tune' : `${shift > 0 ? '+' : '−'}${Math.abs(shift) < 100 ? Math.abs(shift).toFixed(0) + ' ¢' : (Math.abs(shift) / 100).toFixed(1) + ' semitones'}`} · R ${(1000 * r.R).toFixed(2)} mm`;
  $('#tank-read').title = 'The liquid pressure at the nozzles, how far the last key played sounds from its note, and its bubble’s radius';
  $('#devin-read').textContent = `${gasOf(P).name} in ${liquidOf(P).name}, ${(p0 / P_ATM).toFixed(2)} atm`;
  const keys = held.size ? [...held] : [focus];
  spectrum.set(0, keys.map((k) => ({ f: rows[k - KEY_LO].fd, color: pitchColour(rows[k - KEY_LO].fd), alpha: 0.9 })));
}

// ---- the tank ---------------------------------------------------------------------------------------
const tcv = $('#tank');
const VIEW_H = 0.45; // m of water shown above the nozzles at most
animate(() => {
  const { ctx, w, h } = fit(tcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, t = now(), depth = P.depth, liq = liquidOf(P);
  const showH = Math.min(depth, VIEW_H), surfaceShown = depth <= VIEW_H;
  const marginX = 0.06, top = surfaceShown ? 22 : 14, bottom = 24;
  const s = Math.max(1, Math.min((w - 16) / (ROW + 2 * marginX), (h - top - bottom) / showH)); // px per metre
  const x0 = (w - s * (ROW + 2 * marginX)) / 2 + s * marginX, yb = h - bottom, ys = yb - s * showH;
  const X = (x) => x0 + s * x, Y = (d) => yb - s * (depth - d); // d: depth below the surface
  if (surfaceShown && ys > top) { // the air above the water (a tall canvas shows more of it)
    const ga = ctx.createLinearGradient(0, 4, 0, ys);
    ga.addColorStop(0, 'rgba(111,184,255,0)'); ga.addColorStop(1, 'rgba(111,184,255,0.06)');
    ctx.fillStyle = ga; ctx.fillRect(X(-marginX), 4, s * (ROW + 2 * marginX), ys - 4);
  }
  // water
  const grd = ctx.createLinearGradient(0, ys, 0, yb);
  grd.addColorStop(0, css('--water') || '#0d2236'); grd.addColorStop(1, css('--water-deep') || '#081626');
  ctx.fillStyle = grd; ctx.fillRect(X(-marginX), ys, s * (ROW + 2 * marginX), yb - ys);
  ctx.strokeStyle = css('--line'); ctx.strokeRect(X(-marginX) + 0.5, ys + 0.5, s * (ROW + 2 * marginX) - 1, yb - ys - 1);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted');
  if (surfaceShown) {
    ctx.strokeStyle = css('--accent'); ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(X(-marginX), ys); ctx.lineTo(X(ROW + marginX), ys); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(`air above: ${P.pressure.toFixed(2)} atm`, X(-marginX), ys - 6);
  } else {
    ctx.fillText(`the surface is ${depth < 10 ? depth.toFixed(1) : depth.toFixed(0)} m above the nozzles ↑`, X(-marginX), ys - 3);
  }
  // scale bar: 10 cm
  ctx.strokeStyle = css('--muted'); ctx.beginPath(); ctx.moveTo(X(ROW + marginX) - s * 0.1, ys - 6); ctx.lineTo(X(ROW + marginX), ys - 6); ctx.stroke();
  ctx.textAlign = 'right'; ctx.fillText('10 cm', X(ROW + marginX) - s * 0.1 - 4, ys - 3); ctx.textAlign = 'left';
  // nozzles (held keys lit), hydrophones
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const on = held.has(k), x = X(nozzleX(k));
    ctx.fillStyle = on ? pitchColour(rows[k - KEY_LO]?.fd ?? 440) : '#5a5a66';
    ctx.fillRect(x - 1.5, yb, 3, on ? 7 : 4);
  }
  ctx.fillStyle = css('--text'); ctx.textAlign = 'center';
  HYDRO.x.forEach((hx, i) => {
    ctx.strokeStyle = css('--text'); ctx.beginPath(); ctx.arc(X(hx), yb + 14, 4, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(hx), yb + 14, 1.5, 0, TAU); ctx.fill();
    ctx.fillText(i ? 'R' : 'L', X(hx) + 12, yb + 18);
  });
  ctx.textAlign = 'left';
  // bubbles
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const B = bubbles[i], age = t - B.t0;
    if (age < 0) continue;
    const z = riseDistance(age, B.U), d = B.d0 - z;
    if (d <= B.R) { pops.push({ x: nozzleX(B.key), t, f: B.f }); bubbles.splice(i, 1); continue; }
    if (B.d0 !== depth) { if (age > 3) bubbles.splice(i, 1); continue; } // the nozzles moved: these are elsewhere
    const yy = Y(d);
    if (yy < ys - 2) { bubbles.splice(i, 1); continue; }
    const r = Math.max(1.2, 2 * B.R * s);
    // shape: small bubbles are spheres, bigger ones flatten (Eötvös number ρg(2R)²/σ)
    const Eo = (liq.rho * G * 4 * B.R * B.R) / liq.sigma, E = Math.max(0.4, 1 / (1 + 0.163 * Eo ** 0.757));
    const rx = r * E ** (-1 / 3), ry = r * E ** (2 / 3), ring = Math.exp(-B.b * age);
    const x = X(nozzleX(B.key)), col = pitchColour(B.f);
    if (ring > 0.01) {
      ctx.fillStyle = pitchColour(B.f, 70, 0.35 * ring);
      ctx.beginPath(); ctx.ellipse(x, yy, rx + 2 + 6 * ring, ry + 2 + 6 * ring, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = pitchColour(B.f, 60, 0.35); ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, yy, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // bubbles bursting at the surface
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i], a = t - p.t;
    if (a > 0.5 || !surfaceShown) { pops.splice(i, 1); continue; }
    ctx.strokeStyle = pitchColour(p.f, 70, 1 - a / 0.5);
    ctx.beginPath(); ctx.ellipse(X(p.x), ys, 3 + 30 * a, 1 + 6 * a, 0, Math.PI, TAU); ctx.stroke();
  }
  if (shell.audio) {
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
    ctx.fillText(`${active} ringing`, X(ROW + marginX) - 4, yb - 6); ctx.textAlign = 'left';
  }
}, tcv);

// ---- the latest bubble's ring -------------------------------------------------------------------------
const wcv = $('#wave');
// The ring's frequency from the engine's samples: upward zero crossings (linearly interpolated), from
// its first peak (the onset is not a crossing of the ring) to where it has fallen 30 dB.
function measuredFreq(x, dt) {
  let pk = 0, ipk = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); ipk = i; }
  let end = x.length - 1;
  while (end > ipk && Math.abs(x[end]) < 0.03 * pk) end--;
  let first = -1, last = -1, n = 0;
  for (let i = ipk + 1; i <= end; i++) {
    if (x[i - 1] <= 0 && x[i] > 0) { const tz = (i - 1 + x[i - 1] / (x[i - 1] - x[i])) * dt; if (first < 0) first = tz; else { n++; last = tz; } }
  }
  return n >= 3 ? n / (last - first) : 0;
}
animate(() => {
  const { ctx, w, h } = fit(wcv);
  ctx.clearRect(0, 0, w, h);
  const padL = 40, padR = 8, padT = 8, padB = 18, pw = w - padL - padR, phh = h - padT - padB;
  ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(padL, padT + phh / 2); ctx.lineTo(w - padR, padT + phh / 2); ctx.stroke();
  if (!wave || !wave.count) return;
  const P = shell.P, x = wave.buf, N = 1024, T = N * wave.dt;
  const A = peakPressure(liquidOf(P), wave.vel) * snapGain(wave.fd, P.snap / 1000) / (wave.m || 1);
  let pk = 1e-9; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const top = Math.max(pk, A) * 1.08, Xt = (tt) => padL + (pw * tt) / T, Yp = (p) => padT + phh / 2 - (phh / 2) * (p / top);
  // axes
  ctx.fillStyle = css('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
  for (const p of [top * 0.9, 0, -top * 0.9]) ctx.fillText(p === 0 ? '0' : `${(p).toPrecision(2)}`, padL - 4, Yp(p) + 3);
  ctx.save(); ctx.translate(10, padT + phh / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Pa', 0, 0); ctx.restore();
  ctx.textAlign = 'center';
  const ms = T * 1000, step = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((v) => ms / v <= 6) || 1000;
  for (let v = 0; v <= ms + 1e-9; v += step) { ctx.fillText(`${v} ms`, Xt(v / 1000), h - 5); ctx.strokeStyle = css('--grid'); ctx.beginPath(); ctx.moveTo(Xt(v / 1000), padT); ctx.lineTo(Xt(v / 1000), padT + phh); ctx.stroke(); }
  // the engine's samples
  ctx.strokeStyle = pitchColour(wave.fd, 62, 0.9); ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i < x.length; i++) { const X = Xt(i * wave.dt), Yv = Yp(x[i]); if (i) ctx.lineTo(X, Yv); else ctx.moveTo(X, Yv); }
  ctx.stroke(); ctx.lineWidth = 1;
  // the model's envelope, ±A e^(−bt) from the middle of the snap
  const t0 = P.snap / 2000;
  ctx.setLineDash([5, 4]); ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.4;
  for (const sgn of [1, -1]) { ctx.beginPath(); for (let i = 0; i <= 200; i++) { const tt = t0 + (i / 200) * (T - t0), e = sgn * A * Math.exp(-wave.b * (tt - t0)); if (i) ctx.lineTo(Xt(tt), Yp(e)); else ctx.moveTo(Xt(tt), Yp(e)); } ctx.stroke(); }
  ctx.setLineDash([]); ctx.lineWidth = 1;
  // readout
  // readout (as text under the canvas, so it wraps rather than covering the ring)
  if (wave.count !== shownCount || wave.frame !== shownFrame) {
    shownCount = wave.count; shownFrame = wave.frame;
    const fm = measuredFreq(x, wave.dt), t60 = 6.91 / wave.b, dv = wave.dvis < 1e-3 ? wave.dvis.toExponential(1) : wave.dvis.toFixed(4);
    $('#wave-info').innerHTML = `<span>R ${(1000 * wave.R).toFixed(2)} mm · κ ${wave.kappa.toFixed(3)}</span> · <span>f ${wave.fd.toFixed(1)} Hz at release (model)${fm ? `, ${fm.toFixed(1)} Hz over the ring (engine)` : ''}</span> · `
      + `<span>δ ${wave.delta.toFixed(4)} = ${wave.dth.toFixed(4)} heat + ${wave.drad.toFixed(4)} radiation + ${dv} viscosity</span> · `
      + `<span>Q ${(1 / wave.delta).toFixed(0)} · T₆₀ ${t60 < 0.1 ? (t60 * 1000).toFixed(1) + ' ms' : t60.toFixed(2) + ' s'}</span> · <span>rising ${(wave.U * 100).toFixed(wave.U < 0.01 ? 2 : 0)} cm/s</span>`;
  }
  $('#wave-key').textContent = noteName(wave.key);
  $('#wave-read').textContent = `${(1000 * T).toFixed(0)} ms shown`;
}, wcv);

// ---- damping across the keyboard (Devin's plot) ----------------------------------------------------------
const dcv = $('#devin');
animate(() => {
  const { ctx, w, h } = fit(dcv);
  ctx.clearRect(0, 0, w, h);
  if (!rows.length) return;
  const padL = 36, padR = 40, padT = 8, padB = 30, pw = w - padL - padR, phh = h - padT - padB;
  const lo = -5, hi = 0; // log10 δ
  const Xk = (k) => padL + (pw * (k - KEY_LO)) / (KEY_HI - KEY_LO), Yd = (d) => padT + phh * (hi - Math.log10(Math.max(d, 1e-9))) / (hi - lo);
  const gas = gasOf(shell.P), Yk = (kap) => padT + phh * (1 - (kap - 1) / Math.max(0.05, gas.gamma - 1 + 0.02));
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (let e = lo; e <= hi; e++) { ctx.beginPath(); ctx.moveTo(padL, Yd(10 ** e)); ctx.lineTo(w - padR, Yd(10 ** e)); ctx.stroke(); ctx.fillText(e === 0 ? '1' : `10${'⁻' + '⁰¹²³⁴⁵⁶⁷⁸⁹'[-e]}`, padL - 4, Yd(10 ** e) + 3); }
  ctx.textAlign = 'left'; ctx.fillStyle = '#d8a0ff';
  ctx.fillText(`κ = γ`, w - padR + 3, Yk(gas.gamma) + 3); ctx.fillText('κ = 1', w - padR + 3, Yk(1) - 2);
  ctx.fillStyle = css('--muted');
  ctx.textAlign = 'center';
  // note names on the Cs, and the bubble's radius under each (skipping labels that would collide)
  let lastX = -1e9;
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    if (k % 12 !== 0 && k !== KEY_LO) continue;
    const r = rows[k - KEY_LO], label = `${(1000 * r.R).toFixed(r.R < 0.002 ? 1 : 0)} mm`, x = Xk(k), wl = Math.max(ctx.measureText(label).width, 18);
    if (x - lastX < wl + 6) continue;
    ctx.textAlign = k === KEY_LO ? 'left' : k === KEY_HI ? 'right' : 'center';
    ctx.fillText(noteName(k), x, h - 17); ctx.fillText(label, x, h - 5);
    lastX = x + (k === KEY_LO ? wl : wl / 2);
  }
  ctx.textAlign = 'center';
  for (const k of held) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(Xk(k), padT); ctx.lineTo(Xk(k), padT + phh); ctx.stroke(); }
  const line = (get, col, Y = Yd, dash = []) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.setLineDash(dash); ctx.beginPath();
    rows.forEach((r, i) => { const v = Y(get(r)); if (i) ctx.lineTo(Xk(r.key), v); else ctx.moveTo(Xk(r.key), v); });
    ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  ctx.save(); ctx.beginPath(); ctx.rect(padL, padT - 2, pw, phh + 4); ctx.clip();
  line((r) => r.dth, '#ff9a5a'); line((r) => r.drad, '#6fb8ff'); line((r) => r.dvis, '#9fe39f'); line((r) => r.delta, '#ebebef');
  line((r) => r.kappa, '#d8a0ff', Yk, [4, 3]);
  ctx.restore();
  if (wave && wave.key >= KEY_LO && wave.key <= KEY_HI) {
    ctx.fillStyle = pitchColour(wave.fd); ctx.beginPath(); ctx.arc(Xk(wave.key), Yd(wave.delta), 4, 0, TAU); ctx.fill();
  }
  ctx.textAlign = 'left';
}, dcv);

update();
