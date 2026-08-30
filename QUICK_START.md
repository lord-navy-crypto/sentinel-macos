# Sentinel 2.4 — 5-minute Quick Start

## 1. Launch Sentinel

For the macOS app build:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

Sentinel starts one architecture-matched Go engine bound only to `127.0.0.1` on a random port. The launcher can open the same authenticated Sentinel 2.4 product in either your default browser or the native App View.

For development you can also use:

```bash
./RUN_SENTINEL.command
```

Use `--ephemeral` only when you intentionally want an isolated session without persistent comparison/recovery state. Mutating Safe Actions are disabled in ephemeral mode.

## 2. Orient

Start in **Orient → Status**.

Read the current machine/runtime instruments and Sentinel readiness before interpreting security evidence. Missing permissions or unavailable macOS tools reduce visibility; Sentinel does not replace missing evidence with guesses.

Then open **Orient → Snapshot** or press **Run Snapshot**.

Snapshot is a bounded read-only observation. Its Attention Index and review queue answer **where to inspect next**, not whether the Mac is infected.

## 3. Investigate only what needs explanation

Use **Investigate** when a snapshot, change, or exact object deserves more context:

- **Cases** — correlated evidence stories.
- **Search** — current evidence plus explicit bounded filename/path search.
- **Relations** — startup → file → process → endpoint relationships and observed time.
- **Audit** — evidence prioritized for review.
- **Object** — exact-path integrity, signing, Gatekeeper, hash, and provenance context.

A relationship, signature, public endpoint, priority score, or confidence score is evidence—not a malware verdict.

## 4. Compare when the question is “what changed?”

Use **Compare** for state over time:

- **Changes** — focused Change Monitor scope.
- **Behavior** — current observation versus the previous compact behavior state.
- **Reference** — current state versus a Trusted Profile you explicitly approved.

If Change Monitor reports a continuity/rescan condition, treat the stream as incomplete until reconciliation/current-state review establishes a fresh bounded view.

## 5. Use System for direct machine evidence

**System** contains the current machine, process, auto-start, persistence, background, network, and storage lenses.

Storage measurement is cancellable and reports real backend progress. Exact duplicates require SHA-256 agreement; filename/version families remain separate heuristics.

## 6. Act only when the evidence supports it

**Act → Reclaim** is a review surface. It does not automatically delete files.

**Act → Safe Change** separates mutation from observation. Supported operations remain deliberately bounded and reversible where applicable:

- Reveal in Finder;
- Rename without overwrite;
- move an eligible file to Sentinel Vault;
- restore through the recorded recovery path.

A mutating Safe Action requires a fresh server preview, consequences review, exact confirmation phrase, one-time code, acknowledgement, and server-side revalidation.

Sentinel has no permanent-delete API.

## 7. Know the visibility boundary

Use **Limits → Visibility** to see what evidence sources are available, limited, or unavailable.

Use **Limits → Model** for Sentinel's interpretation rules:

- attention/risk rank review work; they are not malware probability;
- signed does not mean safe;
- Gatekeeper acceptance is trust context, not proof of good intent;
- a Trusted Profile match is not permanent certification;
- missing evidence lowers confidence rather than becoming a safety signal.

## Specialist workspaces

A few deeper workspaces remain available for capabilities not yet collapsed into the primary 2.4 surface, including branching Investigation sessions, typed System Console queries, retained system/storage history, detailed network/process relationships, and Vault health. Their navigation returns to the same Sentinel 2.4 session; they are not a second product UI.

## Before packaging a Beta

Run:

```bash
go clean -testcache
go test ./...
bash SMOKE_TEST_LOCALHOST.command
```

Then build and test both Browser and App View from the exact release commit. See `DIRECT_DISTRIBUTION_GUIDE.md` for Beta and later Developer ID/notarization steps.
