# Real-Mac signing / notarization checklist

1. Build on a real Mac with Xcode Command Line Tools so native CoreServices FSEvents and Security.framework bridges are compiled.
2. Run `./build-app-macos.sh`.
3. Sign nested binaries first, then the app bundle with a Developer ID Application identity and an explicitly reviewed entitlement set.
4. Verify with `codesign --verify --deep --strict --verbose=4 dist/Sentinel.app` and `spctl --assess --type execute -vv dist/Sentinel.app`.
5. Submit the signed archive to Apple's notary service and staple the ticket after success.
6. Re-run Sentinel self-integrity and real-Mac functional tests after signing/notarization.

Do not add Endpoint Security entitlements unless Apple has approved them for the signing team and the System Extension packaging/lifecycle has been implemented and reviewed.
