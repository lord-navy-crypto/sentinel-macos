# Sentinel Box v0.61 — Receive and Verify a Client Delivery Package

**Implementation branch:** feature/sentinel-box-061-client-delivery-receiver
**Dependency:** stacked on v0.60 PR #85 (which itself depends on #84/#83/#82/#81/#80/#79).
**Release status:** Draft code, not an installed or published release.

## Why this is a real user capability

v0.60 produced a local ZIP containing deliberately selected files and a manifest with SHA-256 values, but checking a received copy still required external hash tools. v0.61 completes both ends of the workflow: the recipient chooses a received Sentinel Box package and views a transparent, per-file comparison.

This is **not** a second generic ZIP explorer, malware scanner, encryption tool, digital signature or remote messaging service.

## Implemented workflow

1. Sender builds the existing client delivery ZIP. Recipient opens the **same Client Delivery** workspace and selects a received ZIP; no account, cloud upload, clipboard collection or automatic downloads.
2. User presses **Verify received ZIP**. Preflight with existing ZIP central-directory inspector enforces <=20 MB input, <=18 MB declared expansion, at most 58 entries, no encrypted entries, symlinks, path traversal, unsupported compression methods, duplicate/colliding paths or suspicious expansion ratio.
3. Open ZIP locally with CRC-32 verification, require reports/manifest.json, reports/files.csv, reports/checksums.sha256 and README-delivery.txt.
4. Strictly validate the producer manifest format and its contents: version 1, <=50 numbered files and <=16 MB declared original contents, bounded filenames, date, customer and project fields, no unsafe destinations or duplicate paths.
5. Verify the CSV inventory and SHA256 sidecar **agree exactly with the JSON manifest**. For each user file in the manifest, reread bytes from the ZIP and recalculate SHA-256 using local WebCrypto.
6. Show per-file statuses **match**, **changed**, **size_mismatch**, **missing**, **extra**, and overall pass/fail. Extra paths are listed but never executed or extracted to disk. User can save an honest UTF-8 text verification report.
7. Explicit warning: source ZIP and manifest are **unsigned**; an attacker can change both. Equality to a manifest does not establish the sender's identity, prove absence of malware, ensure confidentiality or certify receipt.

## Testing performed / acceptance gates

- [x] Existing sender ZIP remains byte-for-byte unchanged.
- [x] New receiving verifier and UI built into ClientDeliveryDesk (no duplicate tool catalog entry).
- [x] Vitest cases: a genuinely created/loaded valid package; same-size content modified with regenerated valid ZIP CRC; size mismatch; missing/extra files; altered checksum list; missing/invalid manifest; unsafe archive paths.
- [x] Chromium end-to-end sender → download ZIP → receiver upload → match report; modified ZIP → mismatch report.
- [ ] Latest TypeScript build and Vitest results green.
- [ ] Latest Chromium end-to-end workflow green.
- [ ] Intel and Apple Silicon macOS desktop CI green.
- [ ] Real macOS Finder/Windows Explorer ZIP compatibility and file-hash comparison done on recipient computer.
- [ ] Manual security review and full stacked PR integration completed.

## Release consolidation and sustainability priorities

**v0.62 — Release consolidation:** merge and validate the current stacked branches after review and conflict resolution, run regression tests on installed Mac apps, review native permissions, check code signing/notarization and user distribution. The scope is stability, NOT another flood of tiny tools.

**v0.63 — Onboarding and optional support:** write simple workflow examples for PDF/image/business/meeting handoff; permit voluntary sponsorship only after legal/owner setup. No fake user counts, disguised advertisements, data resale, mandatory subscription or restrictions on core offline processing.

**Definition of done:** Both sender and receiver have explicit inputs; a tampered delivery file is flagged even if the altered ZIP has a valid CRC; all generated reports correspond to actual bytes, no silent success, no source mutation.
