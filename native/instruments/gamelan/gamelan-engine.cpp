// gamelan-engine.cpp — the Gamelan's engine (gamelan-engine.h).

#include "gamelan-engine.h"

#include <algorithm>
#include <cmath>

#include "forte/dsp.h"

namespace forte::gamelan {

constexpr double OUT = 0.3;
constexpr double CHORD = 0.04;    // s: strokes this close together are a chord, and the hand spares them
constexpr int POST_EVERY = 2048;  // samples between the views' messages

GamelanEngine::GamelanEngine(double fs) : Engine(fs) { voices.reserve(kMaxVoices + 1); }

void GamelanEngine::setParams(const double *p) {
  for (int i = 0; i < p::count; i++) P[i] = p[i];
  hasParams = true;
}

double GamelanEngine::beatOf(int key) const { return std::clamp(expr.slideOr(key, P[p::ombak]), 0.0, 15.0); }

// The partners' resonators for a beat: the low one (pengumbang) beat/2 under the note, the high
// one (pengisep) beat/2 over it, each mode × its own fundamental's ratio. A single instrument
// splits into two in phase, each with half its motion, when a beat first appears.
void GamelanEngine::tune(Voice &v, double beat) {
  const bool pair = v.d.pairs && beat > 0;
  if (pair && v.subs == 1) {
    v.sub[1] = v.sub[0];
    for (Sub &s : v.sub) {
      for (int i = 0; i < v.count; i++) { s.m[i].y1 *= 0.5; s.m[i].y2 *= 0.5; }
      s.tube.y1 *= 0.5; s.tube.y2 *= 0.5;
    }
    v.subs = 2;
  }
  const auto [gl, gr] = keyPan(v.key);
  const double hand = std::log(1000.0) / P[p::hand];
  for (int s = 0; s < v.subs; s++) {
    Sub &u = v.sub[s];
    const double off = v.subs == 2 ? (s == 0 ? -0.5 : 0.5) * beat : 0;
    u.f1 = v.d.f1 + off;
    const double r = u.f1 / v.d.f1;
    for (int i = 0; i < v.count; i++) {
      const Mode &m = v.d.m[i];
      const ModeCoeffs c = modeCoeffs(m.f * r, m.sigma + (v.damped ? hand : 0), fs);
      u.m[i].a1 = c.a1; u.m[i].a2 = c.a2; u.m[i].b = c.b; u.m[i].w = TAU * m.f * r; u.m[i].out = m.out;
    }
    if (v.d.hasTube) {
      const ModeCoeffs c = modeCoeffs(v.d.tube.f, v.d.tube.sigma, fs);
      u.tube.a1 = c.a1; u.tube.a2 = c.a2; u.tube.b = c.b; u.tube.w = TAU * v.d.tube.f; u.tube.out = v.d.tubeOut;
    }
    // the low partner on the left, the high on the right, about the key's own place
    const double side = v.subs == 2 ? (s == 0 ? 0.35 : -0.35) : 0;
    u.gl = gl * (1 + side); u.gr = gr * (1 - side);
  }
  v.beat = pair ? beat : 0;
}

void GamelanEngine::damp(Voice &v) {
  if (v.damped) return;
  v.damped = true;
  tune(v, v.beat);
}

void GamelanEngine::stroke(Voice &v, double velocity) {
  const double f1 = noteFreq(v.key, P.data());
  v.d = keyDesign(v.key, P.data(), velocity, f1);
  v.family = v.d.reg.family; v.band = v.d.reg.band;
  const int count = std::min(v.d.count, pick(kModes, 10, 6));
  for (int i = v.count; i < count; i++) for (Sub &s : v.sub) s.m[i] = Res{}; // modes this voice had no room for
  v.count = count;
  v.damped = false;
  tune(v, v.d.pairs ? beatOf(v.key) : 0);
  // each partner's player strikes their own bar: the pair carries the single instrument's power
  const double share = v.subs == 2 ? std::sqrt(0.5) : 1;
  for (int s = 0; s < v.subs; s++)
    for (int i = 0; i < v.count; i++) v.sub[s].m[i].y1 += v.sub[s].m[i].b * fs * v.d.m[i].amp * velocity * share;
  v.vel = velocity; v.age = 0;
}

void GamelanEngine::noteOn(int key, double velocity) {
  if (!hasParams || key < KEY_MIN || key > KEY_MAX) return;
  Voice *v = nullptr;
  for (Voice &x : voices) if (x.key == key) { v = &x; break; }
  if (!v) {
    if ((int)voices.size() >= kMaxVoices) { // the quietest goes
      auto q = std::min_element(voices.begin(), voices.end(), [&](const Voice &a, const Voice &b) { return level(a) < level(b); });
      voices.erase(q);
    }
    voices.emplace_back();
    v = &voices.back();
    v->key = key;
  }
  stroke(*v, velocity);
  v->held = true; v->released = false;
  // the other hand stops this player's last note (a metallophone's: the gongs ring on)
  if ((int)P[p::damping] == damping_::next && !sustain && (v->family == gangsa || v->family == saron)) {
    for (Voice &x : voices)
      if (&x != v && x.band == v->band && (x.family == gangsa || x.family == saron) && x.age > CHORD * fs) damp(x);
  }
  // Quality: past 24 voices ringing at Medium and 12 at Low, the oldest is damped
  if (quality != Quality::high) {
    int ringing = 0;
    for (const Voice &x : voices) ringing += !x.damped;
    if (ringing > pick(kMaxVoices, 24, 12)) {
      Voice *old = nullptr;
      for (Voice &x : voices) if (!x.damped && &x != v && (!old || x.age > old->age)) old = &x;
      if (old) damp(*old);
    }
  }
  focus = key;
  Message m; m.type = msgFocus; m.key = (int16_t)key; m.count = 5;
  m.values[0] = (float)v->beat; m.values[1] = 0; m.values[2] = (float)v->family;
  m.values[3] = (float)v->sub[0].f1; m.values[4] = (float)v->sub[v->subs - 1].f1;
  post(m);
}

void GamelanEngine::noteOff(int key, double) {
  for (Voice &v : voices) if (v.key == key && v.held) {
    v.held = false; v.released = true;
    if ((int)P[p::damping] == damping_::release && !sustain) damp(v);
  }
}

void GamelanEngine::setSustain(bool on) {
  sustain = on;
  if (on) return;
  const int mode = (int)P[p::damping];
  if (mode == damping_::release) { for (Voice &v : voices) if (v.released) damp(v); return; }
  if (mode != damping_::next) return;
  // the hand comes back down on every bar but each player's last stroke (and its chord)
  for (Voice &v : voices) {
    if (v.family != gangsa && v.family != saron) continue;
    int youngest = 1 << 30;
    for (const Voice &x : voices) if (x.band == v.band && (x.family == gangsa || x.family == saron)) youngest = std::min(youngest, x.age);
    if (v.age > youngest + CHORD * fs) damp(v);
  }
}

double GamelanEngine::level(const Voice &v) const {
  double e = 0;
  for (int s = 0; s < v.subs; s++) {
    const Sub &u = v.sub[s];
    for (int i = 0; i < v.count; i++) { const double a = u.m[i].w * u.m[i].y1, b = (u.m[i].y1 - u.m[i].y2) * fs; e += a * a + b * b; }
    if (v.d.hasTube) { const double a = u.tube.w * u.tube.y1, b = (u.tube.y1 - u.tube.y2) * fs; e += a * a + b * b; }
  }
  return std::sqrt(e);
}

void GamelanEngine::process(float *L, float *R, int n) {
  for (int i = 0; i < n; i++) L[i] = R[i] = 0;
  for (Voice &v : voices) {
    if (v.d.pairs) { const double b = beatOf(v.key); if (b != v.beat) tune(v, b); }
    const int count = v.count;
    const bool tube = v.d.hasTube, nl = v.d.G > 0 && v.d.round2 >= 0 && v.d.round2 < count;
    const int k2 = v.d.round2;
    const double kt = v.d.tubeK, G = v.d.G, Gm = v.d.Gamma;
    for (int s = 0; s < v.subs; s++) {
      Sub &u = v.sub[s];
      Res *m = u.m.data();
      const double w1 = m[0].w;
      for (int i = 0; i < n; i++) {
        double F0 = 0, F2 = 0, Ft = 0;
        if (tube) {
          F0 = -kt * (u.tube.y1 - u.tube.y2) * fs;
          Ft = kt * (m[0].y1 - m[0].y2) * fs;
        }
        if (nl) {
          const double u0 = w1 * m[0].y1, u2 = w1 * m[k2].y1;
          F0 -= w1 * (2 * G * u0 * u2 + Gm * u0 * u0 * u0);
          F2 = -w1 * G * u0 * u0;
        }
        double out = 0;
        {
          Res &r = m[0];
          const double y = r.a1 * r.y1 - r.a2 * r.y2 + r.b * F0;
          r.y2 = r.y1; r.y1 = y; out += r.out * r.w * y;
        }
        for (int p = 1; p < count; p++) {
          Res &r = m[p];
          const double y = r.a1 * r.y1 - r.a2 * r.y2 + (p == k2 ? r.b * F2 : 0);
          r.y2 = r.y1; r.y1 = y; out += r.out * r.w * y;
        }
        if (tube) {
          Res &r = u.tube;
          const double y = r.a1 * r.y1 - r.a2 * r.y2 + r.b * Ft;
          r.y2 = r.y1; r.y1 = y; out += r.out * r.w * y;
        }
        out *= OUT;
        L[i] = (float)(L[i] + u.gl * out); // a Float32Array's +=
        R[i] = (float)(R[i] + u.gr * out);
      }
    }
    v.age += n;
  }
  // finished voices (and any the physics lost), in place
  std::erase_if(voices, [&](const Voice &v) { const double l = level(v); return v.age > 0.05 * fs && !(l > 2e-5); });
  if ((sincePost += n) >= POST_EVERY) { sincePost = 0; postViews(); }
}

void GamelanEngine::postViews() {
  if (!messages) return;
  Message m; m.type = msgVoices;
  std::array<std::pair<double, int>, kMaxVoices> lv{};
  int nv = 0;
  for (const Voice &v : voices) lv[nv++] = {level(v), v.key};
  std::sort(lv.begin(), lv.begin() + nv, [](auto &a, auto &b) { return a.first > b.first; });
  nv = std::min(nv, 15);
  for (int i = 0; i < nv; i++) { m.values[2 * i] = (float)lv[i].second; m.values[2 * i + 1] = (float)lv[i].first; }
  m.key = (int16_t)nv; m.count = (uint16_t)(2 * nv);
  post(m);
  if (const Voice *v = voice(focus)) {
    Message f; f.type = msgFocus; f.key = (int16_t)focus; f.count = 5;
    f.values[0] = (float)v->beat; f.values[1] = (float)(v->age / fs); f.values[2] = (float)v->family;
    f.values[3] = (float)v->sub[0].f1; f.values[4] = (float)v->sub[v->subs - 1].f1;
    post(f);
  }
}

} // namespace forte::gamelan
