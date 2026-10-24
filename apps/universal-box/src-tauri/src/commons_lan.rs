//! Universal Commons LAN v1: opt-in, one-shot encrypted packets, no cloud service.
//! The URL is a capability: share it privately, because it contains the decryption key.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::Serialize;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering}, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, State};

const MARKER: &[u8; 6] = b"UBLAN1";
const REQUEST_TEXT: &[u8] = b"REQUEST";
const MAX_ZIP_BYTES: usize = 30_000_000;
const SHARE_LIFETIME: Duration = Duration::from_secs(300);
const NETWORK_TIMEOUT: Duration = Duration::from_secs(8);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(3);
const SEND_BLOCK: usize = 64 * 1024;
const WAITING: u8 = 0;
const SENDING: u8 = 1;
const DELIVERED: u8 = 2;
const EXPIRED: u8 = 3;
const STOPPED: u8 = 4;
const DISCOVERY_TYPE: &str = "_uboxcom._tcp.local.";
const DISCOVERY_PERIOD: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct CommonsLanState(Mutex<Option<ActiveShare>>);

struct ActiveShare {
    closed: Arc<AtomicBool>,
    expiry: Instant,
    addresses: Vec<String>,
    instance: String,
    phase: Arc<AtomicU8>,
    sent_bytes: Arc<AtomicUsize>,
    total_bytes: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanInfo {
    active: bool,
    invites: Vec<String>,
    seconds_remaining: u64,
    phase: String,
    sent_bytes: usize,
    total_bytes: usize,
    message: String,
}

impl CommonsLanState {
    pub fn stop(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(active) = guard.take() {
                // Stop must never overwrite an already completed sender receipt.
                let _ = active.phase.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |phase| {
                    if phase == DELIVERED { None } else { Some(STOPPED) }
                });
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


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NearbyShare {
    instance: String,
    label: String,
    ip: String,
    port: u16,
}

/// Does not contain any invitation key. Advertised only while an explicit
/// one-time transfer is active, not while the user merely runs Universal Box.
fn advertise_nearby(port: u16, instance: &str) -> Option<ServiceDaemon> {
    let addresses: Vec<IpAddr> = local_addresses().into_iter()
        .filter(|ip| !ip.is_loopback()).map(IpAddr::V4).collect();
    if addresses.is_empty() { return None; }
    let daemon = ServiceDaemon::new().ok()?;
    let info = ServiceInfo::new(
        DISCOVERY_TYPE,
        instance,
        "uboxcommons.local.",
        &addresses[..],
        port,
        None,
    ).ok()?;
    if daemon.register(info).is_err() {
        let _ = daemon.shutdown();
        return None;
    }
    Some(daemon)
}

fn browse_nearby(exclude: &str) -> Result<Vec<NearbyShare>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("Nearby discovery unavailable: {e}"))?;
    let browser = match daemon.browse(DISCOVERY_TYPE) {
        Ok(receiver) => receiver,
        Err(e) => {
            let _ = daemon.shutdown();
            return Err(format!("Cannot browse nearby Universal Box devices: {e}"));
        }
    };
    let expiry = Instant::now() + DISCOVERY_PERIOD;
    let mut found = std::collections::BTreeMap::<String, NearbyShare>::new();
    while Instant::now() < expiry {
        let left = expiry.saturating_duration_since(Instant::now());
        if left.is_zero() { break; }
        match browser.recv_timeout(left.min(Duration::from_millis(350))) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let instance = info.get_fullname().split('.').next().unwrap_or("").to_string();
                if instance == exclude || !instance.starts_with("Commons-") || instance.len() > 65 {
                    continue;
                }
                let port=info.get_port();
                if port==0 { continue; }
                for addr in info.get_addresses_v4() {
                    if !(addr.is_private() || addr.is_link_local()) || addr.is_loopback() {continue;}
                    let key=format!("{instance}-{addr}:{port}");
                    found.entry(key).or_insert_with(|| NearbyShare{
                        instance:instance.clone(),
                        label:format!("Universal Box · {}", &instance[8..]),
                        ip:addr.to_string(),
                        port
                    });
                }
            }
            Ok(_) => {},
            Err(_) => {
                // Receivers normally time out between multicast announcements.
            }
        }
    }
    let _=daemon.stop_browse(DISCOVERY_TYPE);
    let _=daemon.shutdown();
    Ok(found.into_values().take(32).collect())
}

