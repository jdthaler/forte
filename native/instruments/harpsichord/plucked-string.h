// plucked-string.h — one harpsichord string in modal form and everything that touches it: its plectra,
// its damper felt and the buff's leather pad. No audio, no allocation: the engine runs it, and so
// do the views' slow-motion pluck and the tests.
//
// Partial n is a damped oscillator stepped exactly between samples,
//   qₙ[t+1] = a₁ qₙ[t] − a₂ qₙ[t−1] + bₙ fₙ[t],  bₙ = (1 − a₁ + a₂)/ωₙ²,
// and point contacts at xᵢ (up to four) act through fₙ = Σᵢ φₙ(xᵢ) Fᵢ, each linear in the string's
// displacement once we know which are touching, Fᵢ = αᵢ − βᵢ uᵢ[t+1], uᵢ[t+1] = u_free,ᵢ + Σⱼ Cᵢⱼ Fⱼ.
// So each sample solves (I + βC)F = α − β u_free for the touching set (a one-sided contact that
// would pull is dropped and the rest solved again): the plectra rising and returning, the damper
// felt, the buff. Then each loaded plectrum's contact point slides by the friction law
// (plectrum.h), and when the string would pass the tip, the plectrum lets go.
//
// Tension modulation (Kirchhoff–Carrier), when kcOn: the wire's stretch raises its tension by
// δT = (EA/2L)∫u_x² = kc Σ gₙqₙ², gₙ = kₙ²/μ, and every partial's ω² by gₙδT, so a₁ falls by
// epₙδT (to first order). After a pluck the string runs so until δT has fallen below 1e-5 T (a
// hundredth of a cent), then linear again.
//
// Sympathetic strings (forte/sympathetic.h): partial n meets the bridge through cₙ = ±√(2σ_B,ₙ), its
// bridge loss σ_B = cₙ²/2; render adds the string's bridge signal Σ cₙ q̇ₙ (each step's change in q)
// to sym, when given, for the engine's sympathetic strings.
//
// The sideways polarisation (setSide): while the plectrum carries the string up, friction drags it
// along the plectrum, sideways by Δz at the plucking point, against its lateral stiffness. When it
// lets go, the string swings sideways too, from that triangle at rest: its lowest partials, each
// qₙ = φₙ(x) Δz/C_s (C_s = Σ φₙ²/ωₙ², the static compliance there). The bridge gives way sideways
// only by rocking, so it drains them at κ times the vertical rate (σ = σ_S + κσ_B) and they push
// on the board √κ times as hard (the rocking's lever): a quiet aftersound that outlasts the
// vertical swing, the harpsichord's two-stage decay. The damper felt and the buff damp them as
// point dashpots, σ = Rφ²/2. Linear and on their own: no contact touches them.
//
// A virginal's string (twoEnds) stands on the board at both ends: at x = L its force is Σ bₙqₙ, and at
// x = 0 the same partials push in phase where n is odd and against it where n is even, Σ |bₙ|qₙ =
// y − 2Σ_even bₙqₙ, added into the near bridge's two segments (3, 4) by nutW.
//
// The arpichordium's hook (hookOn) sits at the BUFF point, hookGap below the string: a one-sided
// contact, F = −k(u + gap) − R u̇ while the string presses on it (F ≥ 0), which it rattles against.
#pragma once

#include <array>
#include <cstdint>

#include "plectrum.h"

namespace forte::harpsichord {

constexpr int MAXP = 4;   // contact points per string
constexpr int N_MAX = 90; // partials per string at most
constexpr int NZ_MAX = 16; // sideways partials at most
namespace PT { enum : int { MAIN = 0, LUTE = 1, DAMPER = 2, BUFF = 3 }; }
// a plectrum's state: its row disengaged, below the string, or above it (it has plucked)
enum class Phase : uint8_t { off, under, above };

// The wire (harpsichord-model.h: IRON, BRASS).
struct Wire { const char *name; double E, rho, eta, etaE = 0; }; // etaE: the modulus's loss factor, by the bending energy's share

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
  // S, its partials, the sample rate
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
  // Run n samples: adds the bridge force × gain × wts[w] into seg[w·stride + t] (w = w0, w1);
  // returns its half-range over the block.
  double render(int n, const double *lift, bool keyDown, const double *buffG, double *seg, int stride, const double *wts, int w0, int w1, double gain,
                double *sym = nullptr);
  void dropTop(double thr);
  void limit(int n); // run only the first n partials from now on (the engine's Quality)
  // the sideways polarisation: its bridge conductance, κ × the vertical one (0: off), and how many
  // partials (at most NZ_MAX; the engine's Quality)
  void setSide(double kappa, int n);
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
  std::array<double, N_MAX> G{}, EP{}; // stretch weights gₙ = kₙ²/μ; a₁'s fall per newton, epₙ
  std::array<double, N_MAX> SC{};      // cₙ/h: the bridge signal per step's change in qₙ
  bool kcOn = false;                   // tension modulation (the engine's switch)
  bool stretched = false;              // plucked, and not yet back to linear
  double kc = 0, dT = 0;               // stretch stiffness EA/2L; the tension's rise
  // q (this step) and q1 (the last) swap roles each sample
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
  double hookK = 0, hookR = 0, hookGap = 0; // the arpichordium's hook (hookK 0: none on this string)
  bool hookOn = false;                      // its batten in (the engine's switch, per block)
  bool twoEnds = false;                     // a virginal's: its near bridge on the board too
  std::array<double, 2> nutW{};             // the near bridge's weights on segments 3 and 4
  double peakF = 0, work = 0;
  // the sideways polarisation (setSide): its partials' state and steps, and its damping state
  int Nz = 0;
  double kz = 0, gz = 0; // κ, √κ
  std::array<double, NZ_MAX> za{}, zb{}, Z1{}, Z2{}, Wz{}, sigSz{}, sigBz{};
  bool zFelt = false;                 // the felt damping them (as of the last block)
  double zBuff = 0;                   // the buff's share, as of the last block

 private:
  void fillPoint(int p);
  void updateC();
  double cross(int p) const;
  template <bool SY>
  double free(int n, double *seg, int stride, int w0, int w1, const double *wts, double gain, double *sym);
  void solve();
  bool slide(int p, double F, double y);
  double slideF(double s) const;
  double slideG(double s) const;
  void ease(int p);
  void letGo(int p, double F, double y);
  void sideSteps(bool felt, double bg);
  bool hooked() const { return hookOn && hookK > 0; }
  void nearEnd(double y, const double *qq, int Nn, double *seg, int stride, int t, double n0, double n1) const;
  double side(int n, double *seg, int stride, const double *wts, int w0, int w1, double gain, double *sym, bool felt, double bg);
  struct { int p = 0; double y = 0, ufe = 0, Cpp = 0; bool tip = true; } sl; // scratch for the slide solve
};

} // namespace forte::harpsichord
