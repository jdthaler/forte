// kalimba-engine.cpp — the kalimba's engine (kalimba-engine.h).
#include "kalimba-engine.h"
#include <cmath>
#include <numbers>
#include <Eigen/Dense>
#include "forte/dsp.h"
namespace forte::kalimba {
namespace {
// Sound pressure (Pa at 1 m) to the engine's output, and a cap's click (Pa at 1 m) per m/s
// it lands at.
constexpr double OUT = 0.5;
constexpr double CAP_PA = 0.8;
constexpr double FINGER_T60 = 0.3, GRAB_T60 = 0.008; // a fingertip on a tine; the thumb catching it to pluck again

// The trapezoidal rule for M x'' + R x' + K x = f, f on the first coordinate only: the state
// [x, v] steps as s[n+1] = Ad s[n] + Bd (f[n] + f[n+1]).
template <int N>
void trapezoid(const Eigen::Matrix<double, N, N> &invM, const Eigen::Matrix<double, N, N> &K, const Eigen::Matrix<double, N, N> &R, double h,
               Eigen::Matrix<double, 2 * N, 2 * N> &Ad, Eigen::Matrix<double, 2 * N, 1> &Bd) {
  using Mat = Eigen::Matrix<double, 2 * N, 2 * N>;
  Mat A = Mat::Zero();
  A.template block<N, N>(0, N).setIdentity();
  A.template block<N, N>(N, 0) = -invM * K;
  A.template block<N, N>(N, N) = -invM * R;
  Eigen::Matrix<double, 2 * N, 1> B = Eigen::Matrix<double, 2 * N, 1>::Zero();
  B(N) = invM(0, 0);
  const Mat I = Mat::Identity(), lhs = I - (h / 2) * A;
  const auto lu = lhs.partialPivLu();
  Ad = lu.solve(I + (h / 2) * A);
  Bd = lu.solve(B * (h / 2));
}
} // namespace

void Body::set(const Box &b, int count) {
  const bool wasOpen = box.open;
  box = b;
  const double h = 1 / fs;
  const PlateMode &p11 = box.plate[0];
  M11 = p11.M;
  K11 = p11.M * std::pow(TAU * p11.f, 2);
  invIh = box.open ? 1 / box.Ih : 0;
  {
    Eigen::Matrix2d invM, K, R;
    invM << 1 / M11, 0, 0, invIh;
    K << K11 + box.kappa * p11.S * p11.S, box.kappa * p11.S, box.kappa * p11.S, box.kappa;
    R << box.Rp, 0, 0, box.Rh;
    Eigen::Matrix4d Ad4; Eigen::Vector4d Bd4;
    trapezoid<2>(invM, K, R, h, Ad4, Bd4);
    for (int i = 0; i < 4; i++) { Bd[i] = Bd4(i); for (int j = 0; j < 4; j++) Ad[i][j] = Ad4(i, j); }
  }
  if (!box.open) s[3] = 0; // shut: the air in the hole stops, holding whatever it had pushed
  else if (!wasOpen) s[3] = 0;
  for (int j = 1; j < PLATE_MODES; j++) {
    const PlateMode &pm = box.plate[j];
    Mode &m = modes[j];
    // the trapezoidal rule rings at (2/h) atan(ωh/2): stiffen the mode so that it rings at ω
    const double wWarp = 2 * fs * std::tan(TAU * std::min(pm.f, 0.45 * fs) / (2 * fs));
    m.M = pm.M; m.K = pm.M * wWarp * wWarp; m.R = pm.M * TAU * pm.f / PLATE_Q; m.S = pm.S;
    Eigen::Matrix<double, 1, 1> invM, K, R;
    invM << 1 / m.M; K << m.K; R << m.R;
    Eigen::Matrix2d Ad2; Eigen::Vector2d Bd2;
    trapezoid<1>(invM, K, R, h, Ad2, Bd2);
    for (int i = 0; i < 2; i++) { m.Bd[i] = Bd2(i); for (int k = 0; k < 2; k++) m.Ad[i][k] = Ad2(i, k); }
  }
  capCount = std::clamp(count, 0, MAX_CAPS);
  for (int c = 0; c < MAX_CAPS; c++) {
    CapState &cs = caps[c];
    for (int j = 0; j < PLATE_MODES; j++) cs.phi[j] = plateShape(box.plate[j], CAPS[c].x, CAPS[c].y);
    const double fr[2] = {CAPS[c].f1, CAPS[c].f2};
    for (int k = 0; k < 2; k++) {
      const ModeCoeffs mc = modeCoeffs(fr[k], sigmaFromT60(CAP_T60 / (k + 1)), fs);
      cs.a1[k] = mc.a1; cs.a2[k] = mc.a2; cs.b[k] = mc.b * fs * TAU * fr[k]; // a landing at 1 m/s rings at amplitude 1
    }
  }
}

void Body::reset() {
  for (double &x : s) x = 0;
  for (Mode &m : modes) m.x = m.v = 0;
  fPrev.fill(0);
  for (CapState &c : caps) { c.z = c.zd = 0; c.contact = true; c.y1[0] = c.y1[1] = c.y2[0] = c.y2[1] = 0; }
  capOut = 0;
}

void Body::preload(double F, const double *w) {
  // K x = f with f on the (1,1) mode: q = f/K11 and, through an open hole, U = −S q (the air
  // leaks out, so no pressure is left in the box); shut, the cavity stiffens the top.
  const PlateMode &p11 = box.plate[0];
  const double f0 = F * w[0];
  if (box.open) { s[0] += f0 / K11; s[1] += -p11.S * f0 / K11; }
  else s[0] += f0 / (K11 + box.kappa * p11.S * p11.S);
  fPrev[0] += f0;
  for (int j = 1; j < PLATE_MODES; j++) { modes[j].x += F * w[j] / modes[j].K; fPrev[j] += F * w[j]; }
}

double Body::run(const double *F) {
  // the (1,1) mode and the hole
  const double f = fPrev[0] + F[0];
  double n[4];
  for (int i = 0; i < 4; i++) n[i] = Ad[i][0] * s[0] + Ad[i][1] * s[1] + Ad[i][2] * s[2] + Ad[i][3] * s[3] + Bd[i] * f;
  for (int i = 0; i < 4; i++) s[i] = n[i];
  if (invIh == 0) s[3] = 0;
  const PlateMode &p11 = box.plate[0];
  const double pCav = -box.kappa * (p11.S * s[0] + s[1]); // the cavity's pressure
  const double aq = (F[0] - box.Rp * s[2] - K11 * s[0] + pCav * p11.S) / M11;
  const double aU = (pCav - box.Rh * s[3]) * invIh;
  double Qdd = p11.S * aq + aU;
  double acc[PLATE_MODES], x[PLATE_MODES], v[PLATE_MODES];
  acc[0] = aq; x[0] = s[0]; v[0] = s[2];
  fPrev[0] = F[0];
  for (int j = 1; j < PLATE_MODES; j++) {
    Mode &m = modes[j];
    const double fj = fPrev[j] + F[j];
    const double nx = m.Ad[0][0] * m.x + m.Ad[0][1] * m.v + m.Bd[0] * fj, nv = m.Ad[1][0] * m.x + m.Ad[1][1] * m.v + m.Bd[1] * fj;
    m.x = nx; m.v = nv;
    acc[j] = (F[j] - m.R * m.v - m.K * m.x) / m.M;
    x[j] = m.x; v[j] = m.v;
    Qdd += m.S * acc[j];
    fPrev[j] = F[j];
  }
  // The caps: resting, a cap rides the top until the top falls away from it faster than
  // gravity can follow; flying, it falls under gravity until it meets the top again, bounces
  // and rings.
  capOut = 0;
  const double h = 1 / fs;
  for (int c = 0; c < capCount; c++) {
    CapState &cs = caps[c];
    double w = 0, wd = 0, wa = 0;
    for (int j = 0; j < PLATE_MODES; j++) { w += cs.phi[j] * x[j]; wd += cs.phi[j] * v[j]; wa += cs.phi[j] * acc[j]; }
    if (cs.contact) {
      cs.z = w; cs.zd = wd;
      if (wa < -G) cs.contact = false;
    } else {
      cs.zd -= G * h;
      cs.z += cs.zd * h;
      if (cs.z <= w) {
        const double vr = wd - cs.zd; // how fast they meet
        if (vr > 0) for (int k = 0; k < 2; k++) cs.y1[k] += cs.b[k] * vr;
        if (vr < 1e-3 && wa >= -G) { cs.contact = true; cs.zd = wd; }
        else cs.zd = wd + CAP_RESTITUTION * std::max(vr, 0.0);
        cs.z = w;
      }
    }
    for (int k = 0; k < 2; k++) {
      const double y = cs.a1[k] * cs.y1[k] - cs.a2[k] * cs.y2[k];
      cs.y2[k] = cs.y1[k]; cs.y1[k] = y;
      capOut += k ? 0.5 * y : y;
    }
  }
  return RHO_AIR * Qdd / (4 * std::numbers::pi) + CAP_PA * capOut;
}

KalimbaEngine::KalimbaEngine(double fs) : Engine(fs), body(fs) { voices.reserve(kMaxVoices + 2); }

void KalimbaEngine::rebuildBody() {
  body.set(boxOf(P.data(), cover), (int)std::lround(P[p::buzz]));
  builtBox = P[p::box]; builtHole = P[p::hole]; builtCover = cover; builtCaps = (int)std::lround(P[p::buzz]);
}

void KalimbaEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  coverTarget = std::clamp(P[p::cover], 0.0, 1.0);
  if (!hasParams) { cover = coverTarget; rebuildBody(); }
  else if (P[p::box] != builtBox || P[p::hole] != builtHole || (int)std::lround(P[p::buzz]) != builtCaps) rebuildBody();
  hasParams = true;
  tineShape(P[p::back]); // the tine's modes, solved now rather than at the next note
}

