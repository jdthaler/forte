// params.h — an instrument's parameters and presets. tools/gen-native-params.mjs writes these
// tables from the JavaScript descriptor (<slug>/src/<slug>-instrument.js), which stays the
// single source of the metadata.
#pragma once

#include <cstddef>
#include <cstdint>

namespace forte {

enum class ParamKind : uint8_t { continuous, choice, toggle };

// How a value reads, as the JavaScript `fmt` shows it, inferred by tools/gen-native-params.mjs:
// for values up to `upTo`, prefix + number + suffix, where the number is scale·v + offset (or
// scale·log10(v) + offset, or scale·10^(−v) + offset), written as JavaScript's toFixed(decimals)
// or toExponential(decimals) would (1.0e5, or 1.0×10⁵ with `superscript`). decimals < 0: no
// number, the prefix alone (a word such as "flat"; offset holds its value).
struct FormatSegment {
  double upTo;
  const char *prefix, *suffix;
  double scale, offset;
  int decimals;
  bool log10, exp;
  bool plus;          // "+" before numbers ≥ 0
  bool unicodeMinus;  // "−" rather than "-"
  bool pow10neg = false;    // the number is scale·10^(−v) + offset (the black hole's spin, 1 − 10^(−u))
  bool superscript = false; // an exponent written ×10⁻⁴, not e-4
};

struct ParamInfo {
  const char *id;    // the JavaScript id; the plugins' parameter ids are hashed from it
  const char *label;
  const char *group;
  ParamKind kind;
  double min, max, def; // a choice: 0 … count − 1, def its default index; a toggle: 0 … 1
  double step;          // 0 = continuous
  bool log;             // the slider moves in log(value)
  bool perform;         // one of the controls a player reaches for while playing
  const char *const *choices = nullptr; // a choice's labels
  int choiceCount = 0;
  const FormatSegment *format = nullptr; // a continuous value's text; none: a plain number
  int formatCount = 0;
  const char *const *keys = nullptr; // a choice's option keys, as presets and links name them (shared/presets.js)
};

struct PresetValue {
  uint16_t param;
  double value;
};

struct Preset {
  const char *name;
  const PresetValue *values;
  uint16_t count;
};

// Clamp to the range and snap to the step (and choices and toggles to whole numbers).
double constrain(const ParamInfo &p, double v);
// Position 0..1 along the control (log parameters in log(value)), and back.
double toNormalized(const ParamInfo &p, double v);
double fromNormalized(const ParamInfo &p, double x);
// The value as the page shows it ("12.0 % of length", "−3.0 dB", a choice's label).
void formatValue(const ParamInfo &p, double v, char *out, size_t size);
// JavaScript's Number.prototype.toFixed and toExponential (exact, ties away from zero).
void jsToFixed(double x, int digits, char *out, size_t size);
void jsToExponential(double x, int digits, char *out, size_t size);
// Read a value typed in the same form (the number, with or without its unit), clamped to the
// range; false if unreadable.
bool parseValue(const ParamInfo &p, const char *text, double &v);
// A stable 31-bit id for a parameter, from its JavaScript id (FNV-1a).
uint32_t paramHash(const char *id);

} // namespace forte
