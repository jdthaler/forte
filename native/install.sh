#!/usr/bin/env bash
# install.sh — installs and checks the Forte plugins in its folder, on macOS and Linux. It ships
# in each download next to the plugins and a Makefile that runs it (native/install.mk), and works
# on whichever plugins are in its folder: one instrument's or every instrument's.
#
#   bash install.sh install | verify | uninstall | check [au] [vst3] [clap] [app]
#
# (or make install, make install-au, make check-app…). With formats named, only those: au, vst3,
# clap, or app (the standalone). install, verify and uninstall work on the installed copies;
# check checks the plugins in this folder as they are, without installing anything.
# The folders can be changed through VST3_DIR, CLAP_DIR, AU_DIR and APP_DIR.
# native/install.sh in https://github.com/jdthaler/forte.
set -euo pipefail
cd "$(dirname "$0")"
OS=$(uname -s)
case "$OS" in
  Darwin)
    PLUGINS="$HOME/Library/Audio/Plug-Ins"
    AU_DIR=${AU_DIR:-$PLUGINS/Components}
    VST3_DIR=${VST3_DIR:-$PLUGINS/VST3}
    CLAP_DIR=${CLAP_DIR:-$PLUGINS/CLAP}
    APP_DIR=${APP_DIR:-$HOME/Applications} ;;
  Linux)
    VST3_DIR=${VST3_DIR:-$HOME/.vst3}
    CLAP_DIR=${CLAP_DIR:-$HOME/.clap}
    APP_DIR=${APP_DIR:-$HOME/.local/bin} ;;
  *) echo "This is for macOS and Linux; on Windows, follow INSTALL.md." >&2; exit 1 ;;
esac

# Every plugin in this folder, one per line, as "<kind> <name>": au, vst3, clap or app. Names
# have spaces in them, so the commands read this list line by line.
each() {
  local p
  for p in *.component; do [ -e "$p" ] && echo "au $p"; done
  for p in *.vst3; do [ -e "$p" ] && echo "vst3 $p"; done
  for p in *.clap; do [ -e "$p" ] && echo "clap $p"; done
  for p in *.app; do [ -e "$p" ] && echo "app $p"; done
  for p in *; do [ -f "$p" ] && [ -x "$p" ] && [[ "$p" != *.* ]] && echo "app $p"; done
  true
}

# dir <kind>: the folder that kind goes in
dir() { case "$1" in au) echo "$AU_DIR" ;; vst3) echo "$VST3_DIR" ;; clap) echo "$CLAP_DIR" ;; app) echo "$APP_DIR" ;; esac; }

cmd=${1:-}
# (macOS's bash 3.2 calls an empty array unbound under set -u, so kinds is never empty)
if [ $# -gt 1 ]; then kinds=("${@:2}"); else kinds=(au vst3 clap app); fi
for k in "${kinds[@]}"; do
  case "$k" in au|vst3|clap|app) ;; *) echo "Unknown format '$k': au, vst3, clap or app." >&2; exit 2 ;; esac
done
list=$(each | while read -r kind name; do
  for k in "${kinds[@]}"; do [ "$k" = "$kind" ] && echo "$kind $name"; done
done; true)
[ -n "$list" ] || { echo "No ${kinds[*]} plugins next to install.sh (on Linux there is no au)." >&2; exit 1; }

install() {
  local kind name d
  while read -r kind name; do
    d=$(dir "$kind"); mkdir -p "$d"
    rm -rf "${d:?}/$name"
    cp -R "$name" "$d/"
    if [ "$OS" = Darwin ]; then xattr -dr com.apple.quarantine "$d/$name" 2>/dev/null || true; fi
    echo "installed $d/$name"
  done <<< "$list"
  if [ "$OS" = Darwin ] && grep -q '^au ' <<< "$list"; then killall -9 AudioComponentRegistrar 2>/dev/null || true; fi
  if [ "${#kinds[@]}" -eq 1 ]; then echo "Now check them: make verify-${kinds[0]}"; else echo "Now check them: make verify"; fi
}

