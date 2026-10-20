//! Sentinel is the original Go engine, packaged as an on-demand native service.
//! Its data and actions remain in Go; React never receives the session token.
use std::{
    io::{BufRead, BufReader, Read},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

const MAX_REPLY: u64 = 2 * 1024 * 1024;
const BOOTSTRAP: &str = "SENTINEL_DESKTOP_BOOTSTRAP ";

#[derive(Deserialize)]
struct Bootstrap { origin: String, token: String, version: String }

#[derive(Serialize)]
pub struct ServiceStatus { running: bool, version: Option<String>, message: String }

struct RunningEngine {
    process: Child,
    origin: String,
    token: String,
    version: String,
}
#[derive(Default)]
pub struct SentinelService(Mutex<Option<RunningEngine>>);

fn valid_origin(origin: &str) -> bool {
    let Some(port) = origin.strip_prefix("http://127.0.0.1:") else { return false };
    !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())
        && port.parse::<u16>().is_ok_and(|p| p != 0)
}
fn parse_bootstrap(line: &str) -> Result<Bootstrap, String> {
    let json = line.strip_prefix(BOOTSTRAP).ok_or("Missing Sentinel bootstrap marker")?;
    let result: Bootstrap = serde_json::from_str(json).map_err(|_| "Invalid engine bootstrap JSON")?;
    if !valid_origin(&result.origin) || result.token.len() != 48
        || !result.token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Sentinel engine returned an invalid loopback session".into());
    }
    Ok(result)
}
fn status(engine: &Option<RunningEngine>) -> ServiceStatus {
    match engine {
        Some(e) => ServiceStatus { running: true, version: Some(e.version.clone()), message:"Sentinel Go engine ready (loopback only)".into() },
        None => ServiceStatus { running: false, version: None, message:"Sentinel engine is stopped".into() },
    }
}
fn check_exit(engine: &mut Option<RunningEngine>) {
    if engine.as_mut().is_some_and(|e| e.process.try_wait().ok().flatten().is_some()) {
        *engine = None;
    }
}
impl SentinelService {
    fn stop(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(mut engine) = guard.take() {
                // Send SIGTERM so the original Go engine can close its jobs and state.
                #[cfg(unix)]
                unsafe { libc::kill(engine.process.id() as i32, libc::SIGTERM); }
                #[cfg(not(unix))]
                { let _ = engine.process.kill(); }
                let end = Instant::now() + Duration::from_secs(4);
                loop {
                    if engine.process.try_wait().ok().flatten().is_some() { break; }
                    if Instant::now() >= end {
                        let _ = engine.process.kill();
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(60));
                }
                let _ = engine.process.wait();
            }
        }
    }
}
impl Drop for SentinelService {
    fn drop(&mut self) { self.stop(); }
}

#[tauri::command]
pub fn sentinel_service_status(service: State<'_, SentinelService>) -> Result<ServiceStatus, String> {
    let mut guard=service.0.lock().map_err(|_| "Sentinel service lock poisoned")?;
    check_exit(&mut guard);
    Ok(status(&guard))
}

#[tauri::command]
pub fn sentinel_service_start(app: AppHandle, service: State<'_, SentinelService>) -> Result<ServiceStatus, String> {
    #[cfg(not(target_os="macos"))]
    { let _=app; let _=service; return Err("Bundled Sentinel service is available on macOS only".into()); }
    #[cfg(target_os="macos")]
    {
        let mut guard=service.0.lock().map_err(|_| "Sentinel service lock poisoned")?;
        check_exit(&mut guard);
        if guard.is_some() { return Ok(status(&guard)); }
        let bin=app.path().resource_dir().map_err(|e| e.to_string())?
            .join("sentinel").join("sentinel-engine");
        if !bin.is_file() { return Err("Bundled Sentinel Go engine not found; rebuild Universal Box with the engine resource".into()); }
        let mut child=Command::new(&bin).args(["--desktop", "--no-browser"])
            .env("SENTINEL_NO_BROWSER", "1")
            .stdout(Stdio::piped()).stderr(Stdio::inherit())
            .spawn().map_err(|e| format!("Cannot launch Sentinel Go engine: {e}"))?;
        let stdout=child.stdout.take().ok_or("Sentinel stdout unavailable")?;
        let (tx,rx)=mpsc::sync_channel::<Result<Bootstrap,String>>(1);
        std::thread::spawn(move || {
            let mut sent=false;
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) if line.starts_with(BOOTSTRAP) && !sent => {
                        let _=tx.send(parse_bootstrap(&line));
                        sent=true;
                    }
                    Ok(_) => {} // Drain output, but never log its session URL/token.
                    Err(_) => break,
                }
            }
        });
        let bootstrap=match rx.recv_timeout(Duration::from_secs(20)) {
            Ok(Ok(x)) => x,
            Ok(Err(e)) => { let _=child.kill(); let _=child.wait(); return Err(e); },
            Err(_) => { let _=child.kill(); let _=child.wait(); return Err("Sentinel Go engine did not bootstrap (it may already be running separately)".into()); },
        };
        *guard=Some(RunningEngine { process:child, origin:bootstrap.origin,token:bootstrap.token,version:bootstrap.version });
        Ok(status(&guard))
    }
}

