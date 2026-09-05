# Sentinel Engineering Operations Model

Sentinel treats the Mac as an engineered operating system-of-systems: hardware resources, software processes, user-triggered operations, storage/network subsystems, evidence pipelines, and human interaction all contribute to observed system behavior.

## Industrial & Operations Engineering bridge

The Engineering Operations layer reuses the existing bounded Task Center history and maps it to process evidence:

- **Work in process (WIP):** currently running Task Center operations.
- **Cycle time:** observed terminal task duration from `startedAt` to `completedAt`.
- **Observed throughput:** completed tasks per minute over the retained observation span, and only when at least 60 seconds of span exists.
- **Outcome mix:** done, failed, and cancelled outcomes are reported separately.
- **Source load:** retained tasks grouped by explicit `source`, falling back to `kind` where source metadata is unavailable.
- **Stall visibility:** current tasks that satisfy Sentinel's existing 45-second no-visible-progress rule.

These are process measurements, not optimization results.

## Broader engineering bridge

### Systems engineering

Task sources are treated as subsystem/interface labels. The layer exposes current technical performance evidence while preserving the system boundary: it does not create a second task collector, filesystem scanner, or resource telemetry store.

### Human factors

Concurrent task visibility and the existing Task Center pressure warning help users understand simultaneous operations. Sentinel does not label concurrency as cognitive workload, operator error, or unsafe human performance.

### Quality and reliability engineering

Failed, cancelled, and stalled tasks are visible as retained outcome evidence. Sentinel does not infer MTBF, failure probability, a reliability certificate, or a common failure mechanism without a valid exposure model and additional evidence.

### Software and security engineering

The analysis remains local, bounded, and read-only. It reuses existing Task Center state and does not introduce arbitrary shell execution, new mutation APIs, or background persistence.

## Explicit non-claims

The bounded Task Center history does **not** establish:

- a stationary arrival process;
- a service-time distribution;
- queue discipline or queue stability;
- a cost or objective function;
- controlled experimental conditions;
- a causal relationship between task pressure and resource pressure;
- an optimal concurrency level;
- safe capacity limits;
- MTBF or a reliability distribution.

Therefore Sentinel does not infer Little's Law steady-state results, queueing optima, utilization optima, or optimization recommendations from this layer.

## Engineering progression

The intended product progression is:

`observe → measure process state → retain bounded evidence → compare → model only when assumptions are satisfied → optimize only with an explicit objective and constraints → verify outcomes`

This keeps Sentinel aligned with Industrial & Operations Engineering while preserving broader systems-engineering evidence discipline.
