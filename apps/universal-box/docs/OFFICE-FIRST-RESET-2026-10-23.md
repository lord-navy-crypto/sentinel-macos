# Sentinel Box — Office-first product reset / 办公工具箱方向纠偏

Date: 2026-10-23. Status: **product direction and implementation gate**, not a shipped release.
Repository baseline: `main` @ `7580ee81272b3bc6d58a1e41d4146b4e41f864e1`.
This document governs the `apps/universal-box` / Sentinel Box office utility product; it does not redefine the separate Sentinel security program.

## One-sentence product promise / 唯一产品定位

**A free, simple, offline-first collection of ordinary clerical/office micro-utilities for documents, PDF, images, text, clipboard and files.**

**免费、简单、离线优先的办公文职与日常文件小工具合集。**

Our users should accomplish a common office task without opening five websites, creating an account, subscribing for a small operation, uploading private documents or learning a scripting language. We do **not** aim to become a scientific plotting suite, MATLAB clone, full Office editor, video studio, or complex AI platform.

### Non-negotiable rules

1. Prefer **polishing or connecting existing working utilities** to adding new catalog entries. One capability, one clear entry point.
2. Favor a single **Choose file → Preview → Save/Copy** workflow (aim for <=3 primary actions on ordinary files). No unnecessary tabs, settings, dashboards or feature jargon.
3. All feasible jobs run locally, no account/mandatory subscription/watermark/remote document upload. Do not promise infinite file sizes: enforce transparent safety and memory limits.
4. Never silently overwrite originals. Offer exact output name, format support, preflight warnings, a real save/copy result, and cancellation. Batch rename needs collision previews and a recoverable plan.
5. Do not fake conversions by renaming suffixes. Explain what disappears: fonts when exporting TXT, transparency when converting to JPEG, editing/formulas when rasterizing PDF, metadata when re-encoding.
6. No hidden clipboard monitoring, system-wide file scans, network uploads, bypass of software licenses/DRM or unlawful imitation of proprietary code. User-triggered clipboard or screen operations only.
7. Native permissions (macOS clipboard, microphone, Apple Vision OCR, Finder) require real-Mac testing. CI-green ≠ native release approval.
8. New tools are accepted only if a normal office user has a clear recurring task, a simple UI, a supported offline implementation, and real input/output tests.
9. **Stop creating scientific/research features**, e.g. least-squares fitting, experimental error bars, residual plots, symbolic solvers, laboratory simulations. Optional simple calculators and clipboard-ready charts may remain secondary, but not consume the office roadmap.
10. Prioritize reducing **time-to-task and UI clutter** over marketing the raw number of tools.

## Official first-party product evidence (checked 2026-10-23)

| Verified product | First-party baseline | Sentinel Box independent opportunity |
| --- | --- | --- |
| Microsoft PowerToys | Advanced Paste: plain-text, Markdown/JSON formats, paste as local file and on-device OCR. PowerRename: batch rename preview, regex and undo. Text Extractor: screen OCR. | Simple copy-as-plain-text, paste-to-TXT, batch rename preview and OCR→copy in one place. |
| PDF24 Creator | **Already completely free for private/business Windows use**, offline merge/split/compress/OCR/conversion, batch operations. No macOS Creator version stated. | Cross-workflow convenience on **macOS**, clearer preview, local saving, less menu hunting. Do **not** claim every existing PDF workflow is only available via subscriptions. |
| Apple Preview | macOS PDF sign/markup/rearrange/password protect, image conversions/resize and related single-document operations. | Batch and combined workflows that complement, not duplicate, Preview. |
| Adobe Acrobat Pro | Paid PDF editing, conversion, OCR, document security and signing workflows. | Legitimate standalone, local alternatives for **specific simple tasks**, clearly stating limitations; no promise of full Acrobat parity. |
| LibreOffice | Free open-source full office suite. | Avoid rebuilding Word/Excel/PPT; focus on file conversion, mail merge, portable text, and daily office micro-actions. |

Official sources:
- https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste
- https://learn.microsoft.com/en-us/windows/powertoys/powerrename
- https://learn.microsoft.com/en-us/windows/powertoys/text-extractor
- https://tools.pdf24.org/en/creator
- https://tools.pdf24.org/zh/all-tools
- https://support.apple.com/guide/preview/welcome/mac
- https://www.adobe.com/acrobat/plans.html
- https://www.libreoffice.org/

## Corrected release priorities / 真实优先级

Work from existing `main` and inspect the tool catalog **before implementing anything**. A feature on an unmerged PR does not count as an already-shipped function.

