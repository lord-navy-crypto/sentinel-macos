# Universal Commons network path

## Current status

The offline workspace ZIP and **encrypted manual-invite LAN transport** are merged into `main` (PR #45 and PR #46). This branch (PR #47) adds two distinct things:

- **Nearby discovery**: Bonjour/mDNS DNS-SD `_uboxcom._tcp.local.` advertises only the current, deliberately opened, five-minute one-time share. The multicast record includes a random temporary instance label, private IPv4 address and ephemeral TCP port. **Never advertise the 256-bit invitation secret.** Receiver scans when entering the Commons page, refreshes every 20 seconds, selects the nearby active sender without typing IP and obtains the secret privately through the existing invitation flow.
- **Opt-in STUN diagnostic**: a standard UDP Binding Request to `stun.l.google.com:19302`, only after the user clicks. It observes a public UDP mapped address and port; this is **not** hole punching, remote pairing or a successful P2P connection. The server can see the user's public IP address.

## Why authentication is still required

mDNS service names and addresses are not device identities. Other local devices could impersonate an advertised name or IP. The existing LAN transfer is encrypted using XChaCha20-Poly1305 with a one-time random secret; receiving files requires the matching key before the sender transmits the packet. Automatic discovery is **not** an authorization grant.

The future 'one-click accept' experience needs an authenticated pairing protocol: for example, an ephemeral key exchange authenticated by a user-compared short code on both screens, with explicit sender approval and a strict request rate limit. Do not multicast invitation keys or replace the 256-bit key with a guessable six-digit password.

## Practical connectivity

- Bonjour/mDNS multicast requires machines on reachable local segments. Guest Wi-Fi, AP client isolation, routers that filter multicast, VPN interfaces and macOS firewall rules can block discovery or TCP connections.
- If discovery fails, the direct `uboxlan://` invitation still works where the network permits connectivity.
- The sender only advertises when explicitly sharing. Devices that are running Universal Box but not currently sharing are not shown in this version.
- Nearby discovery may display an untrusted sender's spoofed name. The user must validate the invitation from the intended sender through an independent channel.

## What remote P2P would require

1. Both peers explicitly opt in, acquire UDP mappings, and exchange ICE-like candidates through an authenticated signaling path. Manual copy-and-paste signaling could avoid operating a server, with poorer UX.
2. Test simultaneous UDP hole punching on two different NATs using the same UDP sockets used for binding tests; merely knowing a reflexive address is insufficient. NATs may reject all attempts.
3. Use authenticated encryption, verify peer identity, and confirm each transfer. Do **not** transmit Universal Commons data over unauthenticated raw UDP.
4. When direct P2P fails, explain why and offer an existing user-operated VPN or a self-hosted relay **if the user chooses**. This version does not deploy a relay or incur hosting cost.

## Validation

CI: Rust unit tests for STUN reply parsing and existing encrypted LAN TCP loopback, TypeScript/Vitest, and macOS DMG build. Two physical Macs: same subnet discovery, AP-isolated guest Wi-Fi expected failure, firewall allow/deny, invitation challenge, packet integrity and one-shot expiry. Separate-network P2P tests only after candidate signaling and hole-punch code exists.

Reference protocols:
- https://github.com/localsend/protocol
- https://docs.rs/mdns-sd/latest/mdns_sd/
- https://www.rfc-editor.org/rfc/rfc8489
