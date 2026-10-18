// viz.js — canvases: slow-motion string, partial spectrum, cross-section.

import { shapeMatrix } from './materials.js';

export const FAMILY = [
  { name: 'bending, axis 1', short: 'axis 1', color: '#5aa9ff' },
  { name: 'bending, axis 2', short: 'axis 2', color: '#ffa94d' },
  { name: 'torsion', short: 'torsion', color: '#3ddc97' },
];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function fitCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  const W = Math.round(w * dpr), H = Math.round(h * dpr); // integers, or the bitmap is reset every frame
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(W / w, 0, 0, H / h, 0, 0);
  return { ctx, w, h };
}

// ---------------------------------------------------------------------------
// Slow motion: the first few ms after the strike, reconstructed from modes.

export class MotionView {
  constructor(canvas) {
    this.cv = canvas;
    this.data = null;
    this.speed = 1 / 300;
    this.t0 = performance.now();
    this.paused = false;
    const loop = () => { requestAnimationFrame(loop); if (this.cv.offsetParent) this.draw(); }; // skip while hidden
    requestAnimationFrame(loop);
  }

  // sim: { frames: [Float64Array], eta: Float64Array, dt, model, data, P }
  set(sim) {
    const { model, data } = sim;
    const nx = 160, L = model.L;
    const xs = Float64Array.from({ length: nx }, (_, i) => (L * i) / (nx - 1));
    const sub = [];
    for (let j = 0; j < data.n; j++) if (data.uni[j] === 0) sub.push(j);
    const shapeCache = new Map();
    const shapeOf = (f) => {
      if (!shapeCache.has(f)) shapeCache.set(f, shapeMatrix(model.families[f], L, xs));
      return shapeCache.get(f);
    };
    const psi = (sim.P.roll * Math.PI) / 180;
    const rows = sub.map((j) => {
      const f = data.famId[j], n = data.idx[j];
      const S = shapeOf(f).subarray(n * nx, (n + 1) * nx);
      const dv = f === 0 ? Math.cos(psi) : f === 1 ? -Math.sin(psi) : 0;
      const dh = f === 0 ? Math.sin(psi) : f === 1 ? Math.cos(psi) : 0;
      return { j, S, dv, dh, tor: f === 2 };
    });
    // global scales
    let maxU = 1e-12, maxT = 0;
    const tmpV = new Float64Array(nx), tmpH = new Float64Array(nx), tmpT = new Float64Array(nx);
    for (let fi = 0; fi < sim.frames.length; fi += 3) {
      this.reconstruct(rows, sim.frames[fi], nx, tmpV, tmpH, tmpT);
      for (let i = 0; i < nx; i++) {
        maxU = Math.max(maxU, Math.abs(tmpV[i]), Math.abs(tmpH[i]));
        maxT = Math.max(maxT, Math.abs(tmpT[i]));
      }
    }
    const w0 = model.sec.w;
    const widthProf = Float64Array.from(xs, (x) => model.secAt(x).w / w0);
    this.data = { ...sim, xs, nx, rows, maxU, maxT, psi, widthProf, uV: tmpV, uH: tmpH, th: tmpT };
    this.t0 = performance.now();
  }

  reconstruct(rows, q, nx, uV, uH, th) {
    uV.fill(0); uH.fill(0); th.fill(0);
    for (const r of rows) {
      const a = q[r.j];
      if (a === 0) continue;
      const S = r.S;
      if (r.tor) { for (let i = 0; i < nx; i++) th[i] += a * S[i]; continue; }
      const av = a * r.dv, ah = a * r.dh;
      if (av !== 0) for (let i = 0; i < nx; i++) uV[i] += av * S[i];
      if (ah !== 0) for (let i = 0; i < nx; i++) uH[i] += ah * S[i];
    }
  }

  replay() { this.t0 = performance.now(); }

