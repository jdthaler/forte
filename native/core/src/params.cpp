// params.cpp — parameter values: constraints, the control's travel, and text as the page shows it.

#include "forte/params.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace forte {

double constrain(const ParamInfo &p, double v) {
  if (!std::isfinite(v)) return p.def;
  if (p.kind != ParamKind::continuous) v = std::round(v);
  else if (p.step > 0 && v != p.def) {
    // a value already on its step stays as it is: k·step need not round-trip (70 × 0.01 is not
    // 0.7), and a default or a saved state must read back as itself (the default even off its
    // step: the pyrophone's flame at ⅓ on a 0.001 step)
    const double s = std::round(v / p.step) * p.step;
    if (std::fabs(s - v) > 1e-9 * p.step) v = s;
  }
  return v < p.min ? p.min : v > p.max ? p.max : v;
}

double toNormalized(const ParamInfo &p, double v) {
  if (p.max <= p.min) return 0;
  double x = p.log && p.min > 0 ? std::log(v / p.min) / std::log(p.max / p.min) : (v - p.min) / (p.max - p.min);
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

double fromNormalized(const ParamInfo &p, double x) {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  return constrain(p, p.log && p.min > 0 ? p.min * std::pow(p.max / p.min, x) : p.min + (p.max - p.min) * x);
}

// ---- JavaScript's number formatting --------------------------------------------------------
// printf writes the exact decimal expansion of a double; JavaScript rounds it to the digits
// asked for, a tie going to the larger magnitude (printf would round a tie to even).

// Round the decimal digits d (no point) to `keep` of them; true if that carried a new first digit.
static bool roundDigits(std::string &d, size_t keep) {
  if (keep >= d.size()) { d.append(keep - d.size(), '0'); return false; }
  bool up = d[keep] >= '5'; // half or more: a tie (5 then zeros) also goes up
  d.resize(keep);
  if (!up) return false;
  for (size_t i = keep; i-- > 0;) {
    if (d[i] < '9') { d[i]++; return false; }
    d[i] = '0';
  }
  d.insert(d.begin(), '1');
  return true;
}

void jsToFixed(double x, int digits, char *out, size_t size) {
  char buf[512];
  std::snprintf(buf, sizeof buf, "%.*f", digits + 40, std::fabs(x));
  std::string s(buf);
  size_t dot = s.find('.');
  std::string d = s.substr(0, dot) + s.substr(dot + 1);
  size_t whole = dot;
  if (roundDigits(d, whole + digits)) whole++;
  std::string r = d.substr(0, whole);
  if (digits > 0) r += "." + d.substr(whole);
  std::snprintf(out, size, "%s%s", x < 0 ? "-" : "", r.c_str()); // JavaScript keeps the sign: (-0.001).toFixed(2) is "-0.00"
}

void jsToExponential(double x, int digits, char *out, size_t size) {
  if (x == 0) { std::string z = digits > 0 ? "0." + std::string(digits, '0') : "0"; std::snprintf(out, size, "%se+0", z.c_str()); return; }
  char buf[512];
  std::snprintf(buf, sizeof buf, "%.*e", digits + 40, std::fabs(x));
  std::string s(buf);
  size_t e = s.find('e');
  int exponent = std::atoi(s.c_str() + e + 1);
  std::string d = s.substr(0, 1) + s.substr(2, e - 2);
  if (roundDigits(d, 1 + digits)) { exponent++; d.resize(1 + digits); }
  std::string m = d.substr(0, 1);
  if (digits > 0) m += "." + d.substr(1);
  std::snprintf(out, size, "%s%se%c%d", x < 0 ? "-" : "", m.c_str(), exponent < 0 ? '-' : '+', std::abs(exponent));
}

// ---- the page's text ---------------------------------------------------------------------------

static const FormatSegment kPlain{INFINITY, "", "", 1, 0, 2, false, false, false, true};

// The number a segment writes for v, and the v it stands for.
static double numberOf(const FormatSegment &s, double v) {
  return s.scale * (s.log10 ? std::log10(v > 1e-300 ? v : 1e-300) : s.pow10neg ? std::pow(10.0, -v) : v) + s.offset;
}
static double valueOf(const FormatSegment &s, double n) {
  const double u = (n - s.offset) / s.scale;
  return s.log10 ? std::pow(10.0, u) : s.pow10neg ? -std::log10(u) : u;
}

// Superscript digits, ⁰ … ⁹, and the superscript minus and plus.
static const char *const kSuperscript[10] = {"\u2070", "\u00b9", "\u00b2", "\u00b3", "\u2074", "\u2075", "\u2076", "\u2077", "\u2078", "\u2079"};
static const char kSuperMinus[] = "\u207b", kSuperPlus[] = "\u207a", kTimesTen[] = "\u00d710";

static const FormatSegment &segmentFor(const ParamInfo &p, double v) {
  if (!p.formatCount) return kPlain;
  for (int i = 0; i < p.formatCount; i++) if (v <= p.format[i].upTo) return p.format[i];
  return p.format[p.formatCount - 1];
}

void formatValue(const ParamInfo &p, double v, char *out, size_t size) {
  if (!size) return;
  if (p.kind == ParamKind::choice) {
    int i = (int)constrain(p, v);
    std::snprintf(out, size, "%s", i >= 0 && i < p.choiceCount ? p.choices[i] : "?");
    return;
  }
  if (p.kind == ParamKind::toggle) { std::snprintf(out, size, "%s", v >= 0.5 ? "on" : "off"); return; }
  const FormatSegment &s = segmentFor(p, v);
  if (s.decimals < 0) { std::snprintf(out, size, "%s", s.prefix); return; }
  double n = numberOf(s, v);
  char body[64];
  if (s.exp) { // JavaScript writes 1.0e+5; the pages write 1.0e5, or 1.0×10⁵
    jsToExponential(std::fabs(n), s.decimals, body, sizeof body);
    char *e = std::strchr(body, 'e');
    if (e && s.superscript) {
      std::string t(body, e), digits = std::to_string(std::abs(std::atoi(e + 1)));
      t += kTimesTen;
      if (e[1] == '-') t += kSuperMinus;
      for (char d : digits) t += kSuperscript[d - '0'];
      std::snprintf(body, sizeof body, "%s", t.c_str());
    } else if (e && e[1] == '+') std::memmove(e + 1, e + 2, std::strlen(e + 2) + 1);
  } else {
    jsToFixed(std::fabs(n), s.decimals, body, sizeof body);
    if (std::strtod(body, nullptr) == 0) n = 0;
  }
  const char *sign = n < 0 ? (s.unicodeMinus ? "\xe2\x88\x92" : "-") : s.plus ? "+" : "";
  std::snprintf(out, size, "%s%s%s%s", s.prefix, sign, body, s.suffix);
}

// The number at the start of text (a sign +, -, −, digits, an exponent: e-4, or with
// `superscripts` ×10⁻⁴, which is otherwise left as a unit); null if there is none. decimals: the
// digits after the point.
static const char *readNumber(const char *text, bool superscripts, double &n, int &decimals) {
  std::string buf;
  const char *c = text;
  if (!std::strncmp(c, "\xe2\x88\x92", 3)) { buf += '-'; c += 3; }
  for (; *c; c++) {
    if ((*c >= '0' && *c <= '9') || *c == '.' || *c == '-' || *c == '+' || ((*c == 'e' || *c == 'E') && !buf.empty())) buf += *c;
    else break;
  }
  char *end;
  n = std::strtod(buf.c_str(), &end);
  if (end == buf.c_str()) return nullptr;
  size_t used = (size_t)(end - buf.c_str());
  const char *rest = text + used + (text[0] == '\xe2' ? 2 : 0);
  const size_t dot = buf.find('.');
  decimals = dot < used ? (int)std::strspn(buf.c_str() + dot + 1, "0123456789") : 0;
  const size_t nt = std::strlen(kTimesTen);
  if (superscripts && !std::strncmp(rest, kTimesTen, nt)) { // ×10, then a superscript exponent
    const char *e = rest + nt;
    int sign = 1, exponent = 0, digits = 0;
    if (!std::strncmp(e, kSuperMinus, 3)) { sign = -1; e += 3; }
    else if (!std::strncmp(e, kSuperPlus, 3)) e += 3;
    for (bool more = true; more;) {
      more = false;
      for (int d = 0; d < 10; d++) {
        const size_t len = std::strlen(kSuperscript[d]);
        if (!std::strncmp(e, kSuperscript[d], len)) { exponent = 10 * exponent + d; e += len; digits++; more = true; break; }
      }
    }
    if (digits) {
      n = std::strtod((buf.substr(0, used) + "e" + std::to_string(sign * exponent)).c_str(), nullptr);
      rest = e;
    }
  }
  return rest;
}

bool parseValue(const ParamInfo &p, const char *text, double &v) {
  while (*text == ' ') text++;
  if (p.kind == ParamKind::choice) {
    for (int i = 0; i < p.choiceCount; i++) if (!std::strcmp(text, p.choices[i])) { v = i; return true; }
    char *end; double i = std::strtod(text, &end);
    if (end == text) return false;
    v = constrain(p, i); return true;
  }
  if (p.kind == ParamKind::toggle) {
    if (!std::strcmp(text, "on") || !std::strcmp(text, "1")) { v = 1; return true; }
    if (!std::strcmp(text, "off") || !std::strcmp(text, "0")) { v = 0; return true; }
    return false;
  }
  const int count = p.formatCount ? p.formatCount : 1;
  const FormatSegment *segs = p.formatCount ? p.format : &kPlain;
  auto clamp = [&](double x) { return x < p.min ? p.min : x > p.max ? p.max : x; }; // not snapped: the text's own precision
  // First a segment that writes the text as it is (prefix, suffix, decimals) and whose range holds the value
  // read; then such a segment whose edge the text rounds to (a value written as "10.0 /s" just
  // below where "10 /s" starts reads back into its own segment); then one with the prefix and
  // suffix alone (typed text: "2 m"); then, any reading of the number.
  double fallback = NAN;
  for (int pass = 0; pass < 4; pass++) for (int i = 0; i < count; i++) {
    const FormatSegment &s = segs[i];
    double lo = i ? segs[i - 1].upTo : p.min, hi = s.upTo < p.max ? s.upTo : p.max;
    size_t np = std::strlen(s.prefix);
    const char *t = text;
    if (np && !std::strncmp(t, s.prefix, np)) t += np;
    else if (np && pass < 3) continue;
    if (s.decimals < 0) {
      if ((pass == 0 || pass == 2) && !*t) { v = clamp(s.offset); return true; }
      continue;
    }
    double n;
    int decimals;
    const char *rest = readNumber(t, s.superscript, n, decimals);
    if (!rest) continue;
    while (*rest == ' ') rest++;
    const char *suffix = s.suffix;
    while (*suffix == ' ') suffix++;
    const bool hasSuffix = !(*suffix && std::strncmp(rest, suffix, std::strlen(suffix)));
    const bool plus = *t == '+';
    if (pass < 2 && (std::strcmp(rest, suffix) || !(s.exp || decimals == s.decimals) || (plus && !s.plus) || (!plus && s.plus && n >= 0))) continue; // as formatValue writes it
    if (pass == 2 && !hasSuffix) continue;
    if (s.scale == 0) { // a number that stays put over the segment: if it is this one, the middle of the segment
      if ((pass == 0 || pass == 2) && std::fabs(n - s.offset) <= 0.5 * std::pow(10.0, -s.decimals)) { v = clamp(std::isfinite(hi) ? (lo + hi) / 2 : lo); return true; }
      continue;
    }
    double x = valueOf(s, n);
    if (!std::isfinite(x)) continue;
    const double first = i ? std::nextafter(lo, INFINITY) : lo; // a segment holds (lo, hi]
    if ((pass == 0 || pass == 2) && x >= lo - 1e-9 * std::fabs(lo) && x <= hi + 1e-9 * std::fabs(hi)) { v = clamp(std::min(std::max(x, first), hi)); return true; }
    if (pass == 1 && !s.exp) { // within rounding of one of the segment's edges: that edge
      for (double edge : {first, hi}) {
        if (!std::isfinite(edge) || (s.log10 && !(edge > 0))) continue;
        const double ne = numberOf(s, edge);
        if (std::fabs(n - ne) <= 0.5000001 * std::pow(10.0, -s.decimals)) { v = clamp(edge); return true; }
      }
    }
    if (pass == 3 && std::isnan(fallback)) fallback = x;
  }
  if (std::isnan(fallback)) return false;
  v = clamp(fallback);
  return true;
}

uint32_t paramHash(const char *id) {
  uint32_t h = 2166136261u;
  for (const unsigned char *c = (const unsigned char *)id; *c; c++) { h ^= *c; h *= 16777619u; }
  return h & 0x7fffffffu;
}

} // namespace forte
