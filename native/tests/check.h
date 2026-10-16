// check.h — a tiny test harness for the native tests: CHECK(cond) and TEST(name) { … },
// reported like the Node suites (ok / FAIL lines, non-zero exit on failure).
#pragma once

#include <cmath>
#include <cstdio>
#include <functional>
#include <vector>

namespace check {
struct Case { const char *name; std::function<void()> fn; };
inline std::vector<Case> &cases() { static std::vector<Case> c; return c; }
inline int &failed() { static int f = 0; return f; }
inline bool &ok() { static bool o = true; return o; }
struct Add { Add(const char *n, std::function<void()> f) { cases().push_back({n, std::move(f)}); } };
inline int run() {
  for (auto &c : cases()) {
    ok() = true;
    c.fn();
    std::printf("  %s %s\n", ok() ? "ok  " : "FAIL", c.name);
    if (!ok()) failed()++;
  }
  std::printf(failed() ? "\n%d FAILED\n" : "\nall passed\n", failed());
  return failed() ? 1 : 0;
}
} // namespace check

#define CHECK_CAT2(a, b) a##b
#define CHECK_CAT(a, b) CHECK_CAT2(a, b)
#define TEST(name) static void CHECK_CAT(test_, __LINE__)(); static check::Add CHECK_CAT(add_, __LINE__)(name, CHECK_CAT(test_, __LINE__)); static void CHECK_CAT(test_, __LINE__)()
#define CHECK(cond) do { if (!(cond)) { check::ok() = false; std::printf("       %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_NEAR(a, b, tol) do { double a_ = (a), b_ = (b); if (!(std::fabs(a_ - b_) <= (tol))) { check::ok() = false; std::printf("       %s:%d: %s = %.17g, %s = %.17g\n", __FILE__, __LINE__, #a, a_, #b, b_); } } while (0)
