# Regal: its engine and model in C++, its plugins and its WebAssembly.
include(regal-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_regal STATIC regal-model.cpp regal-engine.cpp regal-instrument.cpp)
target_include_directories(forte_regal PUBLIC .)
target_link_libraries(forte_regal PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(regal NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_regal)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(regal INSTRUMENT forte_regal SOURCES regal-web.cpp OUT ${FORTE_ROOT}/regal/wasm/regal.wasm)
endif()
