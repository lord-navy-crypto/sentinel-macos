# Sentinel macOS v2.3 — Development Branch

Status: **pre-regression engineering complete; real macOS regression pending**

Branch: `upgrade/v2.3-stable`

This branch is not a stable release and is not merged into `main`.

## v2.3 direction

Sentinel v2.3 deepens the existing local-first macOS investigation platform. Security remains the primary entry point, while the product is organized around four user goals:

- **Understand** what macOS is doing.
- **Investigate** files, apps, processes, persistence, network evidence, incidents, and relationships.
- **Control** only through typed Sentinel workflows rather than arbitrary shell execution.
- **Recover** through reversible Safe Actions, retained metadata, history, checkpoints, and rollback state.

Core interaction principle: **a report is a node, not the end of an investigation**.

## Release-preparation state

The engineering-preparation work for the real macOS regression phase is now present on `upgrade/v2.3-stable`:

- v2.3 persistent-state migration runs before legacy managers load state.
- Incident history v3 uses stable object-centered StoryKeys while retaining bounded episode IDs.
- deterministic Reason Code and Rule registries are versioned and contract-tested.
- Global Timeline repetitive-event grouping is implemented without discarding raw EventIDs/provenance.
- standalone Incident export and privacy-aware Investigation Bundle export are implemented.
- Storage History runtime/API integration, growth comparison, System Snapshot & Diff, and bounded Storage Aging are implemented.
- Recovery Center and dedicated Vault Health expose Sentinel-owned recovery metadata without introducing permanent deletion.
- Easy / Investigate / Advanced / Recover navigation is normalized across v2.3 deep workspaces with token preservation.
- a dedicated Pre-Regression Gate reports engineering blockers separately from real-Mac checks.
- GitHub Actions now runs the full Go suite, focused v2.3 contracts, Darwin arm64/amd64 build smoke, race tests, vet, JavaScript syntax, and build/release shell syntax.

A successful `amd64` cross-build is build evidence only; it is not claimed as real Intel runtime validation.

## Incident Intelligence 2.0

- additive `/api/incidents/v2` intelligence model while preserving legacy compatibility surfaces.
- stable object-centered StoryKey separated from bounded correlation Episode ID.
- same canonical object can remain one higher-level story across different correlation windows; different canonical objects do not merge merely because events are temporally close.
- incident history v1/v2 is normalized into v3 object-centered stories during migration.
- ordered evidence timeline.
- Explain Why structure separates **Observed Facts**, **Derived Relationships**, **Interpretation**, and **Unknowns**.
- deterministic Reason Codes are registry-backed and versioned.
- Rule Engine references are validated against known reason codes.
- relationship confidence remains relationship confidence, never malware probability.
- standalone Incident JSON export is bounded and includes explanation/timeline data.
- Incident evidence paths can continue into the investigation graph.

## Continue Investigation / Investigation Sessions

- bounded read-only bundle-aware investigation traversal.
- selected `.app` / code-bearing bundles can descend into internal executables, dylibs, XPC services, plugins, extensions, frameworks, scripts, and plist configuration.
- broad directory traversal keeps nested bundles as explicit continuation nodes instead of exploding them recursively.
- Review Priority orders evidence for review and is not a malware probability.
- top bounded candidates receive Integrity inspection.
- plist targets can continue to configured executables.
- runtime correlation includes matching PIDs, parent chain, TCP evidence, bounded open files/loaded objects, LaunchAgents/LaunchDaemons, and Background Task Management references where available.
- Investigation Sessions retain at most 24 sessions and 80 branches per session.
- normal mode persists compact private metadata; `--ephemeral` remains memory-only.
- notes/bookmarks/resume are supported without copying investigated file contents.
- automatic branch recording no longer propagates a stale note from a previous branch; notes are attached only through explicit Save/Bookmark actions.
- Investigation Bundle export is metadata/evidence-only by default and does not copy investigated file contents by default.

## Evidence Graph / Object Story / Global Timeline

### Evidence Graph 2.0

