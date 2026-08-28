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
- structured parsers for process, filesystem, mount, code-signing, and Gatekeeper evidence.
- structured visual tables/cards while preserving raw command evidence underneath for provenance.
- unified object inspection combining metadata, extended attributes, code-signing, Gatekeeper, and plist evidence where applicable.
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
- dedicated `investigation.html` workspace with manual path entry, previous/next branch navigation, bounded candidate lists, limitations, and explicit related-object continuation targets.
- each branch concurrently correlates the current path with the existing Object Story model.
- authenticated `GET /api/security/context?path=...` runtime-correlation endpoint.
- selected file/app-bundle correlation with currently running executable paths and PIDs.
- parent-process-chain context for matched processes.
- current bounded TCP evidence for matched PIDs.
- LaunchAgent/LaunchDaemon references to the selected object or executables inside its app bundle.
- macOS Background Task Management references when available.
- runtime, persistence, parent-process, and file-analysis targets are merged into clickable continuation branches.
- contract tests prevent the investigation engine from acquiring mutation paths and prevent the new web surface from introducing dynamic-code execution.

### Launch & Service Explorer foundation

- typed LaunchAgent/LaunchDaemon explorer model built on the existing persistence scanner rather than duplicating the source of truth.
- exact executable-path correlation with the current process table.
- visible target-exists / running / PID state and explanation/limitation fields.
- authenticated list/detail endpoints for the future dedicated Launch & Service Explorer UI.

## Planned release-defining changes

- Incident Intelligence 2.0 with stable incident identity, evidence timelines, deterministic correlation, and explicit observed/derived/unknown separation.
- Incident evidence-node → Continue Investigation integration.
- Object Story 2.0 as the primary per-object investigation surface.
- Unified Change Timeline across existing evidence sources.
- Storage History with snapshot comparison and growth attribution fully wired into API/UI workflows.
- Recovery Center 2.0 for Sentinel-owned state, interrupted jobs, Vault health, and checkpoint recovery.
- Explain Why with stable reason codes and evidence references fully wired into normal investigation UI.
- Visibility & Permissions Center for evidence-source availability and limitations.
- Global Search / Command Palette for rapid navigation to objects, incidents, hashes, paths, processes, endpoints, and typed System Console intents.
- Easy / Investigate / Advanced information architecture cleanup.
- explicit v2.3 persistent schema versions and migration from v2.2 state.
- dedicated Launch & Service Explorer answering why software starts automatically.
- broader Process and Network Relationship explorer surfaces connected to Object Story, Continue Investigation, and Incident evidence.

## Planned second-stage improvements

- Evidence Graph 2.0.
- deterministic local Rule Engine integration and configurable bounded rules.
- staged exact-duplicate analysis.
- Storage Intelligence 2.0 trends.
- Network Evidence 2.0 normalized history within available macOS evidence boundaries.
- persistent Investigation Sessions, branch notes/bookmarks, and resume support.
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
