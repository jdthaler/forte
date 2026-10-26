# ABRACADABRA: its engine and model in C++, its plugins and its WebAssembly.
include(abracadabra-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_abracadabra STATIC abracadabra-model.cpp abracadabra-engine.cpp abracadabra-instrument.cpp)
target_include_directories(forte_abracadabra PUBLIC .)
target_link_libraries(forte_abracadabra PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(abracadabra NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_abracadabra)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(abracadabra INSTRUMENT forte_abracadabra SOURCES abracadabra-web.cpp OUT ${FORTE_ROOT}/abracadabra/wasm/abracadabra.wasm)
endif()
