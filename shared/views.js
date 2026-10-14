// views.js — canvas helpers and the two views most instruments want: a live
// log-frequency spectrum with model markers, and a triggered oscilloscope.

export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// Size a canvas to its CSS box at device resolution; returns a 2-D context in CSS pixels.
export function fit(cv) {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  const W = Math.round(w * dpr), H = Math.round(h * dpr); // integers, or the bitmap is reset every frame
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(W / w, 0, 0, H / h, 0, 0);
  return { ctx, w, h };
}

// Call draw() every animation frame (the browser pauses this in hidden tabs),
// skipping frames while `canvas` is hidden (e.g. from the Views menu).
export function animate(draw, canvas = null) {
  const loop = (t) => { requestAnimationFrame(loop); if (!canvas || canvas.offsetParent !== null) draw(t); };
  requestAnimationFrame(loop);
}

// Live spectrum (dB vs log f). set(f0, markers): faint harmonic grid on f0, and
// vertical markers [{ f, color?, alpha? }] for the model's modes.
export class SpectrumView {
  constructor(canvas, { fLo = 25, fHi = 20000, dbTop = -10, dbRange = 100 } = {}) {
    Object.assign(this, { cv: canvas, fLo, fHi, dbTop, dbRange, analyser: null, f0: 0, markers: [] });
    animate(() => this.draw(), canvas);
  }
  setAnalyser(a) { this.analyser = a; this.fft = new Float32Array(a.frequencyBinCount); }
  set(f0, markers = []) { this.f0 = f0; this.markers = markers; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    const { fLo, fHi, dbTop, dbRange } = this;
    const padL = 34, padR = 8, padT = 6, padB = 18;
    const X = (f) => padL + ((w - padL - padR) * Math.log(f / fLo)) / Math.log(fHi / fLo);
    const Y = (d) => padT + ((h - padT - padB) * (dbTop - d)) / dbRange;
    ctx.font = '10px system-ui, sans-serif'; ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      if (f < fLo || f > fHi) continue;
      ctx.beginPath(); ctx.moveTo(X(f), padT); ctx.lineTo(X(f), h - padB); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f), h - 5);
    }
    ctx.textAlign = 'right';
    for (let d = dbTop; d >= dbTop - dbRange; d -= 25) { ctx.beginPath(); ctx.moveTo(padL, Y(d)); ctx.lineTo(w - padR, Y(d)); ctx.stroke(); ctx.fillText(`${d}`, padL - 4, Y(d) + 3); }
    if (this.f0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let n = 2; n * this.f0 < fHi && n < 48; n++) { ctx.beginPath(); ctx.moveTo(X(n * this.f0), padT); ctx.lineTo(X(n * this.f0), h - padB); ctx.stroke(); }
    }
    ctx.lineWidth = 2;
    for (const m of this.markers) {
      if (!(m.f >= fLo && m.f <= fHi)) continue;
      ctx.strokeStyle = m.color || css('--accent'); ctx.globalAlpha = m.alpha ?? 0.75;
      ctx.beginPath(); ctx.moveTo(X(m.f), h - padB); ctx.lineTo(X(m.f), padT + 8); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    if (this.analyser) {
      this.analyser.getFloatFrequencyData(this.fft);
      const fs = this.analyser.context.sampleRate, N = this.fft.length;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < N; i++) {
        const f = (i * fs) / (2 * N);
        if (f < fLo || f > fHi) continue;
        const d = Math.max(dbTop - dbRange, Math.min(dbTop, this.fft[i]));
        if (started) ctx.lineTo(X(f), Y(d)); else { ctx.moveTo(X(f), Y(d)); started = true; }
      }
      ctx.strokeStyle = css('--text'); ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}

// Oscilloscope, triggered on a rising zero crossing; `periods` cycles of f0 if set.
export class ScopeView {
  constructor(canvas, { ms = 20 } = {}) {
    Object.assign(this, { cv: canvas, ms, analyser: null, f0: 0, periods: 3 });
    animate(() => this.draw(), canvas);
  }
  setAnalyser(a) { this.analyser = a; this.buf = new Float32Array(a.fftSize); }
  setPitch(f0, periods = 3) { this.f0 = f0; this.periods = periods; }
  draw() {
    const { ctx, w, h } = fit(this.cv);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = css('--grid');
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    if (!this.analyser) return;
    const a = this.analyser, fs = a.context.sampleRate, x = this.buf;
    a.getFloatTimeDomainData(x);
    const span = Math.min(x.length / 2, Math.round(fs * (this.f0 ? this.periods / this.f0 : this.ms / 1000)));
    let t0 = 0;
    for (let i = 1; i < x.length - span; i++) if (x[i - 1] <= 0 && x[i] > 0) { t0 = i; break; }
    let pk = 1e-4;
    for (let i = t0; i < t0 + span; i++) pk = Math.max(pk, Math.abs(x[i]));
    const g = (0.42 * h) / Math.max(pk, 0.05);
    ctx.beginPath();
    for (let i = 0; i < span; i++) {
      const X = (i / (span - 1)) * w, Y = h / 2 - g * x[t0 + i];
      if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
    }
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  }
}
