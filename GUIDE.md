# Sentinel 2.4 — User Guide

Sentinel is a local-first macOS system-intelligence and evidence application. The engine runs locally, binds to `127.0.0.1`, and serves one Sentinel 2.4 product frontend. The default browser and the native App View are two containers for the same authenticated localhost session.

Sentinel's central rule is simple: **evidence is not a verdict**. Current state, change, identity, relationships, trust context, and visibility limits remain separate concepts so the interface does not turn incomplete observations into false certainty.

## The Sentinel 2.4 workflow

A useful default workflow is:

**Orient → Investigate → Compare when needed → Verify exact objects → Act only with evidence → Observe again**

The product is organized by intent rather than by the old Easy/Advanced dashboard split.

## Orient

### Status

Status answers: **What deserves attention now?**

It shows current runtime/system instruments and Sentinel readiness. This is context for later interpretation, not a security score.

### Snapshot

Snapshot is a bounded read-only observation and review queue. The Attention Index prioritizes investigation work; it is not malware probability.

A Monitoring Snapshot is separate from the ordinary read-only Snapshot because it can intentionally update local comparison state used by Behavior/Persistence workflows.

## Investigate

### Cases

Cases correlate related observations into fewer evidence stories. Confidence describes how strongly observations relate to the same story; it does not describe the probability that software is malicious.

### Search

Search begins with current known evidence. Deep filename/path search is explicit and bounded, searches names/paths rather than file contents, and does not treat “no result” as meaningful outside known coverage.

### Relations

Relations shows observed links such as startup → file → process → endpoint together with timeline evidence. A relationship edge alone does not establish causality or intent.

### Audit

Audit ranks evidence that deserves review and explains why it was surfaced. Risk/review scores are attention mechanisms, not malware probabilities.

### Object

Object verification inspects one exact local path. Depending on availability it can establish facts such as:

- size, mode, modification time, and file type;
- SHA-256 within the configured hash budget;
- Mach-O architectures;
- signing identity, Team ID, and certificate authorities;
- Gatekeeper context;
- quarantine/download-origin metadata;
- native Security.framework static-code validation in supported real-macOS CGO builds.

A valid signature or accepted Gatekeeper assessment still does not prove good intent.

## Compare

### Changes

Change Monitor watches deliberately selected directory roots. Native macOS builds can use FSEvents when available; bounded polling is the fallback.

Dropped/root-changed conditions create explicit rescan/reconciliation requirements rather than pretending event continuity is complete.

### Behavior

Behavior compares compact adjacent observations and answers **what differs from the previous observation?** Repeated behavior is not automatically learned as safe.

### Reference

A Trusted Profile exists only after explicit user capture. Reference comparison answers **what differs from the state I approved?** Profile membership is context, not permanent certification.

## System

### Machine

Machine explains model/chip/architecture, cores, memory, macOS/runtime information, and storage compatibility context. Sentinel does not need to expose the full serial number or Hardware UUID for this task.

### Processes

Processes is a current snapshot. A process should be interpreted together with its executable identity, ancestry, relationships, and current activity.

### Auto-start / Persistence / Background

These lenses expose visible launch declarations, configuration drift, and modern background registrations. Persistence is normal for many legitimate applications and requires context.

### Network

Network shows current visible TCP evidence. A public or unfamiliar endpoint is not suspicious by itself, and Sentinel does not claim visibility into encrypted payload contents or unobserved history.

### Storage

Storage Intelligence performs bounded, cancellable measurement and exposes real backend progress. It distinguishes:

- large-file observations;
- measured categories/file types;
- **exact duplicate groups confirmed by SHA-256 agreement**;
- possible version/name families, which remain heuristics rather than duplicate proof.

Permission errors and slow-path skips are evidence about coverage and are shown instead of silently discarded.

## Act

### Reclaim

Reclaim/cleanup preview estimates what may be worth reviewing. It does not automatically delete anything and does not claim that a large, old, cached, or duplicated-looking item is disposable.

### Safe Change

Observation and mutation are deliberately separated.

Safe Change supports only the bounded actions implemented by Sentinel, including Reveal, Rename, Vault, and Restore. There is no permanent-delete API.

Mutating actions require:

1. an exact target;
2. a fresh server-side preview;
3. dependency/consequence review;
4. an exact confirmation phrase;
5. a one-time confirmation code;
6. explicit acknowledgement;
7. revalidation immediately before execution;
8. no-overwrite movement and recovery/audit metadata where applicable.

Vaulting an on-disk file does not terminate an already-running process and does not prove that malware was neutralized.

## Limits

### Visibility

Visibility reports which evidence sources are available, limited, unavailable, or user-controlled. Missing permission or unavailable tooling lowers confidence; it never becomes invented evidence or an automatic safety signal.

### Model

Keep these interpretation rules in mind:

- suspicious ≠ malicious;
- signed ≠ safe;
- Gatekeeper accepted ≠ malware-free;
- public network endpoint ≠ suspicious by itself;
- Trusted Profile match ≠ safe forever;
- evidence confidence ≠ malware probability;
- observed change ≠ danger;
- missing evidence reduces visibility rather than proving absence.

## Local state

Normal persistent mode can store compact Sentinel-owned state under:

```text
~/Library/Application Support/Sentinel/
```

Depending on the enabled workflow this can include Behavior/Trust state, Change Monitor history/checkpoints, Incident/Case history, and Safe Action/Vault recovery metadata. Sentinel-owned directories/files use restrictive local permissions where supported.

`--ephemeral` avoids persistent comparison/recovery state and disables mutating Safe Actions because durable recovery metadata would not exist.

## Specialist workspaces

Sentinel 2.4 has one primary product UI, but several deeper auxiliary workspaces remain while their unique capabilities are migrated into the main intent/lens model. Examples include:

- branching Continue Investigation sessions and bookmarks;
- typed, allowlisted System Console queries and structured evidence;
- retained System Snapshot & Diff;
- Storage History and Large-File Aging;
- detailed process/network relationship exploration;
- Launch Services detail;
- Vault/recovery health;
- deeper Intelligence 2.0 graph/timeline/object filters.

These workspaces share the same localhost engine/session and return to Sentinel 2.4. They are not the retired root dashboard and must not recreate it.

## Sentinel.app

`build-desktop-macos.sh` builds the current macOS application with a Universal AppKit launcher and architecture-specific Go engines for Apple Silicon and Intel. Browser and native WKWebView App View load the same Sentinel 2.4 frontend.

Production distribution outside the Mac App Store can later use Developer ID signing, Hardened Runtime, notarization, and a stapled DMG. See `DIRECT_DISTRIBUTION_GUIDE.md`.

## Advanced sensor boundary

Sentinel does not claim an Endpoint Security source is available unless the required entitlement, packaging, approval, permission, and runtime conditions are actually satisfied. Entitlement-gated scaffolding must not be described as enabled merely because source code exists.

## Reliability

The Go engine retains hardened behavior such as single persistent writer semantics, bounded heavy-work concurrency, strict JSON handling, local state/recovery validation, graceful shutdown, bounded histories, and explicit readiness/visibility reporting.

See `FINAL_HARDENING_GUIDE.md`, `SECURITY.md`, and `TESTING.md` for lower-level engineering details.
