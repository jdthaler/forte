// organ-viz.js — generator map, Leslie top view, output spectrum/scope, scanner.

import { NUM_WHEELS, wheelSpec as jsWheelSpec, PC_NAMES } from './tonewheels.js';
import { leslieGeometry as jsLeslieGeometry } from './organ-engine.js';

// The model the views draw from: the JavaScript's, or the WebAssembly's once the page has it
// (useModel; organ-wasm.js wasmModel).
let wheelSpec = jsWheelSpec, leslieGeometry = jsLeslieGeometry;
export function useModel(m) { ({ wheelSpec, leslieGeometry } = m); }

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function fit(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  const W = Math.round(w * dpr), H = Math.round(h * dpr); // integers, or the bitmap is reset every frame
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(W / w, 0, 0, H / h, 0, 0);
  return { ctx, w, h };
}

export const BAR_COLORS = { brown: '#c48756', white: '#ece6d8', black: '#8c867c' };

// ---------------------------------------------------------------------------
export class GeneratorView {
  constructor(canvas, onHover) {
    this.cv = canvas;
    this.cents = new Float64Array(NUM_WHEELS + 1);
    this.activity = new Float64Array(NUM_WHEELS + 1);
    this.hover = null;
    this.harmonic = false;
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const w = this.wheelAt(e.clientX - r.left, r.width);
      if (w !== this.hover) { this.hover = w; onHover(w); }
    });
    canvas.addEventListener('mouseleave', () => { this.hover = null; onHover(null); });
  }
  layout(w) { const padL = 34, padR = 8; return { padL, slot: (w - padL - padR) / NUM_WHEELS }; }
  wheelAt(x, w) {
    const { padL, slot } = this.layout(w);
    const i = Math.floor((x - padL) / slot) + 1;
    return i >= 1 && i <= NUM_WHEELS ? i : null;
  }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const { padL, slot } = this.layout(w);
    const muted = css('--muted'), accent = css('--accent'), blue = css('--accent-2'), grid = css('--grid');
    const yc = h * 0.6, scale = (h * 0.3) / 2.2, yg = h * 0.17;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = muted; ctx.strokeStyle = grid; ctx.textAlign = 'right';
    for (const c of [-2, -1, 0, 1, 2]) {
      ctx.beginPath(); ctx.moveTo(padL, yc - c * scale); ctx.lineTo(w - 8, yc - c * scale); ctx.stroke();
      if (c % 2 === 0) ctx.fillText(`${c > 0 ? '+' : ''}${c}¢`, padL - 4, yc - c * scale + 3);
    }
    ctx.textAlign = 'center';
    for (let w0 = 1; w0 <= NUM_WHEELS; w0 += 12) {
      const x = padL + (w0 - 1) * slot;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 14); ctx.stroke();
      ctx.fillText(`C${wheelSpec(w0).octave}`, x + 6 * slot, h - 3);
    }
    for (let i = 1; i <= NUM_WHEELS; i++) {
      const x = padL + (i - 1) * slot;
      const c = this.cents[i];
      ctx.fillStyle = c >= 0 ? accent : blue;
      if (this.harmonic) ctx.globalAlpha = 0.35;
      ctx.fillRect(x + slot * 0.15, Math.min(yc, yc - c * scale), slot * 0.7, Math.max(1, Math.abs(c) * scale));
      ctx.globalAlpha = 1;
      const a = this.activity[i];
      if (a > 0) {
        const rr = Math.min(slot * 1.6, 2 + 5 * Math.sqrt(a));
        const grd = ctx.createRadialGradient(x + slot / 2, yg, 0, x + slot / 2, yg, rr * 2);
        grd.addColorStop(0, 'rgba(255,214,140,0.95)');
        grd.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x + slot / 2, yg, rr * 2, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.arc(x + slot / 2, yg, Math.max(1, slot * 0.22), 0, 2 * Math.PI); ctx.fill();
      }
      if (i === this.hover) {
        ctx.strokeStyle = css('--text');
        ctx.strokeRect(x, 4, slot, h - 20);
      }
    }
  }
}

