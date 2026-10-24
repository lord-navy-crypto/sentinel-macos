# Word/PPT office draft import and editable source handoff

Date: 2026-10-24. Governed by [Office-first product reset](./OFFICE-FIRST-RESET-2026-10-23.md) and [Office-first priority audit](./OFFICE-FIRST-PRIORITY-AUDIT-2026-10-24.md). This improves the **existing** Creative Studio Word DOCX Templates and PowerPoint PPTX Creator, with **no duplicate catalog entry**.

## Office user task
1. Download or maintain a local Markdown/TXT draft (meeting report, invitation, short presentation outline).
2. Choose the file in the existing Word or PowerPoint editor. Review the imported heading and text; optionally adjust recipient, date, subtitle or theme.
3. Save an actual editable DOCX/PPTX. Save an editable Markdown source copy as needed for future edits.

## Implemented code
- Only explicitly selected `.md` / `.txt` local files, 1 byte–48 KB, are imported; strict UTF-8 decoder rejects invalid encodings and embedded binary/control characters. CRLF is normalized, UTF-8 BOM accepted, and editing length is limited to 12,000 characters.
- A top-level `# Title` sets document / presentation title; body becomes Word template Markdown or PPT slides starting at `## Slide heading`. No automatic uploading, remote templating or network requests.
- **Validate before replacing current editor**: Word token substitution checks unknown `{{placeholder}}` markers; PowerPoint outline checks slide/bullet limits. On any failure the previous editable content remains intact.
- Word and PowerPoint each gain a local `Save Markdown draft` action alongside existing native DOCX/PPTX export; exported outline text is editable and can be re-imported.
- Import and save lock changes while processing; original files are never overwritten.
- Scope clarification: Word `recipient`, `event`, `date` values and PowerPoint theme/subtitle remain separate UI fields; the raw Markdown draft saves **document title and body/outline**, not a full layout preset or complete Office fidelity. Generated DOCX/PPTX remain the actual deliverables.

## Acceptance
- Vitest: Chinese text, UTF-8 BOM/CRLF, Markdown roundtrip, invalid/binary/oversize content, invalid template field and slide limits.
- Chromium: select real Markdown files in existing Word and PPT editor, verify visible text, export real DOCX/PPTX, open ZIP/XML and confirm editable content; export and read back the Markdown source; invalid files preserve previous editor content.
- Full TypeScript checks, Vitest, Chromium all-tool suite, Apple Silicon/Intel macOS CI must pass at **exact PR head** before merge.
- Real Mac Pages/Word/PowerPoint installation and visual fidelity, signing and notarization are separate release gates and not claimed.

This is an ordinary office writing workflow, not a separate full Word/PowerPoint editor.
