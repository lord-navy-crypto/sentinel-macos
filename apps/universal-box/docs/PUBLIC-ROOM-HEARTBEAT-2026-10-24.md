# Public WebRTC room application heartbeat and stale-member diagnostics
Date: 2026-10-24

This change builds on merged #170 (manual member resume), in the existing Commons > Public > Group Room view.

## Implementation
- When, and only when, a temporary room is open, the host sends a typed room-scoped `ping` with a fresh UUID through each **already authenticated, open WebRTC DataChannel** every 12 seconds. A guest responds with the matching `pong`, also over the existing DTLS-protected channel.
- The host validates the exact outstanding ping ID from the corresponding member channel before advancing the last-response timestamp. Invalid/unsolicited/mismatched-room frames cannot mark a member healthy.
- A 48-second no-response window is deliberately conservative to tolerate transient app throttling. On timeout, the host marks that peer not authenticated/online for subsequent recipient snapshots, closes its stale transport and offers the existing explicit **reinvite same member** action.
- The guest likewise watches the most recent admitted-host ping (or welcome); when overdue, it stops accepting new sends and directs the user to request a **fresh Offer** from the host. The existing short-lived encrypted resume capability stays only in RAM.
- The host's UI shows `已连接 · 心跳正常` only after a real matching Pong, rather than inferring online status from the existence of a peer object.
- The heartbeat is not a read receipt, user identity verification, guarantee of prompt delivery, or replacement for ICE/DTLS status. Background tab suspension, a powered-off Mac or severe congestion can delay heartbeats; a false timeout requires explicit renegotiation.
- No default public STUN, TURN, server-side service or automatic signal exchange is enabled. No persistent connection list or message database is created.

## Test and release gate
- Vitest: typed Ping/Pong frame parsing, invalid/cross-room UUID rejection, conservative elapsed time calculation, and boundary handling.
- Chromium: three live browser clients, two independent WebRTC channels, retained chat + per-member ACK after manual resume, and observe a real host-to-guest Ping and guest-to-host matching Pong via updated host UI.
- Exact final head must pass full browser regression, core validation and Intel/Apple Silicon macOS desktop CI before merge.
- Still unverified separately: two physical Macs across distinct public networks, relay-hosted TURN, macOS app-signing and notarization, and resumability after complete application shutdown.
