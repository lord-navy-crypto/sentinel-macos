//! Universal Box nearby pairing: sender requests, receiver approves in-app.
 //! Opt-in mDNS, ephemeral X25519 + HKDF keys, XChaCha20-Poly1305 payloads.
 //! Both Macs display a six-digit SAS, which users should compare to detect MITM.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{aead::{Aead, KeyInit, OsRng, rand_core::RngCore}, Key, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use sha2::Sha256;
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, State};
use x25519_dalek::{EphemeralSecret, PublicKey};

const MARKER: &[u8;6]=b"UBPR02";
const SERVICE: &str="_uboxpair._tcp.local.";
const LIFE:Duration=Duration::from_secs(300);
const APPROVAL:Duration=Duration::from_secs(45);
const MAX_ZIP:usize=30_000_000;
const NETWORK_TIMEOUT:Duration=Duration::from_secs(8);
const MAX_PENDING:usize=3;

#[derive(Default)]
pub struct PairState(Mutex<Option<Receiver>>);
struct Receiver{
    closed:Arc<AtomicBool>,
    expiry:Instant,
    pending:Arc<Mutex<Vec<Pending>>>,
    inbox:Arc<Mutex<Vec<Received>>>,
}
struct Pending{
    id:String,label:String,address:String,code:String,
    created:Instant,respond:mpsc::Sender<bool>,
}
struct Received{id:String,label:String,bytes:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PairStatus{active:bool,seconds_remaining:u64}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PairDevice{instance:String,label:String,ip:String,port:u16}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PairPending{id:String,label:String,address:String,code:String,remaining_seconds:u64}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PairInbox{id:String,label:String}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct PairCode{code:String}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct SendProgress{sent_bytes:usize,total_bytes:usize}

fn private_addresses()->Vec<Ipv4Addr>{
    let mut v:Vec<Ipv4Addr>=if_addrs::get_if_addrs().unwrap_or_default().iter().filter_map(|iface|
        match iface.ip(){IpAddr::V4(ip) if ip.is_private()&&!ip.is_loopback()=>Some(ip),_=>None}
    ).collect();
    v.sort();v.dedup();v
}
fn validate_target(ip:&str,port:u16)->Result<SocketAddrV4,String>{
    let address:Ipv4Addr=ip.parse().map_err(|_|"Invalid local IPv4 address")?;
    if !(address.is_private()||address.is_link_local())||address.is_loopback()||port==0 {
        return Err("Only private nearby IPv4 addresses are allowed".into());
    }
    Ok(SocketAddrV4::new(address,port))
}
fn validate_zip(encoded:&str)->Result<Vec<u8>,String>{
    if encoded.len()>40_000_000{return Err("Packet exceeds the 30 MB LAN limit".into());}
    let zip=URL_SAFE_NO_PAD.decode(encoded).map_err(|_|"Invalid base64url ZIP")?;
    if zip.len()<4||zip.len()>MAX_ZIP||!zip.starts_with(b"PK\x03\x04") {
        return Err("Select a valid Commons ZIP not exceeding 30 MB".into());
    }
    Ok(zip)
}
fn derive(shared:&[u8;32],sender:&[u8;32],receiver:&[u8;32])->Result<([u8;32],String),String>{
    if shared.iter().all(|x|*x==0){return Err("Unsafe ECDH peer public key".into());}
    let mut context=[0u8;64];
    context[..32].copy_from_slice(sender);
    context[32..].copy_from_slice(receiver);
    let kdf=Hkdf::<Sha256>::new(Some(&context),shared);
    let mut key=[0u8;32];let mut sas=[0u8;4];
    kdf.expand(b"UniversalBox-E2E-Payload-v2",&mut key).map_err(|_|"Key derivation failed")?;
    kdf.expand(b"UniversalBox-Compare-Code-v2",&mut sas).map_err(|_|"Code derivation failed")?;
    Ok((key,format!("{:06}",u32::from_be_bytes(sas)%1_000_000)))
}
fn advertise(port:u16,instance:&str)->Option<ServiceDaemon>{
    let addresses:Vec<IpAddr>=private_addresses().into_iter().map(IpAddr::V4).collect();
    if addresses.is_empty(){return None;}
    let daemon=ServiceDaemon::new().ok()?;
    let service=ServiceInfo::new(SERVICE,instance,"ubox-pair.local.",&addresses[..],port,None).ok()?;
    if daemon.register(service).is_err(){let _=daemon.shutdown();return None;}
    Some(daemon)
}
fn discover()->Result<Vec<PairDevice>,String>{
    let daemon=ServiceDaemon::new().map_err(|e|format!("Bonjour unavailable: {e}"))?;
    let rx=daemon.browse(SERVICE).map_err(|e|format!("Bonjour scan failed: {e}"))?;
    let deadline=Instant::now()+Duration::from_secs(3);
    let mut peers=std::collections::BTreeMap::<String,PairDevice>::new();
    while Instant::now()<deadline {
        let remaining=deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(remaining.min(Duration::from_millis(350))) {
            Ok(ServiceEvent::ServiceResolved(info))=>{
                let name=info.get_fullname().split('.').next().unwrap_or("").to_owned();
                if !name.starts_with("UBPair-")||name.len()>60||info.get_port()==0{continue;}
                for ip in info.get_addresses_v4(){
                    if !(ip.is_private()||ip.is_link_local())||ip.is_loopback(){continue;}
                    let port=info.get_port();let key=format!("{ip}:{port}");
                    peers.entry(key).or_insert_with(||PairDevice{
                        instance:name.clone(),label:"Universal Box · 等待接收".into(),
                        ip:ip.to_string(),port
                    });
                }
            }
            _=>{},
        }
    }
    let _=daemon.stop_browse(SERVICE);let _=daemon.shutdown();
    Ok(peers.into_values().take(32).collect())
}
fn random_id()->String{
    let mut bytes=[0u8;12];OsRng.fill_bytes(&mut bytes);URL_SAFE_NO_PAD.encode(bytes)
}
fn read_payload(stream:&mut TcpStream,key:&[u8;32])->Result<Vec<u8>,String>{
    let mut header=[0u8;28];stream.read_exact(&mut header).map_err(|e|format!("Could not read paired transfer header: {e}"))?;
    let len=u32::from_be_bytes(header[24..28].try_into().map_err(|_|"Invalid payload length")?) as usize;
    if len<20||len>MAX_ZIP+16{return Err("Encrypted packet size outside allowed range".into());}
    let mut sealed=Vec::with_capacity(len);
    let mut chunk=[0u8;256*1024];
    while sealed.len()<len {
        let length=chunk.len().min(len-sealed.len());
        let n=stream.read(&mut chunk[..length]).map_err(|e|format!("LAN transfer interrupted: {e}"))?;
        if n==0{return Err("Sender stopped before payload was complete".into());}
        sealed.extend_from_slice(&chunk[..n]);
    }
    let cipher=XChaCha20Poly1305::new(Key::from_slice(key));
    let zip=cipher.decrypt(XNonce::from_slice(&header[..24]),sealed.as_ref())
        .map_err(|_|"Encrypted transfer authentication failed")?;
    if zip.len()<4||zip.len()>MAX_ZIP||!zip.starts_with(b"PK\x03\x04"){
        return Err("Decrypted data is not a valid Commons ZIP".into());
    }
    Ok(zip)
}
fn serve(mut stream:TcpStream,source:String,pending:Arc<Mutex<Vec<Pending>>>,inbox:Arc<Mutex<Vec<Received>>>,closed:Arc<AtomicBool>)->Result<(),String>{
    stream.set_read_timeout(Some(NETWORK_TIMEOUT)).map_err(|e|e.to_string())?;
    stream.set_write_timeout(Some(NETWORK_TIMEOUT)).map_err(|e|e.to_string())?;
    let mut marker=[0u8;6];stream.read_exact(&mut marker).map_err(|e|e.to_string())?;
    if &marker!=MARKER{return Err("Unknown pairing protocol".into());}
    let mut their_public=[0u8;32];stream.read_exact(&mut their_public).map_err(|e|e.to_string())?;
    let mut len=[0u8;1];stream.read_exact(&mut len).map_err(|e|e.to_string())?;
    if len[0]==0||len[0]>60{return Err("Sender label exceeds limit".into());}
    let mut raw=vec![0u8;len[0] as usize];stream.read_exact(&mut raw).map_err(|e|e.to_string())?;
    let label=String::from_utf8(raw).map_err(|_|"Invalid sender device label")?;
    if label.chars().any(char::is_control){return Err("Invalid device label".into());}
    let secret=EphemeralSecret::random_from_rng(OsRng);
    let public=PublicKey::from(&secret);
    let shared=secret.diffie_hellman(&PublicKey::from(their_public));
    let (key,code)=derive(shared.as_bytes(),&their_public,public.as_bytes())?;
    stream.write_all(public.as_bytes()).map_err(|e|e.to_string())?;
    let (tx,rx)=mpsc::channel::<bool>();
    let id=random_id();
    {
        let mut queue=pending.lock().map_err(|_|"Approval queue unavailable")?;
        queue.retain(|r|r.created.elapsed()<APPROVAL);
        if queue.len()>=MAX_PENDING{return Err("Too many simultaneous pairing requests".into());}
        queue.push(Pending{id:id.clone(),label:label.clone(),address:source,code,created:Instant::now(),respond:tx});
    }
    let mut approved=false;
    for _ in 0..45{
        if closed.load(Ordering::SeqCst){break;}
        match rx.recv_timeout(Duration::from_secs(1)){
            Ok(decision)=>{approved=decision;break;}
            Err(mpsc::RecvTimeoutError::Disconnected)=>break,
            Err(mpsc::RecvTimeoutError::Timeout)=>continue,
        }
    }
    if let Ok(mut queue)=pending.lock(){queue.retain(|r|r.id!=id);}
    if !approved||closed.load(Ordering::SeqCst){
        let _=stream.write_all(b"DENY");
        return Err("Request declined or expired".into());
    }
    stream.write_all(b"OKAY").map_err(|e|e.to_string())?;
    let zip=read_payload(&mut stream,&key)?;
    let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
    let mut ack_nonce=[0u8;24];OsRng.fill_bytes(&mut ack_nonce);
    let ack=cipher.encrypt(XNonce::from_slice(&ack_nonce),b"PASS".as_ref())
        .map_err(|_|"Cannot authenticate successful receipt")?;
    {
        let mut box_=inbox.lock().map_err(|_|"Received files are temporarily unavailable")?;
        if box_.len()>=2{return Err("Incoming file queue is full".into());}
        box_.push(Received{id:random_id(),label,bytes:URL_SAFE_NO_PAD.encode(zip)});
    }
    stream.write_all(&ack_nonce).map_err(|e|e.to_string())?;
    stream.write_all(&ack).map_err(|e|e.to_string())?;
    stream.flush().map_err(|e|e.to_string())?;
    closed.store(true,Ordering::SeqCst); // Single-use receiver, no repeated access.
    Ok(())
}
impl PairState {
    pub fn stop(&self){
        if let Ok(mut state)=self.0.lock(){
            if let Some(receiver)=state.take(){
                receiver.closed.store(true,Ordering::SeqCst);
                if let Ok(mut q)=receiver.pending.lock(){
                    for request in q.drain(..){let _=request.respond.send(false);}
                }
            }
        }
    }
}
#[tauri::command]
pub async fn commons_pair_ready(state:State<'_,PairState>)->Result<PairStatus,String>{
    state.stop();
    let listener=TcpListener::bind(("0.0.0.0",0)).map_err(|e|format!("Could not open receiver listener: {e}"))?;
    listener.set_nonblocking(true).map_err(|e|e.to_string())?;
    let port=listener.local_addr().map_err(|e|e.to_string())?.port();
    let instance=format!("UBPair-{}",random_id());
    let daemon=advertise(port,&instance).ok_or("No local network adapter available for nearby pairing")?;
    let expiry=Instant::now()+LIFE;
    let closed=Arc::new(AtomicBool::new(false));
    let pending=Arc::new(Mutex::new(Vec::new()));
    let inbox=Arc::new(Mutex::new(Vec::new()));
    let flag=closed.clone();let q=pending.clone();let box_=inbox.clone();
    let inflight=Arc::new(AtomicUsize::new(0));
    thread::spawn(move||{
        while !flag.load(Ordering::SeqCst)&&Instant::now()<expiry{
            match listener.accept(){
                Ok((socket,peer))=>{
                    if inflight.fetch_add(1,Ordering::SeqCst)>=4{
                        inflight.fetch_sub(1,Ordering::SeqCst);continue;
                    }
                    let requests=q.clone();let received=box_.clone();let shutdown=flag.clone();
                    let concurrent=inflight.clone();
                    thread::spawn(move||{
                        let _=serve(socket,peer.ip().to_string(),requests,received,shutdown);
                        concurrent.fetch_sub(1,Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>thread::sleep(Duration::from_millis(100)),
                Err(_)=>break,
            }
        }
        flag.store(true,Ordering::SeqCst);let _=daemon.shutdown();
    });
    let mut lock=state.0.lock().map_err(|_|"Nearby receiver state unavailable")?;
    *lock=Some(Receiver{closed,expiry,pending,inbox});
    Ok(PairStatus{active:true,seconds_remaining:300})
}
#[tauri::command]
pub async fn commons_pair_stop(state:State<'_,PairState>)->Result<(),String>{state.stop();Ok(())}
#[tauri::command]
pub async fn commons_pair_status(state:State<'_,PairState>)->Result<PairStatus,String>{
    let lock=state.0.lock().map_err(|_|"Nearby receiver state unavailable")?;
    if let Some(r)=lock.as_ref(){
        if !r.closed.load(Ordering::SeqCst)&&Instant::now()<r.expiry{
            return Ok(PairStatus{active:true,seconds_remaining:r.expiry.saturating_duration_since(Instant::now()).as_secs()});
        }
    }
    Ok(PairStatus{active:false,seconds_remaining:0})
}
#[tauri::command]
pub async fn commons_pair_discover()->Result<Vec<PairDevice>,String>{
    tauri::async_runtime::spawn_blocking(discover).await.map_err(|_|"Nearby search failed".to_string())?
}
#[tauri::command]
pub async fn commons_pair_pending(state:State<'_,PairState>)->Result<Vec<PairPending>,String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let Some(r)=lock.as_ref() else{return Ok(Vec::new())};
    if r.closed.load(Ordering::SeqCst){return Ok(Vec::new());}
    let q=r.pending.lock().map_err(|_|"Pair requests unavailable")?;
    Ok(q.iter().filter_map(|p|{
        let remaining=APPROVAL.saturating_sub(p.created.elapsed()).as_secs();
        (remaining>0).then(||PairPending{id:p.id.clone(),label:p.label.clone(),
            address:p.address.clone(),code:p.code.clone(),remaining_seconds:remaining})
    }).collect())
}
#[tauri::command]
pub async fn commons_pair_respond(id:String,approve:bool,state:State<'_,PairState>)->Result<(),String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let receiver=lock.as_ref().ok_or("Receiving mode is not active")?;
    if receiver.closed.load(Ordering::SeqCst){return Err("Receiving mode expired".into());}
    let mut queue=receiver.pending.lock().map_err(|_|"Pair approval queue unavailable")?;
    let index=queue.iter().position(|request|request.id==id).ok_or("Request is no longer pending")?;
    let item=queue.remove(index);
    if item.created.elapsed()>=APPROVAL{return Err("Pair request has expired".into());}
    item.respond.send(approve).map_err(|_|"The sender disconnected".to_string())
}
#[tauri::command]
pub async fn commons_pair_inbox(state:State<'_,PairState>)->Result<Vec<PairInbox>,String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let Some(receiver)=lock.as_ref() else{return Ok(Vec::new())};
    let box_=receiver.inbox.lock().map_err(|_|"Incoming files unavailable")?;
    Ok(box_.iter().map(|r|PairInbox{id:r.id.clone(),label:r.label.clone()}).collect())
}
#[tauri::command]
pub async fn commons_pair_take(id:String,state:State<'_,PairState>)->Result<String,String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let receiver=lock.as_ref().ok_or("No received files to import")?;
    let mut box_=receiver.inbox.lock().map_err(|_|"Received files unavailable")?;
    let index=box_.iter().position(|item|item.id==id).ok_or("Received packet already imported")?;
    Ok(box_.remove(index).bytes)
}
fn paired_send<F:FnMut(usize,usize),G:FnMut(String)>(
    address:SocketAddrV4,label:&str,zip:&[u8],mut report:F,mut display_code:G,
)->Result<(),String>{
    if label.is_empty()||label.len()>60||label.chars().any(char::is_control){
        return Err("Sender device label must be 1-60 UTF-8 bytes".into());
    }
    let mut socket=TcpStream::connect_timeout(&address.into(),NETWORK_TIMEOUT)
        .map_err(|e|format!("Cannot connect to receiving Mac: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_secs(55))).map_err(|e|e.to_string())?;
    socket.set_write_timeout(Some(NETWORK_TIMEOUT)).map_err(|e|e.to_string())?;
    let secret=EphemeralSecret::random_from_rng(OsRng);
    let public=PublicKey::from(&secret);
    socket.write_all(MARKER).map_err(|e|e.to_string())?;
    socket.write_all(public.as_bytes()).map_err(|e|e.to_string())?;
    socket.write_all(&[label.len() as u8]).map_err(|e|e.to_string())?;
    socket.write_all(label.as_bytes()).map_err(|e|e.to_string())?;
    let mut other=[0u8;32];
    socket.read_exact(&mut other).map_err(|e|format!("Receiver handshake failed: {e}"))?;
    let shared=secret.diffie_hellman(&PublicKey::from(other));
    let (key,code)=derive(shared.as_bytes(),public.as_bytes(),&other)?;
    display_code(code);
    let mut verdict=[0u8;4];
    socket.read_exact(&mut verdict).map_err(|e|format!("Receiver did not approve the request: {e}"))?;
    if &verdict!=b"OKAY"{return Err("Receiver declined or timed out".into());}
    let mut nonce=[0u8;24];OsRng.fill_bytes(&mut nonce);
    let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
    let sealed=cipher.encrypt(XNonce::from_slice(&nonce),zip)
        .map_err(|_|"Cannot encrypt team ZIP")?;
    let len:u32=sealed.len().try_into().map_err(|_|"Encrypted packet too large")?;
    socket.write_all(&nonce).map_err(|e|e.to_string())?;
    socket.write_all(&len.to_be_bytes()).map_err(|e|e.to_string())?;
    report(0,sealed.len());
    for chunk in sealed.chunks(256*1024){
        socket.write_all(chunk).map_err(|e|format!("Failed to send encrypted packet: {e}"))?;
        // Progress describes socket writes, not final end-to-end verification.
        let written=chunk.len();
        // Cumulative count stored in the next report below.
        let _=written;
    }
    report(sealed.len(),sealed.len());
    socket.flush().map_err(|e|e.to_string())?;
    let mut response=[0u8;24+20];
    socket.read_exact(&mut response).map_err(|e|format!("No authenticated completion from recipient: {e}"))?;
    let ack=cipher.decrypt(XNonce::from_slice(&response[..24]),&response[24..])
        .map_err(|_|"Recipient confirmation failed authentication")?;
    if ack!=b"PASS"{return Err("Receiver did not confirm receipt".into());}
    Ok(())
}
#[tauri::command]
pub async fn commons_pair_send(ip:String,port:u16,label:String,packet_base64:String,app:tauri::AppHandle)->Result<(),String>{
    let target=validate_target(&ip,port)?;
    let zip=validate_zip(&packet_base64)?;
    tauri::async_runtime::spawn_blocking(move||{
        paired_send(target,&label,&zip,
            |sent,total|{let _=app.emit("commons-pair-progress",SendProgress{sent_bytes:sent,total_bytes:total});},
            |code|{let _=app.emit("commons-pair-code",PairCode{code});},
        )
    }).await.map_err(|_|"Sending task failed".to_string())?
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn key_and_code_match_on_both_macs(){
        let sender=EphemeralSecret::random_from_rng(OsRng);let ap=PublicKey::from(&sender);
        let receiver=EphemeralSecret::random_from_rng(OsRng);let bp=PublicKey::from(&receiver);
        let a=sender.diffie_hellman(&bp);let b=receiver.diffie_hellman(&ap);
        assert_eq!(derive(a.as_bytes(),ap.as_bytes(),bp.as_bytes()).unwrap(),
                   derive(b.as_bytes(),ap.as_bytes(),bp.as_bytes()).unwrap());
    }
    #[test]
    fn invalid_public_addresses_and_payloads_are_rejected(){
        assert!(validate_target("8.8.8.8",1234).is_err());
        assert!(validate_target("127.0.0.1",1234).is_err());
        assert!(validate_target("192.168.1.2",0).is_err());
        assert!(validate_target("192.168.1.2",1234).is_ok());
        assert!(validate_zip(&URL_SAFE_NO_PAD.encode(b"not a zip")).is_err());
        assert!(derive(&[0u8;32],&[1u8;32],&[2u8;32]).is_err());
    }
    #[test]
    fn sender_request_recipient_approval_local_roundtrip(){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
        let addr=listener.local_addr().unwrap();
        let q=Arc::new(Mutex::new(Vec::<Pending>::new()));
        let b=Arc::new(Mutex::new(Vec::<Received>::new()));
        let queue=q.clone();let box_=b.clone();
        let recipient=thread::spawn(move||{
            let (socket,from)=listener.accept().unwrap();
            serve(socket,from.ip().to_string(),q,b,Arc::new(AtomicBool::new(false))).unwrap()
        });
        let approvals=thread::spawn(move||{
            for _ in 0..100{
                if let Ok(mut list)=queue.lock(){
                    if !list.is_empty(){list.remove(0).respond.send(true).unwrap();return;}
                }
                thread::sleep(Duration::from_millis(10));
            }
            panic!("No pending request arrived");
        });
        let addr=match addr {std::net::SocketAddr::V4(v)=>v,_=>unreachable!()};
        let packet=b"PK\x03\x04paired local fixture";
        let mut code=String::new();
        paired_send(addr,"Sender Mac",packet,|_,_|{},|c|code=c).unwrap();
        approvals.join().unwrap();recipient.join().unwrap();
        assert_eq!(code.len(),6);
        let inbox=box_.lock().unwrap();
        assert_eq!(inbox.len(),1);
        assert_eq!(URL_SAFE_NO_PAD.decode(&inbox[0].bytes).unwrap(),packet);
    }
}
