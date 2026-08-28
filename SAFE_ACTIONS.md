# Sentinel v1.0 — Safe Actions & Vault

## Purpose

Safe Actions turns Sentinel from a read-only investigator into a deliberately limited response tool without adding permanent deletion.

The workflow is:

```text
Inspect
  ↓
Dependency Guard
  ↓
Action Preview
  ↓
Typed phrase + one-time code + acknowledgement
  ↓
Object revalidation
  ↓
Reversible action
  ↓
Post-action observation
  ↓
Journal / Restore
```

## Supported actions

### Reveal in Finder
Non-mutating. Opens Finder with the path selected on macOS.

### Rename
Same-directory rename only. Sentinel refuses an occupied destination. Rename does not change file contents or permissions and does not stop an already-running process.

### Move to Vault
Moves a regular file under the current user's home directory into:

```text
~/Library/Application Support/Sentinel/Vault/<random-id>/object
```

The Vault object is changed to mode `0600`. A `manifest.json` records enough metadata for restoration and audit context.

### Restore
Moves the active Vault object back to its recorded original path and restores recorded permission bits. Restore refuses to overwrite an existing destination.

## What Sentinel refuses

- permanent deletion
- arbitrary destination moves
- directory / app-bundle mutation
- symlink mutation
- device or other special-file mutation
- paths outside the current user's home directory
- modification of Sentinel state or active Sentinel executable
- Safe Action mutation in `--ephemeral` mode

## Confirmation gate

Action previews expire after five minutes. Each preview includes an exact phrase and one-time code. Execution also requires consequence acknowledgement.

The server revalidates the selected object immediately before mutation. Files up to 64 MiB get a temporary SHA-256 guard; larger files use bounded metadata revalidation.

## Vault is not a malware verdict

A Vault move can disrupt future path-based execution and removes execute permission from the stored object. It does **not** terminate an already-running process, prove the object is malware, or replace Gatekeeper, Notarization, XProtect, or endpoint-security software.

## Recovery metadata

Persistent mode keeps:

```text
~/Library/Application Support/Sentinel/action-journal.json
~/Library/Application Support/Sentinel/Vault/<id>/manifest.json
```

The state directory/Vault directories target `0700`; journal/manifests/active Vault objects target `0600`. The Action Health endpoint verifies the available state.
