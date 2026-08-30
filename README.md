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
      ├─ shell.css
      ├─ controller.js
      └─ README.md
```

The same product source opens in the default browser or inside Sentinel's native WKWebView App View. There is no separate legacy dashboard in the normal startup path and no desktop-only DOM rewrite layer.

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

You can also run the local engine directly during development:

```bash
./RUN_SENTINEL.command
```

For an isolated read-only/no-persistent-state session:

```bash
./dist/sentinel-macos-arm64 --ephemeral
```

Use the architecture-appropriate binary on Intel Macs.

## Validation

Run the repository test suite before packaging:

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

CI additionally checks Go race behavior, `go vet`, JavaScript syntax, shell syntax, macOS architecture build smoke tests, and product contracts that prevent retired dashboard paths from returning to the default frontend.

## Distribution

For the current Beta flow, see `DIRECT_DISTRIBUTION_GUIDE.md` and `DESKTOP_ARCHITECTURE.md`.

Typical unsigned/unnotarized Beta packaging:

```bash
SENTINEL_RELEASE_CHANNEL=beta ./package-dev-dmg-macos.sh
```

With `VERSION=2.4.0`, the expected Beta artifacts are:

```text
dist/Sentinel-2.4.0-beta.dmg
dist/Sentinel-2.4.0-beta.dmg.sha256
```

A future production distribution can use Developer ID signing, Hardened Runtime, Apple notarization, and a stapled DMG through `release-direct-macos.sh`.

## Repository layout

Current structure:

```text
web/index.html              product document
web/app/                    default Sentinel application runtime
web/aux-*                   shared auxiliary-workspace foundation
web/*-center.html           retained deep workspaces while unique capabilities migrate

desktop/                    native AppKit/WKWebView launcher
endpointsecurity/            optional advanced-sensor source scaffold

docs/history/               retired architecture/planning documents
docs/releases/              historical release notes
.github/workflows/ci.yml    current validation pipeline
```

Important runtime files:

- `main.go` — localhost server, API routing, authentication, and direct product serving.
- `web/index.html` — minimal application document.
- `web/app/shell.css` — current product visual system.
- `web/app/controller.js` — current product controller while lens code is split into domain modules.
- `desktop/SentinelDesktop.swift` — native launcher and WKWebView container.
- `build-desktop-macos.sh` — Universal macOS app build.
- `reinstall-macos.sh` — local clean rebuild/reinstall helper.

Standalone deep workspaces are auxiliary surfaces, not a second product architecture. Their unique capabilities should migrate inward; duplicated shells should be deleted rather than reintroduced into the main document.

## License

Sentinel source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See `LICENSE` and `OPEN_SOURCE_LICENSE_GUIDE.md`. Project-owned source files use `SPDX-License-Identifier: MPL-2.0` notices where applicable.
