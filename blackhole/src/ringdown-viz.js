// ringdown-viz.js — QNM plane, Kerr cross-section, strain / spectrum.

function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function fit(cv) {
  const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
export const L_COLORS = { 2: '#7cc0ff', 3: '#ffb35a', 4: '#8fe38f' };

// ---------------------------------------------------------------------------
export function drawPlane(cv, bank, a, excited) {
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const muted = css('--muted'), grid = css('--grid');
  const padL = 46, padR = 10, top = 8, bot = h - 22;
  const xMax = 2.1, yMax = 0.75;
  const X = (re) => padL + ((w - padL - padR) * re) / xMax;
  const Y = (d) => top + (bot - top) * Math.sqrt(Math.max(0, d) / yMax);
  ctx.font = '10px system-ui, sans-serif';
  ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center';
  for (let x = 0; x <= 2; x += 0.5) { ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), bot); ctx.stroke(); ctx.fillText(x.toFixed(1), X(x), h - 8); }
  ctx.textAlign = 'right';
  for (const y of [0, 0.01, 0.05, 0.1, 0.2, 0.4, 0.7]) { ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(w - padR, Y(y)); ctx.stroke(); ctx.fillText(`${y}`, padL - 4, Y(y) + 3); }
  ctx.textAlign = 'left'; ctx.fillText('Re Mω  (pitch) →', X(1.55), h - 8);
  ctx.save(); ctx.translate(11, (top + bot) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('damping −Im Mω (√ scale) ↓', 0, 0); ctx.restore();
  // horizon frequency lines m·Ω_H
  const rp = 1 + Math.sqrt(1 - a * a), OmH = a / (2 * rp);
  ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(177,140,255,0.5)'; ctx.fillStyle = 'rgba(177,140,255,0.8)'; ctx.textAlign = 'center';
  for (let m = 1; m <= 4; m++) {
    if (m * OmH > xMax) break;
    ctx.beginPath(); ctx.moveTo(X(m * OmH), top); ctx.lineTo(X(m * OmH), bot); ctx.stroke();
    ctx.fillText(`${m}Ω_H`, X(m * OmH), bot - 4);
  }
  ctx.setLineDash([]);
  // trajectories
  for (const md of bank.modes) {
    ctx.strokeStyle = L_COLORS[md.l]; ctx.globalAlpha = md.n === 0 ? 0.45 : 0.2; ctx.lineWidth = md.n === 0 ? 1.2 : 0.8;
    if (md.m < 0) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < md.re.length; i++) { const px = X(md.re[i]), py = Y(Math.exp(md.lim[i])); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  // where each mode is now
  for (const md of bank.modes) {
    const o = bank.omega(md.l, md.m, md.n, a);
    ctx.fillStyle = L_COLORS[md.l]; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(X(o.re), Y(-o.im), 2, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // excited modes
  const maxA = Math.max(1e-12, ...excited.map((e) => e.level));
  for (const e of excited) {
    const o = bank.omega(e.l, e.m, e.n, a);
    const r = 3 + 9 * Math.max(0, 1 + Math.log10(e.level / maxA) / 2);
    ctx.strokeStyle = L_COLORS[e.l]; ctx.fillStyle = L_COLORS[e.l]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(o.re), Y(-o.im), r, 0, 2 * Math.PI); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.fillStyle = css('--text'); ctx.textAlign = 'left';
    ctx.fillText(`(${e.l},${e.m},${e.n})`, X(o.re) + r + 3, Y(-o.im) + (e.n ? 10 : -4));
  }
  ctx.lineWidth = 1;
}

// ---------------------------------------------------------------------------
export function drawKerr(cv, a, iotaDeg) {
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const muted = css('--muted');
  const cx = w * 0.42, cy = h / 2, sc = (h * 0.44) / 2.3;
  const curve = (rOf, close = true) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const th = (Math.PI * 2 * i) / 120, r = rOf(th);
      const x = Math.sqrt(r * r + a * a) * Math.sin(th), z = r * Math.cos(th);
      if (i) ctx.lineTo(cx + sc * x, cy - sc * z); else ctx.moveTo(cx + sc * x, cy - sc * z);
    }
    if (close) ctx.closePath();
  };
  const rp = 1 + Math.sqrt(1 - a * a), rm = 1 - Math.sqrt(1 - a * a);
  // ergosphere
  curve((th) => 1 + Math.sqrt(1 - a * a * Math.cos(th) ** 2));
  ctx.fillStyle = 'rgba(177,140,255,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(177,140,255,0.6)'; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  // outer horizon
  curve(() => rp); ctx.fillStyle = '#000'; ctx.fill(); ctx.strokeStyle = '#7d6bb8'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  // inner horizon and ring singularity
  if (rm > 1e-3) { curve(() => rm); ctx.strokeStyle = 'rgba(125,107,184,0.5)'; ctx.stroke(); }
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath(); ctx.arc(cx + sc * a, cy, 2, 0, 2 * Math.PI); ctx.arc(cx - sc * a, cy, 2, 0, 2 * Math.PI); ctx.fill();
  // spin axis
  ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(cx, cy + sc * 2.3); ctx.lineTo(cx, cy - sc * 2.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - sc * 2.3); ctx.lineTo(cx - 4, cy - sc * 2.3 + 8); ctx.lineTo(cx + 4, cy - sc * 2.3 + 8); ctx.closePath(); ctx.fillStyle = muted; ctx.fill();
  // observer direction
  const io = (iotaDeg * Math.PI) / 180, L = sc * 2.6;
  ctx.strokeStyle = css('--accent-2'); ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L * Math.sin(io), cy - L * Math.cos(io)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--accent-2'); ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('you', cx + L * Math.sin(io) + 4, cy - L * Math.cos(io));
  ctx.fillStyle = muted; ctx.font = '10px system-ui, sans-serif';
  const lx = w * 0.72;
  ctx.fillText('— horizon r₊', lx, 18);
  ctx.fillStyle = 'rgba(177,140,255,0.9)'; ctx.fillText('- - ergosphere', lx, 32);
  ctx.fillStyle = '#ff6b6b'; ctx.fillText('• ring singularity', lx, 46);
  ctx.fillStyle = muted; ctx.fillText('↑ spin axis', lx, 60);
}