#[tauri::command]
pub fn sentinel_service_stop(app: AppHandle, service: State<'_, SentinelService>) -> Result<ServiceStatus, String> {
    if let Some(window)=app.get_webview_window("sentinel-full") { let _=window.close(); }
    service.stop();
    Ok(ServiceStatus{running:false,version:None,message:"Sentinel engine stopped safely".into()})
}

/// Explicit read-only allowlist. The browser cannot submit arbitrary URLs, methods or commands.
fn allowed_read_path(key: &str) -> Option<&'static str> {
    match key {
        "overview" => Some("/api/overview"),
        "profile" => Some("/api/system-profile"),
        "quick-check" => Some("/api/quick-check"),
        "review" => Some("/api/review-queue"),
        "capabilities" => Some("/api/capabilities"),
        "visibility" => Some("/api/visibility"),
        "processes" => Some("/api/processes"),
        "startup" => Some("/api/startup"),
        "background" => Some("/api/background"),
        "network" => Some("/api/network"),
        "network-history" => Some("/api/network/history"),
        "storage" => Some("/api/storage/aging"),
        "graph" => Some("/api/intelligence/graph"),
        "timeline" => Some("/api/intelligence/timeline"),
        "behavior" => Some("/api/behavior"),
        "trust" => Some("/api/trust/status"),
        "runtime-logs" => Some("/api/runtime/logs"),
        "doctor" => Some("/api/doctor"),
        _ => None,
    }
}
#[tauri::command]
pub fn sentinel_service_read(key: String, service: State<'_, SentinelService>) -> Result<serde_json::Value, String> {
    let path=allowed_read_path(&key).ok_or("Unsupported Sentinel read-only query")?;
    let mut guard=service.0.lock().map_err(|_| "Sentinel service lock poisoned")?;
    check_exit(&mut guard);
    let engine=guard.as_ref().ok_or("Start Sentinel first")?;
    let agent=ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout_read(Duration::from_secs(20))
        .redirects(0).build();
    let response=agent.get(&format!("{}{}", engine.origin,path))
        .set("X-Sentinel-Token",&engine.token)
        .call().map_err(|e|format!("Sentinel API request failed: {e}"))?;
    let mut data=Vec::new();
    response.into_reader().take(MAX_REPLY+1)
        .read_to_end(&mut data).map_err(|e|format!("Reading Sentinel response failed: {e}"))?;
    if data.len() as u64 > MAX_REPLY { return Err("Sentinel response exceeds the 2 MB display limit".into()); }
    serde_json::from_slice(&data).map_err(|_|"Sentinel response was not valid JSON".into())
}

/// Preserves ALL current Sentinel Go/frontend functions until the React UI is fully migrated.
#[tauri::command]
pub fn sentinel_service_full_workbench(app: AppHandle, service: State<'_, SentinelService>) -> Result<(),String> {
    let mut guard=service.0.lock().map_err(|_| "Sentinel service lock poisoned")?;
    check_exit(&mut guard);
    let engine=guard.as_ref().ok_or("Start Sentinel first")?;
    if let Some(win)=app.get_webview_window("sentinel-full") {
        return win.set_focus().map_err(|e|e.to_string());
    }
    // The session token stays entirely within the Rust-managed legacy WebView.
    let url=format!("{}/#token={}",engine.origin,engine.token);
    let parsed=url.parse().map_err(|_|"Malformed local Sentinel window URL")?;
    WebviewWindowBuilder::new(&app,"sentinel-full",WebviewUrl::External(parsed))
        .title("Sentinel · Full Workbench").inner_size(1280.0,840.0)
        .build().map_err(|e|format!("Cannot open integrated Sentinel workbench: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_loopback_port_is_accepted() {
        assert!(valid_origin("http://127.0.0.1:43123"));
        assert!(!valid_origin("http://localhost:80"));
        assert!(!valid_origin("http://127.0.0.1:42/path"));
        assert!(!valid_origin("https://127.0.0.1:80"));
    }
    #[test]
    fn cannot_proxy_mutating_paths() {
        assert_eq!(allowed_read_path("processes"),Some("/api/processes"));
        assert_eq!(allowed_read_path("actions/execute"),None);
        assert_eq!(allowed_read_path("trust/capture"),None);
        assert_eq!(allowed_read_path("../../etc/passwd"),None);
    }
    #[test]
    fn malformed_bootstrap_refused() {
        assert!(parse_bootstrap("SENTINEL_DESKTOP_BOOTSTRAP {}").is_err());
    }
}
