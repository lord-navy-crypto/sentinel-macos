# Sentinel Box v0.62 — Offline Meeting Action Calendar Export

## Why this capability, not another tool catalogue entry

The existing v0.59 meeting workbench already creates editable DOCX, CSV, human-readable minutes and ZIPs, but recipients have to retype due dates into calendar applications. v0.62 adds **RFC 5545 iCalendar (.ics) files** to this exact workspace. A recipient can import the .ics file using their calendar application. This is a manual, one-time snapshot, NOT a calendar connection, automatic invitation, or ongoing reminder system.

Grounded reference:
- [IETF RFC 5545, iCalendar content-line format](https://datatracker.ietf.org/doc/rfc5545/) — CRLF line delimiters, UTF-8 line folding at 75 octets, escaped text and correct DATE semantics.
- [Microsoft Outlook import a calendar file](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web) — importing .ics is a snapshot, not automatic synchronization.

## Implemented behavior

1. The same existing meeting panel offers a direct **Save task dates as .ics** action and an explicit checkbox for including already completed tasks (off by default).
2. The existing ZIP includes a new file **actions/open-action-deadlines.ics** whenever there are any incomplete actions, and an updated manifest with the actual calendar event count and completed-task exclusions.
3. Every calendar entry uses the real, manually entered task, assignee, due date, priority, action ID and notes. No created facts, email addresses, times or invented completion states.
4. Use all-day **VEVENT** with local DATE DTSTART and exclusive next-day DTEND (not timezone-shifting midnight UTC events). **TRANSP:TRANSPARENT** means the date marker does not block the user's schedule. No VALARM, no ATTENDEE, no ORGANIZER, no METHOD:REQUEST, no network calls.
5. Stable UID: local SHA-256 of meeting title, meeting date and task ID; re-exporting the same meeting produces the same event identifiers. DTSTAMP describes export generation time.
6. RFC 5545 TEXT escaping, CRLF physical lines, and Unicode-aware <=75-octet folding (without splitting emoji or Chinese UTF-8 characters). Entirely local; no telemetry or cloud calendar access.
7. Calendar apps vary in whether a manually imported update replaces or duplicates an existing event. Importing multiple times must not be represented as a guaranteed in-place update.

## QA and delivery gates

- [x] Core calendar generation implemented using only existing TypeScript/WebCrypto and manually entered meeting tasks.
- [x] Integrated both a direct save action and meeting ZIP attachment; manifest reflects contents.
- [x] Real Vitest tests: RFC structure and exclusive DTEND, Chinese/emoji line folding, text escaping, stable UID, no alarms, manual inclusion of completed tasks, invalid times.
- [x] Meeting ZIP tests reread actual generated .ics and assert Unicode and active-task counts.
- [x] Chromium E2E extended to manually download .ics, check the file and ZIP, inspect Chinese data, exclude done tasks by default and opt in explicitly.
- [ ] Latest TypeScript/Vitest and complete Chromium suite green.
- [ ] Latest Intel and Apple Silicon macOS desktop builds green.
- [ ] Apple Calendar and Outlook manual import compatibility checked on actual installations.
- [ ] Stacked PRs reviewed and merged in order, native Mac UX and signed release verified.

## Limitations & development discipline

- A .ics file is a local export and requires a separate action by the user to import. The export itself neither schedules an event nor sends reminders.
- The file carries meeting subject and assigned owner names; users should review confidentiality before sharing.
- Core Sentinel Box utilities remain offline-first and free. Do not introduce account requirements, user tracking, fabricated adoption figures, covert sync or monetization gates here.
- Dependency stack: v0.62 sits on v0.61 PR #86, which sits on #85, #84, #83, #82, #81, #80 and #79. PR #78 is a separate main-based patch.

## Future priorities

**v0.63:** Stabilize and integrate the stacked PR chain; verify the actual installed macOS app, accessibility, import/export file behavior, permissions, signing/notarization and a genuine release download. No duplicate tool proliferation.

**v0.64:** Guided first-run workflows and accessibility/readability polish for Office, PDF, OCR and photo conversion. Any support or funding page must remain optional, transparent and separate from core offline functionality.

**Done means:** The exported file can be imported manually into a major calendar application with exactly the explicitly assigned deadlines; completed tasks are excluded by default and no unwanted alarms or invitations occur.
