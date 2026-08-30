# Sentinel 2.4 Desktop Architecture

Sentinel 2.4 uses one product frontend and one loopback-only local engine. Browser and App View are two containers for the same product source, not two UI implementations.

```text
Sentinel.app
├── Universal AppKit launcher
│   ├── local-engine lifecycle
│   ├── Open in Browser
│   ├── Open App View (WKWebView)
│   └── Quit Sentinel
└── Contents/Resources/bin
    ├── sentinel-macos-arm64
    └── sentinel-macos-x86_64

Architecture-matched Go engine
├── binds 127.0.0.1:<random-port>
├── emits one bootstrap payload to its parent
├── validates the in-memory session token
├── serves authenticated localhost APIs
└── serves the Sentinel 2.4 Native Frontend directly
    ├── web/index.html
    ├── web/sentinel-24.css
    └── web/sentinel-24.js

Product containers
├── Default browser ──┐
└── Native WKWebView ─┴── same product URL / same session / same APIs
```

## Bootstrap and lifecycle

The native launcher starts the matching engine with:

```text
--desktop --no-browser
```

The engine binds only to `127.0.0.1` on a random port and emits a machine-readable `SENTINEL_DESKTOP_BOOTSTRAP` line containing the local origin, session token, and version. The launcher turns that payload into the product URL with the token in the fragment. It does not persist the token to an app-owned bootstrap file.

Closing or quitting Sentinel terminates the owned engine. The Go shutdown path can then cancel storage jobs, stop Change Monitor, and persist supported checkpoints/state.

## One frontend, two containers

`web/index.html` is the current product document. It loads only the Sentinel 2.4 product CSS and JavaScript. The server returns that document directly; it does not rewrite the HTML to inject an older dashboard, compatibility bridge, command palette, or desktop-only shell.

The default browser opens the authenticated local product URL directly.

The App View creates a `WKWebView` with a nonpersistent website data store and loads the same URL. Local navigation is restricted to the active `127.0.0.1` port. External links are handed to the default browser. JavaScript alert/confirm/prompt surfaces are bridged through native AppKit dialogs.

There is no `desktop=1` product mode in the current architecture. Container choice must not change product semantics or data.

## Frontend flow

```text
web/index.html
   ↓
web/sentinel-24.css
web/sentinel-24.js
   ↓
X-Sentinel-Token authenticated fetch
   ↓
/api/*
   ↓
Go evidence engine
```

The old `web/app.js` dashboard and previous `desktop-ui.js` runtime replacement layer are not part of this startup path.

## Security boundary

The desktop architecture preserves the local security model:

- loopback-only HTTP binding;
- random port per engine session;
- in-memory random session token;
- `X-Sentinel-Token` API authentication;
- Host, Origin, and Fetch Metadata checks;
- anti-framing headers;
- no arbitrary remote-network App Transport Security exception;
- external App View navigation is opened outside the embedded WebView.

The WebView is a presentation container. It does not create a second backend or bypass API authorization.

## Architecture support

The macOS bundle contains:

- a Universal AppKit launcher (`arm64` + `x86_64`);
- a native `arm64` Go engine;
- a native `x86_64` Go engine.

At runtime the launcher selects the engine matching the process architecture. `build-desktop-macos.sh` verifies the architectures and checks that the Sentinel 2.4 frontend marker is embedded in both engine builds.

## Distribution

This design preserves normal macOS distribution characteristics:

- drag-to-Applications DMG installation;
- Universal 2 launcher;
- Developer ID signing and Hardened Runtime when configured;
- Apple notarization/stapling for production distribution;
- a Beta path that can be explicitly labeled unsigned/unnotarized during testing.

See `DIRECT_DISTRIBUTION_GUIDE.md` for packaging and release steps.
