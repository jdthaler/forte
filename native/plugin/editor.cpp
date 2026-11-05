// editor.cpp — the web view in the host's window, on each platform (editor.h).

#include "editor.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iterator>
#include <map>
#include <memory>
#include <sstream>
#include <string>

#include "choc/containers/choc_zlib.h" // (before X11's headers, whose macros it can't take)

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

extern const forte::Site forte_site_shared; // shared/ (cmake/forte.cmake, forte_site)

namespace forte {
namespace {

// A site's archive (site.h) as its files: "/path" → bytes. A gzipped tar (pax or ustar).
using Files = std::map<std::string, std::string, std::less<>>;
Files unpack(const Site &site) {
  Files files;
  // the gzip header (RFC 1952), then raw deflate: choc's inflater reads that, not gzip itself
  const unsigned char *d = site.data;
  if (site.size < 18 || d[0] != 0x1f || d[1] != 0x8b || d[2] != 8) return files;
  size_t at = 10;
  if (d[3] & 4) at += 2 + (d[10] | d[11] << 8);                     // FEXTRA
  for (int flag : {8, 16}) if (d[3] & flag) { while (at < site.size && d[at]) at++; at++; } // FNAME, FCOMMENT
  if (d[3] & 2) at += 2;                                             // FHCRC
  if (at >= site.size) return files;
  std::string tar;
  try {
    auto in = std::make_shared<std::istringstream>(std::string((const char *)d + at, site.size - at));
    choc::zlib::InflaterStream z(in, choc::zlib::InflaterStream::FormatType::deflate);
    char buf[65536];
    while (z.read(buf, sizeof buf), z.gcount() > 0) tar.append(buf, (size_t)z.gcount());
  } catch (...) { return files; }
  std::string longName; // a pax header's path, for the entry after it
  for (at = 0; at + 512 <= tar.size();) {
    const char *h = tar.data() + at;
    if (!h[0]) break; // the end
    const std::string name(h, strnlen(h, 100)), prefix(h + 345, strnlen(h + 345, 155));
    const size_t size = std::strtoull(std::string(h + 124, 12).c_str(), nullptr, 8);
    const char type = h[156];
    at += 512;
    if (at + size > tar.size()) break;
    if (type == 'x') { // "<length> key=value\n" records
      const std::string rec = tar.substr(at, size);
      for (size_t r = 0; r < rec.size();) {
        const size_t sp = rec.find(' ', r), len = std::strtoull(rec.c_str() + r, nullptr, 10);
        if (sp == std::string::npos || len == 0) break;
        const std::string kv = rec.substr(sp + 1, len - (sp + 1 - r) - 1);
        if (kv.compare(0, 5, "path=") == 0) longName = kv.substr(5);
        r += len;
      }
    } else if (type == '0' || type == 0) {
      files["/" + (!longName.empty() ? longName : prefix.empty() ? name : prefix + "/" + name)] = tar.substr(at, size);
      longName.clear();
    } else longName.clear();
    at += (size + 511) / 512 * 512;
  }
  return files;
}
const char *mimeType(std::string_view path) {
  const auto ends = [&](const char *e) { const size_t n = std::strlen(e); return path.size() >= n && path.substr(path.size() - n) == e; };
  if (ends(".html")) return "text/html";
  if (ends(".js")) return "text/javascript";
  if (ends(".css")) return "text/css";
  if (ends(".wasm")) return "application/wasm";
  if (ends(".json")) return "application/json";
  return "application/octet-stream";
}

// The window's page (editor.html), and the site's files: shared/ and the instrument's page,
// unpacked when first asked for.
struct Server {
  Editor::Page page;
  std::map<const Site *, Files> unpacked;
  const Files &files(const Site *s) {
    auto it = unpacked.find(s);
    if (it == unpacked.end()) it = unpacked.emplace(s, unpack(*s)).first;
    return it->second;
  }
  std::optional<choc::ui::WebView::Options::Resource> fetch(std::string path) {
    using Resource = choc::ui::WebView::Options::Resource;
    path = path.substr(0, path.find_first_of("?#"));
    if (std::getenv("FORTE_EDITOR_DEBUG")) std::fprintf(stderr, "fetch %s\n", path.c_str());
    if (path == "/" || path == "/index.html") return Resource(std::string_view((const char *)kEditorHtml, kEditorHtmlSize), "text/html");
    for (const Site *s : {&forte_site_shared, page ? page() : nullptr}) {
      if (!s) continue;
      const Files &f = files(s);
      if (auto it = f.find(path); it != f.end()) return Resource(it->second, mimeType(path));
    }
    return {};
  }
};

choc::ui::WebView::Options options(std::shared_ptr<Server> server) {
  choc::ui::WebView::Options o;
  o.acceptsFirstMouseClick = true; // the first click on a key plays it
  o.enableDebugMode = std::getenv("FORTE_EDITOR_DEBUG") != nullptr;
  o.fetchResource = [server](const std::string &path) { return server->fetch(path); };
  o.shouldAllowRequest = [](const choc::ui::WebView::Options::Request &) { return false; }; // the page goes nowhere
  return o;
}

struct WebEditor : Editor {
  choc::ui::WebView view;
  uint32_t width = 0, height = 0;
  WebEditor(Call call, Page page) : view(options(std::make_shared<Server>(Server{std::move(page), {}}))) {
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
  LinuxEditor(Call call, Page page) : WebEditor(std::move(call), std::move(page)) {
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

std::unique_ptr<Editor> Editor::create(Call call, Page page) {
#if defined(__linux__)
  // a GtkPlug needs X11, also under Wayland (where the host's window is XWayland's)
  if (!gdk_display_get_default()) gdk_set_allowed_backends("x11");
#endif
  auto e = std::make_unique<PlatformEditor>(std::move(call), std::move(page));
  if (!e->ok()) return nullptr;
  return e;
}

} // namespace forte
