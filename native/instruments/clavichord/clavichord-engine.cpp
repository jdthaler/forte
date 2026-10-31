// clavichord-engine.cpp — the clavichord's engine (clavichord-engine.h).

#include "clavichord-engine.h"

#include <algorithm>
#include <cmath>
#include <numbers>

#include "forte/dsp.h"

namespace forte::clavichord {

using std::numbers::pi;

constexpr double OUT_BOARD = 0.056; // the microphones' pressure, as heard
constexpr double OUT_DIRECT = 4.5;  // the bridge force, as heard without the board
constexpr double FINGER_T = 0.003;  // s: how quickly the finger's pressure follows what it means
constexpr double BEB_IN = 0.25;     // s: the Bebung grows in after the stroke
constexpr int REPORT_BLOCKS = 4;    // the page's state every few blocks
constexpr double QUIET[3] = {2e-7, 1e-6, 3e-6}; // N: an open string under this (40 blocks) has stopped
constexpr double DROP[3] = {1e-5, 1e-4, 3e-4};  // a held string's top partials this far under its loudest stop

ClavichordEngine::ClavichordEngine(double fs) : Engine(fs), dt(1 / fs) {
  slides.fill(NAN);
  board.init(fs);
}

void ClavichordEngine::setParams(const double *p) {
  const Params old = mp;
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  mp = paramsOf(P.data());
  // the courses change with the fretting and the 4′s: what sounds fades out
  if (hasParams && (old.fretted != mp.fretted || old.octave != mp.octave))
    for (int i = 0; i < nVoices; i++) if (voices[i]->fadeStep == 0) voices[i]->fadeStep = 1 / (0.02 * fs);
  hasParams = true;
}

ClavichordEngine::Voice *ClavichordEngine::find(int course) {
  for (int i = 0; i < nVoices; i++) if (voices[i]->course == course && !voices[i]->dead && voices[i]->fadeStep == 0) return voices[i];
  return nullptr;
}

ClavichordEngine::Voice *ClavichordEngine::allocate(int course) {
  // too many sounding: the quietest open string fades out, or else the oldest course
  int live = 0;
  for (int i = 0; i < nVoices; i++) live += voices[i]->fadeStep == 0;
  if (live >= maxVoices()) {
    Voice *q = nullptr;
    for (int i = 0; i < nVoices; i++) { Voice *x = voices[i]; if (x->fadeStep == 0 && x->phase == Phase::open && (!q || x->peak < q->peak)) q = x; }
    if (!q) for (int i = 0; i < nVoices; i++) { Voice *x = voices[i]; if (x->fadeStep == 0 && (!q || x->age > q->age)) q = x; }
    if (q) q->fadeStep = 1 / (0.01 * fs);
  }
  Voice *v = nullptr;
  for (Voice &x : pool) if (!x.inUse) { v = &x; break; }
  if (!v) { // every slot busy (fading): the oldest goes at once
    int o = 0;
    for (int i = 1; i < nVoices; i++) if (voices[i]->age > voices[o]->age) o = i;
    v = voices[o];
    for (int i = o; i < nVoices - 1; i++) voices[i] = voices[i + 1];
    nVoices--;
  }
  *v = Voice{};
  v->inUse = true;
  v->course = course;
  v->nKeys = courseKeys(course, mp.fretted, v->keys.data());
  voices[nVoices++] = v;
  return v;
}

void ClavichordEngine::design(Voice &v) {
  v.nStr = choirsOf(v.course, mp);
  StringDesign S[CHOIRS];
  designCourse(v.course, mp, S, v.nStr);
  for (int c = 0; c < v.nStr; c++) v.s[c].S = S[c];
  v.w = segmentWeights(v.course);
  std::tie(v.pl, v.pr) = keyPan(v.course, 0.5, KEY_LO, KEY_HI);
  v.M = mp.mass * 1e-3;
}

double ClavichordEngine::fingerTarget(const Voice &v) const {
  const int key = v.keys[std::max(0, v.active)];
  const double pr = std::max(afterAll, after[key]);
  const double b = std::isnan(slides[key]) ? mp.bebung : slides[key];
  const double ramp = std::min(1.0, v.bebAge / BEB_IN);
  return mp.press * (1 + ACTION::after * pr) * (1 + ACTION::bebung * b * ramp * std::sin(v.beb));
}

// ---- moving the strings' shape between sets of partials

// The shape of string s now (or a sample ago), as pieces: with the tangent on it, the two straight
// lines to its ends and the speaking and afterlength partials; once it has left, the open string's.
// Partials far below the largest are left out (they are lost in what the new tangent starts).
int ClavichordEngine::pieces(const Voice &v, Phase phase, const Str &s, bool before, Piece *out, double propX, double propZ) const {
  int n = 0;
  const double l = s.S.l;
  if (phase == Phase::held || phase == Phase::lifting) {
    const double z = before ? v.z1 : v.z, L = s.Ls, a = l - L;
    out[n++] = {true, z / L, 0, 0, 0, 0, L};
    if (propX > L && propX < l) { // a lower tangent holding the afterlength up at (propX, propZ)
      const double s1 = (propZ - z) / (propX - L), s2 = -propZ / (l - propX);
      out[n++] = {true, s1, z - s1 * L, 0, 0, L, propX};
      out[n++] = {true, s2, -s2 * l, 0, 0, propX, l};
    } else out[n++] = {true, -z / a, z * l / a, 0, 0, L, l};
    double mx = 0;
    for (int i = 0; i < s.N; i++) mx = std::max(mx, std::fabs(before ? s.q1[i] : s.q[i]));
    for (int i = 0; i < s.M; i++) mx = std::max(mx, std::fabs(before ? s.p1[i] : s.p[i]));
    for (int i = 0; i < s.N; i++) { const double c = before ? s.q1[i] : s.q[i]; if (std::fabs(c) > 1e-3 * mx) out[n++] = {false, c, 0, s.sp.k[i], 0, 0, L}; }
    for (int i = 0; i < s.M; i++) { const double c = before ? s.p1[i] : s.p[i]; if (std::fabs(c) > 1e-3 * mx) out[n++] = {false, c, 0, s.af.k[i], -s.af.k[i] * L, L, l}; }
  } else if (phase == Phase::open) {
    for (int i = 0; i < s.J; i++) { const double c = before ? s.r1[i] : s.r[i]; if (c != 0) out[n++] = {false, c, 0, s.op.k[i], 0, 0, l}; }
  }
  return n;
}
double ClavichordEngine::eval(const Piece *pc, int n, double X) {
  double y = 0;
  for (int i = 0; i < n; i++) {
    const Piece &p = pc[i];
    if (X < p.x0 || X > p.x1 || (p.lin && X == p.x1 && p.x1 != 0)) continue; // a line's own end belongs to the next
    y += p.lin ? p.c * X + p.r : p.c * std::sin(p.w * X + p.ph);
  }
  return y;
}
double ClavichordEngine::project(const Piece *pc, int n, double w, double ph, double x0, double x1) {
  double s = 0;
  for (int i = 0; i < n; i++) {
    const Piece &p = pc[i];
    const double a = std::max(x0, p.x0), b = std::min(x1, p.x1);
    if (!(b > a)) continue;
    s += p.lin ? linSin(p.c, p.r, w, ph, a, b) : p.c * sinSin(p.w, p.ph, w, ph, a, b);
  }
  return s;
}

// Two-pole steps for a partial (impulse-invariant), and the force step's share c = r sin(ω_d k)/(ω_d k).
struct Step { double a1, a2, c, r, sn; };
static Step stepOf(double f, double sigma, double dt) {
  const double w = TAU * f, r = std::exp(-sigma * dt), wd = std::sqrt(std::max(1.0, w * w - sigma * sigma));
  return {2 * r * std::cos(wd * dt), r * r, r * std::sin(wd * dt) / (wd * dt), r, std::sin(wd * dt)};
}

// keys[idx]'s tangent onto the strings at `speed` (m/s; 0: it is there already, pressed under a
// tangent that has just left), from whatever shape they have.
void ClavichordEngine::strike(Voice &v, int idx, double speed, double propZ) {
  const bool fresh = v.phase == Phase::idle;
  if (v.phase != Phase::held && v.phase != Phase::lifting) design(v);
  const int key = v.keys[idx];
  Params q = mp;
  q.fmax = std::min(mp.fmax, fTop() / 1000);
  const double L8 = tangentPoint(key, mp);
  StringDesign S[CHOIRS];
  for (int c = 0; c < v.nStr; c++) S[c] = v.s[c].S;
  const Phase from = v.phase;
  v.active = idx;
  // the finger's pressure as it will be, and so the tension the strings settle at
  const double zr = restHeight(S, v.nStr, L8, fingerTarget(v));
  double zNew = 0, zOld = 0;
  for (int c = 0; c < v.nStr; c++) {
    Str &s = v.s[c];
    const double l = s.S.l, Ln = s.S.Lf * L8, an = l - Ln;
    Piece *now = scratch.data(), *bef = scratch.data() + scratch.size() / 2;
    int nn = 0, nb = 0;
    if (!fresh) {
      // handing over to a lower tangent that has been holding the strings up
      const double px = speed > 0 ? 0 : Ln, pz = speed > 0 ? 0 : propZ;
      nn = pieces(v, from, s, false, now, px, pz); nb = pieces(v, from, s, true, bef, px, pz);
    }
    if (c == 0) { zNew = eval(now, nn, Ln); zOld = eval(bef, nb, Ln); }
    // the new partials, at the tension the touch will hold
    const double T = tensionAt(s.S, zr, L8);
    speakingModes(s.S, L8, T, q, fs, nTop(), s.sp);
    afterModes(s.S, L8, T, q, mTop(), s.af);
    s.N = s.sp.N; s.M = s.af.N; s.J = 0; s.Tref = T;
    const double mu = s.S.mu, EI = s.S.EI;
    for (int i = 0; i < s.N; i++) {
      const int n = i + 1;
      const double k = s.sp.k[i], w = TAU * s.sp.f[i], sg = n % 2 ? -1 : 1;
      const Step st = stepOf(s.sp.f[i], s.sp.sigma[i], dt);
      s.A1[i] = st.a1; s.A2[i] = st.a2; s.G[i] = (2 * sg / (n * pi)) * st.c;
      s.EP[i] = st.r * st.sn * dt * k * k / (mu * w);
      s.KS[i] = sg * k; s.KB[i] = T * k + EI * k * k * k; s.KK[i] = k * k * Ln / 4;
      // what the strings already do, on the new speaking length
      const double nrm = 2 / Ln;
      s.q[i] = fresh ? 0 : nrm * (project(now, nn, k, 0, 0, Ln) - linSin(zNew / Ln, 0, k, 0, 0, Ln));
      s.q1[i] = fresh ? 0 : nrm * (project(bef, nb, k, 0, 0, Ln) - linSin(zOld / Ln, 0, k, 0, 0, Ln));
    }
    for (int i = 0; i < s.M; i++) {
      const int m = i + 1;
      const double k = s.af.k[i];
      const Step st = stepOf(s.af.f[i], s.af.sigma[i], dt);
      s.B1[i] = st.a1; s.B2[i] = st.a2; s.H[i] = -(2 / (m * pi)) * st.c;
      s.KA[i] = k; s.KKa[i] = k * k * an / 4;
      const double nrm = 2 / an;
      s.p[i] = fresh ? 0 : nrm * (project(now, nn, k, -k * Ln, Ln, l) - linSin(-zNew / an, zNew * l / an, k, -k * Ln, Ln, l));
      s.p1[i] = fresh ? 0 : nrm * (project(bef, nb, k, -k * Ln, Ln, l) - linSin(-zOld / an, zOld * l / an, k, -k * Ln, Ln, l));
    }
    s.T = tensionAt(s.S, zNew, L8);
    s.Ls = Ln; s.as = an;
    double sS = 0, sA = 0, kk = 0;
    for (int i = 0; i < s.N; i++) { sS += s.KS[i] * s.q[i]; kk += s.KK[i] * s.q[i] * s.q[i]; }
    for (int i = 0; i < s.M; i++) { sA += s.KA[i] * s.p[i]; kk += s.KKa[i] * s.p[i] * s.p[i]; }
    s.sumS = sS; s.sumA = sA; s.kc = kk;
  }
  v.L = L8; v.a = v.s[0].as;
  v.fnom = partialFreq(S[0], L8, tensionAt(S[0], restHeight(S, v.nStr, L8, PRESS_NOM), L8), 1);
  v.z = zNew; v.z1 = zOld;
  v.zv = speed > 0 ? speed : (zNew - zOld) / dt;
  if (speed > 0) { v.F = fingerTarget(v); v.bebAge = 0; v.beb = 0; }
  v.phase = Phase::held;
  v.quiet = 0;
}

// The tangent has dropped clear: the strings' shape, now the open string's from bridge to hitchpin.
void ClavichordEngine::toOpen(Voice &v) {
  for (int c = 0; c < v.nStr; c++) {
    Str &s = v.s[c];
    Piece *now = scratch.data(), *bef = scratch.data() + scratch.size() / 2;
    const int nn = pieces(v, v.phase, s, false, now), nb = pieces(v, v.phase, s, true, bef);
    openModes(s.S, s.S.T0, mp, fs, jTop(), s.op);
    s.J = s.op.N;
    const double l = s.S.l, T = s.S.T0;
    for (int i = 0; i < s.J; i++) {
      const double k = s.op.k[i];
      const Step st = stepOf(s.op.f[i], s.op.sigma[i], dt);
      s.C1[i] = st.a1; s.C2[i] = st.a2; s.KO[i] = T * k + s.S.EI * k * k * k;
      s.r[i] = (2 / l) * project(now, nn, k, 0, 0, l);
      s.r1[i] = (2 / l) * project(bef, nb, k, 0, 0, l);
    }
    s.N = 0; s.M = 0; s.T = T;
  }
  v.phase = Phase::open;
  v.active = -1;
  v.z = v.z1 = v.zv = 0;
  v.quiet = 0;
}

// ---- notes

void ClavichordEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  const int course = courseOf(key, mp.fretted);
  Voice *v = find(course);
  if (!v) v = allocate(course);
  const int idx = v->keys[0] == key ? 0 : 1;
  v->down[idx] = true; v->vel[idx] = velocity;
  // the tangent nearest the bridge sounds: a lower key pressed under a sounding upper one only rests on the strings
  if (!((v->phase == Phase::held || (v->phase == Phase::lifting && v->handTo >= 0)) && v->active > idx)) strike(*v, idx, tangentSpeed(velocity));
  focus = course;
}

