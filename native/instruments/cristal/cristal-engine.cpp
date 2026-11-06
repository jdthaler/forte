// cristal-engine.cpp — the cristal Baschet's engine (cristal-engine.h).

#include "cristal-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>

namespace forte::cristal {

constexpr int MAX_VOICES = 36;     // beyond this, the quietest rod nobody is stroking is let go (else the oldest)
constexpr int REPORT_BLOCKS = 12;  // the page's state every few blocks
constexpr double RIDGE = 4.5e-4;   // fingerprint ridge spacing (m)
constexpr double BEND_T = 0.02;    // s: a note's own bend glides as the instruments that bend glide theirs
constexpr double LAND = 0.012;     // s: the finger's force comes and goes this fast
constexpr double T_TURN = 0.08;    // s: the finger turns round at a stroke's end
constexpr double T_RETURN = 0.15;  // s: lifted, back to the rod's far end
// A finger lands firmly, LAND_PRESS more than it holds, and eases off over T_EASE: a quick start
// without the flat, pressed tone of holding that hard (our choice, after players' strokes). The
// extra is at most LAND_PRESS × LAND_FIRM thresholds: a finger already pressing hard lands no harder
// (else it drags the rod far and lets it go with a clunk)
constexpr double LAND_PRESS = 2, T_EASE = 0.25, LAND_FIRM = 10;
constexpr double C_AIR = 343, RHO_AIR = 1.2;
// The radiators: a cone of radius a radiates as a piston, its pressure ∝ v·s/(s + c/a); past its
// breakup it no longer moves as one. Our estimates for the Baschets' big and small fibreglass
// cones, and the bar's own end face (heard with every choice of radiator).
constexpr double BIG_A = 0.35, BIG_BREAK = 900, SMALL_A = 0.15, SMALL_BREAK = 2200, BARE_A = 0.03;
// The flame: a 1 mm steel sheet bolted to the collector. Below its breakup it moves as one, a plate
// of radius FLAME_A; its bending modes, base-driven, each move a share FLAME_W of it. Their losses
// (our estimate, widened so 64 stand in for the sheet's hundreds) and its coincidence.
constexpr double FLAME_A = 0.25, FLAME_BREAK = 500, FLAME_ETA = 0.01, FLAME_W = 0.08, FLAME_COINCIDENCE = 11700;
constexpr double SWAY_SHIFT = 0.05; // a whisker's stretching modes move ±5 % at full sway (our choice)
constexpr double OUT_CONE = 0.126, OUT_FLAME = 0.126, OUT_BARE = 0.168;
// The Quality: modes a stem plays, rods sounding at once before the quietest one nobody strokes is
// let go, the whiskers' modes, and the rod speed under which an untouched rod stops (the flame, one
// for the whole instrument, keeps all its modes: fewer would move a note's level)
constexpr int STEM_MODES[3] = {MODES, 3, 2};
constexpr int VOICES[3] = {MAX_VOICES, 16, 10};
constexpr int WIRE_MODES[3] = {WHISKER_MODES, 3, 1};
constexpr double QUIET[3] = {1e-6, 3e-6, 1e-5};
// the order the whiskers come in as their number grows: spread over the lengths
constexpr int ORDER[WHISKERS] = {0, 12, 6, 18, 3, 15, 9, 21, 1, 13, 7, 19, 4, 16, 10, 22, 2, 14, 8, 20, 5, 17, 11, 23};

double CristalEngine::Piston::run(double x) { // first-order high-pass at c/a, then the breakup
  const double y = al * (y1 + x - x1);
  x1 = x; y1 = y;
  return breakup.run(y);
}

static double lcg(int32_t &r) { r = (int32_t)((uint32_t)r * 1664525u + 1013904223u); return r / 2147483648.0; }

CristalEngine::CristalEngine(double fs)
    : Engine(fs), k(1 / fs),
      stems([this](int key, uint64_t v) {
        const Snapshot &s = snapshots[v % snapshots.size()];
        StemParams sp;
        sp.height = s.height.load(std::memory_order_relaxed); sp.loss = s.loss.load(std::memory_order_relaxed);
        sp.ratio = s.ratio[key % 12].load(std::memory_order_relaxed);
        return std::make_unique<Stem>(stem(key, sp));
      }) {
  regulation(KEY_LO); // the regulation table, computed now rather than at the first note
  const ModeCoeffs cc = modeCoeffs(COLLECTOR_F, COLLECTOR_ZETA * TAU * COLLECTOR_F, fs);
  ca1 = cc.a1; ca2 = cc.a2; cb = cc.b;
  auto piston = [&](Piston &p, double a, double brk) {
    p.al = 1 / (1 + (C_AIR / a) * k);
    p.breakup.set(Biquad::lp, brk, 0.8, fs);
  };
  piston(bigCone, BIG_A, BIG_BREAK); piston(smallCone, SMALL_A, SMALL_BREAK); piston(bare, BARE_A, 12000); piston(plate, FLAME_A, FLAME_BREAK);
  // The flame's bending modes: a tall sheet has one every ~10 Hz; these stand for them, drawn at
  // random (seeded) with the sheet's even density across the band, each moving a random share of
  // the sheet, weighted by its radiation efficiency below coincidence (∝ √(f/fc), so its pressure
  // ∝ (f/fc)^¼).
  int32_t r = 7177;
  for (int i = 0; i < FLAME_MODES; i++) {
    const double f = 60 + 8940 * (0.5 + 0.5 * lcg(r)), g = (0.5 + 0.5 * std::fabs(lcg(r))) * (lcg(r) < 0 ? -1 : 1);
    const ModeCoeffs c = modeCoeffs(f, std::numbers::pi * f * FLAME_ETA, fs);
    flame[i] = {c.a1, c.a2, c.b, FLAME_W * g * std::pow(f / FLAME_COINCIDENCE, 0.25)};
  }
  // The whiskers: clamped–free steel wires, their stretching modes below 10 kHz, base-driven
  // through Γ_n = √(2 m_w) · 2/((2n − 1)π) for the mass-normalised shape sin((2n − 1)πx/2L).
  for (int i = 0; i < WHISKERS; i++) {
    Wire &w = wires[i];
    w.L = whiskerLength(i); w.sway = whiskerSway(i); w.phase = TAU * (0.5 + 0.5 * lcg(r));
    const double mw = RHO_STEEL * std::numbers::pi * WHISKER_D * WHISKER_D / 4 * w.L;
    w.n = 0;
    for (int n = 1; n <= WHISKER_MODES && whiskerStretch(i, n) < 10000; n++) {
      w.f[w.n] = whiskerStretch(i, n);
      w.gam[w.n] = std::sqrt(2 * mw) * 2 / ((2 * n - 1) * std::numbers::pi);
      w.sigma[w.n] = std::numbers::pi * w.f[w.n] * WHISKER_ETA;
      w.n++;
    }
  }
}

void CristalEngine::setParams(const double *p) {
  const bool first = !hasParams;
  const forte::Tuning t = tuningOf(p);
  const bool rebuild = first || P[p::height] != p[p::height] || P[p::loss] != p[p::loss] || !(t == tuning);
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  tuning = t;
  hasParams = true;
  fr = friction(P[p::wet]);
  if (rebuild) { // a new version of every stem: the voices pick theirs up at the next block
    version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.height.store(P[p::height], std::memory_order_relaxed); s.loss.store(P[p::loss], std::memory_order_relaxed);
    for (int i = 0; i < 12; i++) s.ratio[i].store(tuning.r[i], std::memory_order_relaxed);
    stems.prepare(version, KEY_MIN, KEY_MAX, focus >= KEY_MIN ? focus : 60);
  }
}

void CristalEngine::start(Voice &v, int key) {
  v = Voice{};
  v.key = key;
  v.cap = STEM_MODES[(int)quality];
  v.bent = expr.bendOf(key); // bent before it was touched
  v.Nreg = regulation(key);
  v.after = pressureAll;
  // where the stem stands along the collector, from the big cone's end to the small one's
  v.pr = std::clamp((key - KEY_LO) / double(KEY_HI - KEY_LO), 0.0, 1.0); v.pl = 1 - v.pr;
  if (auto d = stems.get(key, version)) build(v, *d.data, version); // otherwise once its stem is ready (at once in WebAssembly)
}

// (Re)derive everything that depends on the stem, keeping the motion.
void CristalEngine::build(Voice &v, const Stem &s, uint64_t ver) {
  const int N = std::min(s.count, v.cap), keep = v.built ? std::min(N, v.N) : 0;
  for (int j = keep; j < MODES; j++) v.q[j] = v.q1[j] = 0;
  v.s = s; v.N = N; v.version = ver; v.built = true;
  double Y = 0;
  for (int i = 0; i < N; i++) {
    const Mode &m = s.modes[i];
    const ModeCoeffs c = modeCoeffs(std::min(m.f * v.bent, 0.45 * fs), m.zeta * TAU * m.f, fs);
    v.a1[i] = c.a1; v.a2[i] = c.a2; v.b[i] = c.b; v.tip[i] = m.tip; v.col[i] = m.col;
    Y += m.tip * m.tip * c.b;
  }
  v.Y = Y * fs; // the rod's velocity, one sample on, per newton
}

void CristalEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  if (key < 0) { pressureAll = value; for (int i = 0; i < count; i++) voices[i]->after = value; }
  else for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->after = value;
}