bad=0
fail() { echo "FAIL  $*"; bad=$((bad + 1)); }

# loads <kind> <path>: whether the plugin at <path> can load here. Fails and returns 1 if not.
loads() {
  local kind=$1 p=$2 missing
  if [ "$OS" = Darwin ] && ! codesign --verify --deep "$p" 2>/dev/null; then
    fail "$p: its signature does not check out (codesign --verify --deep)"; return 1
  fi
  if [ "$OS" = Linux ]; then
    missing=$(find "$p" -type f -exec ldd {} \; 2>/dev/null | { grep 'not found' || true; } | awk '{print $1}' | sort -u | tr '\n' ' ')
    if [ -n "$missing" ]; then fail "$p needs libraries this system lacks: ${missing}(install them with your package manager)"; return 1; fi
  fi
  if [ "$kind" = clap ] && command -v clap-validator >/dev/null; then
    clap-validator validate "$p" >/dev/null 2>&1 || { fail "$p: clap-validator validate failed"; return 1; }
  fi
}

verify() {
  local kind name p plist t s m
  while read -r kind name; do
    p="$(dir "$kind")/$name"
    if [ ! -e "$p" ]; then fail "$p is not installed (make install-$kind)"; continue; fi
    if ! diff -rq "$name" "$p" >/dev/null 2>&1; then fail "$p differs from this download (make install-$kind)"; continue; fi
    if [ "$OS" = Darwin ] && xattr -r "$p" 2>/dev/null | grep -q com.apple.quarantine; then
      fail "$p is still quarantined (make install-$kind)"; continue
    fi
    loads "$kind" "$p" || continue
    if [ "$kind" = au ]; then
      plist="$p/Contents/Info.plist"
      t=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:type' "$plist")
      s=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:subtype' "$plist")
      m=$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:manufacturer' "$plist")
      if ! auval -v "$t" "$s" "$m" > "${TMPDIR:-/tmp}/forte-auval.log" 2>&1 ||
         ! grep -q 'AU VALIDATION SUCCEEDED' "${TMPDIR:-/tmp}/forte-auval.log"; then
        fail "$p: auval -v $t $s $m failed (its log: ${TMPDIR:-/tmp}/forte-auval.log). If it cannot find the component, log out and back in, then try again."
        continue
      fi
    fi
    echo "ok    $p"
  done <<< "$list"
  if [ "$bad" -gt 0 ]; then echo "$bad problem(s)"; exit 1; fi
  echo "All installed and working."
}

# check: the plugins in this folder, as downloaded, without installing anything. The Audio Units'
# auval needs them installed (make verify-au); a quarantined download is reported, since macOS
# won't open it until the quarantine is cleared.
check() {
  local kind name
  while read -r kind name; do
    if [ "$OS" = Darwin ] && xattr -r "$name" 2>/dev/null | grep -q com.apple.quarantine; then
      fail "$name is quarantined, so macOS won't open it: run xattr -dr com.apple.quarantine \"$name\" (make install-$kind does it as it installs)"
      continue
    fi
    loads "$kind" "$name" || continue
    if [ "$kind" = au ]; then echo "ok    $name (auval needs it installed: make install-au, make verify-au)"; else echo "ok    $name"; fi
  done <<< "$list"
  if [ "$bad" -gt 0 ]; then echo "$bad problem(s)"; exit 1; fi
  if grep -q '^app ' <<< "$list"; then echo "All can load. The standalone runs from this folder: open it, no install needed."; else echo "All can load."; fi
}

uninstall() {
  local kind name d
  while read -r kind name; do
    d=$(dir "$kind")
    if [ -e "$d/$name" ]; then rm -rf "${d:?}/$name"; echo "removed $d/$name"; fi
  done <<< "$list"
}

case "$cmd" in
  install|verify|uninstall|check) "$cmd" ;;
  *) echo "usage: bash install.sh install|verify|uninstall|check [au] [vst3] [clap] [app]" >&2; exit 2 ;;
esac
