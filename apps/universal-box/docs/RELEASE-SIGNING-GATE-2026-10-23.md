# Sentinel Box — release signing and native QA gate

Status: 2026-10-23. Applies to the **`apps/universal-box` macOS Tauri app**, not the separate root Sentinel app.

## What is already verified

The integrated office code was merged via PR #131 (main commit `8f5245b`). On the integration commit, Chromium ran 51 tests with no failures, core product checks succeeded, and **both** `aarch64-apple-darwin` and `x86_64-apple-darwin` test DMG builds succeeded. CI mounted the DMGs, checked icon and executable presence and verified an **ad-hoc** signature. These tests do not prove the app is signed with Apple Developer ID, notarized, distributed safely, or compatible with every real app.

Test builds and evidence: [Sentinel Box Desktop CI (both DMGs)](https://github.com/lord-navy-crypto/sentinel-macos/actions/runs/39934603607) and [Chromium evidence](https://github.com/lord-navy-crypto/sentinel-macos/actions/runs/39934603654).

## Why CI uploads are not public releases

The GitHub Actions workflow `.github/workflows/release-daily-desk.yml` previously attempted to automatically publish the ad-hoc DMG artifacts for version tags, despite having **no Developer ID signing/notarization step**. It also expected `UniversalBox-*` downloads while its build job uploaded `SentinelBox-*`. The publish job was removed and `contents` permission reduced to read: tags or manual dispatch now produce **test artifacts only**. There is deliberately no automatic GitHub Release publication of unnotarized DMGs.

## True release checklist (separate from merging source to main)

- [ ] Test the integrated Sentinel Box `apps/universal-box` app on an authorized online **Apple Silicon Mac** and an **Intel Mac**, including a real launch from each installed DMG.
- [ ] Verify plain-text and rich clipboard permission behavior in WKWebView (allowed, denied and manual paste fallback), file selection, cancellation, Finder save dialogs and UTF-8 Chinese text.
- [ ] Open genuine merged PDF in **Preview** and check page count, order and text/graphics.
- [ ] Open real exported DOCX in **Pages** and Microsoft Word (when installed) and CSV in **Numbers** or Excel; inspect font substitution, leading-zero IDs and symbol conversions.
- [ ] Check Apple Vision OCR image selection and authorization, Chinese/English recognition accuracy and explicit user-controlled export; no covert screen monitoring or remote upload.
- [ ] Use **two authorized real devices** for LAN pairing/consent, file SHA-256, cancellation and interrupted-transfer handling. Browser tests and single-machine mocks do not substitute for this step.
- [ ] Set up **Apple Developer Program** credentials for the **Sentinel Box Tauri bundle** on a trusted Mac runner or local signing machine. Don't paste certificates, passwords or credentials into GitHub source files or chat.
- [ ] After signing the `.app` with the appropriate hardened-runtime entitlements and Developer ID identity, build and sign its DMG, submit it to Apple Notary Service via `xcrun notarytool`, staple the accepted ticket, and verify the signed app and disk image with `codesign`, `spctl` and `hdiutil`.
- [ ] Record exact build SHA, version, notarization result, checksums and a matching changelog, then explicitly publish only the checked notarized DMG(s) through an authorized GitHub Release.
- [ ] Test the public download link and installed version after publication.

**Current blocker:** the connected MacBook Air in this ChatGPT session is **offline**, and a second authorized Mac is not connected. Apple signing/notarization credentials are not available to this session. No physical-device QA, notarized DMG or public release is claimed.

The root-level `MAC_RELEASE_STEPS.txt` is for the separate `Sentinel.app`; it must not be treated as proof that the nested Sentinel Box Tauri application was signed and notarized.
