// editor.cpp — the web view in the host's window, on each platform (editor.h).

#include "editor.h"

#include <cstdlib>
#include <string>

#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#if defined(__linux__)
#include <gdk/gdkx.h>
#include <gtk/gtk.h>
#include <gtk/gtkx.h>
#include <X11/Xlib.h>
#endif

#include "choc/gui/choc_WebView.h"

#include "editor-html.h" // generated from editor.html (cmake/embed.cmake)

namespace forte {
namespace {

choc::ui::WebView::Options options() {
  choc::ui::WebView::Options o;
  o.acceptsFirstMouseClick = true; // the first click on a key plays it
  o.enableDebugMode = std::getenv("FORTE_EDITOR_DEBUG") != nullptr;
  o.fetchResource = [](const std::string &path) -> std::optional<choc::ui::WebView::Options::Resource> {
    if (path != "/" && path != "/index.html") return {};
    return choc::ui::WebView::Options::Resource(std::string_view((const char *)kEditorHtml, kEditorHtmlSize), "text/html");
  };
  o.shouldAllowRequest = [](const choc::ui::WebView::Options::Request &) { return false; }; // the page goes nowhere
  return o;
}

struct WebEditor : Editor {
  choc::ui::WebView view;
  uint32_t width = 0, height = 0;
  explicit WebEditor(Call call) : view(options()) {
    view.bind("forte", [call](const choc::value::ValueView &args) { return call(args); });
  }
  bool ok() const { return view.loadedOK(); }
};

#if defined(__APPLE__)

struct MacEditor : WebEditor {
  using WebEditor::WebEditor;
  id ns() const { return (id)view.getViewHandle(); }
  ~MacEditor() override { choc::objc::call<void>(ns(), "removeFromSuperview"); }
  bool setParent(const clap_window_t *w) override {
    if (!w || !w->cocoa) return false;
    choc::objc::call<void>(ns(), "setAutoresizingMask:", (unsigned long)18); // width and height follow the parent's
    choc::objc::call<void>((id)w->cocoa, "addSubview:", ns());
    setSize(width, height);
    return true;
  }
  void setSize(uint32_t w, uint32_t h) override {
    width = w; height = h;
    choc::objc::CGRect r;
    r.size.width = w; r.size.height = h;
    choc::objc::call<void>(ns(), "setFrame:", r);
  }
  void show(bool visible) override { choc::objc::call<void>(ns(), "setHidden:", (BOOL)!visible); }
};
using PlatformEditor = MacEditor;

#elif defined(_WIN32)

struct WinEditor : WebEditor {
  using WebEditor::WebEditor;
  HWND hwnd() const { return (HWND)view.getViewHandle(); }
  bool setParent(const clap_window_t *w) override {
    if (!w || !w->win32) return false;
    // choc's web view is a popup window: make it a child of the host's
    SetWindowLongPtrW(hwnd(), GWL_STYLE, WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN);
    SetParent(hwnd(), (HWND)w->win32);
    SetWindowPos(hwnd(), nullptr, 0, 0, (int)width, (int)height, SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return true;
  }
  void setSize(uint32_t w, uint32_t h) override {
    width = w; height = h;
    SetWindowPos(hwnd(), nullptr, 0, 0, (int)w, (int)h, SWP_NOZORDER | SWP_NOMOVE | SWP_NOACTIVATE);
  }
  void show(bool visible) override { ShowWindow(hwnd(), visible ? SW_SHOW : SW_HIDE); }
};
using PlatformEditor = WinEditor;

#elif defined(__linux__)

// WebKitGTK in the host's X11 window: the web view in a GtkPlug whose window is reparented
// into the host's, as JUCE's XEmbedComponent does. GTK is pumped from the host's timer (idle).
struct LinuxEditor : WebEditor {
  GtkWidget *plug = nullptr;
  explicit LinuxEditor(Call call) : WebEditor(std::move(call)) {
    if (!ok()) return;
    plug = gtk_plug_new(0);
    gtk_container_add(GTK_CONTAINER(plug), GTK_WIDGET(view.getViewHandle()));
    gtk_widget_realize(plug);
  }
  ~LinuxEditor() override {
    if (plug) {
      gtk_container_remove(GTK_CONTAINER(plug), GTK_WIDGET(view.getViewHandle()));
      gtk_widget_destroy(plug);
    }
    idle();
  }
  Display *display() const { return GDK_DISPLAY_XDISPLAY(gtk_widget_get_display(plug)); }
  Window xid() const { return (Window)gtk_plug_get_id(GTK_PLUG(plug)); }
  bool setParent(const clap_window_t *w) override {
    if (!plug || !w || !w->x11) return false;
    XReparentWindow(display(), xid(), (Window)w->x11, 0, 0);
    setSize(width, height);
    gtk_widget_show_all(plug);
    XMapWindow(display(), xid());
    XFlush(display());
    idle();
    return true;
  }
  void setSize(uint32_t w, uint32_t h) override {
    width = w; height = h;
    if (!plug || !w || !h) return;
    gtk_window_resize(GTK_WINDOW(plug), (int)w, (int)h);
    XResizeWindow(display(), xid(), w, h);
    XFlush(display());
  }
  void show(bool visible) override {
    if (!plug) return;
    if (visible) { gtk_widget_show_all(plug); XMapWindow(display(), xid()); }
    else XUnmapWindow(display(), xid());
    XFlush(display());
  }
  void idle() override {
    for (int i = 0; i < 100 && gtk_events_pending(); i++) gtk_main_iteration_do(false);
  }
};
using PlatformEditor = LinuxEditor;

#endif

} // namespace

const char *Editor::api() {
#if defined(__APPLE__)
  return CLAP_WINDOW_API_COCOA;
#elif defined(_WIN32)
  return CLAP_WINDOW_API_WIN32;
#else
  return CLAP_WINDOW_API_X11;
#endif
}

std::unique_ptr<Editor> Editor::create(Call call) {
#if defined(__linux__)
  // a GtkPlug needs X11, also under Wayland (where the host's window is XWayland's)
  if (!gdk_display_get_default()) gdk_set_allowed_backends("x11");
#endif
  auto e = std::make_unique<PlatformEditor>(std::move(call));
  if (!e->ok()) return nullptr;
  return e;
}

} // namespace forte
