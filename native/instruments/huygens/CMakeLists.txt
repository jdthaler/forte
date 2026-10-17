# The Huygens Keyboard (huygens/): its engine and model in C++, its plugins and its WebAssembly.
include(huygens-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

# with V8's fdlibm (forte/fdlibm.h), so the firing times and the kicks are the JavaScript's
add_library(forte_huygens STATIC huygens-model.cpp huygens-engine.cpp huygens-instrument.cpp)
target_include_directories(forte_huygens PUBLIC .)
target_link_libraries(forte_huygens PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(huygens NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_huygens)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(huygens INSTRUMENT forte_huygens SOURCES huygens-web.cpp OUT ${FORTE_ROOT}/huygens/wasm/huygens.wasm)
endif()
