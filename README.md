# Sentinel 2.4 — Local macOS System Intelligence

Sentinel is a local-first macOS evidence and system-intelligence application. It observes current state, connects related evidence, compares change over time, verifies exact objects, measures storage pressure, and exposes deliberately bounded reversible actions.

The current product has one frontend architecture and one investigation model:

```text
Sentinel.app
  └─ AppKit launcher
      └─ architecture-matched Go engine
          ├─ binds 127.0.0.1 on a random port
          ├─ issues an in-memory session token
          ├─ serves the Sentinel application frontend
          └─ exposes authenticated local APIs

Sentinel application frontend
  ├─ web/index.html
  └─ web/app/
      ├─ core.js
      ├─ lenses/
      │   ├─ orient-investigate.js
      │   ├─ compare.js
      │   ├─ system.js
      │   └─ act-limits.js
      ├─ advanced.js
      ├─ case-stories.js
      ├─ system-evidence.js
      ├─ workbench.js
      ├─ runtime.js
      ├─ shell.css
      ├─ advanced.css
      └─ workbench.css
```

The same product source opens in the default browser or Sentinel's native WKWebView App View. There is no separate legacy dashboard, desktop-only DOM rewrite layer, or monolithic frontend controller in the normal startup path.

## Product model

Sentinel organizes work by intent rather than by a wall of diagnostic modules:

- **Orient** — current state and a bounded review snapshot.
- **Investigate** — cases, search, relationships, audit, exact-object verification, and Workbench investigation context.
- **Compare** — change stream, system checkpoints, behavior differences, and approved-reference drift.
- **System** — machine, processes, auto-start, persistence, background registrations, network, and storage.
- **Act** — reclaim review, Safe Change simulation, reversible mutation, and recovery context.
- **Limits** — visibility boundaries, completeness, permissions, capabilities, and evidence semantics.

A result is evidence, not a verdict. Priority and attention scores rank review work; they are not malware probabilities. A signature, Gatekeeper result, relationship edge, network endpoint, reference match, or observed change must be interpreted in context.

## Investigation Workbench — 30 integrated improvements

`web/app/workbench.js` is part of the canonical product startup path. It enhances existing Sentinel lenses instead of creating another dashboard. The integrated capability set is:

1. Interactive Evidence Graph 3.0
2. Process Story 2.0
3. Unified Investigation Workspace
4. Timeline 3.0
5. Network Intelligence 2.0
6. Launch & Persistence Drift
7. System Checkpoint 2.0
8. Storage Intelligence 2.0
9. Case Stories 3.0
10. Object Story 3.0
11. Permission & Visibility Assistant
12. Evidence Completeness Meter
13. Explain This
14. Smart Next Step
15. Cross-Lens Selection
16. Compare Any Two Objects
17. Reference Profiles 2.0
18. Safe Change Simulation
19. Recovery Center 2.0
20. Evidence Bundle
21. Local Evidence Assistant
22. Natural-language Command Bar
23. Saved Queries
24. Watch Rules
25. Visual Relationship Matrix
26. Change Evidence Flow
27. Historical Heatmaps
28. Workspace Persistence
29. Keyboard Workflow
30. Product Onboarding

These features reuse real Sentinel APIs wherever evidence is required. Workbench-only metadata such as notes, hypotheses, bookmarks, saved queries, checkpoint display names/pins, watch definitions, and local launch-baseline labels are explicitly separate from engine-observed evidence.

The Local Evidence Assistant currently uses deterministic local evidence routing: it reads explicit Sentinel APIs, separates Observed / Derived / Unknown / Next, does not use a cloud model, and does not invent missing observations. Watch Rules compare bounded API signatures while Sentinel is open; they do not pretend to be an entitlement-backed Endpoint Security sensor.

## Core capabilities retained

The Workbench is additive. Existing hardened functionality remains available, including:

- system overview and readiness;
- Quick Check and unified review queue;
- Incident / Case correlation and Case JSON export;
- evidence search and bounded deep filename/path search;
- Evidence Graph 2.0, grouped/global timelines, and Object Story 2.0 backend evidence;
- security audit and exact-path integrity inspection;
- current process, startup, persistence, background, and TCP evidence;
- explicit Network History snapshots and comparison;
- Change Monitor with native FSEvents where available and polling fallback;
- retained System Checkpoints and structured differences;
- Behavior history and Trusted Profile compare/history/restore;
- Storage Intelligence with cancellable traversal, history, aging, SHA-256 exact duplicates, and separate filename-family heuristics;
- Cleanup Preview without automatic deletion;
- reversible Safe Actions with server preview, typed confirmation, one-time code, revalidation, Vault recovery metadata, and action journal;
- visibility/capability reporting so missing evidence remains explicit.

