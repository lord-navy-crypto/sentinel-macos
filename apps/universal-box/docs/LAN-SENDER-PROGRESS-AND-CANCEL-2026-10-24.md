# Commons LAN v1.1 · truthful sender progress and cancellable active transfer

Date: 2026-10-24 · Requested development sequence: polish existing UI → reliable LAN communication → public communication as a separately gated future phase.

## User experience

The existing 5-minute single-use, encrypted Team ZIP workflow is unchanged. After choosing **LAN → Send**, the operator sees **Waiting / Sending / TCP written / Expired / Stopped** instead of a vague active/inactive flag. While sending, the app reports actual *encrypted TCP payload bytes written*, capped at the known payload length. This is **not** a claim of delivered-and-verified files: the receiver must decrypt, validate ZIP members and attachment SHA-256, inspect the preview and explicitly approve import.

**Stop sharing** now prevents additional 64 KiB encrypted blocks from being written even when the active receiver has already authenticated. The sender does not transmit plaintext, sender progress never includes the private invitation, and a failed or wrong-key handshake does not consume the one-time invitation. A Stop near an already-written final block cannot recall bytes transmitted to TCP, so the receiver's separate verification remains essential.

No automatic server, account, background chat capture, public-IP remote connection or new top-level tool. The exported team packet remains limited to 30 MB, with a five-minute lifetime and one successful transfer.

## Native protocol implementation

- Preserve the established XChaCha20-Poly1305 authenticated invitation handshake.
- Bound handshake read to three seconds; keep existing 8-second socket write timeout.
- After a successful key proof, encrypt the same ZIP and send it in 64 KiB bounded writes, checking sender cancellation before each block. A progress callback updates atomics for exact encrypted bytes written and total payload size.
- Native `commons_lan_status` now adds `phase`, `sentBytes`, `totalBytes`; it returns no invitation after success or expiry. UI polling at the existing interval displays state and clears the stale displayed invite.
- Terminal `delivered` means "payload written to the TCP socket," **not** receiver authentication, ZIP correctness or persistent save. The success gate is the existing receiver's explicit review/approval.

## Automated checks

Rust loopback:
- Authenticated packet sender progress is monotonic, bounded and completes at payload + AEAD tag length.
- Cancellation following the first 64 KiB block interrupts the active write and the receiving endpoint rejects the truncated packet, never reporting a verified transfer.
- Retain wrong-key/public address and existing encrypted loopback progress tests.

TypeScript/Chromium: the existing Commons workflow, masked invitations, direction controls and native-only browser gates remain green.

## Physical acceptance still required

Two installed Macs on the same LAN, high-latency/large packet transfers, wrong key, firewall, AP isolation, sender Stop while receiving, timeout, expiration, and SHA-256 import confirmation. Apple signing/notarization, Finder save, installed app privacy prompts and real-device LAN speed are not implied by macOS CI builds.

## Public internet phase is **not yet implemented**

Only after the above LAN acceptance: compare established ICE/STUN/TURN and end-to-end identity verification; design explicit user consent, authenticated signaling, bounded relay and NAT error UI. The LAN parser and listener must remain LAN-only. Public STUN observation is not a successful peer connection or cloud deployment.
