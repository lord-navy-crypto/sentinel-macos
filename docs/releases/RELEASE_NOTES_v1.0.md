# Sentinel macOS v1.0 — Easy Operations & Unified Review

v1.0 focuses on making the existing system-intelligence stack easier to use without weakening the safety model.

## New user-experience layer

### Easy / Advanced navigation

Easy mode shows the most common workflow only:

- Home
- Quick Check
- Storage Intelligence
- Security Audit
- Safe Actions
- Guide & Permissions

Advanced mode exposes the full forensic/diagnostic stack. Opening an advanced destination from a recommendation automatically switches navigation mode.

### Quick Check

New authenticated endpoint:

```text
GET /api/quick-check
```

Quick Check is read-only and summarizes:

- current Security Audit score/findings,
- disk-use pressure,
- existing Behavior baseline + latest index,
- existing Trusted Profile + latest drift,
- Persistence baseline/change state,
- Safe Actions recovery health,
- evidence-source availability.

It produces an **Attention Index** and next-step recommendations. The index is explicitly not a malware probability.

### Unified Review Queue

New endpoint:

```text
GET /api/review-queue
```

It merges high/review evidence from Security, Behavior, Trust, Persistence, and Safe Actions self-health into one bounded prioritized queue.

### Monitoring Snapshot

New endpoint:

```text
POST /api/guided-snapshot
```

This user-confirmed operation updates monitoring metadata in one step:

- Evidence Graph snapshot,
- Behavior capture/compare,
- Persistence capture/compare,
- Trust compare only if a user-approved profile already exists.

It never creates a Trusted Profile automatically and does not mutate user files.

### Universal Search

New endpoint:

```text
GET /api/search?q=...
```

Bounded search covers current processes, startup items, TCP snapshot, active Vault entries, latest Storage results, and exact local paths. The UI exposes it through **Command-K / Control-K**.

### Page-level explanation

Every module now has a **What is this?** explanation. The UI describes both the useful interpretation and the important non-conclusion (for example, “public network ≠ suspicious” and “Trust match ≠ safe forever”).

### Storage presets

One-click presets reduce repeated scan setup while preserving the existing bounded/cancellable scan engine.

## Safety model unchanged

v1.0 still provides no permanent-delete endpoint and does not terminate processes. Safe Actions remain Reveal / Rename / Vault / Restore with preview, no-clobber destination handling, typed confirmation, one-time code, recovery journal, and stale-object revalidation.
