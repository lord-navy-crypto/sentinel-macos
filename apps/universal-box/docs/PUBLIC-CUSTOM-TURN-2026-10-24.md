# Commons Internet experiment: explicit user-owned TURN fallback

Date: 2026-10-24. Follows merged WebRTC direct text PR #163. This is a reliability option in the **same Commons Public** screen, not a hosted chat service.

## User job

A public WebRTC peer-to-peer chat may fail on CGNAT, symmetric NAT or strict firewalls even after explicit STUN. A TURN relay can carry encrypted WebRTC DataChannel traffic when direct ICE candidate pairs fail. Sentinel remains free and offline-first; it **does not provide or pay for a TURN server**. A user may bring one they own or have permission to use.

## Actual implementation

- Keep the **public STUN** checkbox off by default. Add a separate **use my TURN server** checkbox off by default. Neither sends any network probes just by opening or editing the screen.
- Enter a standards-shaped `turn:host:port?transport=udp` or `turns:host:port?transport=tcp`, username and temporary credential. Reject malformed URLs, embedded credentials, invalid ports, whitespace/control characters, missing passwords and TLS-plus-UDP mismatch. Prefer TURN over TLS (`turns:`).
- When and only when the user clicks **Create Offer** or **Generate Answer**, construct the native `RTCIceServer` array and hand it to `RTCPeerConnection`. Existing ICE candidate gathering and manual Offer/Answer exchange handle the rest. Direct ICE candidates may still be chosen; selecting TURN is an option, **not a guaranteed relay route**.
- Secrets live in React memory; password input is masked, not written into local storage or the exported SDP; selecting Disconnect clears the temporary credential. UI errors never interpolate relay credentials.
- TURN operators can learn source/public IP and usage metadata and may charge for bandwidth. DTLS protects DataChannel text against a relay reading its message contents, but peer identity is still unverified and the remote peer can view message content.

## Tests

- Vitest for zero-server default, STUN only after consent, successful user-owned `RTCIceServer` object, absent/invalid username/password, URL schemes/ports, path and embedded credentials.
- Browser test proves optional inputs are hidden by default, password masked, invalid TURN port fails **before** any RTCPeerConnection is created, closing clears credential. Existing full WebRTC peer-to-peer data exchange test remains.
- Require exact-head core, Chromium and both macOS CI before merge. **No assertion of actual remote public TURN connectivity**, because a real authorized relay and two external endpoints are not connected for testing.
- UI is still a manual one-to-one connectivity experiment, not a public room directory, multiuser hosted messenger, built-in TURN business, live device status sync, signed/notarized production app or an always-available service.

Related standards: ICE [RFC 8445](https://www.rfc-editor.org/rfc/rfc8445), TURN [RFC 8656](https://www.rfc-editor.org/rfc/rfc8656), WebRTC DataChannels [RFC 8831](https://www.rfc-editor.org/rfc/rfc8831).
