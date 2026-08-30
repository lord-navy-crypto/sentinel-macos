# Sentinel 2.4 application frontend

This directory owns the default Sentinel product runtime served at `/`.

```text
app/
├── core.js
├── lenses/
│   ├── orient-investigate.js
│   ├── compare.js
│   ├── system.js
│   └── act-limits.js
├── advanced.js
├── case-stories.js
├── system-evidence.js
├── workbench.js
├── full-scan.js
├── action-dock.js
├── runtime.js
├── shell.css
├── advanced.css
├── workbench.css
├── full-scan.css
└── action-dock.css
```

The startup order is deliberate:

1. `core.js` creates the authenticated localhost client, product state, intent/lens model, and evidence primitives.
2. `lenses/` registers the base evidence views.
3. `advanced.js`, `case-stories.js`, and `system-evidence.js` replace selected base renderers with the latest evidence models.
4. `workbench.js` integrates the 30-function Investigation Workbench across those existing lenses.
5. `full-scan.js` upgrades Status with the visual Scan Center, Easy Scan / Full Scan choice, retained-evidence freshness, and the complete Capability Atlas.
6. `action-dock.js` adds persistent Easy Scan / Full Scan header controls and contextual Quick Actions to every primary Lens by reusing existing operation handlers.
7. `runtime.js` owns navigation, event delegation, search/export, and application bootstrap.

`workbench.js` adds investigation persistence metadata, cross-lens selection, Graph/Timeline controls, Process/Object evolution, Network/Launch evolution, checkpoint and storage trend tools, visibility/completeness guidance, Evidence Bundle export, deterministic local evidence assistance, saved queries/session watches, keyboard workflow, and onboarding. It consumes authenticated Sentinel APIs for evidence; local Workbench metadata such as notes, names, pins, saved queries, and watch definitions must not be confused with observed system evidence.

`full-scan.js` orchestrates existing real evidence paths rather than creating a second scanner backend. A Full Scan covers visibility, current system/process/launch/network state, security audit, monitoring/Behavior/Persistence capture, Graph/Timeline, Cases, System Checkpoint, Network History, cancellable Home storage traversal/hash analysis, Storage History, Recovery/readiness, and final retained analysis refresh. Later Lenses can reuse those retained comparison sources. Freshness remains explicit: a retained baseline is not continuous surveillance or permanently current state.

`action-dock.js` is orchestration-only. It does not add a second mutation path or call Safe Action execution APIs directly. Buttons reuse the canonical `data-do`, `data-system-action`, `data-advanced`, `data-workbench`, `data-scan-center`, and `S.navigate` handlers. Status placement is stabilized around the asynchronously injected Scan Center so the visual order remains deterministic.

`workbench.css` adds matrix, heatmap, flow, completeness, onboarding, investigation, and selection visualizations. `full-scan.css` adds the side-by-side scan choice, real Full Scan progress stages, retained-source freshness strip, and responsive Capability Atlas. `action-dock.css` adds responsive header scan controls and per-Lens Quick Actions without creating a second dashboard.

For the user-facing functional map and Full Scan pipeline, see [`docs/CAPABILITY_ATLAS.md`](../../docs/CAPABILITY_ATLAS.md).

There is no monolithic controller or retired dashboard compatibility runtime in the default startup path. Historical `scan-center.js/css` names remain retired; the current Scan Center is implemented by `full-scan.js/css`. Standalone workspaces outside this directory are auxiliary surfaces and must not be required for startup.
