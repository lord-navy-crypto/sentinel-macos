# Sentinel Ultimate Alpha Program

## Purpose

Sentinel's **Ultimate Alpha** is a continuous internal expansion program. It is not a claim of production readiness and it is not a point where development stops. The goal is to keep deepening the product until each major capability can explain evidence, continue an investigation, support bounded control when appropriate, and recover from reversible changes.

The standing product loop is:

```text
UNDERSTAND
    ↓
INVESTIGATE
    ↓
CONTROL
    ↓
RECOVER
    ↘
      explain / correlate / compare / continue
```

Localization is a cross-cutting capability across the whole loop rather than a separate copied UI.

## Standing Alpha rules

1. **Expand depth, not command count alone.** A new command or data source should become structured evidence where practical, connect to related objects, and support `Continue Investigation` when the relationship is explicit.
2. **Every important result should answer “Why?”** Expose the evidence, limitation, relationship, or reason code that produced a review state. Missing evidence must never be presented as proof of safety.
3. **Read-only first.** Inspection, correlation, comparison, timelines, and visualization remain non-mutating by default.
4. **Control stays typed and recoverable.** Mutating actions must remain allowlisted, previewed, dependency-aware, confirmed, bounded, validated, journaled, and reversible where technically feasible. No arbitrary shell, web sudo, permanent-delete path, or destructive shortcut is introduced by the Alpha program.
5. **Recovery is a first-class layer.** A feature that can change Sentinel-owned or user-approved state should have health, interruption, restore, rollback, or reconciliation behavior where practical.
6. **English + Simplified Chinese are the localization baseline.** New focused UI should use shared translation keys instead of copied pages. Additional languages should be addable by extending dictionaries rather than cloning application logic.
7. **Raw evidence keeps forensic meaning.** Terminal output, file paths, bundle identifiers, signatures, labels, hashes, process data, and other source evidence must not be rewritten merely to look translated. UI explanation can be localized around the raw evidence.
8. **Local, bounded, privacy-first.** No cloud dependency is required for core inspection. No background surveillance daemon is added simply to increase feature count. Work must stay bounded and capability limitations must remain visible.
9. **Alpha scores are product-state indicators only.** Readiness, capability-depth, confidence, and attention indicators are not malware probabilities and are not safety certificates.
10. **The program remains open-ended.** A green CI run completes a batch, not the Alpha program.

## Localization architecture

The initial multilingual layer supports:

- English (`en`)
- Simplified Chinese (`zh-CN`)
- one shared `web/i18n.js` runtime
- local language preference through `sentinel.locale`
- reusable translation keys and runtime dictionaries
- a global EN / 中文 switch in normalized v2.3 navigation
- dynamic re-rendering through `sentinel:localechange`

The migration target is all focused v2.3 workspaces and their generated explanatory UI. Raw system evidence remains unchanged.

## Alpha capability tracks

### UNDERSTAND

Continue deepening One-click Check, visibility/permissions, structured Terminal evidence, system snapshots, storage history, global timelines, and explainable summaries. The objective is to turn raw local evidence into understandable objects without inventing conclusions.

### INVESTIGATE

Continue deepening Evidence Graph, Object Story, Incidents, process/network/startup relations, investigation sessions, reason-code provenance, timeline comparison, and investigation export. Every safe extracted path, PID, service, incident, endpoint, or related object should have a continuation path when the relationship is real.

### CONTROL

Continue Safe Actions 2.0 as a narrow typed control plane. Improve dependency preview, post-action validation, action health, isolation state, and user-visible consequences without adding arbitrary shell execution or permanent deletion.

### RECOVER

Recovery Center 2.0 is a priority Alpha track. Expand Vault Health into checkpoint/state health, interrupted-work recovery, rollback confidence, restore dependencies, `.bak` recovery visibility, partial-job handling, and reconciliation.

### LOCALIZATION

Move all focused v2.3 pages and dynamic user-facing explanations to shared translation keys. Keep evidence/source strings intact, test both supported locales, and design new strings so a third language can be added without changing application logic.

## Next deepening waves

The next Alpha waves should continue across multiple systems rather than polishing only one page:

- Recovery Center 2.0 and Vault recovery depth
- System Snapshot & Diff grouping and relationship attribution
- Incident deterministic merge/split, standalone export, and episode comparison
- Storage growth attribution, aging trends, grouping, cleanup preview, and recovery-aware actions
- Structured Terminal evidence → graph/timeline/incident bridges
- Investigation Bundle export and portable evidence summaries
- broader fixed log recipes with structured parsing and continuation
- visibility/permission explanations and reduced-confidence propagation
- complete focused-workspace localization coverage
- diagnostics/performance and bounded-work observability

## Definition of a completed Alpha batch

A batch is complete only when the implementation is present on `upgrade/v2.3-stable`, relevant contracts/tests exist, JavaScript/shell syntax checks pass, Go tests/race/vet pass, Darwin architecture smoke builds pass, and the branch CI for the exact batch HEAD is green.

`main` remains unchanged unless an explicit merge decision is made separately.
