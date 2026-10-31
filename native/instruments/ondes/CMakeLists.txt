# Ondes Martenot: its engine and model in C++, its plugins and its WebAssembly.
include(ondes-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_ondes STATIC ondes-model.cpp ondes-engine.cpp ondes-instrument.cpp)
target_include_directories(forte_ondes PUBLIC .)
target_link_libraries(forte_ondes PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(ondes NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_ondes)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(ondes INSTRUMENT forte_ondes SOURCES ondes-web.cpp OUT ${FORTE_ROOT}/ondes/wasm/ondes.wasm)
endif()
