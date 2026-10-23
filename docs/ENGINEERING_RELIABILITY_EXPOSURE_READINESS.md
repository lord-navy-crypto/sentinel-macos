# Reliability Exposure & Failure-Family Readiness

Sentinel 4.0 adds a bounded operational reliability-evidence layer over the retained in-memory Task Center.

The goal is to normalize repeated failures by explicit operation exposure **without** treating Task Center records as physical lifetime, repair-process, or maintenance data.

## Why Sentinel does not call Task Center outcomes “reliability”

NIST distinguishes non-repairable lifetime populations from repairable systems. Hazard/failure-rate language belongs to first-failure lifetime models for non-repairable populations, while repeated failures of repairable systems are modeled with rate-of-occurrence-of-failure (ROCOF/repair-rate) processes.

Task Center records are neither of these by default. They are software/application operations with start/end timestamps, outcome status, source/kind, and local detail text. They do not establish:

- physical component lifetime;
- system power-on hours;
- a repair/restoration event after failure;
- a homogeneous population of identical units;
- a constant repair rate;
- an exponential inter-failure process.

Sentinel therefore uses the phrase **operational reliability evidence**, not a physical reliability estimate.

References:
- NIST Engineering Statistics Handbook 8.1.2.1, repairable vs non-repairable systems.
- NIST Engineering Statistics Handbook 8.1.2.5, repair rate / ROCOF.
- NIST Engineering Statistics Handbook 8.1.7.1, Homogeneous Poisson Process assumptions.

## Outcome exposure

For one explicitly selected source/subsystem, Sentinel separates:

- `done` outcomes;
- `failed` outcomes;
- `cancelled` outcomes;
- currently `running` observations.

The **evaluable outcome set** is only `done + failed`.

Sentinel reports:

- observed failure share = `failed / (done + failed)`;
- failures per 100 evaluable operations;
- done and failed counts separately;
- cancelled and running observations separately.

Cancellation is not silently classified as success or failure.

These values are descriptive retained-operation evidence. They are not population reliability probabilities.

## Operation-time exposure

Sentinel can sum the runtimes of retained done+failed operations and call the result **evaluable operation-time exposure**.

Because tasks can overlap, this is not wall-clock system uptime. It is the sum of individual task runtimes.

Sentinel may also report failure incidences divided by retained evaluable task-hours. This is a descriptive normalization only. It is explicitly **not**:

- a hazard rate;
- a repairable-system ROCOF;
- a constant failure rate;
- an MTBF estimate.

## Open and non-evaluable observations

NIST reliability analysis emphasizes censoring: an observation can end without the unit failing, and censored data need specialized handling. NIST also notes that a lack of failures can provide limited information about reliability.

Sentinel therefore keeps running and cancelled Task Center records visible rather than treating them as ordinary successful terminal observations.

However, Sentinel does not automatically label cancellations as statistically independent censoring. User cancellation may be informative, and the mechanism is not established from Task Center data.

References:
- NIST Engineering Statistics Handbook 8.1.3.1, Censoring.
- NIST Engineering Statistics Handbook 8.1.3.2, Lack of Failures.

## Message-derived failure families

NIST notes that different failure modes may need to be analyzed separately.

Sentinel supports only a weaker triage concept: **message-derived families**.

For failed retained operations, the module groups normalized local `kind + detail` text. Normalization removes numeric values and path-like fragments so repeated symptoms can be seen together.

A message-derived family is not an engineering failure mode and not a root-cause classification. Similar messages can have different causes; different messages can share one cause.

No causal failure mode is inferred automatically.

## Models deliberately disabled

The following remain disabled unless future evidence and assumptions justify them:

- physical survival/reliability function;
- hazard/failure rate;
- Weibull/exponential/lognormal lifetime fitting;
- HPP/NHPP repair-process modeling;
- ROCOF;
- MTBF;
- reliability-growth/Duane modeling;
- maintenance or replacement recommendations.

For example, NIST notes that an exponential/HPP MTBF model assumes a constant repair/failure occurrence rate and exponentially distributed waiting times between failures. Sentinel does not infer those conditions from retained Task Center failures.

## Michigan IOE connection

University of Michigan IOE’s Quality Control and Reliability Engineering area explicitly combines data-driven modeling, simulation, quality control, reliability, fault diagnosis, statistical monitoring, design of experiments, and maintenance decision-making under uncertainty.

Sentinel follows that progression: first define exposure and evidence boundaries, then establish models only when their assumptions are supported.

## Engineering boundary

This module is local, read-only, bounded, and in-memory. It introduces no backend route, filesystem scan, persistence, system mutation, or arbitrary command execution.

It does not establish physical reliability, hazard, ROCOF, MTBF, lifetime distributions, reliability growth, root cause, or a maintenance recommendation.
