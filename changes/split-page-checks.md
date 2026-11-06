# the page check splits its pages and reuses its base's counts

### Forte (patch)
- `tools/check-pages.mjs --shard k/n` checks every nth page from the kth, so CI checks the pages on two machines at once.
- `--base-json a.json,b.json` with `--base <ref>` compares with the counts a run on `<ref>` wrote with `--json`, and opens only the pages of `<ref>`'s that they have no counts for (a new page, or a file not written yet). Each run on `main` and `live` keeps its counts, so a pull request's page check opens each page once, not twice.
