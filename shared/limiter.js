// limiter.js — the pages' limiter: the compressor curve and makeup gain of Web Audio's
// DynamicsCompressorNode (threshold −3 dB, knee 3 dB, ratio 12, attack 2 ms, release 150 ms),
// without its 6 ms look-ahead, so the pages add no delay to a key. The same code as the
// plugins' native/core/src/limiter.cpp. A fast transient may overshoot the threshold for the
// attack time. shared/worklet.js runs it as the 'forte-limiter' processor (shared/chain.js).

const dbToLinear = (db) => 10 ** (db / 20);
const linearToDb = (x) => 20 * Math.log10(x);

export class Limiter {
  constructor({ threshold = -3, knee = 3, ratio = 12, attack = 0.002, release = 0.15 } = {}, fs = 48000) {
    this.ratio = ratio;
    this.linearThreshold = dbToLinear(threshold);
    this.kneeEnd = dbToLinear(threshold + knee);
    // k: the knee's slope (dB per dB) where it ends is 1/ratio
    const slopeAt = (k) => {
      const x = this.kneeEnd, y = this.linearThreshold + (1 - Math.exp(-k * (x - this.linearThreshold))) / k;
      return (x * Math.exp(-k * (x - this.linearThreshold))) / y;
    };
    let lo = 0.1, hi = 10000;
    for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (slopeAt(mid) > 1 / ratio) lo = mid; else hi = mid; }
    this.k = Math.sqrt(lo * hi);
    this.kneeEndOut = this.kneeCurve(this.kneeEnd);
    this.makeup = (1 / this.curve(1)) ** 0.6;
    this.attackCoef = 1 - Math.exp(-1 / (Math.max(attack, 1e-4) * fs));
    this.releaseCoef = 1 - Math.exp(-1 / (Math.max(release, 1e-3) * fs));
    this.gain = 1;
  }

  kneeCurve(x) {
    if (x < this.linearThreshold) return x;
    return this.linearThreshold + (1 - Math.exp(-this.k * (x - this.linearThreshold))) / this.k;
  }

  // the static curve: input amplitude → output amplitude (before the makeup gain)
  curve(x) {
    if (x < this.kneeEnd) return this.kneeCurve(x);
    return dbToLinear(linearToDb(this.kneeEndOut) + (linearToDb(x) - linearToDb(this.kneeEnd)) / this.ratio);
  }

  // in place; L and R are linked (one gain for both)
  process(L, R, n) {
    const t = this.linearThreshold, a = this.attackCoef, r = this.releaseCoef, m = this.makeup;
    let gain = this.gain;
    for (let i = 0; i < n; i++) {
      const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      const target = x > t ? this.curve(x) / x : 1;
      gain += (target - gain) * (target < gain ? a : r);
      const g = gain * m;
      L[i] *= g;
      R[i] *= g;
    }
    this.gain = gain;
  }
}
