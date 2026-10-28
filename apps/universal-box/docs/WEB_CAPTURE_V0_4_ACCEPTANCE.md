# Sentinel Box Web Capture v0.4.0–v0.5.0 — Office Research Companion

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

## Version and packaging contract
- Update `public/web-capture/manifest.json` and `src/lib/webCaptureBundle.ts` together. The current development branch version is **0.5.0**.
- Sentinel Box continues exporting exactly three files: `manifest.json`, `popup.html`, `popup.js`.
- The bundled source remains local, with no remote script/CDN dependency.
- Existing desktop CSV Cleanroom import remains a deliberate file/clipboard step, not an automatic data bridge.

## Validation checklist
- Automated: `node --check public/web-capture/popup.js` (run from `apps/universal-box`).
- Automated: `npm run test -- src/lib/webCaptureBundle.test.ts src/lib/webCaptureModes.test.ts` after installing the project's Node dependencies.
- Browser: load unpacked folder through `chrome://extensions`; verify all existing and four new actions on normal HTTP(S) pages.
- Browser: test empty selection, a page without metadata, multiple/merged tables, image URL CSV escaping, restricted pages and missing permissions.
- Browser: verify no cross-tab capture, history access, silent background traffic or remote uploads. Test RIS import into a reference manager and Markdown tables with escaped separators. Confirm that downloads keep source pages untouched.
- Native Mac: from Sentinel Box export the v0.5.0 ZIP, inspect manifest and open it as an unpacked Chrome/Edge extension; separately import exported CSV into the existing desktop CSV Cleanroom.
- Browser smoke tests do not certify every website, every rendering engine, external sites' metadata correctness or macOS-native integration. Keep the PR draft until CI and manual acceptance are complete.

## Official Chrome references
- [activeTab and minimal access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [chrome.scripting permission and injection scope](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Privacy principles](https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy)
- [Single-purpose and permission declarations](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Security best practices](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
