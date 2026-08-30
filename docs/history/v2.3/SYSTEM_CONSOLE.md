# Sentinel v2.3 System Console — Visual macOS Control Plane

Branch: `upgrade/v2.3-stable`

Status: development branch only. This document does not describe a `main` release.

## Product goal

Sentinel should make macOS itself easier to understand, investigate, control, and recover without requiring the user to memorize Terminal commands first.

The System Console is not intended to be a browser-based arbitrary shell. It is a visual control plane over bounded, explicit macOS evidence and Sentinel's existing reversible action workflows.

The user-facing model is:

1. **Understand** — What is running, mounted, consuming space, or configured?
2. **Investigate** — What is this object, process, route, signature, plist, or relationship?
3. **Control** — What can I safely change after preview and confirmation?
4. **Recover** — What was changed, how can it be restored, and what recovery evidence exists?

## Question-first design

Users should be able to begin with questions such as:

- What is running right now?
- Where is disk capacity going?
- What volumes are mounted?
- How is this Mac routing traffic?
- What power settings are active?
- What is this app or file?
- What is this process using?
- Why might macOS reject this app?
- Why did this application start automatically?
- What changed on this Mac since yesterday?
- What can I safely undo?

Sentinel may use macOS command-line utilities internally, but the product should expose objects, relationships, evidence, explanations, and safe actions rather than requiring users to construct command strings.

## Implemented foundation

### System Console catalog

The v2.3 branch now defines typed tool metadata with:

- stable tool ID;
- user-facing name and purpose;
- `understand`, `investigate`, `control`, or `recover` intent;
- evidence domain;
- read-only versus Sentinel-managed mode;
- explicit target kind (`path`, `pid`, or none);
- fixed executable and fixed base arguments for read-only tools;
- availability detection;
- per-tool timeout;
- explicit safety description.

### Current bounded read-only evidence sources

The first allowlist includes:

- process table (`ps`);
- mounted filesystem usage (`df`);
- mount table (`mount`);
- power settings (`pmset`);
- software profile (`system_profiler`);
- route table (`netstat`);
- Spotlight/file metadata (`mdls`);
- extended attributes (`xattr`);
- code-signing details (`codesign`);
- Gatekeeper assessment (`spctl`);
- property-list inspection (`plutil`);
- path-size inspection (`du`);
- process open-file/socket inspection (`lsof`).

These tools are evidence sources, not security verdicts.

### Execution boundary

Read-only System Console queries follow these rules:

- no arbitrary command text;
- no shell invocation;
- no `sudo` path;
- executable comes from the internal allowlist;
- arguments are constructed by Sentinel;
- target validation accepts only an absolute path or a positive PID where required;
- execution uses a context timeout;
- output is bounded;
- stdout and stderr are captured as local evidence;
- a normal non-zero tool result can be returned as reviewable evidence instead of being converted into a malware conclusion;
- the request remains inside Sentinel's localhost token/auth/request-guard boundaries.

### Mutation boundary

The System Console command runner must not become a second mutation engine.

Mutating workflows remain routed through Sentinel's existing systems:

- Safe Action preview;
- typed confirmation and one-time code;
- object revalidation;
- action journal;
- Vault;
- restore;
- change reconciliation;
- Trusted Profile restore.

This preserves one safety model instead of creating hidden administrative shortcuts.

### Unified object inspection

The branch now includes a path-based object inspection entry point.

For an object, Sentinel can combine applicable evidence including:

- filesystem metadata;
- object type and file mode;
- modification time;
- Spotlight metadata;
- extended attributes/quarantine context;
- code-signing evidence;
- Gatekeeper assessment;
- plist structure for plist files.

The next step is to merge this evidence with Object Story 2.0, Incident membership, Trust/Behavior history, persistence references, process observations, network observations, and the investigation timeline.

### Ask the Mac UI

`web/system-console.html` is a separate v2.3 development surface linked from the existing Sentinel sidebar.

It provides:

- the four product pillars;
- question-first investigation recipes;
- a unified object inspector;
- visual cards for available system evidence tools;
- explicit availability and safety state;
- bounded output display;
- visible limitations;
- links back to Sentinel-managed Control/Recover workflows.

It intentionally remains separate from the legacy SPA navigation while the v2.3 control-plane information architecture stabilizes.

## API foundation

The current branch exposes authenticated local routes:

- `GET /api/system/console` — catalog and capability metadata;
- `POST /api/system/query` — run one allowlisted read-only query;
- `POST /api/system/object/inspect` — aggregate bounded evidence for one absolute path.

