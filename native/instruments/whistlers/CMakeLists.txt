# Whistlers: its engine and model in C++, its plugins and its WebAssembly.
include(whistlers-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_whistlers STATIC whistlers-model.cpp whistlers-engine.cpp whistlers-instrument.cpp)
target_include_directories(forte_whistlers PUBLIC .)
target_link_libraries(forte_whistlers PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(whistlers NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_whistlers)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(whistlers INSTRUMENT forte_whistlers SOURCES whistlers-web.cpp OUT ${FORTE_ROOT}/whistlers/wasm/whistlers.wasm)
endif()
