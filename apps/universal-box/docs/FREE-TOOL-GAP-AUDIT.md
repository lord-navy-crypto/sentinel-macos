# Universal Box: free, privacy-first productivity coverage (October 2026)

This is a living **feature-gap and validation** document, not a claim that Universal Box replicates all commercial features or that an advertised catalog tool is an independently verified application.

## Principles
1. Local-first, no account or recurring charge for core functionality. No silent uploads or scanning.
2. No copying another product's branded assets or protected visual implementation. Study tasks and user flows, then build an original design.
3. Only incorporate third-party code/assets following each applicable license and attribution.
4. Stop and explain when local resources, browser security permissions, format fidelity or platform capability make a task unworkable.
5. Preview before destructive edits and never replace source files without user choice.
6. Coverage terminology: **Catalog** = a discoverable tool entry. **Unit tested** = behavior checked by controlled inputs. **Browser smoke** = routing and UI mounts verified. **Real macOS** = native Tauri/macOS tested. **Two-device** = separate physical machines connected; no claims until truly checked.

## Research (official sources)
- PDF Expert: https://pdfexpert.com/pricing — paid OCR, content editing, Word/Excel conversion, annotations, signatures.
- CleanShot X: https://cleanshot.com/pricing — screenshots, video, capture annotations, premium sharing.
- Raycast Pro: https://www.raycast.com/pro — unlimited clipboard history, cloud sync, window control, snippets, AI.
- Adobe Acrobat: https://www.adobe.com/acrobat/online/pdf-editor.html — document editing, OCR, redaction, conversion, forms.
- PDF24: https://tools.pdf24.org/en/all-tools and https://tools.pdf24.org/en/creator — rich free tools; fully offline PDF24 Creator currently Windows-only.
- Stirling PDF: https://docs.stirlingpdf.com/ and https://docs.stirlingpdf.com/Functionality/The%20Technologies/ — local PDF OCR/automation, backend tools, license must be checked per component.
- Playwright: https://playwright.dev/docs/test-webserver — real browser testing via local development server.
- Tauri resources: https://v2.tauri.app/develop/resources/ — assets can be bundled locally without subscription services.

## Practical gap ordering
| Area | Already in Universal Box main, or in a separate draft | Missing or partial | Proposed next safe offline path |
|---|---|---|---|
| PDF | Page merging/splitting, basic forms, metadata, links, crops, reorder, visual link placement | True text edit, OCR, real redaction, searchable scanned PDF, high-fidelity Word conversion | PDF.js read, pdf-lib write, evaluate local Tesseract and Ghostscript/qpdf with license/distribution review; do not treat a black rectangle as real redaction |
| Data/Office | CSV, XLSX conversion, charting, mail merge and batch formats | CSV safety/quality before conversion, duplicate removal, visual import review, multi-step history | **v0.36 CSV Cleanroom**: local inspect, options, preview and formula-injection-safe export; later undo/replay/quality rules |
| Browser | Web Capture 0.3.1 is a separate Chromium extension project | Installed extension missing from the desktop bundle; no direct browser-to-app handoff | **v0.36 shipped local assets** with on-device ZIP export; later explicit opt-in deep link / local bridge with authentication |
| File workflows | ZIP pack/safe extract, binary comparison, hashes, batch images | Unified reusable output library, streaming large files and global undo | Extend existing v0.35 draft after real protocol QA; avoid false 100% coverage |
| Screenshots | Images/conversion/metadata cleaning | Scrolling screenshots, local OCR, annotations, safe clipboard history | macOS ScreenCaptureKit/Vision with user consent and no stealth recording; correct platform permission gates |
| Media | WAV, subtitles, image batching | Video merge/compression/transcription, frame extraction | FFmpeg optional local service after reviewing redistribution licensing; user opt-in |
| Collaboration | Commons v1 manual invite; v0.34 nearby in-app pairing **draft only** | Real two-Mac accepted-transfer testing, resumable large files, cross-LAN connectivity | macOS CI plus separate-device manual verification, then local pairing/signed session keys; no cloud relay promises |

## Quality ladder (must report truthfully)
1. Pure TypeScript/Vitest: parsing, invariants, security limits, deterministic output.
2. Actual Chromium/Playwright: UI navigation for every catalog entry, Web Capture local archive download, CSV preview/confirm/download. Browser availability does NOT prove macOS WebKit compatibility.
3. macOS GitHub Actions: compile Rust/Tauri, validate DMG mount, launcher, icons and ad-hoc signature (not Developer ID notarization).
4. True two-device tests: peer discovery, pair-code verification, firewall prompts, cancellation, files of different sizes; not currently automated by a single CI runner.
5. Accessibility, responsiveness, localization, and real-file edge cases; test non-happy paths and attach artifacts.
6. Test each tool's actual operation for functional claims; a catalog navigation sweep is a **smoke**, not full semantic verification of all tools.

## Web Capture 0.3.1 inclusion
Files under \`apps/universal-box/public/web-capture/\` are a pinned snapshot of the user's separate, already-tested Web Capture extension. Vite includes the files in the desktop's app assets. The in-app helper assembles those assets into a user-downloadable offline ZIP after enforcing the manifest's strict \`activeTab\`, \`scripting\`, \`clipboardWrite\` permissions. It does NOT install the browser extension automatically; Chromium security requires an explicit browser installation. No host permissions or background service worker are added to the shipped browser extension.

## v0.36 exact deliverables
- Shipped original Web Capture v0.3.1 scripts and popup as local Vite assets, no remote fetch.
- In-app export of an installable Chrome/Chromium unpacked extension ZIP.
- Offline CSV inspection and cleaning with bounded parsing, duplicate and blank row detection, formula-safe CSV output and explicit confirmation.
- Playwright browser CI to route through the full tool catalog and exercise extension packaging / CSV review / download. **Not** guaranteed that every catalog item is exhaustively functionally tested.
- Existing native macOS bundling CI remains the release gate. No claim of Safari, full Office fidelity, real OCR or notarization in this version.
