# Sentinel Better Terminal — Native PTY & Homebrew desktop (2026-10-25)

## Actual implemented functionality
- New **Better Terminal** standalone Sentinel system tool, visible on Home, sidebar, All Tools and global command search. Three modes: Terminal, Homebrew GUI, Mac quick actions.
- **Real macOS PTY**, not a mock screenshot. Rust uses wezterm's `portable-pty` to launch local `/bin/zsh -l -i` (fallback `/bin/bash`), allows typed commands, Ctrl+C, resize, a bounded 160,000-character transient output view, close/terminate. `cd` and shell state persist **within that one session**.
- **Homebrew software center** detects a Homebrew installation only at standard binary paths. Users can switch between macOS apps (**Casks**) and CLI tools (**Formulae**), search, inspect package details, browse installed items, and install/upgrade/uninstall individual packages from the GUI without opening the interactive terminal.
- Package-changing operations use a separate confirmation dialog and a native Rust `std::process::Command` with fixed argument arrays—package names are never interpolated into a shell script. Names and search input are validated; executable path is only chosen from fixed known Homebrew prefixes. A single job is allowed at once; stdout/stderr stream to a bounded temporary UI log and the user can request cancellation of the dedicated process group. Homebrew index updates are explicit so package installs do not unexpectedly start a hidden index refresh.
- Homebrew runs in the current app user's context. The GUI does not collect or cache administrator passwords, does not bypass macOS approval, and does not guarantee every third-party package is safe. Some installers may require a TTY or additional user interaction; these cases can fail and require manual completion.
- **Official Homebrew installation**: Apple Silicon has a graphical `.pkg` available from Homebrew/brew's official GitHub release, and Homebrew publishes [authoritative install documentation](https://docs.brew.sh/Installation). The GUI opens those **official pages**. The user chooses the appropriate official installer, then macOS Installer handles approval and any administrative confirmation. We do not silently run a downloaded Bash script. On Intel, users should consult official supported installation methods.
- Quick Mac actions: `sw_vers`, `xcode-select -p`, `df -h`, `pwd`, and Homebrew's read-only info operations. These only execute on user click when the terminal is active.

## Security and correctness contract
- **No universal Terminal permission exists.** The child login shell executes as the current macOS user, subject to user account privileges, app sandbox, TCC/FDA, system permissions and app code-signing rules. Original Sentinel Go's permissions are independent and do not grant this terminal arbitrary new access.
- All terminal Tauri commands verify they are invoked **from the main Sentinel Box window**. PTY output events are sent **only to that window**, not broadcast to the original Sentinel's separate WebView.
- Arbitrary shell text can of course be used **only in the user-entered Terminal tab**; programmatic presets are static and action buttons require direct interaction. No shell auto-executes on workspace mount, no remote execution mode, no escalation, no sudo automation, no background commands when closing the terminal page.
- The transcript remains session-only (not saved, uploaded or put in the existing workspace backup); closing the tab terminates the shell, and closing main application kills the managed child.
- The native PTY now renders through the official **xterm.js 6.0.0 ANSI/VT emulator**, bundled locally rather than fetched from a CDN. The display preserves escape sequences, color, cursor positioning, alternate-screen terminal programs, keyboard events and scrollback; FitAddon resizes the Rust PTY to the visible terminal geometry. Interactive CLI tools can be exercised on the actual Mac, but physical compatibility with every full-screen or mouse-driven program is not guaranteed. Split panes, saved sessions, native shell autocomplete beyond what the user's shell supports and iTerm2-style advanced integrations remain future work.
- Users may invoke shell commands that modify their systems, therefore launch and modification confirmation are deliberately explicit. Homebrew third-party packages may run installer scripts; Sentinel does not audit or guarantee their safety.

## Actual verification gates
1. TSC and Vitest for safe package-name validation, no shell interpolation, preset actions and bounded temporary output; lockfile/pinned packages support reproducible native xterm.js builds.
2. Browser Chromium: tool visible in sidebar/Home/All Tools, real xterm DOM mounted and resizable, software-center UI discoverable, native Homebrew commands and package installation absent from browser-only preview.
3. Native macOS ARM64 + Intel: Rust PTY and Homebrew input-validation tests; successful Rust build; DMG packaging including pre-existing Go engine; no regression in office/Commons workflow.
4. **Physical acceptance still needed**: on actual user Mac, start shell, execute `pwd`, `sw_vers` and `cd`, confirm output; check brew status; inspect official `.pkg`; test package install only with user agreement. Verify shell shutdown, no transcript on restart, and correct macOS permission prompts.

