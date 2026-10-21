# Sentinel Box · v0.47 candidate — accurate captions, selected XLSX sheets & opt-in clip basket

Three concrete roadmap gaps based on Issue #62, the 30 Quick Actions plan and official standards.

## 1. Genuine timecoded captions from local Apple Speech
- Native Apple Speech uses `SFTranscription.segments` / `SFTranscriptionSegment` for **actual utterance timestamps, durations, confidence and segment text**. Result data is returned from the existing Tauri on-device-only transcription command. Speech authorization, local model requirement, 90 second limit and no-cloud-fallback remain unchanged.
- Captions are generated from true segment times, grouped into bounded cues and exported as **SRT (comma milliseconds)** or **WebVTT (period milliseconds with WEBVTT header)**. Missing/invalid segment timestamps cause explicit errors; caption timings are never fabricated from word counts or evenly distributed.
- The manually edited transcript remains independent: editing TXT/DOCX **does not automatically re-align** speech segments. SRT/VTT uses the original Apple Speech segmented text; users should review/correct subtitles in their subtitle editor.
- Based on [Apple SFTranscriptionSegment](https://developer.apple.com/documentation/speech/sftranscriptionsegment) and [W3C WebVTT](https://www.w3.org/TR/webvtt1/).
- A native macOS unit/build pass is NOT proof of recognition correctness on real human speech. That remains device QA.

## 2. Multi-sheet XLSX selection → real CSV ZIP
- Safely enumerates 1–20 workbook sheet names from bounded XLSX OOXML and workbook relationships. User sees actual sheet names, selects any subset, and explicitly exports each as separate CSV inside a ZIP with a source-free manifest.
- Maintains existing XLSX validation: 4MB source size, ZIP path and macro/external link bans, worksheet relationship allowlist, bounded uncompressed XML, max 1,000 rows/50 columns for processed sheets.
- Formula cached values only, not recalculated. CSV output protects against spreadsheet formula execution and preserves text including leading-zero IDs. Does not preserve Excel cell styling, charts or attached workbooks. User originals are never modified.
- Excel naming requirements remain as defined by Microsoft; we read names rather than rename sheets: [Microsoft Support](https://support.microsoft.com/en-us/excel/rename-a-worksheet).

## 3. Opt-in manual multi-clip text basket
- User explicitly pastes/adds up to 20 snippets (5,000 chars each, 40,000 chars total) to temporary React in-memory state; can reorder, remove, join with chosen separators, **click to write clipboard** or export UTF-8 TXT.
- No passive monitoring, hidden clipboard reads, password-field scraping, persistence, system-wide hotkey or automatic background access.
- Explicit clipboard writes follow [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText). They may be denied by host WebView/browser permissions; TXT download remains available.

## Testing

- Real OOXML fixture: two XLSX sheet parts + workbook relationships, explicit selection and CSV roundtrip with Chinese and formula-safe text. Unsupported sheet index and malformed inputs are rejected.
- Native Apple Speech change compiles on both macOS architectures; pure timecoded cue tests include Chinese/English, valid SRT/VTT format, invalid/missing times and HTML escape.
- Browser opens the two-sheet XLSX in Sentinel Box, exports only the chosen CSV sheet, opens the ZIP and verifies manifest. Browser opt-in clip basket adds, reorders and downloads exact Chinese/English text.
- All previous unit and Chromium suites, Sentinel core regression, Intel + Apple Silicon DMG CI remain mandatory for merge. Real Mac recognition and WebView microphone privacy acceptance still require physical-device checks.

**Status:** candidate PR only until all automated checks succeed. No public release or downloaded proprietary assets added.
