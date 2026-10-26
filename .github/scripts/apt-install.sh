#!/usr/bin/env bash
# Installs Ubuntu packages (apt-get install's arguments), from the ones an earlier run downloaded
# when the job caches $APT_ARCHIVES, and gives up on a slow or stuck mirror after a few minutes to
# try again. A step has no time limit of its own: on 2026-10-26 Azure's Ubuntu mirror sent
# packages at 28 kB/s, and the page checks took 13 minutes over theirs while the plugins' job
# waited on its own for over half an hour.
# Usage: .github/scripts/apt-install.sh [--no-install-recommends] <package>...
set -uo pipefail
dir=${APT_ARCHIVES:-$RUNNER_TEMP/apt}
mkdir -p "$dir/partial"
opts=(-q -o Dir::Cache::Archives="$dir" -o Acquire::Retries=3 -o Acquire::http::Timeout=30)
for try in 1 2 3; do
  if sudo timeout 180 apt-get "${opts[@]}" update &&
     sudo timeout 300 apt-get "${opts[@]}" install -y "$@"; then
    sudo chown -R "$(id -u):$(id -g)" "$dir" # so that the cache can keep them
    echo "$(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages kept in $dir"
    exit 0
  fi
  echo "::warning::apt-get failed or took too long (try $try of 3)"
  sudo dpkg --configure -a
done
echo "::error::apt-get failed three times"
exit 1
