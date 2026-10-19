// tuning.cpp — the keyboard's tuning (tuning.h, shared/tuning.js).

#include "forte/tuning.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <vector>

namespace forte {
namespace {

const double PURE_FIFTH = 1200 * std::log2(1.5);
const double PC = 1200 * std::log2(531441.0 / 524288); // the Pythagorean comma
const double SC = 1200 * std::log2(81.0 / 80);         // the syntonic comma

// The fifths along the circle from E♭ to G♯ (fifth j joins CHAIN[j] to CHAIN[j + 1]).
constexpr int CHAIN[12] = {3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1, 8};
enum Fifth : int { EbBb, BbF, FC, CG, GD, DA, AE, EB, BFs, FsCs, CsGs };

double mod1200(double c) { return std::fmod(std::fmod(c, 1200) + 1200, 1200); }

// how much narrower than pure each fifth E♭–B♭ … C♯–G♯ is
void narrowing(int id, double (&t)[11]) {
  std::fill(t, t + 11, 0.0);
  auto set = [&](double by, std::initializer_list<int> which) { for (int j : which) t[j] = by; };
  switch (id) {
    case temperament::meantone: std::fill(t, t + 11, SC / 4); break;
    case temperament::sixth: std::fill(t, t + 11, SC / 6); break;
    case temperament::werckmeister: set(PC / 4, {CG, GD, DA, BFs}); break;
    case temperament::kirnberger: set(SC / 4, {CG, GD, DA, AE}); t[FsCs] = PC - SC; break;
    case temperament::vallotti: set(PC / 6, {FC, CG, GD, DA, AE, EB}); break;
    case temperament::young: set(PC / 6, {CG, GD, DA, AE, EB, BFs}); break;
    default: break; // Pythagorean: every fifth pure
  }
}

} // namespace

void temperamentCents(int id, double (&c)[12]) {
  if (id == temperament::just) {
    static const double R[12] = {1, 16.0 / 15, 9.0 / 8, 6.0 / 5, 5.0 / 4, 4.0 / 3, 45.0 / 32, 1.5, 8.0 / 5, 5.0 / 3, 16.0 / 9, 15.0 / 8};
    for (int d = 0; d < 12; d++) c[d] = 1200 * std::log2(R[d]);
    return;
  }
  if (id <= temperament::equal || id >= temperament::custom) { for (int d = 0; d < 12; d++) c[d] = 100.0 * d; return; }
  double t[11];
  narrowing(id, t);
  const int C = 3; // CHAIN[3] is C
  c[0] = 0;
  double x = 0;
  for (int j = C; j < 11; j++) { x += PURE_FIFTH - t[j]; c[CHAIN[j + 1]] = mod1200(x); }
  x = 0;
  for (int j = C - 1; j >= 0; j--) { x -= PURE_FIFTH - t[j]; c[CHAIN[j]] = mod1200(x); }
}

Tuning makeTuning(double pitch, double temper, double root, const double (&custom)[kCustomCents]) {
  const int pi = std::clamp((int)std::lround(pitch), 0, kPitchCount - 1);
  const int id = std::clamp((int)std::lround(temper), 0, temperament::count - 1);
  const int r0 = (((int)std::lround(root) % 12) + 12) % 12;
  double dev[12] = {};
  if (id == temperament::custom) {
    for (int d = 1; d < 12; d++) dev[d] = std::clamp(custom[d - 1], -kCentsRange, kCentsRange);
  } else if (id != temperament::equal) {
    double c[12];
    temperamentCents(id, c);
    for (int d = 0; d < 12; d++) dev[d] = c[d] - 100.0 * d;
  }
  const double a = dev[(9 - r0 + 12) % 12], scale = kPitches[pi] / 440, shift = 1200 * std::log2(scale);
  Tuning T;
  for (int pc = 0; pc < 12; pc++) {
    const double off = dev[(pc - r0 + 12) % 12] - a;
    T.cents[pc] = off + shift;
    T.r[pc] = scale * std::pow(2.0, off / 1200); // exactly 1 at A = 440 Hz in equal temperament
    if (T.r[pc] != 1) T.equal = false;
  }
  return T;
}

bool Tuning::operator==(const Tuning &o) const {
  for (int i = 0; i < 12; i++) if (r[i] != o.r[i]) return false;
  return true;
}

// ---- Scala files (shared/tuning.js readScala) --------------------------------------------------------

namespace {
std::string trim(const std::string &s) {
  const size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
  return a == std::string::npos ? std::string() : s.substr(a, b - a + 1);
}
std::string firstWord(const std::string &s) { std::istringstream in(s); std::string w; in >> w; return w; }
std::string fixed(double x, int digits) { char b[40]; std::snprintf(b, sizeof b, "%.*f", digits, x); return b; }

bool pitchCents(const std::string &s, int k, double &c, std::string &error) {
  if (s.find('.') != std::string::npos) {
    char *end = nullptr;
    c = std::strtod(s.c_str(), &end);
    if (end && *end == 0 && std::isfinite(c)) return true;
    error = "Its note " + std::to_string(k) + " (" + s + ") is not a number of cents.";
    return false;
  }
  const size_t slash = s.find('/');
  const std::string a = s.substr(0, slash), b = slash == std::string::npos ? "1" : s.substr(slash + 1);
  auto digits = [](const std::string &x) { return !x.empty() && x.find_first_not_of("0123456789") == std::string::npos; };
  const double r = digits(a) && digits(b) ? std::strtod(a.c_str(), nullptr) / std::strtod(b.c_str(), nullptr) : NAN;
  if (r > 0 && std::isfinite(r)) { c = 1200 * std::log2(r); return true; }
  error = "Its note " + std::to_string(k) + " (" + s + ") is not a ratio such as 3/2.";
  return false;
}
} // namespace

bool readScala(const std::string &text, double (&cents)[kCustomCents], std::string &name, std::string &error) {
  std::vector<std::string> lines;
  {
    std::string t = text;
    if (t.compare(0, 3, "\xEF\xBB\xBF") == 0) t.erase(0, 3); // a byte-order mark
    std::istringstream in(t);
    for (std::string l; std::getline(in, l);) {
      if (!l.empty() && l.back() == '\r') l.pop_back();
      if (!l.empty() && l[0] == '!') continue;
      lines.push_back(l);
    }
  }
  if (lines.size() < 2) { error = "This is not a Scala file (.scl): it has no description and number of notes."; return false; }
  name = trim(lines[0]);
  const std::string count = firstWord(lines[1]);
  char *end = nullptr;
  const long n = count.empty() ? 0 : std::strtol(count.c_str(), &end, 10);
  if (count.empty() || *end != 0 || n < 1) { error = "This is not a Scala file (.scl): its second line is not the number of notes."; return false; }
  std::vector<double> pitches;
  for (size_t i = 2; i < lines.size() && (long)pitches.size() < n; i++) {
    const std::string s = firstWord(lines[i]);
    if (s.empty()) continue;
    double c;
    if (!pitchCents(s, (int)pitches.size() + 1, c, error)) return false;
    pitches.push_back(c);
  }
  if ((long)pitches.size() < n) { error = "This Scala file says it has " + std::to_string(n) + " notes but lists " + std::to_string(pitches.size()) + "."; return false; }
  if (n != 12) { error = "This scale has " + std::to_string(n) + " notes to its period; Forte plays 12 notes to the octave."; return false; }
  if (std::abs(pitches[11] - 1200) > 0.01) { error = "This scale repeats every " + fixed(pitches[11], 2) + " cents, not at the octave (1200 cents)."; return false; }
  for (int i = 0; i < kCustomCents; i++) {
    const double c = pitches[i] - 100.0 * (i + 1);
    if (std::abs(c) > kCentsRange) {
      error = "Its note " + std::to_string(i + 1) + " lies " + fixed(std::abs(c), 1) + " cents from equal temperament; Forte keeps each note within 100.";
      return false;
    }
    cents[i] = std::round(c * 100) / 100;
  }
  return true;
}

} // namespace forte
