# Native unit tests (CTest), and the CI-only smoke-test plugin.
add_executable(forte_tests core-tests.cpp)
target_link_libraries(forte_tests PRIVATE forte_core)
if (EMSCRIPTEN) # run in Node; the repository's package.json makes .js an ES module
  set_target_properties(forte_tests PROPERTIES SUFFIX ".cjs")
  target_link_options(forte_tests PRIVATE -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node)
endif()
add_test(NAME core COMMAND forte_tests)

if (FORTE_PLUGINS AND FORTE_SMOKE)
  add_library(forte_smoke STATIC smoke/smoke.cpp)
  target_link_libraries(forte_smoke PUBLIC forte_core)
  forte_add_plugin(smoke NAME "Forte Smoke Test" VERSION 0.0.1 AU_SUBTYPE Smok INSTRUMENT forte_smoke)
endif()
