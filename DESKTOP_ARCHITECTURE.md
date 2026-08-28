# Sentinel Desktop Architecture

```text
Sentinel.app
├── Universal native AppKit shell
│   ├── NSWindow
│   ├── WKWebView
│   ├── app lifecycle / menu
│   └── engine lifecycle
└── Resources/bin
    ├── sentinel-macos-arm64
    └── sentinel-macos-x86_64
```

The app starts the matching engine with `--desktop --no-browser`. The engine binds only to `127.0.0.1` on a random port and emits one machine-readable bootstrap line to the parent process. The line contains the random local origin and session token. The parent shell uses it to load the dashboard inside WKWebView.

The session token is not written to an app-owned bootstrap file. Existing API token validation, Host checks, Origin checks, and Fetch Metadata checks remain in place.

External HTTP(S) navigation is sent to the user's normal browser rather than replacing the Sentinel dashboard. Closing the app terminates the engine with SIGTERM, allowing Sentinel's graceful shutdown/checkpoint path to run.
