# Universal Box — 30 everyday workflows, deduplicated execution plan

Reviewed: 2026-10-19. Baseline: main v0.29; pending PRs #302 (image interpolation/sharpen) and #303 (PDF extraction/reordering) are NOT shipped and must be treated as conditional. Source-of-truth inventory: `UNIVERSAL-BOX-ROADMAP.md`, `src/components/ToolLaunchpad.tsx`, `src/App.tsx`, and implementation tests. This is a **plan**, not a claim that unbuilt features work.

## Product and safety contract
- Common tasks without a subscription, watermark, forced account, server upload, remote telemetry or artificial daily quota; explicit, documented resource/safety ceilings remain.
- Preserve source files and provide previews, error messages, cancellation, undo or recoverable output when feasible. No silent monitoring of clipboard, screen, email or folder contents.
- Use local APIs or license-compatible components. Do not bypass paywalls, authentication, DRM, software license enforcement, or website permissions.
- Web-page extraction only on user-authorized, accessible pages via user-triggered browser extension action and minimum permissions (e.g. activeTab); label dynamically missing/inaccessible content. Desktop Tauri app cannot generally access an arbitrary browser tab without an extension or explicit handoff.
- Global hotkeys, capture, clipboard and Finder integrations need Apple OS permissions, native Swift/Rust bridging, signed/notarized builds and physical Apple Silicon testing. Browser-side and desktop-side caches/permissions differ.
- AI chat is a separate optional local feature; OCR should use Apple Vision on macOS where available (with explicit screenshot permission), with optional local fallbacks and clear Chinese/English accuracy limits.
- Prioritize user outcomes over catalog entry counts. Existing functionality is linked and enhanced, not reimplemented.

## Complete 30-feature inventory

Classification: **Existing** = baseline utility exists but not necessarily one-click/OS-integrated. **Partial** = only an important subset exists. **New** = no verified shipped equivalent. Priority P0 highest → P3. Difficulty L/M/H is an engineering estimate.

| # | User request | Baseline / reuse | Priority | Difficulty | Deliverable / acceptance |
|---|---|---|---|---|---|
| 01 | 一键复制网页全文 | New | P0 | M | Browser extension: explicit click → visible text extraction / copy, no restricted-content bypass |
| 02 | 截图立即 OCR | New | P0 | H | User hotkey → authorized capture → Apple Vision OCR → review/copy; Chinese/English |
| 03 | 本地剪贴板历史 | New | P0 | H | Opt-in local history, exclude sensitive data, pause/clear, retention controls; no background capture by default |
| 04 | 网页正文转 Markdown | Partial: existing Markdown converters but no tab content capture | P0 | M | DOM/article extraction to safe Markdown with preview and source attribution |
| 05 | 批量提取网页链接 | Partial: URL inspectors, no full-page crawler | P0 | L/M | Active-tab anchors → filtered, deduped CSV/TXT |
| 06 | 网页转 PDF | Partial: system print workflow | P1 | M | Extension print/PDF handoff; show print-layout limitations, no covert download |
| 07 | 网页表格转 CSV | Partial: CSV/TSV desk exists | P1 | M | Extract user-selected DOM table, retain header and literal cell text, neutralize CSV formula injection |
| 08 | 清除网页复制的杂乱格式 | Partial: Text Cleaner | P0 | L | One action to clean clipboard text with before/after preview |
| 09 | 滚动长截图 | New | P3 | H | Explicit scrolling capture in supported apps/tabs; stitching, privacy, sticky-header/dynamic-layout caveats |
| 10 | 复制截图中的表格 | New | P2 | H | OCR table extraction → editable grid → CSV; confidence review |
| 11 | 截图翻译 | New | P3 | H | Capture → OCR → opt-in local translation/model where supported; never promise fully offline language support unverified |
| 12 | 图片尺寸一键调整 | Existing | P1 | L | Quick action into existing resize, saved presets, undo-by-new-copy |
| 13 | 批量图片格式转换 | Existing | P1 | L | Preserve pipeline and ZIP; add quick presets; PR #302 pending enhancements |
| 14 | 纯文本粘贴 | Partial: text cleanup, not global paste | P0 | M | In-app first; system-wide shortcut only with permitted native automation |
| 15 | 固定文本快捷插入 | Partial: snippets/presets, not global insertion | P1 | M | Opt-in templates, trigger selection, no auto-typing into password fields |
| 16 | 一次复制多段文字 | New | P0 | M/H | Opt-in multi-clip basket with ordered join and one explicit paste |
| 17 | 清除多余空格和换行 | Existing | P0 | L | Reuse Quick Text Cleaner, preserve intentional paragraphs with preview |
| 18 | 批量查找替换 | Partial: Writing Desk single-document find/replace | P1 | M | Multi-text-file bounded engine with preview, encoding safety, and replace-by-copy |
| 19 | 批量重命名文件 | Existing | P1 | L | Enhance preview, collision and unicode behavior, no overwrites |
| 20 | PDF 快速合并拆分 | Existing | P1 | L | Quick action to existing pdf-lib tools, drag order; PR #303 pending, avoid duplicate |
| 21 | 重复文件查找 | Partial: selected file hashes | P1 | M | Folder scan after explicit consent, hash verification, preview, report only by default |
| 22 | 表格批量清理 | Partial: CSV table and XLSX data interchange | P2 | M | Trim/normalize/dedupe/column rules, dry run, leading-zero and formula safety |
| 23 | 批量生成 PDF | Partial: per-file PDF workflows | P2 | M/H | User-selected images/Markdown/templates → numbered PDF exports, safe ZIP |
| 24 | 文件自动分类 | New | P2 | H | Preview-only rule-based classification of explicitly selected files/folders; opt-in apply, conflict recovery |
| 25 | 批量压缩文件 | Partial: JSZip export and image batch | P1 | M | Standalone multi-file ZIP presets and progress, compression expectation transparency |
| 26 | 文件名提取成清单 | Partial: selected-file labels/pipeline manifest | P1 | L | Explicit selected files → TXT/CSV/Markdown listing, no hidden directory enumeration |
| 27 | 文件批量转换 | Partial: format-specific batch tools | P2 | H | Capability matrix; dispatch only actually supported formats; never promise arbitrary binary conversion |
| 28 | 多张表格合并 | Partial: CSV/XLSX first-sheet importer | P2 | M/H | Union/intersection by headers, optional key join, provenance, encoding safety |
| 29 | 邮件附件整理 | New | P3 | H | Explicit user-chosen local attachments; email integrations only after authorization; no silent inbox access |
| 30 | 一键打开常用工作区 | Partial: app favorites/recent views, not OS app launching | P1 | M | Saved in-app workspaces first; native app/folder opening through strict allowlist and user consent |

