#!/usr/bin/env bash
# test-linux-packages.sh — installs the Linux packages tools/package-linux.sh made on clean
# systems, in containers (Docker), and checks them: Forte-plugins-linux.deb on Debian 13 and
# Ubuntu 24.04, Forte-plugins-linux.rpm on Fedora 42. On each, the package manager installs it
# with every library it needs, and the download's install.sh (from the archive's folder) checks
# that every plugin and app is in the system folders, is this download's and finds every library
# it links (verify); then the package is removed and must leave none of them behind.
#
#   tools/test-linux-packages.sh "native/build/pkg/Forte-plugins/Forte plugins"   (after package-linux.sh)
set -euo pipefail
src=$(cd "$1" && pwd)
dist=$PWD/dist
proxy=()
for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY; do [ -z "${!v:-}" ] || proxy+=(-e "$v"); done

check='cd "/src" && VST3_DIR=/usr/lib/vst3 CLAP_DIR=/usr/lib/clap APP_DIR=/usr/lib/forte bash install.sh verify vst3 clap app >/tmp/verify.log || { cat /tmp/verify.log; exit 1; }
tail -1 /tmp/verify.log
command -v forte >/dev/null || { echo "forte is not on the PATH"; exit 1; }
[ -f /usr/share/applications/net.jthaler.forte.desktop ] || { echo "no desktop entry"; exit 1; }'
gone='left=$(ls -A /usr/lib/vst3 /usr/lib/clap /usr/lib/forte 2>/dev/null | grep -v "^/" | grep . || true)
[ -z "$left" ] && [ ! -e /usr/bin/forte ] || { echo "removing the package left: $left"; exit 1; }
echo "removed cleanly"'

run() {
  local image=$1 script=$2
  echo "== $image"
  docker run --rm --network host "${proxy[@]}" -v "$src:/src:ro" -v "$dist:/dist:ro" "$image" bash -euo pipefail -c "$script"
}

for image in debian:trixie ubuntu:24.04; do
  run "$image" "export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq diffutils /dist/Forte-plugins-linux.deb >/tmp/apt.log 2>&1 || { tail -40 /tmp/apt.log; exit 1; }
dpkg -s forte-plugins | grep -E '^(Status|Version):'
$check
apt-get remove -y -qq forte-plugins >/dev/null
$gone"
done

run fedora:42 "dnf install -y -q diffutils glibc-common /dist/Forte-plugins-linux.rpm >/tmp/dnf.log 2>&1 || { tail -40 /tmp/dnf.log; exit 1; }
rpm -q forte-plugins
$check
dnf remove -y -q forte-plugins >/dev/null
$gone"
echo "The packages install, work and uninstall on Debian, Ubuntu and Fedora."
