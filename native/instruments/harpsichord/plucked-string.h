// plucked-string.h — one harpsichord string in modal form and everything that touches it: its plectra,
// its damper felt and the buff's leather pad (harpsichord/src/string.js in C++, operation for
// operation). No audio, no allocation: the engine runs it, and so do the views' slow-motion pluck
// and the tests.
//
// Partial n is a damped oscillator stepped exactly between samples,
//   qₙ[t+1] = a₁ qₙ[t] − a₂ qₙ[t−1] + bₙ fₙ[t],  bₙ = (1 − a₁ + a₂)/ωₙ²,
// and point contacts at xᵢ (up to four) act through fₙ = Σᵢ φₙ(xᵢ) Fᵢ, each linear in the string's
// displacement once we know which are touching, Fᵢ = αᵢ − βᵢ uᵢ[t+1], uᵢ[t+1] = u_free,ᵢ + Σⱼ Cᵢⱼ Fⱼ.
// So each sample solves (I + βC)F = α − β u_free for the touching set (a one-sided contact that
// would pull is dropped and the rest solved again): the plectra rising and returning, the damper
// felt, the buff. Then each loaded plectrum's contact point slides by the friction law
// (plectrum.h), and when the string would pass the tip, the plectrum lets go.
#pragma once

#include <array>
#include <cstdint>

#include "plectrum.h"

namespace forte::harpsichord {

constexpr int MAXP = 4;   // contact points per string
constexpr int N_MAX = 90; // partials per string at most
namespace PT { enum : int { MAIN = 0, LUTE = 1, DAMPER = 2, BUFF = 3 }; }
// a plectrum's state: its row disengaged, below the string, or above it (it has plucked)
enum class Phase : uint8_t { off, under, above };

// The wire (harpsichord-model.h: IRON, BRASS).
struct Wire { const char *name; double E, rho, eta; };

// One string's design (harpsichord-model.h, stringDesign).
struct StringDesign {
  int key = 0, choir = 0;   // choir: 0 front 8′, 1 back 8′, 2 the 4′
  const Wire *mat = nullptr;
  double L = 0, d = 0, A = 0, mu = 0, EI = 0, T = 0, B = 0, f0 = 0, stress = 0, c = 0, Z = 0;
};
// Its partials (stringPartials): frequency, wavenumber, bridge-force gain, decay rates.
struct Partials {
  int N = 0;
  double nrm = 0;
  std::array<double, N_MAX> f{}, k{}, b{}, sigS{}, sigB{}, sigma{};
};

class PluckedString {
 public:
  // S, its partials, the sample rate (string.js: new PluckedString(S, parts, fs))
  void init(const StringDesign &S, const Partials &parts, double fs);
  // the string's own decay plus, per partial, an optional extra rate
  void setDamping(const double *extra);
  void setPoint(int p, double x);
  double dispAtQ(int p, const double *qq) const { return dispAtQ(p, qq, Na); }
  double dispAtQ(int p, const double *qq, int n) const;
  double staticCompliance(int p) const;
  // Arm plectrum p (MAIN or LUTE) for the next pluck: plectrum pl at x, its top `gap` below the
  // string at rest; jackUp: the jack is already above the string.
  void armPlectrum(int p, const Plectrum *pl, double x, double gap, bool engaged, bool jackUp);
  double energy() const;
  bool needsContacts(double liftMax, bool keyDown, bool buffOn) const;
  // Run n samples (string.js, render): adds the bridge force × gain × wts[w] into
  // seg[w·stride + t] (w = w0, w1); returns its half-range over the block.
  double render(int n, const double *lift, bool keyDown, const double *buffG, double *seg, int stride, const double *wts, int w0, int w1, double gain);
  void dropTop(double thr);
  void wake();
  void silence(); // q, q1 to zero, the contacts forgotten (asleep)

  // what a plectrum letting go reports (relInfo)
  struct Release { double F = 0, y = 0, u = 0, w = 0, s = 0, theta = 0; };
  void (*onRelease)(void *ctx, PluckedString &st, int p) = nullptr;
  void *ctx = nullptr;

  StringDesign S;
  int N = 0, Na = 0;
  double h = 0, fs = 0, nrm = 0;
  std::array<double, N_MAX> sigBase{}; // the partials' own rates
  std::array<double, N_MAX> qa{}, qb{}, A1{}, A2{}, Bin{}, BF{}, W{}, K{}, sig{}, extra{};
  // q (this step) and q1 (the last) swap roles each sample, as string.js swaps its arrays
  bool flip = false;
  double *q() { return flip ? qb.data() : qa.data(); }
  double *q1() { return flip ? qa.data() : qb.data(); }
  const double *q() const { return flip ? qb.data() : qa.data(); }
  const double *q1() const { return flip ? qa.data() : qb.data(); }
  std::array<double, MAXP> x{};
  std::array<std::array<double, N_MAX>, MAXP> PHI{}, PHB{};
  std::array<double, MAXP * MAXP> C{};
  bool cDirty = true;
  std::array<double, MAXP> uNow{}, uOld{}, uf{}, al{}, be{}, Fc{}, rhs{};
  std::array<uint8_t, MAXP> hv{}, act{};
  std::array<double, MAXP * MAXP> M{};
  std::array<int, MAXP> idx{}, sid{};
  // plectra (points MAIN and LUTE)
  std::array<Plectrum, 2> pl{};
  std::array<Phase, 2> phase{Phase::off, Phase::off};
  std::array<double, 2> gap{}, s{}, zOld{}, Kz{}, Fp{}, passDepth{};
  double Fd = 0;
  std::array<bool, 2> released{};
  std::array<Release, 2> relInfo{};
  double feltK = 0, feltR = 0, feltPre = 0, tongueK = 0, thick = 0, buffK = 0, buffR = 0;
  double peakF = 0, work = 0;

 private:
  void fillPoint(int p);
  void updateC();
  double cross(int p) const;
  double free(int n, double *seg, int stride, int w0, int w1, const double *wts, double gain);
  void solve();
  bool slide(int p, double F, double y);
  double slideF(double s) const;
  double slideG(double s) const;
  void ease(int p);
  void letGo(int p, double F, double y);
  struct { int p = 0; double y = 0, ufe = 0, Cpp = 0; bool tip = true; } sl; // scratch for the slide solve
};

} // namespace forte::harpsichord
