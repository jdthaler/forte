// core-tests.cpp — native unit tests for forte_core. Run: ctest, or the forte_tests binary.

#include <cstring>
#include <string>

#include "check.h"
#include "forte/params.h"
#include "format-vectors.h"

using namespace forte;

static const char *const kModes[] = {"flat", "domed"};
static const FormatSegment kPercent[] = {{INFINITY, "", " % of length", 100, 0, 1, false, false, false, false}};
static const FormatSegment kSeconds[] = {{INFINITY, "", " s", 1, 0, 1, false, false, false, false}};
static const FormatSegment kDb[] = {{0.0005, "", " dB", 0, -60, 1, false, false, false, true}, {INFINITY, "", " dB", 20, 0, 1, true, false, false, true}};
static const FormatSegment kFlat[] = {{0.025, "flat", "", 0, 0, -1, false, false, false, false}, {INFINITY, "", " h", 1, 0, 2, false, false, false, false}};
static const FormatSegment kSci[] = {{INFINITY, "", " N/m", 1, 0, 1, false, true, false, false}};
static const ParamInfo kStrike{"strike", "Strike point", "Mallet", ParamKind::continuous, 0, 0.5, 0.12, 0.005, false, true, nullptr, 0, kPercent, 1};
static const ParamInfo kT60{"t60", "Ring time", "Bar", ParamKind::continuous, 0.2, 20, 3, 0, true, false, nullptr, 0, kSeconds, 1};
static const ParamInfo kVolume{"volume", "Volume", "Output", ParamKind::continuous, 0, 2, 0.8, 0.01, false, true, nullptr, 0, kDb, 2};
static const ParamInfo kRise{"rise", "Dome rise", "Plate", ParamKind::continuous, 0, 4, 0.4, 0.05, false, true, nullptr, 0, kFlat, 2};
static const ParamInfo kStiff{"kH", "Stiffness", "Bridge", ParamKind::continuous, 1e5, 1e8, 1e7, 0, true, false, nullptr, 0, kSci, 1};
// the black hole's spin a = 1 − 10^(−u), as its page writes it (blackhole/src/ringdown-params.js)
static const FormatSegment kSpinText[] = {{0.9999999999999999, "a = ", "", -1, 1, 3, false, false, false, false, true, false},
                                          {1.9999999999999998, "a = ", "", -1, 1, 4, false, false, false, false, true, false},
                                          {INFINITY, "a = 1 \xe2\x88\x92 ", "", 1, 0, 1, false, true, false, false, true, true}};
static const ParamInfo kSpin{"spinU", "Spin", "Black hole", ParamKind::continuous, 0, 6, 0.5086383061657272, 0.005, false, true, nullptr, 0, kSpinText, 3};
static const ParamInfo kMode{"mode", "Shape", "Plate", ParamKind::choice, 0, 1, 0, 1, false, false, kModes, 2};

static std::string text(const ParamInfo &p, double v) { char b[64]; formatValue(p, v, b, sizeof b); return b; }

