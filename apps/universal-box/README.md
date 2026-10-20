# Daily Desk

Daily Desk is the standalone desktop product in the Knowledge-Explorer repository. It is separate from the AP ReasonLab Next.js website and is not deployed by Vercel.

## Stack

- React + TypeScript + Vite for the desktop UI
- Tauri 2 + Rust for the desktop shell
- macOS DMG bundle for the first release target
- GitHub Releases for versioned installers

## Development

Requirements: Node.js, npm, Rust toolchain, and the platform dependencies listed in the Tauri prerequisites.

```sh
npm install
npm run tauri:dev
```

Build the frontend:

```sh
npm run build
```

Build a macOS DMG on a compatible macOS runner:

```sh
npm run tauri:build
```

## Release policy

- Version and release tags use `daily-desk-vX.Y.Z`.
- The release workflow builds DMG assets and attaches them to a GitHub Release.
- Do not commit generated `.dmg`, `.app`, `target/`, or `dist/` output to source control.
- The AP website remains rooted at `ap-reasonlab/` in Vercel.


## Implemented workspace modules

- **Planner**: task priorities, optional due dates, filters, and completion tracking.
- **Flashcards**: add and review question/answer cards with flip, search, and removal.
- **Focus timer**: focus and break sessions with start, pause, and reset.
- **Notes**: a local autosaved scratchpad.
- **Quick utilities**: text metrics and JSON formatting.
- **Backup & privacy**: export and restore a validated v2 JSON workspace.

Data currently lives in the Tauri WebView's local storage, and is not synced to the AP website. Treat it as **local convenience storage**, not as a backed-up database. Backups should be exported periodically; future versions should migrate durable user data to an app-controlled directory or SQLite. Importing a backup replaces existing data after confirmation.

### Build resources

GitHub Actions generates macOS icons from `src-tauri/app-icon.svg` using `npx tauri icon src-tauri/app-icon.svg` before attempting Tauri bundling. A missing `src-tauri/icons/icon.png` previously prevented a successful desktop build.

### Isolation contract

The Vercel project `center` uses `ap-reasonlab/` as its Root Directory. The Tauri app lives entirely in `apps/daily-desk/`, and the separate GitHub Actions workflows build macOS artifacts. Do not import desktop-only code into the website's Next.js bundle.

## Native storage and backup (v0.3 preview)

The **Tauri desktop app** stores workspace data as `workspace-v2.json` in its OS-managed application-data directory, resolved by Tauri's `app_data_dir()` API. Writes are serialised by the React client and written using a temporary file, sync and rename on the Rust side to reduce corruption risk. The **browser preview** continues to use the previous localStorage-based store; the desktop app only migrates previous WebView data when no native workspace file exists.

- The local workspace is **not uploaded** to the AP website, Vercel or any server.
- Backups use the macOS native Save/Open dialogs through Tauri and contain all tasks, cards and notes.
- Import requires explicit confirmation before replacing the workspace.
- Native storage has a 3 MB data limit for this version; use exports to move between machines.
- If an existing native file cannot be read, the app does **not** automatically overwrite it. Make a manual backup or restore through the UI.
- Desktop app releases use the `daily-desk-vX.Y.Z` tag prefix; this is currently a preview, not a notarized/signed release.

### Test checklist

1. Add a task, flashcard and note; quit and reopen the app; verify all three survive.
2. Export JSON through the native Save dialog, edit the workspace, import the backup and confirm restoration.
3. Cancel the import and export dialogs; verify no data is lost.
4. Start a Focus session and navigate to other tools; the timer must continue.
5. Push app-only changes and verify Vercel skips a new AP web deployment.

## v0.5 preview: daily workflow parity improvements

- Study deck names per flashcard, due-today filter, and simple interval-based reviews with **Again / Good / Easy** ratings.
- Backward-compatible parsing for older flashcards that only contain a front/back question and answer. Restore and backup retain review metadata.
- PDF desk supports saving selected pages together as one PDF, or individually as multiple one-page PDFs inside a ZIP (maximum 50 pages).
- This scheduling system is intentionally simple; it should not be represented as the AP website's full study engine or a validated spaced-repetition algorithm.
- Versioned desktop CI covers frontend build, Vitest, Rust tests and DMG bundling before integration.

## v0.6 preview: additional easy web tool equivalents

- Offline short-code URL bookmarks saved as local presets (no public redirect service).
- Reading passages with colored selection highlights and margin notes.
- Temporary paste-to-flip cards, and random single-name selection.
- Vector addition/subtraction and explicitly chosen significant-figure rounding.
- White/pink/brown/soft locally synthesised focus audio beds (not streamed recordings).

The desktop program remains separate from the AP website. These changes are not equivalent to web-hosted AI, speech recognition, or all advanced mathematics tools.


