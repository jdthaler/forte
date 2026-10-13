// rhodes-viz.js — slow-motion mechanism, pickup transfer, spectrum.

import { barShape, flux } from './tine.js';

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function fit(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const MODE_COLORS = { tine: '#7cb8ff', bar: '#d4a94e', block: '#8d8d99' };
export function modeKind(md) {
  if (md.blockFrac > 0.5) return 'block';
  return md.barFrac > md.tineFrac ? 'bar' : 'tine';
}

// ---------------------------------------------------------------------------
export class MotionView {
  constructor(canvas) {
    this.cv = canvas;
    this.D = null;
    this.speed = 0.005;
    this.t0 = performance.now();
    const loop = () => { requestAnimationFrame(loop); if (this.cv.offsetParent) this.draw(); }; // skip while hidden
    requestAnimationFrame(loop);
  }

  // sim: { frames: [Float64Array], eta: Float64Array, dt, model, P, title }
  set(sim) {
    const { model } = sim;
    const { X, n, nq, iu, ip } = model.shapes;
    const L = model.info.L, nx = 80;
    const xs = Float64Array.from({ length: nx }, (_, i) => (L * i) / (nx - 1));
    const phi = [];
    for (let j = 0; j < nq; j++) phi.push(Float64Array.from(xs, (x) => model.tine.shape(j, x)));
    const cols = model.modes.map((m) => m.col);
    const recon = (q) => {
      let u = 0, p = 0;
      const qn = new Float64Array(nq);
      cols.forEach((c, k) => {
        u += X[iu * n + c] * q[k];
        p += X[ip * n + c] * q[k];
        for (let j = 0; j < nq; j++) qn[j] += X[(1 + j) * n + c] * q[k];
      });
      const w = new Float64Array(nx).fill(u);
      for (let j = 0; j < nq; j++) for (let i = 0; i < nx; i++) w[i] += phi[j][i] * qn[j];
      return { u, p, w };
    };
    let maxW = 1e-9;
    for (let f = 0; f < sim.frames.length; f += 2) {
      const r = recon(sim.frames[f]);
      for (let i = 0; i < nx; i++) maxW = Math.max(maxW, Math.abs(r.w[i]));
    }
    this.D = { ...sim, xs, recon, maxW, barNorm: 1 / Math.sqrt(model.info.Mb) };
    this.t0 = performance.now();
  }

  replay() { this.t0 = performance.now(); }

  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const D = this.D, muted = css('--muted');
    if (!D) {
      ctx.fillStyle = muted; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Play a note to see the tine and tone bar move', w / 2, h / 2);
      return;
    }
    const total = D.frames.length * D.dt;
    const tw = ((performance.now() - this.t0) / 1000) % (total / this.speed + 0.8);
    const tSim = Math.min(total, tw * this.speed);
    const fi = Math.min(D.frames.length - 1, Math.floor(tSim / D.dt));
    const { u, p, w: disp } = D.recon(D.frames[fi]);
    const info = D.model.info, pu = D.model.voice.pickup;

    // vertical scale fits the swing and the pickup's voicing offset
    const xb = 70, Lpx = Math.min(w * 0.62, w - 170);
    const sx = Lpx / info.L;
    const sy = (h * 0.5) / (2 * D.maxW + Math.abs(pu.yoff));
    const yc = h * 0.55 - (pu.yoff * sy) / 2;
    const X = (x) => xb + x * sx, Y = (d) => yc - d * sy;
    ctx.strokeStyle = 'rgba(200,204,212,0.25)'; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(xb, yc); ctx.lineTo(X(info.L) + 6, yc); ctx.stroke(); ctx.setLineDash([]);

    // harp rail + block
    ctx.fillStyle = '#2b2b33'; ctx.fillRect(xb - 58, yc - 70, 22, 130);
    ctx.fillStyle = '#5b5e66'; ctx.fillRect(xb - 36, Y(u) - 46, 36, 64);
    // tone bar (brass), above the tine, same frame
    const Lb = 0.78 * Lpx, nb = 40;
    ctx.strokeStyle = css('--brass'); ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= nb; i++) {
      const xi = i / nb, d = u + p * D.barNorm * barShape(xi);
      const yy = Y(d) - 34;
      if (i) ctx.lineTo(xb + xi * Lb, yy); else ctx.moveTo(xb, yy);
    }
    ctx.stroke();
    // tine (steel)
    ctx.strokeStyle = css('--steel'); ctx.lineWidth = 3;
    ctx.beginPath();
    D.xs.forEach((x, i) => { if (i) ctx.lineTo(X(x), Y(disp[i])); else ctx.moveTo(X(x), Y(disp[i])); });
    ctx.stroke();
    // tuning spring
    const si = Math.round((info.s / info.L) * (D.xs.length - 1));
    ctx.fillStyle = '#a7aab3';
    ctx.fillRect(X(info.s) - 5, Y(disp[si]) - 5, 10, 10);
    ctx.strokeStyle = '#6f727b'; ctx.lineWidth = 1;
    for (let k = -4; k <= 4; k += 2) { ctx.beginPath(); ctx.moveTo(X(info.s) + k, Y(disp[si]) - 5); ctx.lineTo(X(info.s) + k, Y(disp[si]) + 5); ctx.stroke(); }
    // pickup: pole axis sits at tine displacement −yoff
    // pickup (drawn at a fixed size; only its axis height is to scale)
    const tipX = X(info.L), poleY = Y(-pu.yoff);
    const glow = Math.min(h * 0.3, pu.wid * sy);
    const grd = ctx.createRadialGradient(tipX + 10, poleY, 0, tipX + 10, poleY, glow);
    grd.addColorStop(0, 'rgba(239,90,74,0.28)'); grd.addColorStop(1, 'rgba(239,90,74,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(tipX + 10, poleY, 26, glow, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#9a9ca3'; ctx.fillRect(tipX + 8, poleY - 5, 16, 10);
    ctx.fillStyle = '#3a2420'; ctx.fillRect(tipX + 24, poleY - 18, 36, 36);
    ctx.strokeStyle = css('--accent'); ctx.strokeRect(tipX + 24, poleY - 18, 36, 36);
    ctx.strokeStyle = 'rgba(239,90,74,0.5)'; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(tipX - 30, poleY); ctx.lineTo(tipX + 8, poleY); ctx.stroke(); ctx.setLineDash([]);
    // hammer
    const xh = X(info.xh), top = Y(D.eta[fi]) + 3;
    if (top < h + 30) {
      ctx.fillStyle = '#1f1f24'; ctx.fillRect(xh - 9, top + 8, 18, 34);
      ctx.fillStyle = '#5a5a63'; ctx.fillRect(xh - 9, top, 18, 9);
    }
    // labels
    ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = css('--text'); ctx.textAlign = 'left';
    ctx.fillText(`t = ${(tSim * 1000).toFixed(2)} ms`, 12, 20);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = muted;
    ctx.fillText(`vertical ×${(sy / sx).toFixed(0)} · tine ${(info.L * 1000).toFixed(1)} mm · tip swing ±${(D.maxW * 1000).toFixed(2)} mm · dashed red: pickup axis`, 12, 36);
    ctx.textAlign = 'center';
    ctx.fillText('tone bar', xb + Lb / 2, Y(0) - 50);
    ctx.fillText('pickup', tipX + 42, poleY + 32);
    ctx.textAlign = 'right';
    ctx.fillText(D.title, w - 12, 20);
  }
}

