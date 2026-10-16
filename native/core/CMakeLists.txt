# forte_core: the engine contract and what every instrument shares (docs/PLUGINS.md, step 2).
add_library(forte_core STATIC src/params.cpp)
target_include_directories(forte_core PUBLIC include)
target_link_libraries(forte_core PUBLIC forte_eigen)
target_compile_features(forte_core PUBLIC cxx_std_20)
