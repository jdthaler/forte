# Telharmonium: its engine and model in C++, its plugins and its WebAssembly.
include(telharmonium-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_telharmonium STATIC telharmonium-model.cpp telharmonium-engine.cpp telharmonium-instrument.cpp)
target_include_directories(forte_telharmonium PUBLIC .)
target_link_libraries(forte_telharmonium PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(telharmonium NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_telharmonium)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(telharmonium INSTRUMENT forte_telharmonium SOURCES telharmonium-web.cpp OUT ${FORTE_ROOT}/telharmonium/wasm/telharmonium.wasm)
endif()
