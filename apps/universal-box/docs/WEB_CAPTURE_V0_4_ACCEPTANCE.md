# Sentinel Box Web Capture v0.4.0–v0.9.0 — Office Research Companion

## Scope and why
The browser extension is an opt-in, local-only bridge between a page the user is currently viewing and Sentinel Box's document, table, media and research workflows. It is **not** a browser-history or credential-monitoring sensor. Its sole capture trigger is an explicit popup button.

## Existing functions retained
- User-requested visible page text and approximate Markdown extraction
- Page headings, source title/URL, link CSV
- User-selected visible HTML table inventory and safe CSV export
- Local preview, text clean-up, copy and file download
- Browser print dialogue for PDF, under browser control

## New functions
1. **Selected excerpt with attribution**: export only explicitly selected page text to a Markdown note that includes the page title, URL and UTC capture date. No selection is an error; selected text above 40,000 characters is rejected.
2. **Citation note**: collect current title and URL, and optional author, description and date *as declared by the page*. These claims are not verified. Export as Markdown.
3. **Image inventory**: list visible image URLs, alt text and decoded dimensions in CSV without fetching or downloading images. Only HTTP(S) image references are listed; >1,000 visible images is an explicit error.
4. **Read-only page structure**: count visible headings H1–H6, links, tables and images, including images with empty alt attributes. No external link-checking and no malware verdicts.

## Privacy and permission contract
- Manifest V3, explicit `activeTab`, `scripting`, `clipboardWrite` only.
- No `host_permissions`, service worker, permanent content scripts, web requests, cookies, history, tab monitoring, network interception, telemetry, or automatic upload.
- No automatic scan on visiting a website; the popup accesses only the explicitly invoked HTTP(S) tab.
- No persistent extension storage. Captured content is held in the popup until closure, copied by the user or explicitly downloaded.
- CSV output protects spreadsheet formulas; oversized CSV is rejected rather than truncated mid-record.
- Never claim image `alt` absence necessarily indicates an accessibility defect, or a DOM count provides a malware/safety diagnosis.

