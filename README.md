# Sentinel macOS v2.2 — Desktop Conversion

> Normal-user target: **download one `Sentinel-2.2.dmg`, drag `Sentinel.app` to Applications, double-click.**

V2.2 preserves the V2.1 local intelligence engine and converts the product into a native-window macOS architecture: an AppKit/WKWebView shell automatically owns the lifecycle of the loopback-only Go engine. Normal users should not run `.command` files, choose CPU architecture, or see a localhost URL.

Developer ID direct distribution files:

- `desktop/SentinelDesktop.swift` — native AppKit/WKWebView shell.
- `build-desktop-macos.sh` — builds `Sentinel.app` on a real Mac.
- `package-dev-dmg-macos.sh` — unsigned local-test DMG.
- `release-direct-macos.sh` — Developer ID + Hardened Runtime + notarization + stapled DMG.
- `DIRECT_DISTRIBUTION_GUIDE.md` — exact release procedure.

---

# Sentinel macOS — V2.2 Desktop Conversion

> A local-first macOS system-intelligence, change-correlation, integrity, storage, and reversible-response platform.

**The browser is the interface; your Mac is the server.**

## Reliability inherited from V2.1

V2.1 keeps the V2.0 Incident Intelligence architecture and focuses on production-style hardening rather than feature sprawl:

- **Final Readiness**: one self-check for runtime coordination, state recovery, Vault health, change continuity, binary fingerprinting, and evidence visibility.
- **Single persistent writer**: normal mode refuses a second persistent Sentinel instance to protect local state. `--ephemeral` remains available for an isolated read-only second session.
- **Graceful shutdown**: SIGINT/SIGTERM cancels storage work, stops Change Monitor, persists the latest checkpoint, and shuts down localhost cleanly.
- **Durable private state**: Sentinel-owned JSON/gzip state now uses same-directory atomic replacement, file/directory sync, `0600`/`0700` permissions, and one last-known-good `.bak` recovery copy where possible.
- **Visible recovery semantics**: if a primary state file cannot be decoded and a `.bak` copy is used, Final Readiness reports it instead of silently showing green.
- **Strict API JSON**: unknown fields, oversized request bodies, trailing data, and multiple JSON values are rejected.
- **Heavy-work concurrency gate**: expensive local analysis is bounded so repeated clicks/scripts do not launch unlimited parallel scans.
- **Incident lifecycle hardening**: evidence is split by a 15-minute correlation window; repeated rebuilds merge the same story instead of growing duplicate history records.
- **Incident Deep Review**: one click re-inspects the incident primary object with current Integrity + Object Story evidence.
- **Vault capacity advisory**: Sentinel reports Vault footprint and item-count advisories without auto-deleting anything.
- **Versioned exports**: full reports and low-sensitivity diagnostics carry explicit `schema_version` and `report_kind` fields.
- **Dynamic app-bundle versioning**: `build-app-macos.sh` reads `VERSION` instead of hardcoding the app version.

All existing capabilities remain: Incident Intelligence, Change Monitor, FSEvents source path/polling fallback, Power Search, Weakness Audit, Behavior/Trust history, Integrity Lab, Storage Intelligence, Evidence Graph, Object Story, and reversible Safe Actions.

## Start

```bash
./RUN_SENTINEL.command
```

or:

```bash
./dist/sentinel-macos-arm64
```

For an isolated no-persistent-state session:

```bash
./dist/sentinel-macos-arm64 --ephemeral
```

## Recommended first run

1. **Final Readiness** — verify Sentinel itself.
2. **Quick Check** — read-only system snapshot.
3. **Monitoring Snapshot** — only if you want Behavior/Persistence history.
4. **Change Monitor** — watch a focused area when needed.
5. **Incidents** — correlate related evidence into fewer stories.
6. **Safe Actions** — Reveal/Rename/Vault/Restore only; no permanent delete exists.

## Build modes

`build-macos.sh` attempts native CGO builds per architecture on a real Mac. A successful native build contains CoreServices FSEvents and Security.framework validation. If native compilation is unavailable, Sentinel creates an explicitly labeled polling/CLI fallback binary instead of claiming native capability.

See `dist/BUILD_FEATURES.txt` after building.

## Safety model

Sentinel has no permanent-delete API. User-file mutations are limited to explicit reversible Safe Actions and are disabled under `--ephemeral`. The optional Endpoint Security source remains entitlement-gated and is not automatically installed or enabled.

## Guides

- `QUICK_START.md`
- `GUIDE.md`
- `FINAL_HARDENING_GUIDE.md`
- `INCIDENT_GUIDE.md`
- `CHANGE_MONITOR_GUIDE.md`
- `POWER_SEARCH_GUIDE.md`
- `WEAKNESS_AUDIT_GUIDE.md`
- `SAFE_ACTIONS.md`
- `ADVANCED_SENSOR_GUIDE.md`
- `DISTRIBUTION.md`
- `SECURITY.md`
- `TESTING.md`

## V2.2 System Profile

Easy Mode now includes a privacy-conscious **System Profile** page for users who do not know how to inspect Mac hardware themselves. It explains the Mac model, model identifier, Apple Silicon/Intel family, chip/processor, architecture, CPU core counts, memory, macOS version/build, Darwin kernel, storage capacity, Rosetta translation state, and which Sentinel engine architecture should run. Sentinel deliberately omits the full serial number and Hardware UUID.

## Open-source licensing before first public release

Sentinel source code is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See `LICENSE` and `OPEN_SOURCE_LICENSE_GUIDE.md`. Project-owned source files include an `SPDX-License-Identifier: MPL-2.0` notice.
