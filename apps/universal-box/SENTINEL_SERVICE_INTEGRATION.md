# Sentinel as a native service inside Universal Box

This is a **packaged service**, not a rewrite of Sentinel. The original Sentinel Go code and persistent state remain in the root of the `sentinel-macos` repository.

- `npm run tauri:dev` / `npm run tauri:build` run `scripts/build-sentinel-engine.sh` first.
- The Go engine is bundled at `Contents/Resources/sentinel/sentinel-engine` (Tauri resource destination), not downloaded from the internet.
- The Rust supervisor launches it on-demand with `--desktop --no-browser` and reads its existing `SENTINEL_DESKTOP_BOOTSTRAP` line; the Go engine chooses a random loopback port and ephemeral session token.
- Rust never sends this token to the main React page. A bounded read-only allowlist proxies evidence queries over the existing authenticated loopback API. The existing Go frontend can open in a **separate WebView within the same Universal Box process** for all legacy operations, including recovery and approval flows.
- Stopping the service sends SIGTERM for Go's normal cancellation/shutdown behavior, waits briefly, and only force-terminates if the engine fails to exit. Data directories and retained histories are not changed or relocated.
- The old standalone Sentinel.app can still be built independently; there is no destructive data migration.
- `macos-14` currently produces an **Apple Silicon** DMG. To make an Intel bundle, compile both Tauri and Go with amd64/x86_64. Universal packaging and notarization need a later release-validation pass.

## Security boundaries

Never expose an arbitrary origin/path/command to React. The engine is fixed to `http://127.0.0.1:PORT`, session token is private to Rust, and only allowlisted GET endpoints are proxied. Sentinel's original safety confirmations and object revalidation stay in Go. No global scanning happens simply by opening Universal Box. Users explicitly start the engine and choose any deeper scans.

## Validation

Run `npm run prepare:sentinel`, `npm run build`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `npm run tauri:build` on macOS. Before distributing, test real Go process startup, shutdown, legacy WebView, permissions and state retention on a test Mac.
