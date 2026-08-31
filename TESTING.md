# Sentinel macOS 2.6 — Testing and Validation

Sentinel is an evidence-oriented macOS application. Validation therefore has two separate goals:

1. prove that the product is built, wired, bounded, and internally consistent; and
2. verify on a real Mac that native macOS evidence sources and user-facing workflows behave as represented.

A green automated suite is necessary, but it is not a substitute for real-Mac validation of WebGPU/WebLLM, FSEvents, Finder, Gatekeeper, Background Task Management, permissions, sleep/wake continuity, and actual filesystem behavior.

## 1. Automated release gate

Run from the repository root:

```bash
go test ./...
go test -race ./...
go vet ./...
node --check web/app/core.js
node --check web/app/lenses/orient-investigate.js
node --check web/app/lenses/compare.js
node --check web/app/lenses/system.js
node --check web/app/lenses/act-limits.js
node --check web/app/advanced.js
node --check web/app/case-stories.js
node --check web/app/system-evidence.js
node --check web/app/workbench.js
node --check web/app/full-scan.js
node --check web/app/action-dock.js
node --check web/app/ai.js
node --check web/app/ai-reliability.js
node --check web/app/ai-worker.js
node --check web/app/manual.js
node --check web/app/manual-entry.js
node --check web/app/runtime.js
bash SMOKE_TEST_LOCALHOST.command
```

On macOS also run:

```bash
./build-desktop-macos.sh
```

The GitHub Actions workflow performs the core Go suite, focused product contracts, Darwin arm64/x86_64 engine builds, actual Universal `Sentinel.app` packaging, race tests, `go vet`, JavaScript syntax checks, auxiliary-workspace checks, and shell syntax checks.

## 2. Canonical product contract

The default product must load exactly one ordered canonical application chain:

```text
core.js
→ orient-investigate.js
→ compare.js
→ system.js
→ act-limits.js
→ advanced.js
→ case-stories.js
→ system-evidence.js
→ workbench.js
→ full-scan.js
→ action-dock.js
→ ai.js
→ ai-reliability.js
→ manual.js
→ manual-entry.js
→ runtime.js
```

The shell intentionally uses external same-origin scripts. Sentinel's CSP does not enable `unsafe-inline`; adding an inline executable product script is a validation failure.

The desktop builder must verify all canonical scripts, all canonical styles, the vendored WebLLM runtime/license/provenance, and the current product markers before packaging. Both architecture-specific Go engines must physically embed the current UI, Workbench, Full Scan, Action Dock, Local AI reliability, and Manual markers.

## 3. Local AI automated contract

Automated checks must establish that:

- model loading is explicit and never starts at application launch;
- the WebLLM JavaScript runtime is vendored and served from Sentinel's own loopback origin;
- model weights are not bundled and are downloaded only after explicit user action;
- Native App View uses persistent WebKit storage so IndexedDB model cache can survive relaunch;
- WebGPU, Worker, IndexedDB, selected model, loaded model, load phase/progress, and last error are exposed in diagnostics;
- worker bootstrap errors are surfaced rather than silently swallowed;
- model initialization has a progress-stall watchdog and an absolute safety limit;
- cleanup is bounded so an unhealthy WebLLM engine cannot trap the UI in unload;
- generation stalls can request `interruptGenerate()` and are reported visibly;
- an evidence-only deterministic fallback remains available if a local model cannot load;
- the model-backed Assistant has no Safe Action execute path and no unrestricted shell authority;
- AI interpretation remains separate from Sentinel-observed evidence.

## 4. Scan Center automated contract

Easy Scan must remain a fast read-only current-state path. It must not silently establish or overwrite persistent Behavior, Reference/Trust, Persistence, or user-file state.

Full Scan must be explicitly started and orchestrate the real Sentinel evidence pipeline rather than synthetic progress. Its current stages cover:

- visibility and capability map;
- current system/process/launch/background/network state;
- security audit and Quick Check;
- monitoring / Behavior / Persistence capture;
- Evidence Graph and Timeline capture;
- Case correlation/history;
- System Checkpoint;
- Network History;
- cancellable deep Home storage traversal and hashing;
- Storage History;
- Recovery / Safe Action readiness;
- final retained analysis refresh.

A cancelled Full Scan may retain evidence from already completed stages, but must not fabricate a successful completion state.

## 5. Safe Change automated contract

Sentinel must continue to reject permanent deletion and arbitrary filesystem mutation.

The supported mutation path is deliberately bounded:

```text
inspect
→ dependency review
→ server preview
→ exact confirmation phrase + one-time code + acknowledgement
→ target revalidation
→ reversible operation
→ post-action observation
→ journal / recovery
```

Automated tests must preserve no-overwrite behavior, HOME containment, symlink and special-file rejection, Sentinel-state protection, preview expiry, recovery metadata, Vault isolation checks, and mutation disablement in `--ephemeral` mode.

## 6. Required real-Mac acceptance tests

The following cannot be declared production-validated from source tests alone.

### A. Fresh build and launch

