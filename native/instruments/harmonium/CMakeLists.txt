# The Free-Reed Organ (harmonium/): its engine and model in C++, its plugins and its WebAssembly.
include(harmonium-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_harmonium STATIC harmonium-model.cpp harmonium-engine.cpp harmonium-instrument.cpp)
target_include_directories(forte_harmonium PUBLIC .)
target_link_libraries(forte_harmonium PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(harmonium NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_harmonium)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(harmonium INSTRUMENT forte_harmonium SOURCES harmonium-web.cpp OUT ${FORTE_ROOT}/harmonium/wasm/harmonium.wasm)
endif()
