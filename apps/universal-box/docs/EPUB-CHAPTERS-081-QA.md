# Sentinel Box v0.81 · Offline EPUB Chapter Reader

2026-10-22 · Stacked Draft based on #105; not a released installer.

## User benefit

Read unencrypted EPUB chapter text without a subscription or an online converter. See the original reading order and export a chapter as TXT or the chapter index as CSV. This is independent of existing PDF, OCR, image, bookmark and TTS tools.

## Safety and scope

- Only a user-selected .epub (100 bytes–12 MB); uses the bundled JSZip package.
- Enforce ≤800 zip entries, ≤55 MB inflated bytes, ≤120 chapters, ≤1.2 MB per chapter and ≤2 million extracted characters. Reject ZIP path traversal, unsafe archive names and invalid package metadata.
- Explicitly detect META-INF/encryption.xml and reject encrypted/DRM-protected books. **Never attempt DRM decryption** or bypass access control.
- Follow the EPUB OPF manifest and spine reading order. Extract only text from HTML/XHTML using inert string processing. Do not render the book's HTML, execute scripts, display remote images, load external fonts or fetch URLs.
- One chosen chapter appears in a read-only text box; other chapters remain on device in current view. TXT exports the chosen chapter; CSV exports names/path/character counts for the chapter list. No bulk extraction to unauthorized sites or background uploads.
- If a new book is invalid, preserve the previous book, selected chapter and its visible text.
- Filename and archive paths are bounded. Users should process only books they have rights to handle.

## Verification

- [x] Vitest: construct actual EPUB ZIP, verify Chinese/English chapter order, OPF metadata, inert HTML extraction, real TXT/CSV, reject encrypted/traversal/malformed EPUB.
- [x] Chromium: generate actual local EPUB and select it in app, inspect chapter content, download real TXT/CSV, reject encrypted book and preserve previously loaded chapters, verify no remote HTTP requests to injected book image/script URL.
- [ ] CI TypeScript/Vitest/Chromium green on latest SHA.
- [ ] Apple Silicon and Intel macOS build CI green on latest SHA.
- [ ] Manual Mac real EPUB 2/3 files, import/export and file dialog; EPUB with complex namespaces or navigation layout; confirm no external resources.

Only deploy after earlier stacked Draft PRs are reviewed/merged and actual app installer version synced.
