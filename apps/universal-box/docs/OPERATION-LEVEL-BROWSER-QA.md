# Universal Box: operation-level browser QA (0.37 candidate)

This suite is additive to the 0.36 catalog-routing test. A tool card rendering is **not** proof that a file operation works.

## Automated real Chromium workflow matrix

| Workflow | Actual input | UI action | Output assertion |
| --- | --- | --- | --- |
| CSV Cleanroom | Mixed CSV rows | filter; natural-sort column; preview and approve; save | downloaded sorted/filtered CSV, export blocked until approval |
| PDF mini editor | generated two-page PDF with distinct dimensions | insert blanks; download; reimport; reorder | valid PDFs with four then two pages, expected page dimensions and order |
| Excel formats | CSV with Chinese, leading zeros, XML characters, formula-looking text | generate XLSX; reimport; export CSV | parse real OOXML ZIP; escaped XML; no formula XML; safe CSV |
| ZIP studio | two uploaded original files | pack ZIP; reimport; select one; CRC-verified repack | verify real ZIP contents and manifests |
| Images | generated red/blue PNGs | batch convert PNG into ZIP; pixel difference PNG | verify ZIP manifest, PNG signatures and dimensions |

All operation tests save downloaded outputs and screenshots under test/browser-test-results/operations; the existing Actions uploader retains the evidence for 14 days. Tests run sequentially.

## Scope and transparency

- Only these five workflows receive *new end-to-end assertions*. Other tools retain previous unit tests or catalog navigation coverage. **Do not claim 96 deep functional tests.**
- Tests run the Vite app in headless Chromium on Ubuntu, **not** the native macOS WKWebView or Tauri dialogs, Finder, Gatekeeper, Apple Silicon/Intel DMGs, or two-Mac pairing.
- Test fixtures are deliberately small and deterministic. Third-party PDFs, corrupted ZIPs, large spreadsheets, image edge cases, OCR and LAN/P2P handshakes still need separate device acceptance.
- The CSV filter/sort works locally, retains the header, caps keyword length at 120, and preserves formula-safe export. All filtered exports require preview acceptance, save a separate copy, and do not use paid services.
- OCR, scrolling screenshots, broad conversion parity and native-device acceptance remain **planned**, not delivered here.

## Reproduce

From apps/universal-box with Node.js 22:

1. npm ci
2. npm install --no-save --no-package-lock playwright@1.58.2
3. npx playwright install --with-deps chromium
4. npm run build && npm test
5. Start npm run dev -- --host 127.0.0.1 --port 1420
6. node --test --test-concurrency=1 test/browser-ui-smoke.cjs test/browser-operation-regression.cjs

Review CI and artifacts before releasing a new macOS DMG.
