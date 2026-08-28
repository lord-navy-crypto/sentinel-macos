# Sentinel Desktop Architecture

```text
Sentinel.app
├── Universal native AppKit launcher
│   ├── lightweight status/control window
│   ├── Open Dashboard action
│   ├── app lifecycle / menu
│   └── engine lifecycle
└── Resources/bin
    ├── sentinel-macos-arm64
    └── sentinel-macos-x86_64

Default browser
└── http://127.0.0.1:<random-port>/#token=<session-token>
    └── full Sentinel dashboard
```

The app starts the matching engine with `--desktop --no-browser`. The engine binds only to `127.0.0.1` on a random port and emits one machine-readable bootstrap line to the parent process. The line contains the random local origin and session token.

The native launcher converts that bootstrap payload into the authenticated localhost dashboard URL and opens it in the user's default browser. The browser version of the dashboard is therefore the single UI implementation for both direct development use and installed-app use; the desktop launcher does not embed or modify the dashboard with WKWebView.

The session token is not written to an app-owned bootstrap file. Existing API token validation, Host checks, Origin checks, and Fetch Metadata checks remain in place.

The launcher window remains open while the engine is running and provides an **Open Dashboard** action if the browser tab is closed. Closing or quitting Sentinel Mac terminates the engine with SIGTERM, allowing Sentinel's graceful shutdown/checkpoint path to run.

This architecture keeps the distribution benefits of a normal macOS app (Universal 2 bundle, icon, DMG, Developer ID signing, notarization, drag-to-Applications installation) while using the already-tested localhost browser UI for the full product experience.