## v0.7 preview: offline math and document tools

- **Math calculus tab:** numeric f(x), derivative, tangent, Simpson integral, sign-changing root detection and intersections. Calculations are local approximations; singularities and touching roots need extra care.
- **Word preview:** import a `.docx`, review its converted Markdown, send that content into the persistent Writing Desk, and open the system Print / Save PDF dialog where the macOS WebView supports it.
- DOCX→PDF is **not pixel-identical** to Microsoft Word layout. Complex tables, figures and pagination may differ.
- v0.7 is gated by TypeScript, Vitest, Rust tests and macOS DMG CI before integration. Real Mac printing interactions still need user verification.

## v0.8 preview: richer offline authoring

- **Advanced Grapher**: Multiple Cartesian graphs, polar and parametric curves, drag/scroll or button zoom, panning and local SVG export.
- **PDF previews**: Browser-worker-based PDF.js thumbnails (8 at a time), chosen-page preview, and page selection for existing split/rotation tools. Preview is disabled for PDFs over 25 MB.
- **Document editor**: Local Markdown toolbar, find-and-replace, undo/redo, templates, document outline, split/edit/preview views, Markdown/plain-text import, and basic DOCX generation using the `docx` library.
- **No cloud uploads** are required for these modules. The desktop source continues to be separate from the `ap-reasonlab/` Next.js website.
- Word export simplifies rich styles, equations and tables; verify the output using a desktop Word reader. Print-to-PDF still depends on macOS WebView behavior.

## v0.9 one-click bulk migration

- **All tools / 全部工具**: searchable navigation index for the offline equivalents of Knowledge Explorer everyday tools. Choose an item and jump directly into the relevant module rather than navigating separate tabs.
- **Code editor**: local code text editing with language-specific templates, file import, find/replace, JSON formatting, plain-text export, and saved code snippet integration.
- **Calculator extras**: BASE-N conversion (BigInt integers), quadratic equations, 1-variable sample/population statistics, and 2×2 simultaneous linear equations.
- **CSV text-file import**: choose .csv or .tsv and process its data locally.
- The existing math, file, writing, study, English, classroom and quick tools remain part of the app. The internet-dependent AI backend, automatic speech recognition and shared/public cloud tools are not described as offline ports.
- All changes are restricted to `apps/daily-desk/` and do not affect the AP website on Vercel.

## v0.10 offline office tools

- **CSV Table Desk:** opens local `.csv` or `.tsv` files or pasted content, up to 2 MB / 2,000 rows / 100 columns. Includes searching all/one column, numeric-aware sort, deduplicate whole rows, first-80-row preview, non-destructive filtered exports in CSV, JSON and Markdown. CSV output guards against opening untrusted formula-like cells in spreadsheet programs.
- **PDF organizer:** `File desk → PDF → Organize` takes explicit one-based page order such as `3,1,2,5-7`; omitting a page removes it. Rejects duplicate or out-of-range page numbers, saves a new PDF and preserves original.
- **Image batch:** `File desk → Images` can convert up to 12 local JPEG/PNG/WebP images to a common format/width and save a single ZIP. Conservative per-file, pixel and ZIP-size limits protect memory on 16 GB Apple Silicon machines.
- The searchable All tools catalog includes the new entries; no AP ReasonLab website code is changed.
- Notes: CSV is a flat table utility, not an XLSX formula editor. PDF editing rearranges page objects, not internal PDF text/annotations. Batch image conversion handles raster input only. Mac WebView interaction remains to be verified after CI build.

## v0.11 local PDF text, Word formatting and batch rename

- **PDF text desk** is available under `File desk → PDF`: opt-in text extraction using a bundled PDF.js worker, per-page text search with match counts, and TXT/Markdown export. Limits: 25 MB, 300 pages, 1 million extracted characters. Scanned PDFs without selectable text need OCR; this feature does not claim OCR support. No network uploads.
- **Word DOCX export** preserves common inline Markdown formatting such as bold, italic, strikethrough and inline code, and writes actual Word bullet lists instead of plain bullet characters. Headings remain native Word headings. Rich tables, equations, hyperlinks, precise layout and embedded assets are not reproduced.
- **Batch rename** adds one-click ZIP export of renamed copies, not 50 separate save dialogs. It enforces 50-file / 16 MB input bounds, checks duplicate names, and preserves originals. Single-file export remains available.
- Main app version 0.11.0. All changes are confined to `apps/daily-desk/**`; AP ReasonLab website is unchanged.
- **Acceptance boundary:** GitHub Actions tests and DMG packaging verify buildability, not macOS WebView PDF preview/print or Word document rendering fidelity. Manual on-device verification is still necessary.

## v0.12 website-parity checkpoint

