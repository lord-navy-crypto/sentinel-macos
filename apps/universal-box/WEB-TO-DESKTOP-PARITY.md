# Knowledge Explorer web → Daily Desk desktop: daily-tools port

## Scope

The source inventory is the AP website's `ap-reasonlab/data/study-tools.ts` and `ap-reasonlab/data/tool-workbenches.ts`. The goal is to implement **actual local desktop functionality**, not embed the AP website in a window. The desktop product remains in `apps/daily-desk/`, compiled by Tauri and GitHub Actions. The website stays in `ap-reasonlab/`.

This first port covers the everyday tool set but is **not 100% feature parity** with every web workbench, especially the AI/backend, specialized graphics, and advanced graphing interfaces.

## Functional desktop equivalents included in this branch

| Website module(s) | Desktop implementation | Limits |
| --- | --- | --- |
| focus-desk / timer | Focus Timer | White/pink/brown/soft synthetic local sound beds; original recordings not reproduced |
| flashcards / vocab-book | Saved Flashcards | Local subject decks, due-date filtering and interval reviews; not synced to web |
| mistake-notebook | Study & English / Mistake notebook | Plain text entries |
| exam-countdown | Study & English / Exam countdown | Local calendar dates |
| code-board | Study & English / Code board | Snippet storage, not an IDE |
| word-count | Everyday tools / Word count | English-style token estimate |
| dictation | Study & English / Dictation | System TTS support varies by macOS WebView |
| paraphrase | Study & English / Paraphrase | Word overlap is only a rough measure |
| reading-highlight | Reading highlights | Selection-based colored highlighting + margin notes, saved in native workspace |
| typewriter | Study & English / Typewriter | Reveal lines |
| calculator | Math / Calculator | mathjs expressions, **not full ClassWiz** |
| grapher | Math / Graph | Basic Y(x) function plotting only |
| formula-board | Math / Formula board | Core STEM formulas subset |
| latex | Math / LaTeX | KaTeX preview |
| units | Math / Units | Major common unit groups |
| sci-notation | Math / Scientific notation | Scientific notation, estimated significant figures, custom precision multiplication/division |
| vector-resolve | Math / Vector components | Two polar vectors add/subtract, magnitude and direction |
| pdf-tools / pdf-compress | File desk / PDF | Merge, selected-page split, separate-page ZIP export (≤50 pages), rotate, reserialize |
| image-compress | File desk / Images | Resize, convert JPEG/WebP/PNG, percent-based crop and text caption; freehand annotation pending |
| word-import | File desk / Word to Markdown | `.docx` HTML extraction converted to safe editable Markdown (some formatting loss) |
| dual / write-convert / markdown-pdf | Writing workbench | Markdown + math live preview, file export, system print/PDF; Word→PDF print needs manual testing |
| draft | Drawing desk | Saved black canvas strokes, mouse/stylus freehand marks, undo, PNG export |
| csv-markdown | Everyday tools / CSV | Quoted CSV/TSV parsing |
| batch-rename | Everyday tools / Batch rename | Explicit per-file copy export |
| markdown-plain | Everyday tools / Markdown & plain | Common inline removal, paragraph/heading conversion |
| text-comparator / text-diff | Everyday tools / Diff | Line-by-line comparison, not character-level |
| random-groups | Everyday tools / Groups | Shuffle, divide into groups, or pick one at random |
| color-contrast | Everyday tools / Color | WCAG contrast ratio |
| qr-code | Everyday tools / QR | Local PNG QR |
| json-formatter | Everyday tools / JSON | Pretty-print, validate, minify |
| encode-decode | Everyday tools / Encode | UTF-8 Base64 and URI components |
| notes, tasks | Daily Desk native | Persisted in app data folder |
| flashcards (paste) | Study & English / Instant flip cards | Paste tab or double-colon pairs; intentionally session-only |
| short-code | Local Link presets | Saved code → external HTTP(S) link; no cloud redirects/embeds |

## Still to migrate or build before claiming full parity

- Full AP site's AI workbench, external providers/API keys and WebLLM: needs separate consent and platform-specific integration; **not ported**.
- Speech-to-text / Whisper local microphone processing: **not ported**. Dictation TTS is not speech recognition.
- The website's full ClassWiz calculator, calculus graph analysis (derivatives, roots, polar/parametric), advanced unit/math modes: **partial**.
- PDF individual-page ZIP splitting now supported (up to 50 pages); interactive page preview, heavy-duty scanned image recompression and freehand annotation on images remain **partial**.
- Word→PDF via docx preview/print remains **not ported**. Reading highlight and local link presets now have offline equivalents. Markdown/LaTeX live editing, printing and a saved black drawing canvas have basic implementations.
- Full code editor and off-site tools are not inherently offline; must remain separate from the desktop's core feature set.

