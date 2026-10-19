# Steel Pan: its engine and model in C++, its plugins and its WebAssembly.
include(steelpan-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_steelpan STATIC steelpan-model.cpp steelpan-engine.cpp steelpan-instrument.cpp)
target_include_directories(forte_steelpan PUBLIC .)
target_link_libraries(forte_steelpan PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(steelpan NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_steelpan)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(steelpan INSTRUMENT forte_steelpan SOURCES steelpan-web.cpp OUT ${FORTE_ROOT}/steelpan/wasm/steelpan.wasm)
endif()
