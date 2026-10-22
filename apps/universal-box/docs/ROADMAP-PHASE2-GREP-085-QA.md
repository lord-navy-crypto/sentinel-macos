# Sentinel Box 终极计划 · 第二阶段执行记录 · v0.85 多文件只读文本搜索

2026-10-22 · 开发 Draft。源计划归档：
- docs/archive/SENTINEL-BOX-ULTIMATE-PLAN-2026-10-22.md
- 原归档提交：2855a3352c8ed5d4e8154625102e25378e74530f
- 首批 v0.83 HEX + v0.84 EML：PR #108，Chromium 与双架构 macOS CI 已通过；仍属 Draft。
- 本轮从 #108 分支派生，不直接修改稳定主干。

## 计划条款与设计决定

计划原文 v0.85：用户明确选择最多 20 个 TXT/MD/CSV 等文本文件；只读字面搜索；报告相对名称、原始行号、文本片段；CSV 导出；不自动写入、替换、不随意启动可能失控的正则表达式。

仓库查重：已有 OfficeDataBatchPanel/officeDataBatch 的多文件批量字面**替换**，以及 Text Comparator、Quick Tools。这个新工具只产生按文件/行号排列的**检索报告**，不提供替换框、输入修改或 ZIP 重写，避免功能同义叠加。

## 已实现（代码是实际函数和用户交互，不是占位宣传）

- src/lib/readOnlyGrep.ts: verify 1–20 files, each 1–200,000 bytes, total ≤2MB, UTF-8 already decoded text; case-sensitive optional (default insensitive), literal phrase ≤120 characters, original file order and 1-based physical line numbers, CRLF/LF support.
- If the source contains >75,000 lines in total, or a query matches >5,000 lines, throw explicit error rather than silently truncating the saved report.
- UI preview only first 100 matching lines; **CSV contains the entire report** (within 5,000 line limit), including original full matching lines, filenames and line numbers. UTF-8 BOM, RFC-style quote escaping and spreadsheet formula protection.
- src/components/ReadOnlyGrepDesk.tsx: choose files → enter keyword and press Search → review genuine line numbers → export CSV. Input files decoded locally using fatal UTF-8 decoder. Failed batch import preserves prior fully valid selection/report; keyword or case option changes invalidate stale reports.
- Pure read-only logic: does not enumerate a directory, monitor changes, run arbitrary regex, request network, upload content or save/modify sources. No cloud subscription or credentials.
- Search output can contain sensitive lines in plaintext; explicitly warn the user to review before sharing.

## Verification

- [x] Vitest added: case-insensitive/literal query, case-sensitive option, UTF-8 Chinese, CRLF/line counting, CSV quoting/formula injection protection, limits (file counts/sizes, line count, matches).
- [x] Chromium E2E authored: real three-file selection, four matching lines with file/line identities, real CSV download and content, case-sensitive invalidation, corrupt UTF-8 transactional import, and clear.
- [ ] Latest GitHub CI TypeScript + Vitest + Chromium fully green.
- [ ] Latest Intel + Apple Silicon macOS build fully green.
- [ ] Real physical Mac files picker, paste UTF-8 BOM samples, Finder selection, download dialog and offline privacy verification.
- [ ] Orderly review and merge of stacked Draft PRs, synchronized real package version; no stable DMG release claim yet.

## Next planned stage (v0.86 candidate)

Compare two **user-selected metadata snapshots** of folder trees, rather than automatic full-disk indexing or duplicating existing Binary Compare. Must design stable relative paths, explicit differences, and no hidden filesystem reads. Prioritize fixing QA or PR stack issues over adding more catalog entries. Once a batch is stabilized, consolidate and merge rather than accumulating indefinite Draft dependencies.

## Practical note

Development milestone v0.85 is not the actual installer version. Baseline plan remains archived and immutable; this is a separate dated execution log.
