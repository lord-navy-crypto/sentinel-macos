# Sentinel 2.4 — User Guide

Sentinel is a local-first macOS system-intelligence and evidence application. The Go engine runs locally, binds to `127.0.0.1`, and serves one Sentinel 2.4 product UI. Browser and native App View are two containers for the same authenticated localhost session.

The central rule remains: **evidence is not a verdict**. Current state, change, identity, relationships, trust context, recovery readiness, and visibility limits stay separate so incomplete observations do not become false certainty.

---

## 1. How to use the interface

The normal workflow is:

**Orient → Investigate → Compare → Verify exact objects → Act only when evidence supports it → Observe again**

The interface has five persistent areas.

### Command bar

At the top of the window:

- **Search** — search processes, paths, endpoints, and cases. `⌘K` focuses search.
- **Refresh** — reload the currently selected Lens from live local evidence.
- **Export** — export the currently supported evidence view when that Lens provides an export action.
- **LOCAL** — reminds you that the active product session is backed by the localhost engine.

### Mission ribbon

Click one of the six Missions:

- **Orient** — what deserves attention now?
- **Investigate** — what explains this observation?
- **Compare** — what changed?
- **System** — what exists on this Mac now?
- **Act** — what reversible change is justified?
- **Limits** — what can Sentinel actually establish?

### Lens rail

After selecting a Mission, click a Lens underneath it. The Lens is the actual working view.

### Evidence Stage

The center of the window is the Evidence Stage. It is not a card dashboard. Each Lens is organized around a question, then evidence, relationships, time, comparison, or action.

### Context tray

Buttons such as **Explain**, **Object Story**, or graph-node selection can open the Context tray. The tray is for deeper evidence about the selected object without replacing the current Lens.

### Activity bar

The bottom Activity bar reports real local work such as scanning, hashing, capturing, comparing, exporting, or loading evidence. For Storage it reports the real backend phase and progress rather than a fake animation.

---

# 2. Orient

## Status

Click **Orient → Status**.

Status answers: **What deserves attention now?**

Current instruments can include disk use, memory, typed review signals, active Cases, Safe Action health, Change Monitor state, readiness, and retained structured evidence.

### Buttons

**Run Snapshot**

Starts a bounded read-only observation. Use this when you want Sentinel to refresh its evidence picture before investigating anything.

**Refresh posture**

Reloads current Security Posture and structured local evidence without pretending that a higher review count means malware.

### What to do next

- unexpected object or signal → **Investigate → Cases / Search / Object**;
- unexplained relationship → **Investigate → Relations**;
- question about change → **Compare**;
- question about current system state → **System**.

---

## Snapshot

Click **Orient → Snapshot**.

Snapshot is a bounded read-only observation and review queue. Attention/review priority means **where to inspect next**, not infection probability.

A Monitoring Snapshot is separate from an ordinary Snapshot because monitoring can intentionally update local comparison state used by Behavior or Persistence workflows.

---

# 3. Investigate

## Cases — Case Stories 2.0

Click **Investigate → Cases**.

Cases now use a Story → Episode → Evidence model.

Each Case can show:

- Stable Story ID;
- current Episode ID;
- occurrence count;
- first/last seen;
- confidence and confidence band;
- evidence sources;
- observed facts;
- derived relationships;
- interpretation;
- explicit unknowns;
- retained episodes;
- Episode evolution;
- ordered evidence timeline.

### Buttons

**Rebuild correlations**

Re-runs incident/case correlation against currently available retained evidence and reloads Case Stories.

**Refresh**

Reloads the current retained Case model without forcing a correlation rebuild.

**Export JSON**

Exports the current Case episode as a Sentinel evidence JSON bundle.

**Object Story**

Opens the primary object/path from that Case in the Context tray so you can continue from the exact object instead of interpreting the Case title alone.

### How to read a Case

Open **Explain why this is grouped** before drawing a conclusion. Keep these categories separate:

- **Observed facts** — directly established evidence;
- **Derived relationships** — connections Sentinel computed from evidence;
- **Interpretation** — bounded explanatory context;
- **Unknowns** — what the retained evidence cannot establish.

---

## Search

Click **Investigate → Search** or use the global Search field.

Search begins with known evidence. Deep path/filename search is explicit and bounded. It searches names and paths, not arbitrary file contents.

No result only means **no result inside the searched coverage**.

Use Search when you already know part of a process name, path, endpoint, or object identity.

---

## Relations — Evidence Graph 2.0

Click **Investigate → Relations**.

This Lens combines an evidence topology graph with grouped global time evidence.

The topology can organize nodes into lanes such as:

**Startup → File/Object → Process → Network → Case**

The graph keeps source provenance, review priority, observation windows, node/edge budgets, and truncation explicit.

### Buttons

**Capture evidence**

Records a fresh bounded intelligence/evidence capture, then rebuilds the Graph 2.0 view.

**Refresh**

Reloads Graph 2.0 and the grouped timeline from current retained evidence without forcing a new capture.

### Graph interaction

Click/select a graph node to inspect its object context. When an exact path is available, Sentinel can continue into Object Story 2.0.

An edge means **an observed/derived evidence relationship**, not proof of causality or malicious intent.

### Global time density

The timeline histogram shows where retained evidence is concentrated over time. Repeated observations can be grouped visually without deleting the underlying provenance.

---

## Audit

Click **Investigate → Audit**.

Audit ranks evidence that deserves review and explains why it surfaced. Review/risk numbers are prioritization tools, not malware probabilities.

Use Audit when you want a bounded queue of items to inspect rather than a full-system verdict.

---

## Object — Object Story / verification

Click **Investigate → Object** and provide/select an exact path when requested.

Depending on availability, Sentinel can establish evidence such as:

- size, mode, modification time, and object type;
- SHA-256 within configured budgets;
- Mach-O architecture;
- signing identity, Team ID, and certificate chain;
- Gatekeeper context;
- quarantine/download-origin metadata;
- native Security.framework static-code validation on supported real-macOS builds;
- related processes/persistence/background evidence;
- related Cases;
- first/last retained observation;
- next related investigation targets.

In the Context tray, click a related target to continue the investigation from that object.

Signed or Gatekeeper-accepted software can still behave badly; identity evidence is not intent.

---

# 4. Compare

## Changes — live watch + System Checkpoints

Click **Compare → Changes**.

Changes combines bounded live Change Monitor evidence with retained System Checkpoints.

Use the live watch for deliberately selected directory roots. Native FSEvents can be used when available; bounded polling is the fallback.

### System Checkpoints

Capture checkpoints when you want explicit state comparison across time. A checkpoint can contain bounded evidence about processes, startup state, network state, mounts, filesystem state, and security posture.

Choose two retained checkpoints and compare them to see added/removed/changed evidence by category.

A difference is evidence of change, not evidence of danger.

If Change Monitor reports dropped/root-changed continuity, treat the stream as incomplete until a fresh bounded observation/reconciliation establishes current state.

---

## Behavior

Click **Compare → Behavior**.

Behavior compares adjacent compact observations and asks **what differs from the previous observation?**

Repeated behavior is not automatically learned as safe.

---

## Reference

Click **Compare → Reference**.

Trusted Profile comparison only exists after explicit user capture/approval. It answers **what differs from the reference state I approved?**

A Trusted Profile is context, not permanent certification.

---

# 5. System

## Machine

Click **System → Machine**.

Shows model/chip/architecture, cores, memory, macOS/runtime information, and storage context. Sentinel intentionally does not require a serial number or Hardware UUID for this evidence model.

---

## Processes

Click **System → Processes**.

This is current-state process evidence.

Click **Explain** on a process row to continue into process/object context when available.

Interpret a process together with executable identity, ancestry/relationships, persistence, and current activity rather than the command name alone.

---

## Auto-start — deep Launch relationship view

Click **System → Auto-start**.

The current view joins ordinary startup evidence with Launch Services evidence and builds the relationship:

**plist → executable target → current running process**