void ClavichordEngine::noteOff(int key, double velocity) {
  if (key < KEY_MIN || key > KEY_MAX) return;
  Voice *v = find(courseOf(key, mp.fretted));
  if (!v) return;
  const int idx = v->keys[0] == key ? 0 : v->nKeys > 1 && v->keys[1] == key ? 1 : -1;
  if (idx < 0) return;
  v->down[idx] = false;
  if (v->handTo == idx) v->handTo = -1; // it lets go too: the strings go free
  if (v->active != idx || v->phase != Phase::held) return;
  const int other = 1 - idx;
  v->phase = Phase::lifting; v->lift = liftSpeed(velocity >= 0 ? velocity : DEFAULT_RELEASE); v->zv = 0; v->bebAge = 0;
  v->handTo = -1;
  if (v->nKeys > 1 && v->down[other]) {
    // the lower tangent, held up under the strings by its own finger, takes them back once this one
    // has come down past the line from the bridge over it
    StringDesign S[CHOIRS];
    for (int c = 0; c < v->nStr; c++) S[c] = v->s[c].S;
    const double Lo = tangentPoint(v->keys[other], mp);
    v->handTo = other;
    v->zHand = restHeight(S, v->nStr, Lo, mp.press) * v->L / Lo;
  }
}

void ClavichordEngine::allNotesOff() {
  for (Voice &v : pool) v.inUse = false;
  nVoices = 0;
  board.clear();
  dcx = dcy = 0;
}

