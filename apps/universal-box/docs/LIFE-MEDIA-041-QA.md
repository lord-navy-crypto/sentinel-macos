# Universal Box · Life & Media Tool Expansion (v0.41 candidate)

Three independently useful areas, built on existing libraries without duplicating their earlier capabilities.

## Subtitle drift correction
Existing SRT/VTT converter only shifts all captions by a constant. New two-anchor synchronization rescales + shifts every timestamp to address gradual drift; accepts original/corrected pairs at least one second apart, limits the scale to 0.8–1.2, and checks for invalid duration, underflow, overflow and adjacent cue overlaps. Preserves Unicode and cue text. SRT and plain VTT cues supported. The existing parser explicitly rejects advanced VTT STYLE/REGION and per-cue settings; we do **not** claim lossless handling of those files.

## Smart grouping of explicitly selected files
A read-only plan groups up to 50 selected files (16 MB combined) by extension into Documents/Pictures/Audio/Videos/Archives/Code/Other. Generates a new ZIP with numeric collision-resistant names and a JSON manifest; verifies by re-reading each member in the browser CI. Does not move, delete, rename, scan folders, index disks, or start any background service.

## Multi-event calendar export
Turns up to 40 user-written rows into an ordinary VCALENDAR containing distinct VEVENT blocks with UTC timestamps, escaped text, unique per-export UIDs, and local overlapping-event detection. `YYYY-MM-DDTHH:mm` is explicitly interpreted as UTC and should be converted by the target calendar application to local time. No calendar invitations are sent; conflict detection is advisory, not a busy/free lookup of other accounts.

## Verification
- Vitest: resynchronization, second-by-second drift, overlap checks, invalid times, ZIP path sanitization and categorization, bounded capacity, multiple VEVENTs, escaped event fields and conflict detection.
- Chromium: actual SRT→WebVTT file export, source files → categorized ZIP with byte-for-byte member checks, event rows → actual .ics download with distinct UID checks.
- Preserve prior Word/PPTX, video frame, image pixel redaction, print template, and other browser tests; catalog routing covers 117 discovery entries.
- Intel/Apple Silicon DMG build, Sentinel core CI, and manual native app verification are separate layers.

All operations run locally, require explicit input/exports, preserve originals, and do not require login, paywalls, or cloud services. PR remains a candidate until full CI passes.
