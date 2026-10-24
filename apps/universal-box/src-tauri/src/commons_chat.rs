//! Opt-in, ephemeral LAN group chat. The room host brokers encrypted messages in
//! volatile memory; no cloud, public address, durable account, or saved chat history.
//! A shared 256-bit invitation is a bearer capability, NOT verified user identity.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const MARKER: &[u8; 6] = b"UBCHAT";
const CHAT_LIFETIME: Duration = Duration::from_secs(3600);
const SOCKET_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_ACTIVE_CONNECTIONS: usize = 12;
const MAX_PARTICIPANTS: usize = 12;
const MAX_HISTORY: usize = 200;
const MAX_REPLY_MESSAGES: usize = 30;
const MAX_FRAME: usize = 65_536;

#[derive(Default)]
pub struct CommonsChatState(Mutex<Option<ActiveChat>>);
struct ActiveChat {
    stopped: Arc<AtomicBool>,
    expiry: Instant,
    invites: Vec<String>,
    room: String,
}
impl CommonsChatState {
    pub fn stop(&self) {
        if let Ok(mut current) = self.0.lock() {
            if let Some(room) = current.take() {
                room.stopped.store(true, Ordering::SeqCst);
            }
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatLine {
    seq: u64,
    nickname: String,
    text: String,
    timestamp_ms: u64,
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatSnapshot {
    room: String,
    messages: Vec<ChatLine>,
    participants: Vec<String>,
    has_more: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHostInfo {
    active: bool,
    room: String,
    invites: Vec<String>,
    seconds_remaining: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    nickname: String,
    text: Option<String>,
    message_id: Option<String>,
    since: u64,
}
struct ChatData {
    name: String,
    seq: u64,
    messages: VecDeque<ChatLine>,
    seen_ids: VecDeque<String>,
    seen_index: HashSet<String>,
    presence: BTreeMap<String, Instant>,
}
fn good_label(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
        && value.len() <= max * 4
        && !value.chars().any(|c| c.is_control())
}
fn local_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_loopback() || ip.is_link_local()
}
fn local_addrs() -> Vec<Ipv4Addr> {
    let mut list: Vec<Ipv4Addr> = if_addrs::get_if_addrs().unwrap_or_default()
        .iter().filter_map(|interface| match interface.ip() {
            IpAddr::V4(ip) if ip.is_private() && !ip.is_loopback() => Some(ip),
            _ => None,
        }).collect();
    list.sort(); list.dedup();
    list.push(Ipv4Addr::LOCALHOST);
    list
}
fn decode_chat_invite(invite: &str) -> Result<(SocketAddrV4, [u8; 32]), String> {
    if invite.len() > 180 || invite.trim() != invite {
        return Err("Chat invitation is malformed".into());
    }
    let rest = invite.strip_prefix("uboxchat://")
        .ok_or("Expected a private uboxchat:// LAN invitation")?;
    let (addr, encoded) = rest.split_once('/').ok_or("Chat invitation is incomplete")?;
    let endpoint = addr.parse::<SocketAddrV4>()
        .map_err(|_| "Chat invitation has an invalid local address")?;
    if !local_ipv4(*endpoint.ip()) || endpoint.port() == 0 {
        return Err("Internet endpoints are not allowed in LAN chat".into());
    }
    if encoded.len() != 43 || !encoded.bytes().all(|b|
        b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("Chat invitation must have a private 256-bit key".into());
    }
    let decoded = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| "Invalid chat invitation key")?;
    let key: [u8; 32] = decoded.try_into().map_err(|_| "Invalid chat invitation key size")?;
    Ok((endpoint, key))
}
fn read_sealed(socket: &mut TcpStream, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let mut frame = [0_u8; 34];
    socket.read_exact(&mut frame).map_err(|e| format!("Encrypted chat frame incomplete: {e}"))?;
    if &frame[..6] != MARKER { return Err("Unexpected chat protocol version".into()); }
    let len = u32::from_be_bytes(frame[30..34].try_into().unwrap()) as usize;
    if !(16..=MAX_FRAME).contains(&len) { return Err("Chat frame exceeds limits".into()); }
    let mut encrypted = vec![0; len];
    socket.read_exact(&mut encrypted).map_err(|e| format!("Encrypted chat payload incomplete: {e}"))?;
    XChaCha20Poly1305::new(Key::from_slice(key))
        .decrypt(XNonce::from_slice(&frame[6..30]), encrypted.as_ref())
        .map_err(|_| "Wrong chat invitation key or invalid authentication".into())
}
fn write_sealed(socket: &mut TcpStream, key: &[u8; 32], payload: &[u8]) -> Result<(), String> {
    if payload.len() > MAX_FRAME - 16 { return Err("Chat response exceeded size limit".into()); }
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = XChaCha20Poly1305::new(Key::from_slice(key))
        .encrypt(XNonce::from_slice(&nonce), payload)
        .map_err(|_| "Cannot encrypt chat packet".to_string())?;
    socket.write_all(MARKER).map_err(|e| e.to_string())?;
    socket.write_all(&nonce).map_err(|e| e.to_string())?;
    socket.write_all(&(encrypted.len() as u32).to_be_bytes()).map_err(|e| e.to_string())?;
    socket.write_all(&encrypted).map_err(|e| e.to_string())?;
    socket.flush().map_err(|e| e.to_string())
}
fn apply_request(data: &mut ChatData, request: ChatRequest) -> Result<ChatSnapshot, String> {
    let nickname = request.nickname.trim();
    if !good_label(nickname, 24) { return Err("Nickname must be 1–24 visible characters".into()); }
    data.presence.retain(|_,seen| seen.elapsed() < Duration::from_secs(20));
    if !data.presence.contains_key(nickname) && data.presence.len() >= MAX_PARTICIPANTS {
        return Err("LAN group is full (12 active nickname labels)".into());
    }
    data.presence.insert(nickname.into(), Instant::now());
    if let Some(text) = request.text {
        let text = text.trim();
        if !good_label(text, 1000) || text.len() > 4000 {
            return Err("Message must be 1–1000 visible characters and at most 4 KB".into());
        }
        let id = request.message_id.ok_or("Message needs a unique ID")?;
        if id.len() < 16 || id.len() > 64
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err("Invalid message identifier".into());
        }
        // Duplicate encrypted requests must not append the same message twice.
        if !data.seen_index.contains(&id) {
            data.seq += 1;
            let timestamp_ms = SystemTime::now().duration_since(UNIX_EPOCH)
                .unwrap_or_default().as_millis() as u64;
            data.messages.push_back(ChatLine {seq:data.seq,nickname:nickname.into(),
                text:text.into(),timestamp_ms});
            if data.messages.len() > MAX_HISTORY {data.messages.pop_front();}
            data.seen_ids.push_back(id.clone());
            data.seen_index.insert(id);
            if data.seen_ids.len() > 1000 {
                if let Some(evicted) = data.seen_ids.pop_front() { data.seen_index.remove(&evicted); }
            }
        }
    }
    let newer: Vec<ChatLine> = data.messages.iter()
        .filter(|message| message.seq > request.since)
        .take(MAX_REPLY_MESSAGES + 1).cloned().collect();
    let has_more = newer.len() > MAX_REPLY_MESSAGES;
    Ok(ChatSnapshot {room:data.name.clone(),messages:newer.into_iter()
        .take(MAX_REPLY_MESSAGES).collect(),participants:data.presence.keys().cloned().collect(),has_more})
}
fn serve_one(mut socket: TcpStream, secret: &[u8; 32],
    room: &Mutex<ChatData>, stopped: &AtomicBool) -> Result<(), String> {
    socket.set_read_timeout(Some(SOCKET_TIMEOUT)).map_err(|e| e.to_string())?;
    socket.set_write_timeout(Some(SOCKET_TIMEOUT)).map_err(|e| e.to_string())?;
    let raw = read_sealed(&mut socket, secret)?;
    if stopped.load(Ordering::SeqCst) {return Err("Chat room closed".into());}
    let req:ChatRequest=serde_json::from_slice(&raw).map_err(|_|"Invalid chat request JSON")?;
    let snapshot = apply_request(&mut room.lock().map_err(|_|"Chat state unavailable")?,req)?;
    let encoded = serde_json::to_vec(&snapshot).map_err(|_|"Could not serialize chat response")?;
    if stopped.load(Ordering::SeqCst) {return Err("Chat room closed".into());}
    write_sealed(&mut socket, secret, &encoded)
}
fn chat_exchange(invite:&str, nickname:&str, text:Option<&str>, message_id:Option<&str>,
    since:u64) -> Result<ChatSnapshot,String> {
    let (endpoint,key)=decode_chat_invite(invite)?;
    if !good_label(nickname.trim(),24) {return Err("Enter a nickname with 1–24 characters".into());}
    let req=ChatRequest {nickname:nickname.into(),text:text.map(str::to_owned),
        message_id:message_id.map(str::to_owned),since};
    let payload=serde_json::to_vec(&req).map_err(|_|"Cannot encode chat request")?;
    if payload.len()>6000 {return Err("Chat message exceeds request limit".into());}
    let mut socket=TcpStream::connect_timeout(&endpoint.into(),SOCKET_TIMEOUT)
        .map_err(|e|format!("Cannot reach LAN chat host: {e}"))?;
    socket.set_read_timeout(Some(SOCKET_TIMEOUT)).map_err(|e|e.to_string())?;
    socket.set_write_timeout(Some(SOCKET_TIMEOUT)).map_err(|e|e.to_string())?;
    write_sealed(&mut socket,&key,&payload)?;
    let reply=read_sealed(&mut socket,&key)?;
    serde_json::from_slice(&reply).map_err(|_|"Received invalid chat response".into())
}
#[tauri::command]
pub async fn commons_chat_host(room_name:String,state:State<'_,CommonsChatState>)
    -> Result<ChatHostInfo,String> {
    let room_name=room_name.trim().to_string();
    if !good_label(&room_name,48) {return Err("Group title must be 1–48 visible characters".into());}
    let mut guard=state.0.lock().map_err(|_|"Chat host state unavailable")?;
    if let Some(active)=guard.as_ref() {
        if !active.stopped.load(Ordering::SeqCst)&&Instant::now()<active.expiry {
            return Err("Already hosting one LAN group. Stop it before starting another.".into());
        }
        active.stopped.store(true,Ordering::SeqCst);
    }
    let listener=TcpListener::bind(("0.0.0.0",0))
        .map_err(|e|format!("Cannot open LAN group listener: {e}"))?;
    listener.set_nonblocking(true).map_err(|e|e.to_string())?;
    let port=listener.local_addr().map_err(|e|e.to_string())?.port();
    let mut key=[0_u8;32];OsRng.fill_bytes(&mut key);
    let token=URL_SAFE_NO_PAD.encode(key);
    let invites=local_addrs().iter().map(|ip|format!("uboxchat://{ip}:{port}/{token}"))
        .collect::<Vec<_>>();
    let stopped=Arc::new(AtomicBool::new(false));
    let expiry=Instant::now()+CHAT_LIFETIME;
    let shared=Arc::new(Mutex::new(ChatData{name:room_name.clone(),seq:0,
        messages:VecDeque::new(),seen_ids:VecDeque::new(),
        seen_index:HashSet::new(),presence:BTreeMap::new()}));
    let gate=stopped.clone();
    thread::spawn(move||{
        let active=Arc::new(AtomicUsize::new(0));
        while !gate.load(Ordering::SeqCst)&&Instant::now()<expiry {
            match listener.accept(){
                Ok((socket,peer))=>{
                    match peer.ip(){
                        IpAddr::V4(ip) if local_ipv4(ip)=>{},
                        _=>continue,
                    }
                    if active.fetch_add(1,Ordering::SeqCst)>=MAX_ACTIVE_CONNECTIONS {
                        active.fetch_sub(1,Ordering::SeqCst);
                        continue;
                    }
                    let room=shared.clone();let closed=gate.clone();let counter=active.clone();
                    thread::spawn(move||{
                        let _=serve_one(socket,&key,&room,&closed);
                        counter.fetch_sub(1,Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind()==std::io::ErrorKind::WouldBlock =>
                    thread::sleep(Duration::from_millis(65)),
                Err(_)=>break,
            }
        }
        gate.store(true,Ordering::SeqCst);
    });
    *guard=Some(ActiveChat {stopped,expiry,invites:invites.clone(),room:room_name.clone()});
    Ok(ChatHostInfo{active:true,room:room_name,invites,seconds_remaining:3600})
}
#[tauri::command]
pub async fn commons_chat_stop(state:State<'_,CommonsChatState>)->Result<(),String>{
    state.stop();Ok(())
}
#[tauri::command]
pub async fn commons_chat_exchange(invite:String,nickname:String,text:Option<String>,
    message_id:Option<String>,since:u64)->Result<ChatSnapshot,String>{
    tauri::async_runtime::spawn_blocking(move||
        chat_exchange(&invite,&nickname,text.as_deref(),message_id.as_deref(),since)
    ).await.map_err(|_|"Chat request task failed".to_string())?
}
#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn LAN_chat_invites_reject_public_and_malformed_addresses() {
    let key=URL_SAFE_NO_PAD.encode([5_u8;32]);
    assert!(decode_chat_invite(&format!("uboxchat://127.0.0.1:5555/{key}")).is_ok());
    for host in ["8.8.8.8","172.32.1.2","256.0.0.1","example.com"] {
        assert!(decode_chat_invite(&format!("uboxchat://{host}:5555/{key}")).is_err());
    }
    assert!(decode_chat_invite(&format!("uboxchat://127.0.0.1:5555/short")).is_err());
 }
 #[test]
 fn three_clients_exchange_encrypted_group_messages_without_replay() {
    let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
    let addr=listener.local_addr().unwrap();
    let secret=[13_u8;32];
    let data=Arc::new(Mutex::new(ChatData{name:"Study group".into(),seq:0,
        messages:VecDeque::new(),seen_ids:VecDeque::new(),seen_index:HashSet::new(),
        presence:BTreeMap::new()}));
    let stopped=Arc::new(AtomicBool::new(false));
    let sender_data=data.clone();let flag=stopped.clone();
    let host=thread::spawn(move||{
        for _ in 0..6 {
            let (socket,_) = listener.accept().unwrap();
            serve_one(socket,&secret,&sender_data,&flag).unwrap();
        }
    });
    let invite=format!("uboxchat://{addr}/{}",URL_SAFE_NO_PAD.encode(secret));
    let a=chat_exchange(&invite,"Alex",Some("你好"),Some("a-1234567890123456"),0).unwrap();
    assert_eq!(a.messages.len(),1);assert_eq!(a.messages[0].text,"你好");
    let b=chat_exchange(&invite,"Blair",None,None,0).unwrap();
    assert_eq!(b.messages.len(),1);assert_eq!(b.participants.len(),2);
    let c=chat_exchange(&invite,"Casey",Some("会议准备好了吗？"),Some("b-1234567890123456"),1).unwrap();
    assert_eq!(c.messages.len(),1);assert_eq!(c.messages[0].seq,2);
    let a2=chat_exchange(&invite,"Alex",None,None,1).unwrap();
    assert_eq!(a2.messages[0].nickname,"Casey");assert_eq!(a2.participants.len(),3);
    let replay=chat_exchange(&invite,"Blair",Some("duplicate"),Some("a-1234567890123456"),0).unwrap();
    assert_eq!(replay.messages.len(),2,"Replay must not create another message");
    let last=chat_exchange(&invite,"Casey",None,None,0).unwrap();
    assert_eq!(last.messages.len(),2);
    host.join().unwrap();
 }
 #[test]
 fn history_is_bounded_and_rejects_invalid_names_or_messages() {
    let mut d=ChatData{name:"Tiny".into(),seq:0,messages:VecDeque::new(),
        seen_ids:VecDeque::new(),seen_index:HashSet::new(),presence:BTreeMap::new()};
    assert!(apply_request(&mut d,ChatRequest{nickname:"\n".into(),
        text:None,message_id:None,since:0}).is_err());
    for n in 0..215 {
        apply_request(&mut d,ChatRequest{nickname:"N".into(),text:Some("hello".into()),
            message_id:Some(format!("unique-message-0000000000-{n}")),since:0}).unwrap();
    }
    assert_eq!(d.messages.len(),MAX_HISTORY);
    let p=apply_request(&mut d,ChatRequest{nickname:"N".into(),text:None,
        message_id:None,since:0}).unwrap();
    assert_eq!(p.messages.len(),MAX_REPLY_MESSAGES);
    assert!(p.has_more);
    assert_eq!(p.messages[0].seq,16);
    assert!(apply_request(&mut d,ChatRequest{nickname:"N".into(),
        text:Some("x".repeat(1001)),message_id:Some("manywords0000000000000".into()),
        since:0}).is_err());
 }
}
