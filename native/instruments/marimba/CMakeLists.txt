# Marimba and Xylophone: its engine and model in C++, its plugins and its WebAssembly.
include(marimba-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_marimba STATIC marimba-model.cpp marimba-engine.cpp marimba-instrument.cpp)
target_include_directories(forte_marimba PUBLIC .)
target_link_libraries(forte_marimba PUBLIC forte_core forte_bars) # forte_bars: the bars' finite elements, native/instruments/vibraphone/bar.h

if (FORTE_PLUGINS)
  forte_add_plugin(marimba NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_marimba)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(marimba INSTRUMENT forte_marimba SOURCES marimba-web.cpp OUT ${FORTE_ROOT}/marimba/wasm/marimba.wasm)
endif()
