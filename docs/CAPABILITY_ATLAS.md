# Sentinel 2.4 Capability Atlas

Sentinel 2.4 arranges the product by investigation intent instead of exposing a wall of unrelated diagnostic pages. The same structure is rendered inside **Status → Complete Capability Atlas**.

```text
ORIENT
├─ Status
├─ Easy Scan
├─ Full Scan
├─ Evidence Completeness
└─ Product Onboarding

INVESTIGATE
├─ Case Stories 3.0
├─ Search + Saved Queries
├─ Graph 3.0
├─ Timeline 3.0
├─ Security Audit
├─ Object Story 3.0
├─ Explain This
└─ Smart Next Step

COMPARE
├─ Change Evidence Flow
├─ System Checkpoint 2.0
├─ Behavior History
├─ Reference Profiles 2.0
├─ Compare Any Two Objects
└─ Historical Heatmaps

SYSTEM
├─ Machine
├─ Processes + Story 2.0
├─ Auto-start
├─ Launch & Persistence Drift
├─ Background
├─ Network Intelligence 2.0
├─ Storage Intelligence 2.0
└─ Storage Forecast

ACT
├─ Reclaim Review
├─ Safe Change
├─ Safe Change Simulation
├─ Recovery Center 2.0
└─ Evidence Bundle

LIMITS
├─ Permission & Visibility Assistant
├─ Local Evidence Assistant
├─ Natural-language Command Bar
├─ Watch Rules
├─ Unified Investigation Workspace
├─ Workspace Persistence
├─ Cross-Lens Selection
└─ Keyboard Workflow
```

## Easy Scan versus Full Scan

### Easy Scan

Easy Scan is the fast path. It reads current bounded evidence and a review queue without rewriting Behavior, Trust, Persistence, or user files.

Use it when the question is simply: **what deserves attention now?**

### Full Scan

Full Scan is the comprehensive retained-baseline path. One explicit Full Scan orchestrates the existing Sentinel evidence engine instead of introducing a fake second scanner.

```text
01 Visibility & capability map
   ↓
02 Current system / process / launch / network state
   ↓
03 Security posture & explainable audit
   ↓
04 Monitoring / Behavior / Persistence baseline
   ↓
05 Evidence Graph + Timeline capture
   ↓
06 Case correlation + story history
   ↓
07 System Checkpoint 2.0
   ↓
08 Network History snapshot
   ↓
09 Deep Home storage traversal + hash analysis
   ↓
10 Storage History snapshot
   ↓
11 Recovery / Safe Action health / readiness
   ↓
12 Final review queue + retained analysis refresh
```

The storage stage uses Sentinel's real cancellable traversal and hashing pipeline. Progress comes from actual files/folders visited, hash progress, and bounded slow-path/permission handling rather than an artificial animation.

## What happens after Full Scan

Full Scan exists so later work can reuse retained evidence instead of repeatedly rebuilding every comparison source. System Checkpoints, Network History, Storage History, Behavior/Persistence comparison state, Case history, and intelligence timeline data can be read by their normal Lenses after the scan completes.

This does **not** mean one scan is permanently current. Re-run Full Scan when:

- you explicitly want fresher evidence;
- the Mac has materially changed;
- Change Monitor reports a continuity/rescan-required condition;
- the displayed retained evidence is old for the question you are asking.

The Status Scan Center displays retained System, Network, and Storage capture age/freshness so historical evidence is not silently presented as live state.

## Safety boundary

Full Scan is evidence acquisition and retained comparison-state creation. It does not call the Safe Action execution API and does not permanently delete user data. Safe Change remains a separate workflow with preview, explicit confirmation, server revalidation, and recovery metadata.

A complete scan is not a malware verdict, not continuous surveillance, and not a permanent certificate of safety. Missing permission or unavailable evidence remains visible as a limitation rather than being filled with guesses.

## Canonical frontend ownership

The current product startup order is:

```text
core.js
  → base lenses
  → advanced.js
  → case-stories.js
  → system-evidence.js
  → workbench.js
  → full-scan.js
  → runtime.js
```

`full-scan.js` owns Scan Center orchestration and the Capability Atlas. `full-scan.css` owns the visual arrangement. Historical `scan-center.js/css` names are deliberately retired and must not return to the default product runtime.
