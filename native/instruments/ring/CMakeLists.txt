# Storage Ring: its engine and model in C++, its plugins and its WebAssembly.
include(ring-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_ring STATIC ring-model.cpp ring-engine.cpp ring-instrument.cpp)
target_include_directories(forte_ring PUBLIC .)
target_link_libraries(forte_ring PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(ring NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_ring)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(ring INSTRUMENT forte_ring SOURCES ring-web.cpp OUT ${FORTE_ROOT}/ring/wasm/ring.wasm)
endif()
