# CUORE: its engine and model in C++, its plugins and its WebAssembly.
include(cuore-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_cuore STATIC cuore-model.cpp cuore-engine.cpp cuore-instrument.cpp)
target_include_directories(forte_cuore PUBLIC .)
target_link_libraries(forte_cuore PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(cuore NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_cuore)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(cuore INSTRUMENT forte_cuore SOURCES cuore-web.cpp OUT ${FORTE_ROOT}/cuore/wasm/cuore.wasm)
endif()