- build a clean Universal `Sentinel.app`;
- confirm both arm64 and x86_64 engines exist in the bundle;
- launch from Finder;
- open Browser view and native App View;
- confirm both show the same local session/evidence source;
- confirm About/version reports the root `VERSION` value.

### B. Easy Scan and Full Scan

- run Easy Scan on a stable machine and inspect false-positive/noise quality;
- run Full Scan end-to-end;
- verify each stage advances from real work;
- during Storage, verify files/folders/hash counters change with actual traversal;
- cancel Full Scan during Storage and verify cancellation is visible and bounded;
- rerun Full Scan and verify retained freshness updates.

### C. System evidence ground truth

Compare Sentinel with known local state for:

- Machine identity (model/chip/architecture/memory/macOS/storage);
- several known running processes;
- known Login Items / LaunchAgents / LaunchDaemons;
- visible Background Task Management registrations;
- current TCP activity from a browser/application;
- signed Apple application, signed third-party application, and a user-created test file/script.

Any unavailable native source must appear as limited/unavailable evidence, not as proof that nothing exists.

### D. Change, Behavior, Reference, and checkpoints

Using only disposable user test files/configuration:

- establish a quiet baseline and confirm a repeat capture is low-noise;
- make one known change and confirm it appears in the appropriate comparison;
- capture System Checkpoint A and B around a known change;
- start Change Monitor, create/modify/rename/remove a disposable file, and inspect ordering;
- sleep/wake the Mac while monitoring and verify continuity or explicit rescan-required state;
- establish a Reference Profile, compare with no change, then compare after a controlled change.

### E. Storage

- compare several large-file sizes with Finder;
- duplicate a disposable file and verify SHA-256 exact-duplicate grouping;
- create similarly named files with different content and verify filename-family heuristics remain separate from exact duplicates;
- cancel a scan and verify any returned result is clearly partial/cancelled;
- verify permission errors and skipped slow paths are visible.

### F. Safe Change and Recovery

Use only disposable test files.

- Preview Rename without executing;
- enter an incorrect phrase/code and verify rejection;
- execute a correct same-directory Rename;
- attempt an overwrite and verify refusal;
- move a test file to Vault;
- verify Vault isolation state;
- Restore and verify bytes/permissions/path;
- confirm an already-running process is not falsely claimed to have stopped merely because its file was vaulted;
- run in `--ephemeral` mode and verify mutating Safe Actions are disabled.

### G. Local AI

Start with the smallest curated model before larger models.

- open Assistant and verify WebGPU / Worker / IndexedDB diagnostics;
- load a small model and observe download/cache/initialization progress;
- ask one short English and one short Chinese evidence question;
- verify streaming begins and UI remains responsive;
- ask a question Sentinel cannot prove and confirm the answer preserves `UNKNOWN` rather than inventing facts;
- test Explain with AI from Process, Network, Case, Object, Full Scan, Search, and Manual context;
- unload and reload the same model;
- relaunch Sentinel and verify cached model artifacts are reused when the browser/WebView cache permits;
- deliberately interrupt connectivity during first model load and verify a visible error/retry path;
- verify a stalled load or generation does not remain indefinitely in a spinner;
- test evidence-only fallback with no model ready;
- verify Terminal Copilot explains but does not execute commands.

### H. Long-session native behavior

- leave Sentinel running across normal application churn;
- sleep/wake;
- change networks;
- run and cancel Storage jobs;
- switch repeatedly among Lens/Workbench/Assistant surfaces;
- verify no duplicated Local AI bars/diagnostic panels appear;
- verify state/history timestamps remain honest about freshness.

### I. macOS framework/distribution behavior

On actual target Macs validate:

- CoreServices FSEvents start/stop, event-ID resume, dropped/root-changed flags, sleep/wake;
- Security.framework validation for valid, invalid, ad-hoc, unsigned, app-bundle, and Universal code;
- `codesign`, `spctl`, `sfltool`, macOS `lsof`, Finder Reveal, and Full Disk Access behavior;
- Apple Silicon runtime and, before broad Intel claims, physical Intel runtime;
- Developer ID signing, notarization, stapling, and Gatekeeper for production distribution;
- Endpoint Security/System Extension only after entitlement approval and required user authorization.

## 7. Failure report format

For each real-Mac failure, record:

```text
TEST:
BUILD / COMMIT:
BROWSER OR APP VIEW:
ACTION:
EXPECTED:
ACTUAL:
LAST VISIBLE STATUS:
ERROR / DIAGNOSTICS:
REPRODUCIBLE: always / intermittent / once
SCREENSHOT:
NOTES:
```

For Local AI also record selected model, load phase, progress text, Worker state, Engine state, and Last error. For Full Scan also record the active stage and any live Storage counters.

## 8. Release rule

Do not label a commit release-ready while the required CI workflow is red. Do not convert a green CI run into a claim that all macOS-native behavior is validated. A release candidate should have both:

- green automated validation for the exact commit; and
- a recorded real-Mac acceptance pass for the native capabilities the release claims to support.
