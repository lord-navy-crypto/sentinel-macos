# File Intake · exclude source files before local SHA-256 scan

Date: 2026-10-24. Governed by the office-first product reset and daily tools execution plan. Improve the existing **File Intake** preflight, not a duplicate catalog entry.

## Common office task

Users select a large set of document attachments for inventory and SHA-256 verification. The previous preflight displayed only ten selected filenames and offered no way to remove just one accidentally selected file without reopening the picker. The new workflow makes selection review complete and non-destructive.

## Implemented

- List all selected file names and their sizes inside a scrollable, accessible pre-scan list (up to the existing limit of 80 files).
- Add a clearly labeled **Exclude** button for each pending entry; remove by exact selection index, even if several files share the same name, without touching a source file on disk.
- Recompute counts, combined bytes, warning visibility and the Start Scan gate immediately. Removing a duplicate-named file clears its duplicate-name warning; removing the final staged file leaves the gate disabled and asks for a new selection.
- Preserve previous completed scan results until users deliberately start and successfully complete a new scan; no hashing occurs before the explicit Start Scan action.
- Existing safe bounds remain: up to 80 files, ≤64 MB each, ≤160 MB per batch; files never uploaded or modified. SHA-256 alone does not establish malware safety.

## Verification requirements

- Vitest: pure, immutable index-based deletion, duplicate filenames, recomputed preflight stats and invalid indices.
- Chromium: select three actual byte buffers with duplicate names, verify full list and warning, exclude exact second file, verify totals/warning, start actual SHA-256 scan, and inspect the two actual results.
- Latest-head core/TypeScript/unit tests, full Chromium workflow tests and macOS Intel/ARM CI must all pass before merging.
- Native Finder drag/drop, installed-Mac performance, system permissions, signing and Apple notarization are not established by CI.
