# Universal Box · more free tools (v0.39 candidate)

## Added, across 3 different domains

### Office reader / media extraction
- Local-only read of DOCX and PPTX OOXML ZIP archives, text shown per paragraph/slide.
- Exports real UTF-8 TXT, and a ZIP with allowlisted PNG, JPEG, GIF, WebP image data selected from the Office archive.
- Explicitly ignores unrecognized media such as SVG/embedded code, does not load scripts, macros, external URLs or OLE objects.
- Permits up to 18 MB compressed input, 1100 ZIP members, 200 slides, 3000 paragraphs, maximum 400k characters extracted text, 30 media items; image signature checks and conservative archive sizes. Inputs are not modified.
- **Limitations:** It extracts textual content, *not original Office slide/paragraph formatting*. Rich charts, formulas, notes, change-tracked moves and complete visual compatibility are not preserved. Image signature validation is not a full image decoder/security scanner. A ZIP file containing pathological decompression ratios requires further fuzzing and limits.

### Video frame & storyboard
- User chooses a local MP4/MOV/WebM file (browser codec support required). Seek to a timestamp and save a real PNG screenshot; or create 6-frame visual contact sheet.
- Source is loaded with local browser object URLs, never sent to a server, revoked when file changes or component unmounts. Input not overwritten.
- **Limitations:** This is **not** an FFmpeg transcoder, video cutter, codec installer, or native ScreenCaptureKit recorder. Browser media decoder and duration/seek behavior are platform-dependent; users must opt in by choosing a local file. Video duration can be unknown in some WebM media.

### Diagrams
- Original offline vector Mind Map and Milestone Timeline editors. Each topic has up to three detail strings. Three palettes, SVG live preview, separate user-triggered export.
- **Limitations:** No drag-and-drop node editor or automatic complex graphs.

## Test evidence needed for approval
1. `npm run build` and `npm test`: DOCX/PPTX roundtrip, text and media ZIP extraction, XML escaping, bounded diagram nodes.
2. Real Chromium Playwright: generate DOCX/PPTX using the app, re-import and inspect, export TXT; SVG mind map and timeline; upload synthetic WebM and save real decoded PNG frame.
3. Existing 101-catalog-entry navigation + Word/PPT/design/flowchart tests continue.
4. Both Intel/Apple Silicon Tauri DMGs and Sentinel regressions pass in CI; Mac desktop browser codec, file picker and real-device manual testing remains an independent requirement.

## Data protection
No background scanning, no network use to process files, no account or subscription, no automatic opening of remote links. Source remains unchanged. Office media export only saves validated signatures of supported image extensions, and excludes active SVG.

## Planning notes
Broader issue #62 remains open: screenshots via ScreenCaptureKit / Vision OCR, actual slide import/edit, video trim/transcode via AVFoundation and secure two-device transfer require separate native QA.
