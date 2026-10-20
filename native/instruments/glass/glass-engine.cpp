// glass-engine.cpp — the armonica's engine (glass-engine.h).

#include "glass-engine.h"

#include <algorithm>
#include <cmath>
#include <memory>

#include "forte/dsp.h"

namespace forte::glass {

constexpr double OUT = 120;
const double MIC[2] = {(35 * std::numbers::pi) / 180, (55 * std::numbers::pi) / 180}; // microphone azimuths, from the finger
constexpr double RIDGE = 4.5e-4;   // fingerprint ridge spacing (m)
constexpr int MAX_VOICES = 36;     // beyond this, the quietest bowl nobody is touching is let go
constexpr int REPORT_BLOCKS = 12;  // the page's state every few blocks
constexpr double BEND_T = 0.02;    // s: the pitch wheel's glide
constexpr double F_TOP = 0.45;     // × fs: a family bent past this stays there (unheard, and its two-pole still a resonator)
// The Quality: families played (n = 2 … 1 + this; n ≥ 4 ring 25–30 dB under the note), bowls
// sounding at once before the quietest untouched one is let go (a touched bowl only past
// MAX_VOICES, as at High), and the peak under which an untouched bowl stops (−90, −80, −70 dB)
constexpr int FAMILIES[3] = {MODES, 3, 2};
constexpr int VOICES[3] = {MAX_VOICES, 24, 16};
constexpr double QUIET[3] = {1e-5, 3e-5, 1e-4};

ArmonicaEngine::ArmonicaEngine(double fs)
    : Engine(fs), k(1 / fs),
      bowls([this](int key, uint64_t v) {
        const Snapshot &s = snapshots[v % snapshots.size()];
        BowlParams bp;
        bp.split = s.split.load(std::memory_order_relaxed); bp.loss = s.loss.load(std::memory_order_relaxed); bp.water = s.water.load(std::memory_order_relaxed);
        bp.ratio = s.ratio[key % 12].load(std::memory_order_relaxed);
        return std::make_unique<Bowl>(bowl(key, bp));
      }) {
  regulation(KEY_LO); // the regulation table and Rayleigh's integrals, computed now rather than at the first note
}

void ArmonicaEngine::setParams(const double *p) {
  const bool first = !hasParams;
  const forte::Tuning t = tuningOf(p);
  const bool rebuild = first || P[p::split] != p[p::split] || P[p::loss] != p[p::loss] || P[p::water] != p[p::water] || !(t == tuning);
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  tuning = t;
  hasParams = true;
  fr = friction(P[p::wet], P[p::v0], P[p::rough]);
  if (first) Wbar = TAU * P[p::speed];
  if (rebuild) { // a new version of every bowl: the voices pick theirs up at the next block
    version++;
    Snapshot &s = snapshots[version % snapshots.size()];
    s.split.store(P[p::split], std::memory_order_relaxed); s.loss.store(P[p::loss], std::memory_order_relaxed); s.water.store(P[p::water], std::memory_order_relaxed);
    for (int i = 0; i < 12; i++) s.ratio[i].store(tuning.r[i], std::memory_order_relaxed);
    bowls.prepare(version, KEY_MIN, KEY_MAX, focus >= KEY_MIN ? focus : 69);
  }
}

// A new voice on its key's slot.
void ArmonicaEngine::start(Voice &v, int key) {
  v = Voice{};
  v.key = key;
  v.cap = FAMILIES[(int)quality];
  v.Nreg = regulation(key);
  v.after = pressureAll;
  const auto [pl, pr] = keyPan(key, 0.7, KEY_LO, KEY_HI); // across the compass; the bowls past it at its ends
  v.pl = pl; v.pr = pr;
  v.nb = expr.bendOf(key); // a bend sent before the key starts it there
  if (auto d = bowls.get(key, version)) build(v, *d.data, version); // otherwise once its bowl is ready (a few ms; at once in WebAssembly)
}

// (Re)derive everything that depends on the bowl, keeping the motion.
void ArmonicaEngine::build(Voice &v, const Bowl &b, uint64_t ver) {
  const int N = std::min(b.count, v.cap), keep = v.built ? std::min(N, v.N) : 0;
  for (int j = keep; j < MODES; j++) v.qc[j] = v.qc1[j] = v.qs[j] = v.qs1[j] = 0;
  v.b = b; v.N = N; v.version = ver; v.built = true;
  for (int i = 0; i < N; i++) {
    const Mode &m = b.modes[i];
    v.n[i] = m.n; v.nd[i] = m.n;
    v.cpsi[i] = std::cos(m.n * m.psi); v.spsi[i] = std::sin(m.n * m.psi);
    v.g[i] = m.n * m.bryan;        // Coriolis rate per unit spin
    v.gain[i] = m.n * m.rad * b.a; // far-field pressure per unit tangential rim velocity (× ρc/r)
    v.cmL[i] = std::cos(m.n * MIC[0]); v.smL[i] = std::sin(m.n * MIC[0]);
    v.cmR[i] = std::cos(m.n * MIC[1]); v.smR[i] = std::sin(m.n * MIC[1]);
    v.gcL[i] = v.gain[i] * v.cmL[i]; v.gsL[i] = v.gain[i] * v.smL[i]; v.gcR[i] = v.gain[i] * v.cmR[i]; v.gsR[i] = v.gain[i] * v.smR[i];
  }
  tune(v, bendNow * v.nb);
}

// The bowl's modes at r × their frequencies: pitch bend, as if the glass were r² stiffer (no real
// armonica can; the wheel moves every family together, keeping the split and the decay). A note's
// own bend does the same to its bowl alone. A family it lifts past F_TOP of the sample rate stops
// there rather than fold back under Nyquist (unbent, or at the wheel's ends, none comes near it).
void ArmonicaEngine::tune(Voice &v, double r) {
  const double top = F_TOP * fs;
  for (int i = 0; i < v.N; i++) {
    const Mode &m = v.b.modes[i];
    const ModeCoeffs c1 = modeCoeffs(std::min(m.f1 * r, top), m.sigma, fs), c2 = modeCoeffs(std::min(m.f2 * r, top), m.sigma, fs);
    v.a1c[i] = c1.a1; v.a2c[i] = c1.a2; v.buc[i] = c1.b; v.bc[i] = c1.b / m.M; // per unit mass; per newton
    v.a1s[i] = c2.a1; v.a2s[i] = c2.a2; v.bus[i] = c2.b; v.bs[i] = c2.b / m.M;
  }
  v.bent = r;
}

void ArmonicaEngine::pressure(double value, int key) { // MIDI aftertouch: channel (key −1) or polyphonic
  if (key < 0) { pressureAll = value; for (int i = 0; i < count; i++) voices[i]->after = value; }
  else for (int i = 0; i < count; i++) if (voices[i]->key == key) voices[i]->after = value;
}

void ArmonicaEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return; // no bowl outside A0–C8
  Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == key) v = voices[i];
  if (!v) {
    v = &slots[key - KEY_MIN];
    start(*v, key);
    voices[count++] = v;
    if (count > VOICES[(int)quality]) { // let go of the quietest bowl nobody is touching
      Voice *q = nullptr;
      for (int i = 0; i < count; i++) { Voice *x = voices[i]; if (!x->touch && x != v && (!q || x->peak < q->peak)) q = x; }
      if (q) q->dead = true;
      else if (count > MAX_VOICES) voices[0]->dead = true;
    }
  }
  v->touch = true; v->vel = velocity;
  focus = key;
}

