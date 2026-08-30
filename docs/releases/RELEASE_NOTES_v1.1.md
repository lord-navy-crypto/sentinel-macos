# Sentinel macOS v1.1 — Deep Search & Weakness Audit

## Highlights

- **Power Search 2.0** — query filters, quoted phrases, fuzzy ranking, match scores, matched fields, and `why_matched` explanations.
- **Deep filename search** — opt-in bounded filename/path walk inside Home scopes; no file contents and no symlink following.
- **Weakness Audit** — evaluates Sentinel's current defensive posture and blind spots rather than pretending to diagnose malware from missing evidence.
- **Visibility Coverage** — available/limited/unavailable/advanced-required evidence layers.
- **localhost request hardening** — Host, Origin, and Fetch Metadata guards in addition to the session token.
- **stricter CSP** — removed the old inline-style exception by converting dynamic meters to native progress elements.
- **system-command timeout cleanup** — remaining `lsof`, `codesign`, `plutil`, and Finder-reveal calls now use bounded execution helpers.
- **report integration** — full reports include Coverage + Weakness; low-sensitivity diagnostics include only summary counts/posture.
- **stronger guides** — dedicated Power Search and Weakness/Visibility documentation.

## Search examples

```text
kind:process chrome
kind:startup severity:review
pid:1234
endpoint:public safari
path:downloads zip
"Google Chrome"
```

Search score is relevance, not risk.

## Known boundary

V1.1 still does not install FSEvents persistence monitoring or an Endpoint Security System Extension. Those are intentionally separate future layers.
