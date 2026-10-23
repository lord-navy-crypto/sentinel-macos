# Sentinel Box · v0.91 macOS Release Pipeline Hardening

**2026-10-23 · Stacked Draft — this is infrastructure, not a new published app version.**

## The actual defect

The existing macOS release workflow uploaded the two architecture installers as artifacts named
`SentinelBox-aarch64-apple-darwin` and `SentinelBox-x86_64-apple-darwin`, but its
`publish-release` job requested `UniversalBox-*`. As a result the publisher could not discover the two installer artifacts and would fail even if both build jobs succeeded.

The previous pipeline also accepted a manually pushed release tag without verifying that its version matched the four release metadata files. It immediately published a public GitHub Release despite artifacts only carrying ad-hoc signatures rather than Apple Developer ID signing and notarization.

## Committed repairs

1. **Match the producer and consumer**: both use `SentinelBox-*`. The publish job fails unless it finds **exactly two** DMG files after downloading both artifacts.
2. **Fail before spending macOS build minutes**: a new `verify-release-source` job loads `package.json`, root `package-lock.json`, lockfile `packages[""]`, Tauri config and Rust `Cargo.toml` and verifies consistent semver and bundle identity. On a tag trigger, the actual pushed tag must match that version. Support existing legacy tag prefixes `daily-desk-v`, `universal-box-v` and `sentinel-box-v`.
3. **Real SHA-256 manifests**: calculate SHA-256 for both actual DMGs, verify with `sha256sum -c`, upload `SHA256SUMS.txt` together with them.
4. **Review-first behavior**: the tag workflow creates a **draft release** after successful build. It does not call Apple notarization or misrepresent an ad-hoc-signed app as a publicly trusted Developer ID build. A human reviews the real installers and then decides whether to publish.
5. **Continuous regression enforcement**: `scripts/release-preflight.cjs` is a local, dependency-free verifier; `test/release-preflight.test.cjs` covers real repository metadata, mismatches, tag aliases, invalid release tags, app identity, artifact name producer/consumer symmetry and exact two-DMG plus checksum requirements. Both run in browser and desktop CI, as well as at the beginning of the release workflow.

## What is explicitly NOT complete

- **Actual application version remains 0.36.0**. Milestones 0.83–0.91 are development labels, not published package versions. A future new release must intentionally update all four metadata files in one reviewed commit.
- No manually triggered publishing, Git tag or GitHub Release creation has been performed by this development PR.
- DMGs built by CI may still be ad-hoc signed and **not notarized**. Successful CI mounting/signature verification does not prove Gatekeeper acceptance for end users downloading from the web.
- Changes are still on a stacked Draft based on the v0.90 branch. The long ancestral PR chain must be reviewed and integrated before official shipping.

## Automated and manual acceptance

- [x] Artifact download pattern corrected to the actual upload naming convention.
- [x] Tag/version/identity validator and automated Node tests committed.
- [x] Exact-two-DMG gate, full-file checksums and draft-first release workflow committed.
- [x] Desktop and Chromium CI extended to run release contract tests.
- [ ] v0.91 current HEAD: unit, browser and dual-architecture macOS CI pass.
- [ ] Actual tagged test release rehearsal on a reviewed integration branch, without creating unintended public release.
- [ ] Real Intel and Apple Silicon macOS Finder/installer/first launch QA on hardware.
- [ ] Developer ID signing and notarization decisions (or transparent unnotarized manual installation documentation).
- [ ] Ordered merge of stacked PR dependencies, app version release commit and explicit reviewer approval.

Reference: `docs/INTEGRATION-RELEASE-GATES-2026-10-22.md` and the archived ultimate plan.