void ArmonicaEngine::noteOff(int key, double) {
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (v.key == key && v.touch) { v.touch = false; v.Nlift = (v.Nn * k) / SKIN.lift; }
  }
}

void ArmonicaEngine::allNotesOff() { count = 0; }

// Normal force of the finger on the rim (N), relative to the key's regulated speaking threshold:
// the slider scales it, velocity sets how firmly the finger lands, aftertouch presses harder.
double ArmonicaEngine::force(const Voice &v) const { return v.touch ? v.Nreg * P[p::press] * (0.6 + 0.8 * v.vel) * (1 + v.after) : 0; }

void ArmonicaEngine::bend(double value) {
  bendTo = std::pow(2.0, std::clamp(value, -1.0, 1.0) * kBendSemitones / 12);
}

void ArmonicaEngine::noteBend(double ratio, int key) { expr.setBend(ratio, key); }

void ArmonicaEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += 128) run(L + at, R + at, std::min(128, n - at));
  bowls.audioCycle();
}

void ArmonicaEngine::run(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  if (!hasParams) return;
  // voices whose bowl changed (or was not ready when the key went down) pick up the new one
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    if (v.built && v.version == version) continue;
    if (auto d = bowls.get(v.key, version)) build(v, *d.data, version);
  }
  // pitch bend glides, and each note's own; the bowls whose bend moved are retuned each block
  if (bendNow != bendTo) {
    bendNow += (bendTo - bendNow) * (1 - std::exp((-n * k) / BEND_T));
    if (std::fabs(bendNow - bendTo) < 1e-9) bendNow = bendTo;
  }
  for (int i = 0; i < count; i++) {
    Voice &v = *voices[i];
    v.nb = glideTo(v.nb, expr.bendOf(v.key), n * k, BEND_T);
    if (v.built && v.bent != bendNow * v.nb) tune(v, bendNow * v.nb);
  }
  // The spindle: speed follows the treadle through the flywheel (0.5 s), with the foot's push
  // once per turn; cos nθ, sin nθ for every family.
  Wbar += (TAU * P[p::speed] - Wbar) * (1 - std::exp((-n * k) / 0.5));
  double th = theta;
  const double treadle = P[p::treadle];
  for (int i = 0; i < n; i++) {
    th += Wbar * (1 + treadle * std::cos(th)) * k;
    const double c1 = std::cos(th), s1 = std::sin(th);
    C[1][i] = c1; S[1][i] = s1;
    for (int m = 2; m <= N_MAX; m++) { C[m][i] = C[m - 1][i] * c1 - S[m - 1][i] * s1; S[m][i] = S[m - 1][i] * c1 + C[m - 1][i] * s1; }
  }
  theta = std::fmod(th, TAU);
  const double W = Wbar, fsd = fs;
  const double mud = fr.mud, dmu = fr.dmu, v0 = fr.v0, beta = fr.beta, noise = fr.noise, iv0 = 1 / v0;
  const double lam = 1 - std::exp(-k / SKIN.land);
  const double Yp = 1 / (SKIN.m / k + SKIN.c + SKIN.k * k), mk = SKIN.m / k; // pad: u⁺ = u0 − Yp F
  // One bowl's block. Medium and Low (LEAN) solve the same equations with fewer divisions and
  // gather the mics' sums: the same sound, rounded differently.
  auto play = [&](Voice &v, auto lean) {
    constexpr bool LEAN = decltype(lean)::value;
    const int NM = v.N;
    double *qc = v.qc.data(), *qc1 = v.qc1.data(), *qs = v.qs.data(), *qs1 = v.qs1.data();
    const double *a1c = v.a1c.data(), *a2c = v.a2c.data(), *bc = v.bc.data(), *a1s = v.a1s.data(), *a2s = v.a2s.data(), *bs = v.bs.data(), *nn = v.nd.data();
    double *CX = v.cx.data(), *SX = v.sx.data(), *DC = v.dc.data(), *DS = v.ds.data(), *BET = v.bet.data(), *BES = v.bes.data();
    const double *G = v.gain.data();
    double *DET = v.det.data();
    for (int j = 0; j < NM; j++) { const double gw = (v.g[j] * W) / k; BET[j] = v.buc[j] * gw; BES[j] = v.bus[j] * gw; DET[j] = 1 / (1 + BET[j] * BES[j]); }
    const double Nt = force(v), Vrim = W * v.b.a;
    const bool tr = focus == v.key;
    const double gr = 1 - std::exp((-TAU * Vrim) / (RIDGE * fsd));
    double pk = 0;
    for (int i = 0; i < n; i++) {
      if (v.touch) v.Nn += (Nt - v.Nn) * lam; else v.Nn = std::max(0.0, v.Nn - v.Nlift); // lands smoothly, lifts off in SKIN.lift
      const double Nf = v.Nn;
      const bool contact = Nf > 0;
      const double Fr = contact ? -pulpDamping(Nf) * v.wdot : 0;
      double vfree = 0, Yg = 0;
      for (int j = 0; j < NM; j++) {
        const double m = nn[j], cn = C[v.n[j]][i], sn = S[v.n[j]][i];
        const double cx = cn * v.cpsi[j] - sn * v.spsi[j], sx = sn * v.cpsi[j] + cn * v.spsi[j]; // χ = n(θ + ψ)
        CX[j] = cx; SX[j] = sx;
        // at the finger: tangential coupling (−sin χ, −cos χ), radial (−n cos χ, n sin χ)
        const double det = DET[j];
        const double Rc = a1c[j] * qc[j] - a2c[j] * qc1[j] - BET[j] * qs1[j] - bc[j] * m * cx * Fr;
        const double Rs = a1s[j] * qs[j] - a2s[j] * qs1[j] + BES[j] * qc1[j] + bs[j] * m * sx * Fr;
        const double pc = (Rc + BET[j] * Rs) * det, ps = (Rs - BES[j] * Rc) * det;
        qc1[j] = qc[j]; qs1[j] = qs[j]; qc[j] = pc; qs[j] = ps;
        if (contact) { // response of this doublet to a unit tangential force at the finger
          const double ec = -bc[j] * sx, es = -bs[j] * cx;
          const double dc = (ec + BET[j] * es) * det, ds = (es - BES[j] * ec) * det;
          DC[j] = dc; DS[j] = ds;
          vfree -= sx * (pc - qc1[j]) + cx * (ps - qs1[j]);
          Yg -= sx * dc + cx * ds;
        }
      }
      double F = 0;
      if (contact) {
        if constexpr (LEAN) { vfree *= fsd; Yg *= fsd; } else { vfree /= k; Yg /= k; }
        const double u0 = (mk * v.u - SKIN.k * v.x) * Yp;
        const double Y = Yg + Yp, s0 = Vrim + vfree - u0, c = Y * Nf;
        rng = (int32_t)((uint32_t)rng * 1664525u + 1013904223u); // fingerprint ridges: friction noise,
        v.nz += (noise * 1.7 * (rng / 2147483648.0) - v.nz) * gr;  // smoothed over a ridge passage
        const double nz = 1 + v.nz;
        const double md = mud * nz, dm = dmu * nz;
        // Stick if the force that holds s = 0 is within μs·N; otherwise slip in the direction of
        // s0 at the speed u solving u − |s0| + Y N μ(u) = 0, μ(u) = μd + Δμ/(1 + (u/v0)²) + βu,
        // by Newton from the last slip speed, kept inside the bracket (0, |s0|).
        if (std::fabs(s0) <= c * (md + dm)) { F = -s0 / Y; v.stick = true; v.s = 0; }
        else {
          const double sg = s0 > 0 ? 1 : -1, a = sg * s0;
          double lo = 0, hi = a, u = v.slip > 0 && v.slip < a ? v.slip : 0.5 * a, mu = 0;
          for (int it = 0; it < 20; it++) {
            const double x = LEAN ? u * iv0 : u / v0, e = 1 / (1 + x * x);
            mu = md + dm * e + beta * u;
            const double ph = u - a + c * mu;
            if (ph > 0) hi = u; else lo = u;
            if (std::fabs(ph) < 1e-12 + (LEAN ? 1e-7 : 1e-10) * a) break; // (LEAN: to 0.1 ppm of the slip)
            const double d = 1 + c * (beta - (LEAN ? 2 * dm * x * e * e * iv0 : (2 * dm * x * e * e) / v0));
            double un = u - ph / d;
            if (!(d > 0 && un > lo && un < hi)) un = 0.5 * (lo + hi);
            u = un;
          }
          F = -sg * Nf * mu; v.stick = false; v.slip = u; v.s = sg * u;
        }
        for (int j = 0; j < NM; j++) { qc[j] += DC[j] * F; qs[j] += DS[j] * F; }
        v.u = u0 - Yp * F; v.x += k * v.u;
      } else { v.x *= 0.995; v.u = 0; v.stick = false; v.slip = 0; v.s = Vrim; }
      v.F = F;
      // rim radial velocity under the finger (next sample's pulp damping) and at the mics
      double wd = 0, oL = 0, oR = 0;
      if constexpr (!LEAN) for (int j = 0; j < NM; j++) {
        const double dqc = qc[j] - qc1[j], dqs = qs[j] - qs1[j], cx = CX[j], sx = SX[j];
        wd += nn[j] * (sx * dqs - cx * dqc);
        // at azimuth α the radial motion of the cos/sin modes is −n cos(nα − χ), −n sin(nα − χ)
        oL -= G[j] * ((v.cmL[j] * cx + v.smL[j] * sx) * dqc + (v.smL[j] * cx - v.cmL[j] * sx) * dqs);
        oR -= G[j] * ((v.cmR[j] * cx + v.smR[j] * sx) * dqc + (v.smR[j] * cx - v.cmR[j] * sx) * dqs);
      }
      else for (int j = 0; j < NM; j++) { // the same sums, gathered: cos and sin (nα − χ) from those of χ
        const double dqc = qc[j] - qc1[j], dqs = qs[j] - qs1[j], cx = CX[j], sx = SX[j];
        const double pq = cx * dqc - sx * dqs, qq = sx * dqc + cx * dqs;
        wd -= nn[j] * pq;
        oL -= v.gcL[j] * pq + v.gsL[j] * qq;
        oR -= v.gcR[j] * pq + v.gsR[j] * qq;
      }
      v.wdot = wd * fsd;
      oL *= OUT * fsd; oR *= OUT * fsd;
      L[i] = (float)(L[i] + v.pl * oL); // a Float32Array's +=
      R[i] = (float)(R[i] + v.pr * oR);
      const double amp = std::fabs(oL) + std::fabs(oR);
      if (amp > pk) pk = amp;
      if (tr) { trS[tw] = (float)v.s; trF[tw] = (float)F; tw = (tw + 1) % TRACE; }
    }
    v.peak = pk;
    if (!v.touch && v.Nn == 0) { v.quiet = pk < QUIET[(int)quality] ? v.quiet + 1 : 0; if (v.quiet > 40) v.dead = true; }
  };
  for (int vi = 0; vi < count; vi++) {
    Voice &v = *voices[vi];
    if (v.dead || !v.built) continue;
    if (quality == Quality::high) play(v, std::false_type{});
    else play(v, std::true_type{});
  }
  int j = 0;
  for (int i = 0; i < count; i++) if (!voices[i]->dead) voices[j++] = voices[i];
  count = j;
  if (messages && ++tick >= REPORT_BLOCKS) { tick = 0; report(); }
}

