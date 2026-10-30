// clavicylinder-model.cpp — the clavicylinder's physics (clavicylinder-model.h).

#include "clavicylinder-model.h"

#include <algorithm>
#include <cmath>

#include "clavicylinder-params.h"
#include "forte/dsp.h"

namespace forte::clavicylinder {

static double shapeS(double b) { return (std::cosh(b) - std::cos(b)) / (std::sinh(b) - std::sin(b)); }

double modeShape(int n, double x) {
  const double b = BETA_L[n], s = shapeS(b);
  return std::cosh(b * x) + std::cos(b * x) - s * (std::sinh(b * x) + std::sin(b * x));
}

double modeSlope(int n, double x) {
  const double b = BETA_L[n], s = shapeS(b);
  return b * (std::sinh(b * x) - std::sin(b * x) - s * (std::cosh(b * x) + std::cos(b * x)));
}

// The geometry that fixes how the rubbed point moves: where it is and its lever (m), for a bar
// of length L.
static void rubbed(int key, int build, double L, double &xc, double &arm, bool &post) {
  post = build == 1 || (build == 0 && key < SPLIT);
  if (post) { xc = POST_AT; arm = POST; }
  else { xc = 1; arm = ARM * L; }
}

static double barLength(double f1, double h) {
  // ω₁ = (β₁L)² √(EI/ρA)/L², I/A = h²/12: the length that puts the lowest mode on the note
  const double cb = std::sqrt((E_IRON * h * h) / (12 * RHO_IRON));
  return std::sqrt((BETA_L[0] * BETA_L[0] * cb) / (TAU * f1));
}

double rubbedMass(int key, int build, double h) {
  const double L = barLength(keyFreq(key), h), m = RHO_IRON * WIDTH * h * L;
  double xc, arm; bool post;
  rubbed(key, build, L, xc, arm, post);
  const double hx = (-arm / L) * modeSlope(0, xc), hy = modeShape(0, xc);
  return m / (hx * hx + hy * hy);
}

// The cents filed off a bar on a post (see bar()): 5 at middle C and a third more for each key
// down to C2, then less again to none at A0 (where the cloth is small beside the bar); none above.
static double filing(int key) {
  if (key >= 75) return 0;
  if (key >= 36) return std::min(0.0, -5 - (60 - key) / 3.0);
  return -13 * (key - 21) / 15.0;
}

Bar bar(int key, const double *P, double fs) {
  Bar B;
  B.key = key;
  // the note: equal temperament × the keyboard's tuning (forte/tuning.h; exactly 1 at its defaults)
  B.f1 = keyFreq(key) * tuningOf(P).ratio(key);
  B.h = P[p::thick] / 1000;
  const int build = (int)P[p::build];
  // The rubbed point (on the post's tip, or up the bent end) moves (−arm·w′, w) per unit of a
  // mode: the swing of the lever with the bar's slope, and the bar's own rise. Chladni sets the
  // cylinder to rub it along the lowest mode's swing. He tuned each bar by filing once it was in
  // place with its cloth tied on (§36): the cloth rides on the rubbed point, so the free bar is cut
  // that much sharp; and the cloth's spring holds the bar to the glass while it sticks, which pulls
  // a sounding bar on a post sharp again, by 5 cents at middle C and a third of a cent more for
  // each key below (found by playing every key at the defaults), so he filed that much off.
  double fbar = B.f1, hx1 = 0, hy1 = 0, n1 = 1;
  for (int pass = 0; pass < 2; pass++) {
    B.L = barLength(fbar, B.h);
    B.m = RHO_IRON * WIDTH * B.h * B.L;
    rubbed(key, build, B.L, B.xc, B.arm, B.post);
    hx1 = (-B.arm / B.L) * modeSlope(0, B.xc); hy1 = modeShape(0, B.xc); n1 = std::hypot(hx1, hy1);
    const Pad pd = pad(P[p::wet], layersOf(P, B.post), B.L);
    fbar = B.f1 * std::sqrt(1 + (pd.m * n1 * n1) / B.m) * (B.post ? std::exp2(filing(key) / 1200) : 1);
  }
  B.fbar = fbar;
  const double r = B.arm / B.L;
  // the post (or the bent end) as a cantilever of the bar's section: f = 0.5596 √(EI/ρA)/l²
  B.flever = (0.5596 * std::sqrt((E_IRON * B.h * B.h) / (12 * RHO_IRON))) / (B.arm * B.arm);
  B.tx = hx1 / n1; B.ty = hy1 / n1;
  B.meff = B.m / (n1 * n1);
  // Regulated as a voicer would: each key's lever puts on the glass what its bar needs for the
  // same touch, so that every key speaks alike. A bar starts when the friction's fall outweighs
  // its loss, its rubbed mass × σ, and σ grows with the note (the iron loses a fixed fraction of
  // each cycle); the cloth, smaller in the treble, takes back some of that. So the force goes
  // with the rubbed mass and the note to the power 0.7 (found by trying every key), for bars of
  // the standard thickness: thicker bars than those need more pressure.
  B.reg = std::clamp((rubbedMass(key, build, H0) / rubbedMass(60, 0, H0)) * std::pow(keyFreq(key) / keyFreq(60), 0.7), 0.05, 10.0);
  // Once it sings, the rubbed point keeps pace with the glass, so a bar rubbed far out on its bent
  // end swings less than one rubbed on a post: Chladni set the border between the two where they
  // sounded alike, which the model does by the bar's hold on the bridge (reconstruction).
  {
    double xp, ap; bool pp;
    rubbed(key, 1, B.L, xp, ap, pp);
    B.balance = n1 / std::hypot((-ap / B.L) * modeSlope(0, xp), modeShape(0, xp));
  }
  // the cords: on the nodes, or moved by `cords` (negative: toward the ends)
  B.xs = std::clamp(NODE + P[p::cords], 0.02, 0.48);
  // the iron's loss factor, from the ring time at middle C (σ = π f η for every mode)
  const double eta = sigmaFromT60(P[p::t60]) / (std::numbers::pi * keyFreq(60));
  const double top = std::min(12000.0, 0.45 * fs);
  for (int n = 0; n < MODES; n++) {
    const double q = BETA_L[n] / BETA_L[0], f = B.fbar * q * q;
    if (f > top) break;
    BarMode &M = B.modes[B.count++];
    M.f = f;
    const double p1 = modeShape(n, B.xs), p2 = modeShape(n, 1 - B.xs);
    // each cord a dashpot where it holds the bar: σ = c φ²/(2m) for each
    M.sigma = std::numbers::pi * f * eta + (CORD_DAMP * (p1 * p1 + p2 * p2)) / (2 * B.m);
    // the lever is iron as thick as the bar: past its own cantilever resonance (damped by the wet
    // cloth on its tip) it no longer follows the bar's slope
    const double u = f / B.flever, lever = 1 / std::sqrt(1 + u * u * u * u);
    const double hx = -r * lever * modeSlope(n, B.xc), hy = modeShape(n, B.xc);
    M.c = B.tx * hx + B.ty * hy;
    M.cn = -B.ty * hx + B.tx * hy;
    // the cords pass on what they hold: the bar's twist over a short lever, and some of its swing
    // there (the cork gives)
    M.e = CORK * std::fabs(p1) + (TWIST / B.L) * std::fabs(modeSlope(n, B.xs));
  }
  return B;
}

Friction friction(double wet, double grip, double L) {
  Friction F;
  F.mud = std::max(0.05, 0.2 + 0.08 * grip);
  // Damp cloth grabs wet glass and lets go: friction falling steeply with slip. Nearly dry
  // cloth slides with little fall and much scratch; soaked cloth floats on its water, and the
  // small, thin strips of the treble bars soak through first, so there the fall is gone (Chladni:
  // with soaked cloth the tone goes dull and the high notes do not speak at all). Soap lowers
  // the grab, pumice sharpens it.
  const double dry = std::min(1.0, wet / 0.25), w4 = wet * wet * wet * wet;
  const double soak = std::max(0.02, 1 - 0.9 * w4 * (0.5 + (0.5 * 0.215) / L));
  F.dmu = 0.7 * (0.3 + 0.7 * dry) * soak * std::exp(0.8 * grip);
  F.v0 = 0.22;
  F.beta = 0.01;
  F.noise = 0.004 + 0.03 * (1 - wet) * (1 - wet) + 0.01 * std::max(0.0, grip);
  return F;
}

Pad pad(double wet, int layers, double L) {
  // Strips of broadcloth tied over the rubbed point, a patch as wide as the bar and about 5 mm
  // long at middle C, smaller and thinner for the higher notes (§31): wool broadcloth of about
  // 0.04 g/cm² a layer, 0.7 mm thick (heavier as it soaks up water; a third of its mass moves
  // with the glass), sheared through its layers in series (G ≈ 0.2 MPa, softer when wet).
  // Reconstruction, of the order of wet felt.
  const double n = std::max(1, layers), size = L / 0.215, area = WIDTH * 0.005 * size;
  const double t = 0.0007 * std::clamp(std::sqrt(size), 0.5, 1.2);
  Pad d;
  d.k = (0.2e6 * (1 - 0.5 * wet) * area) / (n * t);
  d.m = (n * 0.4 * area * (1 + 1.5 * wet)) / 3;
  d.zeta = 1 + 1.5 * wet;
  return d;
}

int layersOf(const double *P, bool post) {
  const int n = (int)std::lround(P[p::layers]);
  return post ? n : std::max(1, n - 1);
}

} // namespace forte::clavicylinder
