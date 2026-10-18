# apply-patch.cmake — cmake -DPATCH=<file.patch> -P apply-patch.cmake, in a fetched dependency's
# source (its PATCH_COMMAND, dependencies.cmake): applies the patch, once; a source that already
# has it is left as it is.
execute_process(COMMAND git apply --reverse --check ${PATCH} RESULT_VARIABLE has OUTPUT_QUIET ERROR_QUIET)
if (has EQUAL 0)
  return()
endif()
execute_process(COMMAND git apply ${PATCH} RESULT_VARIABLE failed)
if (failed)
  message(FATAL_ERROR "${PATCH} does not apply to ${CMAKE_CURRENT_SOURCE_DIR}")
endif()
