// core-tests.cpp — native unit tests for forte_core. Run: ctest, or the forte_tests binary.

#include <cstring>
#include <string>

#include "check.h"
#include "forte/params.h"

using namespace forte;

static const char *const kModes[] = {"flat", "domed"};
static const ParamInfo kStrike{"strike", "Strike point", "Mallet", ParamKind::continuous, 0, 0.5, 0.12, 0.005, false, true, nullptr, 0, {"", " % of length", 100, 0, 1}};
static const ParamInfo kT60{"t60", "Ring time", "Bar", ParamKind::continuous, 0.2, 20, 3, 0, true, false, nullptr, 0, {"", " s", 1, 0, 1}};
static const ParamInfo kVolume{"volume", "Volume", "Output", ParamKind::continuous, 0, 2, 0.8, 0.01, false, true, nullptr, 0, {"", " dB", 20, 0, 1, true, 1e-3}};
static const ParamInfo kMode{"mode", "Shape", "Plate", ParamKind::choice, 0, 1, 0, 1, false, false, kModes, 2, {}};

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
  CHECK(text(kMode, 1) == "domed");
}
TEST("typed values read back") {
  double v = 0;
  CHECK(parseValue(kStrike, "25 % of length", v)); CHECK_NEAR(v, 0.25, 1e-12);
  CHECK(parseValue(kStrike, "99", v)); CHECK(v == 0.5);
  CHECK(parseValue(kStrike, "30", v)); CHECK_NEAR(v, 0.3, 1e-12);
  CHECK(parseValue(kVolume, "\xe2\x88\x92" "6.0 dB", v)); CHECK_NEAR(v, 0.501187, 1e-6);
  CHECK(parseValue(kMode, "domed", v)); CHECK(v == 1);
  CHECK(!parseValue(kT60, "loud", v));
}
TEST("parameter ids hash to stable 31-bit numbers") {
  CHECK(paramHash("volume") == paramHash("volume"));
  CHECK(paramHash("volume") != paramHash("room"));
  CHECK(paramHash("volume") < 0x80000000u);
  CHECK(paramHash("a") == (0xe40c292cu & 0x7fffffffu)); // FNV-1a of "a"
}

int main() { return check::run(); }
