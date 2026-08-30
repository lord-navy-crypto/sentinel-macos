# V2.4

- Rebuilt the visible Sentinel interface around the V5 Evidence Notebook model instead of the legacy dashboard/card hierarchy.
- Made the V5 UI the default for normal Browser and native App View entry points; the old dashboard is now only an explicit `?legacy=1` diagnostic fallback.
- Added build-time verification that both arm64 and x86_64 engines physically embed the V5 desktop UI resources.
- Added source commit and UI-generation metadata to the packaged macOS app for reproducible local builds.
- Added deterministic fresh-launch and clean reinstall workflows to prevent macOS from reusing an older Sentinel instance or app bundle.
- Unified product versioning so the root `VERSION` file is the single source of truth for the Go engine and macOS bundle.
- Bumped the product version to 2.4.0.

# V2.1

- Final Readiness self-check.
- Single persistent-writer runtime lock and graceful shutdown.
- Durable atomic private state writes with last-known-good backup recovery.
- Strict bounded JSON request parsing and heavy-work backpressure.
- Time-windowed Incident correlation, stable story merging, lifecycle state, and Deep Review.
- Vault footprint advisories.
- Versioned exports and dynamic app-bundle versioning.

# V2.0

- Incident Intelligence, compressed Change/Incident history, native FSEvents checkpoint/resume, hierarchy reconciliation, Security.framework validation bridge, Finder-friendly app packaging, and an explicitly disabled Endpoint Security/System Extension scaffold.

# v1.2

- Added Change Monitor with native-FSEvents source path and bounded polling fallback.
- Added conservative rescan-required handling, targeted review, Search/Review Queue/Timeline integration, custom-root containment, and change-monitor diagnostics.
- Added `CHANGE_MONITOR_GUIDE.md` and `RELEASE_NOTES_v1.2.md`.

# v1.1

- Added filtered/fuzzy Power Search with query explanations.
- Added bounded Deep filename search with resolved-Home scope enforcement.
- Added Weakness Audit and Visibility Coverage.
- Added Host/Origin/Sec-Fetch-Site localhost API guards.
- Removed CSP inline-style exception by using native progress elements.
- Unified remaining inspection command timeouts.
- Added report/diagnostics visibility posture summaries.

# Changelog

## v1.0

- Added Easy / Advanced navigation modes.
- Added read-only `GET /api/quick-check` with Attention Index and prioritized next steps.
- Added Unified Review Queue across Security, Behavior, Trust, Persistence, and Safe Actions health.
- Added user-confirmed `POST /api/guided-snapshot` for one-step Evidence + Behavior + Persistence capture and optional Trust comparison.
- Added bounded `GET /api/search` Universal Search plus Command-K / Control-K UI shortcut.
- Added page-level “What is this?” explanations that state both meaning and non-conclusions.
- Added common Storage scan presets.
- Preserved v0.9 Safe Actions no-permanent-delete, no-overwrite, recovery, and revalidation boundaries.

## v0.9
- Added Safe Actions & Recovery localhost page.
- Added dependency-aware same-directory Rename, Sentinel Vault, Restore, and Reveal in Finder.
- Intentionally did **not** add permanent deletion or process termination.
- Added five-minute server-side action previews with exact typed phrase, one-time code, and consequence acknowledgement.
- Added Action Guard revalidation of path scope, size, modification time, mode, and bounded SHA-256.
- Added no-clobber regular-file move semantics so Rename/Vault/Restore never replace an existing destination.
- Added rejection of directories, symlinks, symlink-parent traversal, credential stores, Sentinel state, and paths outside HOME.
- Added random-ID Sentinel Vault with `0600` stored objects and recovery manifests.
- Added Restore conflict refusal, parent-directory validation, permission restoration, and rollback attempt on manifest-update failure.
- Added bounded 200-entry Operation Journal, Rename/Vault undo previews, post-action observation, and Action Recovery Health.
- Added Safe Action handoff from large-file Storage results, Cleanup Preview, and Object Story.
- Added Safe Actions/Vault/Journal to full report export and low-sensitivity action health/counts to diagnostics.
- Added `SAFE_ACTIONS.md`, expanded `GUIDE.md`, and security-focused code comments.
- `--ephemeral` keeps analysis memory-only and now disables mutating Safe Actions because recovery metadata cannot persist.

## v0.8
- Added Integrity Lab and running-Sentinel self-integrity.
- Added bounded file SHA-256, file type, architectures, quarantine/origin metadata, and richer Gatekeeper context.
- Added LaunchAgent/LaunchDaemon manifest explanations.
- Added session-only Persistence Configuration Integrity using plist SHA-256 baselines.
- Added Guide & Permissions UI, GUIDE.md, and AUTHORITATIVE_ROADMAP.md.
- Added persistence/self-integrity data to full report export.
- Kept destructive actions disabled.

