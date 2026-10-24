# Manual text collection: order and export · Office-first

2026-10-24, following `OFFICE-FIRST-RESET-2026-10-23.md` and `OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md`.

## Why this matters

The existing Quick Tools → Multi-copy basket collects up to 30 snippets without background clipboard monitoring, but previously users could only change the order by deleting and retyping/re-adding notes. Office staff assembling several copied sections, meeting notes or form answers need to adjust sequence and save a local text copy, not only copy to a clipboard.

## Actual workflow

- Keep the existing multi-copy catalog route and all existing size/count caps.
- Add explicitly controlled Up/Down buttons per selected clip with boundary safety; maintain original wording and ordering until the user clicks.
- Preview combined output with newline, blank line or space separator, matching the exact UTF-8 `.txt` export.
- Save a new `sentinel-box-combined-notes.txt` without clearing snippets, overwriting originals, collecting passwords, watching clipboard, or accessing cloud storage.
- Keep explicit Copy button; if clipboard permission is unavailable, manually select the combined preview instead.

## Testing

- Vitest immutable list moves, bounds, and Unicode combined output ordering.
- Chromium: open actual existing Multi-copy tool, enter three CJK snippets, move them, choose blank-line separator, download genuine TXT and compare decoded UTF-8 bytes against preview; remove one to confirm recomputation.
- Require latest-head core, full Chromium and Intel/Apple Silicon macOS builds before mainline merge. Installed-Mac native clipboard permissions, signing/notarization and cross-app clipboard behavior remain **not verified**.