- Added [44-entry source audit](WEB-TO-DESKTOP-AUDIT.md): **19 core equivalents**, **22 partial/non-identical**, **3 intentionally unported/external**. The catalogue includes hidden aliases, so these numbers do not represent 44 independent applications.
- Text comparator: aligned line differences and word highlights with safe complexity bounds, case/whitespace options, similarity estimate and full local diff export.
- Markdown ↔ plain text: two-way conversion, optional URL retention, input/output swap, word counts and local save.
- Image desk: on-device mouse/stylus annotation, adjustable pen, undo, save new PNG; constrain image resizing by both width and height, preserving aspect ratio.
- All changes remain under `apps/daily-desk/**`. No remote API or website changes, no Ollama dependency.
- The interactive Mac UI (pointer capture, clipboard and file dialogs) still needs real-device acceptance tests.

## v0.13 interactive image crop and website formula parity

- **File Desk → Images → Interactive crop**: drag the on-image crop rectangle, choose a fixed aspect (free/1:1/4:3/16:9/3:2), change width/height via sliders, rotate in 90° steps and save a full-source-resolution cropped PNG. Crop and source are bounded to 20 million pixels; selected images ≤8 MB. The original image remains unchanged.
- **Math → Formula Board**: migrated the website's complete `ap-reasonlab/data/formula-board.ts` category dataset to desktop `src/lib/formulaBoard.ts`. Added category switching, search, LaTeX/plain copy, local favorites and Markdown favorites export, replacing the previous 8-formula sample.
- **Audit quality**: repaired malformed slash-separated description text in the 44-entry parity audit. Formula board now counts as a core desktop equivalent; image UX remains partial until hands-on validation.
- **Project isolation**: all modifications are under `apps/daily-desk/**`; AP web source and Vercel settings are unchanged.
- **Limits**: no OCR, no AI/cloud services, no guarantee of macOS pointer/print fidelity without manual acceptance; neither crop nor annotated export overwrites the imported image.

## v0.14 unit and constant parity (reconciled with v0.13)

The existing v0.13 main branch already contains interactive crop/rotate and a full Formula Board from PR #284; **this release preserves those components unchanged** rather than introducing duplicate versions.

- Migrated the original website's eight unit categories (Length, Mass, Energy, Speed, Force, Pressure, Charge, Time), including Å, atomic mass units, elementary charges and selected engineering units.
- Added °C / °F / K conversion with an absolute-zero sanity check.
- Added all fourteen reference physical constants, searchable, with copy and calculator insertion.
- Added deterministic unit tests for category/constant counts, precise unit factors and temperature calculations.
- Still local-only, no cloud AI or speech-to-text. macOS GUI acceptance testing remains necessary.

## v0.15 preview: advanced calculator modes

The local Math Workbench now has a separate **ClassWiz** tab (also available from **All tools**). The four additional modes are:
- **Complex**: parse real/imaginary scientific notation, add/subtract/multiply/divide, conjugate, magnitude, and argument in degrees.
- **Matrix**: 2×2 / 3×3 square matrices, add/subtract/multiply/transpose, determinant, and numerical inverse with partial-pivot singular checks.
- **STAT 2-var**: paired observations, sample SD, sample covariance, Pearson r, linear regression slope/intercept and R²; constant-X inputs are rejected and constant-Y correlation is labelled undefined.
- **DIST**: normal PDF and lower-tail CDF (numerical approximation), binomial PMF and lower-tail CDF (max 200 trials).

Tests exercise representative values, malformed inputs, singular matrices, complex divisions and distribution edge cases. All implementations live only in `apps/daily-desk/`. This is a functional expansion, not a claim of complete pixel-identical ClassWiz parity or macOS on-device QA. The existing basic calculator, numerical methods, formula board, image crop, unit conversions, and website source remain untouched.

## v0.16 preview: small daily tools and explicit external links

**Quick Tools / 快捷小工具** (also searchable through All Tools) adds four local-only workbenches:
- **Text cleaner**: remove invisible artifacts, normalize copy/paste whitespace, optionally deduplicate lines, drop blanks or join wrapped lines. No background clipboard monitoring.
- **Tracking-link cleaner**: strip common analytics tags such as `utm_*`, `fbclid`, `gclid` while keeping non-tracking parameters and anchors. Manual copy/export. Does not expand redirects or visit websites.
- **Date planner**: date interval and signed offsets in UTC calendar days, avoiding time-zone/DST hour problems. Date range 1900–2100.
- **Weighted grade planner**: calculate graded work average, remaining required average and best possible course score. Explicit `?` markers for future categories, and weights must total 100%.

**External Tools / 外部工具** is now a separate sidebar item with category/search and official URLs for PDF24, ZoteroBib, Overleaf, Desmos, GeoGebra, Wolfram|Alpha, diagrams.net, Excalidraw and Photopea. Each external site is launched explicitly through the Tauri system browser opener (or a separate browser tab in preview). No embedding, silent redirects, automatic file transfer or site credentials.

