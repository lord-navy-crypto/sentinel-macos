# Sentinel Box v0.51 — Folder Space, WAV Levels, PPTX Speaker Notes

## Distinct tools
1. **Folder Space Inspector**: explicit file/folder selection only, no file reads. Aggregate byte sizes by user-selected relative directory paths and extensions; show summary and scalable SVG bar chart; export CSV, SVG and JSON. Directory selection uses `webkitdirectory` where available and falls back to multiple files. The tool never recursively scans outside selected files or deletes/cleans them. Maximum 2,500 files.
2. **PCM16 WAV Level Report**: use existing RIFF/PCM16 parser (20 MB maximum), calculate actual sample-peak dBFS, RMS dBFS, clipped sample count, DC mean and crest-factor; export up to 80 window measurements as CSV and a JSON audit. This is **not** EBU R128 or ITU BS.1770 integrated loudness, LUFS, or true-peak measurement; loudness comparisons across different content are approximate.
3. **PowerPoint Notes Extractor**: validate PPTX using existing read-only Office inspector, map presentation order through slide relationships, then inspect linked `ppt/notesSlides/notesSlideN.xml` and extract only the actual `type="body"` speaker-note placeholders, not slide text or slide number placeholders. Output TXT and JSON; no notes are explicitly marked. Maximum 18 MB, 200 slides. Advanced note layouts and unsupported shape variants may require a full OOXML reader.

## Verification / quality gates
- [x] New bounded pure TS processing modules and independently useful UI components.
- [x] User-facing Tool Launchpad and Workflow Studio entries wired.
- [x] Unit tests using a real deterministic PCM16 WAV fixture, a PPTX ZIP with slide relationship → notes body placeholder, and nested folder metadata, including invalid inputs.
- [x] Chromium E2E tests with real selected-file inputs and export-download/read-back checks; CI registration.
- [ ] Current branch TypeScript/build, Vitest and Chromium CI green.
- [ ] Actual Mac Apple Silicon and Intel DMG build and launch validation.
- [ ] Compare PowerPoint speaker notes to Microsoft PowerPoint and Apple Keynote real output (including missing notes, custom master layouts).
- [ ] Check folder picker `webkitdirectory` behavior on the shipping macOS WebView; flat-file fallback must remain visible.

## Privacy and scope
Folder size metadata, SVG, CSV, and JSON exports can contain sensitive directory names. Users should review before sharing. WAV bytes and PPTX bytes are read only after file selection, never uploaded. No background file scans, no hidden network calls, no file deletion, no auto-repair. A passing Linux Chromium run does not prove native Mac file-picker behavior.
