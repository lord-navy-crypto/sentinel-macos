# Sentinel Box v0.53 — Daily Essentials First

## Why this change

The product goal in [roadmap issue #62](https://github.com/lord-navy-crypto/sentinel-macos/issues/62) is **free, no-account, offline-first macOS everyday utilities**, not a growing collection of niche audit entrypoints. Existing `word-count` was only a whitespace-separated word counter and `input.length` in JavaScript. This PR **upgrades the real existing tool instead of creating a second catalog entry**.

Research reference points (features only, never copy code/design):
- Apple Pages documentation: word/character-with-or-without-spaces and selected-text counters: https://support.apple.com/en-lamr/guide/pages/tand47165437/mac
- WordCounter: document length goals, letters/characters, reading time, editing utilities: https://wordcounter.net/
- Raycast daily essentials: clipboard history, snippets, window management, quick launcher: https://manual.raycast.com/quickstart
- PDF24: prioritized common merge/split/compress/convert operations; offline Creator is **Windows-only**, so a complete, private Mac alternative still has an opportunity: https://tools.pdf24.org/en/all-tools and https://tools.pdf24.org/en/creator
- Unicode-aware segmentation: MDN Intl.Segmenter: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter

## Existing Word Counter upgraded

- Same catalog ID `word-count`; same Utilities tab. No catalog inflation.
- Visible grapheme count (combining sequences and joint Emoji count as one displayed character), UTF-16 units and actual UTF-8 byte length side-by-side.
- Unicode letters, Latin letters, Han characters, numbers, punctuation, symbols, Emoji grapheme clusters, whitespace and counts excluding whitespace.
- Locale-aware Unicode word segmentation where `Intl.Segmenter` exists; explicit approximation if unavailable. Counts may differ from Pages/Word or platform-specific quotas.
- Live selected-text metrics; practical 150-/280-character and 500-/650-word presets, adjustable custom limit; overshoot shown honestly (not an irreversible truncation).
- Manual UTF-8 text-file import (TXT, MD, CSV, SRT, VTT, JSON), **explicit-click clipboard-to-counter input** if WebView permissions allow it, copy/export plain TXT statistics. Clipboard reading is never automatic; users can paste manually when permission is unavailable. User text never automatically uploaded, persisted, altered or scanned from other apps.
- Basic paragraph/sentence counts and reading time remain **estimates**, not linguistic analysis.

## Actual coverage vs important remaining gaps (not pretended shipped)

| Domain | Already in project | Priority follow-up that materially improves a daily task |
|---|---|---|
| Writing | Basic text tools, Word templates, markdown, existing counter | **This PR: reliable counter**. Next: one shortcut from selected text into the same cleaner / counter and explicit privacy controls. |
| PDF | Page edits, metadata, hyperlinks, split/merge, inspection, basic OCR components | **P0: real PDF size reduction**, honest before/after quality and native tests; scanned-page searchable OCR, not metadata-only labels. |
| Screenshots | Apple Vision OCR, consented capture, markup | **P0: selection capture → OCR → one-click copy**, clear permissions and tested macOS accessibility flow. |
| Images | Batch resize/convert and real target-size photo compression | P1: HEIC input, batch presets and per-file before/after comparison under real Mac WebView; no claim of unsupported codec support. |
| Finder & text | Batch rename copies, organizing ZIP, manual clip basket | P1: clearer bulk preview and undo-by-copy workflow; fast launcher, opt-in snippets and clipboard handling with explicit protection. |
| Collaboration | Consent-driven LAN-related prototypes | P2 until tested on **two actual Macs**, transfer progress, cancellation, discovery, integrity and failure recovery. |
| Packaging | automated ARM/x86 DMG CI | P0 release hardening: native launch, code signing/notarization, permission prompts, real interoperability; CI alone cannot prove usability. |

Important sequencing decision: **improve an existing feature to a useful depth before adding more niche modules**. 3-verticals-per-round requirement in roadmap concerns future expansion, but a focused usability/quality PR should not invent two unrelated features to hit a vanity quota.

## QA checklist
- [x] Deterministic UTF-8/Unicode/Emoji/grapheme selection/length calculations in pure TypeScript.
- [x] Integrated with original Word Counter, original catalog ID preserved.
- [x] Live UI selection, import, copy, export and length monitoring.
- [x] Vitest tests for ZWJ Emoji, combining accents, Han vs Latin, 2-byte CRLF, empty text and invalid limits.
- [x] Playwright Chromium loads actual page, types Unicode, checks limits/selection, downloads/reopens TXT, imports UTF-8.
- [ ] Browser and Vitest CI green for latest PR head.
- [ ] ARM64 and Intel macOS builds green; physical macOS WKWebView segmented Emoji and file picker verified separately.

**Counting caveat**: Application submission sites differ in whether they count spaces, Unicode code units, display characters or words. Always check the destination site's own counter where submission limits matter.
