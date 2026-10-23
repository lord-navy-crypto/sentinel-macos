# Sentinel Box v0.58 — Discoverability and Sustainable Revenue Plan
2026-10-21 · **Milestone: v0.58, stacked on v0.57 PR #82 and existing roadmap #62**. This document is an executable implementation and business plan, not evidence of actual sales.

## Findings from current competitor research (official references)

| Product | Verified pattern | Sentinel Box response |
| --- | --- | --- |
| [Microsoft PowerToys Command Palette](https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview) | Keyboard-first palette and one search surface for utilities | Reuse the **existing** Sentinel Box Cmd/Ctrl+K palette; no second launcher |
| [Alfred for Mac](https://www.alfredapp.com/help/getting-started/cheatsheet/) | Arrow navigation, Enter to launch, discoverable shortcuts | Add ↑↓, Home/End and Enter for selected result |
| [Raycast quickstart](https://manual.raycast.com/quickstart) | Action-driven discoverability and a concise launcher | Add natural-language aliases for common tasks, direct mode-specific navigation |
| [Obsidian pricing](https://obsidian.md/pricing.html) | Core software free, optional support, Sync/Publish paid add-ons | Keep all existing everyday offline utilities free; only explore optional services and sponsorship |
| [PDF24 Creator](https://tools.pdf24.org/en/creator) | Broad offline, free local PDF utility for Windows | Improve existing private PDF workflows for Mac instead of chasing feature count |

**Important:** These are design/business inspirations, not copy-pasted UX, code, marks, icons or licensed assets. No evidence currently establishes that Sentinel Box has paying customers, revenue or market fit.

## Product diagnosis: don't invent duplicate features

`src/App.tsx` already had **Cmd/Ctrl+K**, a command dialog, theme persistence, workspace favorites and a static list from `LOCAL_TOOLS`. `ToolLaunchpad.tsx` already had a separate searchable favorites list.

The actual blockers were: static/default suggestions did not prioritize a specific user's last **tool** rather than just the parent workspace; Enter always launched the first item; no arrow keyboard selection; no task synonyms (e.g. “发票”, “压缩pdf”, “HEIC转JPG”); no one-key pin of an individual result.

## v0.58 implemented and measurable

1. Refactor only the existing Cmd/Ctrl+K modal: local score-based matcher across existing menu and tool IDs, with safe Chinese/English aliases, capped at 12 results. Alias vocabulary is curated—no cloud AI query.
2. Give the input Arrow Up/Down, Home/End, Enter, Escape; visible selected row and accessible combobox / listbox semantics. Tab keyboard trap remains.
3. Per-tool starred pins and most-recently used **specific tool IDs** (up to 20 pinned and 12 recent), stored **only in optional localStorage**. No recording of query text, customer data, file names, clipboard contents, actual documents, browsing history or keystroke telemetry.
4. Pinned and recent commands appear before other meaningful defaults in the empty palette. Changed query results are ranked for the task and may boost relevant pinned/recent entries. Nothing is uploaded or scanned in the background.
5. Unit tests ensure ranking, no fake IDs, bilingual aliases, no duplicate histories and preservation of distinct PDF actions; real Chromium E2E verifies Cmd/Ctrl+K navigation, per-tool pin persistence, and mode-specific launches.

## Revenue strategy — realistic, opt-in and aligned with "free offline-first"

**Non-negotiable:** No forced login, subscriptions, cloud upload or disabled core tools for offline PDF/OCR/files/text. No secret data collection; any support links or money features require transparent user choice and adult/account/legal approvals where applicable.

| Stage | Funding path | What to build / measure | What not to promise |
| --- | --- | --- | --- |
| 0 · Quality gate | No monetization UI until release/install validation | Signed/notarized macOS releases; native HEIC/OCR quality; safe ZIP readback and setup docs | Revenue from draft PRs or “completed” feature checklists |
| 1 · Feedback & discovery | Voluntary sponsor/support link (only when deliberately configured by maintainer) | Public changelog, issue templates, clearly explained privacy model, measurable bug reports | “Everyone will donate” or spammy asks |
| 2 · Businesses | Optional paid **support and custom deployment/training** | Response-time/support scope, agreement and transparent manual invoicing, case studies with permission | Claim commercial guarantees without a delivered service |
| 3 · Value-add | Optional paid cross-device/team hosting **only if it actually incurs server cost and has secure operations** | Separate, audited account-based service; off by default, no access to local files | Convert core free offline features into a mandatory subscription |
| 4 · Repeatable distribution | Community referrals, tutorials, verified distribution channels | Consent-based opt-in metrics at the website/download aggregate level (NOT app tracking), track installation failures and retained voluntary users | Fabricated downloads, user counts, pricing claims or income forecasts |

### Responsible measurement

For early cohorts use **explicitly submitted, anonymous feedback** and aggregated GitHub release download statistics with clear caveats. Favor usability milestones over MAU tracking: task completion without technical knowledge, first-file export success, real file sizes before/after, crash-free startup on both architectures and absence of unapproved network calls. Do not build invasive analytics.

### Future high-value feature pipeline

- **v0.59 · Minutes-to-Action:** notes → meeting minutes DOCX + action CSV with assigned owners/deadlines, all input from user; no fabricated transcription or attendee lists. Retain edit/preview.
- **v0.60 · Client Delivery Pack:** chosen source files → sanitized ZIP with manifest and local SHA-256 checksums, plus readable handoff note; reuse the existing ZIP/hash primitives.
- **v0.61 · Mac Desktop Release Reliability:** signing/notarization permissions, tested HEIC/Apple Vision/WKWebView and onboarding; publish trustworthy installation docs.
- **v0.62 · Accessible Everyday Dashboard:** surface top 5 common tasks and guided sample datasets, not extra strange utility tabs.
- **Only then** explore optional service-based revenue, which must not compromise local free utility use.

## QA acceptance

- [x] Search model, bilingual aliases and per-tool preference state implemented
- [x] Existing palette UI enhanced with keyboard and pins, no duplicate route or catalog ID
- [x] Local unit test and Chromium end-to-end test authored and registered with CI
- [ ] Latest PR TypeScript/Vitest/Chromium green
- [ ] Latest macOS ARM/Intel CI green
- [ ] Physical macOS layout/VoiceOver/shortcut conflict test green
- [ ] Screenshots/README support material reviewed; no misleading “no data leaves this computer” for the separate Web Capture/browser integrations

**Merge order:** #79 -> #80 -> #81 -> #82 -> this PR. #78 is a separate main-based change. Do not merge this stack out of sequence.
