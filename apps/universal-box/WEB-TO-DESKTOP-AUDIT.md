# Knowledge Explorer → Daily Desk: source-by-source feature audit

Audit date: 2026-10-19. Compared with the website's `ap-reasonlab/data/study-tools.ts` catalogue and `ap-reasonlab/data/tool-workbenches.ts`. This is an **implementation coverage audit, not a claim of pixel-identical UI parity or on-device QA**.

Website catalogue includes **44 entries**, including hidden aliases/deep-links and externally hosted functionality. Classified as **21 core desktop equivalents**, **20 partial / non-identical equivalents**, **3 not ported / intentionally external**. A core equivalent means the main local job works, *not* that every website knob or workflow is identical.

| Website tool ID | Current status | Evidence / remaining difference |
| --- | --- | --- |
| `ai` | Not ported / intentionally external | Cloudlocal LLM configured API workbench not copied into standalone offline app. |
| `calculator` | Partial / non-identical | Scientific operations exist; complete ClassWiz mode parity not verified. |
| `grapher` | Partial / non-identical | Cartesianpolarparametric plotting exists; web graph interactionfeatures still differ. |
| `math-pad` | Partial / non-identical | Math modes broadly present; full website functionality not verified. |
| `focus-desk` | Partial / non-identical | Timer and generated noise implemented; original audio recordingsrain features differ. |
| `timer` | Core desktop equivalent | Integrated with Focus Timer; hidden website alias. |
| `flashcards` | Core desktop equivalent | Instant pasted flashcards on the learning desk. |
| `mistake-notebook` | Core desktop equivalent | Local error log and review. |
| `exam-countdown` | Core desktop equivalent | Local scheduled exam countdown. |
| `code-board` | Partial / non-identical | Snippet library present; full website commentingcode hub UX differs. |
| `word-count` | Core desktop equivalent | Wordscharacterssentencesreading estimate. |
| `vocab-book` | Partial / non-identical | Saved flashcards exist; website vocab workflow differs. |
| `speech-to-text` | Not ported / intentionally external | Mic recordingWhisper transcription is not ported. |
| `dictation` | Partial / non-identical | Mac speech synthesis varies by WebView and voice availability. |
| `paraphrase` | Partial / non-identical | Overlap comparison, not full website interactive metrics. |
| `reading-highlight` | Partial / non-identical | Color highlights and notes exist; rich website behavior differs. |
| `formula-board` | Core desktop equivalent | Migrated full canonical AP formula collection: categories, cross-category search, LaTeX and plain copy, local favorites and Markdown favorites export (v0.13). |
| `latex` | Core desktop equivalent | KaTeX preview in math and writing desks. |
| `units` | Core desktop equivalent | All eight source categories, °C/°F/K, 14 constants, copy and calculator handoff (v0.14). |
| `sci-notation` | Partial / non-identical | Notation and sig figs, some classroom rounding cases differ. |
| `vector-resolve` | Partial / non-identical | 2D vectors; diagram and all advanced interaction not identical. |
| `write-convert` | Partial / non-identical | Workbenches exist; wizard step-to-step handoff parity missing. |
| `dual` | Core desktop equivalent | Split Markdown writer and live preview. |
| `typewriter` | Core desktop equivalent | Line reveal practice. |
| `draft` | Partial / non-identical | Drawing board implemented, not all website drawing controls. |
| `word-pdf` | Partial / non-identical | DOCX→Markdown→print path is not pixel-faithful and needs macOS print verification. |
| `word-import` | Partial / non-identical | DOCX→Markdown works but complex tablesmediaformat may be lost. |
| `markdown-pdf` | Partial / non-identical | Live print preview, but native printPDF layout must be manually validated. |
| `pdf-tools` | Core desktop equivalent | Merge, split, rotate and selectreorder pages, local preview; PDF text extraction added v0.11. |
| `pdf-compress` | Partial / non-identical | Light PDF object optimization only; not image recompression. |
| `csv-markdown` | Core desktop equivalent | Local CSVTSV parsing and Markdown table. |
| `markdown-plain` | Core desktop equivalent | Two directions, link retention, swap, copy and local export (v0.12). |
| `batch-rename` | Core desktop equivalent | Rename preview, per-file copy and ZIP batch export. |
| `image-compress` | Partial / non-identical | Resizing, JPEG/PNG/WebP conversion, crop, caption, batch ZIP, pen annotation and interactive crop/rotation are implemented; some web image interactions remain non-identical. |
| `image-crop` | Partial / non-identical | Draggable crop rectangle, fixed aspect presets, 90° rotation and full-source-resolution PNG export now present (v0.13). UI still differs from website and requires on-device interaction testing. |
| `text-comparator` | Core desktop equivalent | Aligned line diff, word highlighting, comparison options and local diff export (v0.12). |
| `text-diff` | Core desktop equivalent | Website alias of text-comparator. |
| `random-groups` | Core desktop equivalent | Shuffle into groups and choose one. |
| `short-code` | Partial / non-identical | Local link presets work; iframe embedshared hosting not part of desktop. |
| `color-contrast` | Core desktop equivalent | WCAG contrast calculation. |
| `qr-code` | Core desktop equivalent | Local QR generation and PNG save. |
| `json-formatter` | Core desktop equivalent | Validate, prettify and minify JSON. |
| `encode-decode` | Core desktop equivalent | UTF-8 Base64 and URL component encodedecode. |
| `external-hub` | Not ported / intentionally external | External links are not native offline tools and are kept separate. |

