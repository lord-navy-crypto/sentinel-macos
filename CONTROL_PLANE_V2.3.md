# Sentinel v2.3 Control Plane Center

Branch: `upgrade/v2.3-stable`

Status: development branch only; this does not describe `main`.

## Implemented in this expansion

The v2.3 branch now connects the Expanded Terminal Toolbox to Sentinel's investigation, security, history, and recovery layers instead of treating command output as an isolated report.

### Structured Terminal evidence

The structured System Console response now supports typed facts/records for selected macOS evidence including APFS layout, launchd services, system extensions, power assertions, hardware/software/storage/power profiles, DNS/proxy configuration, Time Machine, Spotlight, security posture, and bounded log recipes.

Raw Terminal output remains visible for the current System Console query. A separate retained System Evidence journal stores only compact typed summaries/signals, not raw Terminal output. Retention is bounded to 120 observations; normal mode uses Sentinel-owned private gzip state and `--ephemeral` remains memory-only.

### Continue Investigation from Terminal evidence

Where structured evidence contains a real positive PID or absolute local path, the System Console can continue directly into Process Relationship Explorer or Continue Investigation. Targets are bounded and deduplicated. Sentinel does not fabricate a path/PID when the command output does not expose one.

### Security Posture

Control Plane Center aggregates typed Security Posture evidence such as Gatekeeper, FileVault, SIP, system-extension visibility, current Incident count, Safe Action health, and Change Monitor state. Review posture is evidence for review, not malware probability.

System-global posture is deliberately separated from object incidents. For example, SIP/FileVault state does not become a fake file Incident.

### Terminal evidence to Incident / Explain Why

Path-specific integrity evidence can participate in object-centered Incident correlation. Current typed examples include a Gatekeeper rejected/reviewable assessment and a non-zero code-signing inspection result. The Incident explanation layer includes deterministic reason codes for these evidence types.

Only an explicit absolute-path, review/high, incident-eligible signal is bridged. System-global settings remain in Security Posture.

### System Snapshot & Diff

Control Plane Center can explicitly capture selected current macOS evidence across:

- process identity observations;
- launchd-visible services;
- TCP relationship observations;
- mounts and visible filesystems;
- Gatekeeper, FileVault, and SIP state.

System Snapshots are bounded to 16. Normal mode persists compact private gzip state; `--ephemeral` is memory-only. Comparison reports added/removed observations and security-state changes. Added/removed means observed in one retained snapshot and not the other; it does not establish exact start/stop time or causation.

### Storage History

The existing Storage History manager is now wired into the Control Plane API/UI. A completed Storage Intelligence result can be explicitly captured into the bounded 24-snapshot history, with latest growth attribution, partial-snapshot semantics, category deltas, and root continuation back into investigation.

Capture remains explicit: running a storage scan alone does not silently create persistent history.

### Recovery Center 2.0

Recovery Center aggregates Sentinel-owned recovery context:

- Safe Action/Vault health;
- Vault manifests;
- retained Action Journal entries;
- reversible-action count;
- Change Monitor rescan/checkpoint state;
- retained System, Storage, and Network snapshot counts;
- running/failed/cancelled storage jobs kept visible for recovery review;
- advisories when retained state is partial or needs review.

No permanent-delete path is introduced.

### Expanded bounded log recipes

System Console now contains fixed 10-minute recipes for:

- Gatekeeper / `syspolicyd`;
- power / `powerd`;
- crash / `ReportCrash`;
- launch services / `launchd`;
- mount/unmount / `diskarbitrationd`;
- network configuration / `configd`;
- system-extension activity / `sysextd`.

Predicates and windows are fixed by Sentinel. There is no arbitrary user-provided log predicate or shell composition.

## Control Plane UI

`web/control-plane.html` combines:

1. Security Posture;
2. System Snapshot & Diff;
3. Storage History;
4. Recovery Center 2.0;
5. retained Typed System Evidence.

System Console links to this workspace, while typed path/PID evidence can continue into the existing investigation surfaces.

## Safety invariants

This expansion keeps the existing System Console boundary:

- fixed allowlisted executables;
- fixed base arguments;
- validated absolute-path / positive-PID targets only where required;
- no `sh -c`, arbitrary shell, or `sudo` terminal;
- bounded command timeout/output;
- localhost authenticated session/work gates;
- no automatic destructive response;
- mutations remain in Safe Action preview/confirmation/journal/recovery;
- evidence remains separate from malware verdicts;
- historical collection remains bounded and explicit where capture creates persistent history.

## Still open after this expansion

This work does not claim the entire v2.3 roadmap is complete. Still open include:

- deterministic Incident merge/split behavior across every legacy episode boundary;
- standalone Incident export;
- repetitive-event grouping in Global Timeline;
- Storage Intelligence aging analysis beyond current snapshot/growth history;
- field-level migration/rollback coverage for all v2.2 persistent stores;
- schema migration CI;
- investigation bundle export;
- broader Safe Actions 2.0/Vault Health UX;
- final navigation normalization and release-candidate validation.