- typed nodes/edges across files, processes, launch relationships, network evidence, incidents, and retained explicit network snapshots.
- source metadata and retained timestamps where meaningful.
- bounded node/edge budgets with visible truncation.
- source/type/text/time filters.
- edges describe observed/derived relationships, not intent or causation.

### Object Story 2.0

- one bounded object dossier combining static identity, System Console evidence, runtime/persistence context, Incident membership, retained timeline evidence, and continuation targets.
- first/last seen means first/last seen within retained Sentinel evidence, not the object's entire lifetime.
- missing evidence is surfaced as unknown/limited visibility.

### Global Timeline

- unified bounded chronology across Sentinel intelligence, Change Monitor, Incident evidence, and retained Safe Action journal entries.
- source/kind/severity/path/time filters.
- repetitive events can be grouped for readability while the grouped record retains raw EventIDs/provenance.
- temporal proximity is not presented as causation.

## Visual macOS System Console / Terminal Toolbox

- fixed allowlisted macOS evidence-tool catalog.
- no arbitrary shell, no `sh -c`, no web `sudo`, and no user-controlled command concatenation.
- positive-PID and absolute-path validation for targeted tools.
- bounded execution time and bounded output.
- authenticated localhost-only routes for catalog, typed queries, structured evidence, and unified object inspection.
- 40+ typed Terminal-backed capabilities grouped by domain.
- question-first **Ask the Mac** recipes remain above the direct Toolbox.
- structured parsers preserve raw command evidence underneath typed cards/tables.
- path-specific Gatekeeper/code-signing review evidence can contribute to object-centered Incident/Reason Code generation; system-global posture does not become a fake file Incident.
- fixed bounded log recipes include Gatekeeper, power, crash, launch, mount/unmount, network configuration, and system-extension activity.
- mutations remain outside the query runner and continue through Sentinel Safe Action boundaries.

## Launch, Process, and Network relationship explorers

### Launch & Service Explorer

- maps LaunchAgents/LaunchDaemons to their plist, target executable, existence, and visible current PID state.
- direct continuation into plist/executable investigation.

### Process Relationship Explorer

- PID-centered parent/child, executable identity, signing/Gatekeeper, open-object, TCP, persistence, and Object Story context.
- current PID navigation is explicit and snapshot-scoped.

### Network Evidence 2.0

- current visible TCP relationships remain refreshable without writing history.
- only explicit **Capture History Snapshot** writes network-history metadata.
- normal mode uses bounded private gzip history; `--ephemeral` is memory-only.
- retention: at most 32 snapshots and 400 normalized relationships per snapshot.
- stable historical identity ignores transient PID changes and ESTABLISHED local ephemeral-port churn while preserving those values as sample context.
- historical PIDs are not reopened directly because macOS can reuse PID values.
- latest and arbitrary retained baseline→target comparison are supported.
- collection failure is missing evidence and is never persisted as an empty snapshot that could manufacture an “everything disappeared” diff.
- no packet capture, payload inspection, decryption, or continuous traffic surveillance is introduced.

## Storage Intelligence / System Snapshot

- bounded Storage Intelligence scanning with cancellation, progress, slow-path safety, exact SHA-256 duplicate confirmation under a hash budget, and partial-result semantics.
- completed storage results can be explicitly retained into 24-snapshot Storage History.
- latest growth attribution and category changes are available.
- Storage Aging summarizes modification-age buckets only for the bounded retained large-file evidence set; it is not advertised as a complete filesystem-age census.
- explicit System Snapshot & Diff covers selected process, launch-service, TCP, mount/filesystem, and core security-posture evidence.
- snapshot differences describe observations between retained points in time, not exact event start/stop times or causation.

## Recovery Center / Vault Health

- Recovery Center aggregates Safe Action health, Vault manifests, Action Journal, reversible-action counts, Change Monitor recovery/rescan state, retained snapshot counts, and visible storage-job status.
- dedicated Vault Health page exposes Vault metadata, journal integrity, reversibility, and post-action observation.
- Vault Health itself is read-only and does not expose `/api/actions/execute`.
- no new permanent-delete path is introduced.

## v2.3 state migration and rollback