## Development policy

1. Complete locally feasible source functionality **before** declaring full website parity. Prioritize partial items such as full ClassWiz modes, the image crop drag UI, richer WYSIWYG document layout and full write-workbench handoffs.
2. Do **not** claim API/cloud AI, Whisper microphone transcription, public shared links or external sites are offline-native implementations. They need independent architecture, permissions and tests.
3. Keep all code changes under `apps/daily-desk/**`; `ap-reasonlab/**` remains untouched. New features must be ported as local logic, not an embedded copy of the website.
4. Require TypeScript, Vitest, Rust/Tauri and macOS Apple Silicon DMG CI; manual UI/print/annotation testing is still required.

## v0.12 changes after this audit

- Replaced simple positional text comparison with line alignment and word-level highlighting, similarity, ignore-case/space options, copy/export and bounded comparison work.
- Restored two-way Markdown ↔ plain text conversion with URL retention, swap, stats, copy and export.
- Added image pointer/stylus annotation, adjustable pen, undo and non-destructive PNG export; image resize now supports both maximum width and maximum height.

**Status: site-wide 100% feature parity has not yet been achieved.**

## v0.13 improvements and repaired audit notes

- Audit table notes are now readable; the previous slash-separated characters were an accidental report serialization bug.
- Image crop adds draggable crop rectangle, fixed ratio presets (1:1, 4:3, 16:9, 3:2), 90-degree rotation, dimension sliders and native full-resolution PNG export; the original image is not overwritten.
- Migrated the complete website formula data from `ap-reasonlab/data/formula-board.ts` into a desktop-only local module, with category tabs, search, favorites, LaTeX/plain copy and Markdown export.
- This audit tracks website functional equivalence, not visual or on-device macOS acceptance. **20 core / 21 partial / 3 external** remains an approximate implementation-status classification over 44 catalogue entries, including aliases.

## v0.14 units follow-up

Units & constants is now a core desktop equivalent. Advanced matrix/complex/statistical ClassWiz modes and native speech-to-text are still incomplete. This audit remains feature-level, not a guarantee of pixel-identical workflows.

## v0.15 advanced calculator follow-up

The website `calculator` entry remains **partial**: the desktop Math Workbench now includes a distinct ClassWiz tab for complex arithmetic, 2×2/3×3 matrix operations, paired linear regression and normal/binomial distribution functions. Remaining mode/UI disparities, web-specific calculator conveniences, and on-device Mac GUI checks are not considered finished. The site-wide 21 core / 20 partial / 3 external audit counts are unchanged.

## v0.16 standalone Quick Tools and external navigation

