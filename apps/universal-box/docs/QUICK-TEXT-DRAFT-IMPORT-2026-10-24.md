# Everyday Quick Tools · local TXT/MD draft import

2026-10-24 · office-first improvement. Follow [Office-first reset](./OFFICE-FIRST-RESET-2026-10-23.md) and [Daily tools execution plan](./EXECUTION-PLAN-DAILY-TOOLS-054.md).

## User's office task

An office worker has an exported TXT memo or Markdown notes and needs to clean formatting, run a simple literal find-and-replace, or change text case/width, then copy or save the result as a new TXT. Previously, these QuickKit tools required users to copy/paste the entire file manually. The existing batch text-files tool remains better for many input files; this route serves **one-file interactive preview and copy**.

## Code

- Reuses **existing** Text Cleaner / Literal Replace / Case & Width modes inside `QuickKitDesk`; adds one local file input shown only in those modes. No new top-level catalog entry.
- Explicit opt-in local file selection; accepts .txt and .md, max **500 KB**, strict UTF-8 (with optional BOM) or Windows UTF-16LE when BOM-marked. UTF-16BE, mislabelled files, malformed Unicode, embedded binary/control codes, empty input or more than **200,000 UTF-16 code units** are rejected clearly; existing text is not overwritten on error.
- Imported input retains original CRLF where relevant, and editing results are subject to existing transform logic. Text Cleaner may deliberately normalize line endings or whitespace; Literal Replace previews only exact matches. No source is overwritten, clipboard is not read without a separate user click, no background watcher, cloud, login or subscription.
- Revision guard ignores a slow file-read result if user edits content or switches task after starting import; avoids stale text overwrites.
- Existing Copy Result and Save TXT actions continue to work.

## Verification

- Vitest: CJK, emoji, BOM, CRLF, Windows UTF-16LE, correct leading-zero text, source-byte immutability, invalid encoding, binary, oversized file and editor limits.
- Chromium: choose actual Markdown memo, inspect output and download real clean TXT, verify source remains unchanged, reject invalid binary without clearing edits, import UTF-16LE file into Literal Replace, switch to Case & Width and verify output.
- Latest-head core, browser suite and both Mac architectures must pass before merge. Real Mac Finder/clipboard permission QA, signing and notarization remain separate release gates.
