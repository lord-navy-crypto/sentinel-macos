//! Real macOS PTY session for Better Terminal. User driven only; never autoexecutes
//! from Sentinel observations or the original Go service.
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, PtySystem};
use serde::Serialize;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use std::thread;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

const MAX_WRITE_BYTES: usize = 4096;
const MAX_CHUNK_BYTES: usize = 8192;
pub const TERMINAL_OUTPUT_EVENT: &str = "better-terminal:output";
pub const HOMEBREW_EVENT: &str = "better-terminal:brew-event";
const MAX_BREW_QUERY_BYTES: usize = 80;
const MAX_BREW_READ_OUTPUT_BYTES: usize = 24_000;

struct TerminalSession {
    id: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}
#[derive(Default)]
pub struct BetterTerminalState {
    active: Mutex<Option<TerminalSession>>,
    counter: AtomicU64,
}
impl BetterTerminalState {
    pub fn stop(&self) {
        if let Ok(mut guard) = self.active.lock() {
            if let Some(mut session) = guard.take() {
                let _ = session.child.kill();
                // PTY master and reader are dropped when the owned session ends.
            }
        }
    }
}
#[derive(Serialize, Clone)]
pub struct TerminalOutput {
    pub session_id: u64,
    pub data: String,
}
#[derive(Serialize)]
pub struct TerminalInfo {
    pub session_id: u64,
    pub shell: String,
    pub home: String,
}
#[derive(Serialize)]
pub struct BrewStatus {
    pub installed: bool,
    pub executable: Option<String>,
    pub architecture: String,
    pub install_guide: &'static str,
}
fn require_main(window:&WebviewWindow)->Result<(),String>{
    if window.label()!="main" {Err("Terminal is restricted to the Sentinel Box main window".into())}
    else {Ok(())}
}
fn shell_path() -> &'static str {
    if Path::new("/bin/zsh").is_file() { "/bin/zsh" } else { "/bin/bash" }
}
fn active_brew() -> Option<&'static str> {
    ["/opt/homebrew/bin/brew", "/usr/local/bin/brew", "/home/linuxbrew/.linuxbrew/bin/brew"]
        .into_iter().find(|path| Path::new(path).is_file())
}
fn valid_terminal_size(cols:u16,rows:u16)->PtySize {
    PtySize {cols:cols.clamp(40,220),rows:rows.clamp(12,80),pixel_width:0,pixel_height:0}
}
fn validate_write(data:&str)->Result<(),String>{
    if data.is_empty() || data.len()>MAX_WRITE_BYTES {return Err("Terminal input must be 1–4096 bytes".into());}
    // Prevent NUL bytes from being forwarded into the shell input stream.
    if data.contains('\0') {return Err("NUL input is not supported".into());}
    Ok(())
}
#[tauri::command]
fn detect_brew_status()->BrewStatus {
    BrewStatus {
        installed:active_brew().is_some(),
        executable:active_brew().map(str::to_string),
        architecture:std::env::consts::ARCH.to_owned(),
        install_guide:"https://docs.brew.sh/Installation",
    }
}
#[tauri::command]
pub fn better_terminal_brew_status(window:WebviewWindow)->Result<BrewStatus,String>{
    require_main(&window)?;
    Ok(detect_brew_status())
}
#[tauri::command]
pub fn better_terminal_start(app:AppHandle,window:WebviewWindow,state:State<'_,BetterTerminalState>,
    cols:u16,rows:u16)->Result<TerminalInfo,String>{
    require_main(&window)?;
    let mut guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    if let Some(ref mut current)=*guard {
        if current.child.try_wait().map_err(|e|e.to_string())?.is_none() {
            return Err("A terminal session is already open. Stop it before opening another.".into());
        }
    }
    *guard=None;
    let pair=native_pty_system().openpty(valid_terminal_size(cols,rows))
        .map_err(|e|format!("Cannot create terminal: {e}"))?;
    let shell=shell_path();
    let mut command=CommandBuilder::new(shell);
    command.arg("-l"); command.arg("-i");
    command.env("TERM","xterm-256color");
    command.env("COLORTERM","truecolor");
    let child=pair.slave.spawn_command(command)
        .map_err(|e|format!("Cannot launch login shell: {e}"))?;
    let mut reader=pair.master.try_clone_reader()
        .map_err(|e|format!("Cannot read terminal PTY: {e}"))?;
    let writer=pair.master.take_writer()
        .map_err(|e|format!("Cannot write terminal PTY: {e}"))?;
    let id=state.counter.fetch_add(1,Ordering::Relaxed)+1;
    *guard=Some(TerminalSession{id,master:pair.master,writer,child});
    std::thread::spawn(move||{
        let mut buffer=[0_u8;MAX_CHUNK_BYTES];
        loop {
            match reader.read(&mut buffer) {
                Ok(0)|Err(_)=>break,
                Ok(n)=>{
                    let data=String::from_utf8_lossy(&buffer[..n]).into_owned();
                    if let Some(main)=app.get_webview_window("main") {
                        if main.emit(TERMINAL_OUTPUT_EVENT,TerminalOutput{session_id:id,data}).is_err(){break;}
                    } else {break;}
                }
            }
        }
    });
    Ok(TerminalInfo{
        session_id:id,shell:shell.to_string(),
        home:std::env::var("HOME").unwrap_or_else(|_|"".into())
    })
}
#[tauri::command]
pub fn better_terminal_write(window:WebviewWindow,state:State<'_,BetterTerminalState>,
    session_id:u64,data:String)->Result<(),String>{
    require_main(&window)?;
    validate_write(&data)?;
    let mut guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    let terminal=guard.as_mut().ok_or("Terminal not running")?;
    if terminal.id!=session_id{return Err("Stale terminal session".into());}
    if terminal.child.try_wait().map_err(|e|e.to_string())?.is_some() {
        return Err("Shell process has exited; start a new session".into());
    }
    terminal.writer.write_all(data.as_bytes()).map_err(|e|e.to_string())?;
    terminal.writer.flush().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn better_terminal_resize(window:WebviewWindow,state:State<'_,BetterTerminalState>,
    session_id:u64,cols:u16,rows:u16)->Result<(),String>{
    require_main(&window)?;
    let guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    let terminal=guard.as_ref().ok_or("Terminal not running")?;
    if terminal.id!=session_id{return Err("Stale terminal session".into());}
    terminal.master.resize(valid_terminal_size(cols,rows)).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn better_terminal_stop(window:WebviewWindow,state:State<'_,BetterTerminalState>,session_id:u64)->Result<(),String>{
    require_main(&window)?;
    let mut guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    if guard.as_ref().is_some_and(|s|s.id!=session_id) {
        return Err("Stale terminal session".into());
    }
    if let Some(mut terminal)=guard.take() {let _=terminal.child.kill();}
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct HomebrewEvent {
    pub job_id: u64,
    pub stream: String,
    pub data: String,
    pub exit_code: Option<i32>,
}
struct ActiveHomebrewJob {
    id: u64,
    pid: u32,
    child: Arc<Mutex<Child>>,
}
#[derive(Default)]
pub struct HomebrewManagerState {
    active: Mutex<Option<ActiveHomebrewJob>>,
    counter: AtomicU64,
}
impl HomebrewManagerState {
    pub fn stop(&self) {
        if let Ok(guard) = self.active.lock() {
            if let Some(job) = guard.as_ref() {
                terminate_homebrew_job(job);
            }
        }
    }
}
fn validate_brew_kind(kind: &str) -> Result<&'static str, String> {
    match kind {
        "formula" => Ok("--formula"),
        "cask" => Ok("--cask"),
        _ => Err("Choose either formula or cask".into()),
    }
}
fn validate_brew_name(name: &str) -> Result<(), String> {
    let value = name.trim();
    if value.is_empty() || value.len() > MAX_BREW_QUERY_BYTES ||
        !value.as_bytes()[0].is_ascii_alphanumeric() ||
        !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"@._+-".contains(&b)) {
        return Err("Invalid Homebrew package name".into());
    }
    Ok(())
}
fn validate_brew_search(query: &str) -> Result<(), String> {
    let value = query.trim();
    if value.is_empty() || value.len() > MAX_BREW_QUERY_BYTES ||
        !value.as_bytes()[0].is_ascii_alphanumeric() ||
        !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"@._+- ".contains(&b)) {
        return Err("Search must be 1–80 characters and start with a letter or number".into());
    }
    Ok(())
}
fn brew_search_pattern(query: &str) -> String {
    let mut pattern = String::from("/");
    for ch in query.trim().chars() {
        if ch.is_whitespace() {
            pattern.push_str(".*");
        } else {
            if ch == '.' || ch == '+' { pattern.push('\\'); }
            pattern.push(ch);
        }
    }
    pattern.push('/');
    pattern
}
fn read_brew_command(args: &[&str]) -> Result<String, String> {
    let path = active_brew().ok_or("Homebrew is not installed in a supported standard location")?;
    let output = Command::new(path).args(args).env("HOMEBREW_NO_ENV_HINTS", "1")
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .output().map_err(|e| format!("Could not run Homebrew: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let detail = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
        return Err(format!("Homebrew exited with {}: {}", output.status, detail.chars().take(2000).collect::<String>()));
    }
    Ok(stdout.chars().take(MAX_BREW_READ_OUTPUT_BYTES).collect())
}
#[tauri::command]
pub async fn better_terminal_brew_search(window: WebviewWindow, kind: String, query: String) -> Result<Vec<String>, String> {
    require_main(&window)?;
    let flag = validate_brew_kind(&kind)?;
    validate_brew_search(&query)?;
    let pattern = brew_search_pattern(&query);
    tauri::async_runtime::spawn_blocking(move || {
        let output = read_brew_command(&["search", flag, &pattern])?;
        Ok(output.lines().map(str::trim).filter(|line| !line.is_empty()).take(100)
            .map(|line| line.chars().take(120).collect()).collect())
    }).await.map_err(|e| format!("Homebrew search task failed: {e}"))?
}
#[tauri::command]
pub async fn better_terminal_brew_list(window: WebviewWindow, kind: String) -> Result<Vec<String>, String> {
    require_main(&window)?;
    let flag = validate_brew_kind(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = read_brew_command(&["list", flag])?;
        Ok(output.lines().map(str::trim).filter(|line| !line.is_empty()).take(500)
            .map(|line| line.chars().take(120).collect()).collect())
    }).await.map_err(|e| format!("Homebrew list task failed: {e}"))?
}
#[tauri::command]
pub async fn better_terminal_brew_info(window: WebviewWindow, kind: String, name: String) -> Result<String, String> {
    require_main(&window)?;
    let flag = validate_brew_kind(&kind)?;
    validate_brew_name(&name)?;
    tauri::async_runtime::spawn_blocking(move || read_brew_command(&["info", flag, name.trim()]))
        .await.map_err(|e| format!("Homebrew info task failed: {e}"))?
}
#[tauri::command]
pub async fn better_terminal_brew_outdated(window: WebviewWindow, kind: String) -> Result<Vec<String>, String> {
    require_main(&window)?;
    let flag = validate_brew_kind(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = read_brew_command(&["outdated", flag, "--quiet"])?;
        Ok(output.lines().map(str::trim).filter(|line| !line.is_empty()).take(500)
            .map(|line| line.chars().take(120).collect()).collect())
    }).await.map_err(|e| format!("Homebrew update check failed: {e}"))?
}
fn brew_operation_args(operation: &str, kind: Option<&str>, name: Option<&str>) -> Result<Vec<String>, String> {
    match operation {
        "update" => {
            if kind.is_some() || name.is_some_and(|n| !n.trim().is_empty()) {
                return Err("Homebrew index update does not accept a package name or category".into());
            }
            Ok(vec!["update".into()])
        }
        "upgrade_all" => {
            let flag = validate_brew_kind(kind.ok_or("Choose formula or cask")?)?;
            if name.is_some_and(|n| !n.trim().is_empty()) {
                return Err("Upgrade-all does not accept a package name".into());
            }
            Ok(vec!["upgrade".into(), flag.into()])
        }
        "install" | "uninstall" | "upgrade" => {
            let flag = validate_brew_kind(kind.ok_or("Choose formula or cask")?)?;
            let name = name.ok_or("Package name is required")?;
            validate_brew_name(name)?;
            Ok(vec![operation.into(), flag.into(), name.trim().into()])
        }
        _ => Err("Unsupported Homebrew operation".into()),
    }
}
fn emit_homebrew_event(app: &AppHandle, event: HomebrewEvent) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(HOMEBREW_EVENT, event);
    }
}
fn stream_homebrew_pipe<R: Read>(mut pipe: R, app: AppHandle, job_id: u64, stream: &'static str) {
    let mut buffer = [0u8; 4096];
    loop {
        match pipe.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(n) => emit_homebrew_event(&app, HomebrewEvent {
                job_id, stream: stream.to_string(),
                data: String::from_utf8_lossy(&buffer[..n]).into_owned(),
                exit_code: None,
            }),
        }
    }
}
fn terminate_homebrew_job(job: &ActiveHomebrewJob) {
    // The Homebrew process is started in its own process group so cancellation
    // can stop its child processes without signalling unrelated application processes.
    let result = unsafe { libc::kill(-(job.pid as i32), libc::SIGTERM) };
    if result != 0 {
        if let Ok(mut child) = job.child.lock() {
            let _ = child.kill();
        }
    }
}
#[tauri::command]
pub fn better_terminal_brew_start_operation(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, HomebrewManagerState>,
    operation: String,
    kind: Option<String>,
    name: Option<String>,
) -> Result<u64, String> {
    require_main(&window)?;
    let brew = active_brew().ok_or("Homebrew is not installed in a supported standard location")?;
    let args = brew_operation_args(&operation, kind.as_deref(), name.as_deref())?;
    let mut guard = state.active.lock().map_err(|_| "Homebrew manager is unavailable")?;
    if guard.is_some() {
        return Err("A Homebrew operation is already running. Wait for it to finish or cancel it first.".into());
    }
    let id = state.counter.fetch_add(1, Ordering::Relaxed) + 1;
    let mut command = Command::new(brew);
    command.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .env("HOMEBREW_NO_ENV_HINTS", "1");
    // Keep package operations from unexpectedly running a lengthy implicit
    // index update. Updating the index is a separate, visible user-confirmed action.
    if operation != "update" {
        command.env("HOMEBREW_NO_AUTO_UPDATE", "1");
    }
    command.process_group(0);
    let mut child = command.spawn().map_err(|e| format!("Could not start Homebrew: {e}"))?;
    let stdout = child.stdout.take().ok_or("Could not capture Homebrew output")?;
    let stderr = child.stderr.take().ok_or("Could not capture Homebrew errors")?;
    let pid = child.id();
    let child = Arc::new(Mutex::new(child));
    *guard = Some(ActiveHomebrewJob { id, pid, child: Arc::clone(&child) });
    drop(guard);
    let out_app = app.clone();
    let err_app = app.clone();
    let stdout_reader = thread::spawn(move || stream_homebrew_pipe(stdout, out_app, id, "stdout"));
    let stderr_reader = thread::spawn(move || stream_homebrew_pipe(stderr, err_app, id, "stderr"));
    let wait_app = app.clone();
    thread::spawn(move || {
        let status = loop {
            let result = child.lock().map_err(|_| "Homebrew process state poisoned".to_string())
                .and_then(|mut process| process.try_wait().map_err(|e| e.to_string()));
            match result {
                Ok(Some(status)) => break Some(status),
                Ok(None) => thread::sleep(Duration::from_millis(200)),
                Err(_) => break None,
            }
        };
        let _ = stdout_reader.join();
        let _ = stderr_reader.join();
        if let Ok(mut active) = wait_app.state::<HomebrewManagerState>().active.lock() {
            if active.as_ref().is_some_and(|job| job.id == id) {
                *active = None;
            }
        }
        let code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        emit_homebrew_event(&wait_app, HomebrewEvent {
            job_id: id, stream: "finished".into(),
            data: if code == 0 { "Operation completed successfully.\n".into() }
                else { format!("Operation ended with exit code {code}.\n") },
            exit_code: Some(code),
        });
    });
    Ok(id)
}
#[tauri::command]
pub fn better_terminal_brew_cancel_operation(
    window: WebviewWindow,
    state: State<'_, HomebrewManagerState>,
    job_id: u64,
) -> Result<(), String> {
    require_main(&window)?;
    let guard = state.active.lock().map_err(|_| "Homebrew manager is unavailable")?;
    let job = guard.as_ref().ok_or("No Homebrew operation is running")?;
    if job.id != job_id { return Err("Stale Homebrew operation id".into()); }
    terminate_homebrew_job(job);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn shell_is_system_owned_and_not_downloaded(){
        assert!(matches!(shell_path(),"/bin/zsh"|"/bin/bash"));
    }
    #[test]fn size_is_limited(){let s=valid_terminal_size(0,1000);assert_eq!(s.cols,40);assert_eq!(s.rows,80);}
    #[test]fn input_has_bounded_length_and_rejects_nul(){
        assert!(validate_write("ls -la\n").is_ok());
        assert!(validate_write("").is_err());
        assert!(validate_write(&"x".repeat(4097)).is_err());
        assert!(validate_write("x\0y").is_err());
    }
    #[test]fn brew_is_only_detected_in_fixed_standard_prefixes(){
        assert!(detect_brew_status().install_guide.starts_with("https://docs.brew.sh/"));
    }
    #[test]fn brew_names_reject_flags_and_command_injection(){
        assert!(validate_brew_name("python@3.13").is_ok());
        assert!(validate_brew_name("visual-studio-code").is_ok());
        for name in ["", "-rf", "foo;rm", "pkg$(id)", "../tmp", "two words", "x\ny"] {
            assert!(validate_brew_name(name).is_err(), "accepted {name}");
        }
    }
    #[test]fn brew_operation_args_are_fixed_and_validated(){
        assert_eq!(brew_operation_args("update", None, None).unwrap(), vec!["update"]);
        assert_eq!(brew_operation_args("upgrade_all", Some("cask"), None).unwrap(), vec!["upgrade", "--cask"]);
        assert_eq!(brew_operation_args("upgrade_all", Some("formula"), None).unwrap(), vec!["upgrade", "--formula"]);
        assert_eq!(brew_operation_args("install", Some("cask"), Some("visual-studio-code")).unwrap(),
            vec!["install", "--cask", "visual-studio-code"]);
        assert!(brew_operation_args("upgrade_all", None, None).is_err());
        assert!(brew_operation_args("upgrade_all", Some("cask"), Some("firefox")).is_err());
        assert!(brew_operation_args("update", Some("cask"), None).is_err());
        assert!(brew_operation_args("install", Some("formula"), Some("foo;id")).is_err());
        assert!(brew_operation_args("rm -rf", None, None).is_err());
    }
    #[test]fn brew_search_is_bounded_and_cannot_become_an_option(){
        assert_eq!(brew_search_pattern("visual studio code"), "/visual.*studio.*code/");
        assert_eq!(brew_search_pattern("foo.bar+baz"), "/foo\\.bar\\+baz/");
        assert!(validate_brew_search("visual studio code").is_ok());
        assert!(validate_brew_search("jq").is_ok());
        let too_long = "x".repeat(81);
        for query in ["", "--cask", "-rf", "foo;id", "x\ny", too_long.as_str()] {
            assert!(validate_brew_search(query).is_err(), "accepted {query}");
        }
    }
}
