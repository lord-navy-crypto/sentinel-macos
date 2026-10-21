# Sentinel Box v0.60 — Verified Client Delivery Pack

**Based on v0.59 PR #84**, which depends on #83/#82/#81/#80/#79. This is a stacked Draft implementation, not an automatically installed or released app feature.

## Why users need this

Small teams and freelancers often hand over chosen contracts, project reports, Word files, photographs and CSVs, with a trustworthy contents list and a way for recipients to confirm that the bytes match. Sentinel Box already has ZIP packing, SHA-256 inventory and CSV support. This milestone composes those into **one end-to-end, inspectable handoff** instead of another generic archive utility.

## Implemented v0.60 workflow

1. User explicitly selects **1–50 local files, 16 MB combined**. No directory walking, automatic uploading, remote links or cloud account.
2. User enters project, recipient, optional reference, delivery date and handover note. Preview source names, exact byte lengths and normalized numbered archive paths.
3. Reuse the existing bounded safe-renaming module; files appear under numbered files/ paths. Dangerous filename punctuation gets neutralized; duplicate originals remain distinguishable.
4. Calculate actual local SHA-256 digests using WebCrypto. Output ZIP contains:
   - files/001-... : unchanged source bytes
   - README-delivery.txt : manually entered project/client/note and exact file/hash inventory
   - reports/files.csv : formula-safe Excel-friendly CSV
   - reports/checksums.sha256 : per-file digest lines using standard hex / relative path representation
   - reports/manifest.json : machine-readable counts, paths, bytes and checksums
5. **Before saving** reread the real ZIP with CRC-32 verification and independently recalculate every extracted file SHA-256; reject inconsistent content, missing entries or size mismatches. Output cap 20 MB.
6. Do not modify source files, send emails, claim encryption, scan for malware, guarantee authenticity, or assert delivery was received.

## Security and privacy

- The ZIP contains the files users deliberately select; the recipient and potentially sensitive content must be reviewed before sharing.
- ZIP is **not encrypted**; anyone holding it may read the data. SHA-256 confirms content equality, NOT the trustworthiness of file authors or the absence of malware.
- No search or crawling of directories, clipboard monitoring, account access, invasive telemetry or remote uploads.
- User text is exported as inert plain text and JSON, never shell commands. Formula-like cells in CSV are neutralized before Excel import.

## Test and acceptance gates

- [x] Reuse existing safe rename, SHA256 hex format and CSV export modules.
- [x] SHA256 manifest and ZIP CRC + independent hash validation implemented.
- [x] React client/project/recipient form, file chooser, exact before-save preview and real ZIP export.
- [x] Unit tests for SHA-256 hello known digest, ZIP content, duplicate filenames, sanitized relative paths, formula-injection guard, bad dates/bounds and changing files during input.
- [x] Chromium E2E authored: select actual files, download ZIP, read back and compare with Node crypto SHA-256 implementation; refuses missing recipient.
- [ ] Latest TypeScript, Vitest and Chromium end-to-end CI green.
- [ ] Latest macOS Apple Silicon and Intel bundle CI green.
- [ ] Real Mac save and Windows/Mac extraction with independent hashes tested manually.
- [ ] Upstream dependency merge reviews and notarized release readiness.

## Follow-up roadmap

- **v0.61:** Review, consolidate and merge stacked PRs in order after release QA. Test signing, notarization, macOS privacy permissions and actual Apple Vision/HEIC hardware paths.
- **v0.62:** Improve discoverability/onboarding with short guided office workflows and real samples; avoid duplicate tool catalogs.
- **v0.63:** Only after validated downloads and real usage, investigate voluntary sponsorship and optional commercial deployment/support services. Never block core free offline utilities, collect customer files for monetization, or fabricate revenue.

**Definition of done:** source files included byte-for-byte in a real readable ZIP; independent SHA256/CRC verification succeeds and the user can inspect all output files before sharing.