// ---------------------------------------------------------------------------
export class PickupView {
  constructor(canvas) {
    this.cv = canvas;
    this.D = null;
    const loop = () => { requestAnimationFrame(loop); if (this.cv.offsetParent) this.draw(); }; // skip while hidden
    requestAnimationFrame(loop);
  }
  set(d) { this.D = d; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const D = this.D;
    if (!D) return;
    const muted = css('--muted'), grid = css('--grid'), accent = css('--accent');
    const wid = D.wid, span = 3.2 * wid;
    const pad = 10, top = 6, mid = h * 0.6, bot = h - 4;
    const X = (Y) => pad + ((w - 2 * pad) * (Y + span)) / (2 * span);
    const Yc = (v) => mid - 8 - (mid - 8 - top) * v;
    // swing band
    const a = D.yoff + D.yMin, b = D.yoff + D.yMax;
    ctx.fillStyle = 'rgba(124,184,255,0.18)';
    ctx.fillRect(X(a), top, Math.max(2, X(b) - X(a)), mid - 8 - top);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, Yc(0)); ctx.lineTo(w - pad, Yc(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), mid - 8); ctx.stroke();
    // flux curve and its slope
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const Y = -span + (2 * span * i) / 200; const px = X(Y), py = Yc(flux(Y, wid)); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(239,90,74,0.4)'; ctx.setLineDash([3, 3]); ctx.beginPath();
    const dmax = 0.86 / wid;
    for (let i = 0; i <= 200; i++) {
      const Y = -span + (2 * span * i) / 200, s = (-3 * Y / (wid * wid)) * (1 + (Y / wid) ** 2) ** -2.5;
      const px = X(Y), py = Yc(0.5 + (0.45 * s) / dmax);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);
    // rest position
    ctx.strokeStyle = css('--accent-2'); ctx.beginPath(); ctx.moveTo(X(D.yoff), top); ctx.lineTo(X(D.yoff), mid - 8); ctx.stroke();
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textAlign = 'center';
    for (const mm of [-2, -1, 0, 1, 2]) { const Y = mm * 1e-3; if (Math.abs(Y) <= span) ctx.fillText(`${mm} mm`, X(Y), mid + 2); }
    ctx.textAlign = 'left';
    ctx.fillText('Φ(Y)', pad + 2, top + 10);
    ctx.fillStyle = 'rgba(239,90,74,0.7)'; ctx.fillText('dΦ/dY (dashed)', pad + 34, top + 10);
    // output waveform
    const wave = D.wave;
    if (wave && wave.length) {
      let mx = 1e-9;
      for (const v of wave) mx = Math.max(mx, Math.abs(v));
      const y0 = (mid + 14 + bot) / 2, amp = (bot - mid - 18) / 2;
      ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(w - pad, y0); ctx.stroke();
      ctx.strokeStyle = css('--accent-2'); ctx.beginPath();
      wave.forEach((v, i) => { const px = pad + ((w - 2 * pad) * i) / (wave.length - 1), py = y0 - (amp * v) / mx; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText('pickup output', pad + 2, mid + 22);
    }
  }
}

// ---------------------------------------------------------------------------
export class SpectrumView {
  constructor(canvas) {
    this.cv = canvas; this.analyser = null; this.modes = null; this.f0 = 0;
    const loop = () => { requestAnimationFrame(loop); if (this.cv.offsetParent) this.draw(); }; // skip while hidden
    requestAnimationFrame(loop);
  }
  setAnalyser(a) { this.analyser = a; this.fft = new Float32Array(a.frequencyBinCount); }
  set(f0, modes) { this.f0 = f0; this.modes = modes; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const muted = css('--muted'), grid = css('--grid');
    const padL = 34, padR = 8, padT = 6, padB = 18, fLo = 25, fHi = 20000;
    const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
    const Y = (d) => padT + ((h - padT - padB) * (-10 - d)) / 100;
    ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 5);
    }
    ctx.textAlign = 'right';
    for (let d = -10; d >= -110; d -= 25) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
    if (this.f0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let n = 2; n * this.f0 < fHi && n < 40; n++) { ctx.beginPath(); ctx.moveTo(X(n * this.f0), padT); ctx.lineTo(X(n * this.f0), h - padB); ctx.stroke(); }
    }
    if (this.modes) {
      for (const md of this.modes) {
        if (md.f < fLo || md.f > fHi) continue;
        ctx.strokeStyle = MODE_COLORS[modeKind(md)]; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(X(md.f), h - padB); ctx.lineTo(X(md.f), padT + 8); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
    }
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.fft);
      const fs = this.analyser.context.sampleRate, N = this.fft.length;
      ctx.beginPath();
      let st = false;
      for (let i = 1; i < N; i++) {
        const f = (i * fs) / (2 * N);
        if (f < fLo || f > fHi) continue;
        const d = Math.max(-110, Math.min(-10, this.fft[i]));
        if (st) ctx.lineTo(X(f), Y(d)); else { ctx.moveTo(X(f), Y(d)); st = true; }
      }
      ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}
