# Sentinel Box v0.57 · Business Essentials / 商务文件自动化计划书

Date: 2026-10-21. **Implementation is a stacked PR based on v0.56 PR #81**, with upstream v0.55/#80 and v0.54/#79. The feature is not considered installed or released until these branches are integrated and native QA passes.

## Why this solves a real, frequent business task

Freelancers, clubs, independent contractors and very small offices often have repeated client charges or quotations in Excel/CSV and need to hand over a readable, numbered document plus a summary for their own bookkeeping. The existing Sentinel Box features already include strict CSV import, bulk Word mail merge, PDF writing, and ZIP exports, **but no complete itemised CSV → quotation/invoice → editable Word + PDF → summary handoff**.

Reference products researched:
- [Invoiso](https://github.com/Anooppandikashala/invoiso): offline invoice/quotation and client workflows.
- [SpendStat bulk invoicing](https://spendstat.com/tools/invoice-generator.html): grouping spreadsheet items by invoice number and reviewing the batch.
- [MyFreeInvoiceTool](https://myfreeinvoicetool.com/bulk-invoices/): user need for a ZIP of actual invoice PDFs and a preview rather than another subscription.
- [Irish Revenue: required VAT invoice information](https://www.revenue.ie/en/vat/vat-records-invoices-credit-notes/invoices/information-required-vat-invoice.aspx): invoice fields and tax rules vary by jurisdiction. This project's general invoice generator is **not a VAT compliance product**.

## Scope · v0.57 P0 Business Billing (this PR)

1. Reuse **Workflow Studio** and existing CSV/Word/PDF/ZIP modules; add a single discoverable **Business Invoices & Quotes** operation, not dozens of filler entries.
2. User enters seller name/address, optional registration/tax ID and payment instructions; imports/edit one UTF-8 CSV. Required headers: `document_id,kind,client,client_address,issue_date,due_date,currency,po,description,quantity,unit_price,tax_rate`.
3. Rows sharing a document ID become individual invoice line items; repeated document-level fields **must agree**, or the entire operation refuses to export. 1–100 rows, <=25 documents, <=350KB CSV.
4. Explicit ISO issue/due dates, supported currency `USD/EUR/GBP/CNY`, 1–1000 whole-number quantities, amount to **2 decimal places**, percent tax to 2 decimal places; round **per line** using integer cents & basis points; no floating-point sum drift.
5. Preview every customer, each line and exact subtotal/tax/total before save. A ZIP includes **genuine editable DOCX**, and **vector PDF for Latin ASCII-only documents**, plus `reports/billing-summary.csv` with formula-safe quoting and `reports/manifest.json`. Unicode/CJK input is retained in DOCX; an unreadable PDF with missing glyphs is never produced.
6. All file handling is **local and opt-in**. No login, uploading, payment gateway, bank scraping, email sending, automated tax filing, artificial receipt claims, hidden clipboard reading or source-file overwrite.
7. Show upfront: these are **document drafts** for manual human review, not certified electronic invoices, statutory numbering, VAT calculations, e-invoicing, or tax advice. Tax percentages are taken from user input, **not calculated from a region**.

### Validation / QA gates

- [x] Pure financial data planner and boundary checks written.
- [x] DOCX+Latin PDF export code plus CSV/JSON audit manifest written.
- [x] Single Workflow Studio UI, real local CSV template import and actual ZIP export written.
- [x] Pure unit tests: 325.50 & 240.00 examples, fractional tax round, duplicate ID mismatch, dates, invalid quantities, unsupported rates, spreadsheet formula injection and CJK-safe DOCX.
- [x] Artifact readback tests: parse generated Word XML, open generated PDF with pdf-lib, verify ZIP CRC and CSV totals.
- [x] Chromium user flow added: navigate, preview, ZIP download, PDF/DOCX readback, CJK-only DOCX and reject malformed CSV.
- [ ] TypeScript, Vitest and full Chromium regression CI pass at latest head.
- [ ] Intel and Apple Silicon macOS DMG build passes at latest head.
- [ ] Native macOS visual verification, printer layout and large customer samples reviewed.
- [ ] Legal review of any region-specific tax invoices. Until then **not for guaranteed statutory compliance**.

## Subsequent business priorities, based on actual unmet daily flows

- **v0.58** (P0): Accessible global launcher / recent-used tools and keyboard shortcuts for existing OCR, Word/PDF, image compression and clipboard functions; no background interception.
- **v0.59** (P1): Local meeting minutes → editable Word + CSV action list with explicit owner, deadline and follow-up; reuse existing note and Word workflows. No invented transcript or simulated meeting attendance.
- **v0.60** (P1): Client delivery pack: user-picked files → safe names, SHA-256 manifest, optional handover cover note, real ZIP readback; reuse existing ZIP/checksum modules.
- **v0.61** (P1): Invoice UI improvements: user-selectable logos, multi-currency display formats, full Unicode vector PDF fonts only after appropriate font licenses and embedded-font rendering are verified; no guarantee of compliance.
- **Release track**: resolve stacked PR dependencies and merge conflicts; test real Apple Silicon and Intel macOS, signing, permissions and updates. Ship only from validated main.

**Anti-feature-inflation rule:** Do not create another mode to duplicate a ZIP tool, mail merge or PDF editor; compose current components around a useful end-to-end workflow. If validation fails, repair it before calling the feature complete.
