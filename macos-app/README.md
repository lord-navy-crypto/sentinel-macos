# Sentinel.app packaging

`./build-app-macos.sh` creates `dist/Sentinel.app`. The app is a thin Finder-friendly wrapper around the same localhost engine; Terminal flags remain available through the standalone binaries.

The development app bundle is intentionally unsigned in this environment. A production build should be made on a real Mac, signed with Developer ID, hardened-runtime settings reviewed, notarized, and stapled. Endpoint Security is a separate optional System Extension track and must not be silently embedded or enabled.
