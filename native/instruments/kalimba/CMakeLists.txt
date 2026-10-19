# Kalimba: its engine and model in C++, its plugins and its WebAssembly.
include(kalimba-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_kalimba STATIC kalimba-model.cpp kalimba-engine.cpp kalimba-instrument.cpp)
target_include_directories(forte_kalimba PUBLIC .)
target_link_libraries(forte_kalimba PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(kalimba NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_kalimba)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(kalimba INSTRUMENT forte_kalimba SOURCES kalimba-web.cpp OUT ${FORTE_ROOT}/kalimba/wasm/kalimba.wasm)
endif()
