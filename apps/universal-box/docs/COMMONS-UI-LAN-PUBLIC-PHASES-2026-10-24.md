# Sentinel Box · reorganize UI → secure LAN → cautious Internet collaboration

Date: 2026-10-24. This work follows the office-first product reset and keeps one **Share & Team / Universal Commons** workspace. No duplicate messaging app, paid subscription, cloud upload or hidden activity monitoring.

## Product architecture and scope
| Phase | User job | Present implementation and gate |
|---|---|---|
| 1 — clear UI | Find the right path without reading an overloaded form | Existing Commons screen now has **LAN** and **Public research** modes. LAN has distinct **Send** and **Receive** steps. Local files/messages/tasks remain in the same offline room; export ZIP before leaving |
| 2 — same LAN | Send an explicitly selected Commons Team ZIP to a nearby computer | Existing native XChaCha20-Poly1305 one-use invite remains, valid ≤5 min. The UI masks invite secrets by default and performs only **on-demand Bonjour discovery**. Full invitation pasted alongside a discovered nearby endpoint must match both IP and port. Native sender refuses incoming TCP clients from public IPs before the secret-key handshake |
| 3 — other networks | Opt-in peer-to-peer remote communication | **Not implemented.** Existing STUN is a user-click-only, public-IP-revealing diagnostic and does not make a remote connection, offer accounts, sync or relay. Do not expose LAN-only listener as a public endpoint |

## Screens and UI state

1. **Offline team**: create/import or review a local ZIP with hashed attachments and task/message records. Message records are **offline notes**, not live chat.
2. **LAN → Send**: create/import room → exportable packet → click Start encrypted share → securely copy invite → share out of band. Mask the capability URL by default and offer deliberate reveal. One receiver / five minutes.
3. **LAN → Receive**: click optional Refresh Nearby (short mDNS scan, *not continuous*) and choose sender OR paste a full private invite → validate local endpoint → request → receive AES? **No**: XChaCha20-Poly1305 ciphertext → verify ZIP SHA-256 attachments → show contents → explicitly Approve or Reject. Typing a key into an unverified nearby device is not an identity proof.
4. **Public research**: warnings and deliberately initiated STUN observations only. No claim that a NAT mapping equals connectivity, and no public file server.

Privacy: Bonjour advertises *only* randomly named, actively sharing sessions; never transmit invitation key in service metadata. Browsers show the UI but disable native networking and do not launch discovery when the page opens. macOS production builds must include `NSLocalNetworkUsageDescription` and `NSBonjourServices` matching `_uboxcom._tcp` (existing Info.plist verified).

## Implementation tasks after this PR

**LAN acceptance first:** test two actual Mac laptops on the same subnet and with firewall on/off, guest AP isolation, Ethernet/Wi-Fi, a missed/cancelled invite, an expired share, wrong keys, peer spoofing, and real contents/readback. Check Local Network permission prompt from installed unsigned/signed builds. Establish a cancellation API, transfer-rate and bytes UI for both sides, and clear progress vs verified-state markers, before claiming production-ready LAN chat.

**Public transfer architecture decision, not a feature claim:**
- Use vetted ICE/STUN/TURN specifications instead of extending `uboxlan://` to public destinations. Native LAN transport rejects public source/destination addresses by design.
- Exchange candidates through **authenticated user-initiated signaling**; add explicit sender/receiver consent and verify peer identity or a comparison code. Assess replay resistance, revocation, connection caps, timeouts and spam prevention.
- Prefer direct P2P; a TURN or self-hosted relay is opt-in because it exposes transport metadata and introduces hosting/operational costs. Never promise cost-free always-on globally available communication.
- Remote chat, messages, versioned files and concurrent writes require a storage/conflict/backup design and dedicated end-to-end encryption threat review.

## Evidence and references
- LocalSend protocol documentation: https://github.com/localsend/protocol — reference for existing reviewed nearby transfer UX, *not* a claim of LocalSend compatibility.
- Apple Local Network Privacy: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
- ICE NAT traversal: https://www.rfc-editor.org/rfc/rfc8445.html
- TURN relay: https://www.rfc-editor.org/rfc/rfc8656.html

## Acceptance in this PR
- Vitest: valid local IPv4 invitation/port; rejects public and malformed URL; sender-verified mDNS endpoint agreement.
- Real browser: offline room, LAN Send/Receive/Internet tab steps, password-masked invite, disable native controls in browser, don't poll Bonjour from a mere page visit, and honest STUN state.
- Rust: LAN loopback roundtrip tests remain; new source-IP guard tests private, loopback, link-local vs public addresses.
- Latest-head validation, Chromium and both macOS architectures must pass before merging. CI is not physical Wi-Fi transport, a public deployment, code-signing or notarization.
