# Forte's native code: the instruments' physics in C++, built as plugins (CLAP, and through
# clap-wrapper VST3, AU v2 and a standalone app) and as WebAssembly for the website.
# See README.md here and docs/PLUGINS.md. Configure with a preset: cmake --preset linux.

cmake_minimum_required(VERSION 3.25)
project(forte-native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if (EMSCRIPTEN)
  set(forte_plugins_default OFF)
else()
  set(forte_plugins_default ON)
endif()
option(FORTE_PLUGINS "Build the plugins (CLAP, VST3, AU v2, standalone)" ${forte_plugins_default})
option(FORTE_TESTS "Build the native unit tests (CTest)" ON)
option(FORTE_SMOKE "Build the CI-only smoke-test plugin (tests/smoke)" ON)

# The repository root: the web build writes its WebAssembly next to each instrument's page.
get_filename_component(FORTE_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/.. ABSOLUTE)

include(cmake/dependencies.cmake)
include(cmake/forte.cmake)

add_subdirectory(core)
if (FORTE_PLUGINS)
  add_subdirectory(plugin)
endif()
add_subdirectory(instruments)
if (FORTE_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
