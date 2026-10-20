// presets.cpp — your own presets as files in the site's format (presets.h, shared/presets.js).

#include "presets.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <thread>

#include "choc/containers/choc_Value.h"
#include "choc/text/choc_JSON.h"
#include "forte/tuning.h"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shellapi.h>
#pragma comment(lib, "shell32.lib")
#else
#include <spawn.h>
#include <sys/wait.h>
extern char **environ;
#endif

namespace forte {
namespace {

namespace fs = std::filesystem;
constexpr int kFormat = 1; // shared/presets.js, FORMAT

fs::path pathOf(const std::string &utf8) { return fs::path(std::u8string(utf8.begin(), utf8.end())); }
std::string utf8Of(const fs::path &p) { const std::u8string s = p.u8string(); return std::string(s.begin(), s.end()); }
std::string env(const char *k) { const char *v = std::getenv(k); return v ? v : ""; }

fs::path root() {
  if (const std::string d = env("FORTE_PRESETS_DIR"); !d.empty()) return pathOf(d);
#ifdef _WIN32
  const wchar_t *a = _wgetenv(L"APPDATA");
  return a && *a ? fs::path(a) / "Forte" / "Presets" : fs::path();
#elif defined(__APPLE__)
  const std::string h = env("HOME");
  return h.empty() ? fs::path() : pathOf(h) / "Library" / "Audio" / "Presets" / "Forte";
#else
  if (const std::string x = env("XDG_DATA_HOME"); !x.empty()) return pathOf(x) / "forte" / "presets";
  const std::string h = env("HOME");
  return h.empty() ? fs::path() : pathOf(h) / ".local" / "share" / "forte" / "presets";
#endif
}
fs::path folderOf(const InstrumentInfo &I) { const fs::path r = root(); return r.empty() ? r : r / I.slug; }

std::string jsNumber(double x);
// a choice whose options are numbers (440, 415) keeps them as numbers: its key is one when JavaScript's
// String() writes the number back the same
bool isNumber(const std::string &s) {
  if (s.empty()) return false;
  char *end = nullptr;
  std::strtod(s.c_str(), &end);
  return end && *end == 0 && jsNumber(std::strtod(s.c_str(), nullptr)) == s;
}
const char *keyOf(const ParamInfo &p, int k) { return p.keys ? p.keys[k] : p.choices[k]; }

// a value in a preset, as the plugin keeps it: a choice by its option key, a toggle as true or false
double valueOf(const ParamInfo &p, const choc::value::ValueView &v) {
  const bool number = v.isFloat() || v.isInt();
  if (p.kind == ParamKind::choice) {
    const std::string s = v.isString() ? std::string(v.getString()) : number ? jsNumber(v.get<double>()) : std::string();
    for (int k = 0; k < p.choiceCount; k++) if (s == keyOf(p, k)) return k;
    return p.def;
  }
  if (p.kind == ParamKind::toggle) {
    if (v.isBool()) return v.getBool() ? 1 : 0;
    if (number && (v.get<double>() == 0 || v.get<double>() == 1)) return v.get<double>();
    return p.def;
  }
  if (!number || !std::isfinite(v.get<double>())) return p.def;
  return constrain(p, v.get<double>());
}
// JSON as the site's JSON.stringify(…, null, 2) writes it, so a preset file is the same file
// wherever it was saved: numbers as JavaScript writes them, strings in UTF-8
std::string jsNumber(double x) {
  if (!std::isfinite(x)) return "null";
  if (x == 0) return "0";
  char buf[40];
  for (int digits = 1; digits <= 17; digits++) {
    std::snprintf(buf, sizeof buf, "%.*e", digits - 1, x);
    if (std::strtod(buf, nullptr) == x) break;
  }
  std::string s(buf);
  const bool neg = s[0] == '-';
  if (neg) s.erase(0, 1);
  const size_t e = s.find('e');
  const int n = std::atoi(s.c_str() + e + 1) + 1; // the value is 0.<digits> × 10^n
  std::string d = s.substr(0, e);
  d.erase(std::remove(d.begin(), d.end(), '.'), d.end());
  while (d.size() > 1 && d.back() == '0') d.pop_back();
  const int k = (int)d.size();
  std::string out;
  if (k <= n && n <= 21) out = d + std::string(n - k, '0');
  else if (0 < n && n <= 21) out = d.substr(0, n) + "." + d.substr(n);
  else if (-6 < n && n <= 0) out = "0." + std::string(-n, '0') + d;
  else out = d.substr(0, 1) + (k > 1 ? "." + d.substr(1) : "") + "e" + (n - 1 >= 0 ? "+" : "-") + std::to_string(std::abs(n - 1));
  return (neg ? "-" : "") + out;
}
std::string jsString(const std::string &s) {
  std::string q = "\"";
  for (unsigned char c : s) {
    if (c == '"') q += "\\\"";
    else if (c == '\\') q += "\\\\";
    else if (c == '\n') q += "\\n";
    else if (c == '\r') q += "\\r";
    else if (c == '\t') q += "\\t";
    else if (c == '\b') q += "\\b";
    else if (c == '\f') q += "\\f";
    else if (c < 0x20) { char u[8]; std::snprintf(u, sizeof u, "\\u%04x", c); q += u; }
    else q += (char)c;
  }
  return q + "\"";
}
// a parameter's value as the file has it: a choice by its option key, a toggle as true or false
std::string jsonOf(const ParamInfo &p, double v) {
  if (p.kind == ParamKind::toggle) return v > 0.5 ? "true" : "false";
  if (p.kind == ParamKind::choice) {
    const std::string key = keyOf(p, std::clamp((int)std::lround(v), 0, p.choiceCount - 1));
    return isNumber(key) ? key : jsString(key);
  }
  return jsNumber(v);
}

bool readText(const fs::path &file, std::string &text) {
  std::error_code ec;
  const auto size = fs::file_size(file, ec);
  if (ec || size > (1u << 20)) return false; // a preset file is a few kilobytes
  std::ifstream in(file, std::ios::binary);
  if (!in) return false;
  text.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}
// a file's presets, when it is a preset file of this instrument's
bool presetsIn(const InstrumentInfo &I, const std::string &text, choc::value::Value &presets, std::string &error) {
  choc::value::Value d;
  try { d = choc::json::parse(text); } catch (...) { error = "This file is not a Forte preset file (it is not JSON)."; return false; }
  if (!d.isObject() || !d.hasObjectMember("forte") || !d["forte"].isString() || d["forte"].getString() != "presets"
      || !d.hasObjectMember("presets") || !d["presets"].isArray()) {
    error = "This file is not a Forte preset file.";
    return false;
  }
  if (!d.hasObjectMember("instrument") || !d["instrument"].isString() || d["instrument"].getString() != I.slug) {
    error = "These presets are for another instrument.";
    return false;
  }
  presets = choc::value::Value(d["presets"]);
  return true;
}
std::string nameOf(const choc::value::ValueView &pr) {
  return pr.isObject() && pr.hasObjectMember("name") && pr["name"].isString() ? std::string(pr["name"].getString()) : std::string();
}
bool lessName(const std::string &a, const std::string &b) {
  return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end(), [](unsigned char x, unsigned char y) { return std::tolower(x) < std::tolower(y); });
}
// a preset's name as a file's: no characters a file system forbids, nor spaces or dots at the ends
std::string fileNameOf(const std::string &name) {
  std::string s;
  for (unsigned char c : name) s += c < 32 || std::string("\\/:*?\"<>|").find((char)c) != std::string::npos ? '-' : (char)c;
  while (!s.empty() && (s.back() == ' ' || s.back() == '.')) s.pop_back();
  while (!s.empty() && (s.front() == ' ' || s.front() == '.')) s.erase(s.begin());
  if (s.size() > 120) { s.resize(120); while (!s.empty() && ((unsigned char)s.back() & 0xc0) == 0x80) s.pop_back(); if (!s.empty() && (unsigned char)s.back() >= 0xc0) s.pop_back(); }
  return (s.empty() ? std::string("Preset") : s) + ".json";
}

} // namespace

