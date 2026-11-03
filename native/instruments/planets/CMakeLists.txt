# Ringing Planets: its engine and model in C++, its plugins and its WebAssembly.
include(planets-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_planets STATIC planets-model.cpp planets-engine.cpp planets-instrument.cpp)
target_include_directories(forte_planets PUBLIC .)
target_link_libraries(forte_planets PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(planets NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_planets)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(planets INSTRUMENT forte_planets SOURCES planets-web.cpp OUT ${FORTE_ROOT}/planets/wasm/planets.wasm)
endif()
