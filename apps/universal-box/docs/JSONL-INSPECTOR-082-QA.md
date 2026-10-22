# Sentinel Box v0.82 · JSONL / NDJSON Log Viewer

2026-10-22 · Stacked Draft based on #106. Not a released DMG.

## Why this is a new useful tool

Existing JSON formatter displays a single JSON value, but developer tools and automation often produce JSONL/NDJSON with one object per line. This utility loads local files, summarizes severities, keeps malformed rows, searches logs and exports filtered rows to CSV. Not a PDF/image/book/audio utility.

## Scope and privacy

- Explicitly import .jsonl/.ndjson/.log/.txt strict UTF-8, ≤2 MB, ≤5,000 physical lines, ≤50,000 characters/line.
- Parse per-object level/severity/logLevel/status, timestamp/time/ts, and message/msg/event/description. Retain original line and order.
- Invalid JSON objects, blank lines and primitive values remain marked invalid, including raw lines; never silently drop broken records.
- Severity dropdown and local search filter records; only first 100 rendered on screen, but CSV export includes every current filtered row.
- CSV includes full original line as raw_jsonl to keep evidence; UTF-8 BOM, quote escaping and formula precautions.
- No background watching, telemetry, cloud analysis, log forwarding, remote uploads or source file modifications. Failed import retains previous report.
- Logs can contain credentials and personal details; user should review exports before sharing. No automatic redaction claimed.

## Verification

- [x] Vitest: invalid rows, normalized severity, line numbers, filtering, formula-safe CSV and limits.
- [x] Chromium: real JSONL import, error/invalid severity, true CSV download, search, corrupt UTF-8 preserving previous report and clear.
- [ ] Latest SHA TypeScript, Vitest and Chromium CI green.
- [ ] Intel and Apple Silicon macOS CI builds green.
- [ ] Real Mac picker, large JSONL, Unicode filenames, Numbers/Excel CSV and invalid rows QA.

**Release gate:** ordered review/merge of #106 and stacked Draft dependencies; sync real application package version and perform physical Mac validation.
