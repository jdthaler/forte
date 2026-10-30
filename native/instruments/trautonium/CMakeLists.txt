# Trautonium: its engine and model in C++, its plugins and its WebAssembly.
include(trautonium-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_trautonium STATIC trautonium-model.cpp trautonium-engine.cpp trautonium-instrument.cpp)
target_include_directories(forte_trautonium PUBLIC .)
target_link_libraries(forte_trautonium PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(trautonium NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_trautonium)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(trautonium INSTRUMENT forte_trautonium SOURCES trautonium-web.cpp OUT ${FORTE_ROOT}/trautonium/wasm/trautonium.wasm)
endif()
