# Commons LAN Group: per-member sessions, explicit leave and nickname collision safety

2026-10-24. Based on merged LAN group chat (#162); part of LAN stabilization before expanding public group chat.

## Why

A shared `uboxchat://` invitation must be kept private, but the first LAN group prototype used a caller-supplied nickname on **every** encrypted poll and send. Any invite holder could type any nickname, and pressing Leave stopped client polling yet left the nickname visible until the 20-second presence timeout.

## Implemented in the same Commons group UI

- When clicking Create or Join, the host creates a short-lived **independent cryptographically random 256-bit member session** and sends its token back over the existing authenticated encrypted connection.
- Each follow-up poll and Send attaches that member token. The host validates nickname/token binding before mutating presence or publishing text. Duplicate active nicknames are rejected, so accidental name collisions cannot silently impersonate another current session.
- **Explicit Leave** sends an authenticated leave request and immediately removes that nickname from host presence; if temporarily disconnected, the client still leaves locally and the host expires the stale member after 20 seconds.
- Rejoining after an expired/closed session issues a **new token**; replay of an old token cannot send or poll. Stale sessions expire automatically; room maximum 12 active member sessions and message limits remain.
- The host ends the entire one-hour ephemeral room with the existing End Group action. Retains 200-line RAM-only history, XChaCha20-Poly1305 TCP frames, 12 concurrent handlers, and local-only IP checks.

### Accurate security boundary

**The room invitation remains a bearer capability.** A participant who learns the invitation can deliberately join with a different nickname; it does not prove a person's identity. Host still sees plaintext; session tokens limit accidental name spoofing within the room, not host trust, endpoint fingerprint verification or full member-authenticated group E2EE. Do not advertise this as verified-identity secure messenger, or reuse the LAN invite for public IPs.

## Tests

- Rust real TCP loopback with three users: independently Join, obtain different host-issued credentials, encrypted Send and Poll, reject wrong token for another active nickname, reject duplicate nickname, dedupe retry message ID, Leave immediately removes presence, old token fails and nickname can safely Rejoin with new token.
- Unit tests for member expiry, rejoin and revoked-token rejection; bounded history and count, Unicode multiline text.
- Existing Chromium group-workspace and offline/public tab regression and TypeScript checks.
- The latest PR head must pass core tests, full browser and both macOS architectures before merging. **Real two-Mac Wi-Fi/ethernet, firewall, signed installed Mac, app permissions and public network connectivity are not proven by GitHub Actions.**

## Follow-ups

Host-approved member list or per-device verified keys, personal invite revocation, host kick, room-level key rotation, connection retry/backoff and transcript export with explicit user approval. Internet transport stays a separate opt-in WebRTC/DataChannel branch with explicit STUN metadata disclosure and optional TURN; it must not inherit local-only assumptions.