std::string presetsFolder(const InstrumentInfo &I) { return utf8Of(folderOf(I)); }

std::vector<UserPreset> listPresets(const InstrumentInfo &I) {
  std::vector<UserPreset> out;
  std::error_code ec;
  const fs::path dir = folderOf(I);
  if (dir.empty()) return out;
  for (fs::directory_iterator it(dir, ec), end; !ec && it != end; it.increment(ec)) {
    const fs::path f = it->path();
    std::string ext = utf8Of(f.extension());
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) { return (char)std::tolower(c); });
    std::error_code e2;
    if (ext != ".json" || !it->is_regular_file(e2)) continue;
    std::string text, error;
    choc::value::Value presets;
    if (!readText(f, text) || !presetsIn(I, text, presets, error)) continue;
    for (uint32_t k = 0; k < presets.size(); k++) {
      std::string name = nameOf(presets[k]);
      if (name.empty()) name = utf8Of(f.stem()) + (presets.size() > 1 ? " " + std::to_string(k + 1) : "");
      out.push_back({name, utf8Of(f.filename()), (int)k});
    }
  }
  std::sort(out.begin(), out.end(), [](const UserPreset &a, const UserPreset &b) {
    if (a.name != b.name) return lessName(a.name, b.name) || (!lessName(b.name, a.name) && a.name < b.name);
    return a.file != b.file ? a.file < b.file : a.index < b.index;
  });
  return out;
}

