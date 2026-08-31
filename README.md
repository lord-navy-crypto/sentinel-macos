# Sentinel 2.6 — Local macOS System Intelligence

Sentinel is a local-first macOS evidence and system-intelligence application. It observes current state, connects related evidence, compares change over time, verifies exact objects, measures storage pressure, and exposes deliberately bounded reversible actions.

Sentinel is designed around one rule: **evidence is not a verdict**. Attention, Risk, Confidence, Drift, a public endpoint, a startup item, or a changed fingerprint can help prioritize investigation, but none of those values is a malware probability by itself.

## Current architecture

```text
Sentinel.app
  └─ Universal AppKit launcher
      └─ architecture-matched Go engine
          ├─ binds 127.0.0.1 on a random port
          ├─ issues an in-memory session token
          ├─ serves the canonical Sentinel 2.6 frontend
          └─ exposes authenticated local APIs

Canonical frontend
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
  ├─ action-dock.js
  ├─ ai.js
  ├─ ai-reliability.js
  ├─ manual.js
  ├─ manual-entry.js
  └─ runtime.js
```

The same product source opens in the default browser or Sentinel's native WKWebView App View. Both containers use the same token-authenticated localhost engine and evidence session.

The product shell intentionally uses same-origin external scripts. Sentinel keeps a strict Content Security Policy rather than enabling `unsafe-inline` for application code.

## Product model

Sentinel groups functions by investigation intent.

- **Orient** — Status, Easy Scan, Full Scan, Evidence Completeness, onboarding.
- **Investigate** — Cases, Search, Graph/Timeline, Audit, Object Story, Explain This, Smart Next Step.
- **Compare** — Change Flow, System Checkpoints, Behavior, Reference, A/B comparison, historical heatmaps.
- **System** — Machine, Processes, Auto-start, Persistence, Background, Network, Storage, forecast.
- **Act** — Reclaim Review, Safe Change, Simulation, Recovery, Evidence Bundle.
- **Limits** — Visibility, Local AI, deterministic evidence fallback, command routing, Watch Rules, workspace tools.

## Easy Scan and Full Scan

### Easy Scan

Easy Scan is the fast read-only current-state path. It reads Quick Check and the review queue without silently establishing or rewriting persistent Behavior, Reference/Trust, Persistence, or user-file state.

### Full Scan

Full Scan is the explicit retained-baseline path. A run orchestrates the real Sentinel evidence engine:

```text
Visibility / capabilities
→ current system + process + launch + background + network
→ security audit / Quick Check
→ monitoring / Behavior / Persistence capture
→ Graph + Timeline
→ Case correlation
→ System Checkpoint
→ Network History
→ cancellable Home storage traversal + hash analysis
→ Storage History
→ Recovery / Safe Action readiness
→ final review + retained analysis refresh
```

The deep-storage stage reports real files/folders visited, hash progress, skipped slow paths, and bounded errors. Full Scan never executes Safe Actions and never permanently deletes user data.

Cancelling Full Scan stops the active bounded work where supported. Evidence already captured by completed stages may remain retained; cancellation is not presented as a successful complete scan.

## Investigation Workbench

The canonical Workbench integrates the major investigation workflows into the same product rather than creating a second dashboard. Current capabilities include:

- Evidence Graph 3.0 and Timeline 3.0;
- Process Story and Object Story;
- Unified Investigation Workspace;
- Network Intelligence and Launch/Persistence drift;
- System Checkpoints and Storage Intelligence;
- Case Stories;
- Permission / Visibility assistance;
- Evidence Completeness;
- Explain This and Smart Next Step;
- Cross-Lens Selection;
- Compare Any Two Objects;
- Reference Profiles;
- Safe Change Simulation and Recovery Center;
- Evidence Bundle;
- Saved Queries and Watch Rules;
- relationship matrix, change flow, heatmaps, workspace persistence, and keyboard workflow.

Workbench metadata such as notes, hypotheses, bookmarks, saved queries, and local display labels remains separate from engine-observed evidence.

## Local AI

Sentinel 2.6 includes an opt-in local WebLLM assistant over bounded Sentinel evidence.

### Runtime

- `@mlc-ai/web-llm` 0.2.82 is vendored under `web/vendor/` and served from Sentinel's own loopback origin.
- Model weights are **not bundled**. A model is downloaded only after the user explicitly selects **Load / Download selected**.
- WebLLM uses WebGPU and a Web Worker.
- Native App View uses persistent WebKit storage so IndexedDB model artifacts can be reused across relaunches.
- Only one selected model is intended to be loaded into GPU memory at a time.

The curated model library includes small, medium, specialist, and larger models. The default is `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`; a smaller Qwen 0.5B option is available for fast compatibility/recovery testing.

### Evidence boundary

The model receives a bounded Evidence Packet assembled from Sentinel observations, selected context, retained evidence when requested, and relevant Manual excerpts. It does not receive unrestricted shell authority.

The Local AI system prompt requires separation of **Observed / Interpretation / Unknown / Next Step** and forbids converting Attention, Risk, Confidence, Drift, novelty, missing evidence, startup presence, or public network access into malware probability.

### Reliability layer

`ai-reliability.js` is a same-origin canonical module loaded after `ai.js`. It provides:

