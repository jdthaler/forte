// tuning-tests.cpp — the keyboard's tuning (forte/tuning.h) against the temperaments' published
// tables, as test/tuning-tests.mjs checks shared/tuning.js, and Scala files read as the site reads them.

#include <cmath>
#include <string>

#include "check.h"
#include "forte/tuning.h"

using namespace forte;

static const double kZero[kCustomCents] = {};

TEST("tuning: each temperament is its published table (Barbour, Lindley, Young), to its last digit") {
  struct Row { int id; double c[12]; double tol; };
  const Row rows[] = {
    {temperament::meantone, {0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89}, 0.0051},
    {temperament::werckmeister, {0, 90.22, 192.18, 294.13, 390.22, 498.04, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18}, 0.0051},
    {temperament::sixth, {0, 88.59, 196.74, 304.89, 393.48, 501.63, 590.22, 698.37, 786.96, 895.11, 1003.26, 1091.85}, 0.0051},
    {temperament::kirnberger, {0, 90.22, 193.16, 294.13, 386.31, 498.04, 590.22, 696.58, 792.18, 889.74, 996.09, 1088.27}, 0.0051},
    {temperament::vallotti, {0, 94.13, 196.09, 298.04, 392.18, 501.96, 592.18, 698.04, 796.09, 894.13, 1000.00, 1090.22}, 0.0051},
    {temperament::young, {0, 90.2, 196.1, 294.1, 392.2, 498.0, 588.3, 698.0, 792.2, 894.1, 996.1, 1090.2}, 0.051},
    {temperament::pythagorean, {0, 113.69, 203.91, 294.13, 407.82, 498.04, 611.73, 701.96, 815.64, 905.87, 996.09, 1109.78}, 0.0051},
    {temperament::just, {0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 996.09, 1088.27}, 0.0051},
  };
  for (const Row &r : rows) {
    double c[12];
    temperamentCents(r.id, c);
    for (int pc = 0; pc < 12; pc++) CHECK_NEAR(c[pc], r.c[pc], r.tol);
  }
}

TEST("tuning: at the defaults every ratio is exactly 1; A4 is the pitch standard in every temperament on every root; ¼-comma meantone on D makes F♯–A♯ pure") {
  const Tuning T = makeTuning(0, temperament::equal, 0, kZero);
  CHECK(T.equal);
  for (int m = 0; m < 128; m++) CHECK(T.ratio(m) == 1);
  const double custom[kCustomCents] = {0, 0, 17, 0, -40, 0, 0, 0, 12, 0, 0};
  for (int p = 0; p < kPitchCount; p++) for (int t = 0; t < temperament::count; t++) for (int r = 0; r < 12; r++) {
    const Tuning U = makeTuning(p, t, r, custom);
    CHECK_NEAR(440 * U.ratio(69), kPitches[p], 1e-9);
  }
  const Tuning M = makeTuning(0, temperament::meantone, 2, kZero);
  CHECK_NEAR(1200 * std::log2(M.ratio(70) / M.ratio(66)) + 400, 1200 * std::log2(1.25), 1e-9);
  CHECK(!makeTuning(1, temperament::equal, 0, kZero).equal);
  CHECK_NEAR(makeTuning(1, temperament::equal, 0, kZero).offset(60), 1200 * std::log2(415.0 / 440), 1e-9);
}

TEST("tuning: custom cents on the root, A brought back; between keys the cents in between") {
  double c[kCustomCents] = {};
  c[3] = 40; c[8] = 10; // E (a major third above C) +40, A +10
  const Tuning T = makeTuning(0, temperament::custom, 0, c);
  CHECK_NEAR(T.offset(64), 30, 1e-9);
  CHECK_NEAR(T.offset(69), 0, 1e-9);
  CHECK_NEAR(T.offset(60), -10, 1e-9);
  CHECK_NEAR(1200 * std::log2(T.ratio(64.5)), 10, 1e-9);
}

TEST("tuning: Scala files read as the site reads them; one Forte can't play says why") {
  const std::string w =
      "! werckmeister3.scl\n!\nWerckmeister III (1691)\n 12\n!\n 256/243\n 192.18000\n 32/27\n 390.22500\n 4/3\n 1024/729\n"
      " 696.09000\n 128/81\n 888.26999\n 16/9\n 1092.18000\n 2/1\n";
  double c[kCustomCents];
  std::string name, error;
  CHECK(readScala(w, c, name, error));
  CHECK(name == "Werckmeister III (1691)");
  double t[12];
  temperamentCents(temperament::werckmeister, t);
  for (int i = 0; i < kCustomCents; i++) CHECK_NEAR(c[i], t[i + 1] - 100 * (i + 1), 0.0051);
  CHECK(!readScala("! x\n19-EDO\n19\n63.15789\n", c, name, error) && error.find("19 notes") != std::string::npos);
  CHECK(!readScala("x\n12\n100.25\n200.5\n300.75\n401.0\n501.25\n601.5\n701.75\n802.0\n902.25\n1002.5\n1102.75\n1203.0\n", c, name, error)
        && error.find("not at the octave") != std::string::npos);
  CHECK(!readScala("far\n12\n210.0\n200.0\n300.0\n400.0\n500.0\n600.0\n700.0\n800.0\n900.0\n1000.0\n1100.0\n2/1\n", c, name, error)
        && error.find("lies 110.0 cents") != std::string::npos);
  CHECK(!readScala("{\"forte\": \"presets\"}", c, name, error) && error.find("not a Scala file") != std::string::npos);
  CHECK(!readScala("x\n12\n3/0\n", c, name, error) && error.find("not a ratio") != std::string::npos);
}
