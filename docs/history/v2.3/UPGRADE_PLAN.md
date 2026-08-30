# Sentinel macOS v2.3 — Upgrade Plan

Branch: `upgrade/v2.3-stable`

This branch is intentionally isolated from `main`. The goal is to evolve Sentinel from a strong v2.2 beta into a materially more capable local system-intelligence and investigation platform without weakening its current local-first, evidence-first, reversible-action design.

## Product direction

Sentinel v2.3 should become better at answering five questions:

1. **What changed?**
2. **What objects are related to the change?**
3. **Why is Sentinel asking me to review it?**
4. **How has the Mac changed over time?**
5. **What can I safely do next, and can I undo it?**

The v2.3 branch should prefer deeper correlation, explainability, historical context, recovery, and operator workflow over adding unrelated scanners.

---

# P0 — Core v2.3 upgrade

P0 items define the minimum feature set for the v2.3 release candidate.

## P0.1 Incident Intelligence 2.0

Upgrade incidents from compact correlation records into first-class investigation timelines.

### Add

- stable incident IDs across rebuilds;
- first-seen / last-seen timestamps;
- ordered evidence timeline;
- explicit primary object and related objects;
- source labels for filesystem, persistence, behavior, trust, integrity, process, and network evidence;
- occurrence count and recurrence window;
- lifecycle states: `active`, `quiet`, `resolved`, `historical`;
- incident merge/split rules that are deterministic and testable;
- manual notes and review state stored separately from machine evidence;
- deep review status with last-review timestamp;
- incident export as standalone JSON.

### Explainability contract

Every incident must separate:

- **Observed facts** — directly collected evidence;
- **Derived relationships** — deterministic correlations;
- **Interpretation** — review guidance;
- **Unknowns** — what Sentinel cannot establish.

No incident score may be described as malware probability.

### Acceptance criteria

- rebuilding incidents does not duplicate the same logical incident;
- timeline ordering is deterministic;
- removing one evidence source degrades visibility rather than inventing safety;
- incident export can be reloaded without losing evidence IDs;
- all reason codes are visible through API and UI.

---

## P0.2 Object Story 2.0

Turn Object Story into the central investigation page for any file, executable, process, startup item, persistence entry, or endpoint.

### Add

- first seen / last seen;
- current existence state;
- signature and identity history;
- related persistence entries;
- related process observations;
- related network endpoints;
- related filesystem changes;
- trust/behavior history;
- incident membership;
- timeline of important changes;
- object aliases / moved-path history where identity can be retained safely;
- clear `Known`, `Observed`, `Changed`, `Unavailable` sections.

### Acceptance criteria

An Object Story should answer, without requiring the user to open multiple pages:

- what the object is;
- when Sentinel first observed it;
- what changed about it;
- what it is connected to;
- why it matters;
- what Sentinel still does not know.

---

## P0.3 Change Timeline

Add a unified chronological view across Change Monitor, persistence, process, integrity, and incident evidence.

### Add

- global timeline;
- per-object timeline;
- per-incident timeline;
- event grouping within short time windows;
- filter by source, severity, object type, path, and time range;
- collapse repetitive events;
- preserve raw evidence links behind grouped events;
- checkpoint / rescan markers;
- clear distinction between observed time and reconstructed/correlation time.

### Acceptance criteria

- timeline never hides the raw event count;
- grouped events can be expanded;
- dropped-event or reconciliation gaps are visible;
- filters do not mutate underlying evidence.

---

## P0.4 Storage History and Growth Attribution

Upgrade Storage Intelligence from a point-in-time scanner into a historical storage analysis system.

### Add

- bounded storage snapshots;
- directory-size history;
- file-type history;
- growth between snapshots;
- new-large-file attribution;
- deleted/reduced-space attribution where observable;
- top growth contributors;
- configurable retention policy;
- compare two snapshots;
- export snapshot summaries.

### Example output

`Downloads +8.2 GB since last snapshot`, with the largest contributing files and subdirectories shown below it.

### Acceptance criteria

- historical data remains bounded;
- snapshots store metadata needed for comparison, not file contents;
- a cancelled scan is clearly marked partial;
- comparisons never treat partial snapshots as complete without warning.

---

## P0.5 Recovery Center 2.0

Create one recovery surface for Sentinel-owned state.

### Add

- previous-shutdown status;
- active/abandoned job detection;
- state-file health;
- `.bak` recovery visibility;
- Vault manifest health;
- Change checkpoint health;
- Incident history health;
- Storage snapshot health;
- safe repair actions for Sentinel-owned metadata only;
- partial-result recovery after interrupted scans where possible;
- explicit `repair`, `discard`, `resume`, `view partial result` choices.

