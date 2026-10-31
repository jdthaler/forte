# Ion Chain: its engine and model in C++, its plugins and its WebAssembly.
include(ionchain-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_ionchain STATIC ionchain-model.cpp ionchain-engine.cpp ionchain-instrument.cpp)
target_include_directories(forte_ionchain PUBLIC .)
target_link_libraries(forte_ionchain PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(ionchain NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_ionchain)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(ionchain INSTRUMENT forte_ionchain SOURCES ionchain-web.cpp OUT ${FORTE_ROOT}/ionchain/wasm/ionchain.wasm)
endif()
