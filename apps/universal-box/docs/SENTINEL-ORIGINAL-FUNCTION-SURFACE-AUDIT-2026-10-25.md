# Original Sentinel UI discoverability audit — 2026-10-25

## Actual code coverage, not inferred UI
- Original Go server in `main.go` currently registers **99 distinct /api/ routes**. An endpoint is not necessarily one user-facing function: some are mutations, exports, POST requests needing validation, background activity, or parameterized drilldowns.
- New Sentinel Box bridge in `src-tauri/src/sentinel_service.rs` exposes **49 fixed-key Go endpoints** through `sentinel_service_read`. Keys are hardcoded, never composed from user-input URLs, and the Rust bridge sends GET only with a non-exported locally scoped bearer token, no redirects and a 2 MB response limit.
- Of those 49 fixed endpoints, **18 were already bridgeable** in PR #174, but many lacked individual All Tools cards. **31 additional fixed routes** are now directly available under their corresponding system lens. **Eight previously bridgeable read functions** that lacked dedicated cards now appear as independent catalog entries.
- All 49 native operations can be selected in their system lens; single-click launch from All Tools / command palette opens the relevant lens and selects the specific operation. No engine starts, disk scan launches, monitoring rule enables, file writes occur or external connection is opened simply by browsing these screens.
- All **50 other Go API routes** are now indexed by their actual source paths, recognizable Chinese descriptions and grouped type in the searchable advanced-capabilities directory. These are discoverable descriptions, **not** fake executable React buttons. `/api/search` is also reached through the existing independently validated native evidence-search command, so “50 not in the fixed bridge” does not imply all 50 are exclusive to WebView.
- The original full `Sentinel.app` web UI is preserved as a separate app-owned WebView, backed by the same original Go engine. Complex operations (including POST/PUT workflows, controlled changes, restore, case exports, interactive targeted inspection) are **not** reimplemented in React and must retain original native approval/permissions flows. **This is intentionally NOT a claim that 99 out of 99 API routes have a standalone React control.**

## Added live read-only families
1. Resource and health: current resource snapshots, resource history, CPU/disk/network rates, live system health, what-changed summary, coverage and system console query catalog
2. Investigation: Evidence Graph v2, global and grouped timelines, cases/incidents
3. Baseline and monitoring: trust/history/health, behavior/history/health, change status / events / history
4. System services: Launch Services, storage graph, scan job state and persistence status
5. Safety ledger: action status, health, journal and vault *inventory* (not mutation)
6. Runtime and advanced: Sentinel health, update state, advanced sensor status, AI service status and pre-regression check

## Still original WebView only (user must explicitly open it)
- Safety actions: preview, explicit confirmation, protected execution, reversible isolation, restore, trust reference capture/rollback and audit exports
- Stateful operations: start/stop change monitoring, controlled snapshots and storage scans, case exports, persistent reference capture
- Parameterized workflows: deep file search, process/object inspection, tailored system query, evidence-rich case investigation, maintenance drilldowns and path-specific integrity checks
- Existing rich visualizations and UI workflows in `web/app/` including full scan, system console, case workbench, resource observatory, recovery center and evidence-assistant tools

## Release gates
1. TypeScript build, Vitest all tool catalogue validation (31 new + 8 old direct cards), complete Chromium navigation through 46 top-level workspaces and newly deep-linked Sentinel evidence panes.
2. Go on macOS: build original real Go binary for the matching CPU target, run authenticated localhost handshake smoke, check six distinct live GET routes, explicitly reject unauthenticated access.
3. Rust: assert all listed new keys map to fixed paths, reject path traversal, arbitrary URLs, and mutation paths. Go service token never passed to React.
4. Full dual architecture macOS app builds: mount DMG, verify original Go executable included, check binary architecture and code signature. Ad hoc signing is NOT Apple notarization.
5. User physical QA (not replaced by CI): check launch/stop, full WebView, actual evidence/history, optional permissions, approved safe actions, CPU/memory, local archive compatibility, LAN and public WebRTC sessions after enabling both legacy engine and Commons.

No existing Sentinel Go data store is migrated/deleted; no cloud upload or periodic scan is started by these UI changes.