This release **adds** four Daily Desk-only QuickKit helpers (copy/paste text cleanup, link tracking parameter cleanup, date shift/difference and grade planning). The original website's 44-entry equivalence audit is unchanged because these are newly designed desktop conveniences, not ports of existing website entries. The app's separate External Tools catalog explicitly opens real third-party official websites and must **never be counted** as a local feature migration. macOS manual testing is still required.

## v0.17 PDF overlay capabilities (desktop-only expansion)

New `PDF Freedom Studio` functionality extends the existing `pdf-tools` desktop implementation with printable text labels, simple diagonal watermarks, sequential page numbering, custom-font Unicode support and PNG/JPEG image/signature overlays. These additions are available offline in the desktop app. The 44-entry website equivalence audit counts remain unchanged: this is added capability, not proof of exact website UI/workflow parity. Crucially, **an overlay is not secure redaction, editable underlying PDF text or a certified digital signature**. The original source remains unchanged.

## v0.18 PDF/image file conversion expansion

Added local image-to-PDF multi-page creation, and selected PDF-page-to-PNG/JPEG ZIP exports with conservative batch, byte and pixel limits. This extends the already local PDF workbench; it does not imply OCR, original text editing, certified signing or full website visual parity. No changes to the original 44-website-tool classification.

## v0.19 desktop-only Universal Toolbox

Added JSON→CSV, global UTC meeting clock, SHA-256 checksums, secure local password generator and photo pixel re-encoding to remove common metadata. Existing 44-entry website parity audit counts are unchanged because the new features are independent desktop utility additions, not exact existing web tools. The distinction between offline built-in tools and third-party External links remains explicit. Metadata clearing is not represented as a forensic or privacy certification.

## v0.20 Universal Box (desktop-only extensions)

Adds on-device static QR Wi-Fi/contact/batch creation with PNG/SVG/ZIP output; an RFC 5545 calendar .ics generator with UTC validation and safe content-line folding; and a cryptographically strong local UUID v4 batch tool. These are new conveniences and do **not** change the existing website's 44-entry equivalence audit counts. “Free static QR” does not claim hosted editable redirects, tracking analytics or subscriptions can operate without servers. The former basic QR generator remains present.

First-party fee/limit comparisons and future opportunities: `UNIVERSAL-BOX-ROADMAP.md`.

## v0.21 additional offline tool suite

Added four new desktop-only Universal Box Lab utilities: batch text-line processing, local subtitle SRT/VTT basic conversion plus timing offset, PNG/JPEG photo contact sheet generation, and offline URL component/query inspection. No existing 44-tool website equivalence totals are changed by these additions. Subtitle processing does not include speech transcription or advanced WebVTT styling, and URL inspection does not validate link safety.

## v0.22 new standalone desktop capabilities

Local PCM16 WAV trimming/normalization/fading, ZIP metadata inspection with traversal and decompression-risk indicators (no extraction), offline icon PNG dimension bundles, and approximate image palette extraction were added to Universal Box. These new modules do **not** modify the historical 44-entry web-site parity audit. No claim of advanced audio codec conversion, malware detection or certified colour matching is made.

## v0.23 standalone offline office/identity utilities

Four independent desktop tools added: bulk CSV-to-vCard contacts, text-only CSV mail merge ZIP, read-only local selected-file duplicate hashing, and a Unicode hidden-character inspector. These extend the desktop product but do not change the historical web-site parity audit count. In addition, native Rust writer extension alignment repairs macOS saving for prior ICS, subtitles and WAV features; new VCF extension is tested too.

## v0.24 workflow integration

A new Workflow Studio brings two real on-device workflows: selective CRC-verified ZIP repack, and a multi-step batch photo resize/re-encode/rename ZIP pipeline. Archive-controlled paths are never passed to disk writes. These additions do not change the historical web feature parity count; they are desktop additions. Real macOS input/output dialog and WebView graphics tests remain outstanding.

## v0.25 additional local format converters

Free Formats Lab adds bounded XLSX data interchange (first worksheet / cached values; no formula execution), pixel image diff and adjustable overlay, and HTML entity / Unicode normalization. These are separate desktop utilities, not changes to the historical AP website equivalent count. No cloud OCR, Excel macro/script execution or remote document conversion is included.
