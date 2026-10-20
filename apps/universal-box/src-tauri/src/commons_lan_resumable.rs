//! Commons LAN v2: authenticated, resumable chunks for local Team ZIP handoff.
//! V1 remains available unchanged; v2 has a separate invitation URI and wire marker.
//! Verified chunks are temporarily stored in the app's own data directory.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, Payload, rand_core::RngCore},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime},
};
use tauri::{Emitter, Manager, State};

const MARKER: &[u8] = b"UBLAN2";
const CHUNK: usize = 256 * 1024;
const MAX_ZIP: usize = 30_000_000;
const TIMEOUT: Duration = Duration::from_secs(15);
const LIFETIME: Duration = Duration::from_secs(300);
const CACHE_AGE: Duration = Duration::from_secs(24 * 3600);
const MAX_CACHED_TRANSFERS: usize = 4; // At most ~120 MB of verified ZIP bytes.

#[derive(Default)]
pub struct ResumeLanState(Mutex<Option<Active>>);
struct Active {
    closed: Arc<AtomicBool>,
    expiry: Instant,
    invites: Vec<String>,
}
impl ResumeLanState {
    pub fn stop(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(active) = guard.take() {
                active.closed.store(true, Ordering::SeqCst);
            }
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareStatus {
    active: bool,
    invites: Vec<String>,
    seconds_remaining: u64,
    message: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    received_bytes: usize,
    total_bytes: usize,
}
#[derive(Serialize, Deserialize)]
struct Manifest {
    version: u8,
    size: usize,
    chunk_size: usize,
    digest: String,
    chunk_hashes: Vec<String>,
}
#[derive(Serialize, Deserialize)]
struct Need {
    indices: Vec<usize>,
}
fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}
fn manifest_for(zip: &[u8]) -> Manifest {
    Manifest {
        version: 2,
        size: zip.len(),
        chunk_size: CHUNK,
        digest: sha256(zip),
        chunk_hashes: zip.chunks(CHUNK).map(sha256).collect(),
    }
}
fn is_digest(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn valid_manifest(m: &Manifest) -> bool {
    m.version == 2 && m.chunk_size == CHUNK && m.size >= 4 && m.size <= MAX_ZIP
        && is_digest(&m.digest)
        && m.chunk_hashes.len() == m.size.div_ceil(CHUNK)
        && m.chunk_hashes.iter().all(|hash| is_digest(hash))
}
fn addresses() -> Vec<Ipv4Addr> {
    let mut values: Vec<Ipv4Addr> = if_addrs::get_if_addrs().unwrap_or_default().iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ip) if ip.is_private() && !ip.is_loopback() => Some(ip),
            _ => None,
        }).collect();
    values.push(Ipv4Addr::LOCALHOST);
    values.sort();
    values.dedup();
    values
}
fn parse_invite(invite: &str) -> Result<(SocketAddrV4, [u8; 32]), String> {
    let value = invite.trim();
    if value.len() > 180 || value.chars().any(char::is_control) {
        return Err("Invalid v2 invitation".into());
    }
    let (address, secret) = value.strip_prefix("uboxlan2://")
        .ok_or("Expected a uboxlan2:// resumable invitation")?
        .split_once('/').ok_or("Incomplete v2 invitation")?;
    let address: SocketAddrV4 = address.parse().map_err(|_| "Expected an IPv4 address and port")?;
    if address.port() == 0 || !(address.ip().is_private() || address.ip().is_loopback() || address.ip().is_link_local()) {
        return Err("Resumable invitations are restricted to local IPv4 addresses".into());
    }
    let raw = URL_SAFE_NO_PAD.decode(secret).map_err(|_| "Invalid v2 invitation key")?;
    let key: [u8; 32] = raw.try_into().map_err(|_| "Expected a 256-bit v2 key")?;
    Ok((address, key))
}
fn read_frame(socket: &mut TcpStream, key: &[u8; 32], aad: &[u8], limit: usize) -> Result<Vec<u8>, String> {
    let mut header = [0u8; 6 + 4 + 24];
    socket.read_exact(&mut header).map_err(|e| format!("Transfer frame interrupted: {e}"))?;
    if &header[..6] != MARKER { return Err("Wrong transfer protocol".into()); }
    let length = u32::from_be_bytes(header[6..10].try_into().unwrap()) as usize;
    if length < 16 || length > limit + 16 { return Err("Transfer frame exceeds limit".into()); }
    let mut encrypted = vec![0; length];
    socket.read_exact(&mut encrypted).map_err(|e| format!("Encrypted frame incomplete: {e}"))?;
    XChaCha20Poly1305::new(Key::from_slice(key))
        .decrypt(XNonce::from_slice(&header[10..34]), Payload { msg: &encrypted, aad })
        .map_err(|_| "Authenticated transfer frame verification failed".into())
}
fn write_frame(socket: &mut TcpStream, key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<(), String> {
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = XChaCha20Poly1305::new(Key::from_slice(key))
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad })
        .map_err(|_| "Cannot encrypt transfer frame")?;
    let length: u32 = encrypted.len().try_into().map_err(|_| "Transfer frame too large")?;
    socket.write_all(MARKER).map_err(|e| e.to_string())?;
    socket.write_all(&length.to_be_bytes()).map_err(|e| e.to_string())?;
    socket.write_all(&nonce).map_err(|e| e.to_string())?;
    socket.write_all(&encrypted).map_err(|e| format!("Transfer was interrupted: {e}"))
}
fn serve(mut socket: TcpStream, key: &[u8; 32], zip: &[u8], m: &Manifest) -> Result<bool, String> {
    socket.set_read_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    if read_frame(&mut socket, key, b"request", 16)? != b"HELLO2" {
        return Err("Invalid resume request".into());
    }
    let manifest_bytes = serde_json::to_vec(m).map_err(|e| e.to_string())?;
    write_frame(&mut socket, key, b"manifest", &manifest_bytes)?;
    let need: Need = serde_json::from_slice(&read_frame(&mut socket, key, b"need", 16_384)?)
        .map_err(|_| "Malformed chunk request")?;
    if need.indices.len() > m.chunk_hashes.len()
        || need.indices.iter().any(|&index| index >= m.chunk_hashes.len())
        || !need.indices.windows(2).all(|pair| pair[0] < pair[1]) {
        return Err("Invalid, unordered or duplicate chunk indices".into());
    }
    for index in need.indices {
        let begin = index * CHUNK;
        let end = (begin + CHUNK).min(zip.len());
        let mut packet = Vec::with_capacity(4 + end - begin);
        packet.extend_from_slice(&(index as u32).to_be_bytes());
        packet.extend_from_slice(&zip[begin..end]);
        write_frame(&mut socket, key, b"chunk", &packet)?;
    }
    let ack = read_frame(&mut socket, key, b"ack", 96)?;
    Ok(ack == format!("ACK2:{}", m.digest).as_bytes())
}
fn cache_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("commons-verified-chunks-v2"))
}
fn purge_expired(root: &Path) -> Result<(), String> {
    if !root.exists() { return Ok(()); }
    let mut active = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(ToString::to_string) else { continue; };
        // Only touch our own digest-named directories, never arbitrary files.
        if !is_digest(&name) { continue; }
        let Ok(info) = fs::symlink_metadata(&path) else { continue; };
        if !info.file_type().is_dir() { continue; } // Refuse symlink traversal.
        let modified = info.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let expired = SystemTime::now().duration_since(modified).is_ok_and(|age| age > CACHE_AGE);
        if expired {
            let _ = fs::remove_dir_all(path);
        } else {
            active.push((modified, path));
        }
    }
    active.sort_by_key(|(modified, _)| *modified);
    let excess = active.len().saturating_sub(MAX_CACHED_TRANSFERS);
    for (_, path) in active.into_iter().take(excess) {
        let _ = fs::remove_dir_all(path);
    }
    Ok(())
}
fn chunk_path(root: &Path, m: &Manifest, index: usize) -> PathBuf {
    root.join(&m.digest).join(format!("{index}.blk"))
}
fn chunk_length(m: &Manifest, index: usize) -> usize {
    (m.size - index * CHUNK).min(CHUNK)
}
fn cached_chunk(root: &Path, m: &Manifest, index: usize) -> Option<Vec<u8>> {
    let path = chunk_path(root, m, index);
    let metadata = fs::symlink_metadata(&path).ok()?;
    if !metadata.file_type().is_file() || metadata.len() != chunk_length(m, index) as u64 { return None; }
    let content = fs::read(path).ok()?;
    (sha256(&content) == m.chunk_hashes[index]).then_some(content)
}
fn store_chunk(root: &Path, m: &Manifest, index: usize, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() != chunk_length(m, index) || sha256(bytes) != m.chunk_hashes[index] {
        return Err("Chunk integrity check failed; bad bytes were not cached".into());
    }
    let destination = chunk_path(root, m, index);
    let directory = destination.parent().ok_or("Invalid cache directory")?;
    fs::create_dir_all(directory).map_err(|e| format!("Cannot create resume cache: {e}"))?;
    if !fs::symlink_metadata(directory).map_err(|e| e.to_string())?.file_type().is_dir() {
        return Err("Unsafe resume cache directory".into());
    }
    // Avoid following a pre-existing symlink or overwriting a stale .partial file.
    let mut nonce = [0u8; 8]; OsRng.fill_bytes(&mut nonce);
    let temporary = directory.join(format!("{index}-{}.partial", URL_SAFE_NO_PAD.encode(nonce)));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(temporary, destination).map_err(|e| e.to_string())?;
    Ok(())
}
fn receive_cached<F: FnMut(usize, usize)>(
    invite: &str, root: &Path, mut report: F,
) -> Result<String, String> {
    let (address, key) = parse_invite(invite)?;
    purge_expired(root)?;
    let mut socket = TcpStream::connect_timeout(&address.into(), TIMEOUT)
        .map_err(|e| format!("Cannot reach the sender: {e}"))?;
    socket.set_read_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    write_frame(&mut socket, &key, b"request", b"HELLO2")?;
    let manifest: Manifest = serde_json::from_slice(&read_frame(&mut socket, &key, b"manifest", 16_384)?)
        .map_err(|_| "Invalid transfer manifest")?;
    if !valid_manifest(&manifest) { return Err("Unsafe transfer manifest was rejected".into()); }
    let mut missing = Vec::new();
    let mut received = 0;
    for index in 0..manifest.chunk_hashes.len() {
        if cached_chunk(root, &manifest, index).is_some() {
            received += chunk_length(&manifest, index);
        } else {
            missing.push(index);
        }
    }
    report(received, manifest.size);
    write_frame(&mut socket, &key, b"need", &serde_json::to_vec(&Need { indices: missing.clone() })
        .map_err(|e| e.to_string())?)?;
    for index in missing {
        let packet = read_frame(&mut socket, &key, b"chunk", CHUNK + 4)?;
        if packet.len() < 4 || u32::from_be_bytes(packet[..4].try_into().unwrap()) as usize != index {
            return Err("Sender returned an unexpected chunk".into());
        }
        store_chunk(root, &manifest, index, &packet[4..])?;
        received += chunk_length(&manifest, index);
        report(received, manifest.size);
    }
    let mut complete = Vec::with_capacity(manifest.size);
    for index in 0..manifest.chunk_hashes.len() {
        let chunk = cached_chunk(root, &manifest, index)
            .ok_or("A previously verified chunk is missing or corrupt")?;
        complete.extend_from_slice(&chunk);
    }
    if complete.len() != manifest.size || sha256(&complete) != manifest.digest
        || !complete.starts_with(b"PK\x03\x04") {
        return Err("Final archive digest or ZIP signature failed".into());
    }
    write_frame(&mut socket, &key, b"ack", format!("ACK2:{}", manifest.digest).as_bytes())?;
    // Cache plaintext is retained after a network interruption, but removed on
    // authenticated full completion. Successful import remains user-confirmed.
    let _ = fs::remove_dir_all(root.join(&manifest.digest));
    Ok(URL_SAFE_NO_PAD.encode(complete))
}

