# Sentinel Box v0.56 — iPhone HEIC and honest batch photo preview

**Execution contract:** `apps/universal-box/docs/EXECUTION-PLAN-DAILY-TOOLS-054.md`, phase v0.56. This work builds on **v0.55 PR #80** and therefore depends on v0.54 PR #79. No new duplicate image converter app was created: the existing **Target Size Photo Compression** tool was extended.

## Why this work exists

Ordinary macOS users frequently receive photos from iPhones as HEIC, and may need to send JPEG files that are smaller, compatible with other systems, and easy to preview **before** saving. Existing Sentinel Box supported PNG/JPEG/WebP but did not accept HEIC; it reported per-image output bytes only *after* a ZIP download, making it hard to see whether an image was larger or blurrier.

## Implemented steps

1. In the existing **Target Size Photo Compression** workspace, explicitly select 1–10 PNG/JPEG/WebP/HEIC/HEIF files, max **8 MB each / 25 MB total**. The existing target-KB algorithm and JPEG/WebP output options remain intact.
2. An HEIC file is passed to the new Tauri `decode_heic_to_png` command **only in the installed macOS app**. The input must have an HEIC-compatible ISO BMFF `ftyp` brand (not merely a renamed .heic extension).
3. The app starts **Apple's locally installed /usr/bin/sips** with explicit static parameters, **without a shell**. It stages only the selected image in a randomly named, owner-only (0700) temporary folder. Output is a 2048-pixel-bounded PNG, checked for PNG signature and 8-megapixel dimensions, then supplied to the pre-existing JPEG/WebP compressor. The temporary directory is deleted upon success or failure, with no upload or hidden background filesystem scan.
4. Other image types still pass straight through the existing browser-side compression code; in browsers without Tauri, HEIC conversion **fails clearly** rather than pretending to decode an unsupported format.
5. **Preview before save:** the actual compressed ZIP is generated in memory; the first converted image is read from that ZIP and previewed. Report per-file **input/output byte counts, target met, dimensions, compression percentage, and whether output became *larger***. Show batch original/output totals and count of truly smaller results.
6. Changing quality settings or input files invalidates previous preview and analysis. Saving after a preview exports **the exact previewed ZIP**, rather than silently re-encoding it. Originals are never modified or removed.

## Known limits

- Input HEIC decoding is **macOS-native only**; no browser HEIC codec is promised. `sips` output depends on the installed macOS version and its HEIC codec availability.
- HEIC photos above the **8 MB input limit** are refused; source images can be downscaled to 2048 pixels in the native conversion before using the existing 512/1024/2048 maximum output dimension.
- Some EXIF/HEIC metadata and original color profiles may not survive re-encoding. Users must verify orientation, color, small text, transparency (JPEG fills it white) and sharpness before sharing.
- Saving ZIP may be larger than the source total due to processing or ZIP overhead; **the app reports that honestly** and does not pretend an unmet KB target was achieved.
- The JPEG/WebP backend still uses the project's original canvas quality iteration. This version does not introduce arbitrary background photo monitoring, cloud conversion, Windows .exe conversion or image AI upscaling.

## Verification gates

- [x] Added HEIC native validation tests for HEIC brands, PNG signature and bounded decoded dimensions.
- [x] Added **macOS-only** Rust real `sips` roundtrip test: PNG fixture → encoded HEIC → decoded PNG; check dimensions.
- [x] Added Vitest HEIC filename/batch limit tests.
- [x] Added Chromium test for actual 2-image batch preview, per-file byte totals, ZIP CRC + image-readback, preset invalidation.
- [x] Added Chromium test verifying browser HEIC fails rather than inventing an image.
- [x] Wired regression suite into browser CI.
- [ ] Latest TypeScript / Vitest CI passes.
- [ ] macOS native Rust test and both Apple Silicon/Intel DMG jobs pass.
- [ ] Chromium interactive image/ZIP tests pass.
- [ ] Real iPhone HEIC/JPEG photos checked on a Mac with color/orientation/thumbnail quality comparison and Files/Finder compatibility.
- [ ] Signing, notarization, installer and release QA.

## Delivery and integration

1. Merge the fully verified **PR #79** into `main` only when its native QA and merge approval requirements are met.
2. Retarget/merge **PR #80** (scanned PDF compression) after #79.
3. Retarget/merge **v0.56** after #80, keeping shared image and catalogue edits reconciled.
4. **PR #78** word counter was branched from `main` separately; integrate independently and resolve any overlapping UI conflicts without losing it.

**Product rule:** Deepen essential daily tools and make file outcomes previewable. Do not add another novelty catalog icon to make the feature count look larger.
