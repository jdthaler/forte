# The Spring Keyboard (springs/): its engine and model in C++, its plugins and its WebAssembly.
include(springs-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_springs STATIC springs-model.cpp springs-engine.cpp springs-instrument.cpp)
target_include_directories(forte_springs PUBLIC .)
target_link_libraries(forte_springs PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(springs NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_springs)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(springs INSTRUMENT forte_springs SOURCES springs-web.cpp OUT ${FORTE_ROOT}/springs/wasm/springs.wasm)
endif()
