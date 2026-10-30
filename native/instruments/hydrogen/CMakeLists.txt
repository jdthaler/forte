# Hydrogen Lamp: its engine and model in C++, its plugins and its WebAssembly.
include(hydrogen-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_hydrogen STATIC hydrogen-model.cpp hydrogen-engine.cpp hydrogen-instrument.cpp)
target_include_directories(forte_hydrogen PUBLIC .)
target_link_libraries(forte_hydrogen PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(hydrogen NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_hydrogen)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(hydrogen INSTRUMENT forte_hydrogen SOURCES hydrogen-web.cpp OUT ${FORTE_ROOT}/hydrogen/wasm/hydrogen.wasm)
endif()
