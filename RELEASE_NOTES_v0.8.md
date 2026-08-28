# Sentinel macOS v0.8 — Integrity & Guidance

v0.8 deepens Sentinel's read-only evidence model and adds user-facing explanations.

## Added
- Integrity Lab for one-path deep inspection.
- Sentinel self-integrity inspection.
- Bounded SHA-256 file fingerprinting (256 MiB per manual inspection).
- Mach-O architecture inspection when `lipo` is available.
- quarantine and recorded-origin metadata inspection when macOS exposes it.
- richer Gatekeeper source/origin context.
- selected LaunchAgent/LaunchDaemon manifest explanation.
- session-only Persistence Configuration Integrity with plist SHA-256 baselines.
- built-in Guide & Permissions page.
- `GUIDE.md` and `AUTHORITATIVE_ROADMAP.md`.
- new evidence-source capability cards for `xattr`, `mdls`, `lipo`, and `file`.
- persistence and self-integrity data in the full local report.

## Safety / privacy
- Still read-only.
- No delete, kill-process, disable-startup, quarantine, packet capture, key logging, or cloud upload endpoint.
- Persistence Integrity hashes visible startup plist configuration only.
- Full Disk Access remains user-controlled by macOS.
- Endpoint Security is documented as a future entitlement-gated layer, not an existing feature.
