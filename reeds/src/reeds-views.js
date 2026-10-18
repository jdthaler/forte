// reeds-views.js — the slow-motion reed and slot, and the pickup's C(y).

import { fit, css, animate } from '../../shared/views.js';
import { capAt, SLOT_GEOM, PICKUP } from './reeds-data.js';
import { makeSlot, placeReed, relax } from './slot-field.js';

const mmFmt = (v) => `${v.toFixed(2)} mm`;

// ---------------------------------------------------------------------------
// Side view of the reed, hammer and comb, and the slot end-on with its field.
export class MotionView {
  constructor(canvas) {
    this.cv = canvas; this.D = null; this.yNow = null; this.slot = null; this.img = null;
    this.t0 = performance.now();
    animate(() => this.draw(), canvas);
  }

  // trace: from traceStrike (with frames); model: keyModel(); P: parameters; T: capCurve()
  set(trace, model, P, T) {
    const { N, q, nFrames } = trace, nx = 64, L = model.info.L;
    const xs = Float64Array.from({ length: nx }, (_, i) => (L * i) / (nx - 1));
    const phi = [];
    for (let j = 0; j < N; j++) phi.push(Float64Array.from(xs, (x) => model.reed.shape(j, x)));
    let maxW = 1e-6, etaRel = 0;
    for (let f = 0; f < nFrames; f += 2) {
      let w = 0;
      for (let j = 0; j < N; j++) w += phi[j][nx - 1] * q[f * N + j];
      maxW = Math.max(maxW, Math.abs(w));
      if (Number.isFinite(trace.eta[f])) etaRel = trace.eta[f];
    }
    this.D = { trace, model, P, xs, phi, maxW, nx, etaRel, f0: model.info.f0 };
    this.cap = T;
    this.t0 = performance.now();
    this.setGap(P.gap);
  }
  setGap(gapMM) {
    if (this.slot && this.slot.gapMM === gapMM) return;
    const dx = 0.05e-3, g = Math.max(dx, Math.round((gapMM * 1e-3) / dx) * dx);
    this.slot = makeSlot({ ...SLOT_GEOM, g, tooth: 2.6e-3, H: 2.6e-3 }, dx);
    this.slot.gapMM = gapMM;
    this.img = null;
  }
  replay() { this.t0 = performance.now(); }

  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const D = this.D, muted = css('--muted');
    if (!D) {
      ctx.fillStyle = muted; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Play a note to see the reed swing through the pickup', w / 2, h / 2);
      return;
    }
    const { trace, model, P, xs, phi, nx, f0 } = D, info = model.info, N = trace.N;
    // slow motion: one period of the fundamental takes ~1.3 s; loop the recorded frames
    const span = trace.nFrames / trace.fs2, wall = span * f0 * 1.3 + 0.8;
    const tw = ((performance.now() - this.t0) / 1000) % wall, tSim = Math.min(span, tw / (1.3 * f0));
    const fi = Math.min(trace.nFrames - 1, Math.floor(tSim * trace.fs2));
    const disp = new Float64Array(nx);
    for (let j = 0; j < N; j++) { const qj = trace.q[fi * N + j]; for (let i = 0; i < nx; i++) disp[i] += phi[j][i] * qj; }
    const yPick = (() => { let s = 0; for (let j = 0; j < N; j++) s += model.reed.shape(j, info.xp) * trace.q[fi * N + j]; return s; })();
    this.yNow = yPick;

