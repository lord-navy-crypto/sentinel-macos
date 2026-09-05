# Queue & Capacity Model Readiness

Sentinel 3.9 adds a bounded queueing-model readiness layer over retained Task Center timing evidence.

The purpose is to separate **observed flow evidence** from **stochastic queue-model assumptions**.

## Why model readiness comes before queue formulas

MIT course material on queueing and Little's Law emphasizes that Little's Law relates average number in system, arrival rate, and average time in system for a stable queueing system. More specific models such as M/M/1 require additional assumptions, including a single-server structure, Poisson arrivals, exponential service times, and stability.

Michigan Industrial & Operations Engineering places queueing theory alongside stochastic systems, simulation, optimization, and data-driven modeling. Sentinel follows that modeling discipline: it does not infer a queue model merely because task start/end timestamps exist.

## Observed evidence

For one explicitly selected Task Center source/subsystem, Sentinel can describe:

- retained task starts as arrival events;
- interarrival intervals;
- terminal task durations as service/cycle-time observations;
- finite-window arrival and completion rates;
- maximum observed concurrency;
- time-average retained WIP over a complete finite window;
- descriptive interarrival and service-time coefficients of variation.

These are descriptive observations only.

Observed maximum concurrency is **not** interpreted as server count. Completion rate is **not** interpreted as service capacity.

## Little's Law diagnostic

When every selected retained task is terminal and the finite window is balanced, Sentinel can compute a finite-window accounting consistency diagnostic:

- time-average WIP `L` from the overlap-area integral;
- finite-window arrival rate `lambda`;
- mean terminal cycle time `W`;
- the difference between observed `L` and `lambda * W`.

For a closed finite retained window this residual should be near zero by construction. Sentinel therefore labels this an **accounting diagnostic**, not evidence of queue stability.

A bounded finite window does not establish the long-run stable-system condition needed for Little's Law as a queue-performance model.

## Assumption ledger

Sentinel explicitly keeps the following assumptions separate from observations:

- server count;
- queue discipline (FCFS/FIFO, priority, processor sharing, etc.);
- stationarity of arrival and service processes;
- Poisson arrivals;
- exponential service times;
- queue stability.

Unless independently established, these remain `NOT ESTABLISHED`.

## M/M/1 gate

M/M/1 is disabled by default.

Sentinel does not compute M/M/1 utilization, expected waiting time, expected queue length, or capacity conclusions because Task Center timing alone does not establish:

- one server;
- Poisson arrivals;
- exponential service times;
- queue stability.

## Engineering boundary

This module is local, read-only, bounded, and in-memory. It adds no backend route, persistence, filesystem scan, system mutation, or arbitrary command execution.

It does not establish:

- service capacity;
- safe concurrency;
- utilization optimum;
- waiting-time prediction;
- queue stability;
- queueing steady state;
- an optimization recommendation.

References:
- MIT 6.02 notes on Little's Law and stable queueing systems.
- MIT queueing-theory / operations-management materials on M/M/1 assumptions and queue performance.
- University of Michigan IOE Operations Research & Analytics area: queueing theory, stochastic systems, simulation, optimization.
