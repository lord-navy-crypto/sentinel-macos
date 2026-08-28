# Sentinel macOS v2.3 — Development Branch

Status: **development only**

Branch: `upgrade/v2.3-stable`

This branch is not a stable release and is not merged into `main`.

## v2.3 focus

Sentinel v2.3 is intended to deepen the existing local-first intelligence platform rather than replace it with unrelated scanners. The release focuses on investigation quality, historical context, explainability, recovery, and more coherent user workflows.

## Planned release-defining changes

- Incident Intelligence 2.0 with stable incident identity, evidence timelines, deterministic correlation, and explicit observed/derived/unknown separation.
- Object Story 2.0 as the primary per-object investigation surface.
- Unified Change Timeline across existing evidence sources.
- Storage History with snapshot comparison and growth attribution.
- Recovery Center 2.0 for Sentinel-owned state, interrupted jobs, Vault health, and checkpoint recovery.
- Explain Why with stable reason codes and evidence references.
- Visibility & Permissions Center for evidence-source availability and limitations.
- Global Search / Command Palette for rapid navigation to objects, incidents, hashes, paths, processes, and endpoints.
- Easy / Investigate / Advanced information architecture cleanup.
- Explicit v2.3 persistent schema versions and migration from v2.2 state.

## Planned second-stage improvements

- Evidence Graph 2.0.
- deterministic local Rule Engine.
- staged exact-duplicate analysis.
- Storage Intelligence 2.0 trends.
- Network Evidence 2.0 within available macOS evidence boundaries.
- Investigation Sessions.
- Safe Actions 2.0 preview/recovery UX.
- Vault Health.
- local diagnostics, benchmarks, and CI gates.

## Optional future work

- local AI explanation over already-collected evidence;
- entitlement-gated Endpoint Security sensor integration;
- read-only evidence-provider/plugin architecture;
- advanced local anomaly baselines;
- investigation bundle export.

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
- no cloud dependency for core functionality.

See `UPGRADE_V2.3_PLAN.md` and `V2.3_BRANCH_CHECKLIST.md` for the authoritative implementation plan.