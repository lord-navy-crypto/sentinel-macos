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
      ├─ full-scan.js
      ├─ runtime.js
      ├─ shell.css
      ├─ advanced.css
      ├─ workbench.css
      └─ full-scan.css
```

The same product source opens in the default browser or Sentinel's native WKWebView App View. There is no separate legacy dashboard, desktop-only DOM rewrite layer, or monolithic frontend controller in the normal startup path.

## Product model and visual Capability Atlas

Sentinel organizes work by intent rather than by a wall of diagnostic modules. **Status → Complete Capability Atlas** renders the whole product as six visual groups:

- **Orient** — Status, Easy Scan, Full Scan, Evidence Completeness, Product Onboarding.
- **Investigate** — Cases, Search, Graph/Timeline, Audit, Object Story, Explain This, Smart Next Step.
- **Compare** — Change Flow, System Checkpoints, Behavior, Reference, A/B comparison, historical heatmaps.
- **System** — Machine, Processes, Auto-start, Persistence, Background, Network, Storage and forecast.
- **Act** — Reclaim, Safe Change, Simulation, Recovery and Evidence Bundle.
- **Limits** — Visibility, Local Evidence Assistant, command routing, Watch Rules, workspace/selection/keyboard tools.

Every Capability Atlas tile opens the corresponding canonical Lens or Workbench surface. See `docs/CAPABILITY_ATLAS.md` for the complete tree and data flow.

A result is evidence, not a verdict. Priority and attention scores rank review work; they are not malware probabilities. A signature, Gatekeeper result, relationship edge, network endpoint, reference match, or observed change must be interpreted in context.

## Scan Center — Easy Scan + Full Scan

The Status view now presents two scan paths side by side.

### Easy Scan

Easy Scan is the fast, read-only current-state path. It reads Quick Check and the review queue without rewriting Behavior, Trust, Persistence, or user files.

### Full Scan

Full Scan is the comprehensive retained-baseline path. One explicit run orchestrates the existing real Sentinel evidence engine:

```text
Visibility / capabilities
→ current system + process + launch + network
→ security audit
→ monitoring / Behavior / Persistence capture
→ Graph + Timeline
→ Case correlation
→ System Checkpoint
→ Network History
→ deep Home storage traversal + hash analysis
→ Storage History
→ Recovery / Safe Action health / readiness
→ final review + retained analysis refresh
```

The deep-storage stage uses the existing cancellable job pipeline and reports real files/folders visited, hash progress, skipped slow paths, and bounded errors. Full Scan does not call Safe Action execution and does not permanently delete user data.

After Full Scan, normal Lenses can reuse retained System, Network, Storage, Behavior/Persistence, Case, and intelligence evidence. This reduces unnecessary repeated acquisition, but it does **not** mean one scan is eternally current. The Status Scan Center displays retained capture age/freshness; re-run when you want newer evidence, the Mac materially changes, or continuity reports that a rescan is required.

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

## Core capabilities retained and upgraded

The Workbench and Scan Center are additive. Existing hardened functionality remains available and is now easier to locate through the Capability Atlas:

- system overview and readiness;
- Quick Check / Easy Scan and unified review queue;
- Full Scan retained-baseline orchestration;
- Incident / Case correlation and Case JSON export;
- evidence search and bounded deep filename/path search;
- Evidence Graph 2.0 backend + Graph 3.0 interaction layer;
- grouped/global timelines + Timeline 3.0 controls/heatmaps;
- Object Story 2.0 backend + Object Story 3.0 workflow;
- security audit and exact-path integrity inspection;
- current process, startup, persistence, background, and TCP evidence;
- Process Story and Launch/Persistence evolution views;
- explicit Network History snapshots, evolution, and comparison;
- Change Monitor with native FSEvents where available and polling fallback;
- retained System Checkpoints and structured differences;
- Behavior history and Trusted Profile compare/history/restore;
- Storage Intelligence with cancellable traversal, history, aging, forecast, SHA-256 exact duplicates, and separate filename-family heuristics;
- Cleanup Preview without automatic deletion;
- Safe Change Simulation plus reversible Safe Actions with server preview, typed confirmation, one-time code, revalidation, Vault recovery metadata, and action journal;
- visibility/capability reporting and Evidence Completeness so missing evidence remains explicit.

## Safety boundaries

Sentinel deliberately separates observation from mutation.

- The HTTP service binds to `127.0.0.1` only.
- API requests require the current session token and retain Host / Origin / Fetch-Metadata protections.
- Sentinel has no permanent-delete API.
- Full Scan acquires/retains evidence and comparison state; it does not execute Safe Actions.
- Safe Change Simulation stops at server preview and never submits the execution confirmation.
- Safe Actions remain limited to explicitly supported operations and do not overwrite an existing destination.
- Mutating Safe Actions are disabled in `--ephemeral` mode.
- Vaulting a file does not claim software is malicious or that an already-running process stopped.
- Missing visibility lowers confidence; it never becomes invented evidence.
- A retained Full Scan baseline is not continuous surveillance or a permanent safety certificate.
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

The desktop builder validates the canonical **11-script / 4-style** application chain, Workbench and Full Scan capability markers, and embedded product evidence in both Apple Silicon and Intel Go engines. `Info.plist` records:

```text
SentinelDesktopUI = 2.4 Native Frontend
SentinelWorkbench = 30-function Investigation Workbench
SentinelScanCenter = Easy Scan + Full Scan + Capability Atlas
```

The reinstall helper refuses a bundle that does not contain all three identities.

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

- product, Workbench, Full Scan, Capability Atlas, and visual contracts;
- Darwin arm64 and x86_64 engine builds;
- actual `Sentinel.app` desktop packaging;
- Workbench and Full Scan markers embedded in both engines;
- `SentinelScanCenter` package identity;
- Go race behavior and `go vet`;
- every canonical product JavaScript module including `workbench.js` and `full-scan.js`;
- old `scan-center.js/css` names remain physically absent from the current product;
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
web/app/                    modular default Sentinel application
web/aux-*                   shared auxiliary-workspace foundation
web/*-center.html           retained specialist workspaces

desktop/                    native AppKit/WKWebView launcher
endpointsecurity/           optional entitlement-gated sensor scaffold

docs/CAPABILITY_ATLAS.md    current visual product/function map
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
- `web/app/full-scan.js` — Easy/Full Scan orchestration, retained freshness, and Capability Atlas.
- `web/app/runtime.js` — navigation, delegation, global search/export, and bootstrap.
- `web/app/shell.css`, `advanced.css`, `workbench.css`, `full-scan.css` — canonical visual layers.
- `desktop/SentinelDesktop.swift` — native launcher and WKWebView container.
- `build-desktop-macos.sh` — Universal macOS app build and product identity validation.
- `reinstall-macos.sh` — clean rebuild/reinstall and identity verification.

Standalone deep workspaces are auxiliary surfaces, not a second product architecture. Historical release/schema names are preserved only where they describe actual backward-compatible data formats. Historical `scan-center.js/css` runtime names are retired; current Scan Center behavior lives in `full-scan.js/css`.

## License

Sentinel source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See `LICENSE` and `OPEN_SOURCE_LICENSE_GUIDE.md`. Project-owned source files use `SPDX-License-Identifier: MPL-2.0` notices where applicable.
