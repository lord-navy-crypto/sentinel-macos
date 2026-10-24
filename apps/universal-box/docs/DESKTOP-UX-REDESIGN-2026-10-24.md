# Sentinel Box desktop UX redesign — 2026-10-24

## Reference research (product behavior, not visual copying)
- Apple Human Interface Guidelines: macOS window/sidebar/toolbar/search/navigation conventions. https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/
- Microsoft PowerToys: one discoverable tool collection, low-friction commands and small utilities. https://learn.microsoft.com/en-us/windows/powertoys/
- PDF24: frequently-used tasks, grouped PDF operations and search/category discovery. https://tools.pdf24.org/en/all-tools
- Raycast: root search, action panel, hotkeys and quicklinks. https://manual.raycast.com/quickstart
- Notion: persistent sidebar with quick search, recent work and keyboard-first command navigation. https://www.notion.com/help/search

## What changed in code
- Home is a single action-first **OfficeHome** rather than duplicated marketing/intro panels. Links use existing tools. Shows frequently used office tasks, quick actions, pinned workspace views, recent views, live tool count, and **session-only metadata** about successful exports.
- Home files can be selected/dropped directly into the **existing File Intake** preflight using a one-time, in-memory File handoff. Never reads file contents, computes SHA-256, exports or sends anything without user approval in that existing workflow.
- Navigation keeps **all historical workspaces available** but uses six task-oriented collapsible groups (kept initially accessible so existing bookmarks, automation and direct tool navigation are not hidden). Pinned and recent views are promoted into quick sidebar links. Existing ⌘K command search and favorites are reused; ⌘/ is an alternate shortcut.
- Tool catalog retains every original tool route and search behavior, but normalizes category labels, supports compact list and card grid, and keeps device-only favorites.
- Commons now presents clear **LAN / Public WebRTC / Diagnostics** modes. Diagnostics surfaces only known state, offers LAN/public troubleshooting, and sends requests to the preexisting System Health tools. An external STUN probe only runs on an explicit click; opening Diagnostics does not scan, connect to STUN/TURN or read user content. Fixed text that wrongly claimed existing public WebRTC chat was unimplemented.
- A restrained shared style layer applies after legacy CSS, retaining existing React tools and Tauri commands. It improves topbar/sidebar density, panels, buttons, forms, network statuses, tablet-sized Mac windows, keyboard focus and dark mode without adding remote fonts or assets.

## What has NOT changed
- No backend converter, LAN TCP/Bonjour, WebRTC or TURN networking protocol rewrite. The desktop redesign should be tested separately from physical network availability.
- No automatic file processing or cloud upload. Output history contains only suggested names, sizes and timestamps in session RAM (up to eight). No file bytes or paths are stored, and the list resets on app restart.
- The desktop UI intentionally does **not** promise an offline queue, delivered-to-everyone receipts, hosted TURN, automatic cross-WAN signaling, saved messages, Apple signing or physical two-Mac production verification.
- No blanket layout rewrite of individual specialized workbenches: their shared surfaces are visually unified, while their existing preview, file and error controls are preserved.

## Regression checklist
1. Open Home on a clean browser or Mac app. Verify six or more task cards work, search opens ⌘K, Escape closes, recent and favorites are updated when navigating.
2. Drop/select a TXT or PDF in Home. File Intake must display its **unscanned** preflight. Cancel must not touch the original file. Explicitly press Scan only when intended.
3. Search every catalog entry. Toggle between grid and list, filter category, favorite entries; all original routes must still open. Try English/Chinese queries.
4. Use PDF merge/crop/metadata, text/CSV, image resize, OCR and file export. Verify recent export entries appear on Home after real successful save and do not persist after restart.
5. Commons > LAN: sending/receiving, nearby scan remains opt-in, local chat and session recovery remain functional. Commons > Public: private manual SDP handshake, member ACK, heartbeat and manual resume unaffected.
6. Commons > Diagnostics: no unsolicited probe on opening; in browser probe remains disabled, on desktop only a direct click starts it. Diagnostic button must navigate to the existing System Health workspace.
7. Check 1440 × 900, 1024 × 768 and narrow 700 px windows; keyboard Tab focus, reduced-motion preference, larger text, high contrast, light/dark modes.
8. Require exact final branch SHA: Vitest, entire Chromium navigation and workflow test, Sentinel core validation, and both ARM64 and Intel macOS desktop build/artifact checks. **Physical Mac screen inspection and two-device LAN/WAN testing remain for the user.**

## Release notes
This is an actual UI/UX code change, not a render or mockup; no standalone demo UI or additional cloud service is introduced.
