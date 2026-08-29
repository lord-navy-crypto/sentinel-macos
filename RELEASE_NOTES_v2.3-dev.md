# Sentinel macOS v2.3 — Development Branch

Status: **development only**

Branch: `upgrade/v2.3-stable`

This branch is not a stable release and is not merged into `main`.

## v2.3 focus

Sentinel v2.3 is intended to deepen the existing local-first intelligence platform rather than replace it with unrelated scanners. The release focuses on investigation quality, historical context, explainability, recovery, and more coherent user workflows.

Security remains the primary entry point, while the broader product becomes a visual macOS investigation and control plane. Sentinel should make macOS itself easier to **understand, investigate, control, and recover**. Terminal and macOS command-line utilities may act as evidence adapters underneath the product, but the normal interface should expose questions, objects, relationships, explanations, continuation branches, and safe workflows rather than arbitrary shell execution.

A core v2.3 interaction principle is: **a report is a node, not the end of an investigation**.

See `SYSTEM_CONSOLE_V2.3.md` for the visual macOS control-plane design and `V2.3_BRANCH_CHECKLIST.md` for implementation status.

## Implemented so far on this branch

The following foundations are already present in `upgrade/v2.3-stable` and are not descriptions of `main`:

- Explain Why / deterministic Reason Code core with observed facts, derived relationships, interpretation, and unknowns.
- v2.3 enriched Incident view that preserves the existing Incident contract while adding explanation and investigation timeline data.
- Investigation timeline core with stable IDs, ordering, deduplication, and bounded output.
- Storage Snapshot and comparison data model with partial-snapshot semantics and growth attribution.
- bounded persistent Storage History manager using Sentinel-owned local state.
- explicit v2.3 schema compatibility/migration foundation.
- deterministic read-only Rule Engine core for review guidance; matches are not malware verdicts and cannot execute Safe Actions.
- GitHub Actions branch validation for Go tests, race tests, vet, JavaScript syntax, and release/build shell syntax.

### Visual macOS System Console

- System Console backend with a fixed macOS evidence-tool allowlist, absolute-path/PID target validation, bounded execution time, bounded output, and no shell invocation.
- authenticated local System Console API routes for catalog, read-only query execution, structured query execution, and unified object inspection.
- System Console visual page grouped around Understand / Investigate / Control / Recover.
- question-first **Ask the Mac** recipes so users can begin from system questions rather than Terminal syntax.
- structured parsers for process, filesystem, mount, code-signing, Gatekeeper, and process-open-file evidence.
- structured visual tables/cards while preserving raw command evidence underneath for provenance.
- unified object inspection combining metadata, extended attributes, code-signing, Gatekeeper, and plist evidence where applicable.
- direct Ask-the-Mac entry points into Launch & Service, Process Relationship, and Network Relationship explorers.
- a System Console shortcut in the existing Sentinel interface.
- explicit tests that managed actions cannot run through the read-only command runner and that the System Console cannot silently become an arbitrary shell/`sudo` execution surface.

### Continue Investigation / Security Investigation Graph

- bounded read-only deep investigation engine with explicit traversal, depth, candidate, and inspection budgets.
- bundle-aware traversal: selecting an `.app` or other code-bearing bundle can descend into internal executable/configuration objects instead of treating the outer directory as the final result.
- broad-folder behavior keeps nested bundles as explicit continuation branches rather than recursively exploding every app during the first scan.
- candidate classification for executable code, scripts, dylibs, property lists, installers/images, frameworks, XPC services, app extensions, and plugin bundles.
- ranked **Review Priority** for deciding what evidence to inspect next; the value is explicitly not malware probability.
- on-demand Integrity evidence for top candidates, including hashing, architecture, signature, Gatekeeper, quarantine provenance, and native validation where available.
- property-list continuation from visible launch configuration to the configured executable target.
- authenticated `POST /api/security/investigate` branch endpoint.
- Security Audit bridge that adds **Continue Investigation** to findings with a usable local path without rewriting the legacy v2.2 audit renderer.
- Incident bridge that exposes up to six distinct explicit absolute-path evidence nodes as independent investigation branches instead of limiting continuation to the incident primary path.
- dedicated `investigation.html` workspace with manual path entry, previous/next branch navigation, bounded candidate lists, limitations, and explicit related-object continuation targets.
- each branch concurrently correlates the current path with the existing Object Story model.
- authenticated `GET /api/security/context?path=...` runtime-correlation endpoint.
- selected file/app-bundle correlation with currently running executable paths and PIDs.
- parent-process-chain context for matched processes.
- current bounded TCP evidence for matched PIDs.
- structured open-file / loaded-object evidence for a bounded number of matched processes.
- LaunchAgent/LaunchDaemon references to the selected object or executables inside its app bundle.
- macOS Background Task Management references when available.
- runtime, persistence, parent-process, open-object, and file-analysis targets are merged into clickable continuation branches.
- running-process cards link directly into Process Relationship Explorer for deeper PID-centered investigation.
- contract tests prevent the investigation engine from acquiring mutation paths and prevent the new web surface from introducing dynamic-code execution.

### Investigation Sessions

- bounded Investigation Session manager retaining at most 24 sessions and 80 branches per session.
- normal mode persists compact session metadata in Sentinel-owned private gzip state; `--ephemeral` keeps the same workflow memory-only.
- session data stores paths, branch relationships, bookmarks, notes, timestamps, and visit counts without copying investigated file contents.
- Save Session, Bookmark Current Branch, resume, recent-session list, and automatic recording of later branches while a session is active.
- bookmarked branches are preferentially retained when ordinary branch history must be trimmed.
- browser-history handling was corrected so the investigation branch array no longer shadows `window.history`.

