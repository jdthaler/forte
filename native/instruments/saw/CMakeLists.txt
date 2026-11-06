# Musical Saw: its engine and model in C++, its plugins and its WebAssembly.
include(saw-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_saw STATIC saw-model.cpp saw-engine.cpp saw-instrument.cpp)
target_include_directories(forte_saw PUBLIC .)
target_link_libraries(forte_saw PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(saw NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_saw)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(saw INSTRUMENT forte_saw SOURCES saw-web.cpp OUT ${FORTE_ROOT}/saw/wasm/saw.wasm)
endif()
