// presets.h — your own presets in the plugins' window (editor.html's Presets menu): files in the
// site's format (shared/presets.js), one folder per instrument, so a preset saved on the site
// opens in the plugins and one saved in a plugin opens on the site.
#pragma once

#include <string>
#include <vector>

#include "forte/instrument.h"

namespace forte {

// The folder of an instrument's presets (UTF-8):
//   macOS    ~/Library/Audio/Presets/Forte/<slug>
//   Windows  %APPDATA%\Forte\Presets\<slug>
//   Linux    $XDG_DATA_HOME/forte/presets/<slug> (~/.local/share/forte/presets/<slug>)
// FORTE_PRESETS_DIR in the environment stands for the folder above <slug> (the tests use it).
std::string presetsFolder(const InstrumentInfo &I);

// The presets in the folder's files that are this instrument's, by name: a file can hold several.
struct UserPreset {
  std::string name, file; // file: its name in the folder
  int index;              // the preset's place in the file
};
std::vector<UserPreset> listPresets(const InstrumentInfo &I);

// Preset `index` of a file in the folder: every parameter's value as the plugin keeps it (a
// choice's index, a toggle's 0 or 1), its default where the preset leaves it out or gives what
// isn't one of its values. False, with the reason in error, when the file can't be read.
bool readPreset(const InstrumentInfo &I, const std::string &file, int index, std::vector<double> &values, std::string &error);

// The parameters' values as a preset file's text, and saved as "<name>.json" in the folder (an
// older one by that name replaced): the file's name, or "" with the reason in error.
std::string presetText(const InstrumentInfo &I, const std::string &name, const double *values);
std::string writePreset(const InstrumentInfo &I, const std::string &name, const double *values, std::string &error);

// Your combinations in the Forte app (plugin.cpp, Suite): files in the site's format
// (combine/src/combine-params.js), in a folder beside the instruments' (Combinations: on a Mac
// ~/Library/Audio/Presets/Forte/Combinations), so one saved on the site's Combinations page opens
// in the app and one saved in the app opens there.
std::string combinationsFolder();
struct UserCombination {
  std::string name, file; // file: its name in the folder
  int index;              // the combination's place in the file
};
std::vector<UserCombination> listCombinations();
// One instrument of a combination: its keys (MIDI's numbers, A0 to C8 on the site: the ends mean
// every key below and above), octave (−2…+2), level (dB), whether it plays, and every parameter's
// value as the plugin keeps it (as readPreset gives them).
struct CombinationPart {
  const InstrumentInfo *I = nullptr;
  int lo = 21, hi = 108, oct = 0;
  double level = 0;
  bool on = true;
  std::vector<double> values;
};
// Combination `index` of a file in the folder, its instruments found by their slugs (find: null
// for one this app doesn't have, which is left out, and named in skipped). False, with the reason
// in error, when the file can't be read or none of its instruments is here.
bool readCombination(const std::string &file, int index, const InstrumentInfo *(*find)(const std::string &slug, const void *ctx), const void *ctx,
                     std::string &name, std::vector<CombinationPart> &parts, std::string &skipped, std::string &error);
// The parts as a combinations file's text, and saved as "<name>.json" in the folder (an older one
// by that name replaced): the file's name, or "" with the reason in error.
std::string combinationText(const std::string &name, const std::vector<CombinationPart> &parts, const std::string &forteVersion);
std::string writeCombination(const std::string &name, const std::vector<CombinationPart> &parts, const std::string &forteVersion, std::string &error);

// Show the folder (made first if need be) in the Finder, Explorer or the file manager.
bool showFolder(const std::string &folder);

// Scala files (.scl) for the custom temperament (forte/tuning.h), in a folder every instrument
// shares beside theirs: Tunings (~/Library/Audio/Presets/Forte/Tunings on a Mac).
std::string tuningsFolder();
std::vector<std::string> listScalas(); // the files' names, sorted
// A file in the folder read as a Scala file: the custom temperament's cents and its description,
// or false with the reason in error.
bool readScalaFile(const std::string &file, double (&cents)[11], std::string &name, std::string &error);

} // namespace forte
