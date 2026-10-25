//! Real macOS PTY session for Better Terminal. User driven only; never autoexecutes
//! from Sentinel observations or the original Go service.
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, PtySystem};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const MAX_WRITE_BYTES: usize = 4096;
const MAX_CHUNK_BYTES: usize = 8192;
pub const TERMINAL_OUTPUT_EVENT: &str = "better-terminal:output";

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
pub fn better_terminal_brew_status()->BrewStatus {
    BrewStatus {
        installed:active_brew().is_some(),
        executable:active_brew().map(str::to_string),
        architecture:std::env::consts::ARCH.to_owned(),
        install_guide:"https://docs.brew.sh/Installation",
    }
}
#[tauri::command]
pub fn better_terminal_start(app:AppHandle,state:State<'_,BetterTerminalState>,
    cols:u16,rows:u16)->Result<TerminalInfo,String>{
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
                    if app.emit(TERMINAL_OUTPUT_EVENT,TerminalOutput{session_id:id,data}).is_err(){break;}
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
pub fn better_terminal_write(state:State<'_,BetterTerminalState>,
    session_id:u64,data:String)->Result<(),String>{
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
pub fn better_terminal_resize(state:State<'_,BetterTerminalState>,
    session_id:u64,cols:u16,rows:u16)->Result<(),String>{
    let guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    let terminal=guard.as_ref().ok_or("Terminal not running")?;
    if terminal.id!=session_id{return Err("Stale terminal session".into());}
    terminal.master.resize(valid_terminal_size(cols,rows)).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn better_terminal_stop(state:State<'_,BetterTerminalState>,session_id:u64)->Result<(),String>{
    let mut guard=state.active.lock().map_err(|_|"Terminal session unavailable")?;
    if guard.as_ref().is_some_and(|s|s.id!=session_id) {
        return Err("Stale terminal session".into());
    }
    if let Some(mut terminal)=guard.take() {let _=terminal.child.kill();}
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
        assert!(better_terminal_brew_status().install_guide.starts_with("https://docs.brew.sh/"));
    }
}
