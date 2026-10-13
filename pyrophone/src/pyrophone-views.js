// pyrophone-views.js — the page's drawings: the bifurcation diagram, the tube
// with its standing wave, and the phase portrait of mode 1.

import { fit, css } from '../../shared/views.js';
import { modeAmp, betaOn } from './pyrophone-model.js';

const FONT = '10px system-ui, sans-serif';
const line = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
const dot = (ctx, x, y, r, fill = true) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); if (fill) ctx.fill(); else ctx.stroke(); };

// The β axis is logarithmic and spans the threshold and every key's operating point.
export function betaRange(tune, P) {
  const bH = tune.betaH;
  return [0.12 * bH, Math.max(2.4 * bH, 1.25 * betaOn(P, 1))];
}

// ---- bifurcation diagram ------------------------------------------------------
// st = { bif, tune, P, live, focus, trail: [[β, y]…] }
export function drawBif(cv, st) {
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const { bif, tune, P } = st, acc = css('--accent'), acc2 = css('--accent-2'), muted = css('--muted'), text = css('--text');
  const padL = 34, padR = 10, padT = 10, padB = 22;
  const [b0, b1] = betaRange(tune, P), yMax = 1.05;
  const X = (b) => padL + ((w - padL - padR) * Math.log(Math.max(b, b0 * 0.5) / b0)) / Math.log(b1 / b0);
  const Y = (y) => h - padB - ((h - padT - padB) * y) / yMax;
  ctx.font = FONT; ctx.lineWidth = 1;
  // grid
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = muted; ctx.textAlign = 'center';
  const dec = 10 ** Math.floor(Math.log10(b0));
  for (let d = dec; d < b1 * 1.01; d *= 10) for (const m of [1, 2, 5]) {
    const b = d * m;
    if (b < b0 || b > b1) continue;
    ctx.beginPath(); ctx.moveTo(X(b), padT); ctx.lineTo(X(b), h - padB); ctx.stroke();
    ctx.fillText(b >= 0.1 ? b.toFixed(1) : b.toPrecision(1), X(b), h - 8);
  }
  ctx.textAlign = 'right';
  for (const y of [0, 0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(w - padR, Y(y)); ctx.stroke(); ctx.fillText(y.toFixed(2), padL - 4, Y(y) + 3); }
  ctx.textAlign = 'left'; ctx.fillText('heater gain β →', w - padR - 78, h - 8);
  ctx.save(); ctx.translate(10, (padT + h - padB) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('amplitude at the flame  |u′| / ū', 0, 0); ctx.restore();
  // heat transfer reversal
  ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  line(ctx, [[padL, Y(1 / 3)], [w - padR, Y(1 / 3)]]);
  ctx.setLineDash([]); ctx.fillStyle = muted; ctx.textAlign = 'right';
  ctx.fillText('flow at the flame reverses (u′ = −ū/3)', w - padR - 2, Y(1 / 3) - 4);
  // operating range: keys down (velocity 0…1) and keys up
  const bOn0 = betaOn(P, 0), bOn1 = betaOn(P, 1), bUp = P.keyup * tune.betaH;
  ctx.fillStyle = 'rgba(255,122,69,0.08)'; ctx.fillRect(X(bOn0), padT, X(bOn1) - X(bOn0), h - padT - padB);
  ctx.fillStyle = acc; ctx.textAlign = 'center'; ctx.globalAlpha = 0.8;
  ctx.fillText('keys down', (X(bOn0) + X(bOn1)) / 2, padT + 10);
  ctx.strokeStyle = acc; ctx.setLineDash([1, 3]); line(ctx, [[X(betaOn(P, P.velocity)), padT + 14], [X(betaOn(P, P.velocity)), h - padB]]);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = acc2; ctx.fillStyle = acc2;
  const xu = bUp > b0 ? X(bUp) : padL + 1;
  line(ctx, [[xu, padT + 14], [xu, h - padB]]); ctx.setLineDash([]);
  ctx.fillText(bUp > b0 ? 'keys up' : '← keys up', xu + (bUp > b0 ? 0 : 22), padT + 10);
  // the families of limit cycles
  const f1 = bif.fam[0];
  [bif.fam[1], f1].forEach((f, k) => {
    if (!f) return;
    const col = k ? acc : acc2, pts = [[f.hopf.beta, 0], ...f.pts.map((p) => [p.beta, p.y])];
    const stab = [false, ...f.pts.map((p) => p.stable)];
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] > b1 * 1.05 && pts[i - 1][0] > b1 * 1.05) continue;
      ctx.setLineDash(stab[i] ? [] : [5, 4]); ctx.globalAlpha = stab[i] ? 1 : 0.8;
      line(ctx, [[X(pts[i - 1][0]), Y(pts[i - 1][1])], [X(pts[i][0]), Y(pts[i][1])]]);
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    ctx.fillStyle = col; ctx.textAlign = 'left';
    const last = f.pts[f.pts.length - 1];
    if (last) ctx.fillText(f.mode === 1 ? 'mode 1 (the note)' : 'mode 2 (octave)', Math.min(X(last.beta), w - 110) + 4, Y(last.y) + 12);
  });
  // the silent state: stable up to the Hopf point, unstable beyond
  const bH = tune.betaH;
  ctx.strokeStyle = text; ctx.lineWidth = 2;
  line(ctx, [[padL, Y(0)], [X(bH), Y(0)]]);
  ctx.setLineDash([5, 4]); line(ctx, [[X(bH), Y(0)], [w - padR, Y(0)]]); ctx.setLineDash([]); ctx.lineWidth = 1;
  // bistable zone, Hopf point, fold
  const fs = tune.mode === 1 || tune.mode === 2 ? bif.fam[tune.mode - 1] : null; // the family that speaks first
  if (fs && fs.fold) {
    ctx.fillStyle = 'rgba(124,184,255,0.10)'; ctx.fillRect(X(fs.fold.beta), padT, X(bH) - X(fs.fold.beta), h - padT - padB);
    ctx.fillStyle = tune.mode === 1 ? acc : acc2; dot(ctx, X(fs.fold.beta), Y(fs.fold.y), 3.5);
    ctx.textAlign = 'right'; ctx.fillText('fold', X(fs.fold.beta) - 5, Y(fs.fold.y) + 3);
  }
  if (tune.mode) {
    ctx.fillStyle = text; dot(ctx, X(bH), Y(0), 3.5);
    ctx.textAlign = 'left'; ctx.fillText(tune.mode === 1 ? 'Hopf' : `Hopf (mode ${tune.mode})`, X(bH) + 5, Y(0) - 5);
  }
  // the focused tube's path, and every sounding tube now
  if (st.trail.length > 1) {
    ctx.strokeStyle = text; ctx.globalAlpha = 0.35;
    line(ctx, st.trail.map(([b, y]) => [X(b), Y(y)])); ctx.globalAlpha = 1;
  }
  for (const [key, b, a1, a2, down] of st.live.pts || []) {
    const y = Math.max(a1, a2);
    ctx.fillStyle = a2 > a1 ? acc2 : acc; ctx.strokeStyle = text;
    const r = key === st.focus ? 5 : 3;
    ctx.globalAlpha = down ? 1 : 0.6; dot(ctx, X(b), Y(Math.min(y, yMax)), r);
    if (key === st.focus) dot(ctx, X(b), Y(Math.min(y, yMax)), r + 2, false);
  }
  ctx.globalAlpha = 1;
}

