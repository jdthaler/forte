# Birdsong: its engine and model in C++, its plugins and its WebAssembly.
include(birdsong-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_birdsong STATIC birdsong-model.cpp birdsong-engine.cpp birdsong-instrument.cpp)
target_include_directories(forte_birdsong PUBLIC .)
target_link_libraries(forte_birdsong PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(birdsong NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_birdsong)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(birdsong INSTRUMENT forte_birdsong SOURCES birdsong-web.cpp OUT ${FORTE_ROOT}/birdsong/wasm/birdsong.wasm)
endif()
