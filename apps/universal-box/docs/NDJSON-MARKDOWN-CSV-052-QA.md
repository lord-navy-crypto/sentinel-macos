# Sentinel Box v0.52: Offline data audit suite

## Three separate capabilities

1. **NDJSON / JSONL**: user-selected .ndjson / .jsonl (or explicitly pasted JSONL) becomes a validated sequence of JSON objects. Reports original physical line numbers, malformed JSON and unsupported record shapes, union of fields and missing-field counts; exports a human-readable audit JSON. JSON-array and formula-protected CSV conversion are **disabled on any invalid line**, preventing accidental silent partial data loss. A maximum of 5,000 lines and 500 KB input is supported; CSV is a flat table of top-level fields (nested values stringified as JSON). No schema inference or execution.
2. **Markdown local link audit**: user-selected local Markdown and asset files, with optional directory chooser preserving their relative paths, are checked for basic inline Markdown and reference-style local links. RFC-style remote links and fragment-only anchors are explicitly ignored, and **no HTTP fetch occurs**. Fenced-code examples are skipped. Missing/unsafe paths are reported without accessing unselected files. Supports at most 100 files and 2,000 references. This is **not** a complete CommonMark implementation; dynamic links, nested parentheses, custom plugins and remote content are not validated.
3. **CSV column profiling**: uses the existing, strict project parser `parseWorkspaceCsv`, validates the exact column widths and unique header names, then reports missing values, unique nonblank values, cautious type classification (including text IDs with leading zeroes), and numeric min/max/mean. This is a descriptive report, not an automatic cleanup or statistical significance test. Supports 1–7,000 data rows and 60 columns with total input limit 450,000 characters. Source CSV is not modified.

All three tools have user-triggered file inputs, previews, bounded error reports, explicitly named exports, catalogue registration, Workflow Studio routes and both unit/Chromium tests.

## Test gates

- [x] Core TypeScript parsing modules and accessible UI wired
- [x] Independent Vitest fixtures include invalid JSONL, formula-looking input, Markdown missing/external/unsafe paths, mixed CSV types, and malformed row width
- [x] Chromium downloads actual CSV/JSON results and reads them back; included in browser CI
- [ ] Current PR TypeScript, Vitest and Chromium CI success confirmed
- [ ] Apple Silicon and Intel desktop packaging CI confirmed
- [ ] Native macOS WebView directory-picker and real-device interoperability checked

**Privacy**: File selection is always explicit. No broad filesystem scan, network requests, source overwrites or subscription. Uploaded samples never leave the local execution path of these tools. Audit reports may contain private file paths or dataset values; review before sharing.
