// params.cpp — parameter values: constraints, the control's travel, and text as the page shows it.

#include "forte/params.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace forte {

double constrain(const ParamInfo &p, double v) {
  if (!std::isfinite(v)) return p.def;
  if (p.kind != ParamKind::continuous) v = std::round(v);
  else if (p.step > 0) v = std::round(v / p.step) * p.step;
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

static double shown(const ParamFormat &f, double v) {
  return f.db ? f.scale * std::log10(v > f.floor ? v : f.floor) + f.offset : f.scale * v + f.offset;
}

void formatValue(const ParamInfo &p, double v, char *out, size_t size) {
  if (!size) return;
  if (p.kind == ParamKind::choice) {
    int i = (int)constrain(p, v);
    std::snprintf(out, size, "%s", i >= 0 && i < p.choiceCount ? p.choices[i] : "?");
  } else if (p.kind == ParamKind::toggle) {
    std::snprintf(out, size, "%s", v >= 0.5 ? "on" : "off");
  } else {
    const ParamFormat &f = p.format;
    double n = shown(f, v);
    if (n == 0) n = 0; // no "-0.0"
    std::snprintf(out, size, "%s%.*f%s", f.prefix, f.decimals, n, f.suffix);
    // the page writes a minus as −
    if (n < 0 && std::strlen(out) + 3 < size) {
      char *m = std::strchr(out + std::strlen(f.prefix), '-');
      if (m) { std::memmove(m + 3, m + 1, std::strlen(m + 1) + 1); m[0] = '\xe2'; m[1] = '\x88'; m[2] = '\x92'; }
    }
  }
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
  const ParamFormat &f = p.format;
  size_t np = std::strlen(f.prefix);
  if (np && !std::strncmp(text, f.prefix, np)) text += np;
  char buf[64]; // the number, with − read as -
  size_t j = 0;
  for (const char *c = text; *c && j < sizeof buf - 1; c++) {
    if (!std::strncmp(c, "\xe2\x88\x92", 3)) { buf[j++] = '-'; c += 2; }
    else buf[j++] = *c;
  }
  buf[j] = 0;
  char *end; double n = std::strtod(buf, &end);
  if (end == buf) return false;
  double x = f.db ? std::pow(10.0, (n - f.offset) / f.scale) : (n - f.offset) / f.scale;
  if (!std::isfinite(x)) return false;
  v = x < p.min ? p.min : x > p.max ? p.max : x; // not snapped to the step: the text's own precision
  return true;
}

uint32_t paramHash(const char *id) {
  uint32_t h = 2166136261u;
  for (const unsigned char *c = (const unsigned char *)id; *c; c++) { h ^= *c; h *= 16777619u; }
  return h & 0x7fffffffu;
}

} // namespace forte
