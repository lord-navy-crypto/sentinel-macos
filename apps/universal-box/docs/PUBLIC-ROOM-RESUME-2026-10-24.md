# Public group WebRTC manual session recovery — 2026-10-24

Continues merged #168 (four-peer host-forwarded room) and merged #169 (per-recipient application ACKs).

## Implemented workflow

1. Each newly admitted guest receives a random **volatile resume capability** over the existing DTLS-encrypted DataChannel, never in the room invitation, SDP, visible UI, disk, or logs.
2. If a member disconnects or the host chooses to renegotiate, the host presses **重新协商此成员连接** in that member's original slot. The old `RTCPeerConnection` and channel are closed and a brand-new **unique Offer** is created, but the logical slot ID, previously admitted nickname, message records, and immutable recipient snapshots remain.
3. The same guest, without closing the temporary room page, pastes the fresh Offer and sends back a fresh Answer. Its private resume capability is automatically included inside the newly established encrypted DataChannel's `join` frame—not in the SDP or clipboard.
4. The host verifies both the previously admitted nickname and the capability against the original slot. On success it **rotates** the capability, acknowledges resumed membership and resends unconfirmed messages that originally targeted the same slot. Member-originated prior receipts are re-sent from host memory.
5. Duplicate deliveries receive a new app ACK but are not shown again in the timeline. Repeated or forged resume tokens fail and close the new channel. Normal membership removal invalidates that slot, so old tokens cannot assume the removed member identity.

## Invariants / privacy

- **Not** a verified real-world identity system: the capability proves continuity of an app session, not who is using that computer. Host can read all chat text, as in previous public room version.
- Normal initial joining without a resume capability remains compatible with the earlier wire format. A peer without a valid token cannot reclaim a reserved nickname over a replacement connection.
- The host keeps member slots in RAM while disconnected. Disconnected slots do not count as online recipients for new sends; queued prior messages remain tied to the original slot and only resume to the same authenticated recipient.
- A recovered transport does not require default public STUN, does not upload an invitation, does not introduce cloud signaling and does not persist credentials or messages. Each peer must explicitly exchange **new** Offer and Answer, and both must keep their app running.
- No guarantee across app exits, host restarts, wiped state, crashes, lost resume capability, altered TURN config, restrictive NAT, or two real remote Mac machines. No automatic reconnect, host migration, permanent history, offline queue, or signed Mac release is provided.

## Release gates

- Unit test rejects invalid/cross-room/mismatched member resume proofs, and validates receipt preservation/duplicate ACK semantics.
- Three real Chromium pages: Alice→host→Bob and host→all ACK; host regenerates Alice's Offer, Alice reuses her retained capability, same host slot receives her new Answer, history stays present and guest→Bob messages and recipient ACK still work.
- Require exact-final-HEAD complete browser test, Sentinel validation and both macOS architecture builds; separately verify real cross-WAN + actual TURN relay on physical Macs and app signing/notarization.