// ---- the tube ------------------------------------------------------------------
// A vertical glass tube (bottom = draught inlet), with gas slices displaced by
// the acoustic motion and shaded by the pressure, the flame, and the pressure
// and velocity profiles beside it. state = { eta, vel, W, beta, live, xf, P, info }
export function drawTube(cv, s) {
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const N = s.eta.length, acc = css('--accent'), acc2 = css('--accent-2'), muted = css('--muted'), text = css('--text');
  const top = 14, bot = h - 18, tx = Math.min(w * 0.3, 120), tw = Math.min(46, w * 0.12);
  const Yx = (x) => bot - (bot - top) * x;
  // fields along the tube
  const M = 80, u = new Float64Array(M + 1), p = new Float64Array(M + 1), xi = new Float64Array(M + 1);
  let pm = 1e-9, um = 1e-9;
  for (let i = 0; i <= M; i++) {
    const x = i / M;
    let uu = 0, pp = 0, dd = 0;
    for (let j = 0; j < N; j++) {
      const k = (j + 1) * Math.PI;
      uu += s.eta[j] * Math.cos(k * x); pp -= (s.vel[j] / k) * Math.sin(k * x); dd -= (s.vel[j] / (k * k)) * Math.cos(k * x);
    }
    u[i] = uu; p[i] = pp; xi[i] = dd; pm = Math.max(pm, Math.abs(pp)); um = Math.max(um, Math.abs(uu));
  }
  const sc = s.scale; // shared amplitude scale (smoothed by the caller)
  // glass
  ctx.strokeStyle = 'rgba(200,225,255,0.55)'; ctx.lineWidth = 2;
  line(ctx, [[tx - tw / 2, top], [tx - tw / 2, bot]]); line(ctx, [[tx + tw / 2, top], [tx + tw / 2, bot]]);
  ctx.lineWidth = 1;
  // gas slices: displaced by ξ, coloured by pressure
  for (let i = 0; i <= 28; i++) {
    const x = i / 28, k = Math.round(x * M), d = (0.06 * xi[k]) / Math.max(sc.xi, 1e-9), pr = p[k] / Math.max(sc.p, 1e-9);
    const y = Yx(Math.min(1, Math.max(0, x + d)));
    const c = pr > 0 ? `rgba(255,122,69,${0.25 + 0.6 * Math.min(1, pr)})` : `rgba(124,184,255,${0.25 + 0.6 * Math.min(1, -pr)})`;
    ctx.strokeStyle = c; line(ctx, [[tx - tw / 2 + 3, y], [tx + tw / 2 - 3, y]]);
  }
  // the flame: size follows the heat release
  const yf = Yx(s.xf), q = Math.max(0, s.q ?? 0.3), fl = 6 + 22 * Math.min(1.4, q);
  const g = ctx.createRadialGradient(tx, yf - fl * 0.3, 1, tx, yf - fl * 0.3, fl);
  g.addColorStop(0, 'rgba(255,240,190,0.95)'); g.addColorStop(0.35, 'rgba(255,140,60,0.75)'); g.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(tx, yf - fl * 0.3, tw * 0.32, fl, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = muted; ctx.font = FONT; ctx.textAlign = 'right';
  ctx.fillText('flame', tx - tw / 2 - 6, yf + 3);
  ctx.fillText('top', tx - tw / 2 - 6, top + 8); ctx.fillText('bottom', tx - tw / 2 - 6, bot);
  ctx.fillText(`x_f = ${(s.xf * 100).toFixed(0)} %`, tx - tw / 2 - 6, yf + 15);
  // profiles
  const px0 = tx + tw / 2 + 24, pw = w - px0 - 12;
  if (pw > 40) {
    const cx = px0 + pw / 2;
    ctx.strokeStyle = css('--grid'); line(ctx, [[cx, top], [cx, bot]]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = acc; line(ctx, Array.from({ length: M + 1 }, (_, i) => [cx + (0.45 * pw * p[i]) / Math.max(sc.p, 1e-9), Yx(i / M)]));
    ctx.strokeStyle = acc2; line(ctx, Array.from({ length: M + 1 }, (_, i) => [cx + (0.45 * pw * u[i]) / Math.max(sc.u, 1e-9), Yx(i / M)]));
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]); ctx.strokeStyle = muted; line(ctx, [[px0, yf], [px0 + pw, yf]]); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.fillStyle = acc; ctx.fillText('pressure p′', px0, top + 2);
    ctx.fillStyle = acc2; ctx.fillText('velocity u′', px0 + 70, top + 2);
  }
  ctx.fillStyle = text; ctx.textAlign = 'left';
  if (s.label) ctx.fillText(s.label, 6, h - 4);
  return { pm, um, xm: Math.max(...xi.map(Math.abs)) };
}

