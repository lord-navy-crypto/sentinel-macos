# Sentinel Box native acceptance — Office, OCR, LAN, and notarization

Scope: the Tauri product in `apps/universal-box`, **not** the root-level Sentinel security application. Status: acceptance procedure prepared; tests below must be executed and independently recorded on authorized real Macs.

## Files to verify

Use the test DMGs attached to the newest [Sentinel Box Desktop CI](https://github.com/lord-navy-crypto/sentinel-macos/actions) for the exact git commit in question. The CI artifact includes a `.dmg`, `.dmg.sha256`, and `.dmg.build.txt` with source commit and architecture. They are explicitly **ad-hoc signed and NOT notarized**. Never bypass macOS security controls or describe them as public release files.

On the corresponding real Mac, first verify the checksum using `shasum -a 256 path/to/package.dmg`, compare with the artifact checksum, and run:

```bash
cd apps/universal-box
bash scripts/verify-macos-dmg.sh test "/path/to/Sentinel-Box.dmg" aarch64-apple-darwin
# On an Intel Mac substitute x86_64-apple-darwin.
```

The script performs an actual disk-image mount, checks bundle identifier, executable architecture and ad-hoc signature, and prints checksum and version. **It is not a substitute for UI testing.**

## Real-Mac office task checklist (separate evidence for each machine)

For every test, record the Mac CPU architecture, macOS version, app version/commit, test file category, result, and saved evidence without uploading private customer documents.

| Task | User interaction | Required real-world outcome |
|---|---|---|
| Launch/install | Open controlled QA build and navigate six first-page office shortcuts | Application opens; all six routes load; Cancel/back works without data loss |
| Plain clipboard | Select known Chinese, English and emoji mixed text in another app; user clicks Paste Plain Text and Copy Result | Plain text preserved correctly; rich formatting removed; clipboard permissions denied/allowed are explained, never secretly read |
| Rich clipboard | Explicitly copy formatted result and paste into Pages/Word when available | Text readable; font fallback and changes made clear; permission denial is not reported as success |
| PDF order/merge | Import two non-sensitive PDFs with different page counts; review preview then export | Real PDF opens in Preview; page count/order matches preview, selected text/graphics remain readable |
| PDF split/rotate | Split and rotate a small document in PDF tools, then reopen in Preview | Correct individual pages, no silent changes to input files |
| Images | Convert PNG (with alpha) and JPEG/WebP in a batch | Preview/ZIP includes valid image signatures and dimensions; JPEG alpha-loss is disclosed; byte-size comparison is truthful even if file grew |
| Word | Export a sample DOCX with headings and optional math symbols | Opens in Pages; also Word if available; symbols/layout/font substitutions inspected visually |
| CSV/XLSX | Select an XLSX sheet with leading-zero IDs, dates, formulas | Output clearly identifies loss of formatting/formulas; identifiers reviewed in Numbers/Excel, not silently truncated |
| OCR | Select a consented English + Chinese image; run on-device Apple Vision OCR | Text reviewed manually; permission prompts and failures handled; no hidden screen capture/cloud upload |
| File rename | Choose several safe test documents, preview filenames, export ZIP | Old/new manifest matches outputs; ZIP file contents are identical to originals; name collision blocked |
| Error handling | Corrupted PDF, empty clipboard, malformed CSV, oversized file, cancelled save | Visible concise error, no stale success message and no changes to source file |

## Two-device LAN validation

Requires **two separate authorized computers** on the same local network. Simulated loopback TCP is already covered by Rust tests but cannot substitute for these checks.

1. Start a one-shot opt-in encrypted share using a disposable ZIP containing a test text file and test image; no customer data.
2. Find the sender via nearby-device discovery or explicitly share the one-time invitation with the authorized receiving machine. Invitations contain secret decryption keys: do not put them into issue comments, logs or screenshots.
3. Explicitly accept on the receiving device. Verify the imported ZIP's byte contents and local SHA-256 against the sender's original; do not accept a progress bar alone as proof.
4. Attempt another receiver without the invitation, then try an expired/reused or stopped invitation. It must not reveal file bytes.
5. Disconnect networking during a transfer and cancel an in-progress share. Verify a clear failure or cancellation without partial data being accepted as complete.
6. Test again with VPN/firewall constraints, documenting honest error messages. Do not claim remote internet/P2P support from this local-network test.

Record both device CPU types, network environment, test artifact SHA-256, and pass/fail evidence; redact invitation secrets, local IPs and personally identifying files.

## Signed and notarized release candidate

Authoritative references: [Tauri v2 macOS signing/notarization](https://v2.tauri.app/distribute/sign/macos/) and [Apple notarization documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

After installing the valid **Developer ID Application** certificate and securely configuring App Store Connect API-key or app-specific Apple notarization authentication in a trusted Mac environment, run this opt-in candidate builder on a clean committed source tree:

```bash
cd apps/universal-box
bash scripts/build-notarized-macos.sh aarch64-apple-darwin
# Separately build x86_64-apple-darwin, with an authorized Intel Mac for native testing.
```

The builder refuses absent signing and notarization credentials, runs unit and native Rust checks, invokes Tauri with `APPLE_SIGNING_IDENTITY` (which overrides its ad-hoc Tauri setting), then requires Developer ID chain, Gatekeeper acceptance, attached notarization ticket and the correct architecture, followed by the saved hash and source provenance. It does **not** create a public release.

**No credentials should be shared in chat, screenshots, source control or unmasked CI logs.** GitHub Actions ad-hoc test DMGs are not suitable for Apple's notarization or for a public download.

## Final public release gate

- [ ] Real Intel and Apple Silicon app launches and office interactions accepted
- [ ] Real Pages/Word, Preview, Numbers/Excel and Apple Vision OCR interoperability accepted
- [ ] Genuine two-device encrypted LAN transfer, revocation and interruption accepted
- [ ] Developer ID signature, notarization ticket and Gatekeeper checks passed for exact downloadable bytes
- [ ] SHA-256 and commit provenance recorded for each release DMG
- [ ] Release notes document precise supported conversions and fidelity limitations
- [ ] User/maintainer explicitly approves public distribution of the reviewed artifacts

**Current limitations of this ChatGPT session:** the only previously connected MacBook Air is offline; no second authorized Mac or Apple signing/notarization credentials are accessible. This checklist is an executable acceptance handoff, not a claim of tests that did not run.
