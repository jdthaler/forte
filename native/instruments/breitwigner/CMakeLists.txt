# Breit-Wigner Keyboard: its engine and model in C++, its plugins and its WebAssembly.
include(breitwigner-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_breitwigner STATIC breitwigner-model.cpp breitwigner-engine.cpp breitwigner-instrument.cpp)
target_include_directories(forte_breitwigner PUBLIC .)
target_link_libraries(forte_breitwigner PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(breitwigner NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_breitwigner)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(breitwigner INSTRUMENT forte_breitwigner SOURCES breitwigner-web.cpp OUT ${FORTE_ROOT}/breitwigner/wasm/breitwigner.wasm)
endif()