    // ---- side view (left) ----
    const y0 = P.offset * 1e-3, t = SLOT_GEOM.t, wl = Math.max(160, w * 0.6);
    const xb = 38, Lpx = wl - xb - 40, sx = Lpx / info.L;
    const reach = Math.max(D.maxW, Math.abs(y0) + t / 2) * 1.15;
    const sy = (h * 0.36) / reach, yc = h * 0.52;
    const X = (x) => xb + x * sx, Y = (d) => yc - d * sy;
    ctx.strokeStyle = 'rgba(200,204,212,0.22)'; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(xb, yc); ctx.lineTo(X(info.L) + 8, yc); ctx.stroke(); ctx.setLineDash([]);
    // comb (both teeth beside the tip; drawn as a band at its true height)
    const xc0 = X(info.L - PICKUP.ell), xc1 = X(info.L) + 10;
    ctx.fillStyle = 'rgba(232,160,200,0.22)'; ctx.strokeStyle = css('--accent');
    ctx.fillRect(xc0, Y(-y0 + t / 2), xc1 - xc0, Math.max(2, t * sy)); ctx.strokeRect(xc0, Y(-y0 + t / 2), xc1 - xc0, Math.max(2, t * sy));
    // clamp
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(xb - 30, yc - 34, 30, 68);
    ctx.fillStyle = '#55555f'; ctx.fillRect(xb - 30, yc - 6, 30, 12);
    // reed
    ctx.strokeStyle = css('--steel'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < nx; i++) { const px = X(xs[i]), py = Y(disp[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke(); ctx.lineWidth = 1;
    // solder blob (true aspect)
    const a = Math.max(3, info.blobSide * sx), tipY = Y(disp[nx - 1]);
    ctx.fillStyle = css('--solder');
    ctx.beginPath(); ctx.ellipse(X(info.L) - a / 2 - 2, tipY - a * 0.45, a / 2, a * 0.42, 0, 0, 2 * Math.PI); ctx.fill();
    // hammer (felt on a wooden shank); after it leaves, it falls away
    const xh = X(info.xh), eta = trace.eta[fi];
    const fall = Math.min(1, Math.max(0, tSim - trace.release / trace.fs2) * f0 * 0.6);
    const top = Number.isFinite(eta) ? Y(eta) + 2 : Y(D.etaRel) + 2 + fall * 0.3 * h;
    if (top < h) {
      ctx.fillStyle = '#6b5440'; ctx.fillRect(xh - 4, top + 9, 8, h - top);
      ctx.fillStyle = css('--felt'); ctx.fillRect(xh - 9, top, 18, 10);
    }
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textAlign = 'left';
    ctx.fillText(`t = ${(tSim * 1000).toFixed(2)} ms · height ×${(sy / sx).toFixed(0)}`, 8, 14);
    ctx.fillText(`reed ${(info.L * 1000).toFixed(1)} mm · solder ${(info.M * 1000).toFixed(info.M < 1e-4 ? 3 : 2)} g`, 8, 28);
    ctx.textAlign = 'center';
    ctx.fillText('comb', (xc0 + xc1) / 2, Y(-y0 - t / 2) + 13);
    ctx.fillText('hammer', xh, h - 4);

    // ---- slot, end-on (right) ----
    const S = this.slot, x0 = wl + 10, pw = w - x0 - 8;
    if (pw < 60 || !S) return;
    placeReed(S, y0 + yPick);
    relax(S, 6);
    const W = 2 * S.nx - 1, H = S.ny;
    if (!this.img || this.img.width !== W || this.img.height !== H) {
      this.oc = document.createElement('canvas'); this.oc.width = W; this.oc.height = H;
      this.octx = this.oc.getContext('2d'); this.img = this.octx.createImageData(W, H);
    }
    const px = this.img.data, acc = [232, 160, 200], bg = [26, 26, 30], steel = [200, 204, 212];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const ii = Math.abs(i - (S.nx - 1)), k = (H - 1 - j) * S.nx + ii, kd = S.kind[k], p = 4 * (j * W + i);
      if (kd === 1 || kd === 2) { const c = kd === 1 ? steel : acc; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; }
      else { // potential as colour, with an equipotential every tenth of the comb voltage
        const v = S.phi[k], band = 0.82 + 0.18 * Math.cos(2 * Math.PI * 10 * v), m = 0.75 * v;
        px[p] = (bg[0] + (acc[0] - bg[0]) * m) * band; px[p + 1] = (bg[1] + (acc[1] - bg[1]) * m) * band; px[p + 2] = (bg[2] + (acc[2] - bg[2]) * m) * band;
      }
      px[p + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);
    const sc = Math.min(pw / W, (h - 30) / H), dw = W * sc, dh = H * sc, ox = x0 + (pw - dw) / 2, oy = 18;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.oc, ox, oy, dw, dh);
    ctx.strokeStyle = css('--line'); ctx.strokeRect(ox, oy, dw, dh);
    const T = this.cap, cNow = T ? capAt(T, y0 + yPick).C : NaN;
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText(`slot end-on · gap ${mmFmt(P.gap)}`, ox + dw / 2, 12);
    if (Number.isFinite(cNow)) { ctx.fillStyle = css('--text'); ctx.fillText(`C = ${(cNow * 1e12).toFixed(3)} pF`, ox + dw / 2, oy + dh + 12); }
  }
}

// ---------------------------------------------------------------------------
// C(y) with the swing band, and the comb voltage it makes.
export class PickupView {
  constructor(canvas, motion) {
    this.cv = canvas; this.motion = motion; this.D = null;
    animate(() => this.draw(), canvas);
  }
  set(d) { this.D = d; } // { T, y0, trace, f0 }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const D = this.D;
    if (!D) return;
    const muted = css('--muted'), grid = css('--grid'), accent = css('--accent'), acc2 = css('--accent-2');
    const { T, y0 } = D, span = 3e-3, pad = 10, top = 16, mid = h * 0.6, bot = h - 4;
    const X = (y) => pad + ((w - 2 * pad) * (y + span)) / (2 * span);
    let cMax = 0;
    for (let k = 0; k < T.n; k++) cMax = Math.max(cMax, T.c[k]);
    const Yc = (c) => mid - 12 - ((mid - 12 - top) * c) / (1.05 * cMax);
    // swing band of this strike (first 60 ms)
    if (D.trace) {
      const { y, fs2 } = D.trace;
      let lo = 0, hi = 0;
      for (let s = 0; s < Math.min(y.length, 0.06 * fs2); s++) { if (y[s] < lo) lo = y[s]; if (y[s] > hi) hi = y[s]; }
      ctx.fillStyle = 'rgba(124,198,216,0.16)';
      ctx.fillRect(X(y0 + lo), top, Math.max(2, X(y0 + hi) - X(y0 + lo)), mid - 12 - top);
    }
    ctx.strokeStyle = grid;
    for (const mm of [-3, -2, -1, 0, 1, 2, 3]) { ctx.beginPath(); ctx.moveTo(X(mm * 1e-3), top); ctx.lineTo(X(mm * 1e-3), mid - 12); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(pad, Yc(0)); ctx.lineTo(w - pad, Yc(0)); ctx.stroke();
    // comb thickness (where the reed is level with the comb)
    ctx.fillStyle = 'rgba(232,160,200,0.07)';
    ctx.fillRect(X(-SLOT_GEOM.t / 2), top, X(SLOT_GEOM.t / 2) - X(-SLOT_GEOM.t / 2), mid - 12 - top);
    // C(y) and its slope
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
    let sMax = 0;
    for (let i = 0; i <= 240; i++) sMax = Math.max(sMax, Math.abs(capAt(T, -span + (2 * span * i) / 240).dC));
    for (let i = 0; i <= 240; i++) { const yy = -span + (2 * span * i) / 240, c = capAt(T, yy).C; if (i) ctx.lineTo(X(yy), Yc(c)); else ctx.moveTo(X(yy), Yc(c)); }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(232,160,200,0.45)'; ctx.setLineDash([3, 3]); ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const yy = -span + (2 * span * i) / 240, s = capAt(T, yy).dC / sMax;
      const py = (top + mid - 12) / 2 - 0.42 * (mid - 12 - top) * s;
      if (i) ctx.lineTo(X(yy), py); else ctx.moveTo(X(yy), py);
    }
    ctx.stroke(); ctx.setLineDash([]);
    // rest height and the reed's position now (from the slow-motion view)
    ctx.strokeStyle = acc2; ctx.beginPath(); ctx.moveTo(X(y0), top); ctx.lineTo(X(y0), mid - 12); ctx.stroke();
    if (this.motion.yNow !== null && this.motion.D) {
      const yy = y0 + this.motion.yNow;
      ctx.fillStyle = css('--text'); ctx.beginPath(); ctx.arc(X(yy), Yc(capAt(T, yy).C), 4, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = muted; ctx.textAlign = 'center';
    for (const mm of [-3, -2, -1, 0, 1, 2, 3]) ctx.fillText(`${mm} mm`, X(mm * 1e-3), mid - 1);
    ctx.textAlign = 'left';
    ctx.fillText(`C(y), peak ${(cMax * 1e12).toFixed(3)} pF`, pad + 2, top - 4);
    ctx.fillStyle = 'rgba(232,160,200,0.8)'; ctx.fillText('dC/dy (dashed)', pad + 140, top - 4);
    // comb voltage, a few periods after the hammer has left
    if (D.trace) {
      const { volt, fs2, release } = D.trace, per = fs2 / D.f0;
      const a = Math.min(volt.length - 1, Math.max(release + 1, Math.round(0.02 * fs2))), n = Math.min(volt.length - a, Math.round(3 * per));
      let mx = 1e-12;
      for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(volt[a + i]));
      const yz = (mid + 10 + bot) / 2, amp = (bot - mid - 14) / 2;
      ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, yz); ctx.lineTo(w - pad, yz); ctx.stroke();
      ctx.strokeStyle = acc2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const px = pad + ((w - 2 * pad) * i) / (n - 1), py = yz - (amp * volt[a + i]) / mx; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText(`comb voltage (AC), ±${(mx * 1000).toFixed(1)} mV, 3 periods`, pad + 2, mid + 12);
    }
  }
}