  draw() {
    const { ctx, w, h } = fitCanvas(this.cv);
    ctx.clearRect(0, 0, w, h);
    const D = this.data;
    const muted = css('--muted') || '#8b93a7';
    if (!D) {
      ctx.fillStyle = muted;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Play a note to see the string move in slow motion', w / 2, h / 2);
      return;
    }
    const total = D.frames.length * D.dt;          // seconds of simulated time
    const wall = (performance.now() - this.t0) / 1000;
    const loopLen = total / this.speed + 0.8;
    const tw = wall % loopLen;
    const tSim = Math.min(total, tw * this.speed);
    const fi = Math.min(D.frames.length - 1, Math.floor(tSim / D.dt));
    const { nx, rows, uV, uH, th, xs, psi } = D;
    this.reconstruct(rows, D.frames[fi], nx, uV, uH, th);

    const padL = 56, padR = 56;
    const x0 = padL, x1 = w - padR, y0 = h * 0.56;
    const sx = (x1 - x0) / D.model.L;
    const sy = (h * 0.26) / D.maxU;
    const depth = { x: 0.42, y: -0.62 };
    const shape = D.P.shape;
    const hw = shape === 'ribbon' ? Math.min(30, 6 + 1.6 * Math.sqrt(D.P.aspect) * 3) : shape === 'round' ? 0 : 6;
    const twist = D.maxT > 1e-9 ? Math.min(1.1 / D.maxT, 1e9) : 0;

    // rest line, posts
    ctx.strokeStyle = 'rgba(140,150,170,0.35)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(160,165,180,0.55)';
    ctx.fillRect(x0 - 6, y0 - 4, 6, 40);
    ctx.fillRect(x1, y0 - 4, 6, 40);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('agraffe', x0 - 3, y0 + 52);
    ctx.fillText('bridge', x1 + 3, y0 + 52);

    const P3 = (X, Y, Z) => [X + Z * depth.x, y0 - Y + Z * depth.y];

    // hammer (drawn first, string on top)
    const xh = x0 + D.model.xh * sx;
    const wh = Math.max(6, D.model.wH * sx);
    const etaY = D.eta[fi] * sy;
    const top = y0 - etaY + 2;
    if (top < h + 40) {
      ctx.fillStyle = '#d8c7a0';
      ctx.strokeStyle = '#8a7a58';
      const ht = 34;
      roundRect(ctx, xh - wh / 2, top, wh, ht, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b5a3c';
      ctx.fillRect(xh - 2, top + ht, 4, 40);
    }

    if (hw === 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = FAMILY[0].color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < nx; i++) {
        const [px, py] = P3(x0 + xs[i] * sx, uV[i] * sy, uH[i] * sy);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    } else {
      // ribbon band; shade by how its face is turned toward the light
      const wp = D.widthProf;
      const edge = (i, sgn) => {
        const ph = psi + th[i] * twist, hwi = hw * wp[i];
        return P3(x0 + xs[i] * sx, uV[i] * sy + sgn * hwi * Math.sin(ph), uH[i] * sy + sgn * hwi * Math.cos(ph));
      };
      for (let i = 0; i < nx - 1; i++) {
        const a = edge(i, 1), b = edge(i + 1, 1), c = edge(i + 1, -1), d = edge(i, -1);
        const ph = psi + 0.5 * (th[i] + th[i + 1]) * twist;
        const lit = 0.3 + 0.7 * Math.abs(Math.cos(ph - 0.35));
        const tors = Math.min(1, Math.abs(th[i]) * twist);
        const r = Math.round(90 * lit * (1 - tors) + 61 * tors * lit);
        const g = Math.round(169 * lit * (1 - tors) + 220 * tors * lit);
        const bl = Math.round(255 * lit * (1 - tors) + 151 * tors * lit);
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // labels
    ctx.textAlign = 'left';
    ctx.fillStyle = css('--text') || '#e6e8ee';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`t = ${(tSim * 1000).toFixed(2)} ms`, 12, 20);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = muted;
    const ex = sy / sx;
    let line = `displacement ×${ex.toFixed(0)}  ·  peak ${(D.maxU * 1000).toFixed(2)} mm`;
    if (D.maxT > 1e-9 && hw) line += `  ·  twist ×${twist.toFixed(0)}  ·  peak ${(D.maxT * 180 / Math.PI).toFixed(2)}°`;
    ctx.fillText(line, 12, 36);
    ctx.textAlign = 'right';
    ctx.fillText(`${D.title}`, w - 12, 20);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Partials: stems from the model (+ live FFT), or inharmonicity in cents.

export class SpectrumView {
  constructor(canvas) {
    this.cv = canvas;
    this.mode = 'spectrum';
    this.partials = null;
    this.analyser = null;
    this.fft = null;
    const loop = () => { requestAnimationFrame(loop); if (this.cv.offsetParent) this.draw(); }; // skip while hidden
    requestAnimationFrame(loop);
  }

  setAnalyser(a) { this.analyser = a; this.fft = new Float32Array(a.frequencyBinCount); }

  // partials: { f0, list: [{f, db, fam, n}], families: [{fam, f: [..]}] }
  set(p) { this.partials = p; }

  draw() {
    const { ctx, w, h } = fitCanvas(this.cv);
    ctx.clearRect(0, 0, w, h);
    if (this.mode === 'spectrum') this.drawSpectrum(ctx, w, h);
    else this.drawInharm(ctx, w, h);
  }

  drawSpectrum(ctx, w, h) {
    const padL = 38, padR = 10, padT = 10, padB = 24;
    const fLo = 20, fHi = 20000;
    const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
    const Y = (db) => padT + ((h - padT - padB) * -db) / 90;
    const muted = css('--muted'), grid = css('--grid');
    ctx.font = '10px system-ui, sans-serif';
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 8);
    }
    ctx.textAlign = 'right';
    for (let db = 0; db >= -90; db -= 30) {
      ctx.beginPath(); ctx.moveTo(padL, Y(db)); ctx.lineTo(w - padR, Y(db)); ctx.stroke();
      ctx.fillText(`${db}`, padL - 4, Y(db) + 3);
    }
    const P = this.partials;
    if (P) {
      ctx.strokeStyle = 'rgba(200,200,220,0.13)';
      for (let n = 1; n * P.f0 < fHi && n <= 64; n++) {
        ctx.beginPath(); ctx.moveTo(X(n * P.f0), padT); ctx.lineTo(X(n * P.f0), h - padB); ctx.stroke();
      }
    }
    // live FFT
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.fft);
      const fs = this.analyser.context.sampleRate, N = this.fft.length;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < N; i++) {
        const f = (i * fs) / (2 * N);
        if (f < fLo || f > fHi) continue;
        const db = Math.max(-90, Math.min(0, this.fft[i] + 10));
        const px = X(f), py = Y(db);
        if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
      }
      ctx.strokeStyle = 'rgba(230,232,238,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (P) {
      ctx.lineWidth = 2;
      for (const p of P.list) {
        if (p.db < -90 || p.f < fLo || p.f > fHi) continue;
        ctx.strokeStyle = FAMILY[p.fam].color;
        ctx.beginPath(); ctx.moveTo(X(p.f), Y(-90)); ctx.lineTo(X(p.f), Y(p.db)); ctx.stroke();
        ctx.fillStyle = FAMILY[p.fam].color;
        ctx.beginPath(); ctx.arc(X(p.f), Y(p.db), 2.2, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }

  drawInharm(ctx, w, h) {
    const P = this.partials;
    const padL = 46, padR = 10, padT = 22, padB = 24;
    const muted = css('--muted'), grid = css('--grid');
    ctx.font = '10px system-ui, sans-serif';
    if (!P) return;
    const nMax = 32;
    let lo = -5, hi = 5;
    const pts = [];
    for (const fam of P.families) {
      const f1 = fam.f[0];
      for (let n = 1; n <= Math.min(nMax, fam.f.length); n++) {
        const c = 1200 * Math.log2(fam.f[n - 1] / (n * f1));
        pts.push({ n, c, fam: fam.fam });
        lo = Math.min(lo, c); hi = Math.max(hi, c);
      }
    }
    const span = hi - lo;
    lo -= 0.08 * span; hi += 0.08 * span;
    const X = (n) => padL + ((w - padL - padR) * (n - 0.5)) / nMax;
    const Y = (c) => padT + ((h - padT - padB) * (hi - c)) / (hi - lo);
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'right';
    const step = niceStep((hi - lo) / 5);
    for (let c = Math.ceil(lo / step) * step; c <= hi; c += step) {
      ctx.beginPath(); ctx.moveTo(padL, Y(c)); ctx.lineTo(w - padR, Y(c)); ctx.stroke();
      ctx.fillText(`${c.toFixed(step < 1 ? 1 : 0)}¢`, padL - 4, Y(c) + 3);
    }
    ctx.textAlign = 'center';
    for (let n = 1; n <= nMax; n += n < 4 ? 1 : 4) ctx.fillText(`${n}`, X(n), h - 8);
    ctx.strokeStyle = 'rgba(230,232,238,0.4)';
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
    for (const fam of P.families) {
      ctx.strokeStyle = FAMILY[fam.fam].color;
      ctx.fillStyle = FAMILY[fam.fam].color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const f1 = fam.f[0];
      const nn = Math.min(nMax, fam.f.length);
      for (let n = 1; n <= nn; n++) {
        const c = 1200 * Math.log2(fam.f[n - 1] / (n * f1));
        if (n === 1) ctx.moveTo(X(n), Y(c)); else ctx.lineTo(X(n), Y(c));
      }
      ctx.stroke();
      for (let n = 1; n <= nn; n++) {
        const c = 1200 * Math.log2(fam.f[n - 1] / (n * f1));
        ctx.beginPath(); ctx.arc(X(n), Y(c), 2.4, 0, 2 * Math.PI); ctx.fill();
      }
    }
  }
}

function niceStep(x) {
  const p = 10 ** Math.floor(Math.log10(x)), m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// ---------------------------------------------------------------------------
// Cross-section (as the hammer sees it) and planform (top view).

export function drawSection(canvas, model, P) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const muted = css('--muted'), text = css('--text');
  const tapered = !model.info.uniform;
  const sec = tapered ? model.secAt(model.xh) : model.sec; // the section the hammer meets
  const psi = (P.roll * Math.PI) / 180;

  // left: cross-section
  const cw = Math.min(h, w * 0.38), cx = cw / 2 + 4, cy = h * 0.46;
  const size = Math.max(sec.w, sec.t, 1e-9);
  const sc = (cw * 0.48) / size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#5aa9ff';
  ctx.strokeStyle = '#a9d0ff';
  ctx.lineWidth = 1;
  ctx.rotate(-psi);
  ctx.beginPath();
  if (P.shape === 'round') ctx.arc(0, 0, sec.half * sc, 0, 2 * Math.PI);
  else if (P.shape === 'triangle') {
    const s = sec.w * sc, hgt = (Math.sqrt(3) / 2) * s;
    // flat face toward the hammer (below), centroid at origin
    ctx.moveTo(-s / 2, hgt / 3); ctx.lineTo(s / 2, hgt / 3); ctx.lineTo(0, (-2 * hgt) / 3); ctx.closePath();
  } else ctx.rect((-sec.w * sc) / 2, (-sec.t * sc) / 2, sec.w * sc, sec.t * sc);
  ctx.fill(); ctx.stroke();
  if (P.shape === 'ribbon') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, -cw * 0.3); ctx.lineTo(0, cw * 0.3); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  // hammer arrow from below at the strike offset
  const off = (P.offset || 0) * sec.lever * sc;
  ctx.strokeStyle = '#d8c7a0'; ctx.fillStyle = '#d8c7a0'; ctx.lineWidth = 2;
  const ay = cy + cw * 0.42;
  ctx.beginPath(); ctx.moveTo(cx + off, ay); ctx.lineTo(cx + off, cy + Math.max(sec.t, sec.w * Math.abs(Math.sin(psi))) * sc * 0.5 + 6); ctx.stroke();
  ctx.beginPath();
  const tipY = cy + Math.max(sec.t, sec.w * Math.abs(Math.sin(psi))) * sc * 0.5 + 4;
  ctx.moveTo(cx + off, tipY); ctx.lineTo(cx + off - 5, tipY + 9); ctx.lineTo(cx + off + 5, tipY + 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('hammer', cx + off, ay + 12);
  ctx.fillText(`${(sec.w * 1000).toFixed(2)} × ${(sec.t * 1000).toFixed(2)} mm${tapered ? ' at hammer' : ''}`, cx, 12);

  // right: planform (top view)
  const px0 = cw + 26, px1 = w - 12, py = h * 0.5;
  const L = model.L, sx = (px1 - px0) / L;
  const nx = 60;
  const maxW = Math.max(...Array.from({ length: nx }, (_, i) => model.secAt((L * i) / (nx - 1)).w));
  const sw = (h * 0.28) / maxW;
  ctx.fillStyle = 'rgba(90,169,255,0.75)';
  ctx.beginPath();
  for (let i = 0; i < nx; i++) {
    const x = (L * i) / (nx - 1);
    const ww = P.shape === 'round' ? Math.max(2 / sw, model.secAt(x).w) : model.secAt(x).w;
    const X = px0 + x * sx, Y = py - (ww * sw) / 2;
    if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
  }
  for (let i = nx - 1; i >= 0; i--) {
    const x = (L * i) / (nx - 1);
    const ww = P.shape === 'round' ? Math.max(2 / sw, model.secAt(x).w) : model.secAt(x).w;
    ctx.lineTo(px0 + x * sx, py + (ww * sw) / 2);
  }
  ctx.closePath(); ctx.fill();
  // hammer patch
  ctx.fillStyle = 'rgba(216,199,160,0.85)';
  const hx = px0 + (model.xh - model.wH / 2) * sx;
  ctx.fillRect(hx, py - h * 0.2, Math.max(2, model.wH * sx), h * 0.4);
  ctx.fillStyle = muted; ctx.textAlign = 'left';
  ctx.fillText('agraffe', px0, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText('bridge', px1, h - 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = text;
  ctx.fillText(`hammer at ${(model.xh * 100).toFixed(1)} cm`, Math.min(px1 - 40, Math.max(px0 + 40, px0 + model.xh * sx)), py - h * 0.24);
  ctx.fillStyle = muted;
  ctx.fillText(`top view (width exaggerated)`, (px0 + px1) / 2, 12);
}
