# the plugin tests build with MSVC again

### Forte (patch)
- **The native tests include `<algorithm>` for `std::clamp`,** which MSVC needs spelled out (the MPE, Reed Piano and plugin tests).