#[tauri::command]
pub async fn commons_lan_discover(state: State<'_, CommonsLanState>) -> Result<Vec<NearbyShare>, String> {
    let exclude=state.0.lock().map_err(|_|"LAN state unavailable")?
        .as_ref().map(|share|share.instance.clone()).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || browse_nearby(&exclude))
        .await.map_err(|_|"Nearby discovery task failed".to_string())?
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

/// Never accept a sender-side LAN request originating from a public IP.
fn allowed_lan_peer(ip: IpAddr)->bool{
 match ip {
  IpAddr::V4(v4)=>v4.is_private()||v4.is_loopback()||v4.is_link_local(),
  IpAddr::V6(_)=>false,
 }
}
/// Only authenticated receivers get data. Chunked writes allow Stop to interrupt a
/// live transfer instead of merely closing the listening socket for future peers.
/// Progress is encrypted TCP bytes written, not proof of receiver ZIP verification.
fn transmit_with_progress<F: FnMut(usize, usize)>(
    mut socket: TcpStream, key: &[u8; 32], zip: &[u8],
    cancelled: &AtomicBool, mut report: F,
) -> Result<(), String> {
    socket.set_read_timeout(Some(HANDSHAKE_TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(NETWORK_TIMEOUT)).map_err(|e| e.to_string())?;
    let mut hello = [0_u8; 6 + 24 + 23];
    socket.read_exact(&mut hello).map_err(|e| format!("Receiver handshake failed: {e}"))?;
    if &hello[..6] != MARKER { return Err("Invalid Commons LAN handshake".into()); }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let plaintext = cipher.decrypt(XNonce::from_slice(&hello[6..30]), &hello[30..])
        .map_err(|_| "Receiver did not prove possession of the share key")?;
    if plaintext != REQUEST_TEXT { return Err("Unexpected transfer request".into()); }
    if cancelled.load(Ordering::SeqCst) {
        return Err("Sender cancelled the one-time LAN share".into());
    }
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let sealed = cipher.encrypt(XNonce::from_slice(&nonce), zip)
        .map_err(|_| "Could not encrypt team ZIP".to_string())?;
    if cancelled.load(Ordering::SeqCst) {
        return Err("Sender cancelled the one-time LAN share".into());
    }
    let len: u32 = sealed.len().try_into().map_err(|_| "Encrypted payload too big")?;
    socket.write_all(MARKER).map_err(|e| e.to_string())?;
    socket.write_all(&nonce).map_err(|e| e.to_string())?;
    socket.write_all(&len.to_be_bytes()).map_err(|e| e.to_string())?;
    report(0, sealed.len());
    let mut sent = 0;
    for block in sealed.chunks(SEND_BLOCK) {
        if cancelled.load(Ordering::SeqCst) {
            return Err("Sender cancelled the active LAN transfer".into());
        }
        socket.write_all(block).map_err(|e| format!("Encrypted transfer interrupted: {e}"))?;
        sent += block.len();
        report(sent, sealed.len());
    }
    socket.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
fn transmit(socket: TcpStream, key: &[u8; 32], zip: &[u8]) -> Result<(), String> {
    transmit_with_progress(socket, key, zip, &AtomicBool::new(false), |_sent, _total| {})
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanTransferProgress {
    received_bytes: usize,
    total_bytes: usize,
}
fn receive_with_progress<F: FnMut(usize, usize)>(
    invite: &str,
    mut report: F,
) -> Result<String, String> {
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
    // Read the encrypted packet in bounded 256 KiB chunks. Progress is
    // informative only: it is NOT a claim that the file is verified yet.
    let mut sealed = Vec::with_capacity(length);
    let mut chunk = [0_u8; 256 * 1024];
    let mut last_report = 0_usize;
    while sealed.len() < length {
        let next = chunk.len().min(length - sealed.len());
        let n = socket.read(&mut chunk[..next])
            .map_err(|e| format!("Encrypted transfer was incomplete: {e}"))?;
        if n == 0 { return Err("Sender disconnected before the encrypted packet was complete".into()); }
        sealed.extend_from_slice(&chunk[..n]);
        // Throttle UI updates: tiny TCP reads must not flood the WebView.
        if sealed.len() - last_report >= 256 * 1024 || sealed.len() == length {
            last_report = sealed.len();
            report(sealed.len(), length);
        }
    }
    let clear = cipher.decrypt(XNonce::from_slice(&header[6..30]), sealed.as_ref())
        .map_err(|_| "Transfer authentication failed; packet not accepted".to_string())?;
    if clear.len() > MAX_ZIP_BYTES || !clear.starts_with(b"PK\x03\x04") {
        return Err("Received packet is not a Commons ZIP".into());
    }
    Ok(URL_SAFE_NO_PAD.encode(clear))
}
#[cfg(test)]
fn receive(invite: &str) -> Result<String, String> {
    receive_with_progress(invite, |_received, _total| {})
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
    // Bonjour publishes ONLY an ephemeral device label, IPv4 and port.
    // The 256-bit invitation key stays out of multicast advertisements.
    let mut instance_seed=[0_u8; 4];
    OsRng.fill_bytes(&mut instance_seed);
    let instance=format!("Commons-{}", URL_SAFE_NO_PAD.encode(instance_seed));
    let mdns=advertise_nearby(port,&instance);
    let expiry = Instant::now() + SHARE_LIFETIME;
    let closed = Arc::new(AtomicBool::new(false));
    let phase = Arc::new(AtomicU8::new(WAITING));
    let sent_bytes = Arc::new(AtomicUsize::new(0));
    let total_bytes = zip.len() + 16; // Authenticated ciphertext payload, excluding the framing header.
    let flag = closed.clone();
    let thread_phase = phase.clone();
    let thread_sent = sent_bytes.clone();
    thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) && Instant::now() < expiry {
            match listener.accept() {
                Ok((socket, peer)) => {
                    if !allowed_lan_peer(peer.ip()) { continue; }
                    // Failed/mismatched invitations do not consume the one-shot share.
                    let result = transmit_with_progress(socket, &key, &zip, flag.as_ref(), |sent, _| {
                        if !flag.load(Ordering::SeqCst) {
                            thread_phase.store(SENDING, Ordering::SeqCst);
                            thread_sent.store(sent, Ordering::SeqCst);
                        }
                    });
                    if result.is_ok() && !flag.load(Ordering::SeqCst) {
                        // Only the still-active sending phase may become delivered.
                        // If Stop won the race, the truncated/aborted send stays stopped.
                        if thread_phase.compare_exchange(
                            SENDING, DELIVERED, Ordering::SeqCst, Ordering::SeqCst,
                        ).is_ok() {
                            flag.store(true, Ordering::SeqCst);
                        }
                        break;
                    }
                    if !flag.load(Ordering::SeqCst) {
                        thread_phase.store(WAITING, Ordering::SeqCst);
                        thread_sent.store(0, Ordering::SeqCst);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock =>
                    thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        if !flag.load(Ordering::SeqCst) && thread_phase.load(Ordering::SeqCst) == WAITING {
            thread_phase.store(EXPIRED, Ordering::SeqCst);
        }
        flag.store(true, Ordering::SeqCst);
        if let Some(daemon)=mdns { let _=daemon.shutdown(); }
    });
    *current = Some(ActiveShare {closed, expiry, addresses:invites.clone(), instance,
        phase, sent_bytes, total_bytes});
    Ok(LanInfo {active:true,invites,seconds_remaining:300,
        phase:"waiting".into(),sent_bytes:0,total_bytes,
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
        let phase = item.phase.load(Ordering::SeqCst);
        let live = !item.closed.load(Ordering::SeqCst) && Instant::now() < item.expiry;
        let phase_name = match phase {
            SENDING if live => "sending",
            DELIVERED => "delivered",
            STOPPED => "stopped",
            EXPIRED => "expired",
            _ if live => "waiting",
            _ => "expired",
        };
        let message = match phase_name {
            "sending" => "Writing encrypted packet to receiver; ZIP verification pending",
            "delivered" => "Encrypted bytes written; receiver must still verify and approve contents",
            "stopped" => "Sender stopped the share; any in-flight transfer was interrupted",
            "expired" => "Five-minute invitation expired",
            _ => "Waiting for a receiver holding the private invitation",
        };
        return Ok(LanInfo {
            active:live,invites:if live {item.addresses.clone()}else{vec![]},
            seconds_remaining:if live {(item.expiry-Instant::now()).as_secs()}else{0},
            phase:phase_name.into(),sent_bytes:item.sent_bytes.load(Ordering::SeqCst),
            total_bytes:item.total_bytes,message:message.into(),
        });
    }
    Ok(LanInfo {active:false,invites:vec![],seconds_remaining:0,
        phase:"idle".into(),sent_bytes:0,total_bytes:0,
        message:"No active LAN share".into()})
}

#[tauri::command]
pub async fn commons_lan_receive(invite: String, app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        receive_with_progress(&invite, |received, total| {
            let _ = app.emit("commons-lan-progress", LanTransferProgress {
                received_bytes: received,
                total_bytes: total,
            });
        })
    }).await.map_err(|_| "LAN receive task did not finish".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lan_share_listener_refuses_public_origin_addresses() {
        use std::net::{IpAddr,Ipv4Addr,Ipv6Addr};
        for ip in ["127.0.0.1","192.168.2.10","10.10.0.3","172.31.1.1","169.254.20.1"] {
            assert!(allowed_lan_peer(IpAddr::V4(ip.parse::<Ipv4Addr>().unwrap())), "{ip}");
        }
        for ip in ["8.8.8.8","1.1.1.1","172.32.1.1","203.0.113.4"] {
            assert!(!allowed_lan_peer(IpAddr::V4(ip.parse::<Ipv4Addr>().unwrap())), "{ip}");
        }
        assert!(!allowed_lan_peer(IpAddr::V6("::1".parse::<Ipv6Addr>().unwrap())));
    }
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
    fn encrypted_packet_progress_is_monotonic_and_complete() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let key = [71_u8; 32];
        let payload = {
            let mut p = b"PK\x03\x04".to_vec();
            p.extend(vec![42_u8; 750_000]);
            p
        };
        let expected = payload.clone();
        let sender = thread::spawn(move || {
            let (socket, _) = listener.accept().unwrap();
            transmit(socket, &key, &payload).unwrap();
        });
        let invitation = format!("uboxlan://{}/{}", address, URL_SAFE_NO_PAD.encode(key));
        let mut previous = 0;
        let mut calls = 0;
        let data = receive_with_progress(&invitation, |received, total| {
            assert!(received >= previous);
            assert!(received <= total);
            previous = received;
            calls += 1;
        }).unwrap();
        assert!(calls > 1);
        assert_eq!(URL_SAFE_NO_PAD.decode(data).unwrap(), expected);
        assert_eq!(previous, expected.len() + 16);
        sender.join().unwrap();
    }
    #[test]
    fn sender_encrypted_payload_progress_is_bounded_monotonic_and_finishes() {
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
        let addr=listener.local_addr().unwrap();
        let key=[31_u8;32];
        let mut payload=b"PK\x03\x04".to_vec();
        payload.extend(vec![17_u8;410_000]);
        let target=payload.clone();
        let sender=thread::spawn(move || {
            let (socket,_)=listener.accept().unwrap();
            let mut last=0_usize;
            let mut count=0;
            transmit_with_progress(socket,&key,&payload,&AtomicBool::new(false),|sent,total|{
                assert!(sent>=last && sent<=total);
                assert_eq!(total,payload.len()+16);
                last=sent;count+=1;
            }).unwrap();
            assert_eq!(last,payload.len()+16);
            assert!(count>=4);
        });
        let invite=format!("uboxlan://{}/{}",addr,URL_SAFE_NO_PAD.encode(key));
        let got=receive(&invite).unwrap();
        assert_eq!(URL_SAFE_NO_PAD.decode(got).unwrap(),target);
        sender.join().unwrap();
    }
    #[test]
    fn stop_interrupts_an_already_authenticated_oversized_inflight_send() {
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
        let addr=listener.local_addr().unwrap();
        let key=[27_u8;32];
        let mut payload=b"PK\x03\x04".to_vec();
        payload.extend(vec![9_u8;900_000]);
        let cancelled=Arc::new(AtomicBool::new(false));
        let flag=cancelled.clone();
        let sender=thread::spawn(move || {
            let (socket,_)=listener.accept().unwrap();
            let mut sent=0;
            let result=transmit_with_progress(socket,&key,&payload,flag.as_ref(),|n,_|{
                sent=n;
                if n>0 {flag.store(true,Ordering::SeqCst);}
            });
            (result,sent)
        });
        let invite=format!("uboxlan://{}/{}",addr,URL_SAFE_NO_PAD.encode(key));
        assert!(receive(&invite).is_err(),"Truncated authenticated packet must be rejected");
        let (result,sent)=sender.join().unwrap();
        assert!(result.is_err(),"Cancelled active send must not claim completed");
        assert_eq!(sent,SEND_BLOCK,"Stop after first block must prevent further ciphertext delivery");
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
