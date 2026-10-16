// web.h — for the WebAssembly builds (native/web): FORTE_EXPORT keeps a C function and exports it.
#pragma once

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define FORTE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define FORTE_EXPORT
#endif