| Priority | Real-world task | Existing foundation to strengthen | Acceptance target |
| --- | --- | --- | --- |
| **P0** | PDF merge/split/reorder/compress, images→PDF, PDF→image, add page numbers | PDF Mini, File Desk, PDF converters/organizer | Genuine PDF readback, page counts/order, before/after byte sizes; warn about quality and text-layer loss. |
| **P0** | Image resize/crop/batch JPEG/PNG/WebP, target-KB photos | File Desk, batch image pipeline, target photo compressor; draft PR #120 for signature verification | Preview each result and dimensions, true image header checks, explicit transparency warning, ZIP import/extract verification. |
| **P0** | Copy plain text, clean unwanted formatting, bulk literal replace, text/links/characters | QuickKit, text tools, text codec, manual clip basket; draft PR #118 for case/width | Copy works when permissions allow; text not silently changed; CJK/Emoji/CRLF and pasted HTML tested. |
| **P0** | Screenshot / selected image → OCR → copy / DOCX | Existing Apple Vision workflows | Actual native permission QA, Chinese/English text review, no hidden screen capture, save/copy confirmation. |
| **P0** | Batch file rename and file sorting | Existing file/batch tools | Show old→new filenames before applying, detect collision, cancel and rollback/undo when possible, preserve originals. |
| **P1** | Text/TXT/Markdown → formatted DOCX/HTML; batch typography and special symbols | Existing Writing Desk, Free Formats; draft PR #119 | Real DOCX zip/XML readback, copy text and formatted copy, transparent font fallback; not arbitrary HTML→Word fidelity. |
| **P1** | Small-business clerical work: minutes/action items, invoices/quotes, CSV template mail merge | Existing business-billing, office-privacy, workflow modules; PRs #84/#85 for meeting notes and verified handoff | One template, simple user fields, real DOCX/CSV/PDF/ZIP, filenames verified, no invented customer/person records. |
| **P1** | Spreadsheet data helper: XLSX sheet pick→CSV, CSV/TSV merge/dedup, Word text compare | Existing Free Formats and table/workflow modules | Preserve leading-zero IDs, warn before losing formulas/layout/multiple sheets, export actual readback. |
| **P1** | Bulk duplicate detection, document delivery ZIP, SHA-256 verification | Existing file-intake/integrity tools; draft #85 | Only user-selected files, user-readable status, integrity readback and no hidden file monitoring. |
| **P2** | Local-only LAN transfer between two computers | Existing LAN UI/service | Two real devices, explicit pair/accept, checksums, cancel and recovery, no hidden cloud relay cost. |
| **Deferred** | Plot regressions, residuals, error bars, advanced symbolic math, matrix laboratory tools | Draft PRs #121–#126 | **Paused**. No merge or new follow-up development unless a future, distinct user requirement justifies it. |

## Next implementation sprint — only three outcomes

**Sprint 1: Find & finish, not feature-count inflation.** Review current quick actions and unify six user-facing top-level entry groups: PDF, Images, Text & Clipboard, File Operations, Office Documents, OCR. Reuse component routes and tool IDs rather than cloning code. Bilingual plain-language labels; move specialist graph/math tools behind secondary search, not featured on the default office home.

**Sprint 2: Two or three small features with real outcomes.** (a) Plain-text paste / clean copied formatting, only on explicit click; (b) batch rename old→new collision preview + save plan or safe applied rename; (c) PDF/image batch convert with preview and actual file-size comparison. Prioritize **fixing gaps in the existing implementation** before authoring a new converter.

**Sprint 3: Mac acceptance and release.** Validate office files in Preview, Pages/Word, Excel/Numbers, and native clipboard permissions. Run package install on both Apple Silicon and Intel where available. Test local save location, cancellation, error handling, corrupted input, multiple encodings and file type mismatch. Update release notes with only confirmed features. CI artifacts are not a public notarized DMG.

## PR backlog triage as of this reset

- **Office-priority candidates, still unmerged:** #84 meeting minutes, #85 delivery verification, #118 text case/width, #119 typography, #120 image compatibility. Integrate only after checking base branches, latest-head CI and native UX.
- **Pause as out-of-scope:** #121 native LaTeX math, #122 numeric graph data, #123 drawing board extension, #124 calculator history, #125 graph PNG, #126 scientific plotting/regression/residual/error bars. **Keep Draft/unmerged** rather than assuming these appeared in `main`. Revisit only if they become a specific minor office-task requirement.
- The #85 stack depends on #84. Do **not** blindly merge or interpret an upstream branch as released. Resolve stack dependencies deliberately.
- Avoid promising that all past PRs can merge without conflicts; give the mainline priority to stable office functionality and user-facing simplicity.

## Definition of done: a tool becomes real only after

- [ ] One-sentence office job, single primary action and short failure text.
- [ ] Verified real file/content output, not just a button click or download event.
- [ ] Compatibility loss explained; no fake progress, quotas, parity or perfect conversions.
- [ ] Unit + actual browser/readback tests; no sensitive sample records, no fake client data.
- [ ] Successful latest-head core/browser CI and both macOS builds.
- [ ] Actual macOS UI, permission and receiving-app QA where the feature needs it.
- [ ] Mainline integration, regression test and explicit release sign-off (do not call Draft a release).

**Success is a clerical user's completed task, not the number of catalog entries.**