void ClavichordEngine::pressure(double value, int key) {
  if (key < 0) afterAll = value;
  else if (key < 128) after[key] = value;
}
void ClavichordEngine::slide(double value, int key) { if (key >= 0 && key < 128) slides[key] = value; }

// ---- sound

void ClavichordEngine::render(Voice &v, int n) {
  double *seg0 = seg.data(), *seg1 = seg0 + BLOCK, *seg2 = seg1 + BLOCK;
  const double w0 = v.w[0], w1 = v.w[1], w2 = v.w[2], lam = 1 - std::exp(-dt / FINGER_T), R = ACTION::damping;
  const double dBeb = TAU * mp.rate * dt, liftG = 1 - std::exp(-dt / ACTION::liftIn);
  double pk = 0;
  for (int t = 0; t < n; t++) {
    double fb = 0, dyn = 0;
    if (v.phase == Phase::held || v.phase == Phase::lifting) {
      double zn;
      if (v.phase == Phase::held) {
        v.beb += dBeb; if (v.beb > TAU) v.beb -= TAU;
        v.bebAge += dt;
        v.F += (fingerTarget(v) - v.F) * lam;
        double force = v.F - R * v.zv;
        for (int c = 0; c < v.nStr; c++) { const Str &s = v.s[c]; force += s.T * (-v.z / s.Ls - s.sumS - v.z / s.as + s.sumA); }
        if (v.z > ACTION::bed) force -= ACTION::bedK * (v.z - ACTION::bed) + ACTION::bedR * v.zv;
        v.zv += dt * force / v.M;
        zn = v.z + dt * v.zv;
      } else {
        // the finger lets the key rise, at the speed the release velocity gives (reached within a
        // few milliseconds): the strings pull the tangent down as fast as the finger allows, and
        // leave it once they are straight
        v.zv += (-v.lift - v.zv) * liftG;
        zn = v.z + dt * v.zv;
        v.bebAge += dt;
      }
      const bool hand = v.phase == Phase::lifting && v.handTo >= 0 && zn <= v.zHand;
      const bool leave = v.phase == Phase::lifting && !hand && (zn <= 0 || v.bebAge > 0.3);
      if (leave) zn = std::min(zn, 0.0);
      const double d2 = zn - 2 * v.z + v.z1;
      for (int c = 0; c < v.nStr; c++) {
        Str &s = v.s[c];
        const double dT = s.T - s.Tref;
        double sS = 0, sB = 0, sA = 0;
        double *q = s.q.data(), *q1 = s.q1.data();
        const double *A1 = s.A1.data(), *A2 = s.A2.data(), *G = s.G.data(), *EP = s.EP.data(), *KS = s.KS.data(), *KB = s.KB.data();
        for (int i = 0; i < s.N; i++) {
          const double y = (A1[i] - EP[i] * dT) * q[i] - A2[i] * q1[i] + G[i] * d2;
          q1[i] = q[i]; q[i] = y;
          sS += KS[i] * y; sB += KB[i] * y;
        }
        double *p = s.p.data(), *p1 = s.p1.data();
        for (int i = 0; i < s.M; i++) {
          const double y = s.B1[i] * p[i] - s.B2[i] * p1[i] + s.H[i] * d2;
          p1[i] = p[i]; p[i] = y;
          sA += s.KA[i] * y;
        }
        s.sumS = sS; s.sumA = sA;
        // the tension: the static stretch over the tangent (the vibration's own stretch, Kirchhoff and
        // Carrier's, is a few thousandths of it here, and left out)
        s.T = s.S.T0 + (s.S.EA / s.S.l) * stretchOf(zn, s.Ls, s.as);
        fb += s.T * zn / s.Ls + sB; dyn += sB;
      }
      v.z1 = v.z; v.z = zn;
      if (leave) toOpen(v);
      else if (hand) strike(v, v.handTo, 0, v.zHand * tangentPoint(v.keys[v.handTo], mp) / v.L);
    } else if (v.phase == Phase::open) {
      for (int c = 0; c < v.nStr; c++) {
        Str &s = v.s[c];
        double *r = s.r.data(), *r1 = s.r1.data();
        double sB = 0;
        for (int i = 0; i < s.J; i++) {
          const double y = s.C1[i] * r[i] - s.C2[i] * r1[i];
          r1[i] = r[i]; r[i] = y;
          sB += s.KO[i] * y;
        }
        fb += sB; dyn += sB;
      }
    }
    if (v.fadeStep > 0) { v.fade -= v.fadeStep; if (v.fade <= 0) { v.fade = 0; v.dead = true; } }
    fb *= v.fade;
    seg0[t] += w0 * fb; seg1[t] += w1 * fb; seg2[t] += w2 * fb;
    bL[t] += v.pl * fb; bR[t] += v.pr * fb;
    pk = std::max(pk, std::fabs(dyn));
  }
  v.peak = pk; v.age += n * dt;
  if (v.phase == Phase::held) {
    // partials faded to 100 dB (Medium 80, Low 70) under the loudest stop being stepped: the tangent
    // holding still drives nothing new into them
    for (int c = 0; c < v.nStr; c++) {
      Str &s = v.s[c];
      double mx = 0;
      for (int i = 0; i < s.N; i++) mx = std::max(mx, std::fabs(s.q[i]));
      const double thr = DROP[(int)quality] * mx;
      while (s.N > 1 && std::fabs(s.q[s.N - 1]) < thr && std::fabs(s.q1[s.N - 1]) < thr) { s.N--; s.q[s.N] = s.q1[s.N] = 0; }
    }
  }
  if (v.phase == Phase::open) {
    v.quiet = pk < QUIET[(int)quality] ? v.quiet + 1 : 0;
    if (v.quiet > 40) v.dead = true;
    // flush what has died away before it decays into subnormal numbers
    for (int c = 0; c < v.nStr; c++) for (int i = 0; i < v.s[c].J; i++) { if (std::fabs(v.s[c].r[i]) < 1e-20) v.s[c].r[i] = 0; if (std::fabs(v.s[c].r1[i]) < 1e-20) v.s[c].r1[i] = 0; }
  }
}

