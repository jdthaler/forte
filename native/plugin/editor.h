// editor.h — the plugin's window: a web view (choc::ui::WebView: WKWebView on macOS, WebView2
// on Windows, WebKitGTK on Linux) showing editor.html, the instrument's controls and a
// playable keyboard, embedded in the window the host or the standalone app gives it. The page
// calls the plugin through one function, window.forte(method, …args), answered by `call` on
// the main thread (plugin.cpp says what the methods are).
#pragma once

#include <cstdint>
#include <functional>
#include <memory>

#include <clap/clap.h>

#include "choc/containers/choc_Value.h"

namespace forte {

class Editor {
 public:
  using Call = std::function<choc::value::Value(const choc::value::ValueView &args)>;

  // CLAP_WINDOW_API_COCOA, _WIN32 or _X11: the one this platform embeds in
  static const char *api();
  // nullptr if the system has no web view (Windows without the WebView2 runtime, or Linux with
  // no display)
  static std::unique_ptr<Editor> create(Call call);
  virtual ~Editor() = default;

  virtual bool setParent(const clap_window_t *window) = 0;
  virtual void setSize(uint32_t width, uint32_t height) = 0; // in the host's units (pixels, or points on macOS)
  virtual void show(bool visible) = 0;
  // Linux: GTK has no loop of its own in a plugin; the host's timer pumps it
  virtual void idle() {}
};

} // namespace forte
