# Sentinel v2.3 Terminal Toolbox

Branch: `upgrade/v2.3-stable`

Status: development branch only. This document does not describe the stable `main` release.

## Goal

The Terminal Toolbox turns useful macOS command-line capabilities into visible, typed buttons inside Sentinel System Console.

It is intentionally **not** an arbitrary shell. Users can see which fixed macOS command backs a button, but they cannot concatenate commands, supply arbitrary flags, invoke `sudo`, or turn the web UI into a general-purpose terminal.

The product model is:

`macOS capability → fixed Sentinel tool definition → bounded execution → structured/raw evidence → related Sentinel workspace`

Mutating operations remain separate:

`typed Sentinel action → preview → dependency review → confirmation → execute → validate → journal → recover`

## Domain-first visual layout

System Console now reorganizes the catalog into large capability boxes rather than primarily grouping tools by abstract intent:

- **System & Hardware**
- **Security Posture**
- **Processes & Resources**
- **Startup & Services**
- **Network**
- **Storage & Disks**
- **Files & Metadata**
- **App Integrity**
- **Search & Spotlight**
- **Backup & Recovery Sources**
- **Power & Battery**
- **Bounded System Logs**
- **Persistence Configuration**
- **Change Intelligence**
- **Trust & Recovery**

A toolbox filter searches tool name, purpose, domain, intent, and fixed command preview.

Each read-only card shows the fixed Terminal command that Sentinel will execute, including placeholders such as `<PID>` or `<absolute-path>` where a validated target is required.

## Expanded read-only macOS adapters

In addition to the original process, filesystem, mount, power, route, metadata, signing, Gatekeeper, plist, path-size, and open-file tools, the v2.3 branch now includes fixed adapters for:

### System and hardware

- `system_profiler SPHardwareDataType`
- `uptime`
- `sysctl kern.boottime`
- `softwareupdate --history`
- `systemextensionsctl list`
- `profiles status -type enrollment`

### Processes

- extended `ps` state table
- visible listening TCP processes through fixed `lsof` arguments

### Storage, search, and backup

- `diskutil list`
- `diskutil apfs list`
- `system_profiler SPStorageDataType`
- `mdutil -s <absolute-path>`
- `tmutil status`
- `tmutil destinationinfo`

### Network

- `ifconfig -a`
- `scutil --dns`
- `scutil --proxy`
- `arp -a`
- fixed TCP socket table via `netstat`
- `networkQuality -c`

`networkQuality` is measurement-only but may generate temporary test traffic. It does not change persistent network configuration.

### Power and battery

- `pmset -g batt`
- `pmset -g assertions`
- `pmset -g custom`
- `system_profiler SPPowerDataType`

### Startup

- `launchctl list`

Only the read-only listing operation is exposed through the query runner. Arbitrary launchd mutation is not exposed as free-form Terminal execution.

### Security posture

- `spctl --status`
- `fdesetup status`
- `csrutil status`

Sentinel does not request FileVault recovery keys or credentials.

### Bounded predefined logs

- recent `syspolicyd` / Gatekeeper-related log window
- recent `powerd` log window

These are fixed short windows and fixed predicates. Sentinel does not expose unrestricted user-supplied `log` predicates as shell input.

## Managed control/workspace buttons

The same domain boxes can contain Sentinel-managed actions/workspaces, including:

- Launch & Service Explorer
- Network Relationship Explorer
- Intelligence Center
- Safe Action preview/execute
- Vault
- Action Journal
- Change reconciliation
- Trusted Profile restore

These entries never execute through the read-only Terminal query runner.

## Safety boundary

All read-only Terminal-backed buttons preserve the existing System Console execution contract:

- fixed executable selected by Sentinel;
- fixed base arguments selected by Sentinel;
- only validated absolute path or positive PID targets where required;
- `exec.CommandContext`, not `sh -c`;
- no `bash`, `zsh`, or arbitrary shell;
- no `sudo`;
- no arbitrary command concatenation;
- strict timeout, capped by the System Console maximum;
- bounded stdout/stderr capture;
- localhost session authentication and existing request/work gates;
- raw evidence retained below structured output for provenance;
- a non-zero exit or missing evidence is not converted into a malware verdict.

The catalog safety tests also reject duplicate tool IDs, forbidden shell/sudo commands, command-composition tokens in fixed arguments, and timeouts above the allowed maximum.

## UI contract

The Terminal Toolbox keeps the original question-first entry point:

**Start with a question, not a command.**

The broader visual toolbox sits underneath that layer. This gives Sentinel two complementary ways to use the same macOS capability set:

1. question-first investigation for normal users;
2. visible Terminal-backed buttons for users who want direct system tooling.

The result is not a hidden Terminal. It is a transparent, typed visual control plane over selected macOS capabilities.
