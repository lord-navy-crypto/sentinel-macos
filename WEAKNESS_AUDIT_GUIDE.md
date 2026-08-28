# Weakness & Visibility Guide — Sentinel macOS V2.1

Weakness Audit evaluates **Sentinel itself**: current evidence coverage, defensive server posture, state-health problems, and known architectural blind spots.

It does **not** score the probability that your Mac is infected.

## Visibility Coverage

Coverage currently reports layers such as:

- process and parent lineage (`ps`),
- network sockets (`lsof`),
- LaunchAgent/LaunchDaemon parsing (`plutil`),
- Login & Background Items (`sfltool`),
- code identity (`codesign`),
- Gatekeeper context (`spctl`),
- protected-data visibility heuristic,
- directory-change streaming boundary,
- Endpoint Security boundary.

Statuses:

- **available** — current local evidence source is available,
- **limited** — evidence exists but is incomplete/heuristic/snapshot-based,
- **unavailable** — expected local evidence source is missing,
- **advanced-required** — requires an Apple-native privileged architecture not present in this release.

## Why FSEvents is a next step

Apple's File System Events API provides notifications when a directory hierarchy changes and can help determine what changed since a prior event ID. A future Sentinel layer can use this to reduce repeated polling and improve change-awareness without pretending it is Endpoint Security.

## Why Endpoint Security is separate

Apple Endpoint Security provides system events such as process execution, fork, mounts, and other security-relevant activity. Apple requires the Endpoint Security entitlement and System Extension packaging/approval. Sentinel V2.1 intentionally does not claim this telemetry.

## Code-validation limitation

Sentinel V2.1 primarily uses `codesign` and `spctl` because it remains a single-binary local tool. A stronger future native macOS validation helper can use Security.framework static-code validation, including all-architecture validation for universal binaries.

## Localhost hardening in V2.1

The server:

- binds only to `127.0.0.1`,
- requires a random session token for API routes,
- rejects unexpected Host headers,
- rejects mismatched Origin headers,
- rejects browser API requests marked `Sec-Fetch-Site: cross-site`/`same-site`,
- uses a strict local-only Content Security Policy with no inline scripts or inline styles,
- disables caching and framing.

These are defense-in-depth controls; they are not a reason to expose Sentinel to the LAN.


## V2.1 advanced boundary

Weakness Audit should continue to report Endpoint Security as entitlement-gated unless an approved, installed, user-authorized System Extension is actually verified. The source scaffold does not count as coverage. Native Security.framework validation and FSEvents should likewise report availability per binary rather than by project source alone.
