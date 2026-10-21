# Universal Box · Daily utility expansion (v0.40 candidate)

Three *separate areas* are enhanced; they have real inputs/outputs and no account requirements.

## 1. Screenshot/Image markup — an upgrade, not a duplicate
- Reuses and **improves the existing** `ImageAnnotationDesk` within File Desk.
- Pen, rectangular outlines, arrows, text, and **opaque black rectangles** covering selected pixels, all flattened into a new PNG. Eight undo steps.
- Standalone dedicated import accessible from the searchable toolbox.
- Deliberately **not** claiming ScreenCaptureKit screen recording or secure redaction of the entire original document, backups, metadata, or other file copies. User must inspect output area and securely handle original files. Canvas export is not a forensic guarantee.

## 2. A4 printable page builder
- One-page A4 (210×297 mm) SVG with original themes and physically fixed dimensions, using print-friendly vector cells.
- 2×4 study cards, 3×8 equipment/storage labels, 2×5 tickets.
- Per-line editable content, title/footer, size bounds and safe XML escaping; no remote fonts or protected templates.
- Check in a real printer/browser for actual size. Use 100% scaling rather than automatic fit.

## 3. Developer data inference
- JSON paste → genuine `.ts` file with inferred recursive structural types (including heterogeneous arrays and optional fields), plus `.tsv` audit of JSON paths/types.
- Strict input/depth/node limits; neither JSON nor generated TypeScript is executed or sent online.
- Inference is an estimate from observed samples, **not** JSON Schema or runtime type validation.

## Verification
- Vitest unit tests for 3 A4 physical print formats, escaping and bounds; arrays, optional properties, exotic JSON keys and limits.
- Real Chromium UI: generate SVG, TS and TSV; import a local sample image, draw an opaque blackout, download flattened PNG, decode and assert that a blacked-out pixel is exactly RGBA `0,0,0,255` and an untouched pixel remains colored.
- Retains existing Office roundtrip, generated video frame, and catalog smoke tests, with explicit distinction between 113 searchable entries and semantically tested operations.
- macOS x86_64/aarch64 DMG build and Sentinel CI are mandatory before merging. Real native device/printer tests remain a separate signoff.