It can show:

- scope;
- label;
- RunAtLoad;
- KeepAlive;
- current PID match;
- executable target;
- missing target conditions;
- visibility limitations.

### Buttons

**Refresh launch evidence**

Reloads the launch relationship model.

**Explain**

Opens the selected Launch declaration in Context and shows configuration evidence, target evidence, runtime relationship, and why the declaration starts automatically.

Persistence is common in legitimate software. A LaunchAgent/LaunchDaemon is not suspicious merely because it starts automatically.

---

## Persistence / Background

Use these Lenses for bounded persistence comparison and modern Background Task Management registrations.

They complement Auto-start rather than replacing it.

---

## Network — current evidence + explicit history

Click **System → Network**.

Network now includes:

- visible TCP rows;
- owning processes;
- Established and Listen counts;
- endpoint classes;
- process → network relationships;
- endpoint grouping;
- explicitly retained Network History;
- snapshot-to-snapshot normalized relationship comparison.

### Buttons

**Refresh current**

Reloads current TCP evidence. It does **not** create history.

**Capture history snapshot**

Explicitly records normalized relationship metadata for later comparison. Sentinel does not capture packet contents.

**Compare**

Select a From and To Network History snapshot, then click **Compare** to display added relationships and relationships absent in the target snapshot.

**Explain** on a process row

Continues into process/object context.

Historical PID values are context only because macOS can reuse PIDs.

---

## Storage — measurement + history + aging

Click **System → Storage**.

Storage is a bounded, cancellable measurement pipeline:

**Traverse → Measure → Hash candidates → Report**

### Start a measurement

Choose:

- Scope;
- Minimum file MB;
- Large-file limit.

Then click **Measure storage**.

The Activity bar reports real backend progress such as files visited, folders visited, slow paths skipped, hashes completed, hash bytes, and the current hash path.

Click **Cancel** to stop a long scan. Partial measured evidence can remain available when the backend can preserve it safely.

### Results

Storage keeps these concepts separate:

- large files;
- measured categories/file types;
- exact duplicate groups confirmed by SHA-256 agreement;
- filename/version families, which remain heuristics;
- permission limitations;
- slow paths skipped.

### Storage History and Aging

The advanced Storage view can retain explicit Storage snapshots, plot storage trend evidence, compare retained snapshots, and show large-file age buckets/oldest measured objects.

A large or old file is not automatically disposable.

---

# 6. Act

## Reclaim

Click **Act → Reclaim**.

Reclaim is a review surface. It estimates what may be worth reviewing; it does not automatically delete files.

---

## Safe Change — Recovery Workbench

Click **Act → Safe Change**.

Start by reading **Recovery readiness**. Sentinel can expose whether recovery prerequisites are Ready, Review, Blocked, or Ephemeral and can show Vault/journal/state-recovery context.

Then use the bounded Safe Action workflow.

Supported operations include:

- Reveal in Finder;
- Rename without overwrite;
- move an eligible file to Sentinel Vault;
- restore through recorded recovery metadata.

There is no permanent-delete API.

### Mutation flow

A mutating action requires:

1. choose the exact target;
2. request a fresh Preview;
3. read dependency/consequence information;
4. enter the exact confirmation phrase;
5. enter the one-time confirmation code;
6. explicitly acknowledge the action;
7. let the server revalidate immediately before execution;
8. preserve no-overwrite/recovery/audit metadata where applicable.

Vaulting a file does not terminate an already-running process and does not prove that malicious behavior has been neutralized.

---

# 7. Limits

## Visibility

Click **Limits → Visibility**.

Use this before interpreting missing evidence. It reports which evidence sources are available, limited, unavailable, or user-controlled.

Missing permission lowers confidence; it never becomes evidence of safety.

---

## Model

Click **Limits → Model**.

Keep these rules visible:

- suspicious ≠ malicious;
- signed ≠ safe;
- Gatekeeper accepted ≠ malware-free;
- public endpoint ≠ suspicious by itself;
- Trusted Profile match ≠ safe forever;
- evidence confidence ≠ malware probability;
- observed change ≠ danger;
- missing evidence reduces visibility rather than proving absence.