// The model's predicted limit cycle at gain beta, as mode amplitudes η_j, η̇_j at phase θ.
export function orbitState(sys, pt, theta, eta, vel) {
  eta.fill(0); vel.fill(0);
  for (let j = 0; j < sys.N; j++) {
    for (let k = 1; k < pt.Hq.length; k++) {
      const a = modeAmp(sys, j, k, pt.W, pt.beta, pt.Hq[k]), c = Math.cos(k * theta), sn = Math.sin(k * theta);
      eta[j] += 2 * (a[0] * c - a[1] * sn);
      vel[j] += -2 * k * pt.W * (a[0] * sn + a[1] * c);
    }
  }
}

// ---- phase portrait of mode 1 ----------------------------------------------------
// trail: ring of (η₁, η̇₁/W) pairs, newest at ti; rings: [{ r, stable }] predicted cycles.
export function drawPhase(cv, s) {
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const acc = css('--accent'), muted = css('--muted'), text = css('--text');
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, k = R / Math.max(s.scale, 1e-6);
  ctx.strokeStyle = css('--grid'); line(ctx, [[cx - R * 1.15, cy], [cx + R * 1.15, cy]]); line(ctx, [[cx, cy - R * 1.15], [cx, cy + R * 1.15]]);
  ctx.font = FONT; ctx.fillStyle = muted; ctx.textAlign = 'left';
  ctx.fillText('η₁', cx + R * 1.1 - 10, cy - 4); ctx.fillText('η̇₁ / ω', cx + 4, cy - R * 1.1 + 8);
  for (const r of s.rings) {
    ctx.strokeStyle = r.stable ? acc : css('--warn'); ctx.setLineDash(r.stable ? [] : [5, 4]); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5;
    dot(ctx, cx, cy, Math.min(r.r * k, R * 1.3), false);
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
  const t = s.trail, n = t.length / 2;
  if (s.live) {
    ctx.strokeStyle = text;
    for (let seg = 0; seg < 8; seg++) {
      ctx.globalAlpha = 0.1 + 0.11 * seg;
      ctx.beginPath();
      for (let i = 0; i <= n / 8; i++) {
        const idx = ((s.ti / 2 + seg * (n / 8) + i) % n) * 2, X = cx + k * t[idx], Y = cy - k * t[idx + 1];
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = text; ctx.textAlign = 'left';
  (s.lines || []).forEach((l, i) => ctx.fillText(l, 6, 12 + 13 * i));
}
