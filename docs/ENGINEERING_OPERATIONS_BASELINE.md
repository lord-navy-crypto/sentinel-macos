# Engineering Operations Baseline / Phase Comparison

Sentinel's Engineering Operations Baseline is a bounded, in-memory before/after comparison over the existing Task Center evidence. It is intentionally a **phase boundary**, not a declaration that the reference phase is normal, capable, statistically controlled, or optimal.

## Reference phase

When the user chooses **Capture baseline**, Sentinel records:

- the capture timestamp;
- the IDs of Task Center records already retained at capture;
- an aggregate reference snapshot for WIP, terminal observations, median terminal cycle time, observed throughput, outcome mix, and source/subsystem mix.

No filesystem scan, resource sample, network capture, or new task collection is triggered.

## After phase

Only tasks that:

1. were not part of the captured retained-ID set; and
2. started at or after the phase boundary

are included in the post-baseline phase.

This prevents ordinary retention-window drift from being presented as a before/after result.

## Directional comparison

The phase view may compare:

- retained task count;
- terminal observation count;
- median terminal cycle time;
- observed completion throughput when the phase spans at least 60 seconds;
- done share among terminal outcomes;
- failed and cancelled outcomes separately;
- WIP snapshot;
- source/subsystem mix.

Cycle-time delta preserves direction: a negative delta means the post-baseline median is shorter; a positive delta means it is longer.

## Statistical quality boundary

This layer follows the engineering idea of establishing a reference process before comparing later behavior, but it does **not** automatically create statistical process control limits.

A bounded Task Center phase comparison does not by itself establish:

- a stable or statistically controlled reference process;
- independent or identically distributed observations;
- a suitable probability model;
- rational subgrouping;
- control limits;
- common-cause versus special-cause variation;
- process capability;
- statistical significance;
- causal effect.

Therefore Sentinel does not draw Shewhart, CUSUM, EWMA, or capability conclusions from this phase comparison alone.

## IOE and broader engineering use

- **Industrial & Operations Engineering:** establishes a reproducible phase boundary for process-performance comparison.
- **Quality Engineering:** creates the reference/after structure needed before later SPC work, while refusing premature control-limit claims.
- **Systems Engineering:** gives a before/after evidence boundary for a reviewed system or workflow change.
- **Human Factors:** allows comparison of visible concurrent-work patterns without inferring mental state.
- **Software/Security Engineering:** remains read-only, local, and in-memory; no new mutation or persistence path is introduced.

## Intended progression

`observe → capture reference phase → collect post-change evidence → compare directionally → establish statistical/model readiness → only then apply SPC/DOE/queueing/optimization methods when their assumptions are satisfied`
