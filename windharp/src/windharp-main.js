// windharp-main.js — the page: wires the shell to the engine and draws the views.

import { createShell, noteName } from '../../shared/shell.js';
import { fit, css, animate } from '../../shared/views.js';
import { GROUPS, PRESETS } from './windharp-params.js';
import {
  KEY_LO, KEY_HI, TAU, U_REF, U_MAX, AIR, RE_C, stringDesign, shedding, lockBand, lockedRange, lockedAmplitude, homeHarmonic, massDamping, courseOffsets,
} from './windharp-model.js';

const $ = (s) => document.querySelector(s);
let focus = 60, harp = null, analyser = null, fbuf = null;

const shell = createShell({
  id: 'windharp',
  groups: GROUPS,
  presets: PRESETS,
  keep: ['volume', 'room', 'velocity'],
  range: [KEY_LO, KEY_HI],
  base: 60,
  worklet: { modules: ['src/windharp-engine.js'], engine: 'WindHarpEngine' },
  chain: { volume: 'volume', room: 'room' },
  space: 'sustain',
  arrows: { param: 'wind', step: 0.05 },
  modWheel: { param: 'wind', max: U_MAX },
  onAudio: (a) => { analyser = a.ctx.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0; a.node.connect(analyser); },
  onNoteOn: (key) => { focus = key; shell.keys.focus?.(key); update(); },
  onParam: () => update(),
  onMessage: (m) => { if (m.type === 'harp') { harp = m; if (m.key >= 0 && m.key !== focus) { focus = m.key; update(); } } },
});

