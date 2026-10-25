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
- The first UI uses a **plain-text PTY transcript**, not a fully standards-compliant terminal emulator. Shell state, prompts, basic ANSI-colors stripping and interactive line input work; full-screen programs with cursor control (e.g. vim/tmux/curses apps), advanced terminal keybindings, split panes and multiplexer persistence are not yet supported correctly. Do not market as feature-parity with Terminal.app/iTerm2.
- Users may invoke shell commands that modify their systems, therefore launch and modification confirmation are deliberately explicit. Homebrew third-party packages may run installer scripts; Sentinel does not audit or guarantee their safety.

## Actual verification gates
1. TSC and Vitest for safe package-name validation, no shell interpolation, preset actions and bounded temporary output.
2. Browser Chromium: tool visible in sidebar/Home/All Tools, software-center UI discoverable, native Homebrew commands and package installation absent from browser-only preview.
3. Native macOS ARM64 + Intel: Rust PTY and Homebrew input-validation tests; successful Rust build; DMG packaging including pre-existing Go engine; no regression in office/Commons workflow.
4. **Physical acceptance still needed**: on actual user Mac, start shell, execute `pwd`, `sw_vers` and `cd`, confirm output; check brew status; inspect official `.pkg`; test package install only with user agreement. Verify shell shutdown, no transcript on restart, and correct macOS permission prompts.

## Source references
- [WezTerm portable PTY](https://docs.rs/portable-pty/latest/portable_pty/)
- [Homebrew installation](https://docs.brew.sh/Installation)
- [Homebrew's maintained installer README](https://github.com/Homebrew/install/blob/main/README.md)
- [Tauri shell permission model](https://v2.tauri.app/reference/javascript/shell/)
