# NMR Spin Echo: its engine and model in C++, its plugins and its WebAssembly.
include(nmr-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_nmr STATIC nmr-model.cpp nmr-engine.cpp nmr-instrument.cpp)
target_include_directories(forte_nmr PUBLIC .)
target_link_libraries(forte_nmr PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(nmr NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_nmr)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(nmr INSTRUMENT forte_nmr SOURCES nmr-web.cpp OUT ${FORTE_ROOT}/nmr/wasm/nmr.wasm)
endif()
