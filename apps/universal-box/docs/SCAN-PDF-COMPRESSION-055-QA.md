# Sentinel Box v0.55 · Scanned-PDF Compression Implementation & QA

**Parent implementation plan:** `apps/universal-box/docs/EXECUTION-PLAN-DAILY-TOOLS-054.md` (PR #79). This is a stacked, independent v0.55 implementation **on top of** v0.54, not a claim that either one has been merged into `main`.

## User problem

Sending or submitting a scanned PDF often fails because a few full-page PNG scans make the document large. Merely repacking PDF objects does **not** compress scanned images. Users need transparent size-vs-readability choices without uploading private school/office documents.

## Actual implemented workflow

1. Open existing PDF Mini Editor's **Compress Scanned PDF** tab, select an ordinary unencrypted PDF (max 15 MB, 12 pages), and explicitly acknowledge scan flattening.
2. Choose **Small (96 DPI / JPEG quality .48)**, **Balanced (120 DPI / .65)** or **Sharper (150 DPI / .82)**.
3. Preflight **all pages** before changing anything: no text layer (including prior OCR), no links/annotations, forms, digital signature hints, attachments or document outline. Any detected content stops with an explanation rather than silently destroying it.
4. Use already-bundled pdf.js worker to render each approved page **on-device** to an opaque canvas. Cap each raster at 3.5 million pixels. Re-encode pixels to actual JPEG via local browser canvas, then create a **new** PDF with pdf-lib at the visible page dimensions. Never edit source.
5. Validate output page count/dimensions; compare exact original/output byte lengths. Only offer saving when genuinely smaller.
6. Show progress, exact before/after bytes, percentage saved, and an opt-in preview of the **actual output PDF**. Original PDF preview remains available below. Do not claim preservation of selectable text, vector geometry, full PDF/A compliance, signatures, links or searchable OCR.

## Limitations and non-goals

- This **rasterizes** all pages: not suitable for vector documents, searchable PDFs, digitally signed PDFs, or interactive files.
- Preflight examines text, annotations, attachments, form fields and outlines. PDF complexity means this is a safety guardrail, **not** a formal PDF/A or digital-signature validator.
- Quality is visual/perceptual; there is no guarantee of a specific output size or better readability. If output >= original, saving is disabled.
- JPEG re-encoding may blur small fonts or worsen grayscale diagrams. Exported PDF is **not searchable**. For OCR scanned-PDF creation, a separate project must preserve or add an accessible text layer in a verifiable way.
- Source may contain custom page metadata or unusual blend modes not perfectly rendered by PDF.js: always compare with original in Preview/Acrobat before sharing.

## Regression and safety QA

- [x] Isolated `planScanRaster` Vitest tests for 96/120/150 DPI and pixel budgets.
- [x] Real Chromium synthetic scan with noisy image PNG embedded in a 3-page PDF; actual JPEG rendering and new PDF export/readback; asserting **measured smaller file** and same page count and dimensions.
- [x] Real selectable-text PDF fixture must be refused.
- [x] CI test registered in browser workflow, alongside v0.54 structural optimization and OCR regression.
- [ ] Latest v0.55 CI TypeScript + Vitest green (pending).
- [ ] Latest v0.55 Chromium render/upload/download/readback green (pending).
- [ ] Intel + Apple Silicon DMG builds green (pending).
- [ ] Real macOS WKWebView canvas JPEG, native PDF Preview image comparison, A4 portrait/landscape and 10+ page stress test (device QA required).
- [ ] App signing/notarization and release version (separate release gate).

**Research baseline:** PDF24's scan compression settings (DPI and JPEG quality), Apple Preview manual PDF export size comparisons, pdf.js standard local canvas rendering. No external compression endpoint is used.
