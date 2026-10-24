# Public room member application receipts and bounded retries — 2026-10-24

Built on merged #168 in the existing Commons > Public > temporary group room screen.

## What this actually guarantees

- Each member receives a room-scoped `chat` with a stable UUID. A recipient returns an `ack` to the host only after the application accepts the frame. This is **not a read receipt, durable delivery, human identity confirmation, or cryptographic proof of the individual behind the nickname**.
- The host freezes a snapshot of intended recipients when the original message is accepted; ACKs must arrive from these same active, per-member DataChannel slots. The host reports `acked / total` to the author using a room-scoped, typed `receipt`.
- Authors see distinct stages: not yet acknowledged by host; accepted by host, no other members; 0/N ... N/N per-recipient application ACKs. Non-recipients and duplicate ACKs do not increment the count.
- An explicit **Retry unconfirmed** action reuses the original UUID. The host resends only to the original recipients that have not ACKed. Receivers re-ACK duplicates without showing a duplicate chat line. New room members do not inherit a past message merely because another member retries it.
- Bounded volatile data: last 200 host delivery records, last 50 per-author status rows and outgoing guest frames, last 500 seen-message IDs. No server storage or offline queue; closing the room clears these, and old records can expire from memory.
- The host sees messages because this is host-forwarded, per-hop DTLS, not group E2EE. Both public STUN and optional user-owned TURN remain opt-in, and manual Offer/Answer negotiation remains required.

## Acceptance and risk boundaries

- Protocol unit tests: validate `ack` UUIDs, integer receipt bounds 0..3 and `acked<=total`, recipient snapshots, duplicate/non-member ACK rejection, remaining-target retry selection, and monotonic bounded status updates.
- Chromium integration: three actual browser pages (host, Alice, Bob), independent WebRTC DataChannels, guest-to-host-to-other-guest message and resulting `1/1` author receipt; host-to-two-members broadcast and resulting `2/2` receipt.
- Core JavaScript/Go checks, desktop TypeScript + Rust builds, Chromium workflow must pass at the exact final head before merge. These tests do not prove physical two-Mac WAN operation or TURN relay operation.
- Not implemented: automatic signaling, rejoin across network loss, retry timers, verified member identity, permanent offline message history, signed/notarized production package, four physically remote machines. Do not claim these capabilities.
