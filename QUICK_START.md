# Sentinel macOS V2.1 — 5-minute Quick Start

## 1. Launch

Run `RUN_SENTINEL.command` or the correct binary in `dist/`. Sentinel prints a tokenized `127.0.0.1` URL and opens it locally unless `--no-browser` is used.

Normal mode allows one persistent Sentinel instance. Use `--ephemeral` for a second isolated read-only session.

## 2. Run Final Readiness

On **Home**, choose **Check Sentinel readiness**. Resolve recovery-state problems before relying on Vault or long monitoring sessions.

## 3. Run Quick Check

Quick Check is read-only. It does not create a Trusted Profile, update Behavior/Persistence baselines, or modify files.

## 4. Optional monitoring setup

Use **Capture monitoring snapshot** only when you intentionally want local comparison metadata. Then start **Change Monitor** for Persistence, Downloads, Workspace, or an explicit Home subfolder.

If the change stream shows **RESCAN REQUIRED**, use **Reconcile hierarchy** before treating incremental continuity as complete.

## 5. Investigate stories, not alert fragments

Open **Incidents** and rebuild correlation after changes or a targeted review. V2.1 separates evidence by time window and merges repeated rebuilds of the same story.

Use **Deep Review** for a fresh read-only Integrity + Object Story reinspection.

## 6. If action is necessary

Safe Actions supports only:

- Reveal in Finder
- Rename
- Move to Sentinel Vault
- Restore

There is no permanent-delete API. Vault footprint advisories never auto-remove data.

---

## V2.2 desktop app path

For a real Mac developer build, double-click `BUILD_DESKTOP_APP.command` or run:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

For public users, do **not** publish the source folder or development command as the primary install path. Publish the signed/notarized `Sentinel-2.2.dmg` created by `release-direct-macos.sh`.