// Throttled state for the page's views: the focused bowl's modes, its contact trace (oldest
// first), then the state itself.
void ArmonicaEngine::report() {
  const Voice *v = nullptr;
  for (int i = 0; i < count && !v; i++) if (voices[i]->key == focus) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  const int nm = v && v->built ? v->N : 0;
  if (v) {
    lastV = Wbar * v->b.a;
    m.type = msg::q; m.count = (uint16_t)(4 * nm);
    for (int j = 0; j < nm; j++) {
      m.values[4 * j] = (float)v->qc[j]; m.values[4 * j + 1] = (float)v->qs[j];
      m.values[4 * j + 2] = (float)v->qc1[j]; m.values[4 * j + 3] = (float)v->qs1[j];
    }
    post(m);
  }
  for (int which = 0; which < 2; which++) {
    const std::array<float, TRACE> &tr = which ? trF : trS;
    m.type = which ? msg::traceF : msg::traceS;
    for (int i = 0; i < TRACE;) {
      const int c = std::min(29, TRACE - i);
      m.count = (uint16_t)(c + 1); m.values[0] = (float)i;
      for (int q = 0; q < c; q++) m.values[1 + q] = tr[(tw + i + q) % TRACE];
      post(m);
      i += c;
    }
  }
  m.type = msg::state; m.count = 6;
  const double s[6] = {theta, Wbar / TAU, v ? v->Nn : 0, lastV, v && v->touch ? 1.0 : 0.0, (double)nm};
  for (int q = 0; q < 6; q++) m.values[q] = (float)s[q];
  post(m);
}

} // namespace forte::glass
