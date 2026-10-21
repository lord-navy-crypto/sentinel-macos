# Sentinel Box v0.45 Quality & Repair — Office, Audio, PDF

**Roadmap mapping:** GitHub Issue #62, Section A (two DOCX paragraph review), Section E (WAV silence trim/audio processing), Section A/B/F (real PDF document inspection and batch reports). This round does not duplicate the existing single WAV trim/normalization or PDF page rotation tools.

## Actual operations

**1. Word paragraph diff.** User selects two real `.docx` files up to 8 MB each; existing read-only Office OOXML inspection extracts visible text paragraphs. A bounded 300-paragraph longest-common-subsequence comparison emits `+/-/same` changes, preview and ZIP containing human-readable text and structured JSON. This is a **text-only paragraph comparison, not Word Track Changes**, visual layout diff, tables, images, comments or revision history. No macros executed; no documents changed.

**2. Auto-trim PCM WAV silence.** User selects a 16-bit uncompressed WAV (mono/stereo, 8–192 kHz, ≤20 MB). Scan amplitude per audio frame; dBFS threshold from −75 to −15; preserve 0–750 ms padding, calculate start/end and call the existing bounded WAV encoder. ZIP contains genuinely shorter, valid WAV and JSON trim data. All-silent samples are rejected, not guessed. This is **not speech recognition or advanced noise reduction**, and MP3 is not supported.

**3. Multi-PDF page inventory and comparison preparation.** Explicit selection of 1–12 PDFs (≤15 MB each, ≤30 MB total). Uses existing pdf-lib page and metadata reader to count pages, orientations, unique CropBox dimensions, title and author. Exports true UTF-8 CSV and JSON into one ZIP. No OCR or PDF changes; it is an informational report only. Metadata might contain private names and should be reviewed before sharing.

## Acceptance gates

- Vitest tests generate *real* editable DOCX files and inspect actual paragraph differences; synthetic PCM16 tracks are trimmed and reparsed as RIFF WAVE; actual two-page PDF files are generated and reported.
- Three Chromium tests upload actual DOCX/WAV/PDF files through the visible application, download the real outputs and re-open ZIP members.
- Existing full suite and 130 tool-entry navigation test continue. Intel/Apple Silicon macOS DMG CI plus Sentinel validation must pass before merge.
- This round does **not** claim native permission/UI acceptance or a signed/notarized public release.

All operations are free and device-local with explicit user-selected files, no automatically altered originals or hidden network calls. No proprietary template copying.
