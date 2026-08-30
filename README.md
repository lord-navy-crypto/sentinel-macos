# Sentinel 2.4 — Local macOS System Intelligence

Sentinel is a local-first macOS evidence and system-intelligence application. It observes current system state, correlates related evidence, compares change over time, verifies individual objects, measures storage pressure, and exposes a deliberately bounded reversible-response path.

The current product has one frontend architecture:

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
      ├─ runtime.js
      ├─ shell.css
      └─ README.md
```

The same product source opens in the default browser or inside Sentinel's native WKWebView App View. There is no separate legacy dashboard, desktop-only DOM rewrite layer, or monolithic frontend controller in the normal startup path.

## Product model

Sentinel organizes work by intent rather than by a wall of diagnostic modules:

- **Orient** — current state and a bounded review snapshot.
- **Investigate** — cases, search, relationships, audit, and exact-object verification.
- **Compare** — change stream, behavior differences, and approved-reference drift.
- **System** — machine, processes, auto-start, persistence, background registrations, network, and storage.
- **Act** — reclaim review and reversible Safe Change.
- **Limits** — visibility boundaries and evidence semantics.

A result is evidence, not a verdict. Priority and attention scores rank review work; they are not malware probabilities. A signature, Gatekeeper result, relationship edge, network endpoint, reference match, or observed change must be interpreted in context.

## Core capabilities

Sentinel retains the hardened Go evidence engine while using a single current product UI. Current capabilities include:

- system overview and readiness checks;
- Quick Check and unified review queue;
- Incident / Case correlation;
- evidence search and bounded deep filename search;
- Evidence Graph and Object Story correlation;
- security audit and exact-path integrity inspection;
- current process, startup, persistence, background, and TCP evidence;
- Change Monitor with native FSEvents where available and a polling fallback;
- Behavior history and Trusted Profile comparison;
- Storage Intelligence with cancellable traversal, large-file measurement, SHA-256 exact-duplicate confirmation, and separate filename-family heuristics;
- Cleanup Preview without automatic deletion;
- reversible Safe Actions with preview, typed confirmation, one-time code, server-side revalidation, Vault recovery metadata, and an action journal;
- visibility/capability reporting so missing evidence is explicit rather than guessed.

## Safety boundaries

Sentinel deliberately separates observation from mutation.

- The HTTP service binds to `127.0.0.1` only.
- API requests require the current session token and retain Host / Origin / Fetch-Metadata protections.
- Sentinel has no permanent-delete API.
- Safe Actions are limited to explicitly supported reversible operations and do not overwrite an existing destination.
- Mutating Safe Actions are disabled in `--ephemeral` mode.
- Vaulting a file does not claim that software is malicious or that an already-running process has stopped.
- Optional advanced/Endpoint Security visibility remains entitlement- and permission-dependent; unavailable visibility is reported as unavailable.

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

The desktop build produces a Universal launcher and embeds separate Go engines for Apple Silicon and Intel. The build verifies that the Sentinel frontend marker is present in both engine binaries.

## Development engine

```bash
./RUN_SENTINEL.command
```

For an isolated read-only/no-persistent-state session:

```bash
./dist/sentinel-macos-arm64 --ephemeral
```

Use the architecture-appropriate binary on Intel Macs.

## Validation

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

CI additionally checks Go race behavior, `go vet`, every canonical application JavaScript module, auxiliary JavaScript, shell syntax, macOS architecture build smoke tests, and product contracts that prevent retired dashboard paths or the removed monolithic controller from returning.

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
web/*-center.html           retained deep workspaces with unique capabilities

desktop/                    native AppKit/WKWebView launcher
endpointsecurity/           optional advanced-sensor source scaffold

docs/history/               retired architecture/planning documents
docs/releases/              historical release notes
.github/workflows/ci.yml    current validation pipeline
```

Important runtime files:

- `main.go` — localhost server, API routing, authentication, and direct product serving.
- `web/app/core.js` — authenticated local API client, state, intent/lens model, and shared evidence primitives.
- `web/app/lenses/orient-investigate.js` — current state, snapshot, case, search, relation, audit, and object evidence.
- `web/app/lenses/compare.js` — change, behavior, and reference comparison.
- `web/app/lenses/system.js` — machine, process, startup, persistence, background, network, and storage evidence.
- `web/app/lenses/act-limits.js` — reclaim review, reversible Safe Change, visibility, and evidence-model guidance.
- `web/app/runtime.js` — navigation, event delegation, global search/export, and bootstrap.
- `web/app/shell.css` — current visual system.
- `desktop/SentinelDesktop.swift` — native launcher and WKWebView container.
- `build-desktop-macos.sh` — Universal macOS app build.
- `reinstall-macos.sh` — clean rebuild/reinstall helper.

Standalone deep workspaces are auxiliary surfaces, not a second product architecture. Historical release/schema names are preserved only where they describe actual backward-compatibility data formats.

## License

Sentinel source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See `LICENSE` and `OPEN_SOURCE_LICENSE_GUIDE.md`. Project-owned source files use `SPDX-License-Identifier: MPL-2.0` notices where applicable.
