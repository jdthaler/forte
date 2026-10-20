# Collider Showers: its engine and model in C++, its plugins and its WebAssembly.
include(showers-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_showers STATIC showers-model.cpp showers-engine.cpp showers-instrument.cpp)
target_include_directories(forte_showers PUBLIC .)
target_link_libraries(forte_showers PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(showers NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_showers)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(showers INSTRUMENT forte_showers SOURCES showers-web.cpp OUT ${FORTE_ROOT}/showers/wasm/showers.wasm)
endif()
