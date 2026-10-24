# Manual WebRTC group room — experimental acceptance

Date: 2026-10-24. Target: Commons → 公网 → 临时多人房间. No new top-level app or automatic network service.

## Transport and user journey

A room host creates a random volatile room ID, then creates **one independent Offer per guest**. The guest pastes that invitation in its own app, generates one Answer and returns it through a separate trusted channel. The host applies that Answer to the **matching guest slot**. Each pair negotiates an actual `RTCPeerConnection` and reliable, ordered `RTCDataChannel`, using no ICE server by default. Public STUN and bring-your-own TURN are independently opt-in. IPs can be present in the SDP; share only with trusted peers.

The host may admit **up to three guests**, so a room consists of at most four participants. Each guest sends text to the host. The host validates sender session/nickname and relays text over each other guest's separate encrypted DataChannel. Host-originated text is sent to all currently joined guests. Each hop uses DTLS; **the host sees the messages** and this is **not end-to-end group encryption** or a group identity verification scheme. A random room identifier is not an access password; the host must check the guest by an independent trusted communication channel.

Nothing is published to a cloud account, stored as a durable history, registered as a public TCP listener, or sent to an automatic signaling server. Messages remain only in volatile UI memory and bounded duplicate-ID memory. Closing the room closes channels and erases the temporary history and TURN password. No persistent outbox or automatic reconnect exists yet.

## Safeguards and honest reporting

- Strict typed, versioned room Offer/Answer and application frames, validating SDP using the preexisting direct-connection validator and requiring the correct room ID.
- Nicknames limited to 24 Unicode codepoints / 72 UTF-8 bytes without control characters; a room must reject duplicate online nicknames. Guest messages must use the same name used at admission.
- Text restricted to the existing 1,000-codepoint / 4KB limit; each DataChannel is checked for an open state and a 64KiB bufferedAmount threshold before enqueue.
- Last 200 chat messages displayed in local RAM; last 500 seen sender/message IDs deduplicated. These are not message archives or guaranteed delivery receipts.
- Explicit per-slot removal and guest Leave; no automatic user discovery.
- Host forwarding is best-effort; successful `send()` enqueues bytes but does not guarantee every peer received them. The UI must never claim delivery or read confirmation.

## Release verification

1. Run `npm run typecheck` and `npm test` for `apps/universal-box`; run its full browser smoke, Sentinel validation and Intel/Apple Silicon desktop CI at the exact PR head.
2. In **real Chromium**, use a host page and **three** guest pages. Generate unique invitations and answers, then assert all four connect, message propagation guest→host→other guests and host→all guests, join collisions, member removal, and teardown without STUN.
3. Run two real Macs across independent public networks. Distinguish direct ICE success from TURN-relayed success using `getStats()`. Test invalid TURN credentials, restrictive NAT/CGNAT, a crashed host, reconnect, repeated joins and large chat bursts.
4. Verify macOS desktop firewall prompts and WebView support. Signed/notarized packages and private relay operations are separate release gates.

**Status:** Implemented on a feature branch; GitHub CI and real cross-network validation must be reported separately. This is deliberately not labeled production-ready public messaging.

## Follow-up

- Pairwise signed device identities or verified safety codes and host admission UI.
- Per-recipient ACK/delivery receipts, retransmission and bounded backfill; avoid equating host ACK with delivery to other members.
- Ephemeral, authenticated automatic signaling and optional TURN fallback if a future hosted service is introduced; never imply cost-free infinite relay bandwidth.
- Reconnect with fresh offer and channel while handling stale peers, nickname reclaim and identity re-verification.
