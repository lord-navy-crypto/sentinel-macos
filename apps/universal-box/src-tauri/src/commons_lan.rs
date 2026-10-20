//! Universal Commons LAN v1: opt-in, one-shot encrypted packets, no cloud service.
//! The URL is a capability: share it privately, because it contains the decryption key.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::Serialize;
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::State;

const MARKER: &[u8; 6] = b"UBLAN1";
const REQUEST_TEXT: &[u8] = b"REQUEST";
const MAX_ZIP_BYTES: usize = 30_000_000;
const SHARE_LIFETIME: Duration = Duration::from_secs(300);
const NETWORK_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default)]
pub struct CommonsLanState(Mutex<Option<ActiveShare>>);

struct ActiveShare {
    closed: Arc<AtomicBool>,
    expiry: Instant,
    addresses: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanInfo {
    active: bool,
    invites: Vec<String>,
    seconds_remaining: u64,
    message: String,
}

impl CommonsLanState {
    pub fn stop(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(active) = guard.take() {
                active.closed.store(true, Ordering::SeqCst);
            }
        }
    }
}

fn limited_zip(encoded: &str) -> Result<Vec<u8>, String> {
    // Limit text length before allocation to avoid user-controlled giant base64.
    if encoded.len() > 40_000_000 { return Err("Team packet is too large for LAN sharing".into()); }
    let data = URL_SAFE_NO_PAD.decode(encoded)
        .map_err(|_| "LAN data is not valid base64url".to_string())?;
    if data.is_empty() || data.len() > MAX_ZIP_BYTES {
        return Err("Team ZIP must be 1 byte–30 MB".into());
    }
    if !data.starts_with(b"PK\x03\x04") {
        return Err("Only Universal Commons ZIP packets can be shared".into());
    }
    Ok(data)
}

fn local_addresses() -> Vec<Ipv4Addr> {
    let mut addresses: Vec<Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default().iter().filter_map(|iface| match iface.ip() {
            IpAddr::V4(v4) if v4.is_private() && !v4.is_loopback() => Some(v4),
            _ => None,
        }).collect();
    addresses.sort();
    addresses.dedup();
    // Same-machine testing remains possible without sending anything over the internet.
    addresses.push(Ipv4Addr::LOCALHOST);
    addresses
}

fn parse_invite(invite: &str) -> Result<(SocketAddrV4, [u8; 32]), String> {
    let value = invite.trim();
    if value.len() > 180 || value.contains(|c: char| c.is_control()) {
        return Err("Invitation is too long or invalid".into());
    }
    let path = value.strip_prefix("uboxlan://")
        .ok_or("Paste a Universal Commons LAN invitation (uboxlan://...)")?;
    let (address, secret) = path.split_once('/')
        .ok_or("LAN invitation is missing its access key")?;
    let address: SocketAddrV4 = address.parse()
        .map_err(|_| "LAN invitation must use a numeric IPv4 address and port")?;
    let ip = address.ip();
    if !(ip.is_private() || ip.is_loopback() || ip.is_link_local()) || address.port() == 0 {
        return Err("Public internet addresses and zero ports are not allowed for local transfer".into());
    }
    let raw = URL_SAFE_NO_PAD.decode(secret).map_err(|_| "Invalid invitation access key")?;
    let key: [u8; 32] = raw.try_into().map_err(|_| "Invitation key must be 256 bits")?;
    Ok((address, key))
}