### Acceptance criteria

- Sentinel never silently repairs state without reporting it;
- user files are never modified by Recovery Center;
- failed recovery leaves original recovery evidence intact;
- all recovery actions are journaled.

---

## P0.6 Explain Why + Reason Codes

Every attention state, incident classification, weakness finding, or recommended review should expose machine-readable and human-readable reasons.

### Add

- stable reason-code registry;
- reason category;
- evidence IDs supporting each reason;
- positive and mitigating reasons;
- unavailable-evidence reasons;
- UI `Why?` expansion;
- reason codes in exports.

### Example

- `new_persistence_entry`
- `unsigned_target`
- `recently_created_target`
- `known_stable_behavior` (mitigating)
- `visibility_limited_no_fda`

### Acceptance criteria

No score or review recommendation may appear without at least one inspectable reason or an explicit `insufficient evidence` explanation.

---

## P0.7 Visibility & Permissions Center

Create a single page explaining what Sentinel can and cannot currently observe.

### Show

- Full Disk Access state/limitations;
- FSEvents availability and current mode;
- native code-signing validation availability;
- fallback mode status;
- architecture / Rosetta state;
- optional advanced sensor state;
- restricted directories encountered;
- evidence sources currently degraded.

### Acceptance criteria

Missing access must reduce visibility, never be converted into a green safety conclusion.

---

## P0.8 Global Search / Command Palette

Add a fast investigation entry point, preferably via `Cmd+K`.

### Search targets

- path;
- filename;
- process name;
- PID;
- bundle identifier;
- signing identity;
- Team ID;
- endpoint/domain where currently collected;
- incident ID;
- object ID;
- SHA-256.

### Actions

- open Object Story;
- open Incident;
- open Timeline at time;
- reveal existing object through Safe Action flow where applicable.

---

## P0.9 UI information architecture

Normalize the product into three levels.

### Easy

- Overview
- Quick Check
- Storage
- Recent Changes
- Attention
- System Profile

### Investigate

- Incidents
- Object Story
- Timeline
- Evidence Graph
- Search

### Advanced

- Integrity
- Persistence
- Behavior / Trust
- Change Monitor controls
- Raw evidence
- Diagnostics
- Recovery

The same underlying evidence remains authoritative across all three views.

---

## P0.10 Bounded-state and schema upgrade

Introduce explicit versioning for all new v2.3 persistent structures.

### Required

- storage snapshot schema version;
- incident v2 schema version;
- timeline event schema version;
- reason-code schema version;
- migration path from existing v2.2 state;
- no destructive migration without backup;
- bounded retention for all historical collections.

---

# P1 — Investigation and intelligence expansion

P1 items should be implemented after the P0 contracts are stable.

## P1.1 Evidence Graph 2.0

- typed nodes and typed edges;
- first-seen / last-seen edge metadata;
- filter by time and evidence source;
- expand-neighbors interaction;
- incident overlay;
- highlight primary object;
- path/process/persistence/network relationship views;
- graph-size budget and truncation indicators;
- export selected subgraph.

## P1.2 Rule Engine

Add a deterministic local rule engine for review guidance.

### Rule inputs

- persistence state;
- signature state;
- creation/first-seen time;
- path class;
- integrity changes;
- behavior history;
- trust history;
- network evidence;
- incident context.

Rules must produce reason codes and evidence references. Rules may recommend review but must not perform destructive actions.

## P1.3 Duplicate Detection 2.0

Improve large-dataset duplicate detection using staged verification:

1. file-size grouping;
2. bounded partial fingerprinting where useful;
3. full SHA-256 confirmation before calling files exact duplicates.

Preserve cancellation, revalidation, and I/O budgets.

## P1.4 Storage Intelligence 2.0

- storage trend chart data API;
- large-file aging;
- version-family growth;
- cache-like directory classification without automatic deletion;
- reclaimable-space estimates with explicit confidence level;
- compare Home / Downloads / Documents / Library growth.

## P1.5 Network Evidence 2.0

Within currently available non-Endpoint-Security evidence boundaries:

- endpoint normalization;
- process-to-endpoint relationship history where observable;
- first/last seen endpoints;
- local/private/public classification;
- repeated/new endpoint distinction;
- incident correlation;
- no unsupported attribution claims.

## P1.6 Investigation Sessions

Allow a user to create an investigation workspace containing:

- selected incidents;
- selected objects;
- notes;
- timeline range;
- exported evidence set;
- completion/archive state.

This is metadata only; it must not duplicate full files.

