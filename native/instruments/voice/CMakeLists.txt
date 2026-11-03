# Singing Voice: its engine and model in C++, its plugins and its WebAssembly.
include(voice-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_voice STATIC voice-model.cpp voice-engine.cpp voice-instrument.cpp)
target_include_directories(forte_voice PUBLIC .)
target_link_libraries(forte_voice PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(voice NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_voice)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(voice INSTRUMENT forte_voice SOURCES voice-web.cpp OUT ${FORTE_ROOT}/voice/wasm/voice.wasm)
endif()
