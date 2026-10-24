# Commons · ephemeral encrypted LAN group chat (v0.1)

Date: 2026-10-24. Based on the approved sequence: polish Commons UI, strengthen local networking, then make an independent public-connectivity decision. This extends the **existing** Commons communication workspace; it is not another top-level app or a disguised cloud messenger.

## Real user journey

1. Open **Universal Commons → LAN → 实时群聊** in the native Mac desktop app.
2. Enter a display nickname and room name, then click **Create LAN group**. A host opens an ephemeral TCP listener on a local interface. The private `uboxchat://local-ip:port/secret` invitation is masked by default; copy it out-of-band to trusted participants. The localhost invitation is used internally by the host.
3. A second/third Mac on the same accessible LAN opens the same page, enters a nickname, pastes the complete invitation and selects **Join**. This authenticates the shared room *capability*, **not** the participant's civil identity.
4. Members type ordinary short text messages and receive updates every 2.5 seconds while the LAN panel is visible. The host stores a bounded history; all members see a consistent server-defined sequence. Participants shown are recently active nickname labels, not identity-verified accounts or durable membership.
5. **End group** (on the host) closes the listener and invalidates the room. **Leave** (on another Mac) stops polling. Closing the host desktop app stops its listener. The room expires after one hour even when the screen is open.

## Technical implementation

- Native Rust server + Tauri commands (`commons_chat_host`, `commons_chat_exchange`, `commons_chat_stop`) over TCP with the same installed crypto library as file sharing: XChaCha20-Poly1305, 32-byte randomly generated **shared invitation key**, random per-packet 24-byte nonce.
- Every request/response is authenticated and encrypted with a framing marker, nonce, length and bounded ciphertext. Public IPv4/IPv6 and DNS destinations are forbidden; listener rejects public clients. No public port-forwarding, cloud, STUN, signaling or relay is activated by chat.
- Max 12 recently active nickname labels, max 12 parallel socket handlers, 1-hour room expiry, 4-second per-request network timeout, 1,000 text characters / 4 KB per message, last 200 messages in memory, 12 records returned per polling request, bounded 64 KiB frames. Unique message IDs prevent accidental duplicate appends from a resent encrypted request (within the bounded replay cache).
- No filesystem history, cross-device catch-up after host closes, images, attachments, push notifications, moderation, authentication accounts or guaranteed continuous presence. A hostile invite holder can impersonate a nickname and observe the room; the **host has access to plaintext**. Do **not** describe this initial group architecture as identity-verified end-to-end encryption among all participants.
- The prior offline Commons ZIP **Messages · 留言** still serves asynchronous file-based transfer: it is separate from online LAN group chat.

## Automated evidence and limitations

- Rust real TCP loopback test: three independently named clients send/read messages, receive a consistent ordering and bounded online nicknames; replaying a message ID doesn't append twice. Input and public-destination rejection tests cover resource and network boundaries.
- Vitest checks UI-local invite parsing, public-address rejection and monotonic deduplicated message merge.
- Chromium checks correct group UI, separately rendered offline rooms vs internet diagnostics, safe native-only enablement, bad public invite rejection and no browser TCP listener.
- Full latest-head core, Chromium and Intel/Apple Silicon CI required before mainline merge. **Two actual Macs on the same Wi-Fi/Ethernet, firewall on/off, permission prompts and App Signing/Notarization remain separate QA gates.**

## Public Internet group chat: technically possible, not yet shipped

Real cross-network communication is achievable by **replacing the transport layer**, not by changing a local invite to a public IP. The LAN parser intentionally rejects public addresses. Proposed progression:

1. Stable multi-peer LAN UX with real-device testing and explicit room identity verification (ideally per-device keys rather than one group bearer secret).
2. Develop explicit opt-in authenticated signaling to exchange offers, ICE candidates and fingerprints. Document IP disclosure before contacting an external STUN service. Signaling can use a self-hosted service or an out-of-band copy/paste protocol for an early low-frequency prototype.
3. Use a well-maintained WebRTC DataChannel (DTLS/SCTP/ICE), keep conversation content encrypted at the application layer where required, and require both parties to approve participation.
4. Attempt direct peer-to-peer first. When NAT/firewall prevents direct connectivity, TURN relay is the interoperable fallback; server bandwidth and availability incur real costs. Free software is compatible with **optional self-hosting**, but there is no guarantee of free globally available relaying.
5. Deliver explicit reconnection and error states, member kick/leave, room-key rotation, abuse prevention, message retention controls and privacy documentation before enabling a public beta.

Authoritative specifications: [RFC 8445 / ICE](https://www.rfc-editor.org/rfc/rfc8445), [RFC 8656 / TURN](https://www.rfc-editor.org/rfc/rfc8656), [RFC 8831 / WebRTC DataChannels](https://www.rfc-editor.org/rfc/rfc8831).

This document makes no claim of an operational internet chat service, public deployment, completed NAT traversal or signed native release.