void CristalEngine::slide(double value, int key) { expr.setSlide(value, key); }

void CristalEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  Voice *v = nullptr;
  int at = -1;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == key) { v = voices[i]; at = i; }
  if (!v || v->dead) { // a new rod (or one let go this block, again from rest), the newest in the list
    if (v) { for (int i = at; i + 1 < count; i++) voices[i] = voices[i + 1]; count--; }
    v = &slots[key - KEY_MIN];
    voices[count++] = v;
    start(*v, key);
    int live = 0;
    for (int i = 0; i < count; i++) live += !voices[i]->dead;
    if (live > VOICES[(int)quality]) { // let go of the quietest rod nobody is stroking, else the oldest one
      Voice *q = nullptr;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (!x->dead && !x->touch && x != v && (!q || x->peak < q->peak)) q = x; }
      if (!q) for (int i = 0; i < count && !q; i++) if (!voices[i]->dead && voices[i] != v) q = voices[i];
      if (q) q->dead = true;
    }
  }
  v->touch = true; v->vel = velocity; v->lamOff = 0;
  v->phase = 0; v->pos = 0; v->dir = 1; v->t = 0; v->firm = LAND_PRESS; // a new stroke, from the rod's far end, landing firmly
  focus = key;
}

// Lift: how fast the wet fingers leave the rods: a slow lift drags them off (over up to four times
// the usual), quieting the rods as they go; a fast one leaves them ringing.
void CristalEngine::noteOff(int key, double velocity) {
  const double s = liftScale(velocity), lamOff = s == 1 ? 0 : 1 - std::exp(-k / (LAND * s * s));
  for (int i = 0; i < count; i++) if (voices[i]->key == key) { voices[i]->touch = false; voices[i]->lamOff = lamOff; }
}

