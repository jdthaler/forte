# TESS: its engine and model in C++, its plugins and its WebAssembly.
include(tess-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_tess STATIC tess-model.cpp tess-engine.cpp tess-instrument.cpp)
target_include_directories(forte_tess PUBLIC .)
target_link_libraries(forte_tess PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(tess NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_tess)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(tess INSTRUMENT forte_tess SOURCES tess-web.cpp OUT ${FORTE_ROOT}/tess/wasm/tess.wasm)
endif()
