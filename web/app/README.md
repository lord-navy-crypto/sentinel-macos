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
├── runtime.js
└── shell.css
```

- `core.js` owns authenticated localhost access, shared state, intent/lens metadata, and reusable evidence render primitives.
- `lenses/` owns domain-specific evidence views and registers them with the core.
- `runtime.js` owns navigation, event delegation, global search, export, and application bootstrap.
- `shell.css` owns the product visual system.

There is no monolithic controller or retired dashboard compatibility runtime in the default startup path. Standalone workspaces outside this directory are auxiliary surfaces and must not be required for startup.
