# Universal Box v0.42 candidate — genuine macOS OCR + user-authorized capture + workflow packs

## Apple Vision OCR (macOS-only)
- Tauri command `recognize_image_text` uses Apple's **Vision** framework, with `VNImageRequestHandler`, `VNRecognizeTextRequest`, accurate/fast levels, recognized line content and confidence. Image bytes are supplied only after a user selects a PNG, JPEG or WebP (1–8 MB); request runs in-process and **does not call any OCR server**. Recognition is subject to macOS Vision language/model support and image quality.
- React UI provides editable results and exports actual TXT or editable DOCX using the existing offline Word generator. The browser build **honestly disables** native OCR; it does not synthesize text or silently fall back to a paid API.
- Native build CI proves the Vision bridge compiles on both Intel and Apple Silicon. Real printed/screenshot OCR image accuracy is **not** claimed until independently verified on a real Mac. Empty recognition results are possible, not fake errors.

## Screen frame selection
- User button calls the WebView/browser `getDisplayMedia` picker and requests video only. The user chooses the shared display/window in the permission dialog. One frame is drawn to an in-memory canvas, a PNG is prepared for preview/export or subsequent OCR, and **all tracks stop immediately in `finally`**.
- This browser API's availability depends on the Mac WebView. If missing, the UI reports unsupported and suggests the macOS screenshot shortcut and importing a file.
- Chromium tests substitute only a consented `getDisplayMedia` source with known pixels, then decode the *actually downloaded PNG*. That tests the capture-to-PNG pipeline but **not native macOS screen picker permissions**.
- Reference for a future fully native version: Apple's ScreenCaptureKit and `SCContentSharingPicker`; don't claim native ScreenCaptureKit has been implemented in this change.

## Real one-click cross-tool kit
- One outline + notes → actual `project/brief.docx` (editable Word), `project/slides.pptx` (editable PowerPoint), `project/process.svg` (vector diagram), Markdown source, README and a JSON manifest in **one ZIP**.
- Uses the existing real exporters and conservatively bounds all inputs, slide counts and output size. Does not alter originals, upload data, or require accounts.
- Unit tests unzip the outer kit, unzip the embedded native Office files, and examine **real OOXML text and slide relationships**. Browser test exports a bundle and verifies those artifacts.

## Fix included
- The existing native Rust output allowlist previously omitted `.ts` and `.tsv` despite these types being allowed by the frontend. This PR aligns desktop writing permissions with the tested developer tools.

## Quality gates
- TypeScript + full Vitest suite; browser suite (old workflows + new project ZIP, image capture and OCR capability honesty); native Rust builds on both architectures; Sentinel regression.
- Real Mac OCR visual quality and screenshot permission dialogs, Tauri screenshot-support matrix, and target Word/PowerPoint layout fidelity still need device-specific acceptance testing.

All new actions are locally executed and user-initiated. No forced subscriptions, uploads, external fonts or bundled proprietary model files.
