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

// Show the folder (made first if need be) in the Finder, Explorer or the file manager.
bool showFolder(const std::string &folder);

} // namespace forte