void CristalEngine::allNotesOff() { count = 0; }

// The finger's stroke speed: the slider (or this note's MPE slide), scaled 0.4–1.4× by velocity.
double CristalEngine::speedOf(const Voice &v) const { return expr.slideOr(v.key, P[p::stroke]) * (0.4 + v.vel); }

// Normal force (N): the key's regulated threshold, scaled to the stroke's speed as the threshold
// scales, × the slider × aftertouch.
double CristalEngine::force(const Voice &v, double U) const {
  const double x = (1 + U / fr.v0) / (1 + U_REF / fr.v0);
  return v.Nreg * x * x * P[p::press] * (1 + v.after);
}

void CristalEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
  stems.audioCycle();
}

void CristalEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) { L[i] = R[i] = 0; dA[i] = dB[i] = 0; }
  if (!hasParams) return;
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (v.built && v.version == version) continue;
    if (auto d = stems.get(v.key, version)) build(v, *d.data, version);
  }
  const int mode = (int)P[p::strokes]; // 0 back and forth, 1 toward you, 2 endless
  const double lam = 1 - std::exp(-k / LAND), fsd = fs;
  const double mus = fr.mus, mud = fr.mud, v0 = fr.v0, noise = fr.noise;
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    if (v.dead || !v.built) continue;
    if (const double to = expr.bendOf(v.key); v.bent != to) { // Glide: a finger on the rod's tip
      v.bent = glideTo(v.bent, to, n * k, BEND_T);
      for (int i = 0; i < v.N; i++) { const Mode &m = v.s.modes[i]; const ModeCoeffs c = modeCoeffs(std::min(m.f * v.bent, 0.45 * fs), m.zeta * TAU * m.f, fs); v.a1[i] = c.a1; v.a2[i] = c.a2; }
    }
    const int NM = v.N;
    double *q = v.q.data(), *q1 = v.q1.data();
    const double *a1 = v.a1.data(), *a2 = v.a2.data(), *b = v.b.data(), *tip = v.tip.data(), *col = v.col.data();
    const double U = speedOf(v), Nhold = force(v, U), Y = v.Y, ease = std::exp(-k / T_EASE);
    const double Nfirm = std::min(Nhold, (Nhold / (P[p::press] * (1 + v.after))) * LAND_FIRM);
    const double gr = 1 - std::exp((-TAU * U) / (RIDGE * fsd));
    const bool tr = focus == v.key;
    double pk = 0;
    double fq[MODES];
    for (int i = 0; i < n; i++) {
      // the finger along the rod
      double uf = v.dir * U;
      bool on = v.touch;
      if (v.phase == 0) {
        v.pos += U * k;
        if (mode != 2 && v.pos >= STROKE) { v.phase = mode == 0 ? 1 : 2; v.t = 0; }
      } else if (v.phase == 1) { // turning round
        v.t += k;
        uf = v.dir * U * std::cos((std::numbers::pi * v.t) / T_TURN);
        if (v.t >= T_TURN) { v.dir = -v.dir; v.phase = 0; v.pos = 0; }
      } else { // lifted, coming back to the far end
        v.t += k; on = false;
        if (v.t >= T_RETURN) { v.phase = 0; v.pos = 0; v.firm = LAND_PRESS; }
      }
      v.firm *= ease;
      v.Nn += ((on ? Nhold + Nfirm * v.firm : 0) - v.Nn) * (!v.touch && v.lamOff ? v.lamOff : lam);
      if (!on && v.Nn < 1e-6 * v.Nreg) v.Nn = 0;
      const double Nf = v.Nn;
      // the modes, free; the rod's velocity without friction this sample
      double vfree = 0;
      for (int j = 0; j < NM; j++) { fq[j] = a1[j] * q[j] - a2[j] * q1[j]; vfree += tip[j] * (fq[j] - q[j]); }
      vfree *= fsd;
      double F = 0;
      if (Nf > 0) {
        v.nz += (noise * 1.7 * lcg(rng) - v.nz) * gr; // fingerprint ridges: friction noise, smoothed over a ridge's passage
        const double z = 1 + v.nz, ms = mus * z, md = mud * z;
        const double s0 = vfree - uf, c = Y * Nf;
        if (std::fabs(s0) <= c * ms) { F = -s0 / Y; v.stick = true; }
        else { // slip at u = |Δv| solving u = |s0| − c μ(u): u² + (V0 − |s0| + c μd) u − V0 (|s0| − c μs) = 0
          const double a = std::fabs(s0), B = v0 - a + c * md;
          const double u = 0.5 * (-B + std::sqrt(B * B + 4 * v0 * (a - c * ms)));
          F = -(s0 > 0 ? 1 : -1) * Nf * (md + (ms - md) / (1 + u / v0));
          v.stick = false;
        }
      } else v.stick = false;
      double vr = 0, vc = 0;
      for (int j = 0; j < NM; j++) {
        const double nq = fq[j] + b[j] * tip[j] * F, dq = nq - q[j];
        q1[j] = q[j]; q[j] = nq;
        vr += tip[j] * dq; vc += col[j] * nq;
      }
      vr *= fsd;
      v.v = vr; v.uf = uf; v.F = F;
      dA[i] += v.pl * vc; dB[i] += v.pr * vc;
      const double av = std::fabs(vr);
      if (av > pk) pk = av;
      if (tr) { trV[tw] = (float)vr; trU[tw] = (float)(Nf > 0 ? uf : NAN); tw = (tw + 1) % TRACE; }
    }
    v.peak = pk;
    if (!v.touch && v.Nn == 0) { v.quiet = pk < QUIET[(int)quality] ? v.quiet + 1 : 0; if (v.quiet > 40) v.dead = true; }
  }
  int j = 0;
  for (int i = 0; i < count; i++) if (!voices[i]->dead) voices[j++] = voices[i];
  count = j;
  radiate(L, R, n);
  if (messages && ++tick >= REPORT_BLOCKS) { tick = 0; report(); }
}

