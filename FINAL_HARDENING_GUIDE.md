# V2.1 Final Hardening Guide

## 1. Final Readiness

**Home → Check Sentinel readiness** checks Sentinel itself, not the Mac's malware status.

It reviews:

- single-instance state protection;
- Behavior / Trusted Profile state health;
- Vault + Action Journal recovery health;
- Change Monitor continuity / rescan-required state;
- running Sentinel executable SHA-256;
- native Security.framework availability when applicable;
- evidence-source visibility;
- whether a last-known-good `.bak` state copy had to be used.

A low Readiness score means Sentinel has degraded visibility or internal state that deserves attention. It does **not** mean the Mac is infected.

## 2. Single-instance protection

Normal persistent mode allows one Sentinel writer per user. A second persistent process exits instead of racing the first process for Behavior, Trust, Incident, Change, or Vault state.

If you intentionally need a second isolated session, use:

```bash
sentinel --ephemeral
```

Ephemeral mode keeps monitoring state in memory and disables mutating Safe Actions.

## 3. Durable local state

Sentinel-owned state is written with:

- user-only directory/file permissions;
- same-directory temporary files;
- file synchronization before replacement;
- atomic rename replacement;
- directory synchronization;
- one last-known-good `.bak` copy where possible.

If the primary state file cannot be decoded, Sentinel may use the `.bak` copy **in memory** and Final Readiness reports that recovery event. The backup is not a reason to ignore the damaged primary state; recreate or review the affected baseline/profile/history.

## 4. Incident lifecycle

V2.1 no longer correlates every event on the same path across an unlimited session. Evidence is separated when there is a gap greater than roughly 15 minutes.

Incident History uses a stable story key so repeated rebuilding updates the same story instead of appending endless near-duplicates. Each story exposes:

- `active` / `historical` state;
- Evidence Confidence;
- occurrence/evidence count;
- source set;
- bounded timeline;
- recommended investigation steps.

## 5. Deep Review

Choose **Deep Review** on an Incident to run a fresh, read-only inspection of its current primary object.

Deep Review combines:

- current SHA-256 status;
- signing and Gatekeeper context;
- native Security.framework result when compiled in;
- current Object Story summary and relationships.

Deep Review does not mutate files and does not turn Evidence Confidence into a malware probability.

## 6. Heavy-work gate

Expensive endpoints share a small concurrency budget. If Sentinel is already performing other heavy local analysis, another request can receive HTTP `429` with `Retry-After` instead of starting unlimited parallel work.

This protects responsiveness during repeated clicks, scripts, report generation, deep filename searches, Integrity checks, and Targeted Review.

## 7. Vault footprint

Safe Actions still never auto-delete Vault content. V2.1 adds only advisories when the Vault becomes very large or contains many active recovery items.

Review Vault contents manually. Restore when appropriate. Permanent deletion remains outside Sentinel.

## 8. Graceful shutdown

Ctrl+C / SIGTERM now:

1. cancels active storage jobs;
2. stops Change Monitor;
3. persists the latest Change checkpoint when persistence is enabled;
4. shuts down localhost;
5. releases the single-instance lock.

A forced process kill can still prevent graceful finalization; last-known-good state recovery exists for that reason.
