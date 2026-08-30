# Sentinel macOS V2.0 — Incident Intelligence Suite

V2.0 is an architecture release. The central change is moving from isolated findings toward correlated, explainable investigation stories while preserving local-only and reversible-action principles.

## Added

- Incident Correlation Engine and Incidents Easy-Mode page.
- Compressed incident history (`incident-history.json.gz`, max 120).
- Compressed filesystem-change history (`change-history.json.gz`, max 500).
- Native FSEvents checkpoint (`change-checkpoint.json.gz`) and smart-resume source path.
- Rescan-required persistence and `Reconcile hierarchy`.
- Native Security.framework static-code validation bridge for real-macOS CGO builds.
- `Sentinel.app` development packaging script.
- Endpoint Security notification-sensor scaffold and System Extension activation/deactivation scaffold.
- Advanced Sensor status API/UI that explicitly reports the entitlement boundary.
- Incident integration with Power Search, Review Queue, Quick Check, reports, and object investigation workflow.

## Preserved boundaries

- No permanent delete.
- No silent process termination.
- No automatic Trust Profile creation.
- No cloud requirement.
- No claim that Endpoint Security is enabled without entitlement/install/user approval.
- Evidence Confidence is not malware probability.