The full feature suite remains separate from `ap-reasonlab/`; only `apps/daily-desk/` changed. The desktop release is still a preview, and macOS WebView/browser-opening and export UX must be manually tested. Online services have their own account/privacy/pricing terms; listing them is not a guarantee they are ad-free.

## v0.17 preview: PDF Freedom Studio (offline overlays)

The existing **File desk → PDF** now includes **Add text / sign / watermark**, also accessible directly from All tools. It provides four on-device PDF operations, without uploading to the AP website or a paid service:
- Add a short **selectable text label** at a predefined corner/centre, on all or selected pages.
- Add a translucent **diagonal watermark** to selected pages.
- Add **sequential page numbers**, with optional prefix/suffix and start value, in selected-page order.
- Add a local **PNG/JPEG signature or illustration** as a scaled image overlay on selected pages.

A local **TTF/OTF** file can be optionally embedded for Chinese and other Unicode text. Without a custom font, text is restricted to printable ASCII with clear guidance, rather than mangling glyphs. The editor generates a new PDF preview locally and offers non-destructive save. A generated overlay is not a secure redaction and is not a replacement for editing original PDF text. It does not provide certified electronic/digital signing, flattening interactive forms or an advanced OCR engine.

Safety limits: PDFs ≤25 MB / ≤300 pages, overlays ≤120 characters, image inputs ≤8 MB, font input ≤12 MB, export ≤20 MB. Some rotated pages require visual checking. The original PDF is never overwritten; all output is exported through the existing native file save dialog. CI verifies TypeScript, tests, Rust and Apple Silicon packaging; visual WebView preview and Mac print fidelity require real-device acceptance.

The website `ap-reasonlab/` remains entirely separate; no new cloud upload, authentication or subscription is introduced.

## v0.18 preview: local PDF/image conversions

In **File desk → PDF → Image ↔ PDF**, you can now:
- Convert **1–12** local PNG/JPEG files into a multi-page PDF in the file-picker order, with A4, US Letter or image-aspect page sizes. Each image must be ≤8 MB, all inputs combined ≤25 MB.
- Render **up to 12 selected PDF pages** at a time into lossless PNG or JPEG images, placed together in one ZIP export. User-selected scale (0.75–2x), maximum 4 million rendered pixels per page, maximum 18 MB for image content and 20 MB output ZIP.
- Keep all documents on-device with existing PDF.js local worker and `pdf-lib`. No online conversion API, file uploads, account gates or PDF watermarks are introduced.

PDF-to-images is raster output and does not retain searchable text; original PDF remains unchanged. Some EXIF-oriented photographs may require prior rotation; Mac WebView dialogs/render behavior still require on-device QA.

## v0.19 preview: Universal Toolbox (beyond PDF)

Added a dedicated **Universal Tools / 综合工具** sidebar view and five All Tools shortcuts. These are new desktop tools, not claims that existing web tools reached full parity:

- **JSON records → CSV**: accepts a bounded flat JSON array (up to 2 MB, 2,000 records and 100 columns); rejects nested objects rather than silently flattening them; uses the existing CSV export sanitizer to prevent spreadsheet formula execution. The reverse CSV→JSON flow remains in CSV Table Desk.
- **World meeting clock**: a single explicit UTC reference minute rendered in ten global IANA timezones, with daylight-saving changes handled by the operating system timezone database. Input is intentionally UTC to avoid ambiguous local clocks at DST transitions.
- **SHA-256 file verifier**: user-picked file up to 20 MB, hashed locally with Web Crypto, with an optional published digest for comparison. Matching checksums confirm byte-for-byte agreement, not publisher trust or document safety.
- **Secure password generator**: system cryptographic randomness with unbiased index selection; configurable 8–64 characters and guaranteed inclusion of each enabled character group. Passwords are never stored in the Daily Desk workspace or transmitted.
- **Photo metadata cleaner**: re-encode PNG/JPEG/WebP pixels to a new PNG/JPEG/WebP via local Canvas (≤8 MB input, ≤20 million pixels). This ordinarily drops the original EXIF/location/comment tags but is not a certified metadata audit. Orientation, transparency and colour profiles can change.

No account, subscription, internet lookup or cloud API is required for these features. All operations stay in the standalone `apps/daily-desk/**` project. File imports are explicit and originals are unchanged. Real macOS WebView checks remain required after CI (especially image codecs, file dialogs and clipboard permissions).

## v0.20 preview: Universal Box · freely reproducible everyday generators

Added a dedicated **Universal Box / 万用工具箱** section. New offline features:

