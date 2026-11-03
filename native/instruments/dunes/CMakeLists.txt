# Singing Dunes: its engine and model in C++, its plugins and its WebAssembly.
include(dunes-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_dunes STATIC dunes-model.cpp dunes-engine.cpp dunes-instrument.cpp)
target_include_directories(forte_dunes PUBLIC .)
target_link_libraries(forte_dunes PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(dunes NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_dunes)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(dunes INSTRUMENT forte_dunes SOURCES dunes-web.cpp OUT ${FORTE_ROOT}/dunes/wasm/dunes.wasm)
endif()