---

# 8. A practical click workflow

For an unfamiliar item discovered on the Mac:

1. **Orient → Status → Run Snapshot**.
2. Open **Investigate → Cases** and check whether the object belongs to a repeated Story.
3. Open **Investigate → Relations** to see connected startup/process/network/Case evidence.
4. Click the relevant node or **Object Story**.
5. Use **Investigate → Object** for exact identity/signing/hash evidence.
6. If the question is temporal, use **Compare → Changes** or Network/System checkpoints.
7. If a reversible change is justified, open **Act → Safe Change**.
8. Read Recovery readiness first.
9. Preview, confirm, execute, then observe again.

For storage pressure:

1. **System → Storage**.
2. Configure bounded scan scope.
3. Click **Measure storage**.
4. Review measured large files and exact SHA-256 duplicate groups.
5. Check Storage History/Aging before deciding whether an old object is actually obsolete.
6. Use **Act → Reclaim** only as a review queue.

For unexpected network activity:

1. **System → Network → Refresh current**.
2. Find the owning process/endpoint.
3. Click **Explain** on the process when available.
4. Click **Capture history snapshot** if you intentionally want a comparison point.
5. Later capture another snapshot and click **Compare**.
6. Continue into Object Story or Relations instead of interpreting the endpoint alone.

---

# 9. Local state

Normal persistent mode can store compact Sentinel-owned state under:

```text
~/Library/Application Support/Sentinel/
```

Depending on enabled workflows this can include Behavior/Trust state, Change Monitor history/checkpoints, Incident/Case history, System/Network/Storage snapshots, and Safe Action/Vault recovery metadata.

`--ephemeral` avoids durable comparison/recovery state and disables mutating Safe Actions because durable recovery metadata would not exist.

---

# 10. Specialist workspaces

The primary Sentinel 2.4 UI now contains the main high-value capabilities that previously lived only in auxiliary pages, including Case Stories, Graph/Timeline/Object Story, System Checkpoints, Storage History/Aging, Network History, Launch relationship evidence, and Recovery readiness.

Some specialist workspaces can remain for deeper engineering/debugging workflows such as branching Investigation sessions, typed System Console queries, detailed relationship exploration, and development/readiness tools. They are auxiliary surfaces, not a second product UI, and are not required for the normal user workflow above.

---

# 11. What we can develop next

The current product is functionally complete enough for normal Sentinel 2.4 use. Future development should improve depth, continuity, and interaction rather than create another parallel dashboard.

## Priority A — highest user value

### 1. Interactive Evidence Graph

Upgrade Graph 2.0 from a bounded topology view into a richer investigation surface:

- click-to-focus and neighborhood expansion;
- edge/source filters;
- severity/review-priority filters;
- time-window brushing;
- hide/show evidence classes;
- pin important objects;
- compare the same graph between two checkpoints;
- open Case/Object Story directly from graph selection.

### 2. Unified Investigation Sessions

Bring the best parts of the specialist Investigation workspace into the primary UI:

- named investigation sessions;
- bookmarks;
- notes attached to evidence objects;
- branching hypotheses/questions;
- saved filters;
- resumable investigation history;
- evidence bundle export for one session.

This should preserve the rule that notes/hypotheses are user interpretation, not observed evidence.

### 3. Better Timeline interaction

Extend the grouped Global Timeline with:

- zoomable time ranges;
- source/severity/object filters;
- checkpoint markers;
- Case episode markers;
- network/storage/system capture markers;
- click a time bucket to reveal the exact evidence behind it.

### 4. Process Story / ancestry

Create a first-class Process Story that joins:

- parent/child ancestry;
- executable identity;
- signing evidence;
- launch origin;
- current network activity;
- related files;
- related Cases;
- retained observations when available.

This would make **Explain** on a process substantially more useful.

### 5. Permission and visibility assistant

Turn Visibility into an actionable setup assistant:

- show which permission is missing;
- explain exactly which evidence it affects;
- provide safe UI navigation guidance for granting/revoking it;
- re-check visibility after the user changes macOS settings;
- never describe unavailable evidence as collected.

## Priority B — deeper intelligence

### 6. Network relationship evolution

Build on explicit Network History:

- endpoint recurrence over time;
- process ↔ endpoint stability;
- first/last observed relationship;
- newly appearing endpoint relationships;
- comparison against a user-approved reference;
- richer domain/IP classification using local/system data when available.

Do not turn endpoint novelty into a malware score.

### 7. Launch/Persistence drift model

Extend Auto-start and Persistence so Sentinel can show:

- newly added launch declarations;
- executable target changes;
- plist hash changes;
- signing identity changes;
- target disappeared/reappeared;
- current runtime match changed;
- user-approved reference comparison.

### 8. Storage forecasting and hot/cold evidence

Build on Storage History/Aging:

- growth rate by category/path;
- projected pressure if the recent trend continues;
- files repeatedly growing;
- files never observed changing;
- duplicate bytes over time;
- workspace-specific storage history;
- comparison between snapshots without rescanning unrelated scopes.

Forecasts must remain estimates with visible assumptions.

### 9. Recovery simulation

Before Safe Change execution, add a dry-run recovery view:

- where the object will move;
- what restore would do;
- whether the original path is writable;
- potential overwrite conflicts;
- recovery metadata that will be recorded;
- whether a running process still holds the original object.

## Priority C — platform depth

### 10. Native local notifications

Optional macOS notifications for user-chosen events such as:

- Change Monitor continuity loss;
- a selected watched root changed;
- storage scan completed;
- new explicit Case episode after a user-triggered observation;
- recovery/Vault health requires attention.

Notifications should be opt-in and should not imply continuous omniscient monitoring.

### 11. Conditional Endpoint Security sensor

If Apple entitlement, signing, deployment, user approval, and runtime requirements are actually satisfied, Sentinel could add an Endpoint Security-backed sensor for deeper process/file events.

Until those conditions exist, the product must continue to report the sensor as unavailable rather than pretending source-code scaffolding equals active coverage.

### 12. Local evidence assistant

An optional local model could help summarize **already collected Sentinel evidence**:

- explain a Case in plain language;
- summarize differences between checkpoints;
- suggest the next evidence Lens to inspect;
- turn a large Object Story into a concise evidence summary.

The assistant must cite the Sentinel evidence it used, distinguish facts from interpretation, and never invent missing observations.

### 13. Evidence bundle / shareable report

Create a portable, privacy-conscious export containing selected:

- Case Story;
- Object Story;
- graph neighborhood;
- timeline range;
- checkpoint diff;
- visibility limitations;
- hashes/signing evidence;
- user notes clearly marked as notes.

This would be useful for debugging, support, research, and reproducible investigations.

---

# 12. Development rule for future features

New features should normally extend the current Mission/Lens model instead of adding another standalone dashboard.

A new feature should answer at least one of these questions:

- **Orient:** what deserves attention?
- **Investigate:** what explains it?
- **Compare:** what changed?
- **System:** what exists now?
- **Act:** what reversible action is justified?
- **Limits:** what can and cannot be established?

If it cannot answer one of those questions, it probably belongs in an engineering/debugging workspace rather than the main product.

---

# 13. Build and distribution

`build-desktop-macos.sh` builds the current macOS application with a Universal AppKit launcher and architecture-specific Go engines for Apple Silicon and Intel. Browser and native WKWebView App View load the same Sentinel 2.4 frontend.

`reinstall-macos.sh` performs the clean application replacement while preserving Sentinel-owned history, baselines, and recovery state.

Production distribution outside the Mac App Store can later use Developer ID signing, Hardened Runtime, notarization, and a stapled DMG. See `DIRECT_DISTRIBUTION_GUIDE.md`.

For lower-level engineering and security details, see `FINAL_HARDENING_GUIDE.md`, `SECURITY.md`, and `TESTING.md`.