- prerequisite diagnostics for WebGPU, Worker, IndexedDB, selected/loaded model, engine/worker state, phase, progress, and last error;
- fail-visible worker bootstrap handling;
- progress-stall and absolute model-initialization watchdogs;
- bounded engine cleanup so a failed unload cannot trap the UI indefinitely;
- generation-stall detection with WebLLM interruption when available;
- a deterministic **evidence-only fallback** when no model is ready.

The evidence-only fallback is not a second competing Assistant. It is the bounded non-model fallback behind the same investigation workflow.

## System evidence

Sentinel exposes bounded evidence for:

- machine profile and runtime architecture;
- current processes and process stories;
- Login/Launch configuration and persistence change;
- Background Task Management registrations where macOS exposes them;
- current TCP relationships and retained Network History;
- security audit and exact-path integrity/signing/Gatekeeper context;
- Change Monitor with native FSEvents where available and polling fallback;
- Behavior history and user-approved Reference/Trust Profile comparison;
- System Checkpoints;
- Evidence Graph, timelines, and Cases;
- Storage traversal, aging/history/forecast, SHA-256 exact duplicates, and separate filename-family heuristics.

Missing permissions or unavailable native sources reduce visibility. Sentinel does not convert missing evidence into proof of absence.

## Safe Change and Recovery

Sentinel deliberately separates observation from mutation.

Supported actions are intentionally narrow:

- Reveal in Finder — non-mutating;
- same-directory Rename — no overwrite;
- Move a regular user file to Sentinel Vault;
- Restore a Vault object to its recorded path when the destination is free.

Mutation follows:

```text
Inspect
→ Dependency Guard
→ server Preview
→ exact typed phrase + one-time code + acknowledgement
→ object revalidation
→ reversible action
→ post-action observation
→ Journal / Recovery
```

Sentinel has no permanent-delete API. It refuses unsupported directories/app bundles, symlinks and special files, arbitrary destinations, paths outside the current user's HOME, Sentinel state/active executable targets, and mutating Safe Actions in `--ephemeral` mode.

Moving a file to Vault does not prove it is malicious and does not claim an already-running process was terminated.

## Local security boundaries

- HTTP binds to `127.0.0.1` only.
- API calls require the current in-memory session token.
- Host, Origin, and Fetch-Metadata checks protect the local API surface.
- The frontend uses a restrictive CSP; product code remains same-origin.
- Local AI executable runtime code is vendored rather than imported from a cross-origin JavaScript CDN.
- Model network access is bounded to the model/runtime asset hosts required by the selected WebLLM configuration.
- Full Scan acquires evidence and comparison state; it does not execute Safe Actions.
- Safe Change Simulation stops at preview.
- Missing visibility is explicit.

## Build the macOS app

On a Mac with current Xcode command-line tools:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

The desktop builder validates the complete current product chain before packaging, builds both Darwin engine architectures, builds a Universal AppKit launcher, and checks that the architecture-specific engines physically embed the current Sentinel 2.6 product markers including Local AI reliability and the Manual.

For a clean reinstall into `/Applications` while preserving Sentinel-owned history/baselines/recovery metadata:

```bash
./reinstall-macos.sh
```

The reinstall helper rebuilds from source, validates the bundle, replaces the installed app, and verifies that both installed architecture-specific engines contain the current product/AI/Manual markers.

## Development engine

```bash
./RUN_SENTINEL.command
```

For an intentionally isolated session:

```bash
./dist/sentinel-macos-arm64 --ephemeral
```

Use the architecture-appropriate binary on Intel Macs. Ephemeral mode intentionally disables recovery-dependent mutation.

## Automated validation

The main validation gate includes:

```bash
go test ./...
go test -race ./...
go vet ./...
bash SMOKE_TEST_LOCALHOST.command
```

CI additionally validates:

- product and migration contracts;
- canonical external-script order and CSP compatibility;
- Local AI runtime/reliability/fallback contracts;
- Darwin arm64 and x86_64 engine builds;
- actual Universal `Sentinel.app` packaging;
- current product markers embedded in both engine binaries;
- JavaScript syntax for canonical and auxiliary product modules;
- shell syntax for build/release/reinstall helpers.

See `TESTING.md` for the real-Mac acceptance matrix. Green CI proves the checked source/build contracts; it does not by itself prove every macOS-native evidence source on every hardware configuration.

## Distribution

Development/beta packaging:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

Production distribution can use Developer ID signing, Hardened Runtime, Apple notarization, and stapling through the release helpers. Distribution validation is separate from source correctness and must be performed on the exact candidate artifact.

## Repository layout

```text
web/index.html              canonical product document
web/app/                    modular Sentinel 2.6 application
web/vendor/                 vendored WebLLM runtime + license/provenance
web/aux-*                   shared auxiliary-workspace foundation
web/*-center.html           retained specialist workspaces

desktop/                    AppKit/WKWebView launcher
endpointsecurity/           optional entitlement-gated sensor scaffold

docs/CAPABILITY_ATLAS.md    product/function map
docs/history/               retired architecture/planning documents
docs/releases/              release notes
.github/workflows/ci.yml    validation pipeline
```

## License

Sentinel project source is licensed under the Mozilla Public License 2.0. Vendored third-party components retain their own licenses; the WebLLM runtime provenance and Apache-2.0 license are included under `web/vendor/`.
