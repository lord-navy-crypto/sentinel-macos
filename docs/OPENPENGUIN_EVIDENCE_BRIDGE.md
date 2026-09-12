# Sentinel × OpenPenguin Evidence Bridge

Sentinel can optionally use OpenPenguin as shared local-AI infrastructure without giving OpenPenguin authority over Sentinel evidence or actions.

## Authority model

```text
Sentinel observations > OpenPenguin interpretation
```

Sentinel remains authoritative for system observations, identity, timelines, hashes, signatures, network/process evidence, visibility limits, Safe Change preview/execution and recovery state.

OpenPenguin is advisory only.

## Transport

The Sentinel browser/WKWebView never connects directly to OpenPenguin.

```text
Sentinel UI
  ↓ same-origin API + X-Sentinel-Token
Sentinel Go engine
  ↓ fixed loopback target
OpenPenguin http://127.0.0.1:11436
  ↓
OpenPenguin private Ollama http://127.0.0.1:11435
```

Sentinel exposes two authenticated same-origin proxy routes:

```text
GET  /api/ai/openguin/status
POST /api/ai/openguin/advisory
```

The proxy target is fixed in source. It does not accept arbitrary URLs from the browser.

## Context schema

Sentinel wraps its existing bounded Evidence Packet as:

```text
sentinel.system-evidence-context/v1
```

Representative envelope:

```json
{
  "schema": "sentinel.system-evidence-context/v1",
  "source_app": {
    "name": "Sentinel",
    "role": "system-evidence-authority"
  },
  "generated_at": "...",
  "evidence_packet": {},
  "authority": {
    "observed_evidence": "Sentinel",
    "ai_output": "interpretation only",
    "actions": "Sentinel Safe Change approval path only"
  },
  "output_contract": [
    "OBSERVED",
    "INTERPRETATION",
    "UNKNOWN",
    "NEXT STEP"
  ],
  "boundary": "Evidence is not a verdict..."
}
```

The underlying Evidence Packet is still produced by Sentinel's existing `collectEvidencePacket()` logic. OpenPenguin does not independently crawl the machine.

## Frontend integration

`web/app/openguin-bridge.js` adds a separate **OpenPenguin Infrastructure** panel inside the Sentinel Assistant surface.

It intentionally does not replace or monkey-patch Sentinel's mature WebLLM assistant.

The two local paths remain explicit:

```text
Sentinel WebLLM
  - vendored runtime
  - WebGPU / Web Worker
  - independent fallback

OpenPenguin
  - shared local model infrastructure
  - model/runtime management outside Sentinel
  - reached through authenticated Sentinel proxy
```

If OpenPenguin is offline, Sentinel evidence collection and WebLLM continue to work.

## Safety rules

OpenPenguin responses for Sentinel must:

- remain advisory;
- return `executed: false`;
- separate OBSERVED / INTERPRETATION / UNKNOWN / NEXT STEP;
- never turn attention/risk/confidence/drift/novelty into malware probability;
- never invent paths, PIDs, hashes, signatures, endpoints, timestamps, intent or causal claims;
- never claim a command or Safe Change action was executed;
- prefer bounded read-only next steps.

The Sentinel Go proxy force-normalizes `executed` to false even if an upstream response is malformed and claims otherwise.

## Failure behavior

OpenPenguin is optional infrastructure, not a Sentinel availability dependency.

If capability discovery or advisory inference fails:

- the proxy reports the failure visibly;
- the UI identifies Sentinel WebLLM as the independent fallback;
- no cloud endpoint is selected automatically;
- no evidence or action state is mutated.

## Validation

`openguin_bridge_test.go` verifies:

- fixed loopback target `127.0.0.1:11436`;
- correct generic API and Sentinel context schema;
- wrong context schemas are rejected before proxying;
- upstream `executed:true` cannot cross the Sentinel boundary;
- method restrictions remain enforced.

Existing repository-wide `go test ./...`, race tests, vet and JS syntax validation should include the new bridge in the normal Sentinel quality gate.
