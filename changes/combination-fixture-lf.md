# the plugins build on Windows again

### Forte (patch)
- The plugin tests' combination file is checked out with `\n` line endings on Windows too, as the preset files are, so the Windows build compares it byte for byte with what the window saves and passes again (0.49.0's Windows plugins were held back by it).