// ---------------------------------------------------------------------------
export class WaveView {
  constructor(cv) { this.cv = cv; this.mode = 'wave'; this.d = null; }
  set(d) { this.d = d; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const d = this.d, muted = css('--muted'), grid = css('--grid');
    ctx.font = '10px system-ui, sans-serif';
    if (!d) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('Play a key', w / 2, h / 2); return; }
    const padL = 40, padR = 10, top = 8, bot = h - 18;
    if (this.mode === 'wave') {
      const n = d.hp.length, T = (n / d.fs) * 1000;
      let mx = 1e-12;
      for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(d.hp[i]), Math.abs(d.hx[i]));
      const X = (i) => padL + ((w - padL - padR) * i) / (n - 1), Y = (v) => (top + bot) / 2 - (((bot - top) / 2) * 0.95 * v) / mx;
      ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
      const step = Math.max(1, Math.floor(n / (2 * (w - padL))));
      for (const [arr, col] of [[d.hx, css('--cross')], [d.hp, css('--plus')]]) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let i = 0; i < n; i += step) { if (i) ctx.lineTo(X(i), Y(arr[i])); else ctx.moveTo(X(i), Y(arr[i])); }
        ctx.stroke();
      }
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      for (let k = 0; k <= 4; k++) ctx.fillText(`${((T * k) / 4).toFixed(T < 20 ? 1 : 0)} ms`, X(((n - 1) * k) / 4), h - 4);
    } else {
      // Lorentzian lines: |Σ C₊/(γ + 2πi(f − f_n))|
      const fLo = 20, fHi = Math.min(20000, d.fs / 2);
      const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
      const N = 600, vals = new Float64Array(N);
      let mx = -Infinity;
      for (let i = 0; i < N; i++) {
        const f = fLo * (fHi / fLo) ** (i / (N - 1));
        let re = 0, im = 0;
        for (const md of d.modes) {
          for (const sgn of [1, -1]) {           // positive and mirror frequency
            const dr = md.gamma, di = 2 * Math.PI * (f - sgn * md.f), den = dr * dr + di * di;
            const cr = sgn > 0 ? md.cpr : md.cpr, ci = sgn > 0 ? md.cpi : -md.cpi;
            re += (cr * dr + ci * di) / den; im += (ci * dr - cr * di) / den;
          }
        }
        vals[i] = 20 * Math.log10(Math.hypot(re, im) + 1e-30);
        mx = Math.max(mx, vals[i]);
      }
      const Y = (db) => top + ((bot - top) * (mx - db)) / 60;
      ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { if (f > fHi) continue; ctx.beginPath(); ctx.moveTo(X(f), top); ctx.lineTo(X(f), bot); ctx.stroke(); ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 4); }
      ctx.strokeStyle = css('--plus'); ctx.beginPath();
      for (let i = 0; i < N; i++) { const f = fLo * (fHi / fLo) ** (i / (N - 1)); const y = Y(Math.max(mx - 60, vals[i])); if (i) ctx.lineTo(X(f), y); else ctx.moveTo(X(f), y); }
      ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = muted;
      for (const md of d.modes) if (md.n === 0) ctx.fillText(`${md.l}${md.m}${md.n}`, X(md.f) + 2, top + 10);
      ctx.fillText('h₊ spectrum (dB): each mode a Lorentzian of width γ/π', padL + 4, bot - 4);
    }
  }
}
