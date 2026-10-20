# Universal Box · verified free-utility replacement roadmap

Last reviewed: 2026-10-19
Scope: Daily Desk standalone macOS app, `apps/daily-desk/**`; preserve AP ReasonLab website separately.

## Product principles

1. No forced accounts, subscription, arbitrary daily quota, ads, watermark, telemetry or remote uploads for local-capable functions.
2. Do not copy proprietary software/source, logos, or protected UI. Reimplement interoperable file formats with our own code and permissively licensed components.
3. External links may help users where offline tools cannot; never confuse those sites with built-in functions.
4. No indefinite *technical* zero-limit promises: file size, page/pixel, memory and security constraints are necessary and should be surfaced clearly.
5. Avoid calling all paid features deceptive: live cloud sync, hosted redirects and scan analytics consume infrastructure and have real ongoing costs.
6. No silent document uploads or background clipboard monitoring; exported files use explicit save actions.

## Public, first-party evidence

| Product / official pricing | Verified distinction | Candidate local replacement |
|---|---|---|
| [QR TIGER](https://www.qrcode-tiger.com/payment) | Static QR is unlimited free; plans price hosted dynamic codes, larger bulk export, integrations/analytics | Offline batch *static* QR, vCard, Wi-Fi, PNG/SVG |
| [Canva QR](https://www.canva.com/qr-code-generator/) | Basic QR free; presentation/branding features vary by plan | Brand-neutral QR export |
| [Smallpdf](https://smallpdf.com/pricing) | Free plan has limited downloads; Pro adds unlimited processing and more advanced edits | Image/PDF conversion, page editing and batch operations |
| [iLovePDF](https://www.ilovepdf.com/pricing) | Basic is free with processing limits; Premium expands quotas, desktop and ad-free options | Local simple PDF workbench |
| [CloudConvert](https://cloudconvert.com/pricing) | Free quota measured in conversion credits per day; paid conversions based on processing | Fast local, supported-format conversions |
| [Zamzar](https://www.zamzar.com/faq/) | Free web conversions have daily limits, paid plans lift limits and raise file caps | Common browser/native file conversions |
| [remove.bg](https://www.remove.bg/pricing/) | Pay-per-credit and monthly subscriptions support scalable AI background removal | Local manual masking first; full background ML is **advanced**, not a trivial one-click copy |
| [Otter.ai](https://otter.ai/pricing) | Free transcription minutes and imports are limited; paid plans expand processing | Local audio cutting/normalization is easy; accurate speech recognition needs larger offline models and work |

References are snapshots: pricing, quotas and features change; verify official sites at implementation time.

## Built-in Daily Desk capabilities

### Delivered before v0.20

- PDF: split, merge, rotate, reorder, stamp, page numbers, watermarks, image overlays, PDF-to-images, images-to-PDF, selectable text search/export.
- Images: resize, crop/rotate, captions, batch conversion, common metadata stripping by pixel re-encoding.
- Math / study: calculator, graphing, units, equations, flashcards, timer, study notes, weighted grades and date arithmetic.
- Data: CSV/TSV table desk, JSON⇄CSV, safe spreadsheet exports, JSON formatting, text comparisons, cleanup and link tracking removal.
- Privacy / files: SHA-256 checksums, local secure password generator, batch file rename with originals preserved.
- Basic QR and colour contrast testing already existed; preserve them.

### Added in v0.20

- **QR Studio**: plain text/URL and local Wi-Fi / vCard static QR, PNG or SVG save, and up to 40 vector QR files in a ZIP without server branding. Wi-Fi QR embeds credentials (warn users).
- **Calendar .ics generator**: local UTC start/end events using RFC 5545 text escaping, UTF-8 line folding and explicit save; no sending or booking.
- **UUID v4 batch generator**: 1–100 local cryptographically random IDs; they are identifiers, not passwords.

## Opportunity queue (not yet implemented)

| Category | Candidate utility | Difficulty | Notes |
|---|---|---|---|
| Text | Smart quote / full-width and half-width conversion | Low | Unicode and punctuation edge cases |
| Text | Unicode invisible character and homoglyph inspector | Low/Medium | Inspection only; no coercive auto-removal |
| Text | Line sorting, deduplication, prefix/suffix adding | Low | Preserve line breaks, protect large input |
| Text | HTML-entity and URL-query visual parser | Low | No external fetch; escape result |
| Office | Invoice / receipt template to PDF | Medium | Local PDF, localization and tax disclaimers |
| Office | Spreadsheet to vCard/contacts | Medium | CSV encoding/quoting and PII warnings |
| Office | HTML to accessible PDF print | Medium | Browser print workflow and CSS fidelity |
| Office | Form letter / mail merge from CSV into DOCX | Medium | Templating and output safety |
| Files | Folder duplicate finder by hash | Medium | Native directory picker permissions |
| Files | ZIP inspection and selective safe extraction | Medium | Zip-slip/bomb and path traversal protection |
| Files | Batch filename case/transliteration preview | Low | Rename-by-copy; never overwrite |
| Files | EXIF / document metadata viewer | Medium | Detection accuracy across formats |
| Images | Contact sheet / photo grid maker | Low/Medium | Local Canvas export |
| Images | Favicon and app-icon size set generator | Low | Canvas icon sizes, no platform logos |
| Images | Image palette extraction | Low | Local pixel sample and WCAG contrast |
| Images | Image difference / visual overlay | Medium | Align and compare pixel dimensions |
| Audio | Browser/desktop audio trim / fade | Medium | Local decode/encode, size constraints |
| Audio | WAV normalization and waveforms | Medium | PCM analysis, no speech recognition |
| Audio | Audio format conversions | Medium/Advanced | Codec availability/platform differences |
| Video | Frame extraction / thumbnail/contact sheet | Medium | Video decode and timing limits |
| Video | Trim/crop/re-encode | Advanced | Native codecs / ffmpeg license+packaging |
| Dev | Regex playground and text batch replacement | Medium | ReDoS mitigation / worker timeout |
| Dev | JSON Schema validation | Medium | Third-party library, no external validators |
| Dev | URL components inspector / parser | Low | Avoid unsafe auto-navigation |
| Dev | SVG optimizer / preview | Medium | Sanitization of active content |
| Study | Citation metadata organizer | Medium | Offline formatting; no DOI network fetch |
| Study | LaTeX equation sheet to PDF | Medium | Existing math renderer + print |
| Study | Randomized answer-sheet generator | Medium | User-generated questions, no auto copyrighted bank |
| Accessibility | Subtitle SRT / VTT shift and conversion | Low/Medium | Timestamp validation, no transcription |
| Accessibility | Colour blindness contrast and palette preview | Medium | Validation against current WCAG |
| Research | Offline speech-to-text | Advanced | Models, CPU/GPU, download size and licenses |
| Images | AI foreground/background isolation | Advanced | Offline ML and quality concerns |

## Not a genuine offline feature

- Dynamic QR redirects with editable destinations **require hosted URL endpoints**; you may encode a user-owned redirect link, but Daily Desk does not promise to host or keep one alive.
- Cloud collaboration, shared projects and online account sync need hosting/authentication and cannot be claimed as “copied offline”.
- AI online document/speech processing has operational compute/network costs; an offline equivalent requires model packaging and latency testing.
- Qualified legal e-signatures and destructive PDF redaction require purpose-built verification and cannot be replaced by simple image stamps.

## Definition of done

Every shipped tool must have: real local processing, input validation, visible error states, output safety, tests for tricky edge cases, clear capability limits, and a green macOS Apple Silicon CI build. Do not merge on TS success alone; user-driven Mac WebView QA remains separate from CI.

## Implemented in v0.21 (removed from the "not yet implemented" queue)

- Text line sorting/deduplication/blank trimming/case change/prefixes/suffixes.
- URL structure and repeated query parameter inspector, no network request.
- Local SRT ↔ WebVTT conversion with bounded timestamp shifting and explicit rejection of unsupported subtitle styles or cue settings.
- Photo contact-sheet PNG/JPEG creator with captions and size-limited PNG/JPEG/WebP inputs.

The opportunity queue above is preserved as a historical candidate list; the four rows listed here should now be read as delivered baseline implementations, with advanced WebVTT and high-resolution photo-workflow fidelity still remaining future improvements.

## Delivered in v0.22 (October 2026)

- Basic, bounded PCM16 WAV crop / peak normalization / short fades, without MP3/AAC or a proprietary codec backend.
- Read-only ZIP central-directory metadata explorer and suspicious archive metadata flags. **ZIP extraction is still not implemented.** Flags are not antivirus verdicts.
- Batch seven-size PNG icon exports in ZIP from a single local image, without assuming iOS/macOS icon branding.
- Offline approximate RGB palette sampling from local pictures, not a commercial colour-matching service.

Historical opportunity queue entries for WAV, icon sizing and palette have now been satisfied only at the baseline level; ZIP safe extraction and broader audio codecs remain future work.

## Implemented in v0.23

- CSV address book conversion to standard vCard 3.0 contact file (.vcf) with Chinese/English header recognition and per-row validation, up to 300 records.
- Text-only CSV mail merge producing up to 100 separately numbered, safe TXT ZIP entries without outbound email.
- SHA-256 duplicate detection for an explicitly selected bounded file set; reports only, **never deletes files**.
- Unicode invisible/bidirectional/control mark inspector with positions and no destructive auto-removal.
- **Native export bugfix**: macOS Tauri writer now accepts pre-existing ICS/SRT/VTT/WAV outputs and new VCF output, consistent with frontend export buttons. Guarded by Rust tests.

The queued larger-scale folder duplicate search, docx/PDF mail merge, image contrast and AI tools remain future opportunities. v0.23 implements safe baseline workflows rather than claiming feature-for-feature proprietary suite parity.

## v0.24 delivered: workflows and safe subset of ZIP extraction

- **Selective ZIP export** now follows the existing read-only inspection step: choose up to 30 safe entries, validate declared and actual decompressed lengths and CRC-32, and save only user-selected contents as a new ZIP with safe numbered paths and original-name manifest. Archives with unsafe paths, symlinks, ambiguous normalization or unsupported methods cannot be processed. No writing of archive-provided destination paths.
- **Integrated image workflow** combines existing resize, conversion, renaming and ZIP bundling operations into a single offline process, including per-image stage progress, preview of generated names and optional JSON manifest.
- Kept explicit byte/pixel ceilings and avoided claims of antivirus capability, unbounded archive extraction or advanced image codec parity.

Next improvements should prioritize independent verified OCR and Office interoperability, visual comparison, selective media conversions and a formal signed/notarized release pipeline after Mac QA.

## Delivered in v0.25 — spreadsheet interoperability and visual tooling

- New local XLSX ↔ CSV/JSON data interchange for the first worksheet. Single-sheet export preserves all CSV data as literal text (leading zeros and formula-looking entries do not execute). Imported Excel files show cached values only, with explicit rejection of macros, links and unsafe worksheet relationships. Styling, formulas, merged cells and other advanced workbook semantics are not round-tripped.
- Pixel-level two-image difference mask, adjustable overlay, statistics and local PNG save. Equal image resolution required; no misleading image auto-alignment.
- HTML entity encoder/basic decoder plus NFC/NFKC Unicode normalization as plain-text tools.
- Added Vitest for actual XLSX roundtrip, shared-string/numeric/formula-cache import, unsafe relationship rejection, macros, CJK, cell limits, pixel masks and numeric HTML entities.

Remaining important future features: packaged offline OCR with real language models, full multi-sheet XLSX editing, video/audio codec integration, durable signed/notarized releases and real-device manual UI testing. Do not represent these as shipped.

## v0.26 completed: visual system and first-class data charts

- Introduced consolidated CSS design tokens for visual consistency across shell, tools, forms and tool cards, plus theme toggle and compact responsive navigation.
- Modernized the dashboard with featured workspace grid, statistics, favorites and recent destinations. Added global ⌘/Ctrl+K searchable command launcher for all workspaces/tools; optional preferences remain local.
- All Tools catalog now has horizontal category chips and per-tool favorites, filtered tool count and empty states.
- Shipped offline CSV Data Chart Studio for bar/line plots, safe aggregations, downloadable SVG and summary CSV with input and category limits.
- Kept existing tools and routes, no auth/cloud/paid dependency added.

QA follow-up: visual inspection of older modules in dark mode; keyboard focus trapping and tab ordering; audit display contrast and accessibility; replace remaining hardcoded color styles in specialist components. Future functionality includes verified offline OCR, advanced Office document interoperability and signed/notarized releases.

## v0.27 implemented: everyday PDF mini editors

- Standard PDF document properties inspection and edited copies (title, author, subject, keywords), with explicit limitations on XMP/creator privacy.
- Visual CropBox margin editor with page selection; no false promise of secure redaction.
- Insert blank pages at a chosen position in A4, US Letter or first-page-matching size.
- Basic editable AcroForm text-field workflow with ASCII-only appearance support. XFA, image stamps, non-text controls and verified signatures remain future work.
- Four new searchable tool catalog entries, new dedicated sidebar page, preview-based crop-page choice and regression tests.

Follow-ups worth evaluating for daily use: offline OCR for scanned PDFs, complete form filling with a bundled or licensed CJK font, proper image downsampling PDF compression, safe full redaction, PDF/A checks, accessible tagged PDF inspection, and richer DOCX↔PDF compatibility. These are not shipped v0.27 features.

## v0.28 implemented: Universal Access and no-jargon helper

- Accessibility workspace with opt-in larger interface labels, high contrast, simple home, motion preferences and locally stored settings.
- Device-only keyword router mapping Chinese/English everyday requests to **existing** tool-index IDs and verified live view/module deep links. Shows clear non-availability for OCR and unmatched tasks.
- Keyboard-access refinements including persistent skip link and proper focus lifecycle, Tab trapping and inert background for the search dialog.
- On-device help examples and three-step usage guide, index entries, responsive styles and automated tests for preferences, non-existent route rejection and real-catalog availability.

These are first accessibility steps, not universal WCAG 2.2 AA certification. Test 200% zoom/reflow, real screen reader interaction, high-contrast colors inside legacy tools and Mac keyboard behavior before claiming full accessibility. Next: robust packaged offline OCR language models, verified community templates, and clear source licensing/contribution policies (subject to repository owner's consent).

## v0.29 — Easy Local AI browser-port milestone

- Ported the AP Website's WebLLM/WebGPU *local* chat path to Universal Box, with six curated Qwen/Llama model IDs, local cache status/removal, downloading progress, streaming, interruption and model unloading. **No three-mode API switch**: all in-app inference is local.
- Added an explicit browser fallback for macOS WKWebView incompatibilities; URL selection is validated and never transmits prompt parameters.
- Prioritize real-hardware Mac acceptance of WebGPU and WebLLM download/cache before declaring native-WebView inference proven. The web browser path should be tested separately.
- Follow-up: if WebGPU inside the macOS WebView remains unreliable, consider a dedicated secure browser-hosted Local AI page or Apple Silicon Metal-native engine; this is outside v0.29.
- Other future work (OCR/office/application planners) stays independent of the AI port.
