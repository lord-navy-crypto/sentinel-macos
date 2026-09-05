# Engineering Quality & Experiment Readiness

Sentinel 3.8 extends Engineering Operations with two bounded engineering tools:

1. an **SPC structure check** over the existing Engineering Operations baseline and retained Task Center evidence;
2. an **in-memory single-factor comparative DOE planner**.

The purpose is to make stronger statistical methods conditional on an explicit process definition and an explicit experiment design rather than generating control charts or optimization claims from mixed operational history.

## Statistical process control structure

NIST's Engineering Statistics Handbook describes process control as using historical/reference process data to establish initial limits and then comparing later observations against those limits. It distinguishes the initial-model/refinement work (Phase I) from later monitoring with established limits (Phase II).

Sentinel therefore does **not** treat the presence of a baseline as proof that a process is statistically controlled.

The 3.8 structure check asks for an explicit source/subsystem boundary and uses terminal cycle time as the initial quality characteristic. It reports:

- whether a reference phase exists;
- whether one source/subsystem has been explicitly selected;
- whether that source is observed in both reference and post-baseline phases;
- whether terminal cycle-time observations exist in both phases;
- how much of the captured reference source is still available as row-level evidence in the bounded Task Center history;
- that independence and a single stable distribution remain unestablished.

The module deliberately does **not** generate:

- UCL or LCL;
- Shewhart charts;
- CUSUM or EWMA limits;
- common-cause or special-cause classifications;
- process capability;
- an in-control certificate.

This matches the NIST requirement that the underlying process and measurement assumptions be examined before statistical-control conclusions are used.

References:
- NIST Engineering Statistics Handbook, `6.1.2 What are Process Control Techniques?`
- NIST Engineering Statistics Handbook, `2.1.2.1 Assumptions`
- NIST Engineering Statistics Handbook, `6.3.1 What are Control Charts?`

## Design of experiments foundation

NIST defines DOE as a systematic engineering approach to collecting data so that conclusions are valid, defensible, and efficient. The design depends on the objective and on the factors under investigation.

Sentinel 3.8 starts with the smallest defensible design surface: a **single-factor comparative plan**.

The user defines:

- one factor;
- at least two distinct factor levels;
- one response variable;
- a replication target per level;
- whether run order should be randomized;
- constraints or nuisance conditions that must be considered.

The planner creates the run matrix in memory. If randomization is requested, the run order is shuffled before display using the browser cryptographic random source. The planner does not alter Mac settings, start tasks, or execute the experiment.

Replication is required at a target of at least two runs per level because repeated treatment combinations are necessary to expose repeat variation. Randomization is strongly preferred because run-order effects can otherwise become confounded with treatment effects.

References:
- NIST Engineering Statistics Handbook, `4.3.1 What is design of experiments (DOE)?`
- NIST Engineering Statistics Handbook, `5.3 Choosing an experimental design`
- NIST Engineering Statistics Handbook, `5.3.3.1 Completely randomized designs`
- NIST Engineering Statistics Handbook, `5.7 A Glossary of DOE Terminology`

## Engineering boundary

This module is local and in-memory only. It introduces no new backend route, filesystem scan, persistent database, system setting change, or arbitrary command execution.

It does not establish:

- statistical significance;
- causality;
- queueing steady state;
- process capability;
- reliability or MTBF;
- an optimal factor level;
- an optimization recommendation.

Those claims require additional evidence and an analysis appropriate to the model assumptions.
