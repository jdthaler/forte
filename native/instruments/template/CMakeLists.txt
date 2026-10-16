# The template (docs/template): its engine and model in C++, its plugins and its WebAssembly.
include(template-info.cmake) # generated: FORTE_NAME, FORTE_VERSION, FORTE_AU_SUBTYPE

add_library(forte_template STATIC template-model.cpp template-engine.cpp template-instrument.cpp)
target_include_directories(forte_template PUBLIC .)
target_link_libraries(forte_template PUBLIC forte_core)

if (FORTE_PLUGINS)
  forte_add_plugin(template NAME "${FORTE_NAME}" VERSION ${FORTE_VERSION} AU_SUBTYPE ${FORTE_AU_SUBTYPE} INSTRUMENT forte_template)
endif()
if (EMSCRIPTEN)
  forte_add_wasm(template INSTRUMENT forte_template SOURCES template-web.cpp OUT ${FORTE_ROOT}/docs/template/wasm/template.wasm)
endif()