## Source references
- [WezTerm portable PTY](https://docs.rs/portable-pty/latest/portable_pty/)
- [Homebrew installation](https://docs.brew.sh/Installation)
- [Homebrew's maintained installer README](https://github.com/Homebrew/install/blob/main/README.md)
- [Tauri shell permission model](https://v2.tauri.app/reference/javascript/shell/)

## ANSI/VT renderer upgrade
- Browser-side xterm.js handles terminal **presentation and user keystrokes only**. Rust's main-window-protected native PTY continues to own shell process lifecycle, permissions and byte streams. No new remote shell, privilege escalation or terminal permissions were introduced.
- The terminal screen remains mounted while switching between the software center and console so its scrollback and alternate-screen state survive tabs. Closing the Better Terminal workspace still stops the managed local shell.
- A bounded plain-text mirror is retained in memory for the existing explicit 'Copy output' action. ANSI styling is not preserved in the copied text. Neither this mirror nor xterm scrollback is persisted to storage.
- Official documentation: https://xtermjs.org/docs/guides/using-addons/ and https://github.com/xtermjs/xterm.js


## Software updates and background task history (2026-10-25)

- The Homebrew software center can check outdated Casks or Formulae separately, list the exact returned package names, upgrade one selected item, or request a confirmed upgrade of the current category. Switching categories clears the previous category's update results so an old list cannot be mistaken for the active category.
- The index update, single-package changes and category-wide upgrade remain explicit, confirmed actions. A single Homebrew mutation runs at a time; live stdout/stderr stays in the current operation panel, with cancellation targeting that operation's process group. The software-center view remains mounted while switching between Better Terminal tabs, so an active job and its in-memory history are not discarded just by opening the terminal or guide tab. Leaving the entire Better Terminal workspace still cancels the active job.
- Added a compact recent-task history (last eight completed tasks) for success, failure or requested cancellation, completion time, duration and exit code. It is memory-only for the current UI session; raw logs and package output are not persisted. The UI deliberately does not invent a percentage for Homebrew operations because Homebrew does not provide a stable, general progress percentage.
- New pure helper tests cover task outcome classification, duplicate-resistant bounded history, duration formatting and operation results. Browser preview checks that update checks remain disabled outside the native macOS app.

### Additional acceptance checks

1. Switch repeatedly between Casks and Formulae; confirm outdated results never carry over from the previous category.
2. Check updates, inspect the exact outdated list, and verify both per-item and bulk-upgrade confirmations before execution.
3. Cancel a long-running operation and verify the task status reflects the requested cancellation and the process exits; inspect the bounded task history.
4. Confirm that reopening the app does not restore task history or previous command output.
5. Confirm that no update or install runs automatically when the software center opens.


## Sentinel Box product shell and built-in modules (2026-10-25)

- Sentinel Box remains the single application, dashboard, navigation shell and tool catalog. Sentinel and Better Terminal are peer built-in modules, not separate products or separately launched applications.
- The dashboard presents two clear primary module cards: Sentinel system observability/security, and Better Terminal's native PTY plus Homebrew software center. A direct dashboard action can open the Homebrew tab without making the terminal a separate app.
- Sentinel specialist workbenches (investigation, comparison, processes/network, diagnostics/actions, and permissions/runtime) remain subordinate links within the same module section. They also remain discoverable through the sidebar, global command search and All Tools catalog.
- Acceptance checks must confirm the dashboard shows both primary modules, that the Homebrew action opens the correct Better Terminal mode, and that Sentinel opens inside the same Box shell without adding duplicate navigation entries.


## Background task lifetime across Sentinel Box workspaces

- The Better Terminal component is first mounted only after explicit entry. After that, the Box keeps it mounted while the user navigates to Dashboard, Sentinel, or other workspaces. In-flight Homebrew operations and PTY state are therefore not destroyed on ordinary workspace switches.
- Reopening the module through the Dashboard Homebrew shortcut selects the software-center tab without replacing or restarting the existing manager. A newly opened Box instance still requires explicit user action to start a terminal or any package mutation.
- The native app's main-window destruction handler terminates managed Homebrew and PTY processes. The user can still manually cancel Homebrew or stop the PTY from within the module. Background tasks are not persisted after closing the app.


## Search, confirmation, and operation-state UI pass (2026-10-25)

- Search results now carry their own submitted query label. Starting a new search clears the prior result list before the request begins, so stale packages cannot appear under a new query. Searching, successful results, zero matches, and failed searches have distinct accessible feedback states.
- Package changes use a dedicated confirmation panel with a visible waiting-confirmation state, a target-specific command preview, explicit confirm/cancel controls, and the existing fixed-argument execution boundary.
- The operation panel exposes distinct starting, running, cancelling, success, failed, and cancelled states. The live log remains visible, cancellation is only offered once a task ID is available, and the interface does not invent a percentage for Homebrew's non-uniform progress output.
- HomebrewWorkflowPanels.test.tsx renders the actual UI panels and checks search feedback, all task phases, visible log output, cancellation availability, confirmation contents, and disabled confirmation behavior. These tests run through the existing Vitest suite; the standard browser workflow also runs TypeScript build and the complete test suite.


## Connected search-to-result workflow pass (2026-10-25)

- Added a four-step workflow indicator: Find software → Confirm operation → Execute and inspect logs → Review outcome and task history. It follows the user's current action rather than guessing progress from an older task state.
- Search feedback now names the active Homebrew category (Mac apps / Cask or command-line tools / Formula), so the submitted query and category are visible together in empty, success, and failure states.
- Added render regression coverage for each workflow step and category-aware search feedback. Existing confirmation safety, cancellation controls, logs, and task history remain in place.


## Visual status overview and result-action grouping (2026-10-25)

- Added a three-card Homebrew status overview for native connection readiness, installed-package count, and update-check state. It distinguishes browser preview, missing Homebrew, connection setup, loading, unchecked updates, current software, and stale-category update counts without presenting guesses as live state.
- Search result actions now share a responsive action group. Installed/available/outdated labels use explicit state styling, while details, install, upgrade and uninstall controls remain visible and individually actionable.
- Added component regression tests for connected, preview, missing, connecting, loading, unchecked, checking, current and outdated states.
