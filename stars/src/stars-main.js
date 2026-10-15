// stars-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './stars-params.js';
import { KEY_LO, KEY_HI, TAU, SUN, keyStar, starId, starAt, zams, legendre } from './stars-model.js';

const $ = (s) => document.querySelector(s);
let focus = 60, amps = null, analyser = null, fbuf = null, selected = -1, shown = -1, shownAt = 0;
const LCOL = () => [css('--l0'), css('--l1'), css('--l2'), css('--l3')];

// ---- the stars, built here and sent with each note (a red giant's mixed modes take a few ms) ------------
const built = new Map();
function starFor(key, P = shell.P) {
  const id = `${starId(P)}|${key}`;
  let c = built.get(id);
  if (!c) {
    c = keyStar(key, P);
    if (built.size > 400) built.delete(built.keys().next().value);
    built.set(id, c);
  }
  return c;
}
const isBuilt = (key, P = shell.P) => built.get(`${starId(P)}|${key}`);
let warmTimer = 0;
function prewarm() {
  clearTimeout(warmTimer);
  const keys = [];
  for (let d = 0; d <= KEY_HI - KEY_LO; d++) for (const k of [focus - d, focus + d]) if (k >= KEY_LO && k <= KEY_HI && !keys.includes(k)) keys.push(k);
  const step = () => { const k = keys.shift(); if (k !== undefined) { starFor(k); hrDirty = true; warmTimer = setTimeout(step, 6); } };
  warmTimer = setTimeout(step, 250);
}

