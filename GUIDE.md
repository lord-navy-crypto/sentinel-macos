# Sentinel 2.4 — User Guide

Sentinel is a local-first macOS evidence and system-intelligence application. The Go engine binds to `127.0.0.1`, authenticates the current session with an in-memory token, and serves one Sentinel 2.4 product UI in either the browser or native App View.

The central rule is unchanged: **evidence is not a verdict**. Current state, identity, relationships, time, reference state, recovery readiness, and visibility limits remain separate concepts.

## 1. Product workflow

Use Sentinel in this order when possible:

**Orient → Investigate → Compare → Verify exact objects → Act only when evidence supports it → Observe again**

The six Missions are:

- **Orient** — current state and bounded snapshot.
- **Investigate** — Cases, Search, Relations, Audit, Object.
- **Compare** — Changes, Behavior, Reference.
- **System** — Machine, Processes, Auto-start, Persistence, Background, Network, Storage.
- **Act** — Reclaim and Safe Change.
- **Limits** — Visibility and evidence model.

The top command bar also includes **Workbench**, the selected-evidence chip, Search, Refresh, and Export.

## 2. Investigation Workbench

Click **Workbench** in the command bar. It is not another dashboard; it is a cross-lens investigation layer over the same Sentinel APIs and evidence.

Tabs:

- **Overview** — selected evidence, Compare A/B, Explain This, Smart Next Step, Evidence Bundle, and the 30 integrated capability list.
- **Investigations** — named local workspaces with notes, hypotheses, bookmarks, and export.
- **Queries & Watches** — saved natural-language queries and bounded session Watch Rules.
- **Visibility** — Permission/Visibility Assistant, completeness meter, capabilities, and advanced-sensor boundary.
- **Evolution** — Network evolution, Launch/Persistence drift, named/pinned System Checkpoints, Storage forecasting, and Reference history.
- **Recovery** — Safe Action readiness, Vault, journal, and recovery evidence.
- **Assistant** — deterministic Local Evidence Assistant.

### Workbench evidence boundary

Engine evidence and Workbench metadata are deliberately different:

**Engine evidence** includes current/retained process, network, launch, Case, graph, timeline, checkpoint, storage, trust, integrity, and recovery data returned by authenticated localhost APIs.

**Workbench metadata** includes investigation notes, hypotheses, bookmarks, saved queries, local watch definitions, display names/pins for checkpoints, local Case workflow state, Compare A/B selection, and the local Launch baseline used by the drift view.

Workbench metadata helps organize an investigation; it does not become system evidence merely because Sentinel stores or displays it.

## 3. The 30 integrated improvements

### 1. Interactive Evidence Graph 3.0

Open **Investigate → Relations**. The Workbench adds query, node type, source, and retained-time filters over Graph 2.0 evidence. It also adds a Visual Relationship Matrix and Historical Heatmap.

Graph nodes remain bounded evidence objects. An edge is a relationship, not proof of causality or intent.

### 2. Process Story 2.0

Select a process by clicking **Explain** where available, or select a PID and use Workbench. Process Story joins current process details with matching launch relationships and current TCP evidence. If ancestry is unavailable from the current evidence source, Sentinel says so rather than inventing a parent/child history.

### 3. Unified Investigation Workspace

Open **Workbench → Investigations**. Create an investigation, write notes/hypotheses, bookmark selected evidence, resume it later within the available Workbench state, and export the investigation JSON.

### 4. Timeline 3.0

The Relations Workbench can filter global retained timeline evidence to all retained data, 1 hour, 24 hours, 7 days, or 30 days. Historical Heatmap gives a 7×24 density view over the same retained timestamps.

### 5. Network Intelligence 2.0

Open **System → Network** and **Workbench → Evolution**. Sentinel shows current TCP relationships plus explicit Network History recurrence: how often a normalized process → endpoint relationship appears, and its first/last retained observation.

### 6. Launch & Persistence Drift

Open **Workbench → Evolution**. Click **Capture current launch baseline**. Later reopen the view to compare current Launch Services metadata against that explicitly captured local baseline. Added, removed, and changed declarations are shown separately.

### 7. System Checkpoint 2.0

Use **Compare → Changes** to capture real System Checkpoints. In **Workbench → Evolution**, those engine-owned checkpoint IDs can receive local display names and pins. Names/pins are workspace metadata; checkpoint contents remain engine evidence.

### 8. Storage Intelligence 2.0

Open **System → Storage** for bounded measurement, exact SHA-256 duplicate groups, history, and aging. Workbench adds a simple retained-history trend/forecast when at least three comparable measurements exist. The forecast is explicitly a linear extrapolation, not a filesystem guarantee.