// The stems' pull on the collector, into its motion, the whiskers and the radiators. The bar is
// heavy and sits on its mounts' spring (COLLECTOR_F): its two halves, each half its mass, move
// with the forces of the stems along them.
void CristalEngine::radiate(float *L, float *R, int n) {
  const int qi = (int)quality, nw = std::clamp((int)std::lround(P[p::whiskers]), 0, WHISKERS), wm = WIRE_MODES[qi];
  const int rad = (int)P[p::radiator]; // 0 both, 1 cones, 2 flame, 3 bare
  // the whiskers' modes this block, swayed: a bent wire's stretching modes shift with its curvature
  swayT += n * k;
  for (int w = 0; w < nw; w++) {
    Wire &x = wires[ORDER[w]];
    const double shift = 1 + SWAY_SHIFT * P[p::sway] * std::cos(TAU * x.sway * swayT + x.phase);
    for (int m = 0; m < std::min(x.n, wm); m++) {
      const ModeCoeffs c = modeCoeffs(x.f[m] * shift, x.sigma[m], fs);
      x.a1[m] = c.a1; x.a2[m] = c.a2; x.b[m] = c.b;
    }
  }
  if (swayT > 1e4) swayT -= 1e4;
  double wo = 0, D = 0;
  const double bc = cb / (COLLECTOR_M / 2), fs2 = fs * fs;
  double G = 0; // Σ b Γ² over the whiskers' modes
  for (int w = 0; w < nw; w++) { const Wire &x = wires[ORDER[w]]; for (int m = 0; m < std::min(x.n, wm); m++) G += x.b[m] * x.gam[m] * x.gam[m]; }
  for (int i = 0; i < n; i++) {
    // The whiskers, on the small cone's half of the collector: each mode base-driven by its
    // acceleration a, q̈ + 2σq̇ + ω²q = −Γ a, pulls back on it with −Σ Γ q̈. One step of both is
    // linear in the bar's new position, so it is solved at once (the wires and the bar together).
    double S0 = 0;
    for (int w = 0; w < nw; w++) {
      Wire &x = wires[ORDER[w]];
      for (int m = 0; m < std::min(x.n, wm); m++) S0 += x.gam[m] * ((x.a1[m] - 2) * x.y[m] + (1 - x.a2[m]) * x.y1[m]);
    }
    const double beta = -cB * fs2 - lastB * fs; // the bar's acceleration is fs² xb + beta
    const double xa = ca1 * cA - ca2 * cA1 + bc * dA[i];
    const double xb = (ca1 * cB - ca2 * cB1 + bc * dB[i] - bc * fs2 * S0 + bc * fs2 * beta * G) / (1 - bc * fs2 * fs2 * G);
    const double acc = fs2 * xb + beta;
    double Fw = 0;
    for (int w = 0; w < nw; w++) {
      Wire &x = wires[ORDER[w]];
      for (int m = 0; m < std::min(x.n, wm); m++) {
        const double y = x.a1[m] * x.y[m] - x.a2[m] * x.y1[m] - x.b[m] * x.gam[m] * acc;
        Fw -= x.gam[m] * (y - 2 * x.y[m] + x.y1[m]);
        x.y1[m] = x.y[m]; x.y[m] = y;
      }
    }
    Fw *= fs2;
    const double vA = (xa - cA) * fs, vB = (xb - cB) * fs;
    lastB = vB;
    cA1 = cA; cA = xa; cB1 = cB; cB = xb;
    D = 0.5 * (vA + vB);
    wo = Fw;
    const double DA = vA, DB = vB, Dt = D;
    const double big = bigCone.run(DA), small = smallCone.run(DB), face = bare.run(Dt);
    // the flame: each bending mode driven by the bar's acceleration, q̈ + 2σq̇ + ω²q = −a, its
    // velocity q̇ on top of the sheet's own motion (all of it, below the breakup)
    const double aD = (Dt - lastD) * fs;
    lastD = Dt;
    double fl = 0;
    for (int m = 0; m < FLAME_MODES; m++) {
      Bank &f = flame[m];
      const double y = f.a1 * f.y - f.a2 * f.y1 - f.b * aD;
      fl += f.g * (y - f.y);
      f.y1 = f.y; f.y = y;
    }
    fl = plate.run(Dt) + fl * fs;
    const double rc = RHO_AIR * C_AIR;
    double l = 0, r = 0;
    if (rad == 0 || rad == 1) { l += OUT_CONE * rc * (0.9 * big + 0.35 * small); r += OUT_CONE * rc * (0.35 * big + 0.9 * small); }
    if (rad == 0 || rad == 2) { l += OUT_FLAME * rc * fl * 0.55; r += OUT_FLAME * rc * fl * 0.8; }
    l += OUT_BARE * rc * face; r += OUT_BARE * rc * face; // the bar's own end face, always there
    L[i] = (float)(L[i] + l);
    R[i] = (float)(R[i] + r);
  }
  collector = D; whiskerOut = wo;
}

// Throttled state for the page's views: the focused rod's trace (oldest first), then the state.
void CristalEngine::report() {
  const Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == focus) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  for (int which = 0; which < 2; which++) {
    const std::array<float, TRACE> &tr = which ? trU : trV;
    m.type = which ? msg::traceU : msg::traceV;
    for (int i = 0; i < TRACE;) {
      const int c = std::min(29, TRACE - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int q = 0; q < c; q++) m.values[1 + q] = tr[(tw + i + q) % TRACE];
      post(m);
      i += c;
    }
  }
  m.type = msg::state; m.count = 11;
  double amp = 0;
  if (v && v->built) amp = v->q[v->s.main] * v->tip[v->s.main];
  const double s[11] = {v ? v->pos : 0, v ? v->uf : 0, v ? v->Nn : 0, v && v->touch ? 1.0 : 0.0, v && v->stick ? 1.0 : 0.0, amp,
                        v ? v->s.f0 : 0, v ? v->s.len : 0, v ? v->s.height : 0, v ? v->s.weight : 0, v ? (double)v->phase : 0};
  for (int q = 0; q < 11; q++) m.values[q] = (float)s[q];
  post(m);
}

} // namespace forte::cristal
