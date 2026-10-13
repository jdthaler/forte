// impulses.js — synthetic impulse responses for the soundboard and the room.
//
// Soundboard: a plate has roughly constant modal density, so we sum many
// randomly placed, randomly phased decaying modes, shaped by a radiation curve
// (weak below ~150 Hz, gently rolled off at the top). This is the "commuted"
// part of the model: bridge velocity in, radiated sound out.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function soundboardIR(ctx, seconds = 0.4) {
  const fs = ctx.sampleRate, n = Math.floor(seconds * fs);
  const buf = ctx.createBuffer(2, n, fs);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(11 + 7 * ch), out = buf.getChannelData(ch);
    const nModes = 700, fLo = 40, fHi = Math.min(12000, 0.45 * fs);
    for (let i = 0; i < nModes; i++) {
      const f = fLo + ((fHi - fLo) * (i + r())) / nModes;
      const sig = 9 + 0.011 * f;
      const hp = (f / 150) ** 2 / (1 + (f / 150) ** 2);
      const lp = 1 / Math.sqrt(1 + (f / 7000) ** 2);
      const amp = Math.sqrt(sig) * hp * lp * Math.sqrt(-2 * Math.log(1 - r() * 0.999));
      const w = (2 * Math.PI * f) / fs, rr = Math.exp(-sig / fs);
      const c = 2 * rr * Math.cos(w), r2 = rr * rr;
      const ph = 2 * Math.PI * r();
      let y1 = amp * Math.sin(ph), y2 = amp * Math.sin(ph - w) / rr;
      const len = Math.min(n, Math.ceil((9 / sig) * fs));
      for (let t = 0; t < len; t++) {
        const y = c * y1 - r2 * y2;
        out[t] += y1;
        y2 = y1; y1 = y;
      }
    }
  }
  return buf;
}

export function roomIR(ctx, seconds = 2.2) {
  const fs = ctx.sampleRate, n = Math.floor(seconds * fs);
  const buf = ctx.createBuffer(2, n, fs);
  const pre = Math.floor(0.014 * fs);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(101 + ch), out = buf.getChannelData(ch);
    let lp = 0, lp2 = 0;
    for (let t = pre; t < n; t++) {
      const tt = (t - pre) / fs;
      const x = r() * 2 - 1;
      lp += 0.12 * (x - lp);
      lp2 += 0.03 * (x - lp2);
      const fade = Math.min(1, tt / 0.006);
      out[t] = fade * (0.55 * x * Math.exp((-6.9 * tt) / 0.9) + 1.6 * lp * Math.exp((-6.9 * tt) / 1.6) + 2.5 * lp2 * Math.exp((-6.9 * tt) / 2.0));
    }
  }
  return buf;
}
