#!/usr/bin/env bash
# package-plugins.sh — the archives a plugin release ships (docs/PLUGINS.md, step 5), from the
# plugins one system built: Forte-plugins-<system> with every instrument that has plugins
# (`plugin.ready` in shared/registry.js) and the Forte app (all of them in one standalone), and
# Forte-<id>-<system> with each one alone, and each of those also one format at a time (Forte-<id>-<format>-<system>: au, vst3, clap or app), each
# with native/INSTALL.md, and on macOS and Linux native/install.sh with its Makefile (make install,
# make verify). The template's plugins are left out. The archives keep the bundles'
# executable bits and macOS's signatures. Run from the repository's root after building:
#
#   tools/package-plugins.sh <linux|macos|windows>     writes dist/
set -euo pipefail
preset=$1
plugins=native/build/$preset/plugins
root=native/build/pkg
rm -rf "$root" dist
mkdir -p "$root" dist

# Every bundle wherever the generator put it (Visual Studio nests them in CLAP/Release/, VST3/
# and Standalone-*/Release/), and Linux's standalone, which has no extension.
bundles() {
  find "$plugins" \( -name '*.clap' -o -name '*.vst3' -o -name '*.component' -o -name '*.app' -o -name '*.exe' \) -prune -print
  [ "$preset" != linux ] || find "$plugins" -mindepth 1 -maxdepth 1 -type f ! -name '*.*' -perm -u+x
}

# the formats this system builds, as shared/plugins.js names them
case "$preset" in macos) formats=(au vst3 clap app) ;; *) formats=(vst3 clap app) ;; esac

# kind <bundle>: its format
kind() { case "$1" in *.component) echo au ;; *.vst3) echo vst3 ;; *.clap) echo clap ;; *) echo app ;; esac; }

# pack <archive name without extension> <folder name inside it> <format, or all> <instrument name>…
pack() {
  local out=$1 folder=$2 format=$3; shift 3
  local dir="$root/$out/$folder"
  mkdir -p "$dir"
  for name in "$@"; do
    local n=0
    while IFS= read -r p; do
      b=$(basename "$p")
      [ "$format" = all ] || [ "$(kind "$b")" = "$format" ] || continue
      if [ "$b" = "$name" ] || [ "${b%.*}" = "$name" ]; then cp -R "$p" "$dir"/; n=$((n + 1)); fi
    done < <(bundles)
    [ "$n" -gt 0 ] || { echo "no $format plugins built for $name in $plugins" >&2; exit 1; }
  done
  cp native/INSTALL.md "$dir"/
  [ "$preset" = windows ] || { cp native/install.mk "$dir/Makefile"; cp native/install.sh "$dir/"; }
  case "$preset" in
    macos) ditto -c -k --sequesterRsrc --keepParent "$dir" "dist/$out-macos.zip" ;;
    windows) (cd "$root/$out" && 7z a -tzip -bso0 "../../../../dist/$out-windows.zip" "$folder") ;;
    linux) tar -czf "dist/$out-linux.tar.gz" -C "$root/$out" "$folder" ;;
  esac
}

names=()
while IFS=$'\t' read -r id name; do
  name=${name%$'\r'}
  names+=("$name")
  pack "Forte-$id" "$name" all "$name"
  for f in "${formats[@]}"; do pack "Forte-$id-$f" "$name" "$f" "$name"; done
done < <(node tools/plugin-release.mjs --plugins)
[ "${#names[@]}" -gt 0 ] || { echo "tools/plugin-release.mjs --plugins listed no instruments" >&2; exit 1; }
# with the Forte app, every instrument in one standalone (forte_add_suite), among the apps
pack Forte-plugins "Forte plugins" all "${names[@]}" Forte
for f in "${formats[@]}"; do
  if [ "$f" = app ]; then pack "Forte-plugins-$f" "Forte plugins" "$f" "${names[@]}" Forte
  else pack "Forte-plugins-$f" "Forte plugins" "$f" "${names[@]}"; fi
done
ls -l dist
