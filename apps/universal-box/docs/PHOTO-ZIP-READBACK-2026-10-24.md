# Photo target-size export · real ZIP readback verification

Date: 2026-10-24. Governed by [Office-first priority audit](./OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md) and [daily tools execution plan](./EXECUTION-PLAN-DAILY-TOOLS-054.md).

## Workflow

The **existing** Target Size Photo Compression tool lets users convert selected PNG/JPEG/WebP/HEIC photos into a local ZIP of JPEG/WebP files with a real size report. Keep its two alternatives: preview converted photos first and save the cached ZIP; or directly compress and save with one click. Both paths must now verify the **actual generated ZIP contents**, not merely trust the conversion's in-memory report.

## Actual implementation

- After preparation, load the exact generated ZIP with JSZip's CRC32 checks. Read its JSON manifest and confirm source filenames, source/output byte counts, output member paths, requested max dimension, image format and KB target match the in-memory settings/reports.
- Independently reopen each archived image; confirm actual bytes equal the per-image report, and magic signature agrees with the requested JPEG or WebP and extension. Reject unexpected extra images and bad/missing members. Stop on cancel signal before releasing export.
- The first converted image preview is created from the **same verified ZIP** as the saved archive. The no-preview direct Save ZIP path runs the same readback gate. The user's original photos are untouched; no remote upload or login.
- ZIP structural and signature verification cannot guarantee that every image is visually correct, has ideal colors, meets the requested KB target or remains free of metadata. Existing truthful per-file target/size warnings remain, as do HEIC desktop-only and transparency cautions.

## Proof

- Vitest creates actual archives and tests success, manifest drift, missing members, output-length mismatches, fake JPEG content, extra image entries, CRC corruption and cancellation.
- Chromium generates two genuine large PNGs, requests actual JPEG optimization, verifies first preview blob bytes **exactly equal** the exported ZIP member, checks archived per-file sizes, changes KB target to invalidate the preview, then directly saves again and reopens every verified JPEG.
- Require latest-head core/TypeScript/Vitest, complete Chromium and Intel/Apple Silicon desktop CI before merge. Native macOS HEIC decode, real image rendering in Finder/Preview, application signing and Apple notarization remain separate, unverified release steps.