void ClavichordEngine::process(float *L, float *R, int n) {
  for (int at = 0; at < n; at += BLOCK) block(L + at, R + at, std::min(BLOCK, n - at));
}

void ClavichordEngine::block(float *L, float *R, int n) {
  std::fill(seg.begin(), seg.end(), 0.0);
  std::fill(bL.begin(), bL.begin() + n, 0.0);
  std::fill(bR.begin(), bR.begin() + n, 0.0);
  if (hasParams) for (int i = 0; i < nVoices; i++) if (!voices[i]->dead) render(*voices[i], n);
  if (mp.board) {
    // (bL, bR held the direct path; the board replaces them)
    board.run(seg.data(), bL.data(), bR.data(), n);
    for (int i = 0; i < n; i++) { L[i] = (float)(OUT_BOARD * bL[i]); R[i] = (float)(OUT_BOARD * bR[i]); }
  } else {
    // the bridge force itself, its steady pull taken off (a 20 Hz high-pass)
    const double c = std::exp(-TAU * 20 / fs);
    for (int i = 0; i < n; i++) {
      const double m = 0.5 * (bL[i] + bR[i]);
      const double y = m - dcx + c * dcy; dcx = m; dcy = y;
      const double gl = m != 0 ? bL[i] / m : 1, gr = m != 0 ? bR[i] / m : 1;
      L[i] = (float)(OUT_DIRECT * y * gl * 0.5 * 1.414); R[i] = (float)(OUT_DIRECT * y * gr * 0.5 * 1.414);
    }
    board.clear();
  }
  int j = 0;
  for (int i = 0; i < nVoices; i++) { if (voices[i]->dead) voices[i]->inUse = false; else voices[j++] = voices[i]; }
  nVoices = j;
  if (messages && ++tick >= REPORT_BLOCKS) { tick = 0; report(); }
}

