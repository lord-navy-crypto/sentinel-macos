# Office PDF merge source order · preview, reorder, verify

Date: 2026-10-24. Based on [office-first reset](./OFFICE-FIRST-RESET-2026-10-23.md) and [priority audit](./OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md). Existing `PDF Preview & Tools → Merge` only; no duplicate catalog entry.

## Why

Users assembling applications, minutes, reports and contracts often choose multiple PDF attachments in the wrong order. Previously the tool displayed the selection order but offered no way to change it without reopening the file picker. A reliable everyday merge should let users reorder **before** producing an output.

## Implemented

- Choose 1–20 real, unencrypted PDFs within the existing per-file, total-byte and page limits; read each and show page counts and file sizes.
- In the **existing merge preflight** view, use one Up and Down button per file to reorder the selected documents. Each file's pages stay together; the preview and the underlying `File[]` are moved together. Edge controls are disabled.
- If a new PDF selection finishes after a newer one or after switching PDF mode, a revision guard refuses to restore outdated content. The import UI gives a truthful inspecting status rather than silently displaying an old plan.
- The actual merge is built from the current `File[]` order. Reopen exact generated PDF bytes, verify page count and each page's size, crop box and rotation against source files in that order. This is **not** a guarantee of advanced PDF fidelity or arbitrary full-page text equality.
- Save a new `merged.pdf` copy; never overwrite source files. Input order cannot change during active processing. Merged PDFs may be larger and page-copying can affect signatures, forms and PDF/A.

## Real tests required

- Vitest verifies pure list moves (including edge cases/invalid indexes), original selection immutability, inspected file order, and actual merged PDF pages from three files with distinct dimensions.
- Chromium imports two generated PDFs, checks row order, moves down/up/down, saves and re-opens the downloaded PDF to check actual page widths match the displayed new order. Existing split, reorder and invalid-PDF tests remain.
- Latest-head core/TypeScript, full Chromium suite and Apple Silicon/Intel desktop builds must all succeed before mainline merge.
- Mac Finder and Preview display, actual installed native package, signing/notarization remain **separate unverified release gates**.