void KalimbaEngine::setSustain(bool on) {
  sustain = on;
  if (!on && P[p::ring] < 0.5) for (Voice &v : voices) if (v.released) v.damped = true;
}

void KalimbaEngine::allNotesOff() { voices.clear(); body.reset(); }

void KalimbaEngine::noteOn(int key, double velocity) {
  if (!hasParams) return;
  for (Voice &x : voices) if (x.key == key) x.grabbed = true; // the thumb stops it before plucking again
  // Quality: past 32 tines ringing at Medium and 16 at Low, the oldest is stilled (as the thumb
  // stills one), and a tine is let go at −80 and −60 dB instead of −100
  if (quality != Quality::high) {
    int ringing = 0;
    for (const Voice &x : voices) ringing += !x.grabbed;
    if (ringing >= pick(kMaxVoices, 32, 16)) for (Voice &x : voices) if (!x.grabbed) { x.grabbed = true; break; }
  }
  Voice v;
  v.key = key;
  v.floor = pick(1e-5, 1e-4, 1e-3);
  const KeyModes km = keyModes(key, P.data());
  const double k = 1 / fs;
  double F0 = 0;
  for (int i = 0; i < km.count; i++) {
    const Mode &m = km.m[i];
    const ModeCoeffs c = modeCoeffs(m.f, m.sigma, fs);
    const double A = m.amp * velocity;
    // released from rest: A e^(−σt) cos ωt, so y[0] = A and y[−1] = A cos(ωk) / r
    v.modes[i] = {c.a1, c.a2, A, A * std::cos(TAU * m.f * k) * std::exp(m.sigma * k)};
    F0 += A; v.start += std::fabs(A);
  }
  v.count = km.count;
  const double x = bridgeX(key);
  const int mn[PLATE_MODES][2] = {{1, 1}, {3, 1}, {1, 3}, {3, 3}, {5, 1}, {1, 5}, {5, 3}, {3, 5}};
  for (int j = 0; j < PLATE_MODES; j++) v.w[j] = plateShape({mn[j][0], mn[j][1], 0, 0, 0}, x, BRIDGE_Y);
  body.preload(F0, v.w.data());
  if ((int)voices.size() >= kMaxVoices) voices.erase(voices.begin()); // the oldest goes
  voices.push_back(v);
}

void KalimbaEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && !v.released && !v.grabbed) {
    v.released = true;
    if (!sustain && P[p::ring] < 0.5) v.damped = true;
  }
}

void KalimbaEngine::process(float *L, float *R, int n) {
  if (!hasParams) { for (int i = 0; i < n; i++) L[i] = R[i] = 0; return; }
  // the finger over the hole glides (20 ms), and the box follows it
  if (cover != coverTarget) {
    cover += (coverTarget - cover) * (1 - std::exp(-n / (fs * 0.02)));
    if (std::fabs(cover - coverTarget) < 1e-4) cover = coverTarget;
    if (std::fabs(cover - builtCover) > 1e-4 || cover == coverTarget) rebuildBody();
  }
  const double finger = std::exp(-std::log(1000.0) / (FINGER_T60 * fs)), grab = std::exp(-std::log(1000.0) / (GRAB_T60 * fs));
  for (int i = 0; i < n; i++) {
    double F[PLATE_MODES] = {};
    for (Voice &v : voices) {
      double s = 0;
      for (int m = 0; m < v.count; m++) {
        Resonator &r = v.modes[m];
        const double y = r.a1 * r.y1 - r.a2 * r.y2;
        r.y2 = r.y1; r.y1 = y; s += y;
      }
      if (v.grabbed) v.level *= grab;
      else if (v.damped) v.level *= finger;
      s *= v.level;
      for (int j = 0; j < PLATE_MODES; j++) F[j] += s * v.w[j];
    }
    const float out = (float)(OUT * body.run(F));
    L[i] = R[i] = out;
  }
  // voices that have died away (−100 dB from their pluck, or Quality's floor), in place
  std::erase_if(voices, [](const Voice &v) {
    double s = 0;
    for (int m = 0; m < v.count; m++) s += std::fabs(v.modes[m].y1) + std::fabs(v.modes[m].y2);
    return !(v.level * s > v.floor * v.start);
  });
}

} // namespace forte::kalimba