void ClavichordEngine::report() {
  const Voice *v = nullptr;
  for (int i = 0; i < nVoices && !v; i++) if (voices[i]->course == focus && voices[i]->fadeStep == 0) v = voices[i];
  Message m;
  m.key = (int16_t)focus;
  if (v) {
    const Str &s = v->s[0];
    const bool open = v->phase == Phase::open;
    const int nq = open ? std::min(10, s.J) : std::min(10, s.N), np = open ? 0 : std::min(4, s.M);
    m.type = msg::shape; m.count = 30;
    for (int i = 0; i < 10; i++) {
      const double x = i < nq ? (open ? s.r[i] : s.q[i]) : 0, x1 = i < nq ? (open ? s.r1[i] : s.q1[i]) : 0;
      m.values[i] = (float)x; m.values[10 + i] = (float)((x - x1) * fs);
    }
    for (int i = 0; i < 4; i++) {
      m.values[20 + i] = (float)(i < np ? s.p[i] : 0); m.values[24 + i] = (float)(i < np ? (s.p[i] - s.p1[i]) * fs : 0);
    }
    m.values[28] = (float)(open ? s.S.l : v->L); m.values[29] = (float)v->phase;
    post(m);
  }
  m.type = msg::state; m.count = 13;
  double cents = 0, Tr = 1;
  int key = -1;
  if (v && v->phase != Phase::open && v->active >= 0) {
    const Str &s = v->s[0];
    key = v->keys[v->active];
    // from the note as tuned: the pitch the nominal touch gives on this tangent
    cents = 1200 * std::log2(partialFreq(s.S, v->L, s.T, 1) / v->fnom); Tr = s.T / s.S.Tnom;
  }
  const double vals[13] = {v ? (double)v->phase : 0, v ? v->z : 0, v ? v->zv : 0, v ? v->F : 0, cents, v ? v->L : 0, v ? v->a : 0, v ? v->s[0].S.l : 0, Tr, v ? (double)v->nStr : 0, v ? v->peak : 0, (double)focus, (double)key};
  for (int i = 0; i < 13; i++) m.values[i] = (float)vals[i];
  m.key = (int16_t)key;
  post(m);
}

