# Sentinel Box v0.80 · On-demand local text reader (TTS)

2026-10-22 · Stacked Draft on #104. Not shipped. **This converts written text into speech; it is not recording/transcription or OCR.**

## Daily function

- Paste a paragraph of Chinese or English to be spoken aloud using an installed local system voice; adjust 0.7x–1.5x rate, explicitly start, pause, continue or stop. Close the tool and active speech stops.
- The browser's Web Speech API can expose remote TTS voices. This utility **only accepts voices where the browser explicitly reports localService=true**. No local voice → Start is disabled; it does not fall back to network voices or call any cloud API. Browser/WebView and system voice support vary; the app cannot independently certify every voice engine's implementation.
- Import a single user-selected UTF-8 TXT/Markdown ≤20KB (content max 5,000 characters); reject invalid encoding, control characters and unsupported formats without changing existing text.
- No automatic reading, microphone access, network request, recording, export audio, clipboard listener, or persistent transcript. The current text remains in UI state only.
- Existing audio-to-text functionality is unchanged.

## Automated tests

- [x] Vitest: filter out remote/malformed voice metadata; locale ordering, Unicode text and 5,000 character cap; reject invalid rates.
- [x] Chromium: fake in-browser Web Speech engine with both local and cloud voices, verify only local option shown and used, confirm utterance text/rate/voice, pause/resume/stop and no remote fallback. Import real TXT and reject invalid UTF-8 without clearing valid text.
- [ ] Current TypeScript/Vitest/Chromium CI complete and green.
- [ ] Apple Silicon/Intel macOS builds complete and green.
- [ ] Real Mac: localService detection, actual offline voices in Chinese/English, button focus, leaving page stops utterance; microphone/network access checks.

## Release gating

Stacked on prior #104 and previous Draft dependencies. Real DMG version remains unchanged until ordered reviews/merges and native device QA. TTS audio download is explicitly **not** claimed.
