#!/usr/bin/env bash
# Installs Ubuntu packages (apt-get install's arguments), from the ones an earlier run downloaded
# when the job caches $APT_ARCHIVES, and gives up on a slow or stuck mirror after a few minutes to
# try again from Ubuntu's own archive. A step has no time limit of its own: on 2026-10-26 Azure's
# Ubuntu mirror sent some runners packages at 30-40 kB/s (others at 30 MB/s), and the page
# checks took 13 minutes over theirs while the plugins' job waited on its own for over half an
# hour. What a try downloaded stays for the next.
# Usage: .github/scripts/apt-install.sh [--no-install-recommends] <package>...
set -uo pipefail
dir=${APT_ARCHIVES:-$RUNNER_TEMP/apt}
mkdir -p "$dir/partial"
opts=(-q -o Dir::Cache::Archives="$dir" -o Acquire::Retries=3 -o Acquire::http::Timeout=30)
limit=240
for try in 1 2 3; do
  if sudo timeout 180 apt-get "${opts[@]}" update &&
     sudo timeout "$limit" apt-get "${opts[@]}" install -y "$@"; then
    sudo chown -R "$(id -u):$(id -g)" "$dir" # so that the cache can keep them
    echo "$(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages kept in $dir"
    exit 0
  fi
  echo "::warning::apt-get failed or took too long (try $try of 3)"
  sudo dpkg --configure -a
  # the next try from Ubuntu's own archive, with longer to finish
  for f in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/*; do
    [ -f "$f" ] && sudo sed -i 's#azure\.archive\.ubuntu\.com#archive.ubuntu.com#g' "$f"
  done
  limit=600
done
echo "::error::apt-get failed three times"
exit 1