// ---- the focus string and its map (the bands at once; each locked range a frame at a time) --------
let F = null;
const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`);
function update() {
  const P = shell.P, S = stringDesign(focus, P), id = `${focus}|${P.n0}|${P.tuning}|${P.unison}|${P.mass}|${P.q}`;
  if (!F || F.id !== id) {
    const bands = [];
    for (let n = 1; n <= S.N; n++) { const b = lockBand(S, n); if (b) bands.push({ ...b, range: null, Y: null }); }
    F = { id, S, bands, next: 0, home: homeHarmonic(S) };
  }
  const name = noteName(focus);
  $('#map-key').textContent = name; $('#tab-key').textContent = name;
  table();
}
function refine() { // one harmonic's locked range per frame
  if (!F || F.next >= F.bands.length) return;
  const b = F.bands[F.next++], r = lockedRange(F.S, b.n);
  b.range = r || { downTo: b.lo, upTo: b.hi, Ymid: 0 };
  b.Y = r ? r.Ymid : lockedAmplitude(F.S, b.n, b.mid);
  table();
}
function table() {
  if (!F) return;
  const S = F.S, P = shell.P, Re0 = S.Re0, nowU = harp?.Uv || P.wind, nowRe = (nowU * S.D) / AIR.nu;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  $('#info').innerHTML = [
    row('strings to the key', (() => { const c = courseOffsets(focus); return c.length === 1 ? 'one' : `${c.length === 2 ? 'two' : 'three'} in unison, ${c.map((o) => `${o.cents >= 0 ? '+' : '−'}${Math.abs(o.cents).toFixed(1)} ¢`).join(', ')}`; })()),
    row('diameter', `${(S.D * 1e3).toFixed(S.D < 1e-3 ? 3 : 2)} mm nylon${P.mass > 1 ? `, wound (× ${P.mass.toFixed(2)} mass)` : ''}`),
    row('length, tension', `${(S.L * 100).toFixed(1)} cm, ${S.T.toFixed(S.T < 100 ? 1 : 0)} N (${(S.stress / 1e6).toFixed(0)} MPa)`),
    row('fundamental', `${fmtHz(S.f0)}, inharmonicity B = ${S.B.toExponential(1)}`),
    row('sounds at U₀', (() => {
      const b = F.bands.find((x) => x.n === F.home), locks = b && U_REF >= b.lo && U_REF <= b.hi;
      if (!S.unison) return `harmonic ${S.n0}: ${fmtHz(S.f[S.n0 - 1])}`;
      return locks ? `harmonic ${F.home} of the unison: ${fmtHz(S.f[F.home - 1])}` : `nothing: its shedding (${fmtHz(S.fNote)}) falls between harmonics ${Math.max(1, F.home - 1)}–${F.home + 1}`;
    })()),
    row('Reynolds number', `${Re0.toFixed(0)} at ${U_REF} m/s; ${nowRe.toFixed(0)} now${nowRe < RE_C ? ' (no shedding)' : ''}`),
    row('mass ratio m* = m/ρD²', `${S.mu.toFixed(0)}`),
    row('mass–damping m*ζ', `${massDamping(S).toFixed(2)} (Scruton number ${(2 * massDamping(S)).toFixed(2)})`),
  ].join('');
  const shown = F.bands.filter((b) => b.lo < U_MAX * 1.05);
  $('#bands').innerHTML = '<tr><th>n</th><th>f_n</th><th>band (m/s)</th><th>holds (m/s)</th><th>growth</th><th>Ŷ/D</th></tr>'
    + shown.map((b) => `<tr><td>${b.n}${b.n === F.home ? ' ◂' : ''}</td><td>${fmtHz(S.f[b.n - 1])}</td><td>${b.lo.toFixed(2)}–${b.hi.toFixed(2)}</td><td>${b.range ? `${b.range.downTo.toFixed(2)}–${b.range.upTo.toFixed(2)}` : '…'}</td><td>${b.growth.toFixed(1)}/s</td><td>${b.Y === null ? '…' : b.Y ? b.Y.toFixed(3) : '—'}</td></tr>`).join('');
  $('#tab-read').textContent = `${S.N} modes, ${S.N} wake stations`;
}

// ---- the lock-in map ------------------------------------------------------------------------------
const mapCv = $('#map'), trail = [];
animate(() => {
  refine();
  if (!F) return;
  const { ctx, w, h } = fit(mapCv);
  ctx.clearRect(0, 0, w, h);
  const S = F.S, padL = 40, padR = 22, padT = 8, padB = 20, W = Math.max(10, w - padL - padR), H = Math.max(10, h - padT - padB);
  const u0 = 1, u1 = U_MAX, fLo = 0.75 * S.f0, fHi = Math.min(S.f[S.N - 1] * 1.08, shedding(u1, S.D).fs * 1.2);
  const X = (U) => padL + (W * (U - u0)) / (u1 - u0), Y = (f) => padT + H * (1 - Math.log(f / fLo) / Math.log(fHi / fLo));
  ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1;
  // no shedding below Re = 47
  const Uc = (RE_C * AIR.nu) / S.D;
  if (Uc > u0) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(padL, padT, Math.min(W, X(Uc) - padL), H); ctx.fillStyle = css('--muted'); ctx.textAlign = 'left'; ctx.fillText('Re < 47', padL + 4, padT + 12); }
  // axes
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
  for (let U = 1; U <= u1; U++) { ctx.beginPath(); ctx.moveTo(X(U), padT); ctx.lineTo(X(U), padT + H); ctx.stroke(); ctx.fillText(`${U}`, X(U), h - 6); }
  ctx.textAlign = 'right'; ctx.fillText('m/s', w - 2, h - 6);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(X(U_REF), padT); ctx.lineTo(X(U_REF), padT + H); ctx.stroke(); ctx.setLineDash([]);
  // harmonics, their bands and locked ranges
  const lockN = harp && harp.key === focus && harp.amp > 0.004 ? harp.lock : 0;
  for (let n = 1; n <= S.N; n++) {
    const f = S.f[n - 1]; if (f < fLo || f > fHi) continue;
    ctx.strokeStyle = n === lockN ? css('--accent') : 'rgba(255,255,255,0.16)'; ctx.lineWidth = n === lockN ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(padL, Y(f)); ctx.lineTo(padL + W, Y(f)); ctx.stroke();
    ctx.fillStyle = n === lockN ? css('--accent') : css('--muted'); ctx.textAlign = 'left'; ctx.fillText(`${n}`, padL + W + 5, Y(f) + 3);
    if (f > 0) { ctx.textAlign = 'right'; if (n === 1 || n === F.home) ctx.fillText(fmtHz(f), padL - 4, Y(f) + 3); }
  }
  ctx.lineWidth = 1;
  for (const b of F.bands) {
    const f = S.f[b.n - 1]; if (f < fLo || f > fHi || b.lo > u1) continue;
    const y = Y(f), th = Math.max(5, Math.min(12, H / 18));
    if (b.range) { ctx.fillStyle = css('--hyst'); ctx.fillRect(X(Math.max(u0, b.range.downTo)), y - th / 2, X(Math.min(u1, b.range.upTo)) - X(Math.max(u0, b.range.downTo)), th); }
    ctx.fillStyle = b.sheds ? css('--band') : 'rgba(255,255,255,0.15)';
    ctx.fillRect(X(Math.max(u0, b.lo)), y - th / 2, Math.max(2, X(Math.min(u1, b.hi)) - X(Math.max(u0, b.lo))), th);
  }
  // the Strouhal frequency
  ctx.strokeStyle = css('--strouhal'); ctx.lineWidth = 1.5; ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 200; i++) { const U = u0 + ((u1 - u0) * i) / 200; if (U < Uc) continue; const f = shedding(U, S.D).fs, y = Y(f); if (y < padT) break; if (started) ctx.lineTo(X(U), y); else { ctx.moveTo(X(U), y); started = true; } }
  ctx.stroke(); ctx.lineWidth = 1;
  // the wind now, and its recent past
  if (harp && harp.key === focus) {
    const U = harp.Uv;
    trail.push(U); if (trail.length > 150) trail.shift();
    ctx.fillStyle = css('--accent-2');
    for (let i = 0; i < trail.length; i++) { const u = trail[i]; if (u < Math.max(u0, Uc) || u > u1) continue; ctx.globalAlpha = (0.3 * i) / trail.length; ctx.beginPath(); ctx.arc(X(u), Y(shedding(u, S.D).fs), 2, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (U >= u0 && U <= u1) {
      const fs = shedding(U, S.D).fs, x = X(U);
      ctx.beginPath(); ctx.arc(x, Y(Math.max(fLo, Math.min(fHi, fs))), 5, 0, TAU); ctx.fill();
      if (lockN) { const fl = S.f[lockN - 1]; ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, Y(fl), 7, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; }
    }
    $('#map-read').textContent = `${U.toFixed(2)} m/s · f_s ${fmtHz(shedding(U, S.D).fs)} · ${lockN ? `locked on ${lockN}: ${fmtHz(S.f[lockN - 1])}` : 'not locked'}`;
  } else $('#map-read').textContent = `wind ${shell.P.wind.toFixed(2)} m/s · play a key`;
}, mapCv);

// ---- the string and its wake, slowed down --------------------------------------------------------
const stCv = $('#street'), vortices = [], cr = new Float64Array(16), ci = new Float64Array(16), dph = new Float64Array(16);
let psi = 0, lastT = 0;
const SLOW = 0.7; // Hz: the locked harmonic, as shown
animate((t) => {
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t;
  const { ctx, w, h } = fit(stCv);
  ctx.fillStyle = css('--air'); ctx.fillRect(0, 0, w, h);
  const m = harp && harp.key === focus ? harp : null;
  const N = m ? m.N : 0, J = m ? m.J : 0;
  const locked = m && m.amp > 0.004;
  // complex amplitudes: a(t) = Re(c e^{iωt}), c = a − i v/ω. Shown slowed down: the locked harmonic (or,
  // unlocked, the string's own harmonic) turns at SLOW Hz, every other mode and the wake in proportion;
  // each display phase advances by its own rate, so nothing jumps when the dominant mode changes.
  let wd = 1;
  if (m) { for (let n = 0; n < N; n++) { cr[n] = m.a[n]; ci[n] = -m.v[n] / m.w[n]; } wd = (locked ? m.w[m.lock - 1] : m.w[(m.home || 1) - 1]) || m.w[0]; }
  for (let n = 0; n < N; n++) dph[n] = (dph[n] + TAU * SLOW * dt * (m.w[n] / wd)) % (TAU * 1e6);
  const topH = Math.round(h * 0.38), x0 = 18, x1 = w - 18, yc = topH * 0.55, ampPx = topH * 0.36;
  // the string from the side
  const Yat = (u) => { let y = 0; if (!m) return 0; for (let n = 0; n < N; n++) { const ph = dph[n]; y += (cr[n] * Math.cos(ph) - ci[n] * Math.sin(ph)) * Math.sin((n + 1) * Math.PI * u); } return y / m.D; };
  const gain = ampPx / 0.12; // Ŷ/D = 0.12 fills the band
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
  ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const u = i / 160, y = yc - gain * Math.max(-0.14, Math.min(0.14, Yat(u))); if (i) ctx.lineTo(x0 + u * (x1 - x0), y); else ctx.moveTo(x0, y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = css('--muted'); ctx.fillRect(x0 - 6, yc - 10, 5, 20); ctx.fillRect(x1 + 1, yc - 10, 5, 20); // bridge and block
  // the shutter: covers what is not yet uncovered
  if (m) { const xs = x0 + m.x * (x1 - x0); ctx.fillStyle = 'rgba(160,160,170,0.28)'; ctx.fillRect(xs, yc - ampPx - 6, x1 - xs, 2 * ampPx + 12); }
  // wake stations: brightness by swing, ring when shedding in step with the string
  for (let j = 0; j < J; j++) {
    const u = (j + 0.5) / J, x = x0 + u * (x1 - x0), qa = Math.min(3, Math.hypot(m.q[j], m.qv[j] / (m.Om || 1))) / 3;
    ctx.fillStyle = css('--vortex'); ctx.globalAlpha = 0.15 + 0.85 * qa * m.e[j];
    ctx.beginPath(); ctx.arc(x, yc + ampPx + 12, 3 + 3 * qa, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // across the string at its liveliest point: the cylinder and its street
  let ju = 0.5;
  if (m && N) { const n = m.lock || 1; ju = 0.5 / n; }
  const yb = topH + (h - topH) * 0.5, R = Math.max(5, Math.min(16, (h - topH) * 0.09)), cx = Math.max(R * 3, w * 0.16);
  // the swing across the wind, magnified 20 times (a locked string moves a few per cent of its diameter)
  const cyl = yb - 2 * R * 20 * Math.max(-0.12, Math.min(0.12, Yat(ju)));
  const blowing = m && m.x > 0.02 && m.Re > RE_C;
  // the wind arriving: streamlines of potential flow round the cylinder, y = d(1 + R²/(x² + d²)) upstream
  ctx.strokeStyle = 'rgba(143,196,255,0.22)'; ctx.globalAlpha = blowing ? 1 : 0.3;
  for (let k = -3; k <= 3; k++) {
    if (!k) continue;
    const d = k * R * 1.3; ctx.beginPath();
    for (let x = 2; x <= cx; x += 3) { const dx = x - cx, y = cyl + d * (1 + (R * R) / (dx * dx + d * d)); if (x === 2) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // shedding: the wake's phase at the station nearest the antinode, run slowly; a vortex at each half turn
  // the wake sheds at the string's frequency when locked, at its own (κΩ) when not
  const wq = !m ? 1 : locked ? 1 : (0.9944 * (m.Om || wd)) / wd;
  if (blowing) {
    const k0 = Math.floor(psi / Math.PI);
    psi += TAU * SLOW * dt * wq;
    const k1 = Math.min(k0 + 2, Math.floor(psi / Math.PI));
    for (let k = k0 + 1; k <= k1; k++) vortices.push({ x: cx + R * 1.1, y: cyl + (k % 2 ? 1 : -1) * R * 0.55, s: k % 2 ? 1 : -1, a: 0 });
  }
  const lam = 4.3 * 2 * R, speed = lam * SLOW * wq; // spacing ≈ 4.3 D, two vortices per period
  for (const v of vortices) { v.x += speed * dt; v.a += dt; }
  while (vortices.length && (vortices[0].x > w + 2 * R || vortices.length > 60)) vortices.shift();
  for (const v of vortices) {
    const fade = Math.max(0, 1 - (v.x - cx) / (w - cx + R)), r = R * (0.55 + 0.35 * Math.min(1, v.a * SLOW * 2));
    ctx.strokeStyle = v.s > 0 ? css('--vortex') : css('--accent-2'); ctx.globalAlpha = 0.85 * fade; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const th = (i / 40) * TAU * 1.6, rr = (r * i) / 40, ang = v.s * th - v.a * 4 * v.s; const px = v.x + rr * Math.cos(ang), py = v.y + rr * Math.sin(ang); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // the cylinder
  ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.arc(cx, cyl, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, yb - R * 3.2); ctx.lineTo(cx, yb + R * 3.2); ctx.stroke(); ctx.setLineDash([]);
  if (m) {
    const S = F && F.S;
    $('#street-read').textContent = `${noteName(m.key)} · ${locked ? `locked on harmonic ${m.lock}, swing ${(m.amp * 100).toFixed(1)} % of D` : m.Re < RE_C ? `Re ${m.Re.toFixed(0)}: no shedding` : 'shedding, not locked'}${S ? ` · D ${(S.D * 1e3).toFixed(2)} mm` : ''}`;
  } else $('#street-read').textContent = 'play a key';
}, stCv);

// ---- spectrogram -----------------------------------------------------------------------------------
const spCv = $('#spec'), off = document.createElement('canvas');
animate(() => {
  const { ctx, w, h } = fit(spCv);
  const dpr = spCv.width / w;
  if (off.width !== spCv.width || off.height !== spCv.height) { off.width = spCv.width; off.height = spCv.height; }
  const o = off.getContext('2d');
  // scroll by one device pixel and draw the newest column
  o.globalCompositeOperation = 'copy'; o.drawImage(off, -Math.max(1, Math.round(dpr)), 0); o.globalCompositeOperation = 'source-over';
  const fLo = 120, fHi = 6000, Hh = off.height, col = off.width - Math.max(1, Math.round(dpr));
  o.fillStyle = css('--air'); o.fillRect(col, 0, off.width - col, Hh);
  if (analyser) {
    if (!fbuf || fbuf.length !== analyser.frequencyBinCount) fbuf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(fbuf);
    const fs = analyser.context.sampleRate, nb = fbuf.length;
    for (let y = 0; y < Hh; y += 1) {
      const f = fLo * (fHi / fLo) ** (1 - y / Hh), bin = Math.min(nb - 1, Math.round((f * 2 * nb) / fs)), db = fbuf[bin];
      const v = Math.max(0, Math.min(1, (db + 105) / 70));
      if (v > 0.02) { o.fillStyle = `rgba(168,230,161,${v.toFixed(3)})`; o.fillRect(col, y, off.width - col, 1); }
    }
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = css('--muted'); ctx.textAlign = 'left';
  for (const f of [200, 500, 1000, 2000, 5000]) { const y = h * (1 - Math.log(f / fLo) / Math.log(fHi / fLo)); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 3, y - 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, y, w, 1); ctx.fillStyle = css('--muted'); }
}, spCv);

update();