// ---- the soundboard

static void hpCoeffs(double f, double fs, double &b0, double &b1, double &b2, double &a1, double &a2) {
  const double w = (2 * pi * std::min(f, 0.45 * fs)) / fs, c = std::cos(w), al = std::sin(w) / std::numbers::sqrt2, a0 = 1 + al;
  b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; b2 = (1 + c) / 2 / a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
}
static double hp100(double f) { return (f / 100) / std::hypot(1.0, f / 100); } // the acoustic short circuit round the case
// |pressure per newton| at mic j from segment s, rms over the top third of the modal band: the
// residual path's level, so the two join.
static double residualGain(const BoardModel &B, int s, int j) {
  double e = 0;
  for (int i = 0; i < 32; i++) {
    const double f = B.fTop * (0.66 + (0.34 * i) / 31), w = 2 * pi * f;
    double re = 0, im = 0;
    for (int k = 0; k < B.K; k++) {
      const double wk = 2 * pi * B.f[k], d = wk * wk - w * w, s2 = 2 * B.sigma[k] * w, den = d * d + s2 * s2;
      const double gk = B.mic[2 * k + j] * hp100(B.f[k]) * B.phi[k * NSEG + s] * -w * w;
      re += (gk * d) / den; im -= (gk * s2) / den;
    }
    e += re * re + im * im;
  }
  return std::sqrt(e / 32);
}

