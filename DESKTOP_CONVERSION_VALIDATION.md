# Sentinel 2.2 Desktop Conversion Validation

Validated in the current non-macOS build environment:

- Go unit tests pass.
- Go race tests pass.
- `go vet` passes.
- Web UI JavaScript syntax passes.
- Native Swift shell passes Swift parser validation.
- All desktop/release shell scripts pass `bash -n`.
- `--desktop` bootstrap smoke test starts on 127.0.0.1, emits machine-readable JSON, generates a 48-character random token, reports version 2.2, and shuts down via SIGTERM.
- Cross-built arm64 and x86_64 Go engines are regenerated for 2.2.
- The old shell-launcher `Sentinel.app` is intentionally removed from the V2.2 source package so it cannot be mistaken for the new native desktop build.

Requires real macOS validation:

- AppKit/WebKit compilation against the macOS SDK.
- Universal 2 desktop shell generation with `lipo`.
- WKWebView runtime and download behavior.
- Native FSEvents/Security.framework engine build paths.
- Developer ID signing/private key access.
- Hardened Runtime assessment.
- `hdiutil` DMG generation.
- Apple `notarytool` submission and stapling.
- Gatekeeper assessment on a clean Mac.

The release scripts intentionally fail instead of pretending these steps succeeded when run outside macOS or without Apple credentials.

## System Profile addition

- `GET /api/system-profile` added and authenticated by the normal local session token.
- Easy Mode `System Profile` page added with hardware explanations.
- Full serial number and Hardware UUID are deliberately omitted.
- Development-host localhost smoke test passed.
- `hardware_test.go` covers core-layout parsing and privacy semantics.
- Full local report now includes the privacy-filtered System Profile.
