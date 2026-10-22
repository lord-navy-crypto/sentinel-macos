# Sentinel Box v0.79 · Explicit Clipboard Image → PNG

2026-10-22 · Stacked Draft PR on #103. Not a shipped DMG.

## New daily problem addressed

Existing screenshot capture, image resize, markup and OCR tools do not offer a straightforward way to **paste an already-copied picture or screenshot and save it as a real PNG**, without invoking an OCR or image conversion workflow. This tool does not duplicate the native screenshot capture function.

## Implemented

- User focuses a paste region and presses ⌘V/Ctrl+V; React handles **that one paste event**, not clipboard polling, background history or monitoring. Select one local image file as fallback if WebView clipboard permissions differ.
- Accept PNG/JPEG/WebP raster MIME types, ≤12MB input; reject SVG and other potentially active content. Fully decode to an actual bitmap in local canvas, ≤12 million pixels, then re-encode a **real PNG**, ≤20MB output.
- Display decoded PNG dimensions, real output bytes and preview. Explicit Save writes a new PNG via existing exporter; source image / clipboard remains unchanged. Clear only local preview.
- Failed/invalid image imports preserve previous valid output and allow recovery; no remote URL, cloud API, subscription or file traversal.

## Regression tests

- [x] Vitest: safe types, input sizes and decoded pixel bounds.
- [x] Chromium: generate real 37×29 PNG, simulate user paste event with file data, inspect actual output PNG signature/dimensions; reject SVG paste without losing existing preview; local upload fallback and clear.
- [ ] Current SHA TypeScript/Vitest/Chromium CI complete and green.
- [ ] Intel and Apple Silicon macOS builds complete and green.
- [ ] Real Mac: Finder screenshots, Chrome/Safari copy-paste, WebView clipboard permissions, Retina pixel dimensions, image colors and export dialog.

## Release

Depends on prior PR #103 and stacked Draft dependencies. This milestone does **not** update application package version and is not yet part of a production DMG.
