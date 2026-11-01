# Cellulophone: its engine and model in C++, its plugins and its WebAssembly.
include(cellulophone-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_cellulophone STATIC cellulophone-model.cpp cellulophone-engine.cpp cellulophone-instrument.cpp)
target_include_directories(forte_cellulophone PUBLIC .)
target_link_libraries(forte_cellulophone PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(cellulophone NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_cellulophone)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(cellulophone INSTRUMENT forte_cellulophone SOURCES cellulophone-web.cpp OUT ${FORTE_ROOT}/cellulophone/wasm/cellulophone.wasm)
endif()
