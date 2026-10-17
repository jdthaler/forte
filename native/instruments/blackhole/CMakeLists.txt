# The Black-Hole Keyboard (blackhole/): its engine and model in C++, its plugins and its WebAssembly.
include(blackhole-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# with V8's fdlibm (forte/fdlibm.h), so each key's modes and the samples are the JavaScript's
add_library(forte_blackhole STATIC blackhole-model.cpp blackhole-engine.cpp blackhole-instrument.cpp)
target_include_directories(forte_blackhole PUBLIC .)
target_link_libraries(forte_blackhole PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(blackhole NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_blackhole)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(blackhole INSTRUMENT forte_blackhole SOURCES blackhole-web.cpp OUT ${FORTE_ROOT}/blackhole/wasm/blackhole.wasm)
endif()
