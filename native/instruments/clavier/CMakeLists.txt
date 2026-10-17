# The Tangent Clavier (clavier/): its engine and model in C++, its plugins and its WebAssembly.
include(clavier-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_clavier STATIC clavier-model.cpp clavier-engine.cpp clavier-instrument.cpp)
target_include_directories(forte_clavier PUBLIC .)
target_link_libraries(forte_clavier PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(clavier NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_clavier)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(clavier INSTRUMENT forte_clavier SOURCES clavier-web.cpp OUT ${FORTE_ROOT}/clavier/wasm/clavier.wasm)
endif()
