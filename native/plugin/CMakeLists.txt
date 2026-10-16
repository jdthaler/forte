# forte_plugin: the CLAP plugin every instrument shares; forte_add_plugin() (cmake/forte.cmake)
# makes each instrument's CLAP, VST3, AU v2 and standalone from it.
add_library(forte_plugin STATIC plugin.cpp)
target_include_directories(forte_plugin PUBLIC .)
target_link_libraries(forte_plugin PUBLIC forte_core clap clap-wrapper-extensions)