void ClavichordEngine::Board::init(double fs) {
  const BoardModel &B = boardModel();
  const double k = 1 / fs;
  K = B.K;
  for (int i = 0; i < K; i++) {
    const double om = 2 * pi * B.f[i], sig = B.sigma[i], r = std::exp(-sig * k), od = std::sqrt(om * om - sig * sig);
    a1[i] = 2 * r * std::cos(od * k); a2[i] = r * r;
    const double b = (k * r * std::sin(od * k)) / od;
    for (int s = 0; s < NSEG; s++) ph[i * NSEG + s] = b * B.phi[i * NSEG + s];
    ml[i] = fs * fs * B.mic[2 * i] * hp100(B.f[i]); mr[i] = fs * fs * B.mic[2 * i + 1] * hp100(B.f[i]);
  }
  fb = 1 / (2 * pi * BOARD::mb * B.Ginf);
  lpG = 1 - std::exp((-2 * pi * fb) / fs);
  for (int s = 0; s < NSEG; s++) {
    const double g = std::hypot(residualGain(B, s, 0), residualGain(B, s, 1)), pan = ((0.5 * s - 0.5) * 1.0 + 1) * pi / 4;
    res[2 * s] = g * std::cos(pan); res[2 * s + 1] = g * std::sin(pan);
  }
  hpCoeffs(B.fTop, fs, b0, b1, b2, ha1, ha2);
}

