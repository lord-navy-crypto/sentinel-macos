# Sentinel 2.4 — 5-minute Click Guide

## 1. Launch Sentinel

For a clean installed build, open **Sentinel Mac** from `/Applications`.

For development:

```bash
./build-desktop-macos.sh
open dist/Sentinel.app
```

Sentinel starts one architecture-matched Go engine bound only to `127.0.0.1`. Browser and native App View load the same authenticated Sentinel 2.4 product.

---

## 2. First click: Orient → Status

Click **Orient**, then **Status**.

Read the current instruments first.

Click **Run Snapshot** when you want a fresh bounded read-only observation.

Click **Refresh posture** when you want current posture/readiness evidence without forcing a new Case correlation pass.

Remember: review pressure is not malware probability.

---

## 3. Something looks unfamiliar: Investigate

Click **Investigate**.

### Cases

Click **Cases** to see Story → Episode → Evidence correlations.

Useful clicks:

- **Rebuild correlations** — recompute Case Stories from retained evidence;
- **Refresh** — reload the current model;
- **Export JSON** — export one Case episode;
- **Object Story** — continue from the exact primary object/path.

Open **Explain why this is grouped** before drawing conclusions.

### Relations

Click **Relations** for Graph 2.0 and grouped time evidence.

- **Capture evidence** — record a fresh bounded intelligence capture;
- **Refresh** — reload current graph/timeline state;
- select a graph node — continue into object context when possible.

### Object

Click **Object** when you know the exact path and need identity/signing/hash/provenance evidence.

---

## 4. The question is “what changed?”: Compare

Click **Compare**.

- **Changes** — live bounded Change Monitor plus retained System Checkpoints;
- **Behavior** — compare adjacent compact observations;
- **Reference** — compare against a Trusted Profile you explicitly approved.

For System Checkpoints, capture at least two explicit checkpoints, choose From/To, then compare.

A change is evidence of difference, not evidence of danger.

---

## 5. Direct machine evidence: System

### Processes

Click **System → Processes**.

Click **Explain** on a process row to continue into process/object context.

### Auto-start

Click **System → Auto-start**.

This connects:

**plist → executable target → current process match**

- **Refresh launch evidence** — reload;
- **Explain** — open configuration/target/runtime evidence in Context.

### Network

Click **System → Network**.

- **Refresh current** — reload current TCP evidence only;
- **Capture history snapshot** — explicitly retain normalized relationship metadata;
- choose two snapshots and **Compare** — show added/absent relationships;
- **Explain** — continue from an owning process.

Refreshing current Network evidence does not automatically create history.

### Storage

Click **System → Storage**.

Choose scope, minimum file size, and result limit, then click **Measure storage**.

Watch the Activity bar for real Traverse / Measure / Hash / Report progress.

Click **Cancel** if needed.

Exact duplicates require SHA-256 agreement. Filename/version families remain heuristics.

---

## 6. Need to change something: Act

### Reclaim

Click **Act → Reclaim** for review only. Sentinel does not automatically delete files.

### Safe Change

Click **Act → Safe Change**.

Read **Recovery readiness** first.

For a mutation:

1. select the exact target;
2. Preview;
3. review consequences;
4. enter the required phrase;
5. enter the one-time code;
6. acknowledge;
7. execute only after server-side revalidation.

Supported bounded actions include Reveal, Rename, Vault, and Restore. There is no permanent-delete API.

---

## 7. Unsure what Sentinel can see: Limits

Click **Limits → Visibility** to see available/limited/unavailable evidence sources.

Click **Limits → Model** for interpretation rules.

Missing evidence lowers confidence. It does not prove absence or safety.

---

## Three common workflows

### Unfamiliar app/file

**Status → Run Snapshot → Cases → Relations → Object Story → Object → Safe Change only if justified**

### Unexpected network activity

**Network → Refresh current → Explain process → Capture history snapshot → later Compare → Relations/Object Story**

### Storage pressure

**Storage → Measure storage → History/Aging → Reclaim review**

---

## What should we build next?

The highest-value next features are:

1. a more interactive Evidence Graph with filters, neighborhood expansion, and time brushing;
2. first-class saved Investigation Sessions with notes/bookmarks/hypotheses;
3. a zoomable/filterable Global Timeline;
4. richer Process Story/ancestry;
5. a permission/visibility setup assistant;
6. Network relationship evolution over time;
7. Launch/Persistence drift history;
8. Storage forecasting and hot/cold evidence;
9. Safe Change recovery simulation before execution;
10. optional native notifications;
11. Endpoint Security integration only if entitlement/runtime requirements are genuinely satisfied;
12. an optional local evidence assistant that summarizes Sentinel evidence without inventing missing observations;
13. portable evidence bundles/reports.

The rule for future work: extend the current **Orient / Investigate / Compare / System / Act / Limits** product instead of creating another parallel dashboard.

For the complete click-by-click guide and development roadmap, see `GUIDE.md`.
