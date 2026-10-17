# The Wind Harp (windharp/): its engine and model in C++, its plugins and its WebAssembly.
include(windharp-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_windharp STATIC windharp-model.cpp windharp-engine.cpp windharp-instrument.cpp)
target_include_directories(forte_windharp PUBLIC .)
target_link_libraries(forte_windharp PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(windharp NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_windharp)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(windharp INSTRUMENT forte_windharp SOURCES windharp-web.cpp OUT ${FORTE_ROOT}/windharp/wasm/windharp.wasm)
endif()