### Launch & Service Explorer

- typed LaunchAgent/LaunchDaemon explorer model built on the existing persistence scanner rather than duplicating the source of truth.
- exact executable-path correlation with the current process table.
- visible target-exists / running / PID state and explanation/limitation fields.
- authenticated list/detail endpoints.
- dedicated visual workspace answering **“Why does this start automatically?”**.
- direct continuation from launch plist or executable into Continue Investigation.

### Process Relationship Explorer

- dedicated PID-centered workspace combining Process Detail, Object Story, structured process-table evidence, structured open-file evidence, and Runtime/Persistence Context.
- visible parent chain and current child-process relationships, with PID-to-PID navigation.
- executable identity, signing, Gatekeeper, review/trust context, TCP evidence, and open files/loaded objects on one surface.
- LaunchAgent/LaunchDaemon and Background Task Management correlation for the resolved executable.
- direct continuation from executable or path-bearing open objects into Continue Investigation.
- Continue Investigation runtime cards can open the matching PID directly in Process Relationship Explorer.

### Network Relationship Explorer / Network Evidence 2.0

- dedicated current-snapshot workspace built on Sentinel's existing bounded `/api/network` evidence.
- process → TCP socket grouping with LISTEN / ESTABLISHED state preserved.
- endpoint aggregation using existing normalized local/remote/endpoint-class fields.
- process, PID, endpoint, state, and endpoint-class filtering.
- direct navigation from a **current** owning PID into Process Relationship Explorer.
- authenticated `/api/network/history` endpoint for explicit bounded history capture and retained-snapshot comparison.
- **Refresh Current never writes history**; only an explicit **Capture History Snapshot** action appends a history record.
- normal mode stores compact history in Sentinel-owned private gzip state; `--ephemeral` keeps the same snapshot workflow memory-only.
- retention is bounded to at most **32 snapshots**, each with at most **400 normalized relationships**.
- stable historical relationship identity intentionally excludes transient PID changes and ESTABLISHED local ephemeral-port churn; those values remain sample context rather than identity.
- historical sample PIDs are displayed only as capture-time context and are not opened directly, because macOS can later reuse a PID for a different process.
- latest-snapshot diff plus arbitrary retained **baseline → target** comparison, with Added / Absent semantics kept separate from claims about exact connection start/end times.
- failed TCP collection is treated as missing evidence and is never persisted as an empty snapshot, preventing a collection failure from manufacturing an “everything disappeared” diff.
- every successful explicit history capture adds one bounded summary event to Sentinel's session timeline rather than flooding the timeline with one event per endpoint.
- history stores relationship metadata only; Sentinel does not capture packet contents, decrypt traffic, or run continuous background packet surveillance.
- Network Evidence comparisons are observational context, not connection verdicts or malware probability.

## Planned release-defining changes

- Incident Intelligence 2.0 with stable incident identity, evidence timelines, deterministic correlation, and explicit observed/derived/unknown separation.
- Object Story 2.0 as the primary per-object investigation surface.
- Unified Change Timeline across existing evidence sources.
- Storage History with snapshot comparison and growth attribution fully wired into API/UI workflows.
- Recovery Center 2.0 for Sentinel-owned state, interrupted jobs, Vault health, and checkpoint recovery.
- Explain Why with stable reason codes and evidence references fully wired into normal investigation UI.
- Visibility & Permissions Center for evidence-source availability and limitations.
- Global Search / Command Palette for rapid navigation to objects, incidents, hashes, paths, processes, endpoints, and typed System Console intents.
- Easy / Investigate / Advanced information architecture cleanup.
- explicit v2.3 persistent schema versions and migration from v2.2 state.

## Planned second-stage improvements

- Evidence Graph 2.0.
- deterministic local Rule Engine integration and configurable bounded rules.
- staged exact-duplicate analysis.
- Storage Intelligence 2.0 trends.
- richer executable-aware Network Evidence identity and higher-level temporal summaries without introducing packet capture.
- Safe Actions 2.0 preview/recovery UX.
- Vault Health.
- local diagnostics, benchmarks, and CI gates.
- bounded predefined macOS log/event recipes.
- broader System Snapshot & Diff across selected macOS object types.
- privacy-aware investigation bundle export.

## Optional future work

- local AI explanation over already-collected evidence;
- entitlement-gated Endpoint Security sensor integration;
- read-only evidence-provider/plugin architecture;
- advanced local anomaly baselines.

## Design invariants

v2.3 must preserve:

- localhost-only core service exposure;
- authenticated local sessions;
- evidence provenance;
- explicit limited-visibility states;
- reversible Safe Actions;
- no permanent-delete API;
- no automatic destructive response;
- bounded histories and work budgets;
- no unsupported malware-probability claims;
- no cloud dependency for core functionality;
- no arbitrary web-exposed shell or `sudo` execution path;
- no mutation that bypasses Sentinel preview, confirmation, journaling, and recovery boundaries;
- Continue Investigation remains read-only, bounded, and transparent about truncation/visibility limits.

See `UPGRADE_V2.3_PLAN.md`, `SYSTEM_CONSOLE_V2.3.md`, and `V2.3_BRANCH_CHECKLIST.md` for the implementation plan and branch gates.
