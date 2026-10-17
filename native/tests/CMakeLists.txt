# Native unit tests (CTest), and the CI-only smoke-test plugin.
add_executable(forte_tests core-tests.cpp shared-tests.cpp)
target_link_libraries(forte_tests PRIVATE forte_core)
if (EMSCRIPTEN) # run in Node; the repository's package.json makes .js an ES module
  set_target_properties(forte_tests PROPERTIES SUFFIX ".cjs")
  target_link_options(forte_tests PRIVATE -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node)
endif()
# Node's CI reaches getenv (node-env.js), so the timing tests skip on CI as natively
set(forte_node_env --pre-js ${CMAKE_CURRENT_SOURCE_DIR}/node-env.js)
add_test(NAME core COMMAND forte_tests)

# each ported instrument's own native tests: <slug>-tests.cpp
foreach(slug template bubbles vibraphone carillon glass gongs piano harpsichord clavier grand bowed tines reeds harmonium pianet pipes)
  if (TARGET forte_${slug})
    add_executable(forte_${slug}_tests ${slug}-tests.cpp)
    target_link_libraries(forte_${slug}_tests PRIVATE forte_${slug})
    if (EMSCRIPTEN) # with the stack the instrument's WebAssembly has (forte_add_wasm): Eigen keeps blocks of up to 128 KB on it
      set_target_properties(forte_${slug}_tests PROPERTIES SUFFIX ".cjs")
      target_link_options(forte_${slug}_tests PRIVATE -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node -sSTACK_SIZE=256kb ${forte_node_env})
    endif()
    add_test(NAME ${slug} COMMAND forte_${slug}_tests)
  endif()
endforeach()

if (FORTE_PLUGINS)
  # the shared plugin driven as a host drives it, on a test instrument (tests/smoke) with a mod
  # wheel, a pedal and a preset
  add_library(forte_smoke STATIC smoke/smoke.cpp)
  target_link_libraries(forte_smoke PUBLIC forte_core)
  add_executable(forte_plugin_tests plugin-tests.cpp)
  target_link_libraries(forte_plugin_tests PRIVATE forte_plugin forte_smoke)
  add_test(NAME plugin COMMAND forte_plugin_tests)
endif()
