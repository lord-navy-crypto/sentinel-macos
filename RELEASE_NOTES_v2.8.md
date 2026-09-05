# Sentinel 2.8 — Product Reliability

Sentinel 2.8 moves the project from feature accumulation toward product reliability, release evidence, and measurable self-observation while preserving the local-first and evidence-first model introduced in 2.7.

## Product Reliability

### Sentinel Self Health

The Machine view now includes a dedicated Sentinel reliability surface showing current Sentinel process evidence:

- process CPU;
- resident memory (RSS);
- Go heap allocation and reservation;
- goroutine count;
- completed garbage collections;
- Sentinel uptime;
- self-health collection cost.

Sentinel displays engineering CPU budgets of **≤1% idle** and **≤3% during normal monitoring**. These are product budgets, not Mac health thresholds. A single sample is not treated as a sustained performance regression.

### Update Intelligence

Sentinel can manually inspect public GitHub Release metadata from the Machine view.

- Stable and Beta channels are separate.
- Update checks occur only after explicit user action.
- The request is bounded by time and response size.
- Stable ignores visibly beta/alpha/preview/release-candidate builds even when upstream prerelease metadata is configured incorrectly.
- Version ordering handles prerelease numeric identifiers such as `beta.10 > beta.2`.
- DMG and checksum assets are identified when listed.

This is **release discovery, not an automatic updater**. Sentinel 2.8 does not download, execute, replace, or install application code from this feature.

### Task Center integration

Manual update checks are represented in the Floating Task Center as indeterminate tasks because a meaningful completion percentage is not available. Sentinel continues to avoid fabricated percentages and ETAs.

## Release Trust Manifest

Every development/Beta DMG now emits a machine-readable release trust manifest alongside its SHA-256 checksum. Beta/development manifests explicitly record that Developer ID signing, Hardened Runtime, notarization, stapling, and Gatekeeper verification are not production-complete.

The production release pipeline generates its trust manifest only after the exact DMG has passed the existing fail-closed release chain:

1. clean committed source and source-commit provenance;
2. native arm64 and x86_64 capability checks;
3. Developer ID signing with Hardened Runtime;
4. app and DMG signature verification;
5. Apple notarization;
6. stapling and staple validation;
7. exact-artifact Gatekeeper and mounted-app verification;
8. SHA-256 generation.

The resulting manifest records the product version, source commit, artifact name/hash, native capability state, and verified distribution-trust state.

## Version identity

`VERSION` remains the single product-version source for the Go engine and macOS bundle packaging. Sentinel 2.8 adds a regression contract that also keeps the visible product identity synchronized with that version.

## Architecture continuity

Sentinel remains a single native macOS application window backed by a loopback-only, token-authenticated local Go evidence engine. The user-facing browser launcher remains retired.

The Visual Native system, left-side Workbench dock, bottom-right Task Center, Resource Observatory, Maintenance Intelligence, Network Diagnostics, Visual Terminal Tools, Local AI, Safe Change, and investigation workflows remain part of the retained product.

## What comes next: Evidence History fusion

Sentinel already contains bounded history/change primitives for resources, storage, network activity, Behavior/Trust, FSEvents-backed changes, and global/grouped timelines. The next engineering phase should unify those existing sources into a coherent **Evidence History / What Changed?** experience rather than create parallel storage systems.

Target flow:

`observe → retain bounded evidence → correlate by time/object → explain with uncertainty → Workbench review`

Long-term retention must remain bounded, local, inspectable, and removable by the user.

## Reliability principles

- Read-only by default.
- Evidence before conclusions.
- No fabricated progress or ETA.
- Explicit uncertainty and visibility limits.
- Bounded expensive work.
- No arbitrary shell execution.
- Preview and recovery before supported mutations.
- Distribution trust is verified by the release pipeline, not inferred by the UI.