### 9. Case Stories 3.0

Open **Investigate → Cases**. Existing Stable Story / Episode / Explain Why evidence remains intact. Workbench adds a local workflow state per story: **Open / Watching / Resolved / Archived**. This is investigation organization metadata and does not change the underlying Case evidence.

### 10. Object Story 3.0

Open an exact path through **Object Story** or the selected-evidence flow. Workbench enriches the Context tray with path-filtered retained timeline evidence, matching retained changes, Trusted Profile availability, and Smart Next Step guidance.

### 11. Permission & Visibility Assistant

Open **Workbench → Visibility**. Sentinel surfaces limited/unavailable coverage and explains which evidence source is affected instead of interpreting missing visibility as safety.

### 12. Evidence Completeness Meter

The Visibility Workbench summarizes available/limited/unavailable coverage into an evidence-completeness percentage. It measures observability, **not security or safety**.

### 13. Explain This

Select evidence, open **Workbench → Overview**, and click **Explain This**. Sentinel retrieves the relevant Object Story or Process Story and separates what was observed from what should not be inferred.

### 14. Smart Next Step

Workbench proposes a small number of evidence-driven next actions, such as Verify exact object, See relationships, Compare reference, Open Process Story, Inspect Network, Capture a checkpoint, or Check Visibility.

### 15. Cross-Lens Selection

Selecting supported process/path/graph evidence creates a shared selection. Related rows can be highlighted as you move between lenses, and Object/Process/Compare/Explain actions can reuse that selection.

### 16. Compare Any Two Objects

Select evidence, use **Set Compare A**, select another item, then **Set Compare B → Compare A/B**. Sentinel fetches normalized bounded evidence for both subjects and shows the two evidence structures side by side.

### 17. Reference Profiles 2.0

Open **Compare → Reference** or **Workbench → Evolution**. Sentinel exposes the current Trusted Profile, retained drift history, compare-now, export, health, and previous-profile restore where available. The engine still has one active Trusted Profile at a time; history is not misrepresented as multiple active profiles.

### 18. Safe Change Simulation

Open **Act → Safe Change**, choose an action and exact target, then click **Simulate without execution**. Sentinel calls the real server-side preview and displays destination, reversibility, dependencies, consequences, and risk context. Simulation stops before confirmation phrase/code and does not execute the action.

### 19. Recovery Center 2.0

Open **Workbench → Recovery**. The view combines recovery analysis, Safe Action health/status, journal evidence, and Vault evidence. It is a recovery-information surface; simply opening it does not restore or move anything.

### 20. Evidence Bundle

Open **Workbench → Overview → Export Evidence Bundle**. Sentinel exports a bounded JSON package assembled from current localhost evidence such as overview, visibility, coverage, Cases, Graph, Timeline, Network History, reference state, Safe Action health, and selected Object/Process Story when applicable.

### 21. Local Evidence Assistant

Open **Workbench → Assistant**. The current implementation is deterministic and local: it maps questions to Sentinel evidence APIs and returns four sections — **Observed / Derived / Unknown / Next**. It does not call a cloud model and does not reconstruct evidence Sentinel never observed.

### 22. Natural-language Command Bar

The top Search box can interpret bounded navigation intents such as:

```text
show network endpoints
what changed since checkpoint
open storage
show launch persistence
check visibility
show cases
```

An absolute path can also route to exact-object verification. Unrecognized text still falls back to normal Sentinel search behavior.

### 23. Saved Queries

Open **Workbench → Queries & Watches**. Save useful natural-language queries and run them again later from the same Workbench state.

### 24. Watch Rules

Create a bounded watch for Network relationships, Launch configuration, Change events, Cases, Reference drift, or the selected object. A watch compares normalized API evidence against its previous signature.

Watch Rules operate while Sentinel is open. They are not a background Endpoint Security sensor and do not claim continuous monitoring when the app is not running.

### 25. Visual Relationship Matrix

Relations adds an adjacency-style matrix for a bounded subset of Graph nodes. This is useful when a node-link topology becomes visually dense.

### 26. Change Evidence Flow

Open **Compare → Changes**. Workbench summarizes visible retained/live change-event kinds as a flow ending in Review. The flow summarizes evidence categories; arrows do not claim causal chains.

### 27. Historical Heatmaps

Relations adds a 7-day × 24-hour density representation over retained global timeline timestamps. Empty time cells mean no retained event in that view, not proof that nothing happened on the Mac.

### 28. Workspace Persistence

Workbench preserves its working state through local product storage where that web container retains it: selected evidence, last Lens, graph filters, investigations, queries, watches, Case workflow state, checkpoint labels/pins, and onboarding state.