const shell = createShell({
  id: 'stars',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  range: [KEY_LO, KEY_HI],
  worklet: { modules: ['src/stars-engine.js'], engine: 'StarEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'sustain',
  arrows: { param: 'velocity', step: 0.05 },
  modWheel: 'spin',
  noteData: (key) => { const d = starFor(key); return { id: d.id, key: d.key, K: d.K, family: d.family, N: d.N, modes: d.modes }; }, // what the engine needs
  onAudio: (a) => {
    // a finer analyser of our own for the spectrum view (the comb of a red giant is a few Hz apart)
    analyser = a.ctx.createAnalyser(); analyser.fftSize = 32768; analyser.smoothingTimeConstant = 0.6;
    a.node.connect(analyser);
    prewarm();
  },
  onNoteOn: (key) => { focus = key; selected = -1; shell.keys.focus?.(key); update(); },
  onParam: (id) => { update(); if (id === '*' || ['family', 'mass', 'speedup'].includes(id)) { prewarm(); hrDirty = true; } },
  onMessage: (m) => { if (m.type === 'amps') amps = m; },
});

// ---- the focus key's star ---------------------------------------------------------------------------------
let FX = null, hrDirty = true;
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
const fmtMu = (f) => `${f.toFixed(f < 100 ? 1 : 0)} μHz`;
function update() {
  const P = shell.P, d = starFor(focus, P), st = d.star, sz = d.sz, K = d.K;
  FX = d; hrDirty = true;
  const name = noteName(focus);
  $('#ech-key').textContent = name;
  $('#ech-read').textContent = d.family === 'dscuti'
    ? `δ Scuti · Δν ≈ ${fmtMu(sz.dnu)} from its density`
    : `Δν ${fmtMu(sz.dnu)} → ${fmtHz(sz.dnu * K * 1e-6)} · ν_max ${fmtMu(sz.numax)} → ${fmtHz(sz.numax * K * 1e-6)}`;
  const stage = { dwarf: 'main-sequence dwarf', subgiant: 'subgiant', giant: 'red giant', dscuti: 'δ Scuti star' }[st.stage];
  $('#hr-read').textContent = `${name}: ${stage}, ${st.M.toFixed(2)} M☉, ${st.R.toFixed(2)} R☉, ${st.T.toFixed(0)} K, ${st.L.toFixed(st.L < 10 ? 2 : 1)} L☉`;
  $('#ps-read').textContent = d.family === 'dscuti' ? 'live output · the self-excited modes' : `Γ ${sz.gamma.toFixed(2)} μHz → ${(sz.gamma * K * 1e-6).toFixed(2)} Hz (lifetime ${(1 / (Math.PI * sz.gamma * K * 1e-6 * P.damping)).toFixed(1)} s) · ${d.N} modes`;
}

// split frequency (μHz) of mode i of a star, with the knobs as they are
function splitNu(d, i, P = shell.P) {
  const md = d.modes, env = P.spin * SUN.rot, core = env * (d.family === 'dscuti' ? 1 : P.coreRatio);
  return md.f[i] / (d.K * 1e-6) + md.m[i] * (md.wEnv[i] * env + md.wCore[i] * core);
}
// live observed power of each mode, relative to the star's whole expected power (or the model's, silent)
function livePower(d) {
  const N = d.N, out = new Float64Array(N);
  if (amps && amps.id === d.id && amps.amp.length === N) {
    const D2 = Math.max(1e-6, amps.drive * amps.drive);
    for (let i = 0; i < N; i++) out[i] = (amps.amp[i] * amps.amp[i]) / D2;
    return { p: out, live: true };
  }
  return { p: out, live: false };
}
// the model's expected observed power of each m component (at unit drive): V_l² E_lm(i) p
const incl = () => (shell.P.incl * Math.PI) / 180;
function expected(d) {
  const md = d.modes, out = new Float64Array(d.N), c = Math.cos(incl()), F = [1, 1, 2, 6, 24, 120, 720], V = [1, 1.5, 0.6, 0.05];
  for (let i = 0; i < d.N; i++) { const l = md.l[i], a = Math.abs(md.m[i]), pl = legendre(l, a, c); out[i] = V[l] * (F[l - a] / F[l + a]) * pl * pl * (d.family === 'dscuti' ? md.asat[i] ** 2 : md.p[i]); }
  return out;
}

// ---- échelle diagram ---------------------------------------------------------------------------------------
const ecv = $('#echelle');
let echMap = []; // [x, y, mode index] of the drawn dots, for clicks
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(ecv);
  ctx.clearRect(0, 0, w, h);
  const d = FX, sz = d.sz, dnu = sz.dnu, md = d.modes, cols = LCOL();
  const padL = 44, padB = 18, padT = 6, padR = 8, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  let lo = Infinity, hi = -Infinity;
  for (const m of d.all) { lo = Math.min(lo, m.nu); hi = Math.max(hi, m.nu); }
  if (d.family !== 'dscuti') { const sig = sz.fwhm / 2.3548; lo = Math.max(lo, sz.numax - 2.6 * sig); hi = Math.min(hi, sz.numax + 2.6 * sig); }
  lo -= 0.5 * dnu; hi += 0.5 * dnu;
  const off = (sz.eps - 0.3) * dnu; // shift so the l = 0 ridge sits left of centre and l = 1 to the right
  const X = (nu) => padL + W * ((((nu - off) % dnu) + dnu) % dnu) / dnu, Y = (nu) => padT + H * (1 - (nu - lo) / (hi - lo));
  ctx.fillStyle = css('--space'); ctx.fillRect(padL, padT, W, H);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => (hi - lo) / s <= 8) || 2000;
  for (let nu = Math.ceil(lo / step) * step; nu <= hi; nu += step) { ctx.beginPath(); ctx.moveTo(padL, Y(nu)); ctx.lineTo(padL + W, Y(nu)); ctx.stroke(); ctx.fillText(`${nu}`, padL - 4, Y(nu) + 3); }
  ctx.textAlign = 'center';
  ctx.fillText(`ν mod Δν  (Δν = ${dnu.toFixed(dnu < 20 ? 2 : 1)} μHz) →`, padL + W / 2, h - 4);
  ctx.save(); ctx.translate(10, padT + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('frequency, μHz', 0, 0); ctx.restore();
  if (d.family !== 'dscuti') { // ν_max
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(padL, Y(sz.numax)); ctx.lineTo(padL + W, Y(sz.numax)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css('--muted'); ctx.textAlign = 'right'; ctx.fillText('ν_max', padL + W - 3, Y(sz.numax) - 3);
  }
  // the model's modes, all of them (rings), and the played ones by their power now (dots)
  ctx.lineWidth = 1;
  for (const m of d.all) { if (m.nu < lo || m.nu > hi) continue; ctx.strokeStyle = cols[m.l]; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(X(m.nu), Y(m.nu), 2.2, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const live = livePower(d), exp = expected(d);
  let emax = 0; for (const e of exp) emax = Math.max(emax, e);
  echMap = [];
  for (let i = 0; i < d.N; i++) {
    const nu = splitNu(d, i);
    if (nu < lo || nu > hi) continue;
    const p = live.live ? live.p[i] : exp[i], r = Math.min(11, 1.2 + 9 * Math.sqrt(p / emax));
    const x = X(nu), y = Y(nu);
    ctx.fillStyle = cols[md.l[i]]; ctx.globalAlpha = live.live ? 0.9 : 0.55;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    echMap.push([x, y, i]);
    if (i === shown) { ctx.globalAlpha = 1; ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; }
  }
  ctx.globalAlpha = 1;
}, ecv);
ecv.addEventListener('click', (e) => {
  const r = ecv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = 14 * 14;
  for (const [px, py, i] of echMap) { const dd = (px - x) ** 2 + (py - y) ** 2; if (dd < bd) { bd = dd; best = i; } }
  selected = best;
});

// ---- the power spectrum ---------------------------------------------------------------------------------------
const pcv = $('#spectrum');
let refDb = -60;
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(pcv);
  ctx.clearRect(0, 0, w, h);
  const d = FX, sz = d.sz, md = d.modes, K = d.K * 1e-6, cols = LCOL();
  const padL = 34, padB = 18, padT = 8, padR = 8, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < d.N; i++) { const nu = splitNu(d, i); lo = Math.min(lo, nu); hi = Math.max(hi, nu); }
  const span = hi - lo || 1; lo -= 0.06 * span; hi += 0.06 * span;
  const X = (nu) => padL + (W * (nu - lo)) / (hi - lo), TOP = 3, RANGE = 42, Y = (db) => padT + (H * (TOP - db)) / RANGE;
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'right';
  for (let db = 0; db >= TOP - RANGE; db -= 10) { ctx.beginPath(); ctx.moveTo(padL, Y(db)); ctx.lineTo(padL + W, Y(db)); ctx.stroke(); ctx.fillText(`${db}`, padL - 4, Y(db) + 3); }
  ctx.textAlign = 'center';
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => (hi - lo) / s <= 7) || 2000;
  for (let nu = Math.ceil(lo / step) * step; nu <= hi; nu += step) ctx.fillText(`${nu} μHz`, X(nu), h - 4);
  const exp = expected(d), live = livePower(d);
  let emax = 0; for (const e of exp) emax = Math.max(emax, e);
  // the envelope (dashed): the l = 1 multiplet's power across the band
  if (d.family !== 'dscuti') {
    const sig = sz.fwhm / 2.3548, pmax = d.multiplets.reduce((a, m) => Math.max(a, m.power), 0);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath();
    for (let x = 0; x <= W; x += 3) { const nu = lo + ((hi - lo) * x) / W, e = 1.5 * Math.exp(-((nu - sz.numax) ** 2) / (2 * sig * sig)) / pmax, db = 10 * Math.log10(e + 1e-9) - 10 * Math.log10(sumMax(d) / pmax); if (x) ctx.lineTo(padL + x, Y(db)); else ctx.moveTo(padL + x, Y(db)); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // the live output (dB, its loudest point in view at the top)
  if (analyser) {
    if (!fbuf || fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fbuf);
    const fs = analyser.context.sampleRate, N = fbuf.length, b0 = Math.max(1, Math.floor((lo * K * 2 * N) / fs)), b1 = Math.min(N - 1, Math.ceil((hi * K * 2 * N) / fs));
    let mx = -200; for (let b = b0; b <= b1; b++) mx = Math.max(mx, fbuf[b]);
    refDb = mx > refDb ? mx : refDb + 0.02 * (mx - refDb);
    if (mx > -140) {
      ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.55; ctx.beginPath();
      let started = false;
      for (let b = b0; b <= b1; b++) { const nu = (b * fs) / (2 * N) / K, y = Y(Math.max(TOP - RANGE, fbuf[b] - refDb)); if (started) ctx.lineTo(X(nu), y); else { ctx.moveTo(X(nu), y); started = true; } }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // each multiplet's power now (bars), and the model's expectation (ticks)
  const nM = d.multiplets.length, now = new Float64Array(nM), ex = new Float64Array(nM), at = new Float64Array(nM);
  for (let i = 0; i < d.N; i++) { const j = md.mult[i]; now[j] += live.p[i]; ex[j] += exp[i]; at[j] = md.f[i] / K; }
  const smax = sumMax(d);
  ctx.lineWidth = Math.max(1.5, Math.min(5, W / nM / 2.5));
  for (let j = 0; j < nM; j++) {
    const l = d.multiplets[j].l, x = X(at[j]);
    ctx.strokeStyle = cols[l];
    if (live.live) { ctx.globalAlpha = 0.9; const db = 10 * Math.log10(now[j] / smax + 1e-9); ctx.beginPath(); ctx.moveTo(x, Y(TOP - RANGE)); ctx.lineTo(x, Y(Math.max(TOP - RANGE, db))); ctx.stroke(); }
    ctx.globalAlpha = live.live ? 0.5 : 0.8; const de = 10 * Math.log10(ex[j] / smax + 1e-9);
    if (live.live) { ctx.fillStyle = cols[l]; ctx.fillRect(x - 3, Y(de) - 1, 6, 2); } else { ctx.beginPath(); ctx.moveTo(x, Y(TOP - RANGE)); ctx.lineTo(x, Y(Math.max(TOP - RANGE, de))); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // label the degrees of the strongest few
  ctx.fillStyle = css('--text'); ctx.textAlign = 'center';
  const order = [...ex.keys()].sort((a, b) => ex[b] - ex[a]).slice(0, 8);
  for (const j of order) ctx.fillText(`${d.multiplets[j].l}`, X(at[j]), Y(10 * Math.log10(ex[j] / smax + 1e-9)) - 4);
}, pcv);
function sumMax(d) { // the largest multiplet's expected observed power (the 0 dB line)
  const ex = new Float64Array(d.multiplets.length), e = expected(d);
  for (let i = 0; i < d.N; i++) ex[d.modes.mult[i]] += e[i];
  let m = 0; for (const v of ex) m = Math.max(m, v);
  return m || 1;
}

// ---- the star: one mode's pattern on the sphere ---------------------------------------------------------------
const scv = $('#sphere');
let grid = null, img = null, off = null;
function starColour(T) { // a rough blackbody colour
  const tab = [[3500, [255, 166, 90]], [4500, [255, 196, 137]], [5000, [255, 214, 170]], [5800, [255, 236, 214]], [6600, [252, 246, 250]], [7500, [228, 234, 255]], [9000, [205, 218, 255]]];
  if (T <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (T <= tab[i][0]) { const [t0, a] = tab[i - 1], [t1, b] = tab[i], u = (T - t0) / (t1 - t0); return a.map((v, k) => v + u * (b[k] - v)); }
  return tab[tab.length - 1][1];
}
function pickMode(d) {
  if (selected >= 0 && selected < d.N) return selected;
  const live = livePower(d), now = performance.now();
  let best = -1, bv = 0;
  const src = live.live ? live.p : expected(d);
  for (let i = 0; i < d.N; i++) if (d.modes.l[i] > 0 && src[i] > bv) { bv = src[i]; best = i; }
  if (shown >= 0 && shown < d.N && d.modes.l[shown] > 0 && (now - shownAt < 1500 || src[shown] * 1.6 > bv)) return shown;
  shownAt = now;
  return best;
}
animate((t) => {
  if (!FX) return;
  const { ctx, w, h } = fit(scv);
  ctx.clearRect(0, 0, w, h);
  const d = FX, md = d.modes, i = pickMode(d);
  if (i !== shown) { shown = i; shownAt = performance.now(); }
  const S = Math.max(40, Math.min(320, Math.round(Math.min(w, h) * 0.86 * (window.devicePixelRatio || 1)))), inc = incl();
  if (!grid || grid.S !== S || grid.inc !== inc) { // per pixel: cos θ and φ in the star's frame
    const n = S * S, ct = new Float32Array(n), ph = new Float32Array(n), mu = new Float32Array(n), edge = new Float32Array(n), si = Math.sin(inc), ci = Math.cos(inc);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = (2 * px + 1) / S - 1, y = 1 - (2 * py + 1) / S, r2 = x * x + y * y, k = py * S + px;
      if (r2 >= 1) { mu[k] = -1; continue; }
      edge[k] = Math.min(1, (1 - Math.sqrt(r2)) * S * 0.5);
      const z = Math.sqrt(1 - r2);
      // the rotation axis lies in the y–z plane, tilted i from the line of sight (z)
      ct[k] = y * si + z * ci; ph[k] = Math.atan2(y * ci - z * si, x); mu[k] = z;
    }
    grid = { S, inc, ct, ph, mu, edge }; off = document.createElement('canvas'); off.width = S; off.height = S; img = off.getContext('2d').createImageData(S, S);
  }
  const l = i >= 0 ? md.l[i] : 0, m = i >= 0 ? md.m[i] : 0, a = Math.abs(m), base = starColour(d.star.T);
  const sec = t / 1000, spin = shell.P.spin, rot = (TAU * sec * spin) / 12, puls = TAU * sec * 0.7;
  let pmax = 0; for (let k = 0; k <= 64; k++) pmax = Math.max(pmax, Math.abs(legendre(l, a, -1 + k / 32)));
  const live = livePower(d), ex = expected(d), depth = i >= 0 ? Math.min(1, 0.6 + 0.4 * Math.sqrt((live.live ? live.p[i] : ex[i]) / Math.max(1e-12, ex[i]))) : 0;
  const { ct, ph, mu, edge } = grid, data = img.data;
  const hot = [255, 252, 240], cold = [30, 40, 140];
  for (let k = 0; k < S * S; k++) {
    const q = 4 * k;
    if (mu[k] < 0) { data[q + 3] = 0; continue; }
    const v = depth * (l === 0 ? Math.cos(puls) : (legendre(l, a, ct[k]) / pmax) * Math.cos(m * (ph[k] - rot) - puls));
    // limb-darkened disc in the star's colour; outward (v > 0) brighter and whiter, inward darker and bluer
    // faint equator and four meridians, turning with the star, so its spin and tilt read at any phase
    const sn = Math.sqrt(Math.max(0, 1 - ct[k] * ct[k])), grid = Math.abs(ct[k]) < 0.018 || sn * Math.abs(Math.sin(2 * (ph[k] - rot))) < 0.018 * sn + 0.006 ? 0.8 : 1;
    const limb = (0.3 + 0.5 * mu[k]) * grid, u = Math.min(1, Math.abs(v)), tgt = v > 0 ? hot : cold, mix = v > 0 ? 0.55 * u : 0.75 * u, sh = v > 0 ? 1 + 0.35 * v : 1 + 0.55 * v;
    data[q] = Math.min(255, limb * sh * (base[0] + mix * (tgt[0] - base[0])));
    data[q + 1] = Math.min(255, limb * sh * (base[1] + mix * (tgt[1] - base[1])));
    data[q + 2] = Math.min(255, limb * sh * (base[2] + mix * (tgt[2] - base[2])));
    data[q + 3] = 255 * edge[k];
  }
  off.getContext('2d').putImageData(img, 0, 0);
  const D = Math.min(w, h) * 0.86, x0 = (w - D) / 2, y0 = (h - D) / 2;
  ctx.fillStyle = css('--space'); ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(off, x0, y0, D, D);
  // the rotation axis: from the pole toward us, foreshortened by the inclination
  const si = Math.sin(inc), ci = Math.cos(inc), cx = w / 2, cy = h / 2, R = D / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - R * si); ctx.lineTo(cx, cy - R * si - 0.16 * R * Math.max(0.15, si)); ctx.stroke();
  if (ci > 0.02) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(cx, cy - R * si, 2.5, 0, TAU); ctx.fill(); }
  ctx.lineWidth = 1;
  if (i >= 0) {
    const nu = splitNu(d, i), z = md.zeta[i];
    $('#sph-mode').textContent = `l = ${l}, m = ${m >= 0 ? (m ? '+' : '') : '−'}${Math.abs(m)}`;
    $('#sph-read').textContent = `${nu.toFixed(nu < 100 ? 2 : 1)} μHz → ${fmtHz(nu * d.K * 1e-6)}${z > 0.02 ? ` · ζ = ${z.toFixed(2)}: ${z > 0.5 ? 'mostly g, in the core' : 'mostly p'}` : ''}${selected >= 0 ? ' · clicked' : ''}`;
  }
}, scv);
scv.addEventListener('click', () => { selected = -1; });

// ---- the keyboard's stars on a Hertzsprung–Russell diagram -----------------------------------------------------------
const hcv = $('#hr');
animate(() => {
  if (!FX) return;
  const { ctx, w, h } = fit(hcv);
  ctx.clearRect(0, 0, w, h);
  const P = shell.P, padL = 40, padB = 18, padT = 6, padR = 8, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  let tMax = 5900, lMin = 0.6, lMax = 20;
  for (let k = KEY_LO; k <= KEY_HI; k++) { const d = isBuilt(k); if (d) { tMax = Math.max(tMax, d.star.T); lMin = Math.min(lMin, d.star.L); lMax = Math.max(lMax, d.star.L); } }
  if (P.family !== 'dscuti') for (let k = 0; k <= 40; k++) { const st = starAt((k / 40) * 0.6 - 0.05, P.mass); tMax = Math.max(tMax, st.T); }
  const T0 = Math.min(10000, tMax * 1.04), T1 = 4300, L0 = Math.max(0.05, lMin / 1.6), L1 = Math.min(400, lMax * 1.8);
  const X = (T) => padL + (W * Math.log(T0 / T)) / Math.log(T0 / T1), Y = (L) => padT + (H * Math.log(L1 / L)) / Math.log(L1 / L0);
  ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  for (const T of [10000, 9000, 8000, 7000, 6000, 5000]) { if (T > T0) continue; ctx.beginPath(); ctx.moveTo(X(T), padT); ctx.lineTo(X(T), padT + H); ctx.stroke(); ctx.fillText(`${T} K`, X(T), h - 4); }
  ctx.textAlign = 'right';
  for (const L of [0.1, 0.3, 1, 3, 10, 30, 100, 300]) { if (L < L0 || L > L1) continue; ctx.beginPath(); ctx.moveTo(padL, Y(L)); ctx.lineTo(padL + W, Y(L)); ctx.stroke(); ctx.fillText(`${L} L☉`, padL - 3, Y(L) + 3); }
  // the zero-age main sequence (Tout et al. 1996)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([3, 3]); ctx.beginPath();
  for (let k = 0; k <= 60; k++) { const z = zams(0.6 + (k / 60) * 1.5); if (k) ctx.lineTo(X(z.T), Y(z.L)); else ctx.moveTo(X(z.T), Y(z.L)); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--muted'); ctx.textAlign = 'left'; { const z = zams(Math.min(1.3, shell.P.mass ?? 1)); ctx.fillText('ZAMS', X(z.T) + 6, Y(z.L) + 12); }
  // the track
  if (P.family !== 'dscuti') {
    ctx.strokeStyle = css('--accent'); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k <= 160; k++) { const st = starAt((k / 160) * 2.4, P.mass); const x = X(st.T), y = Y(Math.min(L1, st.L)); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // the Sun
  ctx.strokeStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(X(SUN.teff), Y(1), 4, 0, TAU); ctx.stroke(); ctx.fillStyle = css('--accent-2'); ctx.beginPath(); ctx.arc(X(SUN.teff), Y(1), 1.2, 0, TAU); ctx.fill();
  // every key's star (as far as they are built)
  for (let k = KEY_LO; k <= KEY_HI; k++) {
    const d = isBuilt(k); if (!d) continue;
    const st = d.star; ctx.fillStyle = k === focus ? css('--text') : css('--accent'); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(X(st.T), Y(Math.min(L1, st.L)), k % 12 === 0 ? 2.6 : 1.7, 0, TAU); ctx.fill();
    if (k % 12 === 0) { ctx.fillStyle = css('--muted'); ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.fillText(noteName(k), X(st.T) + 4, Y(Math.min(L1, st.L)) - 3); }
  }
  ctx.globalAlpha = 1;
  const st = FX.star;
  ctx.strokeStyle = css('--text'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(st.T), Y(Math.min(L1, st.L)), 7, 0, TAU); ctx.stroke(); ctx.lineWidth = 1;
}, hcv);

update();
prewarm();