## Portability, local export and safety

- Files are processed in the desktop WebView in memory. Save operations prompt for a location using the system dialog and then write locally through a limited Tauri command.
- Native saved outputs: PDF, PNG, JPEG, WebP, Markdown, text, CSV and JSON. The native output command limits file size to 20MB and file extensions to an allowlist.
- Workspace data continues to use the Tauri-managed local application-data file and does not go through Vercel.
- The PDF light optimization rewrites the PDF object structure; it does not necessarily compress embedded images.
- The new input/preview modules need macOS interaction testing beyond TypeScript and automated bundling.

## Acceptance checklist

1. Desktop TypeScript + Vite build succeeds.
2. Rust unit tests and Tauri DMG bundling succeed.
3. Portable local exports in PDF/Image/Word/QR are exercised on macOS.
4. Native stored study extras survive an app restart and backup restore.
5. AP Vercel production domain is unaffected by app-only merges.

## v0.6 easy-tool migration
- Local short-code bookmarks with explicit HTTP(S) URL validation and native external opener.
- Reading highlighter stores selected character offsets, four colors and margin notes; edits clear offsets after confirmation.
- Session-only pasted flip-card practice (tab or double-colon separated).
- Randomly pick one name in addition to random group assignment.
- Basic vector addition/subtraction and selected significant-figure rounding.
- Still no cloud AI, shared shortlinks, online embeds, or speech-to-text transcription.

- Local focus audio is synthetic Web Audio noise (not a copy of the site's real rain recordings). Playback starts only after a click and stops when switched Off.


## v0.7 focused migration

- Math tools add local numerical derivatives, tangents, Simpson definite integrals, sign-changing roots and intersections.
- Math remaining gaps: full ClassWiz, symbolic calculus, parametric/polar charts, pan/zoom and higher-order analysis. Numerical estimates need validation around discontinuities.
- Word-to-PDF gets a **partial** desktop workflow: Mammoth DOCX import → safe Markdown preview → editable Writing Desk → Print / Save PDF if supported by macOS WebView. Exact Word formatting is not preserved.
- CI builds alone cannot verify macOS printing or real-world document fidelity.

## v0.8 advanced graph, PDF preview, and document editor

- **Math → Graph**: Interactive drag-to-pan, zoom/reset, Cartesian Y(x), parametric x(t)/y(t), polar r(θ), up to four curves and SVG export. Calculations and sampling run locally. Numerical singularities may still need manual review.
- **File desk → PDF**: Local PDF.js thumbnail render (8 visible at a time), page selection and zoomed selected-page preview. No document bytes are sent to a server. Initial preview is capped at 25 MB to bound device memory.
- **Writing desk**: Markdown formatting toolbar, undo/redo history (up to 60 entries), find/replace, templates, heading outline, editor/preview modes, text/Markdown import and Word (.docx) export with basic heading and paragraph structure.
- Existing Print / Save PDF remains dependent on the native WebView print dialog; Word export is basic structure, **not a full Word-compatible WYSIWYG editor**. PDF form editing, OCR and annotation are not included in this port.
- Mac interactive testing remains necessary for PDF.js worker rendering, large documents, native DOCX output and system printing.

## v0.9 consolidated daily-tool migration

- A searchable on-device launcher routes directly into the math, text, document, PDF, image, classroom and study modules without opening the website.
- Added code editor with language templates, import/export, find/replace, JSON formatting and persistent snippet handoff; **does not execute arbitrary code**.
- Added BASE-N conversions, quadratic solver, basic 1-variable statistics and 2×2 simultaneous equation solver.
- CSV→Markdown now accepts local .csv/.tsv input in addition to pasted content.
- Remaining important non-local features: full website AI chat/local-LLM plumbing, speech-to-text transcription, public shared links, and full advanced ClassWiz modes (complex matrices, distributions, regressions, symbolic calculus). These are deliberately not mislabelled as completed ports.

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

## v0.15 ClassWiz-style calculation coverage

Added four local advanced calculator modes: complex numbers, 2×2/3×3 matrices, two-variable linear regression and normal/binomial probabilities. Deterministic tests cover arithmetic, parsing, singular matrices, invalid data and probability bounds. Website calculator parity remains partial; the desktop's numerical limits and GUI differ. Mac interaction requires manual acceptance. The AP website was not changed.
