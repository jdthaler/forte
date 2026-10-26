#!/usr/bin/env bash
# One hash of what a native build reads (the tracked files under the paths given), for native.yml's
# "built and checked already?" steps. What a release writes and no build depends on doesn't count:
# the version numbers (FORTE_VERSION in each <slug>-info.cmake, "version" in package.json) and the
# saved states of the new versions (native/tests/states/, which release.mjs only ever adds). So a
# release's pull request, whose sources are main's but for those, reuses main's green Linux run;
# the full run on live builds and tests everything, versions and states included, before any
# plugin is published.
# Usage: .github/scripts/native-sources.sh <pathspec>...
set -euo pipefail
git ls-files -z -- "$@" | sort -z | while IFS= read -r -d '' f; do
  case "$f" in
    native/tests/states/*) continue ;;
    *-info.cmake) h=$(sed '/^set(FORTE_VERSION /d' "$f" | sha256sum) ;;
    package.json) h=$(sed '/^  "version": /d' "$f" | sha256sum) ;;
    *) h=$(sha256sum < "$f") ;;
  esac
  printf '%s %s\n' "${h%% *}" "$f"
done | sha256sum | cut -c1-64
