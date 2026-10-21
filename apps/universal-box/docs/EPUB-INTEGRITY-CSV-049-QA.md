# Sentinel Box v0.49 — EPUB, Integrity and CSV Snapshot QA

## Scope (three independent offline-first utilities)
1. **EPUB 3 creation:** convert user-supplied UTF-8 text (simple `#` and `##` headings and paragraphs only) to an EPUB ZIP with first uncompressed `mimetype`, OCF container, package OPF, navigation and escaped XHTML chapters. Preview input locally and save `.epub`. Rich Markdown, images, CSS theming, DRM, MOBI and external fonts are deliberately unsupported.
2. **File verification:** users explicitly select 1–30 files (12 MB each, 40 MB total), export SHA-256/size/name manifest and re-import it to verify explicitly reselected files. No automatic disk scan, folder watcher, clipboard collection or file-content upload. Verification distinguishes matched, changed, missing and extra files. Hash is not malware detection.
3. **CSV snapshot diff:** compare two user-pasted/imported UTF-8 CSV versions by explicitly named non-empty unique ID column. Reports new/deleted rows, exact changed cells in shared columns and added/removed schema columns; exports JSON and spreadsheet-formula-safe CSV inside ZIP. Never executes formulas; no overwrite. Up to 3,000 rows per snapshot; input 550k text characters per snapshot.

## Review and validation checklist
- [x] Add UI for all three tools with unique launcher routes.
- [x] Add file extension and MIME for EPUB downloads.
- [x] Add real EPUB ZIP inspection, SHA-256 tamper verification and CSV diff unit tests.
- [x] Add Chromium test journeys that interact with forms and re-read downloaded ZIP/JSON.
- [x] Register browser tests in GitHub Actions.
- [ ] Check `npm ci && npm run build && npm test` in CI.
- [ ] Check Playwright downloads and screenshots in CI.
- [ ] Perform EPUB reader compatibility checks using Apple Books or Thorium Reader on real devices.
- [ ] Perform macOS ARM64/Intel packaging and real Finder file selection tests.

## Privacy, data integrity and exclusions
All operations start from user actions and produce new files. There is no network/remote model dependency for any of the three tools. Hash manifest includes file names and hashes, which can still be sensitive metadata. Imported JSON manifests are schema-validated; file names containing separators are rejected, and filenames must be unique within a set. CSV exports protect formula-like leading characters; CSV validation refuses ambiguous duplicate keys. Neither a passing TypeScript build nor a passing Chromium test is proof of native macOS behavior or a complete EPUB reader interoperability result.

## Current PR status
Code added to development branch for independent review. No claim of local npm/macOS run before GitHub workflow results are inspected.