## v0.5.0: additional on-demand office and research workflows
5. **HTML table to Markdown**: reuse the actively chosen visible table (at most the first 24), reject merged cells or oversized content, escape pipe characters in Markdown and note that the first row becomes the header. The existing CSV route is unchanged.
6. **RIS citation export**: a locally generated \`.ris\` file for reference managers, with page-declared title, optional author/published year, source URL and retrieval date. Page metadata is not independently verified.
7. **Link structure report**: report counts of unique same-origin/external links, HTTP links and missing text/aria labels, with top external hostnames. No network requests, link probing or phishing/malware verdict.
8. **Desktop/browser regression**: fix the obsolete browser smoke assertion hardcoded to 0.3.1; assert popup/manifest parity and the new action surfaces. Add executable Node VM tests for selected excerpts, empty-selection error, RIS metadata, link grouping, table Markdown and refusal of merged cells.

## v0.6.0: user-approved, auditable browser-to-desktop handoff
- New **Save table handoff JSON** action exports only the explicitly selected visible HTML table as `sentinel-box-web-table` schema 1, carrying safe CSV, webpage title, source URL, capture time, index and row/column counts. No browser background service, server or silent desktop bridge.
- The existing **Sentinel Box Web Capture** desktop workspace now has a separate **Import Web Capture table JSON** file picker. It validates version, HTTP(S) source URL without embedded credentials, capture-time field, table dimensions and size before passing the CSV into the existing local CSV Cleanroom.
- Desktop provenance is displayed as plain text; the user must inspect the preview and opt in to export. Import never overwrites the original browser download.
- Better main-text extraction: prefer `main/article/[role=main]` over the entire page body when available. This reduces unrelated navigation and footers in ordinary text capture.
- No changes to existing selected-table CSV/Markdown, note, link audit, images, print, clipboard or PDF workflows. The extension ZIP still contains the original three files.
- Release gate includes source-level and browser UI tests: valid handoff, invalid schema/URL/limits, formula-shaped CSV inputs, preserved provenance, and explicit export confirmation.

## Privacy and CSV security note
Even with per-field quote prefixes, CSV data from untrusted webpages requires careful review before opening in spreadsheet software; OWASP notes there is no universal cross-application formula neutralization guarantee. The JSON handoff preserves explicit-source metadata and does not automatically open spreadsheets, fetch URLs or send anything to a cloud endpoint.

## Official references
- Chrome scripting and activeTab: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Chrome activeTab design: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- OWASP CSV formula injection: https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection/

## v0.7.0: source-preserving exports and careful metadata capture
- The browser popup adds a **Source information card** (language, page title, URL, page-declared canonical link, author, description, publication date and capture time) as an offline Markdown note. Missing metadata stays missing and a canonical link is not treated as independently verified.
- The desktop Web Capture CSV Cleanroom adds a user-approved **CSV + provenance ZIP** export when the user imports a compatible table JSON. The ZIP contains a source manifest, the original table CSV as captured, the locally edited working CSV and the cleaned CSV; each remains a separate file.
- Editing data after import no longer discards the original source attribution. The UI explicitly reports edits, and the ZIP manifest marks `modifiedAfterImport`. Export remains disabled until the user checks the preview confirmation.
- The table handoff parser now checks stated row/column counts against the **actual parsed CSV**, rejecting false or inconsistent dimensions.
- Existing controls, original CSV-only export, selected-table CSV/Markdown, RIS, printing, file source and permission limitations are maintained.
- Additional archive and format-validation tests verify that source and modified/cleaned data are not conflated.

## v0.8.0: complete research brief and inspect-before-export table review
- **Research brief**: captures the current document's main text, its visible heading structure, page URL, capture timestamp and declared author in a single local Markdown note. It rejects empty or more than 160,000 text characters rather than silently producing incomplete evidence. Formulae, figures and exact layout are not claimed to be preserved; current webpage data may be unverified.
- **Selected table quality report**: uses the same explicit table picker to report row counts, expanded column widths, missing cells, merged cells and duplicate visible rows before exporting CSV, Markdown or the desktop JSON handoff. It does not alter the source. Complex merged header structures are warnings rather than fabricated rectangular datasets.
- **Privacy**: both operations are initiated by user buttons, run in the temporarily authorized active tab, make no external requests and add no browser permissions. The existing provenance ZIP, table import, citations, images, links and print remain available.
- **Verification**: targeted VM tests cover complete/oversized research text and table metrics with duplicate/blank/merged cells. Browser packaging tests require visible controls and script modes. Full Chromium/macOS CI and real-browser acceptance remain release gates.

### 2026 policy review
- [Chrome 2026 Limited Use and transparency update](https://developer.chrome.com/blog/cws-policy-updates-2026): continue strict single-purpose and disclosed data handling
- [Chrome activeTab permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): temporary site access only after a user action
- [W3C WAI tables](https://www.w3.org/WAI/tutorials/tables/): complex tables and headers may require row/column associations instead of treating any HTML table as simple CSV

## v0.9.0: completeness, fresh-table safety and spreadsheet risk checks
- No silent partial exports: ordinary page text, generated Markdown and link CSV now report explicit over-limit errors. Outline exports reject >250 headings; Markdown traversal refuses excessively nested (>36) DOM trees instead of dropping deeper content.
- **Fresh table guard:** the explicit scan stores a temporary table signature derived from visible table text and row count. Each selected-table action compares the current table with the scanned signature before exporting/auditing. If the table changes, the user is prompted to scan again. This is an accidental-staleness check, *not* cryptographic security verification.
- **Rectangular table validation:** CSV, Markdown and JSON exports refuse rows with inconsistent column counts or unsupported merged cells rather than producing deceptive data.
- **Spreadsheet formula risk:** the CSV writer conservatively prefixes formula-looking cells, including common full-width variants, and the table audit reports the number of potentially formula-like cells. This is defense in depth, not a guarantee across Excel and other spreadsheet products.
- Privacy remains unchanged: Manifest V3 with `activeTab`, `scripting`, `clipboardWrite`, no background worker, broad host access, history tracking, remote network calls or automatic uploads.
- Regression tests cover table signature change, formula-like values, malformed rectangular data, long document/Markdown, long link inventory, and manifest permissions. Run `node --check public/web-capture/popup.js` plus `npm run test -- src/lib/webCaptureModes.test.ts src/lib/webCaptureBundle.test.ts` and normal CI before merge.

References: Chrome [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), OWASP [CSV injection](https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection).

## Version and packaging contract
- Update `public/web-capture/manifest.json` and `src/lib/webCaptureBundle.ts` together. The current development branch version is **0.9.0**.
- Sentinel Box continues exporting exactly three files: `manifest.json`, `popup.html`, `popup.js`.
- The bundled source remains local, with no remote script/CDN dependency.
- Existing desktop CSV Cleanroom import remains a deliberate file/clipboard step, not an automatic data bridge.

## Validation checklist
- Automated: `node --check public/web-capture/popup.js` (run from `apps/universal-box`).
- Automated: `npm run test -- src/lib/webCaptureBundle.test.ts src/lib/webCaptureModes.test.ts src/lib/webCaptureHandoff.test.ts src/lib/webCaptureReviewBundle.test.ts` after installing the project's Node dependencies.
- Browser: load unpacked folder through `chrome://extensions`; verify all existing and four new actions on normal HTTP(S) pages.
- Browser: test empty selection, a page without metadata, multiple/merged tables, image URL CSV escaping, restricted pages and missing permissions.
- Browser: verify no cross-tab capture, history access, silent background traffic or remote uploads. Test RIS import into a reference manager and Markdown tables with escaped separators. Confirm that downloads keep source pages untouched.
- Native Mac: from Sentinel Box export the v0.9.0 ZIP, inspect manifest and open it as an unpacked Chrome/Edge extension; separately import exported CSV into the existing desktop CSV Cleanroom.
- Browser smoke tests do not certify every website, every rendering engine, external sites' metadata correctness or macOS-native integration. Keep the PR draft until CI and manual acceptance are complete.

## Official Chrome references
- [activeTab and minimal access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [chrome.scripting permission and injection scope](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Privacy principles](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)
- [Single-purpose and permission declarations](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Security best practices](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
