//! Opt-in LAN pairing for Universal Commons. No invites sent through external apps.
 //! A discovered offer contains only an ephemeral mDNS label and address.
 //! Data stays encrypted with a fresh X25519 ECDH / HKDF / XChaCha20-Poly1305 key.
 //! Six-digit SAS must be checked on both Macs to detect active impostors.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
    Key, XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use sha2::Sha256;
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    sync::{atomic::{AtomicBool, Ordering}, mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, State};
use x25519_dalek::{EphemeralSecret, PublicKey};

const PAIR_MARKER: &[u8; 6] = b"UBPR02";
const PAIR_DISCOVERY: &str = "_uboxpair._tcp.local.";
const PAIR_LIFETIME: Duration = Duration::from_secs(300);
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_BYTES: usize = 30_000_000;
const MAX_PENDING: usize = 3;
const SOCKET_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default)]
pub struct PairState(Mutex<Option<PairOffer>>);

struct PairOffer {
    closed: Arc<AtomicBool>,
    expiry: Instant,
    pending: Arc<Mutex<Vec<Approval>>>,
}
struct Approval {
    id: String,
    label: String,
    address: String,
    code: String,
    created: Instant,
    answer: mpsc::Sender<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairPending {
    id: String,
    label: String,
    address: String,
    code: String,
    remaining_seconds: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairInfo {
    active: bool,
    seconds_remaining: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    instance: String,
    label: String,
    ip: String,
    port: u16,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairProgress {
    received_bytes: usize,
    total_bytes: usize,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairCode {
    code: String,
    label: String,
}
fn local_ips() -> Vec<Ipv4Addr> {
    let mut addrs: Vec<Ipv4Addr> = if_addrs::get_if_addrs().unwrap_or_default()
        .iter().filter_map(|iface| match iface.ip() {
            IpAddr::V4(v4) if v4.is_private() && !v4.is_loopback() => Some(v4),
            _ => None,
        }).collect();
    addrs.sort(); addrs.dedup();
    addrs
}
fn secure_zip(encoded: &str) -> Result<Vec<u8>, String> {
    if encoded.len() > 40_000_000 {return Err("Share payload exceeds 30 MB limit".into());}
    let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|_|"Invalid local share data")?;
    if bytes.len() > MAX_BYTES || bytes.len() < 4 || !bytes.starts_with(b"PK\x03\x04") {
        return Err("Only a Universal Commons ZIP up to 30 MB can be shared".into());
    }
    Ok(bytes)
}
fn derive(shared: &[u8; 32], a: &[u8; 32], b: &[u8; 32]) -> Result<([u8; 32], String), String> {
    if shared.iter().all(|n|*n==0) {return Err("Unsafe public key".into());}
    let mut transcript = Vec::with_capacity(64);
    transcript.extend_from_slice(a); transcript.extend_from_slice(b);
    let hk=Hkdf::<Sha256>::new(Some(&transcript), shared);
    let mut key=[0u8;32];let mut sas=[0u8;4];
    hk.expand(b"UniversalBox-Pair-Encryption-v2",&mut key).map_err(|_|"Pair derivation failed")?;
    hk.expand(b"UniversalBox-Pair-SAS-v2",&mut sas).map_err(|_|"Pair code derivation failed")?;
    let digits=u32::from_be_bytes(sas)%1_000_000;
    Ok((key,format!("{digits:06}")))
}
fn advertise(port:u16,instance:&str)->Option<ServiceDaemon>{
    let addrs:Vec<IpAddr>=local_ips().into_iter().map(IpAddr::V4).collect();
    if addrs.is_empty(){return None;}
    let daemon=ServiceDaemon::new().ok()?;
    let info=ServiceInfo::new(PAIR_DISCOVERY,instance,"uboxpair.local.",&addrs[..],port,None).ok()?;
    if daemon.register(info).is_err(){let _=daemon.shutdown();return None;}
    Some(daemon)
}
fn discover() -> Result<Vec<PairedDevice>,String>{
    let daemon=ServiceDaemon::new().map_err(|e|format!("Nearby search unavailable: {e}"))?;
    let rx=daemon.browse(PAIR_DISCOVERY).map_err(|e|format!("Could not browse paired shares: {e}"))?;
    let until=Instant::now()+Duration::from_secs(3);
    let mut found=std::collections::BTreeMap::<String,PairedDevice>::new();
    while Instant::now()<until {
        let delay=until.saturating_duration_since(Instant::now());
        match rx.recv_timeout(delay.min(Duration::from_millis(350))){
            Ok(ServiceEvent::ServiceResolved(info))=>{
                let instance=info.get_fullname().split('.').next().unwrap_or("").to_owned();
                if !instance.starts_with("UBPair-") || instance.len()>60 || info.get_port()==0 {continue;}
                for ip in info.get_addresses_v4(){
                    if !(ip.is_private()||ip.is_link_local())||ip.is_loopback(){continue;}
                    let port=info.get_port();let key=format!("{ip}:{port}");
                    found.entry(key).or_insert_with(||PairedDevice{
                        instance:instance.clone(),label:"Universal Box · 可接收请求".into(),
                        ip:ip.to_string(),port,
                    });
                }
            }
            _=>{},
        }
    }
    let _=daemon.stop_browse(PAIR_DISCOVERY);
    let _=daemon.shutdown();
    Ok(found.into_values().take(32).collect())
}
fn handle_pair(mut stream:TcpStream,zip:&[u8],peer:String,pending:Arc<Mutex<Vec<Approval>>>,closed:Arc<AtomicBool>) -> Result<(),String>{
    stream.set_read_timeout(Some(SOCKET_TIMEOUT)).map_err(|e|e.to_string())?;
    stream.set_write_timeout(Some(SOCKET_TIMEOUT)).map_err(|e|e.to_string())?;
    let mut marker=[0u8;6];stream.read_exact(&mut marker).map_err(|e|e.to_string())?;
    if marker!=*PAIR_MARKER{return Err("Unknown local pairing protocol".into());}
    let mut remote=[0u8;32];stream.read_exact(&mut remote).map_err(|e|e.to_string())?;
    let mut count=[0u8;1];stream.read_exact(&mut count).map_err(|e|e.to_string())?;
    if count[0]==0||count[0]>60{return Err("Invalid nearby device label".into());}
    let mut buffer=vec![0u8;count[0] as usize];stream.read_exact(&mut buffer).map_err(|e|e.to_string())?;
    let label=String::from_utf8(buffer).map_err(|_|"Invalid device label")?;
    if label.chars().any(char::is_control){return Err("Invalid device label".into());}
    let secret=EphemeralSecret::random_from_rng(OsRng);
    let public=PublicKey::from(&secret);
    let remote_public=PublicKey::from(remote);
    let shared=secret.diffie_hellman(&remote_public);
    let (key,code)=derive(shared.as_bytes(),&remote,public.as_bytes())?;
    // The return key is public. The ECDH secret never crosses the wire.
    stream.write_all(public.as_bytes()).map_err(|e|e.to_string())?;
    let (tx,rx)=mpsc::channel::<bool>();
    let mut random=[0u8;12];OsRng.fill_bytes(&mut random);
    let id=URL_SAFE_NO_PAD.encode(random);
    {
        let mut list=pending.lock().map_err(|_|"Approval queue unavailable")?;
        list.retain(|request|request.created.elapsed()<APPROVAL_TIMEOUT);
        if list.len()>=MAX_PENDING{return Err("Too many pending requests".into());}
        list.push(Approval{id:id.clone(),label,address:peer,code,created:Instant::now(),answer:tx});
    }
    let mut approved=false;
    for _ in 0..45 {
        if closed.load(Ordering::SeqCst){break;}
        match rx.recv_timeout(Duration::from_secs(1)){
            Ok(yes)=>{approved=yes;break;}
            Err(mpsc::RecvTimeoutError::Disconnected)=>break,
            Err(mpsc::RecvTimeoutError::Timeout)=>continue,
        }
    }
    if let Ok(mut list)=pending.lock(){list.retain(|item|item.id!=id);}
    if !approved||closed.load(Ordering::SeqCst){
        let _=stream.write_all(b"DENY");
        return Err("Transfer not approved".into());
    }
    stream.write_all(b"OKAY").map_err(|e|e.to_string())?;
    let mut nonce=[0u8;24];OsRng.fill_bytes(&mut nonce);
    let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
    let sealed=cipher.encrypt(XNonce::from_slice(&nonce),zip)
        .map_err(|_|"Could not encrypt approved packet")?;
    let count:u32=sealed.len().try_into().map_err(|_|"Packet length is too large")?;
    stream.write_all(&nonce).map_err(|e|e.to_string())?;
    stream.write_all(&count.to_be_bytes()).map_err(|e|e.to_string())?;
    stream.write_all(&sealed).map_err(|e|e.to_string())?;
    stream.flush().map_err(|e|e.to_string())?;
    Ok(())
}
impl PairState {
    pub fn stop(&self) {
        if let Ok(mut state)=self.0.lock(){
            if let Some(offer)=state.take(){
                offer.closed.store(true,Ordering::SeqCst);
                if let Ok(mut q)=offer.pending.lock(){
                    for r in q.drain(..){let _=r.answer.send(false);}
                }
            }
        }
    }
}
#[tauri::command]
pub async fn commons_pair_start(packet_base64:String,state:State<'_,PairState>)->Result<PairInfo,String>{
    let zip=Arc::new(secure_zip(&packet_base64)?);
    state.stop();
    let listener=TcpListener::bind(("0.0.0.0",0)).map_err(|e|format!("Cannot start local pairing: {e}"))?;
    listener.set_nonblocking(true).map_err(|e|e.to_string())?;
    let port=listener.local_addr().map_err(|e|e.to_string())?.port();
    let expiry=Instant::now()+PAIR_LIFETIME;
    let closed=Arc::new(AtomicBool::new(false));
    let pending=Arc::new(Mutex::new(Vec::<Approval>::new()));
    let mut bytes=[0u8;7];OsRng.fill_bytes(&mut bytes);
    let instance=format!("UBPair-{}",URL_SAFE_NO_PAD.encode(bytes));
    let mdns=advertise(port,&instance);
    if mdns.is_none(){return Err("No active private IPv4 adapter supports Bonjour discovery".into());}
    let flag=closed.clone();let queue=pending.clone();
    thread::spawn(move||{
        while !flag.load(Ordering::SeqCst)&&Instant::now()<expiry {
            match listener.accept(){
                Ok((socket,peer))=>{
                    let data=zip.clone();let requests=queue.clone();let done=flag.clone();
                    thread::spawn(move||{
                        if handle_pair(socket,&data,peer.ip().to_string(),requests,done.clone()).is_ok(){
                            done.store(true,Ordering::SeqCst);
                        }
                    });
                }
                Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>thread::sleep(Duration::from_millis(100)),
                Err(_)=>break,
            }
        }
        flag.store(true,Ordering::SeqCst);
        if let Some(d)=mdns {let _=d.shutdown();}
    });
    let mut lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    *lock=Some(PairOffer{closed,expiry,pending});
    Ok(PairInfo{active:true,seconds_remaining:300})
}
#[tauri::command]
pub async fn commons_pair_stop(state:State<'_,PairState>)->Result<(),String>{state.stop();Ok(())}
#[tauri::command]
pub async fn commons_pair_discover()->Result<Vec<PairedDevice>,String>{
    tauri::async_runtime::spawn_blocking(discover).await.map_err(|_|"Pair discovery task failed".to_string())?
}
#[tauri::command]
pub async fn commons_pair_status(state:State<'_,PairState>)->Result<PairInfo,String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    if let Some(current)=lock.as_ref(){
        if !current.closed.load(Ordering::SeqCst)&&Instant::now()<current.expiry {
            return Ok(PairInfo{active:true,seconds_remaining:current.expiry.saturating_duration_since(Instant::now()).as_secs()});
        }
    }
    Ok(PairInfo{active:false,seconds_remaining:0})
}
#[tauri::command]
pub async fn commons_pair_pending(state:State<'_,PairState>)->Result<Vec<PairPending>,String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let Some(offer)=lock.as_ref() else{return Ok(vec![])};
    if offer.closed.load(Ordering::SeqCst){return Ok(vec![]);}
    let queue=offer.pending.lock().map_err(|_|"Pair requests unavailable")?;
    Ok(queue.iter().filter_map(|req|{
        let remaining=APPROVAL_TIMEOUT.saturating_sub(req.created.elapsed()).as_secs();
        (remaining>0).then(||PairPending{
            id:req.id.clone(),label:req.label.clone(),address:req.address.clone(),
            code:req.code.clone(),remaining_seconds:remaining,
        })
    }).collect())
}
#[tauri::command]
pub async fn commons_pair_respond(id:String,approve:bool,state:State<'_,PairState>)->Result<(),String>{
    let lock=state.0.lock().map_err(|_|"Pair state unavailable")?;
    let offer=lock.as_ref().ok_or("No active local pair offer")?;
    if offer.closed.load(Ordering::SeqCst){return Err("Pair offer has expired".into());}
    let mut list=offer.pending.lock().map_err(|_|"Pair requests unavailable")?;
    let index=list.iter().position(|r|r.id==id).ok_or("Request was already handled or expired")?;
    let item=list.remove(index);
    if item.created.elapsed()>=APPROVAL_TIMEOUT{return Err("Request expired".into());}
    item.answer.send(approve).map_err(|_|"Receiving Mac disconnected".to_string())
}
fn validate_target(ip:&str,port:u16)->Result<SocketAddrV4,String>{
    let ip:Ipv4Addr=ip.parse().map_err(|_|"Use a local numeric IPv4 address")?;
    if !(ip.is_private()||ip.is_link_local())||ip.is_loopback()||port==0 {
        return Err("Only private nearby IPv4 devices can be contacted".into());
    }
    Ok(SocketAddrV4::new(ip,port))
}
fn paired_receive<F:FnMut(usize,usize),G:FnMut(String)>(
    address:SocketAddrV4,label:&str,mut progress:F,mut paired_code:G,
)->Result<String,String>{
    if label.is_empty()||label.len()>60||label.chars().any(char::is_control){
        return Err("Enter a short nearby device label".into());
    }
    let mut socket=TcpStream::connect_timeout(&address.into(),SOCKET_TIMEOUT)
        .map_err(|e|format!("Cannot reach nearby Mac: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_secs(55))).map_err(|e|e.to_string())?;
    socket.set_write_timeout(Some(SOCKET_TIMEOUT)).map_err(|e|e.to_string())?;
    let secret=EphemeralSecret::random_from_rng(OsRng);
    let public=PublicKey::from(&secret);
    socket.write_all(PAIR_MARKER).map_err(|e|e.to_string())?;
    socket.write_all(public.as_bytes()).map_err(|e|e.to_string())?;
    socket.write_all(&[label.len() as u8]).map_err(|e|e.to_string())?;
    socket.write_all(label.as_bytes()).map_err(|e|e.to_string())?;
    let mut remote=[0u8;32];socket.read_exact(&mut remote).map_err(|e|format!("No handshake from other Mac: {e}"))?;
    let remote_pub=PublicKey::from(remote);
    let shared=secret.diffie_hellman(&remote_pub);
    let (key,code)=derive(shared.as_bytes(),public.as_bytes(),&remote)?;
    paired_code(code);
    let mut decision=[0u8;4];
    socket.read_exact(&mut decision).map_err(|e|format!("No approval from sending Mac: {e}"))?;
    if &decision!=b"OKAY"{return Err("Sender declined the transfer or pairing timed out".into());}
    let mut header=[0u8;28];socket.read_exact(&mut header).map_err(|e|e.to_string())?;
    let len=u32::from_be_bytes(header[24..28].try_into().map_err(|_|"Bad length")?) as usize;
    if len<20||len>MAX_BYTES+16{return Err("Paired packet is too large".into());}
    let mut sealed=Vec::with_capacity(len);let mut buf=[0u8;256*1024];
    let mut last_report=0;
    while sealed.len()<len {
        let n=socket.read(&mut buf[..buf.len().min(len-sealed.len())]).map_err(|e|format!("Pair transfer interrupted: {e}"))?;
        if n==0{return Err("Sender disconnected before transfer completed".into());}
        sealed.extend_from_slice(&buf[..n]);
        if sealed.len()-last_report>=256*1024||sealed.len()==len{
            last_report=sealed.len();progress(last_report,len);
        }
    }
    let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
    let clear=cipher.decrypt(XNonce::from_slice(&header[..24]),sealed.as_ref())
        .map_err(|_|"Paired transfer authentication failed")?;
    if clear.len()>MAX_BYTES||!clear.starts_with(b"PK\x03\x04"){return Err("Received data is not a valid Commons ZIP".into());}
    Ok(URL_SAFE_NO_PAD.encode(clear))
}
#[tauri::command]
pub async fn commons_pair_receive(ip:String,port:u16,label:String,app:tauri::AppHandle)->Result<String,String>{
    let address=validate_target(&ip,port)?;
    tauri::async_runtime::spawn_blocking(move||{
        paired_receive(address,&label,
            |received,total|{let _=app.emit("commons-pair-progress",PairProgress{received_bytes:received,total_bytes:total});},
            |code|{let _=app.emit("commons-pair-code",PairCode{code,label:"Compare the code on both Macs".into()});},
        )
    }).await.map_err(|_|"Nearby pair receiver failed".to_string())?
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn sas_and_encryption_key_are_symmetric(){
        let left=EphemeralSecret::random_from_rng(OsRng);
        let lp=PublicKey::from(&left);
        let right=EphemeralSecret::random_from_rng(OsRng);
        let rp=PublicKey::from(&right);
        let a=left.diffie_hellman(&rp);
        let b=right.diffie_hellman(&lp);
        let (ak,ac)=derive(a.as_bytes(),lp.as_bytes(),rp.as_bytes()).unwrap();
        let (bk,bc)=derive(b.as_bytes(),lp.as_bytes(),rp.as_bytes()).unwrap();
        assert_eq!(ak,bk);assert_eq!(ac,bc);assert_eq!(ac.len(),6);
    }
    #[test]
    fn disallow_remote_hosts_and_bad_packets(){
        for ip in ["8.8.8.8","127.0.0.1","invalid"]{assert!(validate_target(ip,8123).is_err());}
        assert!(validate_target("192.168.1.12",0).is_err());
        assert!(validate_target("192.168.1.12",8123).is_ok());
        assert!(secure_zip(&URL_SAFE_NO_PAD.encode(b"not zip")).is_err());
    }
    #[test]
    fn all_zero_ecdh_is_rejected(){
        assert!(derive(&[0u8;32],&[3u8;32],&[4u8;32]).is_err());
    }
    #[test]
    fn approved_pair_local_roundtrip(){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();
        let addr=listener.local_addr().unwrap();
        let zip=b"PK\x03\x04fixture data for pairing".to_vec();
        let pending=Arc::new(Mutex::new(Vec::<Approval>::new()));
        let requests=pending.clone();
        let sender=thread::spawn(move||{
            let (socket,peer)=listener.accept().unwrap();
            handle_pair(socket,&zip,peer.ip().to_string(),pending,Arc::new(AtomicBool::new(false)))
        });
        let approvals=thread::spawn(move||{
            for _ in 0..50 {
                if let Ok(mut queue)=requests.lock(){
                    if !queue.is_empty(){
                        let item=queue.remove(0);
                        item.answer.send(true).unwrap();
                        return;
                    }
                }
                thread::sleep(Duration::from_millis(20));
            }
            panic!("No pair request arrived");
        });
        let addr=match addr {std::net::SocketAddr::V4(a)=>a,_=>unreachable!()};
        let mut code=String::new();
        let received=paired_receive(addr,"Second Mac",|_,_|{},|c|code=c).unwrap();
        assert_eq!(URL_SAFE_NO_PAD.decode(received).unwrap(),b"PK\x03\x04fixture data for pairing");
        assert_eq!(code.len(),6);
        sender.join().unwrap().unwrap();
        approvals.join().unwrap();
    }
}
