## V2.2 Desktop Conversion

The preferred direct-distribution path is now the native-window `Sentinel.app` built by `build-desktop-macos.sh` and distributed as one Developer ID signed/notarized DMG. See `DIRECT_DISTRIBUTION_GUIDE.md`.

# Sentinel macOS V2.2 — User Guide

Sentinel is a local-first macOS system-intelligence platform. The browser is the interface; your Mac is the server. The normal engine binds to `127.0.0.1`, performs analysis locally, and preserves a strict distinction between evidence, trust context, and conclusions.

## The V2.2 workflow

**Observe → Change → Correlate → Incident → Explain → Targeted Review → Reversible Action → Observe again**

### Home / Quick Check

Use Quick Check first. It is deliberately read-only and does not create or update monitoring baselines. The Attention Index is review priority, not malware probability.

### Change Monitor

Watch explicit directory roots. Native macOS builds use FSEvents when compiled with CGO/CoreServices; portable builds use bounded polling. V2.2 preserves compressed local history, native event checkpoints, smart resume, rescan-required semantics, and bounded hierarchy reconciliation.

### Incident Intelligence

Press **Rebuild incidents** to correlate current Filesystem, Persistence, Behavior, and Trust evidence. Read the timeline, sources, confidence, and recommended review steps before acting.

### Search & Weakness

Power Search queries current bounded evidence with filters such as `kind:incident`, `kind:change`, `severity:review`, `pid:1234`, and `path:downloads`. Deep Filename Search is explicit, bounded, filename/path-only, and does not follow symlinks or index content.

Weakness Audit scores Sentinel's current visibility and defensive posture, not the Mac's infection status.

### Integrity Lab

Integrity Lab can show:

- local SHA-256 within the configured hash budget;
- file type, mode, size, modification time;
- Mach-O architectures where available;
- codesign identity, Team ID, authorities;
- Gatekeeper context;
- quarantine / download-origin metadata when accessible;
- **native Security.framework static-code validation** in real-macOS CGO builds.

The native validator requests all-architecture checking for universal code. A successful signature validation still does not prove good intent, and validation is only valid while the underlying code remains unchanged.

### Behavior Diff

Behavior Diff compares adjacent compact states. It answers “what changed?” and maintains bounded local history. Repeated behavior is not automatically considered safe.

### Trust & Drift

A Trusted Profile exists only when the user explicitly creates one. It answers “what differs from the reference I approved?” Profile membership is context, not certification.

### Persistence Integrity

Hashes visible LaunchAgent/LaunchDaemon plist configurations and identifies additions, removals, or content changes within the session.

### Evidence Graph / Object Story

Object Story is the per-object view: path, identity, startup relationships, process lineage, network context, Behavior history, and Trust context.

### Safe Actions

Only reversible actions exist: Reveal, Rename, Vault, Restore. There is no permanent delete. Rename/Vault/Restore use preview, typed confirmation, a one-time code, revalidation, and no-overwrite movement. Vault does not terminate already-running processes and does not prove malware was neutralized.

## Local state

Normal persistent mode can use compact local state under:

`~/Library/Application Support/Sentinel/`

V2.2 may store Behavior/Trust state, Safe Actions recovery metadata, compressed Change History/checkpoint, and compressed Incident History. Sentinel-owned directories are tightened to `0700`; state files are written `0600` where supported.

`--ephemeral` prevents persistent Behavior/Trust/Change/Incident state and disables mutating Safe Actions because safe recovery metadata would not exist.

## Sentinel.app

`build-app-macos.sh` creates a Finder-friendly development `Sentinel.app` wrapper containing both Mac architecture binaries. Production distribution still requires a real-Mac Developer ID signing and notarization workflow.

## Endpoint Security boundary

The normal V2.2 release does not install an Endpoint Security System Extension. Source scaffolding exists for a future notification-only advanced sensor, but Apple entitlement approval, System Extension packaging, user approval, Full Disk Access, signing, and real-Mac testing are mandatory before it can be called enabled.

## Interpretation rules

- Suspicious ≠ malicious.
- Signed ≠ safe.
- Gatekeeper accepted ≠ malware-free.
- Public network ≠ suspicious by itself.
- Trusted Profile match ≠ safe forever.
- Evidence Confidence ≠ malware probability.
- Missing evidence reduces visibility; it never becomes invented evidence.

## V2.2 inherited reliability layer

Use **Final Readiness** before long monitoring sessions. It evaluates Sentinel's own runtime/state/recovery condition. Persistent mode permits one state writer; `--ephemeral` is the supported way to run an additional isolated read-only session.

Incident **Deep Review** performs a fresh Integrity + Object Story inspection. Incident correlation is time-windowed to reduce false relationships between events that happen far apart.

See `FINAL_HARDENING_GUIDE.md` for state recovery, concurrency, and graceful-shutdown details.

## System Profile

System Profile is an Easy Mode, read-only hardware explanation page. It is intended for users who do not know whether their Mac is Apple Silicon or Intel or how to interpret model/chip/core terminology. It reports useful compatibility information and explains each field. Full serial numbers and Hardware UUIDs are intentionally excluded because they are unique device identifiers and are unnecessary for Sentinel's local analysis.
