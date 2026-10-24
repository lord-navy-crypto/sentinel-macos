# Sentinel Box · Word & Files everyday work (2026-10-24)

Status: **branch implementation; not yet merged or native-Mac accepted**.

## Product alignment

This task follows `apps/universal-box/docs/OFFICE-FIRST-RESET-2026-10-23.md`, `EXECUTION-PLAN-DAILY-TOOLS-054.md` and issue #62. It extends existing tools instead of adding a catalog entry or creating a second Word diff engine.

### 1. Existing Word paragraph diff — finish the last mile

- Continue using `Word Paragraph Diff`, `compareWordDocuments` and the existing bounded OOXML parser. No new document upload or cloud processing.
- The already inspected Word report can now be copied as *changed paragraphs only*, or saved directly as a new UTF-8 TXT file. The original complete ZIP report remains available.
- Both TXT paths and the full ZIP use the same text formatter; the ZIP can export the exact reviewed result without an unnecessary second parse of the same inputs.
- New Word selections clear the previous comparison; import and review/export are guarded against stale results and changing files during active operations.
- This is not Track Changes, Word formatting comparison, a valid review/merge operation, or a full scan of headers/footers, tables and images.

### 2. Existing batch rename — common non-numbered cases

- Keep default numbering for existing users, but allow an explicit checkbox to make *prefix only*, *literal stem find-and-replace*, or *unchanged-name copies*.
- Before bytes are read, check case-insensitive/NFC output filename collisions, Windows reserved names and the `sentinel-box-rename-plan.json` manifest name.
- Reject numbering beyond 99,999 rather than inventing overflow suffixes.
- Freeze file selection and name rules while generating ZIP. The ZIP contains copies, not in-place Finder renames, and the old→new JSON manifest remains.
- Continue existing 50 files / 16 MB input and 20 MB output safety limits; never overwrite source files.

## Test evidence expected

- Vitest: rename collision/manifest/sequence cases and shared Word changed-only formatter.
- Actual Chromium: generate two editable DOCX files, import and compare them, save/read back changed-only TXT, invalidate a stale report on new upload, reject invalid Office content.
- Actual Chromium: unnumbered rename previews, verified CRC ZIP output and original content, case-insensitive collision and manifest-name rejection.
- Latest-head TypeScript, full unit tests, Chromium suites and Intel/Apple Silicon macOS builds required before merge.

## Explicitly pending

- Installed native macOS (both chip architectures), Finder and Office application interoperability, clipboard permission behavior, Apple signing and notarization, Gatekeeper.
- Existing #150 compression/OCR input-safety PR is separate and should be reviewed/merged independently.
- No claim of public release or real adoption telemetry.
