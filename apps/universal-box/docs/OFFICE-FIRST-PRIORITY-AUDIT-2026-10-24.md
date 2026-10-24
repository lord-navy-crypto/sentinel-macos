# Sentinel Box · office-first priority audit and execution correction
Date: 2026-10-24. Status: development plan + PR implementation; **not a shipped release**.

## Governing sources (ordered)
1. [Office-first reset](./OFFICE-FIRST-RESET-2026-10-23.md): free, simple, offline-first; PDF, image, text/clipboard, OCR, files and everyday documents; complete real jobs before creating new tool entries.
2. [Daily tools execution plan](./EXECUTION-PLAN-DAILY-TOOLS-054.md): P0 native screenshot→OCR→copy, truthful PDF compression, photo conversion/size reporting and Mac acceptance.
3. [30 everyday workflows](../QUICK-ACTIONS-30-FEATURE-PLAN.md): no shadow duplicate catalog tools; quick actions only connect to verified existing workspaces.
4. [Issue #62: full original vision](https://github.com/lord-navy-crypto/sentinel-macos/issues/62): balance office, Word/PPT, screenshots/OCR and files; at least three areas per iteration; do not become a PDF/CSV-only tool.

## Official market reference (not telemetry or measured usage frequencies)
- [PDF24 frequently used](https://tools.pdf24.org/en/all-tools): merge, split, compress, PDF editor, converter, images↔PDF are prominently grouped. PDF24 Creator itself is already free on Windows. Differentiate on macOS local convenience; do not claim all alternatives are paid.
- [PowerToys utility list](https://learn.microsoft.com/en-us/windows/powertoys/): Advanced Paste, PowerRename, Image Resizer, Text Extractor and quick launcher illustrate recurring small jobs.
- [PowerToys Advanced Paste](https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste): direct plain paste and local text transformations; do not add hidden clipboard tracking by default.
- [PowerToys Image Resizer](https://learn.microsoft.com/en-us/windows/powertoys/image-resizer) and [PowerRename](https://learn.microsoft.com/en-us/windows/powertoys/powerrename): clear size presets, preview/confirmation and source-safety matter.
- [Apple Preview](https://support.apple.com/en-ie/guide/preview/prvw846b61d3/mac): already merges/edits PDFs and images, so Sentinel Box should emphasize understandable batching and explicit copy export rather than recreating the whole viewer.

These are **qualitative product-layout proxies**, not user analytics. No actual per-task telemetry or statistically valid use-frequency ranking is available from the connected repository. Do not invent adoption numbers.

## 2026-10-24 audit → priorities

| Rank | Office job / product area | Verified existing foundation | Important unmet task / gate | Decision |
|---|---|---|---|---|
| P0 | PDF merge/split, genuine size reporting | FileDesk, PDF Mini, PDF Structure Optimization, Scan PDF Compression | Fewer clicks; actual readback in Preview; signed PDF cautions; native UI QA | One-click route, then verify |
| P0 | Images: resize/convert and target KB compression | FileDesk, SpeechPortableDesk photo-target, HEIC macOS bridge | Real format/size/preview correctness, orientation and HEIC actual device tests | One-click route, real output measurements |
| P0 | Text and clipboard | QuickKitDesk Text Cleaner, manual clip basket | Explicit paste/copy reliability and clipboard permission UX | Direct route, no monitoring |
| P0 | File rename / packaging | EverydayTools rename, Workflow ZIP pack, FileIntakeDesk | Collision preview, safe copy ZIP, real cancel/restore, Finder QA | Direct route to verified existing features |
| P0 | Screenshot/image to editable text | VisionWorkflowDesk Apple Vision OCR + explicit screen picker and manual copy | Real Mac Chinese/English OCR, permissions and clipboard confirmation | Direct route, **do not duplicate OCR** |
| P1 | Word/PPT daily documents | CreativeStudioDesk editable DOCX/PPTX templates, separate mail merge | Better findability, actual Pages/Word/PowerPoint round-trip fidelity | Replace narrow CSV-mail-merge home route with Creative Studio |
| P1 | Native distribution | macOS CI Intel/ARM, test DMGs | Signed/notarized, Gatekeeper and real installed-app acceptance | Stop calling CI artifact a public release |
| P2 | Specialist table rules, charts, simulations | Hundreds of legacy/catalog entries plus recent table PRs | Multiple routes make common actions harder to find | Pause new spreadsheet micro-features; retain under secondary search |

## Current implementation — office-first Sprint 1

- Keep **six** top-level common office task groups, with direct route into the existing PDF, image, text, file rename, OCR and Word/PPT workspaces.
- Expose four outcome-oriented one-click shortcuts into existing PDF size optimizer, photo target-KB conversion, PPT outline generator and local ZIP packing. No copied logic, no new converter.
- Remove duplicate workspace entries from sidebar while preserving all original routes and Command Palette / All Tools discoverability.
- Put promotional / specialist home modules in a collapsed, opt-in More Workflows section; favorites and recently used tools remain available.
- Do not count catalog entries as feature delivery or describe native Apple Vision / HEIC and signing gates as passed.

## Follow-up sprint (not claimed as implemented here)
1. **P0 native acceptance:** two real-Mac builds and installed-app workflows for screenshot OCR/copy, photo HEIC, PDF readback, clipboard permissions, Finder batch renaming. Current CI does not replace this.
2. **P0 complete inputs/outputs:** test real PDF compression (especially scanned pages), target-size photo before/after bytes, ZIP/readback, native cancel/failure states. Improve the existing modules on verified gaps.
3. **P1 documents:** actual DOCX/PPTX editability and Pages/Word/PowerPoint compatibility; refine template flow before new document entry points.
4. **P2 after evidence:** only resume CSV micro-features if demonstrated by real office users; PR #145–#148 remain separate unmerged work and are not release evidence.

## Definition of done
- No new dead catalog entry. User reaches an existing task in one click.
- Vitest validates unique route keys and clear target types; Chromium opens each real workspace and verifies its actual controls.
- All navigation links preserved, no duplicate sidebar entries, specialist features remain accessible on demand.
- Latest core, browser and Intel/ARM macOS CI on the exact head, with manual installed-Mac QA separately recorded. Merge only after passing checks.
