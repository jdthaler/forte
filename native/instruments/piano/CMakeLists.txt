# The Ribbon Piano (piano/): its engine and model in C++, its plugins and its WebAssembly.
include(piano-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_piano STATIC piano-model.cpp piano-engine.cpp piano-instrument.cpp)
target_include_directories(forte_piano PUBLIC .)
target_link_libraries(forte_piano PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(piano NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_piano)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(piano INSTRUMENT forte_piano SOURCES piano-web.cpp OUT ${FORTE_ROOT}/piano/wasm/piano.wasm)
endif()