- **QR Studio**: plain text/URL, local Wi-Fi network and vCard contact QR codes; save unbranded PNG and vector SVG. Generate up to 40 named static QR SVG files in a ZIP archive (duplicate filenames are safely uniquified). There is no remote link redirect, scanning analytics or service-based expiration.
- **Calendar file maker**: generate an RFC 5545 `.ics` event with UTC start/end, location and notes; import it into a calendar app. This is *not* a calendar booking, invitation sending or synchronization system.
- **UUID v4 generator**: generate up to 100 cryptographically random UUID identifiers on-device, with copy and TXT export.

Supported generated formats `.svg`, `.zip`, `.ics` and `.txt` pass through the existing explicit save dialogs and 20 MB maximum output guard. Please keep QR foreground/background contrast high. Printed Wi-Fi QR includes its network password and should be shared only with people authorized to use that network.

For scope and evidence from official vendor pricing pages, see **[UNIVERSAL-BOX-ROADMAP.md](UNIVERSAL-BOX-ROADMAP.md)**. The new QR Studio complements, rather than removes, the existing single-code QR tool. The application continues to operate without required user accounts, advertising, subscription checks or automatic network requests.

## v0.21 preview: Universal Box Lab (free text, subtitle, image and URL tools)

**Universal Box Lab / 更多免费小工具** is a new desktop workspace with four real local processing tools (also searchable from All Tools):

- **Batch line editor:** trim, deduplicate, discard blank lines, sort A→Z or Z→A, convert case, add user-defined line prefixes/suffixes. Up to 200,000 source characters and 20,000 lines. Output copy/TXT export includes full text, with a shortened in-app preview on large results.
- **Subtitle SRT ⇄ WebVTT:** import SRT/VTT or paste subtitles; convert timestamps and shift every cue by ±1 hour in whole milliseconds. Preserve basic multiline subtitle text and Unicode; explicitly reject unsupported WebVTT cue settings/STYLE/REGION instead of silently dropping them. Output as a new `.srt` or `.vtt`, up to 1,000 cues / 2 MB source text. This does **not** transcribe speech, translate subtitles or preserve advanced WebVTT layout features.
- **Photo contact sheet:** combine 1–12 local PNG/JPEG/WebP source images into a labelled, aspect-preserving tiled PNG/JPEG output. Choose columns, cell size, gaps and captions. Input bound: 8 MB per image, 24 MB total; each decoded image ≤8 million pixels and output canvas ≤12 million pixels. Originals stay unchanged. EXIF orientation, colour profiles and animated image behaviour may vary in the macOS WebView.
- **URL inspector:** parse a full HTTP(S) URL locally into scheme, host, origin, path, fragment and decoded query parameter pairs; duplicate query keys are preserved. No navigation, link fetching, reputation service or phishing detection is performed.

The source code remains under `apps/daily-desk/**`, isolated from the AP ReasonLab website. No added advertisements, accounts, uploads, subscription enforcement or remote processing. File conversion limitations and normal local-memory safety ceilings remain visible. Core helpers and geometry have deterministic Vitest coverage; CI builds the Apple Silicon macOS package. Real-device WebView checks remain necessary for image codecs, file dialogs and text rendering.

## v0.22 preview: Universal Box Media & Files

Four new local desktop tools with no account, paywall, cloud upload or forced online conversion:

1. **WAV Studio**: safe bounded processing of **RIFF WAVE uncompressed signed 16-bit PCM** files (mono/stereo, 8–192kHz, ≤20 MB). Trim a selection, normalize conservatively toward 95% peak with gain capped at 4×, and optionally add fades (0–1.5s). Exports a *new* PCM WAV file; **not** MP3, speech recognition, compressed WAV, multitrack mixing or mastering.
2. **Read-only ZIP Inspector**: parse up to 1,500 central-directory entries, ≤20 MB archive. Show filenames, declared compressed/uncompressed byte counts, file methods, and warnings for suspicious traversal/absolute paths, symlinks, encrypted files, unsupported methods, extreme expansion ratios or >500 MB total declared extraction. **Never extracts or executes files**. Not malware detection, validated decompression or a security guarantee; ZIP64 and multi-disk ZIPs are unsupported.
3. **Icon Size Bundle**: PNG/JPEG/WebP picture (≤6 MB, ≤8 million pixels) → seven transparent PNG sizes (16, 32, 48, 64, 128, 256, 512 pixels) with proportional letterbox fitting, collected as a ZIP. No platform badge, proprietary template or source image modification.
4. **Dominant Image Palette**: offline RGBA pixel sampling (max 20,000 samples; transparent pixels excluded) with approximate 4-bit RGB histogram colour groups, top 1–12 HEX colours and relative frequencies. The grouped results are approximate, not official Pantone or design-brand measurements.