These routes run under the existing localhost session token and work gate.

## Testing contract

The v2.3 test suite must enforce that:

- read-only and managed tools remain distinct;
- managed actions cannot execute through the command runner;
- relative paths and malformed PIDs are rejected;
- output stays bounded;
- System Console routes and UI assets remain wired;
- the backend does not introduce shell execution or `sudo`;
- the System Console UI does not introduce dynamic-code execution;
- CI syntax-checks every Sentinel JavaScript surface.

## Next expansion — structured system intelligence

Raw command output is only the first adapter layer. The long-term product should convert system evidence into typed Sentinel objects.

### 1. Structured parsers

Add bounded parsers for selected evidence sources so the UI can render fields and relationships rather than only terminal text.

Examples:

- process rows → PID/process objects;
- routes → interface/gateway/route objects;
- mounts → volume objects;
- signing output → identity/team/signing-state fields;
- Gatekeeper → assessment evidence;
- plist output → launch/persistence relationships;
- `lsof` → process-file and process-endpoint relationships.

Always preserve access to the raw evidence behind a parsed result.

### 2. Launch & Service Explorer

Build a visual answer to: **Why does this start automatically?**

Correlate:

- LaunchAgents;
- LaunchDaemons;
- Login Items/background registrations;
- executable target;
- signing identity;
- first/last observed time;
- currently running processes;
- related filesystem changes;
- incidents and reason codes.

### 3. Process Relationship Explorer

Build a visual process page with:

- PID / PPID;
- parent-child relationships;
- executable identity;
- open files;
- network endpoints;
- startup/persistence source;
- object story;
- trust/behavior history;
- related incidents.

### 4. Network Relationship Explorer

Normalize current local evidence into:

- process → socket → endpoint relationships;
- interface / route context;
- first/last observed endpoint;
- bounded endpoint history;
- related object/incident context.

A connection alone must never be described as malicious.

### 5. Visual Logs / Event Recipes

Add bounded, predefined log queries for diagnostic questions such as:

- recent app launch failures;
- recent crash evidence;
- selected Gatekeeper/signing messages;
- selected power/sleep/wake transitions;
- selected storage/mount events.

Do not expose an unbounded arbitrary log-query shell as the default UX.

### 6. System Snapshot & Diff

Create a first-class snapshot model for selected system objects and compare snapshots over time:

- processes;
- startup/persistence;
- mounts;
- storage;
- selected network relationships;
- signing/identity state;
- permissions/visibility.

This should answer: **What changed on this Mac since the previous snapshot?**

### 7. Recovery Center 2.0 integration

Bring Sentinel-owned recovery state into the same control plane:

- previous shutdown;
- interrupted jobs;
- `.bak` recovery;
- action journal;
- Vault health;
- change checkpoint/reconciliation state;
- Incident history;
- Storage history.

### 8. Object Story 2.0 integration

The final object experience should combine System Console evidence with the existing Sentinel intelligence model so a user can answer in one place:

- What is this?
- When did Sentinel first see it?
- What changed?
- What launched it?
- What is it connected to?
- What does macOS say about its identity?
- Why does Sentinel want me to review it?
- What is still unknown?
- What reversible action is available?

### 9. Universal Command Palette / Ask the Mac

Extend the existing global search into question/intent navigation without introducing free-form shell execution.

Examples:

- `process 812`
- `inspect /Applications/App.app`
- `why startup AppName`
- `storage growth`
- `recent changes`
- `vault health`
- `incident <id>`

The command palette should resolve into typed Sentinel operations, not concatenate input into a shell command.

### 10. Investigation bundle export

Export selected evidence, timelines, reason codes, object relationships, and system-query metadata as a bounded local investigation bundle without exporting unrelated private file contents.

## Non-goals

The following are explicitly not goals for the normal System Console:

- arbitrary `sh`, `bash`, or `zsh` execution;
- a web-exposed `sudo` terminal;
- arbitrary command concatenation;
- automatic malware verdicts from one command result;
- automatic destructive remediation;
- hidden mutation outside Safe Actions;
- cloud-required administration.

## Release acceptance direction

Before System Console becomes part of a stable Sentinel release:

- all current read-only tools must pass unit/contract tests;
- every mutating control must remain routed through Sentinel's existing preview/recovery safety boundary;
- each supported evidence source must expose availability/limitations;
- structured parsers must preserve raw evidence provenance;
- long-running queries must remain cancellable or timeout-bounded;
- the UI must remain usable without Terminal knowledge;
- the main Sentinel and System Console information architecture must eventually converge without duplicating contradictory views.
