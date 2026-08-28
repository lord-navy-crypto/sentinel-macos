# Power Search Guide — Sentinel macOS V2.1

## Two search layers

### Power Search (⌘K)

Fast ranked search over **current bounded Sentinel evidence**:

- processes,
- startup items,
- network snapshot,
- active Vault entries,
- Unified Review Queue evidence,
- latest Storage scan results,
- an exact local path typed by the user.

It does not crawl the whole disk.

### Deep filename search

Explicit, bounded filename/path discovery inside a selected Home scope. It reads names and basic file metadata only; it never indexes file contents and does not follow symlinks.

Limits:

- scope must resolve inside the current user's Home,
- symlink-based scope escape is rejected,
- maximum 30,000 visited entries,
- approximately 3-second time budget,
- maximum 200 returned results.

## Query syntax

```text
kind:process chrome
kind:startup severity:review
kind:network endpoint:public
pid:1234
path:downloads zip
source:trust helper
"Google Chrome"
```

Supported filters:

| Filter | Meaning |
| --- | --- |
| `kind:` | process, startup, network, vault, file, review |
| `severity:` | high, review, info |
| `pid:` | exact process ID |
| `path:` | path/subtitle substring |
| `endpoint:` | e.g. public, private, listener, loopback |
| `source:` | evidence/source context |

Terms use AND-style matching: each free-text term must match at least one result field. Ranking favors title, then path, then subtitle, and supports small spelling errors for short tokens.

## Reading results

Each result exposes:

- a numeric ranking score,
- matched fields,
- a short `why_matched` explanation.

A high search score means **better query relevance**, not higher security risk.

## Privacy

Power Search does not create a persistent search index. Deep filename search is user-triggered, bounded, and local. Neither search mode reads document contents.


## V2.1 Incident search

Use `kind:incident` plus normal terms or severity filters, for example `kind:incident helper` or `kind:incident severity:review`. Incident search results use correlation confidence for search context but never treat it as malware probability.
