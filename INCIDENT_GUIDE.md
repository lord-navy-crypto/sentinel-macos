# Incident Intelligence Guide

## What is an Incident?

An Incident is a local evidence-correlation object. It combines observations that appear to describe the same system story, for example:

1. a LaunchAgent plist changes;
2. its target executable changes metadata or identity;
3. Behavior Diff reports a new process/network relationship;
4. Trust Drift reports that the executable no longer matches the user-approved reference.

Instead of showing four unrelated cards, Sentinel can show one Incident timeline.

## Evidence Confidence

Evidence Confidence estimates how strongly the observations belong together. It increases when multiple independent Sentinel sources support the same primary object. It does **not** estimate maliciousness, intent, or infection probability.

## Severity

Severity is review priority. A high-priority Incident can still be legitimate—for example, a normal software update can modify a launch configuration and executable together.

## Current evidence sources

- Change Monitor / filesystem events
- Persistence Integrity
- Behavior Diff
- Trust & Drift

The incident engine is deliberately conservative. It does not invent missing edges and does not call a process malicious because it is unsigned, network-active, or new.

## History and privacy

Normal mode keeps at most 120 Incident records in `incident-history.json.gz` under Sentinel's Application Support directory. The file is user-only (`0600`) inside a user-only directory (`0700`). It stores evidence metadata and paths, not user file contents.

`--ephemeral` keeps the incident store in memory only.
