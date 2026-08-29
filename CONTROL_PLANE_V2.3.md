# Sentinel v2.3 Control Plane Center

Branch: `upgrade/v2.3-stable`

Status: **pre-regression engineering complete on the development branch; real macOS validation still required**.

This document describes the v2.3 branch only and does not describe `main`.

## Purpose

Sentinel v2.3 connects the visual Terminal Toolbox to investigation, security posture, relationship evidence, history, snapshots, and recovery instead of treating command output as an isolated report.

The Control Plane is organized around four product goals:

- **Understand** — explain current macOS state.
- **Investigate** — move from evidence to related files, processes, services, incidents, and history.
- **Control** — keep mutations inside typed Sentinel workflows.
- **Recover** — surface rollback, Vault, checkpoint, and retained-state health.

## Structured Terminal evidence

System Console supports typed facts/records for selected macOS evidence including process state, filesystems/mounts/APFS, launchd services, system extensions, hardware/software/storage/power profiles, DNS/proxy/network state, Time Machine, Spotlight, code signing, Gatekeeper, and bounded log recipes.

Raw Terminal output remains visible only as current evidence. The retained System Evidence journal stores compact typed summaries/signals rather than arbitrary raw log output. Historical retention is bounded; `--ephemeral` remains memory-only where persistence would otherwise apply.

## Continue Investigation from Terminal evidence

When structured evidence exposes a real positive PID or explicit absolute local path, Sentinel can continue into Process Relationship Explorer or Continue Investigation. Targets are bounded and deduplicated. Sentinel does not fabricate PID/path values from prose.

## Security Posture

Control Plane Center aggregates typed security posture such as Gatekeeper, FileVault, SIP, system-extension visibility, Incident count, Safe Action health, and Change Monitor state.

Review posture is evidence for prioritization, not malware probability. System-global posture remains separate from object incidents so a machine-wide state such as SIP/FileVault cannot become a fake file Incident.

## Terminal evidence → Incident / Explain Why

Path-specific reviewable integrity evidence can contribute to an object-centered Incident story. Current examples include Gatekeeper rejected/reviewable evidence and non-zero code-signing inspection results.

Incident explanation is deterministic and registry-backed:

- Observed Facts
- Derived Relationships
- Interpretation
- Unknowns
- Reason Codes

Only explicit path-specific review/high evidence is eligible for object correlation. Global system settings remain posture evidence.

## Incident Intelligence v3 story semantics

The higher-level Incident story identity is now object-centered rather than time-window-centered:

- bounded correlation windows still produce distinct episode IDs;
- the same canonical object can retain one stable StoryKey across episode windows;
- different canonical objects do not merge merely because they are temporally close;
- legacy Incident history v1/v2 is normalized into v3 object-centered stories during migration;
- standalone Incident export preserves bounded evidence, explanation, and ordered timeline.

## Global Timeline grouping

Global Timeline still preserves raw bounded events, but repetitive evidence can also be grouped for readability. A grouped item retains the contributing EventIDs/provenance so grouping does not become evidence loss.

Grouping is a presentation/summary layer, not causal inference.

## System Snapshot & Diff

Control Plane Center can explicitly capture selected current macOS evidence across:

- process identity observations;
- launchd-visible services;
- TCP relationships;
- mounts and visible filesystems;
- Gatekeeper, FileVault, and SIP state.

System Snapshots are bounded. Normal mode persists compact private state; `--ephemeral` is memory-only. Comparisons report observations present/absent across retained points in time without claiming exact start/stop time or causation.

## Storage History and Aging

A completed Storage Intelligence result can be explicitly captured into bounded Storage History. The UI/API expose:

- retained snapshots;
- latest growth comparison;
- category/directory deltas;
- partial-snapshot semantics;
- investigation continuation from the scanned root;
- bounded Storage Aging based on modification timestamps of the retained large-file evidence set.

Storage Aging is deliberately not described as a complete filesystem-age census when the underlying large-file evidence is bounded.

## Recovery Center 2.0

Recovery Center aggregates Sentinel-owned recovery context:

- Safe Action/Vault health;
- Vault manifests;
- retained Action Journal entries;
- reversible-action count;
- Change Monitor rescan/checkpoint state;
- retained System, Storage, and Network snapshot counts;
- visible running/failed/cancelled storage jobs;
- state-recovery advisories.

No permanent-delete path is introduced.

## Vault Health

The dedicated Vault Health surface exposes:

- Safe Action health summary;
- Vault item manifests;
- recent action journal state;
- reversibility markers;
- post-action observations;
- continuation into investigation for relevant paths.

Vault Health itself is read-only and does not expose `/api/actions/execute`.

## v2.3 state migration / rollback

