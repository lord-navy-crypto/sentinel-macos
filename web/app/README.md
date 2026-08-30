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
├── runtime.js
├── shell.css
├── advanced.css
└── workbench.css
```

The startup order is deliberate:

1. `core.js` creates the authenticated localhost client, product state, intent/lens model, and evidence primitives.
2. `lenses/` registers the base evidence views.
3. `advanced.js`, `case-stories.js`, and `system-evidence.js` replace selected base renderers with the latest evidence models.
4. `workbench.js` integrates the 30-function Investigation Workbench across those existing lenses before bootstrap.
5. `runtime.js` owns navigation, event delegation, search/export, and application bootstrap.

`workbench.js` adds investigation persistence metadata, cross-lens selection, Graph/Timeline controls, Process/Object evolution, Network/Launch evolution, checkpoint and storage trend tools, visibility/completeness guidance, Evidence Bundle export, deterministic local evidence assistance, saved queries/session watches, keyboard workflow, and onboarding. It consumes authenticated Sentinel APIs for evidence; local Workbench metadata such as notes, names, pins, saved queries, and watch definitions must not be confused with observed system evidence.

`workbench.css` adds matrix, heatmap, flow, completeness, onboarding, investigation, and selection visualizations without creating a second dashboard.

There is no monolithic controller or retired dashboard compatibility runtime in the default startup path. Standalone workspaces outside this directory are auxiliary surfaces and must not be required for startup.
