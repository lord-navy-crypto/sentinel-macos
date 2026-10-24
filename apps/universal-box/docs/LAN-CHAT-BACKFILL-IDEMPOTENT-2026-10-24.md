# Commons LAN chat: bounded catch-up and safe resend

Date: 2026-10-24. Follows member-session release #164; this is a reliability increment for the **existing** Commons live group chat. The public WebRTC/TURN tools remain separate.

## Real behavior

- A host still retains at most the latest **200 RAM-only** messages. Responses stay bounded to **12 messages** per encrypted poll to keep packets small and avoid unbounded work.
- The host now reports the oldest retained sequence and its most recent sequence with each encrypted response. A client can distinguish still-recoverable backlog from already-evicted history.
- After joining or reconnecting, the chat UI drains up to **20 pages per polling round**, then yields to the normal 2.5-second polling interval if the host still has work. Multiple pages are deduplicated into the 200-entry local view and only a monotonic sequence cursor advances. Delayed responses from an overlapping send and poll cannot rewind or duplicate the cursor.
- If the host has already discarded older entries, the UI clearly reports at least how many entries were missed. This is *not* a reliable permanent archive, offline message delivery, or guaranteed replay after a one-hour room ends.
- Each attempted **Send** keeps a random message ID associated with the unchanged draft until the host confirms the attempt. If an authenticated server stores a message but its TCP reply is lost, retrying the same draft resends the **same message ID** and server-side bounded dedupe prevents accidental duplicate text. Editing the draft intentionally resets the pending ID.
- On a timeout or uncertain outcome, the UI says **unconfirmed**, not “not sent” and not “delivered to all members”. Other members still poll independently, so sender acknowledgment is only host acknowledgment.
- Room secret and per-member session tokens still stay inside local app state; no cloud server, public TCP path or new catalog entry.

## Tests and acceptance

- Rust tests: create 215 messages to trigger 200-history retention, verify oldest/latest server sequence and retrieve **every retained record** through 12-record pages without duplicates or an infinite loop.
- Vitest: detect expired host history and exactly how many entries could not be recovered; monotonic paging cursor, delayed repeated page tolerance and rejection of unordered server frames.
- Existing Chromium Commons navigation and native-only LAN controls remain checked by the full browser regression. Physical two-Mac Wi-Fi disconnect and rejoin testing remains a separate gate; macOS Intel/ARM CI and Rust loopback are not physical Wi-Fi.
- Only merge if **latest-head** core, full Chromium and both macOS builds pass. Never claim a permanent chat archive, guaranteed message delivery during host outage or verified peer identity.

## Further increments

Receiver-side reconnect controls when the 20-second member session expires, per-device identities and host-approved rejoin; user opt-in transcript export and offline delivery, explicit participant removal, and public WebRTC peers with TURN interoperability across different real networks.
