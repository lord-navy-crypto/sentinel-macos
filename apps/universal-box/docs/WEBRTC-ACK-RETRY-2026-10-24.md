# Commons Public WebRTC · application-level delivery receipts and safe retry

2026-10-24. Expands the **existing**, manually signaled, opt-in public WebRTC text experiment and preserves self-supplied TURN fallback.

## User experience
- Sending text writes to a ready WebRTC DataChannel only if the browser reports a bounded buffered queue (≤64 KiB). The local message appears as **Waiting for peer confirmation**.
- A peer accepting the encrypted frame responds with an application `ack` identifying the specific random message ID. Only then does the sender show **Peer application confirmed receipt**. This is not a read receipt, permanent delivery guarantee, proof of identity or guarantee that the peer stored the message.
- Users may click **Retry unconfirmed** while the same DataChannel remains open. Retried message IDs remain stable; the receiver caches up to 500 recent IDs, ACKs retransmissions and displays a message **only once** during that session.
- If disconnected before ACK, messages remain marked unconfirmed until the user explicitly closes/restarts the session. Closing the session clears its RAM history and dedupe state as before; no persistent queue, background upload, accounts or sync.
- Packet protocol is bounded JSON with typed `message` and `ack` frames. Max 1,000 Unicode characters/4 KB text, 6 KB encoded frames; only safe text is rendered. A malicious or unresponsive peer can withhold ACKs; transport DTLS does not verify a human identity.

## Implementation and tests
- `commonsDirectMessages.ts` validates typed message and ACK frames, IDs, text, maximum frame size and DataChannel backpressure. Pure bounded duplicate-history helper.
- The existing Commons Public UI now processes ACK, de-duplicates incoming messages, ACKs even a valid repeated message, and retries only not-yet-ACKed outgoing messages.
- Vitest: CJK roundtrip, malformed/oversized/hostile messages, buffered queue bounds and repeated-ID dedupe.
- Chromium browser **end-to-end**: open two real instances of the Commons UI in distinct browser pages, generate complete Offer/Answer with external STUN **off** by default, negotiate a live DataChannel, exchange Unicode texts in both directions and verify sender-side peer-app ACKs.
- Existing network/TURN tests remain. Full latest-head core, all-browser and Intel/Apple Silicon Mac CI required before merge.

## Explicit limitations
Automated WebRTC interoperability between two pages on a single CI runner is not equivalent to two real Mac laptops on different public networks, TURN-relayed candidate success, signing, notarization, or secure identity-verified global group messaging. The user must still deliberately exchange SDP over a separate trusted channel; default public STUN remains off.