## P1.7 Safe Actions 2.0

Enhance preview and recovery UX while preserving current safety constraints.

- clearer dependency preview;
- running-process warning;
- destination conflict preview;
- explicit reversibility indicator;
- post-action validation;
- Vault health page;
- restore conflict resolution without overwrite-by-default.

## P1.8 Diagnostics and performance telemetry

Local-only operational metrics:

- files/sec during storage traversal;
- MB/sec during hashing;
- event processing rate;
- queue depth;
- memory footprint summary;
- active goroutine count in diagnostics build if appropriate;
- state-store size;
- incident rebuild duration.

No telemetry is uploaded.

## P1.9 Benchmark suite

Add reproducible benchmark fixtures for:

- 100k / 500k / 1M file metadata walks;
- duplicate-heavy directories;
- deep directory trees;
- rename storms;
- many permission errors;
- incident rebuilds with large histories;
- evidence graph truncation behavior.

## P1.10 CI and branch quality gates

Add GitHub Actions for branch validation:

- `go test ./...`;
- `go test -race ./...`;
- `go vet ./...`;
- JS syntax checks;
- shell syntax checks;
- macOS build job where practical;
- artifact build smoke checks;
- schema migration tests.

This does not replace real-Mac testing; it prevents regressions from entering the branch.

---

# P2 — Advanced / optional future capabilities

P2 items are intentionally optional and must not block the core product.

## P2.1 Optional local AI explanation layer

If added, local AI may:

- summarize an incident;
- explain existing reason codes;
- translate technical evidence into plain language;
- answer questions over already-collected local evidence.

It must not:

- independently declare malware;
- invent evidence;
- perform Safe Actions;
- delete/quarantine files automatically;
- require cloud inference for core Sentinel functionality.

## P2.2 Advanced Sensor / Endpoint Security integration

Only after entitlement and production requirements are satisfied:

- optional System Extension;
- authenticated local IPC to the main engine;
- event backpressure controls;
- explicit install/enable/disable state;
- event correlation into existing Incident Intelligence;
- core Sentinel remains usable without the sensor.

## P2.3 Plugin / evidence-provider architecture

Define a narrow, read-only extension interface for additional evidence collectors.

Requirements:

- capability declaration;
- schema versioning;
- bounded output;
- no implicit destructive privileges;
- provider health status;
- evidence provenance stored with every record.

## P2.4 Advanced anomaly baselines

Add deterministic/statistical local baselines only after enough history exists.

- frequency change;
- first-seen process/path relationships;
- unusual persistence timing;
- unusual storage growth;
- unusual endpoint novelty.

All anomaly outputs must expose baseline size, comparison window, and reasons.

## P2.5 Investigation bundle export

Export a portable investigation package containing selected JSON reports, timelines, object stories, hashes, and metadata, with a manifest and schema versions. Do not include full user files by default.

---

# Branch implementation order

## Phase A — contracts and data model

1. reason-code registry;
2. incident v2 model;
3. timeline model;
4. storage snapshot model;
5. migration framework;
6. recovery metadata.

## Phase B — backend services

1. incident v2 correlation;
2. timeline aggregation;
3. storage history comparison;
4. recovery center APIs;
5. global search expansion;
6. visibility center API.

## Phase C — UI

1. Incident 2.0 page;
2. Object Story 2.0;
3. global timeline;
4. Storage History;
5. Recovery Center;
6. Explain Why;
7. Visibility & Permissions;
8. Cmd+K search;
9. Easy / Investigate / Advanced navigation cleanup.

## Phase D — P1 expansion

Evidence Graph 2.0, Rule Engine, Duplicate Detection 2.0, Network Evidence 2.0, Investigation Sessions, Safe Actions 2.0, benchmarks, and CI gates.

---

# Non-negotiable invariants

The v2.3 branch must preserve these principles:

- localhost-only service binding;
- authenticated local session;
- evidence provenance;
- missing evidence means reduced visibility;
- no permanent-delete API;
- Safe Actions remain reversible;
- no automatic destructive response;
- no unsupported malware-probability claims;
- bounded history and bounded expensive work;
- explicit cancellation for long operations;
- privacy-sensitive identifiers remain omitted unless strictly necessary and deliberately enabled.

---

# Proposed version path

- `v2.2.0-beta` — current public beta baseline;
- `v2.3.0-dev` — this upgrade branch during implementation;
- `v2.3.0-beta.1` — feature-complete branch build;
- `v2.3.0-rc.1` — feature freeze, release-blocker fixes only;
- `v2.3.0` — stable release after branch validation.

No merge to `main` is implied by this document.