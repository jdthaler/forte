# Early Universe: its engine and model in C++, its plugins and its WebAssembly.
include(universe-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_universe STATIC universe-model.cpp universe-engine.cpp universe-instrument.cpp)
target_include_directories(forte_universe PUBLIC .)
target_link_libraries(forte_universe PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(universe NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_universe)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(universe INSTRUMENT forte_universe SOURCES universe-web.cpp OUT ${FORTE_ROOT}/universe/wasm/universe.wasm)
endif()