void ClavichordEngine::Board::run(const double *sg, double *Lo, double *Ro, int n) {
  double *z = hz.data();
  for (int t = 0; t < n; t++) {
    double rl = 0, rr = 0;
    for (int s = 0; s < NSEG; s++) { lp[s] += lpG * (sg[s * BLOCK + t] - lp[s]); rl += res[2 * s] * lp[s]; rr += res[2 * s + 1] * lp[s]; }
    const double f0 = lp[0], f1 = lp[1], f2 = lp[2];
    double mlv = 0, mrv = 0;
    for (int i = 0, j = 0; i < K; i++, j += NSEG) {
      const double x0 = e0[i], x1 = e1[i];
      const double xn = a1[i] * x0 - a2[i] * x1 + ph[j] * f0 + ph[j + 1] * f1 + ph[j + 2] * f2;
      const double acc = xn - 2 * x0 + x1;
      e1[i] = x0; e0[i] = xn;
      mlv += ml[i] * acc; mrv += mr[i] * acc;
    }
    double y = rl;
    for (int b = 0; b < 2; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mlv += y;
    y = rr;
    for (int b = 2; b < 4; b++) { const int o = 2 * b; const double v = b0 * y + z[o]; z[o] = b1 * y - ha1 * v + z[o + 1]; z[o + 1] = b2 * y - ha2 * v; y = v; }
    mrv += y;
    Lo[t] = mlv; Ro[t] = mrv;
  }
  constexpr double TINY = 1e-30;
  auto flush = [](double &x) { if (std::fabs(x) < TINY) x = 0; };
  for (double &x : lp) flush(x);
  for (double &x : hz) flush(x);
  for (int i = 0; i < K; i++) { flush(e0[i]); flush(e1[i]); }
}

} // namespace forte::clavichord