// ---------------------------------------------------------------------------
export class LeslieView {
  constructor(canvas) {
    this.cv = canvas;
    this.st = null;
    this.t = 0;
  }
  set(st) { this.st = st; this.t = performance.now(); }
  draw(P) {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const muted = css('--muted'), text = css('--text');
    const st = this.st;
    const dt = st ? (performance.now() - this.t) / 1000 : 0;
    const hornA = st ? st.hornAng + 2 * Math.PI * st.hornHz * dt : 0;
    const drumA = st ? st.drumAng + 2 * Math.PI * st.drumHz * dt : 1.3;
    const { wall, micDist: D } = leslieGeometry(P), sp = (P.micSpread * Math.PI) / 360;
    const mics = [[-Math.sin(sp) * D, Math.cos(sp) * D], [Math.sin(sp) * D, Math.cos(sp) * D]];
    const cab = wall - 0.02; // wall is the reflecting surface; draw the panel just inside it
    const top = cab + 0.06;
    const xMax = Math.max(0.4, cab + 0.1, Math.sin(sp) * D + 0.15), yMax = Math.max(0.45, cab + 0.1, Math.cos(sp) * D + 0.15);
    const s = Math.min((w - 20) / (2 * xMax), (h - 30) / (yMax + top + 0.04));
    if (!(s > 5)) return; // too small to draw
    const cx = w / 2, cy = 14 + top * s;
    const X = (x) => cx + x * s, Y = (y) => cy + y * s;

    // cabinet
    ctx.fillStyle = '#3a2a1c'; ctx.strokeStyle = '#6b5038'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(X(-cab), Y(-cab), 2 * cab * s, 2 * cab * s, 6); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1;

    // drum (bass rotor): dark cylinder with a scoop opening
    ctx.fillStyle = '#211a14';
    ctx.beginPath(); ctx.arc(X(0), Y(0), 0.15 * s, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#8a6b4a'; ctx.lineWidth = 4;
    const da = Math.atan2(Math.cos(drumA), Math.sin(drumA));
    ctx.beginPath(); ctx.arc(X(0), Y(0), 0.15 * s, da - 0.6, da + 0.6); ctx.stroke();
    ctx.lineWidth = 1;

    // sound paths from horn mouth to mics
    const rh = P.hornRadius, k = rh / 0.18; // horn drawn to scale
    const hx = rh * Math.sin(hornA), hy = rh * Math.cos(hornA);
    ctx.strokeStyle = 'rgba(240,179,90,0.25)';
    ctx.setLineDash([3, 4]);
    if (P.leslieOn) for (const [mx, my] of mics) { ctx.beginPath(); ctx.moveTo(X(hx), Y(hy)); ctx.lineTo(X(mx), Y(my)); ctx.stroke(); }
    ctx.setLineDash([]);

    // horn: one live bell + a dummy counterweight
    const ux = Math.sin(hornA), uy = Math.cos(hornA), px = -uy, py = ux;
    ctx.strokeStyle = '#cfc6b8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X(-0.1 * k * ux), Y(-0.1 * k * uy)); ctx.lineTo(X(0.12 * k * ux), Y(0.12 * k * uy)); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#e9e1d2';
    ctx.beginPath();
    ctx.moveTo(X(0.1 * k * ux + 0.015 * px), Y(0.1 * k * uy + 0.015 * py));
    ctx.lineTo(X(rh * ux + 0.06 * px), Y(rh * uy + 0.06 * py));
    ctx.lineTo(X(rh * ux - 0.06 * px), Y(rh * uy - 0.06 * py));
    ctx.lineTo(X(0.1 * k * ux - 0.015 * px), Y(0.1 * k * uy - 0.015 * py));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7d756a';
    ctx.beginPath(); ctx.arc(X(-0.12 * k * ux), Y(-0.12 * k * uy), 0.03 * s, 0, 2 * Math.PI); ctx.fill();

    // mics
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    mics.forEach(([mx, my], i) => {
      ctx.fillStyle = css('--accent-2');
      ctx.beginPath(); ctx.arc(X(mx), Y(my), 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = muted;
      ctx.fillText(i ? 'R mic' : 'L mic', X(mx), Y(my) + 17);
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    if (!P.leslieOn) { ctx.fillStyle = muted; ctx.fillText('bypassed', 8, h - 8); }
  }
}

// ---------------------------------------------------------------------------
export class OutputView {
  constructor(canvas) {
    this.cv = canvas;
    this.analyser = null;
    this.focus = null; // [{actual, ideal, color, level}]
  }
  setAnalyser(a) {
    this.analyser = a;
    this.fft = new Float32Array(a.frequencyBinCount);
    this.td = new Float32Array(a.fftSize);
  }
  draw(f8) {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const muted = css('--muted'), grid = css('--grid');
    const padL = 34, padB = 18, padT = 6, sw = w * 0.66;
    const fLo = 30, fHi = 12000;
    const X = (f) => padL + ((sw - padL) * Math.log(f / fLo)) / Math.log(fHi / fLo);
    const Y = (d) => padT + ((h - padT - padB) * (-10 - d)) / 90;
    ctx.font = '10px system-ui, sans-serif';
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 5);
    }
    ctx.textAlign = 'right';
    for (let d = -10; d >= -100; d -= 30) {
      ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(sw, Y(d)); ctx.stroke();
      ctx.fillText(`${d}`, padL - 4, Y(d) + 3);
    }
    if (this.focus) {
      for (const m of this.focus) {
        if (m.level <= 0 || m.actual < fLo || m.actual > fHi) continue;
        ctx.strokeStyle = m.color; ctx.globalAlpha = 0.25 + 0.6 * m.level;
        ctx.beginPath(); ctx.moveTo(X(m.actual), padT); ctx.lineTo(X(m.actual), h - padB); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.fft);
      const fs = this.analyser.context.sampleRate, N = this.fft.length;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < N; i++) {
        const f = (i * fs) / (2 * N);
        if (f < fLo || f > fHi) continue;
        const d = Math.max(-100, Math.min(-10, this.fft[i]));
        if (started) ctx.lineTo(X(f), Y(d)); else { ctx.moveTo(X(f), Y(d)); started = true; }
      }
      ctx.strokeStyle = css('--accent');
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.lineWidth = 1;

      // scope: ~3 periods of the 8′ pitch, triggered on a rising zero crossing
      this.analyser.getFloatTimeDomainData(this.td);
      const x0 = sw + 14, x1 = w - 4, y0 = padT + 4, y1 = h - padB;
      ctx.strokeStyle = grid;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const per = f8 ? fs / f8 : 200;
      const span = Math.min(this.td.length / 2, Math.max(64, Math.round(3 * per)));
      let trig = 0;
      for (let i = 1; i < this.td.length - span; i++) if (this.td[i - 1] < 0 && this.td[i] >= 0) { trig = i; break; }
      let mx = 1e-4;
      for (let i = 0; i < span; i++) mx = Math.max(mx, Math.abs(this.td[trig + i]));
      ctx.beginPath();
      for (let i = 0; i < span; i++) {
        const px = x0 + ((x1 - x0) * i) / (span - 1), py = (y0 + y1) / 2 - (((y1 - y0) / 2) * 0.9 * this.td[trig + i]) / mx;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = css('--accent-2');
      ctx.stroke();
      ctx.fillStyle = muted; ctx.textAlign = 'left';
      ctx.fillText('scope (left channel)', x0 + 4, y0 + 12);
    } else {
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('Start audio (or press a key) to see the output', w / 2, h / 2);
    }
  }
}

// ---------------------------------------------------------------------------
export function drawScanner(canvas, st, P) {
  const { ctx, w, h } = fit(canvas);
  ctx.clearRect(0, 0, w, h);
  const N = st?.lcN ?? P.sections;
  const on = P.vib !== 'off';
  const x0 = 8, x1 = w - 8, y = h * 0.66;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  for (let k = 0; k <= N; k++) {
    const x = x0 + ((x1 - x0) * k) / N;
    ctx.fillStyle = on ? 'rgba(236,230,216,0.6)' : 'rgba(236,230,216,0.2)';
    ctx.fillRect(x - 1, y - 4, 2, 8);
  }
  if (on && st) {
    const x = x0 + ((x1 - x0) * st.scanPos) / N;
    ctx.fillStyle = css('--accent');
    ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.fillStyle = css('--muted');
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(on ? `scanner on an ${N}-section LC line` : 'scanner bypassed', x0, 10);
}

export { PC_NAMES };