## Safety boundaries

Sentinel deliberately separates observation from mutation.

- The HTTP service binds to `127.0.0.1` only.
- API requests require the current session token and retain Host / Origin / Fetch-Metadata protections.
- Sentinel has no permanent-delete API.
- Safe Change Simulation stops at server preview and never submits the execution confirmation.
- Safe Actions remain limited to explicitly supported operations and do not overwrite an existing destination.
- Mutating Safe Actions are disabled in `--ephemeral` mode.
- Vaulting a file does not claim software is malicious or that an already-running process stopped.
- Missing visibility lowers confidence; it never becomes invented evidence.
- Optional Endpoint Security visibility remains entitlement-, packaging-, approval-, and permission-dependent.

## Build the macOS app

On a Mac with current Xcode command-line tools:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

For a clean reinstall into `/Applications` while preserving Sentinel user state:

```bash
./reinstall-macos.sh
```

The desktop builder validates the canonical 10-script / 3-style application chain, the Workbench capability marker, and embedded Workbench evidence in both Apple Silicon and Intel Go engines. `Info.plist` records:

```text
SentinelDesktopUI = 2.4 Native Frontend
SentinelWorkbench = 30-function Investigation Workbench
```

The reinstall helper refuses a bundle that does not contain both identities.

## Development engine

```bash
./RUN_SENTINEL.command
```

For an intentionally isolated session:

```bash
./dist/sentinel-macos-arm64 --ephemeral
```

Use the architecture-appropriate binary on Intel Macs. Ephemeral mode intentionally disables persistent recovery-dependent mutation.

## Validation

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

CI additionally checks:

- product and Workbench contracts;
- Darwin arm64 and x86_64 engine builds;
- actual `Sentinel.app` desktop packaging;
- Workbench marker embedding in both engines;
- Go race behavior and `go vet`;
- every canonical product JavaScript module including `workbench.js`;
- auxiliary JavaScript and shell syntax;
- retired dashboard/controller paths remain absent.

## Distribution

For the current Beta flow, see `DIRECT_DISTRIBUTION_GUIDE.md` and `DESKTOP_ARCHITECTURE.md`.

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

With `VERSION=2.4.0`, expected Beta artifacts are:

```text
dist/Sentinel-2.4.0-beta.dmg
dist/Sentinel-2.4.0-beta.dmg.sha256
```

A production distribution can use Developer ID signing, Hardened Runtime, Apple notarization, and a stapled DMG through `release-direct-macos.sh`.

## Repository layout

```text
web/index.html              canonical product document
web/app/                    modular default Sentinel application + Workbench
web/aux-*                   shared auxiliary-workspace foundation
web/*-center.html           retained specialist workspaces

desktop/                    native AppKit/WKWebView launcher
endpointsecurity/           optional entitlement-gated sensor scaffold

docs/history/               retired architecture/planning documents
docs/releases/              historical release notes
.github/workflows/ci.yml    current validation pipeline
```

Important runtime files:

- `main.go` — localhost server, API routing, authentication, and direct product serving.
- `web/app/core.js` — authenticated API client, state, intent/lens model, and evidence primitives.
- `web/app/lenses/*` — base domain lenses.
- `web/app/advanced.js` — Graph/Timeline, checkpoints, storage history/aging, recovery, and advanced evidence visualization.
- `web/app/case-stories.js` — stable Story / Episode / Explain Why Case model.
- `web/app/system-evidence.js` — Network History and Launch relationship depth.
- `web/app/workbench.js` — 30-function cross-lens investigation layer.
- `web/app/runtime.js` — navigation, delegation, global search/export, and bootstrap.
- `web/app/shell.css`, `advanced.css`, `workbench.css` — canonical visual layers.
- `desktop/SentinelDesktop.swift` — native launcher and WKWebView container.
- `build-desktop-macos.sh` — Universal macOS app build and Workbench validation.
- `reinstall-macos.sh` — clean rebuild/reinstall and identity verification.

Standalone deep workspaces are auxiliary surfaces, not a second product architecture. Historical release/schema names are preserved only where they describe actual backward-compatible data formats.

## License

Sentinel source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See `LICENSE` and `OPEN_SOURCE_LICENSE_GUIDE.md`. Project-owned source files use `SPDX-License-Identifier: MPL-2.0` notices where applicable.
