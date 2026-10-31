# Chladni Plate: its engine and model in C++, its plugins and its WebAssembly.
include(chladni-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_chladni STATIC chladni-model.cpp chladni-engine.cpp chladni-instrument.cpp)
target_include_directories(forte_chladni PUBLIC .)
target_link_libraries(forte_chladni PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(chladni NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_chladni)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(chladni INSTRUMENT forte_chladni SOURCES chladni-web.cpp OUT ${FORTE_ROOT}/chladni/wasm/chladni.wasm)
endif()