These are searchable in All Tools, with a dedicated **Media & Files / 媒体文件工具** sidebar and four deep-link modes. The existing PDF tools, QR tool, photo contact sheet and v0.19–v0.21 utilities remain intact. Sources are explicitly picked by the user, local CPU/memory constraints apply, and export creates new files through the existing user save dialog. Apple Silicon CI covers TypeScript, Vitest, Rust and DMG, but visual macOS WebView acceptance must be checked on an actual Mac.

## v0.23 Universal Box — Office & Privacy (offline desktop)

Added a dedicated **Office & Privacy / 办公与隐私工具** page and four searchable tools:

- **CSV contacts → .vcf**: import a CSV or paste rows, recognize Name/姓名, Phone/电话, Email/邮箱, Organization/公司 and Website/网址, validate 1–300 contacts, escape/fold Unicode vCard 3.0 text, and export one standard .vcf file. Other CSV fields are deliberately not included. Never uploads or syncs a user's contacts.
- **TXT mail merge → ZIP**: fill an explicit text-only template with exact `{{ColumnName}}` placeholders from user-provided CSV; save up to 100 separately numbered TXT files inside ZIP. Does **not** email recipients or generate executable templates. Output ZIP entry paths use internal sequential numbers rather than user input.
- **Local SHA-256 duplicate finder**: compare actual bytes of 2–30 user-selected files, max 20 MB each / 80 MB total. Matching SHA-256 fingerprints are strong practical evidence of byte equality, not an authenticity check. Only selected files are read; no automated deletion or folder crawling.
- **Unicode hidden-mark inspector**: report precise positions of zero-width, bidirectional override/isolate, control and selected formatting characters. No automatic stripping, and presence of a character is not automatically malicious. Not a full Unicode confusable-spoofing detector.

### Native-save regression repair

Previous v0.19–v0.22 frontend exports already offered `.ics`, `.srt`, `.vtt`, and `.wav`, but the Tauri Rust output writer still only allowed the older extensions. v0.23 explicitly updates the Rust output whitelist to accept those prior outputs **and** new `.vcf`; adds Rust tests for allowed/blocked extensions. This fixes the macOS save mismatch without loosening arbitrary executable file exports.

All four features run locally without subscriptions, ads, accounts or background file access. New files are saved only after explicit user action through existing safe desktop dialogs. The AP ReasonLab website is not modified. CI validates frontend typechecks, Vitest, Rust tests and Apple Silicon DMG build; macOS visual/manual acceptance still needs actual-device testing.

## v0.24 — Workflow Studio: safe ZIP selection and offline multi-image pipeline

Adds a new desktop **Workflow Studio / 批处理工作室** and two searchable tools:

1. **Safe ZIP selective extraction to a new ZIP**: choose 1–30 regular ZIP members and export only those files, under sequential `extracted/file-001.ext` names in a new ZIP plus `manifest.json` identifying original names. Inspection rejects malformed/overlapping archives, unsafe traversal paths, symlinks, encrypted entries, unsupported compression, ambiguous filenames and duplicate/normalization-colliding paths. Streaming inflate checks actual output byte ceilings and matches declared uncompressed length **and CRC-32**. Limits: 20 MB source ZIP, 500 entries, 7 MB per member, 12 MB selected total, 300× maximum declared expansion. The original ZIP remains untouched. **This is not an antivirus engine and never extracts into user-specified original paths.**
2. **One-click image workflow**: select 1–12 PNG/JPEG/WebP images (≤6 MB per file, ≤30 MB combined, ≤8 million pixels each), choose max dimension 512/1024/2048 and output PNG/JPEG/WebP, set encoding quality and filename prefix; the app sequentially resizes → re-encodes → safely renames → assembles images into an optional-manifest ZIP. JPEG composites transparency onto white. Total ZIP ≤20 MB. No originals are modified or remotely uploaded.

Both features use the existing explicit native save dialog and preserve v0.23 export permissions. The tools are designed for bounded local processing, not arbitrary large-archive bomb protection, exhaustive malware classification or forensic metadata guarantees. Automated tests cover selected ZIP extraction, CRC tampering, Unicode names, traversal/collision rejection and image pipeline planning. Manual macOS WebView testing remains a separate acceptance step.

## v0.25 — Free Formats Lab: basic Excel, image comparison and text codecs

New desktop **Free Formats / 格式自由工具** workspace, with three searchable tools and no remote processing:

- **CSV → XLSX / XLSX → CSV or JSON:** pure local JSZip Office Open XML interchange, no paid Excel API. CSV-to-XLSX writes each field as a true inline **text** cell so leading zeros, Chinese characters and values that begin with `=` cannot become Excel formulas. The reader supports simple first-sheet data, inline and shared strings, numeric/boolean cells, and *cached* formula values only. It reads up to 1,000 data rows × 50 columns, ≤4 MB XLSX input, bounded decompressed XML and ≤600,000 characters of text. **Not** a spreadsheet editing engine: no formula calculation, formatting preservation, chart conversion, macros, external workbook links, unsupported relationships or multiple-sheet import. Excel date serial numbers may be displayed unchanged.
- **Image difference / overlay:** user selects two images of identical dimensions, PNG/JPEG/WebP up to 6 MB each and 4 million pixels. Local Canvas compares maximum per-channel pixel change, highlights changed pixels in pink, reports exact compared-pixel count and saves a newly generated difference/overlay PNG. Includes tolerance and adjustable overlay blend. Transparent input is composited on white. Differences may reflect image decoding/colour profiles rather than actual photographic changes.
- **HTML entities & Unicode normalization:** basic HTML-sensitive-character escaping, selected common HTML entity decoding (plus numeric entities), explicit Unicode NFC and NFKC transformations. All results remain plain text, not executable HTML. Unrecognized named entities stay unchanged; NFKC can change compatibility characters and should be reviewed before export.

All three tools use explicit local input/output, preserve prior Universal Box workflows and keep the 20 MB native export ceiling. Native Apple Silicon CI performs TypeScript, Vite, Vitest, Rust and DMG packaging; manual macOS tests remain a separate acceptance step. Chinese/English **OCR has not been implemented** here: reliable offline recognition requires language model distribution and real-world image tests.

## v0.26 — Universal Box visual redesign and offline Data Chart Studio

The desktop UI has a substantial coordinated visual update while preserving existing tools and saved workspace data:

- **Application shell:** new Universal Box dashboard, soft indigo modern card design, typography/spacing/hover/focus upgrades, grouped collapsible left navigation, compact persistent top bar, enhanced category-based tool launcher, quick access controls and responsive compact-sidebar mode. The desktop bundle's internal app name remains Daily Desk for backward compatibility.
- **Theme:** light/dark switch with local-only preferences, improved focus outlines and reduced-motion support. Dark mode covers the primary shell and major components; older chart previews and some specialized legacy modules may require later visual QA.
- **Command launcher:** `⌘K` on macOS / `Ctrl+K` on other keyboards shows an in-app searchable command palette covering workspaces and indexed tools; Enter opens the first matching result; Escape closes. No remote search requests.
- **Favorites & recents:** star workspaces from the top bar and individual tools from the All Tools directory, show pinned workspaces and recently opened destinations on the dashboard. Preferences live in localStorage (UI convenience only), separate from the persisted JSON user workspace. Optional localStorage failures do not block normal tools.
- **New Data Chart Studio:** import CSV (≤120 KB, ≤700 rows, ≤25 columns), choose group/value columns, sum/average/count, and bar or connected-line chart. Produces a sanitized, fully local vector SVG preview/export and aggregated CSV. Up to 24 distinct categories; invalid numeric values are rejected, blanks are skipped for sum/average. SVG text is XML-escaped, contains no embedded scripts, and is usable offline.

The new charts are added to the searchable All Tools catalog and main navigation. The previous PDF, study, office, ZIP, image, WAV and format-conversion modules are left intact. Automated tests include chart statistics, mixed-sign and missing data, SVG escaping and limits. CI builds TypeScript/Vite/Vitest, validates Rust and packages Apple Silicon macOS DMG. **Automated CI is not equivalent to full visual inspection on a physical Mac**; UI acceptance still requires a real-device pass.

## v0.27 — Four free everyday PDF mini editors

A dedicated **PDF Mini Editor / PDF 日常编辑** workspace and four searchable tools extend the existing merge, split, page order, watermark and image conversion features. All user-selected PDFs are processed locally, and all exports go through the existing explicit save dialog.

1. **PDF standard properties** — inspect page count, page size, rotation, title/author/subject/keywords/creator/producer; edit title, author, subject and keyword fields. Max input 15 MB, 1–200 pages. **Not anonymization:** embedded XMP packets, attachments, revision history, invisible data, producer and creator traces may remain.
2. **Visual PDF crop margins** — trim left/right/top/bottom display margins by percentage on all pages or a selected page using PDF CropBox. Content outside the visible region may remain inside the PDF; **not redaction or deletion**. Dimensions and existing CropBox are respected; percent inputs are bounded.
3. **Insert blank PDF pages** — choose a 0-based insertion position relative to existing page count, add 1–10 blank A4/Letter/first-page-size pages. Original pages are retained.
4. **Existing AcroForm text field filler** — inspect standard text form names/values and fill writable text fields. Baseline supports printable English/ASCII only, maximum 40 edits and up to 500 chars/field. XFA, rich text, non-text form controls, digital signatures and Unicode/CJK appearance embedding are not supported.

A file preview exposes page thumbnails and can select the target crop page. The existing PDF features and other Universal Box workspaces remain unchanged. Automated unit tests generate actual PDFs and reopen the edited results for verification. The manual native macOS acceptance/visual review step is still required.