#[tauri::command]
pub async fn commons_lan_resume_start(
    packet_base64: String, state: State<'_, ResumeLanState>,
) -> Result<ShareStatus, String> {
    if packet_base64.len() > 40_000_000 { return Err("Packet exceeds 30 MB".into()); }
    let zip = URL_SAFE_NO_PAD.decode(&packet_base64).map_err(|_| "Invalid ZIP encoding")?;
    if zip.len() < 4 || zip.len() > MAX_ZIP || !zip.starts_with(b"PK\x03\x04") {
        return Err("A Commons ZIP of at most 30 MB is required".into());
    }
    let mut guard = state.0.lock().map_err(|_| "Resumable LAN state unavailable")?;
    if let Some(existing) = guard.as_ref() {
        if !existing.closed.load(Ordering::SeqCst) && existing.expiry > Instant::now() {
            return Err("Stop the current resumable share before starting another".into());
        }
        existing.closed.store(true, Ordering::SeqCst);
    }
    let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let invites = addresses().iter().map(|ip| format!(
        "uboxlan2://{ip}:{port}/{}", URL_SAFE_NO_PAD.encode(key)
    )).collect::<Vec<_>>();
    let expiry = Instant::now() + LIFETIME;
    let closed = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&closed);
    let manifest = manifest_for(&zip);
    thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) && Instant::now() < expiry {
            match listener.accept() {
                Ok((socket, _)) => {
                    // Incomplete attempts never consume the share; sender remains
                    // available for another handshake until a verified ACK or expiry.
                    if matches!(serve(socket, &key, &zip, &manifest), Ok(true)) {
                        flag.store(true, Ordering::SeqCst);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock =>
                    thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        flag.store(true, Ordering::SeqCst);
    });
    *guard = Some(Active { closed, expiry, invites: invites.clone() });
    Ok(ShareStatus {
        active: true, invites, seconds_remaining: 300,
        message: "Resumable LAN v2 is active: verified blocks can survive a disconnection".into(),
    })
}
#[tauri::command]
pub async fn commons_lan_resume_stop(state: State<'_, ResumeLanState>) -> Result<(), String> {
    state.stop();
    Ok(())
}
#[tauri::command]
pub async fn commons_lan_resume_status(state: State<'_, ResumeLanState>) -> Result<ShareStatus, String> {
    let guard = state.0.lock().map_err(|_| "Resumable LAN state unavailable")?;
    if let Some(active) = guard.as_ref() {
        if !active.closed.load(Ordering::SeqCst) && active.expiry > Instant::now() {
            return Ok(ShareStatus {
                active: true, invites: active.invites.clone(),
                seconds_remaining: active.expiry.saturating_duration_since(Instant::now()).as_secs(),
                message: "Resumable LAN v2 is waiting for a receiver".into(),
            });
        }
    }
    Ok(ShareStatus { active: false, invites: vec![], seconds_remaining: 0, message: "No v2 share".into() })
}
#[tauri::command]
pub async fn commons_lan_resume_receive(invite: String, app: tauri::AppHandle) -> Result<String, String> {
    let root = cache_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        receive_cached(&invite, &root, |received, total| {
            let _ = app.emit("commons-lan-resume-progress", Progress {
                received_bytes: received, total_bytes: total,
            });
        })
    }).await.map_err(|_| "Resumable receive task failed".to_string())?
}
#[tauri::command]
pub fn commons_lan_resume_clear_cache(app: tauri::AppHandle) -> Result<(), String> {
    let root = cache_root(&app)?;
    if root.exists() { fs::remove_dir_all(root).map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup(payload: Vec<u8>) -> (String, thread::JoinHandle<bool>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let key = [41u8; 32];
        let invite = format!("uboxlan2://{address}/{}", URL_SAFE_NO_PAD.encode(key));
        let server = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            serve(socket, &key, &payload, &manifest_for(&payload)).unwrap()
        });
        (invite, server)
    }
    fn test_cache() -> PathBuf {
        let mut seed = [0u8; 12]; OsRng.fill_bytes(&mut seed);
        std::env::temp_dir().join(format!("ubox-resume-test-{}", URL_SAFE_NO_PAD.encode(seed)))
    }
    #[test]
    fn refuses_public_hosts_and_v1_invites() {
        for invite in [
            "uboxlan2://8.8.8.8:443/key",
            "uboxlan://127.0.0.1:1234/key",
            "uboxlan2://example.com:1234/key",
        ] { assert!(parse_invite(invite).is_err()); }
    }
    #[test]
    fn resume_skips_previously_verified_block() {
        let payload = [&b"PK\x03\x04"[..], &vec![23u8; CHUNK * 2 + 17][..]].concat();
        let m = manifest_for(&payload);
        let dir = test_cache();
        store_chunk(&dir, &m, 0, &payload[..CHUNK]).unwrap();
        let (invite, server) = setup(payload.clone());
        let mut progress = Vec::new();
        let got = receive_cached(&invite, &dir, |n, total| progress.push((n, total))).unwrap();
        assert_eq!(URL_SAFE_NO_PAD.decode(got).unwrap(), payload);
        assert!(server.join().unwrap());
        assert_eq!(progress[0], (CHUNK, payload.len()));
        assert_eq!(progress.last(), Some(&(payload.len(), payload.len())));
        assert!(!dir.join(m.digest).exists());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn reconnect_after_real_mid_transfer_disconnect() {
        let zip = [&b"PK\x03\x04"[..], &vec![34u8; CHUNK * 2 + 99][..]].concat();
        let m = manifest_for(&zip);
        let dir = test_cache();
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let key = [29u8; 32];
        let invite = format!("uboxlan2://{addr}/{}", URL_SAFE_NO_PAD.encode(key));
        let sent_zip = zip.clone();
        let server = thread::spawn(move || {
            let (mut first, _) = listener.accept().unwrap();
            first.set_read_timeout(Some(TIMEOUT)).unwrap();
            first.set_write_timeout(Some(TIMEOUT)).unwrap();
            assert_eq!(read_frame(&mut first, &key, b"request", 16).unwrap(), b"HELLO2");
            write_frame(&mut first, &key, b"manifest", &serde_json::to_vec(&m).unwrap()).unwrap();
            let need: Need = serde_json::from_slice(
                &read_frame(&mut first, &key, b"need", 16_384).unwrap()
            ).unwrap();
            assert_eq!(need.indices[0], 0);
            let mut first_packet = 0u32.to_be_bytes().to_vec();
            first_packet.extend_from_slice(&sent_zip[..CHUNK]);
            write_frame(&mut first, &key, b"chunk", &first_packet).unwrap();
            drop(first); // Real connection failure after the first verified block.
            let (second, _) = listener.accept().unwrap();
            serve(second, &key, &sent_zip, &manifest_for(&sent_zip)).unwrap()
        });
        assert!(receive_cached(&invite, &dir, |_, _| {}).is_err());
        assert!(chunk_path(&dir, &manifest_for(&zip), 0).exists());
        let mut first_progress = None;
        let got = receive_cached(&invite, &dir, |n, _| {
            if first_progress.is_none() { first_progress = Some(n); }
        }).unwrap();
        assert_eq!(first_progress, Some(CHUNK));
        assert_eq!(URL_SAFE_NO_PAD.decode(got).unwrap(), zip);
        assert!(server.join().unwrap());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn corrupt_cached_block_is_downloaded_again() {
        let payload = [&b"PK\x03\x04"[..], &vec![71u8; CHUNK + 5][..]].concat();
        let m = manifest_for(&payload);
        let dir = test_cache();
        store_chunk(&dir, &m, 0, &payload[..CHUNK]).unwrap();
        fs::write(chunk_path(&dir, &m, 0), vec![99u8; CHUNK]).unwrap();
        let (invite, server) = setup(payload.clone());
        let mut first = usize::MAX;
        let got = receive_cached(&invite, &dir, |n, _| { if first == usize::MAX { first = n; } }).unwrap();
        assert_eq!(first, 0);
        assert_eq!(URL_SAFE_NO_PAD.decode(got).unwrap(), payload);
        assert!(server.join().unwrap());
        let _ = fs::remove_dir_all(dir);
    }
    #[test]
    fn rejects_oversized_or_malformed_manifest() {
        let mut m = manifest_for(b"PK\x03\x04something");
        m.size = MAX_ZIP + 1;
        assert!(!valid_manifest(&m));
        m.size = 16;
        m.digest = "../unsafe".into();
        assert!(!valid_manifest(&m));
    }
}
