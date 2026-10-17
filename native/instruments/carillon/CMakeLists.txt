# The Carillon (carillon/): its engine and model in C++, its plugins and its WebAssembly. The bells'
# modes are the FEM's, as a generated table (bell-table.h, from carillon/src/bell-table.js).
include(carillon-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_carillon STATIC carillon-model.cpp carillon-engine.cpp carillon-instrument.cpp)
target_include_directories(forte_carillon PUBLIC .)
target_link_libraries(forte_carillon PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(carillon NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_carillon)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(carillon INSTRUMENT forte_carillon SOURCES carillon-web.cpp OUT ${FORTE_ROOT}/carillon/wasm/carillon.wasm)
endif()
