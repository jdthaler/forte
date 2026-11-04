# Pulsars: its engine and model in C++, its plugins and its WebAssembly.
include(pulsars-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_pulsars STATIC pulsars-model.cpp pulsars-engine.cpp pulsars-instrument.cpp)
target_include_directories(forte_pulsars PUBLIC .)
target_link_libraries(forte_pulsars PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(pulsars NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_pulsars)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(pulsars INSTRUMENT forte_pulsars SOURCES pulsars-web.cpp OUT ${FORTE_ROOT}/pulsars/wasm/pulsars.wasm)
endif()