bool readPreset(const InstrumentInfo &I, const std::string &file, int index, std::vector<double> &values, std::string &error) {
  const fs::path dir = folderOf(I), name = pathOf(file);
  if (dir.empty() || file.empty() || name.has_parent_path() || name.filename() != name) { error = "There is no such preset."; return false; }
  std::string text;
  choc::value::Value presets;
  if (!readText(dir / name, text)) { error = "The preset's file can't be read."; return false; }
  if (!presetsIn(I, text, presets, error)) return false;
  if (index < 0 || (uint32_t)index >= presets.size() || !presets[(uint32_t)index].isObject()) { error = "There is no such preset."; return false; }
  const choc::value::ValueView pr = presets[(uint32_t)index];
  const bool has = pr.hasObjectMember("values") && pr["values"].isObject();
  values.resize(I.paramCount);
  for (int i = 0; i < I.paramCount; i++) {
    const ParamInfo &p = I.params[i];
    values[i] = has && pr["values"].hasObjectMember(p.id) ? valueOf(p, pr["values"][p.id]) : p.def;
  }
  return true;
}

std::string presetText(const InstrumentInfo &I, const std::string &name, const double *values) {
  std::string t = "{\n  \"forte\": \"presets\",\n  \"format\": " + std::to_string(kFormat) + ",\n  \"instrument\": " + jsString(I.slug)
                  + ",\n  \"instrumentVersion\": " + jsString(I.version) + ",\n  \"presets\": [\n    {\n      \"name\": " + jsString(name)
                  + ",\n      \"values\": {";
  for (int i = 0; i < I.paramCount; i++) t += std::string(i ? "," : "") + "\n        " + jsString(I.params[i].id) + ": " + jsonOf(I.params[i], values[i]);
  return t + "\n      }\n    }\n  ]\n}\n";
}

std::string writePreset(const InstrumentInfo &I, const std::string &name, const double *values, std::string &error) {
  const fs::path dir = folderOf(I);
  if (dir.empty()) { error = "There is no folder for presets (no home folder)."; return ""; }
  std::error_code ec;
  fs::create_directories(dir, ec);
  const std::string file = fileNameOf(name);
  {
    std::ofstream out(dir / pathOf(file), std::ios::binary | std::ios::trunc);
    if (out) out << presetText(I, name, values);
    if (!out) { error = "The preset couldn't be saved in " + utf8Of(dir) + "."; return ""; }
  }
  return file;
}

std::string tuningsFolder() { const fs::path r = root(); return r.empty() ? std::string() : utf8Of(r / "Tunings"); }

std::vector<std::string> listScalas() {
  std::vector<std::string> out;
  std::error_code ec;
  const fs::path dir = pathOf(tuningsFolder());
  if (dir.empty()) return out;
  for (fs::directory_iterator it(dir, ec), end; !ec && it != end; it.increment(ec)) {
    std::string ext = utf8Of(it->path().extension());
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) { return (char)std::tolower(c); });
    std::error_code e2;
    if (ext == ".scl" && it->is_regular_file(e2)) out.push_back(utf8Of(it->path().filename()));
  }
  std::sort(out.begin(), out.end(), [](const std::string &a, const std::string &b) { return lessName(a, b) || (!lessName(b, a) && a < b); });
  return out;
}

bool readScalaFile(const std::string &file, double (&cents)[11], std::string &name, std::string &error) {
  const fs::path dir = pathOf(tuningsFolder()), f = pathOf(file);
  if (dir.empty() || file.empty() || f.has_parent_path() || f.filename() != f) { error = "There is no such Scala file."; return false; }
  std::string text;
  if (!readText(dir / f, text)) { error = "The Scala file can't be read."; return false; }
  if (!readScala(text, cents, name, error)) return false;
  if (name.empty()) name = utf8Of(f.stem());
  return true;
}

bool showFolder(const std::string &folder) {
  if (folder.empty()) return false;
  std::error_code ec;
  const fs::path dir = pathOf(folder);
  fs::create_directories(dir, ec);
#ifdef _WIN32
  return (INT_PTR)ShellExecuteW(nullptr, L"open", dir.wstring().c_str(), nullptr, nullptr, SW_SHOWNORMAL) > 32;
#else
#ifdef __APPLE__
  const char *tool = "/usr/bin/open";
#else
  const char *tool = "xdg-open";
#endif
  const std::string path = utf8Of(dir);
  char *argv[] = {(char *)tool, (char *)path.c_str(), nullptr};
  pid_t pid;
  if (posix_spawnp(&pid, tool, nullptr, nullptr, argv, environ) != 0) return false;
  std::thread([pid] { int status; waitpid(pid, &status, 0); }).detach(); // reaped when it is done
  return true;
#endif
}

} // namespace forte
