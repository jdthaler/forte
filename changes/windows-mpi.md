# the plugin tests build with MSVC again

### Forte (patch)
- **The plugin tests use `std::numbers::pi` in place of `M_PI`,** which MSVC leaves undefined.
