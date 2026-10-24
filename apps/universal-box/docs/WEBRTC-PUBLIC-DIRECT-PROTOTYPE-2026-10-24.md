# Commons public networking: first real direct WebRTC text channel (experimental)

Date: 2026-10-24. Follows merged LAN group chat PR #162 and the UI → LAN → public sequence. This enhances the existing Commons **Public** tab; no separate messenger account, new catalog tool or subscription.

## What is implemented

Two participants may deliberately exchange complete Offer/Answer JSON using an existing trusted communication channel. The offer initiator creates an `RTCDataChannel` *before* generating the offer, gathers ICE candidates, copies the complete Offer to the second person, the second person pastes it and returns a complete Answer, and the offer initiator applies the Answer. The two machines may establish a true direct DTLS/SCTP/WebRTC text DataChannel when their NAT and firewall policies permit.

- Explicit checkbox opts into Google public STUN (`stun:stun.l.google.com:19302`). With checkbox off, local host ICE candidates still enable controlled same-host/LAN testing but generally cannot discover public paths. Merely opening Commons does **not** contact a public STUN server.
- The signaling channel is **manual copy/paste**: there is no default signaling server, user account, persistent identifier, relay or automatic public listener. SDP can reveal network-address metadata to recipients. Anyone tampering with out-of-band signaling might impersonate a peer. Both users should verify fingerprints and identities using a **separately trusted** channel.
- WebRTC DataChannel encrypts messages in transit using DTLS. This is 1:1 short-message communication, not a complete identity-verified multi-member group, and not automatic synchronization with Commons offline ZIP or LAN group history.
- ICE can fail. **No TURN relay is bundled**, so a public direct connection is not guaranteed on symmetric NAT, CGNAT, restrictive networks or enterprise firewalls. Honest user-visible error states report failure rather than fake success.
- Close clears the peer connection, manually negotiated descriptions and volatile chat log. No message storage, attachments, browser notifications, paid account or covert screen/file access.

## Acceptance

- TypeScript/Vitest: bounded manual SDP syntax with required WebRTC data-channel fingerprint, invalid offer/answer and normal Unicode text.
- Chromium: navigate original Commons Public tab, verify no STUN opt-in at rest, invalid SDP fails clearly, and browser does not silently create a connection.
- Local browser peer test: instantiate two WebRTC peers without STUN and exchange an encrypted DataChannel message over a live ICE connection on the GitHub browser runner, where possible.
- Latest-head core, full Chromium suite and Intel/Apple Silicon macOS CI required before merge. Real cross-internet two-machine tests, macOS WKWebView implementation compatibility, NAT/firewall matrices, relay availability and Apple signing/notarization remain **separate unverified QA gates**.

## Next engineering increment: reliable global/public group chat

Public WebRTC data channels plus authenticated offer/answer signaling, direct-first ICE, optional user-provided TURN, per-device identity keys and an explicit room membership protocol. For group chat, a room host can relay messages over separate peer channels in a hub model, but the host then sees messages; alternatively use a reviewed MLS-style group messaging protocol for full member E2EE. Make privacy/cost and exact transport choice visible; never reuse local-only `uboxchat://` or `uboxlan://` invitations as public URLs.

Grounding: [IETF ICE RFC 8445](https://www.rfc-editor.org/rfc/rfc8445), [TURN RFC 8656](https://www.rfc-editor.org/rfc/rfc8656), [WebRTC DataChannel RFC 8831](https://www.rfc-editor.org/rfc/rfc8831), [MDN createOffer](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer).
