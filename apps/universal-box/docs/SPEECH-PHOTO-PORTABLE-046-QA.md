# Sentinel Box · Speech, Photo, Windows/Mac Portable Files (v0.46 candidate)

## Scope: three working modules

**1. Explicit on-device Apple Speech, from audio file or microphone recording**

- User clicks Start Recording; WebView must prompt for microphone, recorder stops on user Stop or **90-second** maximum. Recording is not automatic, always in-app. Alternatively user selects local audio (WAV, MP3, M4A and other formats **only when Web Audio can decode them**; no promise of universal codecs). Inputs limited to 12 MB.
- Real Web Audio decodes the chosen audio and resamples mono/stereo to **mono, 16 kHz, signed 16-bit PCM WAV**, with safety limits. This standardized WAV can be exported without running speech recognition.
- **Actual macOS-only Tauri command** `transcribe_on_device_wav` uses Apple's Speech framework with `SFSpeechURLRecognitionRequest`, explicit `requestAuthorization`, `supportsOnDeviceRecognition`, and **`setRequiresOnDeviceRecognition: true`**. The OS language pack/locale must support offline recognition. **No online fallback**. Handles permission refusal, model unavailability, empty speech, errors and timeouts. Temporary private audio file permissions are 0600 and it is deleted on completion. Maximum 90 seconds.
- Supports selectable locales en-US, en-GB, zh-CN, zh-TW, ja-JP, fr-FR, de-DE, es-ES **subject to model availability**. User may edit transcript and export actual TXT or editable DOCX. Browser preview disables speech recognition instead of fabricating transcripts.
- Info.plist includes `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription`. No hidden background recording, no paid API.
- **Not** a guarantee that a particular language model is installed on every Mac, and not an OS-wide dictation service, diarization, real-time subtitles, or >90s transcription. Native model accuracy and macOS permission prompts need user/device QA.

**2. Batch target-size image compression**

- 1–10 explicitly chosen PNG/JPEG/WebP photos, each ≤8MB, total ≤25MB. Canvas decodes actual pixels and encodes JPEG/WebP with a descending quality schedule to *try* meeting 40–4000 KB output target. User also chooses max edge 512/1024/2048 px.
- A ZIP contains actual compressed images and JSON with **true output bytes, quality and `targetMet`** per image. If the target cannot be achieved it is clearly flagged; no unsupported “guaranteed 100 KB” claim. JPEG replaces transparency with white. True picture quality varies.
- Does not implement HEIC, AVIF or arbitrary codecs unless separately tested.

**3. Windows↔Mac text format conversion**

- 1–20 user-chosen text, CSV, Markdown, subtitle, simple config files (≤1MB each, ≤8MB total). Source: UTF-8, UTF-16LE/BE, Windows-1252, GB18030 or Shift-JIS. `auto` is BOM-based UTF recognition only and otherwise defaults to strict UTF-8; it **does not silently guess GB18030**.
- Output UTF-8, UTF-8 BOM or UTF-16LE BOM with LF or CRLF. New files only; ZIP includes new files and a manifest. No Windows EXE, Microsoft Office binary, iWork or generalized binary conversions are claimed. File extensions are not simply renamed.

## Tests and release gates

- Native Rust WAV guard tests for WAV magic, RIFF sizes, PCM16 sample constraints, locale allowlist, max duration and audio safety bounds.
- Vitest confirms real WAV resampling and PCM header, GB18030 Chinese, Windows-1252 euro, UTF-16 BOM/UTF-8 BOM conversion, CRLF/LF, archives and size restrictions.
- Playwright actually uploads real WAV and exports resampled WAV; uses Chromium fake microphone device *with consent test configuration*, records real audio then exports WAV; encodes PNG→JPEG and decodes the JPEG's actual dimensions; uploads Windows UTF-16LE Chinese and verifies UTF-8 BOM/LF output.
- This **does not** substitute for a successful Apple Speech transcription on a physical Mac with the relevant on-device language model installed. That must be tested separately. Source audio content never goes into CI fixtures except generated synthetic tones/silent mic test.
- Run full existing browser catalog/workflow tests, Intel and Apple Silicon macOS DMG (native ObjC blocks/Speech framework compilation), and Sentinel Go core. Merge only after green.

**Compatibility:** Public name Sentinel Box, package/source directory `apps/universal-box` deliberately kept for internal upgrade compatibility. All operations run user-initiated with no mandatory login or subscription.
