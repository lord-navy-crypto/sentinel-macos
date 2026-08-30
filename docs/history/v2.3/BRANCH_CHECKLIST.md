# Sentinel v2.3 Branch Checklist

Working branch: `upgrade/v2.3-stable`

This tracker separates **pre-regression engineering readiness** from the later **real macOS regression / release-candidate** phase. A checked item means code, tests, and required UI/API wiring are present on this branch. Real-hardware checks remain intentionally unchecked until they are actually performed.

## Current phase

- [x] Core v2.3 implementation is on `upgrade/v2.3-stable` only.
- [x] Pre-regression engineering gate exists in API/UI and CI.
- [x] Final engineering gate includes Go tests, focused v2.3 contracts, Darwin arm64/amd64 build smoke, race tests, vet, JavaScript syntax, and shell syntax.
- [x] `main` is not part of this branch-preparation work.
- [ ] Real macOS regression matrix completed.
- [ ] Release-candidate artifact validated and promoted.
- [ ] Explicit merge/promotion decision to `main`.

## P0 — release-defining upgrades

### Incident Intelligence / Explain Why

- [x] Incident Intelligence 2.0 additive data/API model.
- [x] stable object-centered Incident StoryKey layered over bounded episode IDs.
- [x] deterministic split by canonical object and merge across correlation windows for the same object.
- [x] legacy incident history v1/v2 normalization into v3 object-centered stories.
- [x] ordered Incident evidence timeline.
- [x] Observed / Derived / Interpretation / Unknown separation.
- [x] versioned deterministic Reason Code registry.
- [x] versioned deterministic Rule registry with Reason Code validation.
- [x] standalone bounded Incident JSON export.
- [x] Incident → Continue Investigation evidence-node bridge.

### Object / Timeline intelligence

- [x] Object Story 2.0 aggregated investigation view.
- [x] object first/last-seen within retained integrated evidence.
- [x] Incident membership and object timeline.
- [x] Global Timeline backend across bounded evidence sources.
- [x] Safe Action journal integration in Global Timeline.
- [x] repetitive-event grouping while preserving raw EventIDs/provenance.
- [x] Evidence Graph 2.0 typed nodes/edges, filters, time filtering, and truncation budgets.

### Storage / snapshots

- [x] Storage Snapshot model and persistence runtime/API integration.
- [x] snapshot comparison and growth attribution.
- [x] partial-snapshot semantics.
- [x] bounded Storage History retention.
- [x] Storage Aging over the bounded retained large-file evidence set.
- [x] selected System Snapshot & Diff across process, launch, TCP, mount/filesystem, and security-posture evidence.

### Recovery / Safe Actions

- [x] Recovery Center backend aggregation.
- [x] interrupted/running/failed/cancelled storage-job visibility for recovery review.
- [x] Vault / action-journal / checkpoint / retained-state health aggregation.
- [x] existing dependency preview remains the Safe Action dependency gate.
- [x] post-action observation UX.
- [x] dedicated read-only Vault Health page.
- [x] no permanent-delete path introduced.

### Navigation / visibility / search

- [x] Visibility & Permissions Center.
- [x] Global Search / Cmd+K typed navigation.
- [x] Easy / Investigate / Advanced / Recover navigation normalization across v2.3 workspaces.
- [x] token-preserving navigation contract across deep explorers.

### v2.3 state compatibility and migration

- [x] explicit v2.3 schema/version compatibility foundation.
- [x] migration registry for legacy Behavior baseline/history.
- [x] migration registry for Trusted Profile/history.
- [x] migration registry for Change History/checkpoint.
- [x] migration registry for Incident history v1/v2 → v3.
- [x] migration runs before persistent managers load legacy state.
- [x] strict primary decoding before rewrite.
- [x] corrupt primary state is reported and never force-overwritten.
- [x] atomic private writes retain a last-known-good `.bak` rollback copy when replacing state.
- [x] `--ephemeral` skips persistent migration.
- [x] migration unit/contract tests are included in the focused pre-regression CI gate.

## P0.11 — Visual macOS System Console / Control Plane

- [x] bounded read-only macOS evidence-tool catalog.
- [x] no-shell/no-sudo execution boundary with allowlisted executables.
- [x] absolute-path / positive-PID target validation.
- [x] bounded query timeout and output capture.
- [x] authenticated catalog/query/structured/object-inspection routes.
- [x] question-first Ask the Mac recipes.
- [x] 40+ typed Terminal-backed tools/actions grouped by domain.
- [x] fixed command previews with validated placeholders.
- [x] structured parsers and raw evidence provenance.
- [x] path-specific System Console review evidence can contribute to Incident/Reason Code generation.
- [x] broader correlated Security Posture / Control Plane workspace.
- [x] managed mutation/recovery actions stay outside the read-only query runner.
- [x] tests reject arbitrary shell, `sudo`, command composition, duplicate tool IDs, and excessive timeouts.

See `SYSTEM_CONSOLE_V2.3.md`, `TERMINAL_TOOLBOX_V2.3.md`, and `CONTROL_PLANE_V2.3.md`.

## P0.12 — Continue Investigation / Security Investigation Graph

- [x] bounded read-only deep investigation core.
- [x] bundle-aware traversal and broad-folder bundle boundaries.
- [x] ranked code/config candidates with explicit Review Priority semantics.
- [x] top-candidate Integrity inspection.
- [x] plist → configured executable continuation.
- [x] authenticated investigation/runtime-context APIs.
- [x] process, parent-chain, TCP, open-object, launch-service, and background-item correlation.
- [x] dedicated branch workspace with back/forward navigation.
- [x] Investigation Sessions with bounded persistence / `--ephemeral` memory-only semantics.
- [x] notes/bookmarks/resume workflow.
- [x] stale branch-note propagation guard: automatic branch recording does not silently copy an old note.
- [x] privacy-aware Investigation Bundle export; metadata/evidence only by default, no investigated file contents copied by default.
- [x] contract tests keep investigation bounded and read-only.