## v0.7
- Added explicit user-approved Trusted Profile.
- Added bounded SHA-256 executable/script fingerprints for priority objects.
- Added Trust Drift Index and Profile Coverage.
- Added bounded 20-entry Trust Drift History.
- Added novel-object, fingerprint, Team ID, Identifier, persistence, startup-target, metadata, and parent-context drift evidence.
- Added Trusted Profile context to Object Story and trust-reference labels to Security Audit.
- Added one-step previous-profile backup and explicit restore.
- Added Trust Profile integrity/permission health checks.
- Added `--doctor` and low-sensitivity diagnostics export.
- Integrated Trust Drift events into the session timeline.
- Re-apply 0700 to Sentinel state directory on state writes.
- Build script now generates SHA256SUMS.txt; runner forwards args and rejects unknown Mac architectures.
- Maintains read-only system policy and `--ephemeral` zero-persistence mode.

## v0.6

- Added bounded cross-session Behavior History (maximum 40 captures).
- Added transparent Evidence Pressure Index, risk band, and capture-to-capture delta.
- Added localhost trend visualization and recent history summary.
- Added cross-session object history to Object Story.
- Added Baseline Health checks for 0700/0600 permissions and JSON integrity.
- Added `/api/behavior/history` and `/api/behavior/health`.
- Added Behavior History and Baseline Health to exported reports.
- Added tests for history retention, object filtering, permissions, cross-session loading, and ephemeral zero-write behavior.
- Remains local-only, bounded, and non-destructive.

## v0.5

### Added
- Behavior Diff Engine with compact cross-session local baseline.
- Detection for code identity changes, executable metadata changes, startup target changes, startup/background additions and removals, persistence relationship changes, new public endpoints, and parent launch-context changes.
- Behavior Diff localhost page with High / Review / Info severity grouping and links into Object Story.
- App-owned persistent baseline at `~/Library/Application Support/Sentinel/behavior-baseline.json` with user-only file permissions.
- Behavior status included in exported local reports.
- Safe CLI flags: `--version`, `--no-browser`, `--port`, and privacy-focused `--ephemeral`.
- Tests for behavior correlation, identity-availability edge cases, parent context, and set-diff logic.

### Changed
- Behavior identity collection is bounded and prioritizes persistent, network-active, user/temp, and reviewable targets instead of inspecting every system process.
- New public endpoint output is bounded per object to reduce normal-network noise.
- Timeline can receive Behavior Diff events while still remaining non-daemon and local.
- UI and security disclaimers updated for v0.5.

### Safety / privacy
- No delete, kill, quarantine, disable-startup, or daemon action was added.
- Persistent behavior state excludes file contents and complete process command lines.
- Baseline directory/file permissions are restricted to the current user.
- `--ephemeral` provides a memory-only Behavior Diff mode with no baseline disk persistence.
- Behavior changes remain evidence for review, not malware verdicts.

## v0.4

### Added
- macOS Code Identity model using native `codesign` evidence.
- Identifier, Team ID, signing-authority chain, and enclosing `.app` bundle detection.
- Gatekeeper assessment context using native `spctl`.
- Bounded parent-process lineage in Process Evidence and Object Story.
- TCP endpoint parsing into local/remote endpoints and listener/loopback/private/public classes.
- Read-only modern Login & Background Items snapshot using `sfltool dumpbtm` when available.
- Terminal Evidence Sources panel showing which native commands are available and what they are used for.
- Background Task Management data in exported local reports.
- Tests for app-bundle resolution, endpoint classification, and background-item parsing.

### Changed
- Process Detail now contains Code Identity, parent chain, trust context, and structured network context.
- Object Story now includes code identity, Gatekeeper context, process lineage, and network class information.
- Security and cleanup disclaimers updated for v0.4.
- UI expanded with Login & Background page and Terminal Transparency panel.

### Safety
- Remains read-only with respect to user/system content.
- No delete, kill, quarantine, disable-startup, or background-daemon action was added.
- Public network traffic and unsigned code are treated as context, not automatic malware verdicts.

## v0.3
- Added Evidence Graph, current-session Activity Timeline, and Object Story correlation.
- Linked startup configuration, files/scripts, processes, TCP activity, duplicate groups, and version families.
- Added graph/timeline/object-story automated tests and local report correlation data.

## v0.2
- Added cancellable background storage scans, file categories, exact SHA-256 duplicate detection, process detail, and JSON report export.

## v0.1
- Initial localhost-only read-only macOS system/security auditor prototype.
