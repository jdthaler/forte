# Gamelan: its engine and model in C++, its plugins and its WebAssembly.
include(gamelan-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_gamelan STATIC gamelan-model.cpp gamelan-engine.cpp gamelan-instrument.cpp)
target_include_directories(forte_gamelan PUBLIC .)
target_link_libraries(forte_gamelan PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(gamelan NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_gamelan)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(gamelan INSTRUMENT forte_gamelan SOURCES gamelan-web.cpp OUT ${FORTE_ROOT}/gamelan/wasm/gamelan.wasm)
endif()
