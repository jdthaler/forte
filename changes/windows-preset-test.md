# the preset tests pass on Windows

### Forte (patch)
- The plugins' preset tests pass on Windows: they open a preset whose name is not plain ASCII
  (¼-comma meantone, an em dash) by its UTF-8 path, as the plugin saves it, and the site's
  preset files they compare against keep `\n` line endings in a Windows checkout.
