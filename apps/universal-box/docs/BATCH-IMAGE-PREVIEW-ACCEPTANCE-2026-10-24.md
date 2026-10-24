# Batch images · preview before saving (2026-10-24)

Governing plan: [office-first reset](./OFFICE-FIRST-RESET-2026-10-23.md), [priority audit](./OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md), and [daily tools execution plan](./EXECUTION-PLAN-DAILY-TOOLS-054.md).

## Recurring office job

Resize/consolidate user-selected JPG/PNG/WebP photos for email, forms, reports, and presentations without sending them to a website. Users need to **see how files look and measure size/dimensions before saving**, especially when a format change loses transparency.

## Actual implementation

- Extend the **existing** Batch Image Conversion → ZIP catalog route and `BatchImageDesk`; no extra tool entry.
- Choose images (up to 12) and set desired output format, width, quality, optional upscaling and sharpening.
- **Preview converted images**: check magic bytes; decode and encode actual images locally; show each converted image, source/output dimensions, source/output byte counts. Build and CRC-check an actual ZIP containing image bytes and JSON report **before** allowing save.
- **Save reviewed ZIP**: export cached verified archive; do **not** re-encode after preview, so saved bytes match images shown on screen.
- Any new file selection or settings change invalidates prepared archive, disables saving, and releases old browser object URLs. File/format/settings inputs are disabled during conversion to prevent state mismatches.
- Preserve source files, reject fake extensions, invalid/animated sources and memory-limit breaches. JPEG has an explicit white background for formerly transparent pixels; metadata/profiles and quality may change. No subscriptions, cloud calls or source overwrites.

## Verification required

- Chromium uses actual generated PNG bytes, checks real converted image dimensions, verifies preview image bytes match ZIP entry, re-opens ZIP with CRC32, checks report dimension/byte values and rejection of a spoofed JPEG.
- Change quality after preview, confirm the old ZIP becomes impossible to save until a fresh preview is generated.
- Run TypeScript build, Vitest, full office Chromium flows and Intel/Apple Silicon Mac CI. Successful CI alone does not establish native app installation, signed/notarized package, cross-app color/HEIC support or Finder acceptance.

Release gate remains **real-Mac installation and visual examination** in Finder and Preview, including large photos, transparent PNGs and Chinese filenames. Do not mark those as completed based on Chromium.