Migration registry currently covers Sentinel-owned legacy stores used by the v2.2 investigation/history stack:

- Behavior baseline and history.
- Trusted Profile and trust-drift history.
- Change History and Change Monitor checkpoint.
- Incident history v1/v2 → v3.

Migration rules:

- persistent migration is skipped under `--ephemeral`.
- each primary state file must decode strictly before rewrite.
- unsupported/corrupt primary state becomes an error and is not force-overwritten.
- normalized writes use private atomic replacement.
- replacing existing state retains a last-known-good `.bak` rollback copy where possible.
- fallback `.bak` reads are surfaced through State Recovery status; the Pre-Regression Gate treats a recovered primary as something to review before long-term comparisons.
- migration tests verify registry coverage, rollback copy creation, corrupt-primary refusal, Incident v2→v3 normalization, and ephemeral behavior.

## Navigation and pre-regression gate

Deep v2.3 workspaces share token-preserving navigation around:

- **Easy** — main Sentinel dashboard.
- **Investigate** — Intelligence / Continue Investigation / relationship explorers.
- **Advanced** — System Console / Control Plane.
- **Recover** — Recovery / Vault Health.

The Pre-Regression Gate distinguishes automated engineering readiness from checks that require an actual Mac. Passing it does **not** certify a release artifact or real hardware runtime.

## Automated branch gate

The v2.3 workflow validates, on the same branch HEAD:

1. `go test ./...`
2. focused migration / Incident Story / timeline / export / Storage Aging / registry / Vault / navigation / Pre-Regression / Session Note contracts
3. Darwin `arm64` build smoke
4. Darwin `amd64` build smoke
5. `go test -race ./...`
6. `go vet ./...`
7. JavaScript syntax for v2.3 web surfaces
8. release/build shell syntax

## Next phase: real macOS regression

Engineering preparation is no longer the main workstream. The next required work is real runtime validation:

- desktop bootstrap/token/navigation end-to-end.
- real APFS storage scan/cancel/rerun/history/aging behavior.
- real `codesign`, Gatekeeper, quarantine, SIP, FileVault, and System Extension evidence.
- live process parent/open-file/TCP/persistence correlation.
- controlled disposable-file Safe Action preview → confirm → rename/vault → restore.
- copied real v2.2 state upgrade and `.bak` rollback verification.
- Universal2 app/DMG build, packaged-resource verification, install/launch/quit/relaunch on Apple Silicon.
- real Intel runtime validation if hardware becomes available; otherwise Intel runtime remains explicitly unverified despite successful `amd64` build smoke.
- final signing / Gatekeeper / distribution checks for the release-candidate artifact.

## Deliberately deferred / optional roadmap

These items are not blockers for starting real v2.3 regression:

- staged duplicate-analysis 2.0 beyond the current bounded exact SHA-256 flow.
- expanded diagnostics/performance telemetry and benchmark fixtures.
- optional local AI explanation and its grounding contract.
- entitlement-gated Endpoint Security sensor integration.
- read-only provider/plugin architecture.
- advanced anomaly baselines.

## Design invariants

v2.3 preserves:

- localhost-only core service exposure and authenticated local sessions.
- evidence provenance and explicit limited-visibility states.
- reversible Safe Actions and no automatic destructive response.
- no permanent-delete API added by v2.3.
- bounded histories, traversal, work, output, and explicit capture semantics.
- no score presented as malware probability.
- no cloud dependency for core functionality.
- no arbitrary web-exposed shell or `sudo` execution path.
- no mutation bypass around Safe Action preview/confirmation/journal/recovery.
- read-only bounded Continue Investigation.
- typed Cmd+K navigation/search rather than arbitrary command execution.
- user-controlled permission semantics.
- fixed-command bounded Terminal Toolbox tools.

See `PRE_REGRESSION_V2.3.md`, `V2.3_BRANCH_CHECKLIST.md`, `CONTROL_PLANE_V2.3.md`, `SYSTEM_CONSOLE_V2.3.md`, and `TERMINAL_TOOLBOX_V2.3.md`.