### Why these small utilities?

The official pricing tables from iLovePDF and Smallpdf show that PDF crop, form editing, OCR, organizing and other day-to-day file tasks are marketed in freemium subscription bundles, although many basic operations have mature open-source implementations. That does not establish the relative search popularity of each tool. The project prioritizes high-reuse, local-first utilities and avoids claiming subscription fees are universally illegitimate.

Do not promise full PDF content editing, professional OCR, true redaction, digital certificate signing or complete Office document round trips unless the corresponding engines and QA exist.

## v0.28 Universal Access — a more inclusive offline toolbox

Adds a dedicated **Universal Access / 无障碍与工具助手** workspace with two searchable entrances:

- **No-jargon Universal Helper:** Users can write a short, ordinary-language Chinese/English task such as “把三张照片合成PDF”. A local, deterministic pattern matcher recommends only tool IDs that exist in the shipped `LOCAL_TOOLS` index, links directly to each workspace, and explains step-by-step use and limitations. No language-model API, telemetry, cloud processing, clipboard monitoring or background file access. Unrecognized input yields a truthful no-match state. Unsupported offline OCR is explicitly marked **not implemented**.
- **Readable interface settings:** opt-in standard/large/extra reading sizes across primary app components, higher-contrast styling, simplified homepage and user-requested reduced motion. Settings persist **only in localStorage**; unavailable storage quietly falls back to in-memory settings. No accessibility certification is claimed: large-print style covers the primary shell and core components, but legacy specialist submodules and full 200% reflow require manual review.
- **Keyboard and focus improvements:** visible skip-to-main-content link, toolbar entry for accessibility settings, labeled navigation, a global ⌘/Ctrl+K launcher that moves focus to search, traps Tab/Shift+Tab inside the modal and restores previous focus on close; background panels become inert. Escape closes. Tool preferences remain separate from the user's persisted tasks/notes backup.
- **Brief usage guide:** three simple stages (describe → review → export), sample phrases, honest privacy constraints, direct link to local backup center.

Guidance follows W3C WAI principles including keyboard access, visible focus and sensible resizing. These improvements move toward accessibility, but are not a formal conformance audit. Existing 79 previously searchable entries remain; 2 accessibility entries were added, and the already available Chart Studio received its previously missing searchable index entry.

This work supports digital public-interest software by making common tools easier to discover without required accounts, ads, paid quotas or uploading private files. It does **not** claim that a desktop app alone creates a political or economic system. No new license is imposed on existing repo authors or third-party contributors.

## v0.29 — Easy Local AI transplanted from AP Website (one mode only)

Universal Box now has a dedicated **Easy Local AI / 本地 AI** workspace built around **WebLLM 0.2.82** and WebGPU, using AP ReasonLab's curated, light Qwen and Llama model IDs. This is intentionally a single local-browser-inference mode: **no Website API, BYOK, API keys, hosted inference, or Ollama**.

### What actually works in a WebGPU-capable environment

- Explicit WebGPU adapter detection and a simple Chinese/English AI chat window, with locally streamed text, clear conversation, stop generation and model unloading. Chats stay in transient UI memory and are not automatically saved.
- WebLLM lazy-loads only when the user opens the AI workspace and chooses a model. The page does not preload GPU models, download anything by itself or wake a native daemon.
- Curated Qwen 0.6B / 1.7B, Qwen2.5 Micro/Coder, Llama 1B/3B models are selected from the AP Website. Model loading shows progress and uses a dedicated Web Worker when supported, falling back to main-thread WebGPU if the worker fails.
- Browser-managed IndexedDB cache can be inspected and selected models explicitly deleted after a confirmation. First download needs internet and disk space; cached models may work offline, subject to browser cache retention.
- The Tauri CSP permits WebLLM worker/WASM and model downloads from Hugging Face/model library hosts. It does **not** enable arbitrary AI API calls or execute local shell processes.
- Optional **browser fallback**: enter the real HTTPS origin of your AP Website; the app can open its `/easy-local-ai` page in your default browser. The URL is stored locally and no prompts/files are attached. Hugging Face Models/Spaces buttons are separately marked as third-party online services.

### Compatibility boundaries

**macOS Tauri uses system WKWebView.** Whether WebGPU / WebLLM actually works inside the app depends on the OS, GPU drivers and WebView; a green TypeScript/CI/DMG build does not demonstrate hardware WebGPU support. If GPU is unavailable, use the AP Website in a compatible external browser (Chrome/Edge etc.). The two browser engines use separate caches. Model downloads can be hundreds of megabytes or more; there is no bundled model in the small DMG. AI outputs can be wrong and should be checked, especially for application materials.

Existing PDF, office, text, image, math, and AP study tools are preserved; AP ReasonLab website code remains unchanged.
