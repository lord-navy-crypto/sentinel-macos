# Sentinel macOS v0.9 — Safe Actions & Recovery

v0.9 adds a deliberately narrow reversible response layer on top of v0.8 Integrity & Guidance.

## New

- Safe Action Center in the localhost UI.
- Dependency-aware **Rename** preview/execution.
- **Sentinel Vault** with random object IDs and user-only recovery metadata.
- **Restore** with destination-conflict refusal and recorded permission restoration.
- **Reveal in Finder** for direct user inspection.
- Expiring server-side action previews.
- Exact typed confirmation phrase + one-time confirmation code + consequence acknowledgement.
- Pre-execution Action Guard: size, modification time, mode, and SHA-256 for files up to 64 MiB.
- No-clobber regular-file move primitive: destination creation fails if a name already exists, avoiding the overwrite semantics of ordinary POSIX rename.
- Dependency Guard correlating startup references, running processes, path signals, network context, and Trusted Profile context.
- Bounded local Operation Journal with post-action observation.
- Rename and Vault undo previews through the journal.
- Action Recovery Health for `0700`/`0600`, journal validity, Vault manifests, and active Vault object permissions.
- Full report now includes Safe Action policy, journal, and active Vault manifests.
- Low-sensitivity diagnostics include only action mode/health/counts, not paths or fingerprints.
- Large-file Storage results, Cleanup Preview, and Object Story can route a path into Safe Actions.

## Safety changes

- There is **no permanent-delete endpoint**.
- No overwrite on Rename, Vault storage, or Restore; cross-filesystem copy+delete fallback is intentionally not emulated.
- Safe Actions is disabled in `--ephemeral` mode.
- Mutation is limited to regular, non-symlink files inside the current user's home directory.
- Directories/app bundles, special files, symlinks/symlink-parent traversal, selected credential stores, Sentinel state, system roots, and the running Sentinel binary stay read-only.
- Vault movement does not kill an already-running process and is not presented as malware neutralization.

## Compatibility

- localhost server remains `127.0.0.1` only.
- Core runtime still uses one Sentinel binary with embedded web assets.
- Apple Silicon and Intel release binaries remain build targets.
