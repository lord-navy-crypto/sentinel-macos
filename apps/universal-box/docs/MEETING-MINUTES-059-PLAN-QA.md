# Sentinel Box v0.59 — Meeting Minutes & Action Tracker

**Source implementation plan:** v0.57 business essentials and v0.58 command-discovery roadmap. **This is a stacked Draft feature PR based on v0.58 PR #83**, which depends on #82/#81/#80/#79. The code in a PR is not a released macOS build.

## User problem and acceptance

After a real work meeting, someone needs an editable set of minutes and an auditable list of assigned actions. Sentinel Box already had Notes, text and Word export, mail merge and CSV tooling, but no complete **minutes + owners + due dates + delivery ZIP** flow.

**Do not hallucinate meetings:** A user types the actual meeting title/date, attendee list, agenda, discussion and decisions, and directly enters/imports a task CSV. Never infer attendees, decisions, deadlines, promises, status, approval or transcript. No background microphone recording or meeting access.

### v0.59 implementation

- Reuse existing Workflow Studio as a **single meeting-minutes tool** rather than duplicate Notes, CSV or Word editors.
- Capture user-entered title, date, location, facilitator, attendees (one per line), agenda, discussion, decisions and optional next-meeting date, including Chinese and other Unicode.
- Import/edit the precise action CSV with seven columns: id, task, owner, due_date, priority, status, notes.
- Validate nonempty task and owner, real ISO due date, safe unique IDs, bounded lengths, at most **80 actions**, 50 attendees, 60 agenda/decision lines; priority high/normal/low and status todo/in_progress/done.
- Give a before-save per-action preview, status counts and attendee count.
- On explicit save: generate real editable **meeting/meeting-minutes.docx**, readable **meeting/meeting-minutes.txt**, UTF-8 BOM **actions/assigned-actions.csv** (spreadsheet-formula protected), and minimal **reports/manifest.json** in a new ZIP.
- No original files changed, no automatic transcription or AI-made facts, no email invitations, calendar reminders or cloud sync.

### Safety and privacy

- Store no actual meeting content in global history or pinned commands, only known tool IDs.
- Client-side transient state until explicit export; no networking from this feature, file-system directory scans or automatic team collaboration.
- Exported ZIP intentionally contains user-entered meeting data: users must review sensitive client/personnel information before distributing.
- The task CSV is an **offline snapshot**, not a synchronized task manager.

### Acceptance and CI

- [x] Strict validation planner implemented: duplicates, impossible dates, missing owners.
- [x] Editable DOCX, text and formula-safe task CSV generated into ZIP.
- [x] Preview UI and single entry integrated with Workflow Studio, catalog and Cmd-K alias.
- [x] Vitest validates details, multilingual text, IDs, dates, status and CSV injection.
- [x] Actual generated Word XML, action CSV and ZIP CRC readback assertions authored.
- [x] Chromium UI test navigates from catalog, exports and reads ZIP, checks Chinese, refuses missing owners; registered with browser CI.
- [ ] Latest TypeScript/Vitest/Chromium CI green.
- [ ] Latest Intel + Apple Silicon macOS DMG CI green.
- [ ] Real Word/Pages rendering and Excel/Numbers CSV import verified manually.
- [ ] Physical keyboard/VoiceOver QA.
- [ ] Stacked PR merge approvals, signing/notarization and tagged public release.

## Continuing milestones

**v0.60 · Client Delivery Pack:** Use existing safe ZIP packing and SHA-256 helpers; add client/project handoff note and exact selected deliverables, with ZIP/manifest readback. No cloud server.

**v0.61 · Release consolidation:** Review UI dependencies and conflicts across #78–#84; merge sequentially after review; verify native macOS installer, permissions, signing and notarization.

**v0.62 · Optional funding validation:** Public release notes and privacy promises, optional sponsorship only after maintainer configuration and suitable legal/account approval, no fake revenue claims, ads, data resale, or core offline-tool paywalls. Define a professional support/deployment offering only after actual tested delivery.

## Roadmap decision rule

Prioritize everyday completion flows (notes -> action list -> handoff -> next step) with genuine exported files and rigorous validation; avoid padding the catalog with duplicate or trivial tools. A Draft PR is not considered shipped.
