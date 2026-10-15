// arc-voice.js — the "microphone" of Simon's talking arc. The page has no audio input (the
// shared worklet has numberOfInputs: 0), so a singer is synthesised here: a glottal source
// (the Rosenberg pulse's flow derivative) through a cascade of three formant resonators,
// gliding round the vowels a–e–i–o–u. Its output stands for the microphone's speech current
// and is coupled into the arc circuit through a transformer (see arc-engine.js).

const TAU = 2 * Math.PI;
// Typical formants of an adult male voice (Hz): F1, F2, F3.
export const VOWELS = [
  ['a', [730, 1090, 2440]],
  ['e', [530, 1840, 2480]],
  ['i', [270, 2290, 3010]],
  ['o', [570, 840, 2410]],
  ['u', [300, 870, 2240]],
];
const BW = [80, 100, 140];       // formant bandwidths (Hz)
const HOLD = 0.42, GLIDE = 0.16;  // s per vowel, of which the glide to the next
const OPEN = 0.4, CLOSE = 0.2;    // Rosenberg pulse: opening and closing phases (of the period)

export class Singer {
  constructor(fs, seed = 7) {
    this.fs = fs; this.ph = 0; this.f0 = 130.81; this.f0t = 130.81; this.env = 0; this.on = false;
    this.t = 0; this.vib = 0; this.seed = seed | 1;
    this.y1 = new Float64Array(3); this.y2 = new Float64Array(3);
    this.c1 = new Float64Array(3); this.c2 = new Float64Array(3); this.g = new Float64Array(3);
    this.prev = 0; this.kAtt = 1 - Math.exp(-1 / (0.03 * fs)); this.kRel = 1 - Math.exp(-1 / (0.08 * fs)); this.kGl = 1 - Math.exp(-1 / (0.04 * fs));
    this.setFormants(VOWELS[0][1]);
  }
  setFormants(F) {
    for (let k = 0; k < 3; k++) {
      const r = Math.exp((-Math.PI * BW[k]) / this.fs), th = (TAU * F[k]) / this.fs;
      this.c1[k] = 2 * r * Math.cos(th); this.c2[k] = -r * r; this.g[k] = 1 - this.c1[k] - this.c2[k]; // unity gain at DC
    }
  }
  // formants now: hold each vowel, then glide (cosine) to the next
  formantsAt(t) {
    const n = VOWELS.length, k = Math.floor(t / HOLD), x = t / HOLD - k, a = VOWELS[k % n][1], b = VOWELS[(k + 1) % n][1];
    const m = x < 1 - GLIDE / HOLD ? 0 : 0.5 - 0.5 * Math.cos((Math.PI * (x - (1 - GLIDE / HOLD))) / (GLIDE / HOLD));
    return [a[0] + m * (b[0] - a[0]), a[1] + m * (b[1] - a[1]), a[2] + m * (b[2] - a[2])];
  }
  vowel(t = this.t) { return VOWELS[Math.floor(t / HOLD) % VOWELS.length][0]; }
  // glottal flow derivative (unit peak flow) at phase p
  static source(p) {
    if (p < OPEN) return (Math.PI / (2 * OPEN)) * Math.sin((Math.PI * p) / OPEN);
    if (p < OPEN + CLOSE) return (-Math.PI / (2 * CLOSE)) * Math.sin((Math.PI * (p - OPEN)) / (2 * CLOSE));
    return 0;
  }
  next() {
    const fs = this.fs;
    this.env += (this.on ? this.kAtt : this.kRel) * ((this.on ? 1 : 0) - this.env);
    this.f0 += this.kGl * (this.f0t - this.f0);
    if (this.env < 1e-5 && !this.on) { this.prev = 0; return 0; }
    this.t += 1 / fs;
    if ((this.t * fs) % 64 < 1) this.setFormants(this.formantsAt(this.t)); // every 64 samples
    this.vib += (TAU * 5.5) / fs;
    const f = this.f0 * (1 + 0.006 * Math.sin(this.vib));
    const dp = f / fs;
    this.ph += dp;
    if (this.ph >= 1) this.ph -= 1;
    let s = Singer.source(this.ph);
    // polyBLEP: the flow derivative jumps back to 0 at closure (phase OPEN + CLOSE)
    const jump = Math.PI / (2 * CLOSE), pc = OPEN + CLOSE, d = (this.ph - pc) / dp;
    if (d >= 0 && d < 1) s += jump * (d - 1) * (d - 1) * 0.5; else if (d >= -1 && d < 0) s -= jump * (d + 1) * (d + 1) * 0.5;
    // a little breath
    this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5;
    s += 0.04 * (this.seed / 2147483648);
    // formant cascade
    let x = s;
    for (let k = 0; k < 3; k++) { const y = this.g[k] * x + this.c1[k] * this.y1[k] + this.c2[k] * this.y2[k]; this.y2[k] = this.y1[k]; this.y1[k] = y; x = y; }
    return 0.5 * this.env * x;
  }
}