## P1 — investigation expansion present before regression

- [x] Evidence Graph 2.0.
- [x] deterministic local Rule Engine.
- [x] versioned Rule registry / Reason Code references.
- [x] Storage trends/growth-history foundation and aging runtime/UI.
- [x] Network Evidence 2.0 explicit snapshot history and retained comparison.
- [x] Investigation Sessions.
- [x] Safe Actions post-action / Vault Health UX expansion.
- [x] GitHub Actions CI.
- [x] schema migration CI contracts.
- [x] Launch & Service Explorer.
- [x] Process Relationship Explorer.
- [x] Network Relationship Explorer.
- [x] bounded Gatekeeper/power/crash/launch/mount/network/system-extension log recipes.
- [x] System Snapshot & Diff.

### P1 items deliberately not required to begin real regression

- [ ] staged duplicate-detection 2.0 beyond the existing bounded exact SHA-256 duplicate flow.
- [ ] additional diagnostics/performance telemetry beyond current doctor/readiness/CI coverage.
- [ ] expanded benchmark fixture suite.

These are not release-preparation blockers for beginning the real macOS regression matrix and must not be used to delay validation of the implemented v2.3 surface.

## P2 — optional advanced capabilities

- [ ] optional local AI explanation interface.
- [ ] evidence-grounding contract for optional AI.
- [ ] entitlement-gated Endpoint Security integration.
- [ ] read-only evidence-provider/plugin interface.
- [ ] advanced local anomaly baselines.

These remain post-regression / later-roadmap items and are not claimed as implemented v2.3 core functionality.

## Cross-cutting engineering invariants

- [x] No new permanent-delete path.
- [x] Sentinel mutations remain explicit and reversible through Safe Actions.
- [x] New bounded operations use cancellation or strict timeouts where applicable.
- [x] Historical collections have explicit retention bounds.
- [x] Derived results retain evidence/source provenance.
- [x] Missing evidence is surfaced as limited visibility rather than a clean verdict.
- [x] Review/attention/confidence values are not presented as malware probability.
- [x] Core functionality has no cloud dependency.
- [x] New persistent schemas/registries have explicit versions.
- [x] v2.2 Sentinel-owned state is protected by strict migration and rollback semantics before rewritten state is relied upon.
- [x] System Console never exposes arbitrary shell, arbitrary command concatenation, or a web `sudo` terminal.
- [x] System Console mutations cannot bypass Safe Action preview/confirmation/journal/recovery boundaries.
- [x] Continue Investigation does not mutate the investigated object.
- [x] Investigation branching remains bounded and exposes truncation/visibility limits.
- [x] Unified Intelligence / Cmd+K avoids dynamic-code execution and dynamic HTML injection patterns.
- [x] Full Disk Access remains user-controlled and is not inferred from absence of errors.
- [x] Endpoint Security is not reported available unless an entitled/user-approved sensor is actually enabled.
- [x] Network history is explicit snapshot metadata, not packet capture or continuous surveillance.
- [x] Historical PIDs are capture-time context and are not reopened as if process identity were stable.

## Automated pre-regression gate

The branch workflow must pass on the **same final HEAD**:

- [x] `go test ./...`
- [x] focused v2.3 migration / Incident / timeline / export / aging / registry / Vault / navigation / pre-regression / session-note contracts
- [x] Darwin `arm64` build smoke
- [x] Darwin `amd64` build smoke
- [x] `go test -race ./...`
- [x] `go vet ./...`
- [x] JavaScript syntax validation for all v2.3 web scripts
- [x] release/build shell syntax validation

A passing cross-build is **not** a substitute for executing on an Intel Mac. It establishes build compatibility only.

## Next phase — real macOS regression matrix

The following are intentionally still open because they require the real application / operating system environment:

- [ ] launch the desktop app and verify bootstrap/token/navigation end-to-end.
- [ ] run, cancel, and rerun Storage Intelligence on real APFS data; capture/compare/age the result.
- [ ] verify `codesign`, Gatekeeper, quarantine, SIP, FileVault, and System Extension visibility against the real Mac.
- [ ] verify live process parent/open-file/TCP/LaunchAgent correlations.
- [ ] use controlled disposable files for Safe Action preview → confirm → rename/vault → restore and post-action observation.
- [ ] upgrade a copied real v2.2 state directory and verify preserved history plus `.bak` rollback artifacts.
- [ ] build/package the actual Universal2 desktop app/DMG; install, launch, quit, relaunch, and verify embedded resources on Apple Silicon.
- [ ] run on real Intel hardware if available; otherwise record Intel runtime as unverified while retaining the CI `amd64` build proof.
- [ ] final release-artifact signing / Gatekeeper / distribution verification.

## Branch gates

### Gate A — data contracts

- [x] Core v2.3 evidence/state contracts are stable enough for regression.

### Gate B — backend complete

- [x] Release-defining APIs have unit/contract coverage before regression.

### Gate C — pre-regression engineering complete

- [x] Feature-preparation work is frozen; only regression defects, release blockers, and documentation corrections should be accepted before/through the real regression pass.

### Gate D — release candidate

- [ ] Real macOS regression matrix passes and `v2.3.0-rc.1` can be cut.

### Gate E — stable

- [ ] `v2.3.0` is cut only after release-artifact validation and an explicit merge/promotion decision. `main` remains separate until that decision is made.