TEST("values are clamped, snapped to the step, and choices are whole") {
  CHECK_NEAR(constrain(kStrike, 0.1234), 0.125, 1e-12);
  CHECK(constrain(kStrike, 9) == 0.5);
  CHECK(constrain(kT60, 0.01) == 0.2);
  CHECK(constrain(kMode, 0.6) == 1);
  CHECK(constrain(kT60, NAN) == 3);
}
TEST("log parameters travel in log(value), like the page's sliders") {
  CHECK_NEAR(toNormalized(kT60, 2), 0.5, 1e-12); // √(0.2·20) = 2
  CHECK_NEAR(fromNormalized(kT60, 0.5), 2, 1e-12);
  CHECK_NEAR(toNormalized(kStrike, 0.25), 0.5, 1e-12);
}
TEST("values read as the page shows them") {
  CHECK(text(kStrike, 0.12) == "12.0 % of length");
  CHECK(text(kT60, 3) == "3.0 s");
  CHECK(text(kVolume, 0.5) == "\xe2\x88\x92" "6.0 dB");
  CHECK(text(kVolume, 0) == "\xe2\x88\x92" "60.0 dB");
  CHECK(text(kRise, 0) == "flat");
  CHECK(text(kRise, 0.4) == "0.40 h");
  CHECK(text(kStiff, 1e7) == "1.0e7 N/m");
  CHECK(text(kMode, 1) == "domed");
}
TEST("the black hole's spin reads as 1 − 10^(−u), with a superscript exponent near extremal") {
  CHECK(text(kSpin, 0) == "a = 0.000");
  CHECK(text(kSpin, 0.5086383061657272) == "a = 0.690");
  CHECK(text(kSpin, 1.5) == "a = 0.9684");
  CHECK(text(kSpin, 2) == "a = 1 \xe2\x88\x92 1.0\xc3\x97" "10\xe2\x81\xbb\xc2\xb2");         // a = 1 − 1.0×10⁻²
  CHECK(text(kSpin, 4.3) == "a = 1 \xe2\x88\x92 5.0\xc3\x97" "10\xe2\x81\xbb\xe2\x81\xb5"); // a = 1 − 5.0×10⁻⁵
  CHECK(text(kSpin, 6) == "a = 1 \xe2\x88\x92 1.0\xc3\x97" "10\xe2\x81\xbb\xe2\x81\xb6");   // a = 1 − 1.0×10⁻⁶
  double v = 0;
  CHECK(parseValue(kSpin, "a = 1 \xe2\x88\x92 1.0\xc3\x97" "10\xe2\x81\xbb\xe2\x81\xb4", v)); CHECK_NEAR(v, 4, 1e-12);
  CHECK(parseValue(kSpin, "a = 0.99", v)); CHECK_NEAR(v, 2, 1e-9);
  int bad = 0; // every step of the travel reads back as itself (clap-validator's round trip)
  for (int k = 0; k <= 1200; k++) {
    const double u = k * 0.005;
    const std::string t = text(kSpin, u);
    double back;
    if (!parseValue(kSpin, t.c_str(), back) || text(kSpin, back) != t) bad++;
  }
  CHECK(bad == 0);
}
TEST("numbers round as JavaScript's toFixed and toExponential do") {
  char b[64];
  jsToFixed(2.5, 0, b, sizeof b); CHECK(std::string(b) == "3");      // a tie goes up (printf: 2)
  jsToFixed(0.125, 2, b, sizeof b); CHECK(std::string(b) == "0.13"); // exactly 1/8
  jsToFixed(1.005, 2, b, sizeof b); CHECK(std::string(b) == "1.00"); // 1.00499999…
  jsToFixed(-0.001, 2, b, sizeof b); CHECK(std::string(b) == "-0.00"); // as JavaScript writes it
  jsToFixed(9.999, 2, b, sizeof b); CHECK(std::string(b) == "10.00");
  jsToExponential(99950, 2, b, sizeof b); CHECK(std::string(b) == "1.00e+5"); // a tie, carried into the exponent
  jsToExponential(123456, 1, b, sizeof b); CHECK(std::string(b) == "1.2e+5");
  jsToExponential(0.000123, 1, b, sizeof b); CHECK(std::string(b) == "1.2e-4");
}
TEST("typed values read back") {
  double v = 0;
  CHECK(parseValue(kStrike, "25 % of length", v)); CHECK_NEAR(v, 0.25, 1e-12);
  CHECK(parseValue(kStrike, "99", v)); CHECK(v == 0.5);
  CHECK(parseValue(kVolume, "\xe2\x88\x92" "6.0 dB", v)); CHECK_NEAR(v, 0.501187, 1e-6);
  CHECK(parseValue(kRise, "flat", v)); CHECK(v == 0);
  CHECK(parseValue(kStiff, "2.0e6 N/m", v)); CHECK_NEAR(v, 2e6, 1e-3);
  CHECK(parseValue(kMode, "domed", v)); CHECK(v == 1);
  CHECK(!parseValue(kT60, "loud", v));
}
TEST("every instrument's parameters read as the JavaScript writes them, and read back") {
  int bad = 0;
  for (const auto &vec : vectors::kAll) for (int i = 0; i < vec.count; i++) {
    const auto &c = vec.cases[i];
    std::string t = text(vec.param, c.v);
    if (t != c.text) { if (bad++ < 10) std::printf("       %s(%.17g): \"%s\", JavaScript \"%s\"\n", vec.name, c.v, t.c_str(), c.text); continue; }
    double back;
    if (!parseValue(vec.param, c.text, back) || text(vec.param, back) != t) { if (bad++ < 10) std::printf("       %s: \"%s\" does not read back\n", vec.name, c.text); }
  }
  CHECK(bad == 0);
}
TEST("every parameter's text reads back to the same text on either side of where its format changes (clap-validator's round trip)") {
  int bad = 0;
  for (const auto &vec : vectors::kAll) for (int i = 0; i + 1 < vec.param.formatCount; i++) {
    const double edge = vec.param.format[i].upTo;
    for (double v : {std::nextafter(edge, -INFINITY), edge, std::nextafter(edge, INFINITY), edge * (1 - 1e-4), edge * (1 + 1e-4) + 1e-9}) {
      if (!(v >= vec.param.min && v <= vec.param.max)) continue;
      const std::string t = text(vec.param, v);
      double back;
      if (!parseValue(vec.param, t.c_str(), back) || text(vec.param, back) != t) { if (bad++ < 10) std::printf("       %s(%.17g): \"%s\" reads back as \"%s\"\n", vec.name, v, t.c_str(), text(vec.param, back).c_str()); }
    }
  }
  CHECK(bad == 0);
}
TEST("parameter ids hash to stable 31-bit numbers") {
  CHECK(paramHash("volume") == paramHash("volume"));
  CHECK(paramHash("volume") != paramHash("room"));
  CHECK(paramHash("volume") < 0x80000000u);
  CHECK(paramHash("a") == (0xe40c292cu & 0x7fffffffu)); // FNV-1a of "a"
}

int main() { return check::run(); }
