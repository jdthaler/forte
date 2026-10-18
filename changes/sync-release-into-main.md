# releases reach main through a pull request

### Forte (patch)
- A pull request that brings a release from `live` back into `main` passes the release-note check:
  only what it adds beyond `live` is checked (`tools/release.mjs --check-pr`).
