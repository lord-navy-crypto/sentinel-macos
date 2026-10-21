# Sentinel Box · v0.44 Office / Data / File Automation

**Mapped directly to roadmap #62**: Word CSV mail-merge templates (A, F), keyed two-table joins (F), and bounded multi-file find/replace (Quick Actions item 18; section G/I). The earlier tools for single-document templates, union CSV append and single text replacement remain intact.

## Three real operations

1. **CSV → DOCX mail merge** (Office). Upload or paste one UTF-8 CSV (1–20 rows, ≤40 columns); specify a Markdown template with `{{ColumnName}}` placeholders. Preflight rejects unknown/malformed fields, duplicate headers, inconsistent rows and excessive sizes. Sentinel Box generates **one genuinely editable DOCX per row**, a numbered documents ZIP and a metadata-only manifest. No emails are sent. The CSV input and recipient values are *not* copied into the manifest.
2. **CSV key join** (Data). Two CSVs with a shared exact key; choose inner, left or full. Unique nonempty keys on both sides are mandatory; duplicate IDs are rejected instead of producing unreviewable Cartesian products. Preserves string IDs such as `001` and literal fields. Column collisions are removed by namespaced `left.`/`right.` headers. The ZIP holds a formula-safe CSV and row counts, not raw input copies.
3. **Batch literal find/replace** (Files/Text). Select 1–20 local UTF-8 TXT/MD/CSV/TSV/JSON/SRT/VTT files (≤200 KB each, ≤2 MB total). Enter literal search/replacement text; no regex execution or background file modifications. Run the existing bounded `replaceTextLiteral` engine on each source. Export changed text copies only and a manifest containing file names, match counts, skipped/failed results, never the original document body. Users should re-validate any CSV/JSON/SRT semantics after a literal replacement, because this tool does not reinterpret those formats.

## Verification

- New unit tests unzip actual Word DOCX XML, demonstrate two distinct Chinese/English fields, reject missing/duplicate placeholders, validate inner/left/full joins and leading-zero keys, defend CSV against spreadsheet formula execution, verify replacement copies/audit and oversize rejection.
- New real Chromium tests import CSV and text files, export DOCX/CSV/TXT ZIP bundles, and reopen actual output members to verify contents, not merely the presence of navigation entries.
- Full existing suite (124 prior catalog entries; now 127) + Intel/Apple Silicon Tauri DMG builds + Sentinel core validation are required before merging.
- Real Mac Office interoperability and actual user's local data remain outside CI: no document templates are assumed to preserve rich OOXML layout or mail transport.

**Privacy:** Offline processing, explicit input and export, no forced account, cloud calls, unsolicited file scanning or source overwrite. No copyrighted template assets. Use original generic document generation and existing permissively licensed dependencies.

## Outstanding roadmap gaps

- Verified PDF/page OCR inside unified pipelines; stronger image and audio workflows.
- Advanced Word tables/headers, richer PPTX editing and multi-sheet XLSX manipulation.
- Full native LAN pairing with consent and real two-Mac encrypted transfer tests; not claimed as delivered.
- Native signed/notarized release and real macOS UI permissions quality assurance.

*The original 30-item Quick Actions plan and Issue #62 are a historical backlog: individual item checkboxes should only be marked complete for verified whole requirements, not partial implementations.*