fn transmit(mut socket: TcpStream, key: &[u8; 32], zip: &[u8]) -> Result<(), String> {
    socket.set_read_timeout(Some(NETWORK_TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(NETWORK_TIMEOUT)).map_err(|e| e.to_string())?;
    // No metadata or packet bytes are sent until the receiver proves the invite key.
    let mut hello = [0_u8; 6 + 24 + 23];
    socket.read_exact(&mut hello).map_err(|e| format!("Receiver handshake failed: {e}"))?;
    if &hello[..6] != MARKER { return Err("Invalid Commons LAN handshake".into()); }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let plaintext = cipher.decrypt(XNonce::from_slice(&hello[6..30]), &hello[30..])
        .map_err(|_| "Receiver did not prove possession of the share key")?;
    if plaintext != REQUEST_TEXT { return Err("Unexpected transfer request".into()); }
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let sealed = cipher.encrypt(XNonce::from_slice(&nonce), zip)
        .map_err(|_| "Could not encrypt team ZIP".to_string())?;
    let len: u32 = sealed.len().try_into().map_err(|_| "Encrypted payload too big")?;
    socket.write_all(MARKER).map_err(|e| e.to_string())?;
    socket.write_all(&nonce).map_err(|e| e.to_string())?;
    socket.write_all(&len.to_be_bytes()).map_err(|e| e.to_string())?;
    socket.write_all(&sealed).map_err(|e| format!("Encrypted transfer interrupted: {e}"))?;
    socket.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn receive(invite: &str) -> Result<String, String> {
    let (address, key) = parse_invite(invite)?;
    let mut socket = TcpStream::connect_timeout(&address.into(), NETWORK_TIMEOUT)
        .map_err(|e| format!("Cannot connect to sender on local network: {e}"))?;
    socket.set_read_timeout(Some(NETWORK_TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(NETWORK_TIMEOUT)).map_err(|e| e.to_string())?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let request = cipher.encrypt(XNonce::from_slice(&nonce), REQUEST_TEXT)
        .map_err(|_| "Could not prepare encrypted request")?;
    socket.write_all(MARKER).map_err(|e| e.to_string())?;
    socket.write_all(&nonce).map_err(|e| e.to_string())?;
    socket.write_all(&request).map_err(|e| e.to_string())?;
    let mut header = [0_u8; 34];
    socket.read_exact(&mut header).map_err(|e| format!("Sender did not reply: {e}"))?;
    if &header[..6] != MARKER { return Err("Wrong Commons LAN protocol version".into()); }
    let length = u32::from_be_bytes(header[30..34].try_into().unwrap()) as usize;
    if length < 17 || length > MAX_ZIP_BYTES + 16 {
        return Err("Encrypted packet exceeded configured 30 MB limit".into());
    }
    let mut sealed = vec![0_u8; length];
    socket.read_exact(&mut sealed).map_err(|e| format!("Encrypted transfer was incomplete: {e}"))?;
    let clear = cipher.decrypt(XNonce::from_slice(&header[6..30]), sealed.as_ref())
        .map_err(|_| "Transfer authentication failed; packet not accepted".to_string())?;
    if clear.len() > MAX_ZIP_BYTES || !clear.starts_with(b"PK\x03\x04") {
        return Err("Received packet is not a Commons ZIP".into());
    }
    Ok(URL_SAFE_NO_PAD.encode(clear))
}

#[tauri::command]
pub async fn commons_lan_start(
    packet_base64: String,
    state: State<'_, CommonsLanState>,
) -> Result<LanInfo, String> {
    let zip = limited_zip(&packet_base64)?;
    let mut current = state.0.lock().map_err(|_| "LAN service state unavailable")?;
    if let Some(existing) = current.as_ref() {
        if !existing.closed.load(Ordering::SeqCst) && Instant::now() < existing.expiry {
            return Err("A one-time LAN share is already active. Stop it before starting another.".into());
        }
        existing.closed.store(true, Ordering::SeqCst);
    }
    let listener = TcpListener::bind(("0.0.0.0", 0))
        .map_err(|e| format!("Could not open a local share listener: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    let text_key = URL_SAFE_NO_PAD.encode(key);
    let invites: Vec<String> = local_addresses().iter().map(|ip| format!("uboxlan://{}:{port}/{text_key}", ip)).collect();
    let expiry = Instant::now() + SHARE_LIFETIME;
    let closed = Arc::new(AtomicBool::new(false));
    let flag = closed.clone();
    thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) && Instant::now() < expiry {
            match listener.accept() {
                Ok((socket, _)) => {
                    // A failed handshake does not consume the one-time share.
                    if transmit(socket, &key, &zip).is_ok() {
                        flag.store(true, Ordering::SeqCst);
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock =>
                    thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        flag.store(true, Ordering::SeqCst);
    });
    *current = Some(ActiveShare {closed, expiry, addresses:invites.clone()});
    Ok(LanInfo {active:true,invites,seconds_remaining:300,
        message:"Encrypted one-time LAN share started; receiver needs the private invitation".into()})
}

#[tauri::command]
pub async fn commons_lan_stop(state: State<'_, CommonsLanState>) -> Result<(), String> {
    state.stop();
    Ok(())
}

#[tauri::command]
pub async fn commons_lan_status(state: State<'_, CommonsLanState>) -> Result<LanInfo, String> {
    let current = state.0.lock().map_err(|_| "LAN service state unavailable")?;
    if let Some(item) = current.as_ref() {
        if !item.closed.load(Ordering::SeqCst) && Instant::now() < item.expiry {
            return Ok(LanInfo {active:true,invites:item.addresses.clone(),
                seconds_remaining:(item.expiry-Instant::now()).as_secs(),
                message:"Waiting for a receiver holding the invitation".into()});
        }
    }
    Ok(LanInfo {active:false,invites:vec![],seconds_remaining:0,
        message:"No active LAN share".into()})
}

#[tauri::command]
pub async fn commons_lan_receive(invite: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || receive(&invite))
        .await.map_err(|_| "LAN receive task did not finish".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_public_and_hostname_destinations() {
        for invite in [
            "uboxlan://8.8.8.8:8080/secret",
            "uboxlan://example.org:8080/secret",
            "http://192.168.0.1:4444/key",
            "uboxlan://192.168.1.1:0/key",
        ] {
            assert!(parse_invite(invite).is_err(), "unexpectedly accepted {invite}");
        }
    }
    #[test]
    fn authenticated_encrypted_local_roundtrip() {
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
        let ip=listener.local_addr().unwrap();
        let key=[77_u8;32];
        let zipped=b"PK\x03\x04sample zip payload";
        let sender=thread::spawn(move || {
            let (socket,_) = listener.accept().unwrap();
            transmit(socket,&key,zipped).unwrap();
        });
        let invite=format!("uboxlan://{}/{}",ip,URL_SAFE_NO_PAD.encode(key));
        let got=receive(&invite).unwrap();
        assert_eq!(URL_SAFE_NO_PAD.decode(got).unwrap(),zipped);
        sender.join().unwrap();
    }
}
