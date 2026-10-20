# Universal Commons — a free, simple local-first collaboration layer

## User problem (research, October 2026)

Users repeatedly report that basic file handoff, family folders and small-group teamwork become fragmented across apps, signups, incompatible devices, expensive storage quotas and server administration. Overly broad suites can be frustrating when the real task is "send these documents and track what we agreed to do."

Examples:
- Reddit /r/selfhosted: a Nov 2025 family sharing request asked for just one accessible folder, no large application suite: https://www.reddit.com/r/selfhosted/comments/1p82oys/
- Reddit /r/selfhosted: Sep 2026 discussion on a simple alternative to Drive + Docs + Sheets: https://www.reddit.com/r/selfhosted/comments/1wgk02e/
- Reddit /r/selfhosted: discussions of accidental sync deletion and potential data loss: https://www.reddit.com/r/selfhosted/comments/1r4vgve/

## Product principles

1. One **Share & Team** workspace entry. Files, messages, tasks and team members appear together.
2. No subscription, advertisements or forced registration.
3. The shared files belong to the user, not the platform. Export to open formats; never silently delete originals.
4. Default to local data, explicit consent, integrity checks and understandable warnings.
5. Avoid inventing a new transport protocol when proven, audited options exist.

## Stage 1 — Implemented: Commons offline team packet

- Select named files, add message handoff and task status, keep a member label list.
- Export portable `.zip` containing `commons.json` and hashed binary attachments.
- Import and merge packets of the SAME room ID. Preserve messages and files; reject conflicting IDs rather than silently overwriting.
- SHA-256 file checks before export and import; upper bounds on attached bytes/counts and allowed paths.
- Room data and attachments are currently in memory; **export before closing**.
- **Not** online sharing, actual access control, realtime chat, notifications or collaborative editing.

## Stage 2 — Secure local-network sending (future; not yet built)

- Device discovery on the same local network; "Send", "Receive", "Accept" buttons.
- Prefer compatibility with **LocalSend's documented protocol** instead of inventing a new unauthenticated file server: https://github.com/localsend/localsend
- Mutual confirmation, per-session keys, explicit receiver approval, TLS, safe destination selection, checksum verification, resume for large files.
- No automatic background broadcasts of sensitive filenames. Bind to least privilege and fail closed on public/hotel Wi-Fi.

## Stage 3 — Small group collaboration (future; not yet built)

- An optional self-hosted host/relay for team documents and messages; asynchronous access requires someone to be online and storing data.
- Group invitations with revocable membership and expiry, real cryptographic identities rather than nicknames.
- Room activity and file revisions; no automatic deletion propagation without version restore and user confirmation.
- Document collaboration could use a vetted CRDT library such as **Yjs** with a transport appropriate to the room size: https://docs.yjs.dev/
- WebRTC may need signaling and TURN relays across NAT/firewalls, which create operating costs; do not claim "globally always-on" is zero-cost.

## What to avoid

- A marketing label that claims end-to-end encryption before transport and key verification are actually implemented.
- Uploading sensitive files to a public signaling or file server without informed consent.
- Silent merges, hidden account creation, automatic surveillance/virus verdicts, insecure arbitrary file execution.
- Rewriting the original Sentinel Go engine. Sentinel may supply optional local file diagnostics, but never changes shared files without user permission.

## Release verification

Stage 1: TypeScript, Vitest roundtrip and tamper tests, Tauri packaging.
Stage 2: macOS/Windows/Linux + Android/iOS real-device LAN transfer and firewall testing.
Stage 3: multi-user concurrency, invitation replay, key revocation, offline reconciliation, threat modeling and backup/restore.