## Dependency-first delivery

### P0: Quick Actions foundation
1. Define stable typed action registry, scope/permission metadata and searchable localized labels. Reuse existing `⌘K` command palette; reserve optional global shortcut for a separate native bridge.
2. Ship safe clipboard text utilities from existing Text Cleaner first (no auto-monitor), multi-copy basket, in-app paste-as-plain-text and local snippets with explicit user invocation.
3. Build Safari/Chromium Web Capture extension proof-of-concept as a separate minimal-permission package: user-click extract visible webpage text, article Markdown and selected links. Explicit transfer to Universal Box only when user requests it.
4. Screenshot-to-OCR: separate macOS screen capture permission handling and Vision wrapper; output preview, layout ordering and manual corrections; copy only after consent.

### P1: strengthen existing tools (no new duplicates)
- Link action registry to image resize/converter, PDF merge/split/reorder, text clean, batch rename, file selection report and ZIP batching.
- Extend duplicate detection from selected bounded sets to opt-in folder scanning without deletion.
- Add safe batch text replace, fixed text snippets, webpage PDF print and DOM-table CSV.
- Treat PR #302/#303 as pending, validate CI and merge without duplicating their changes.

### P2: office workflows
- Dry-run spreadsheet cleanup with exact cell values; multi-source merge with schema preview and audit.
- Batch produce local PDFs, support batch conversion only for a verified file-type matrix.
- Explicit rule-based file classification with preview and recoverable outputs.
- Table OCR must provide editable confidence/structure corrections.

### P3: platform-heavy workflows
- Scrolling screenshots, local screenshot translation, email attachment organizer and deeper native integration only after permission UX, reliable on-device performance and privacy audit.
- Do not ship silent background tracking, autonomous email downloads or unsupported OS-wide automation.

## Cross-cutting acceptance criteria
- Chinese + English labels; keyboard access; UI discoverability via Quick Actions, All Tools, and existing `⌘K` search.
- Unit/integration test for real output bytes, duplicate names, paths, malicious HTML, cross-origin iframes, CSV formulas, encoding, giant input and cancellation.
- Confirm offline execution in supported environments, and show when optional downloads/system dialogs are required.
- macOS CI (TS/Vitest/Rust/build) + signed-device permission tests + real Safari/Chromium extension QA before any delivered claim.
- Add one shared action only when it invokes a verified existing tool; no dead menu entries or fake buttons.
- Log no user content. Only user-initiated clipboard reads, screen captures and file choices.
