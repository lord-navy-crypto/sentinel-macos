# Office PDF page workflow · verifiable reorder and split (2026-10-24)

Authority: [OFFICE-FIRST-RESET](./OFFICE-FIRST-RESET-2026-10-23.md), [OFFICE-FIRST-PRIORITY-AUDIT](./OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md). This work improves the *existing* PDF Preview & Tools workspace; it does **not** create another PDF route.

## Everyday office use

Someone prepares a contract, application or expense report and needs to reorder or omit pages, or split a PDF into per-page copies. Before saving, they should know precisely which original pages become which output pages, and should not save a corrupt ZIP.

## Actual deliverables

- Reorder preflight directly in the PDF FileDesk: `output page ← original page`, number of pages omitted from output, first 30 mappings for long documents. The full expression, up to 300 pages, is applied even when the display is abbreviated.
- Duplicate, out-of-bounds, empty or malformed page order **disables export** with visible error; no changes to source file. Input selection and tabs are locked during PDF processing to prevent the file/rules changing while saving.
- PDF order export creates a new document using `pdf-lib`, independently reopens its exact output bytes, checks output page count, media boxes, crop boxes and rotation against each selected original page. These checks protect page geometry but are **not** a visual fidelity guarantee.
- Split-to-ZIP reads back the complete generated archive with CRC32 and every selected PDF as an actual one-page document; its dimensions must match the corresponding source page. No image-only fake PDFs.
- Honest limitations: copying pages may drop interactive form data, digital signatures and PDF/A compliance; the original PDF is never overwritten.
- No accounts, subscriptions, networking, automatic local file scanning or new tool catalog entries.

## Proof required

- Vitest covers page mapping, omission, duplicate/out-of-range rejection, saved PDF readback including page dimensions, rotation and crop box, and preservation of the source.
- Chromium selects actual PDF documents with distinct page widths, checks the displayed page map, rejection before save, reads back the downloaded reordered PDF in the requested sequence, and verifies individual one-page PDFs inside a real CRC-checked ZIP.
- Full TypeScript and Vitest, office Chromium workflow suite and Intel/Apple Silicon desktop builds must pass on the **latest PR head**. Real Mac PDF display (Preview/Acrobat), signed/notarized distribution and input permission QA remain separate gates.

Only merge after verifying latest-head workflows. Green CI is not a claim of public native release.