Engine-owned persistent histories such as Cases, Network History, System Checkpoints, Trust, Changes, and Recovery remain separate and are stored by the Go engine in Sentinel-owned state. Do not confuse UI workspace persistence with evidence retention.

### 29. Keyboard Workflow

Outside text fields:

- **G** → Relations / Graph
- **T** → Changes / temporal comparison
- **O** → selected Object Story or Object Lens
- **C** → Cases
- **W** → Workbench
- **⌘/Ctrl + Enter** → Explain selected evidence
- **⌘K** → global Search

### 30. Product Onboarding

The first Workbench onboarding uses four steps:

1. Check Visibility.
2. Run Snapshot.
3. Inspect one Story.
4. Capture a System Checkpoint.

The purpose is to teach the evidence workflow without creating a tutorial dashboard.

## 4. Core lenses and important clicks

### Orient → Status

- **Run Snapshot** — bounded read-only observation.
- **Refresh posture** — reload posture and structured evidence.

### Investigate → Cases

- **Rebuild correlations** — rebuild Case correlation from retained/current evidence.
- **Refresh** — reload without forcing rebuild.
- **Export JSON** — export current Case episode.
- **Object Story** — continue from the exact primary object.

### Investigate → Relations

- **Capture evidence** — explicit fresh evidence capture.
- **Refresh** — reload Graph/Timeline.
- Workbench Graph filters/matrix/heatmap appear in the same Lens.

### System → Auto-start

- **Refresh launch evidence** — reload plist → executable → running process relationships.
- **Explain** — open Launch declaration and target evidence in Context.

### System → Network

- **Refresh current** — current TCP evidence only; does not create history.
- **Capture history snapshot** — explicitly retain normalized relationship metadata.
- **Compare** — compare two retained Network snapshots.
- **Explain** — continue from a process into Process Story/context.

### System → Storage

Configure scope, minimum size, and result limit, then **Measure storage**. Activity shows real traversal/hash progress. **Cancel** requests backend cancellation. Exact duplicate groups require SHA-256 agreement; filename families remain heuristics.

### Compare → Changes

Use Change Monitor for selected live scope and System Checkpoints for explicit A/B state comparison. A difference is evidence of change, not danger.

### Compare → Reference

Capture/compare only when you intentionally want an approved reference. A reference match is context, not permanent certification.

### Act → Safe Change

Mutation remains:

**exact target → server preview → dependency/consequence review → exact phrase → one-time code → acknowledgement → server revalidation → execute → recovery metadata**

Sentinel has no permanent-delete API.

## 5. Visibility and interpretation rules

Keep these rules visible:

- suspicious ≠ malicious;
- signed ≠ safe;
- Gatekeeper accepted ≠ malware-free;
- public endpoint ≠ suspicious by itself;
- Trusted Profile match ≠ safe forever;
- evidence confidence ≠ malware probability;
- observed change ≠ danger;
- missing evidence lowers visibility rather than proving absence.

## 6. Local state and ephemeral mode

Engine-owned persistent state normally lives under:

```text
~/Library/Application Support/Sentinel/
```

Depending on workflow it can contain compact Behavior/Trust state, Change history/checkpoints, Case history, Network/System/Storage snapshots, Investigation Session metadata, and Safe Action/Vault recovery metadata.

`--ephemeral` disables durable comparison/recovery-dependent mutation where required. Workbench session metadata must never be treated as a substitute for engine-owned retained evidence.

## 7. Specialist workspaces

The primary 2.4 product now contains the high-value functionality required for normal use. Specialist AUX pages can remain for deep engineering/debugging workflows such as typed System Console queries or legacy branching-investigation tooling, but the normal product does not depend on them.

## 8. Build and validation

Build the macOS app:

```bash
./build-desktop-macos.sh
```

Clean reinstall while preserving Sentinel-owned user history/recovery state:

```bash
./reinstall-macos.sh
```

The desktop builder verifies the canonical **10 JavaScript modules + 3 styles**, the `Sentinel 2.4 Investigation Workbench` marker, major feature markers, and embedded Workbench content in both arm64 and x86_64 engines. The installed app must report:

```text
Version: 2.4.0
Desktop UI: 2.4 Native Frontend
Investigation Workbench: 30-function Investigation Workbench
```

CI additionally runs Go tests, Workbench/product contracts, real Desktop application packaging, Go race tests, `go vet`, canonical/AUX JavaScript syntax, and shell syntax.

See `README.md`, `QUICK_START.md`, `SECURITY.md`, and `TESTING.md` for additional engineering and distribution details.
