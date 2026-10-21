# Creative Studio — Universal Box cross-domain free tooling

This candidate adds **three actual creation workflows**, not merely extra catalog cards:

1. **Word Template Writer** — user-defined title, recipient, event, date and Markdown template with explicit `{{recipient}}`, `{{event}}`, `{{date}}` placeholders. Exports native editable DOCX using the project's existing `docx` package. Import/revise in Word or LibreOffice.
2. **PowerPoint Deck Maker** — one title slide plus up to 12 text slides, each with at most seven bullets. Parses `## Slide Title` sections, supports Ocean/Sunset/Forest color themes. Creates genuine OOXML `.pptx` ZIP with slide master, layout and editable native text shapes. Original slide/chart/media assets are not copied from third parties.
3. **Poster / Certificate / Social Cover** — original templates at 900×1200, 900×650 or 1200×675, theme/heading/subtitle/footer preview, escaped SVG export without external assets or scripts.

The user can reach **Creative Studio** directly from the sidebar and from the searchable catalog. No account, watermark, data upload or paid wrapper. Saves a new user-selected file via the existing export mechanism; original files are unchanged.

## Scope honesty

- Word generation supports basic Markdown paragraphs, headings, bullets and inline emphasis; **not** full page layout, revisions, complex tables, images or perfect DOCX fidelity.
- PowerPoint is an offline **generator**, not a general .pptx reader/editor. No existing-slide import, animations, notes, complex theme masters, chart editing or embedded media. 16:9 native slides. Text remains editable.
- The design output is valid vector SVG but is not an arbitrary drag-and-drop layered design editor.
- No OCR, video tooling, live collaboration, cloud conversion, or any macOS screen-capture permission is introduced.
- Fonts depend on the recipient's installed Office environment; validate any new deck in target PowerPoint/LibreOffice before important distribution.

## Verification

- Vitest: true exported DOCX/PPTX zip-member parsing, escaping, template token substitution, invalid input handling, 3 actual SVG sizes.
- Chromium: open each respective catalog entry, modify form values, download each real output, inspect native file content.
- Existing 96-tool routing smoke continues; routes alone remain insufficient for functionality claims.
- macOS ARM/Intel DMGs, Rust and Sentinel regression checks run via existing GitHub CI jobs.
- PR remains a **candidate** until all applicable checks pass; real macOS/Office viewer spot checks should be done separately.

Next across-domain increments: importing DOCX/PPTX for extraction, more visual templates, local OCR and media quick actions, with each operation tested end-to-end.