Migration runs before persistent Behavior/Trust/Change/Incident managers load legacy state.

Covered legacy Sentinel-owned stores:

- Behavior baseline and history;
- Trusted Profile and trust-drift history;
- Change History and Change Monitor checkpoint;
- Incident history v1/v2.

Migration safety rules:

- strict primary decoding before rewrite;
- unsupported/corrupt state becomes an error rather than forced rewrite;
- normalized state uses private atomic replacement;
- replacing existing state retains a last-known-good `.bak` copy where possible;
- `--ephemeral` skips persistent migration;
- fallback `.bak` reads are visible through State Recovery status and become a Pre-Regression blocker until reviewed.

## Expanded bounded log recipes

System Console includes fixed bounded recipes for:

- Gatekeeper / `syspolicyd`;
- power / `powerd`;
- crash / `ReportCrash`;
- launch services / `launchd`;
- mount/unmount / `diskarbitrationd`;
- network configuration / `configd`;
- system-extension activity / `sysextd`.

Predicates/windows are fixed by Sentinel. Arbitrary user-provided `log` predicates and shell composition are not exposed.

## Investigation Bundle export

Continue Investigation can export a bounded privacy-aware evidence bundle. The default bundle contains investigation/session metadata and selected evidence summaries; it does not copy investigated file contents by default.

## Investigation Session note integrity

Automatic branch recording no longer silently copies a note from the previously selected branch. Branch notes are included only when the user explicitly saves/bookmarks that branch, and the note input is cleared when branch context changes.

## Unified v2.3 navigation

Core workspaces share a token-preserving navigation layer:

- **Easy** — main Sentinel dashboard.
- **Investigate** — Intelligence Center / Continue Investigation / relationship explorers.
- **Advanced** — System Console / Control Plane.
- **Recover** — Recovery / Vault Health.

This avoids regression-test false failures caused by a deep page losing the local session token or having no stable route back into the investigation flow.

## Pre-Regression Gate

A dedicated authenticated Pre-Regression report/page separates engineering blockers from checks that require an actual Mac.

Automated branch validation includes:

1. `go test ./...`
2. focused v2.3 migration / Incident Story / timeline / export / aging / registry / Vault / navigation / Pre-Regression / Session Note contracts
3. Darwin `arm64` build smoke
4. Darwin `amd64` build smoke
5. `go test -race ./...`
6. `go vet ./...`
7. JavaScript syntax validation for v2.3 web surfaces
8. release/build shell syntax validation

The architecture build smoke proves compilation compatibility only. It does not substitute for real Intel runtime testing.

## Control Plane UI

`web/control-plane.html` combines:

1. Security Posture
2. System Snapshot & Diff
3. Storage History + Aging
4. Recovery Center 2.0
5. retained Typed System Evidence

Related dedicated pages include Intelligence Center, Continue Investigation, Launch & Service Explorer, Process Relationship Explorer, Network Relationship Explorer, Vault Health, and Pre-Regression Gate.

## Safety invariants

The v2.3 Control Plane keeps the established execution boundary:

- fixed allowlisted executables;
- fixed base arguments;
- validated absolute-path / positive-PID targets only where required;
- no `sh -c`, arbitrary shell, or web `sudo` terminal;
- bounded command timeout/output;
- localhost authenticated session/work gates;
- no automatic destructive response;
- mutations remain in Safe Action preview/confirmation/journal/recovery;
- evidence remains separate from malware verdicts;
- historical collection remains bounded and explicit where capture creates persistent history;
- Continue Investigation remains read-only;
- network history remains explicit metadata snapshots rather than packet capture or continuous surveillance.

## What remains before a release candidate

The open work is now **real regression / artifact validation**, not another broad feature-development pass:

- launch the actual desktop app and verify bootstrap/token/navigation.
- exercise Storage Intelligence on real APFS data including cancel/restart/history/aging.
- verify real `codesign`, Gatekeeper, quarantine, SIP, FileVault, and System Extension evidence.
- verify live process/open-file/TCP/launch-service correlations.
- test reversible Safe Actions using disposable files.
- upgrade a copied real v2.2 state directory and inspect preserved history / `.bak` rollback behavior.
- build/install/run the Universal2 desktop app/DMG on Apple Silicon.
- run on Intel hardware if available; otherwise explicitly record Intel runtime as unverified while retaining CI `amd64` build evidence.
- complete release signing / Gatekeeper / distribution checks.

Optional later-roadmap work such as additional benchmark fixtures, expanded diagnostics telemetry, local AI, Endpoint Security entitlement integration, plugin/provider architecture, and advanced anomaly baselines is not a blocker for beginning the real v2.3 regression phase.
