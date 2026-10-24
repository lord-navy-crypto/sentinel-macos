# Commons LAN + public connectivity: practical release test gate
Date: 2026-10-24

## Delivered in this branch

This branch ports the already-CI-tested work from stale PR #166 **onto the current main containing public WebRTC PRs #168–#171**, then hardens LAN disconnection behavior.

- Encrypted LAN host supplies `oldestSeq` / `latestSeq`; client drains up to 20 bounded 12-message pages per poll interval and announces when the host's 200-line RAM backlog has already been truncated.
- Client keeps the **same message ID** across uncertain TCP send retries; duplicate receipt from the host does not append text twice. The UI distinguishes host acceptance from delivery/reading by each recipient.
- If a member's 20-second RAM-only session expires during Wi-Fi loss, the UI flags the issue and gives **检查连接** and **重新加入原房间** actions. The latter explicitly requests a fresh encrypted member session with the original invitation and nickname, while retaining local messages and the monotonic message cursor. Another current holder of the same nickname must first disconnect or time out; we do **not** bypass membership validation.
- An edit to a draft while an encrypted send is in flight no longer gets erased by an ACK for the *previous* draft.
- Host now lists 169.254.x.x link-local NIC addresses, supporting two Macs on a directly configured link-local network. Multiple non-loopback local IPv4 addresses are selectable in the UI rather than blindly copying the first potentially inaccessible VPN address. A host with only 127.0.0.1 shows an explicit warning that the invitation will not work on a second Mac.
- LAN listener remains IPv4-only and short-lived, accepts only private/link-local source addresses, uses a shared invitation key + independently-issued member session tokens, and exposes no public server. These are **not** human/device identity verification or group E2EE.

## Manual two-Mac LAN test (to perform after all CI is green)

1. Start the actual macOS Sentinel Box app on Mac A and B connected to the same Wi-Fi (no client isolation). Confirm local network permission and macOS firewall access if prompted.
2. A creates a LAN room. Choose its Wi-Fi IP in the new network-interface selector, not a VPN IP or `127.0.0.1`. Copy the invite privately to B.
3. B joins using a different nickname and exchanges several texts. A and B should synchronize within the next 2.5-second polling interval.
4. Disconnect B from Wi-Fi for >20 seconds; A sends messages, then B reconnects. B chooses '重新加入原房间', retaining the same invite. The old nickname must have expired, the temporary session token changes, and the UI retrieves still-retained host messages; if >200 messages were sent during the outage, it reports the missing prefix instead of claiming full recovery.
5. Test a send where the host may accept before its TCP response times out; retry the same unchanged draft; server must show the text **once**. Change the draft while sending and ensure the new text remains.
6. With VPN/multiple NICs active on A, selecting the correct interface must work. If A only has loopback, do not treat that as a valid two-device invitation.
7. Verify app restart, host expiry after one hour, and loss of retained history are clearly not durable delivery features.

## Public-WAN test (current main, independently)

1. Use host and guest on **different real networks**. Explicitly exchange a fresh unique SDP Offer/Answer for every separate member slot; verify fingerprints using a trusted second channel.
2. Select public STUN or own TURN only with user opt-in. In restrictive NAT/firewall situations, STUN alone might not connect. Verify both direct and relay paths if possible with credentials **kept private**.
3. Test encrypted group chat, application-level ACK, duplicate-safe retry and manually renegotiated same-member connection after disconnect. Modern peers should display matched Ping/Pong; legacy peers without negotiated heartbeat should not be kicked solely for not answering a Ping.
4. A successful local Chromium job does **not** prove two physical Macs, different ISPs, TURN server reachability, Apple app signing, notarization or guaranteed NAT traversal. No hosted rendezvous signaling or automatic cross-WAN rejoin is introduced.

## CI required before telling the user the build is ready for their physical test

- Full browser workflow / Chromium, frontend TypeScript + Vitest.
- Rust chat contract tests including 200-line backlog, idempotent message retries and 20-second token expiry/new-token rejoin with same room history.
- Core Sentinel validation and Intel + Apple Silicon macOS desktop CI, on the **exact final branch head**.
