# Tubular Bells: its engine and model in C++, its plugins and its WebAssembly.
include(tubular-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_tubular STATIC tubular-model.cpp tubular-engine.cpp tubular-instrument.cpp)
target_include_directories(forte_tubular PUBLIC .)
target_link_libraries(forte_tubular PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(tubular NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_tubular)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(tubular INSTRUMENT forte_tubular SOURCES tubular-web.cpp OUT ${FORTE_ROOT}/tubular/wasm/tubular.wasm)
endif()
