//! Opt-in RFC 5389/8489 STUN binding *diagnostic*, not a P2P transport.
//! Uses a public third-party STUN endpoint, only after the user clicks Probe.
use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
use serde::Serialize;
use std::{
    net::{Ipv4Addr, SocketAddr, ToSocketAddrs, UdpSocket},
    time::Duration,
};
const STUN_SERVERS: [&str; 2] = ["stun.l.google.com:19302", "stun1.l.google.com:19302"];
const MAGIC: [u8;4] = [0x21, 0x12, 0xA4, 0x42];

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct P2pObservation {
    server: String,
    local_endpoint: String,
    observed_public_endpoint: String,
    samples: Vec<StunSample>,
    mapping_consistent: Option<bool>,
    note: String,
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct StunSample {
    server: String,
    result: Option<String>,
    error: Option<String>,
}

fn parse_stun_reply(payload:&[u8], expected:&[u8;12]) -> Result<(Ipv4Addr,u16),String> {
    if payload.len()<20 || payload[0..2]!=[0x01,0x01]
        || payload[4..8]!=MAGIC || &payload[8..20]!=expected {
        return Err("STUN response failed transaction validation".into());
    }
    let length=u16::from_be_bytes([payload[2],payload[3]]) as usize;
    if length%4!=0 || length+20>payload.len() {return Err("Malformed STUN attribute block".into());}
    let mut at=20;
    while at+4<=20+length {
        let kind=u16::from_be_bytes([payload[at],payload[at+1]]);
        let n=u16::from_be_bytes([payload[at+2],payload[at+3]]) as usize;
        if at+4+n>20+length { return Err("Malformed STUN address attribute".into()); }
        let body=&payload[at+4..at+4+n];
        if (kind==0x0020 || kind==0x0001) && n>=8 && body[1]==0x01 {
            let mut port=u16::from_be_bytes([body[2],body[3]]);
            let mut octets=[body[4],body[5],body[6],body[7]];
            if kind==0x0020 {
                port^=u16::from_be_bytes([MAGIC[0],MAGIC[1]]);
                for i in 0..4 {octets[i]^=MAGIC[i];}
            }
            return Ok((Ipv4Addr::from(octets),port));
        }
        at+=4+(n+3)&!3; // STUN attributes are padded to 4-byte alignment
    }
    Err("STUN server did not return an IPv4 reflexive address".into())
}


/**
 * Probe two STUN destinations using ONE local UDP socket. If the resulting
 * mappings differ, destination-dependent translation may be in effect.
 * A matching pair still does not establish P2P reachability.
 */
fn one_binding(socket: &UdpSocket, server: &str) -> Result<String, String> {
    let target = server.to_socket_addrs()
        .map_err(|_|format!("Could not resolve STUN server {server}"))?
        .find(|addr|matches!(addr,SocketAddr::V4(_)))
        .ok_or("STUN server has no IPv4 address")?;
    let mut tx=[0_u8;12];
    OsRng.fill_bytes(&mut tx);
    let mut request=[0_u8;20];
    request[0]=0;request[1]=1;
    request[4..8].copy_from_slice(&MAGIC);
    request[8..20].copy_from_slice(&tx);
    socket.send_to(&request,target)
        .map_err(|e|format!("UDP STUN request failed: {e}"))?;
    let mut reply=[0_u8;512];
    // Skip unrelated inbound packets. A STUN transaction must match both
    // the selected destination address and the random transaction ID.
    for _ in 0..4 {
        let (n,source)=socket.recv_from(&mut reply)
            .map_err(|e|format!("STUN response unavailable: {e}"))?;
        if source!=target {continue;}
        match parse_stun_reply(&reply[..n],&tx) {
            Ok((ip,port))=>return Ok(format!("{ip}:{port}")),
            Err(_)=>continue,
        }
    }
    Err("No authenticated STUN Binding reply received".into())
}
fn mapping_consistency(samples: &[StunSample]) -> Option<bool> {
    let values:Vec<&str>=samples.iter().filter_map(|x|x.result.as_deref()).collect();
    if values.len()<2 {None}else{Some(values.windows(2).all(|pair|pair[0]==pair[1]))}
}
fn probe_stun() -> Result<P2pObservation,String> {
    let socket=UdpSocket::bind("0.0.0.0:0")
        .map_err(|e|format!("Could not open a local outgoing UDP probe: {e}"))?;
    socket.set_read_timeout(Some(Duration::from_secs(2))).map_err(|e|e.to_string())?;
    socket.set_write_timeout(Some(Duration::from_secs(2))).map_err(|e|e.to_string())?;
    let local=socket.local_addr().map(|x|x.to_string()).unwrap_or_else(|_|"unknown".into());
    let mut samples=Vec::new();
    for server in STUN_SERVERS {
        match one_binding(&socket,server) {
            Ok(address)=>samples.push(StunSample{server:server.into(),result:Some(address),error:None}),
            Err(error)=>samples.push(StunSample{server:server.into(),result:None,error:Some(error)}),
        }
    }
    let address=samples.iter().find_map(|s|s.result.clone())
        .ok_or("Both public STUN probes failed; UDP or network DNS may be blocked")?;
    let consistent=mapping_consistency(&samples);
    Ok(P2pObservation {
        server:STUN_SERVERS.join(" / "),
        local_endpoint:local,
        observed_public_endpoint:address,
        samples,
        mapping_consistent:consistent,
        note:"Two STUN destinations were checked using the same local UDP socket. Different observations can indicate destination-dependent NAT mapping. Identical mappings still do not establish remote peer connectivity. No remote P2P connection, file transfer or relay has been created.".into(),
    })
}

#[tauri::command]
pub async fn commons_p2p_stun_probe() -> Result<P2pObservation,String> {
    tauri::async_runtime::spawn_blocking(probe_stun)
        .await.map_err(|_|"P2P observation task failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_valid_xor_mapped_address(){
        let tx=[7_u8;12];
        let mut p=[0_u8;32];
        p[0]=1;p[1]=1;p[2]=0;p[3]=12;
        p[4..8].copy_from_slice(&MAGIC);
        p[8..20].copy_from_slice(&tx);
        p[20]=0;p[21]=0x20;p[22]=0;p[23]=8;
        p[24]=0;p[25]=1;
        let port=(43210_u16^0x2112).to_be_bytes();
        p[26..28].copy_from_slice(&port);
        let address=[203_u8,0,113,7];
        for i in 0..4{p[28+i]=address[i]^MAGIC[i];}
        assert_eq!(parse_stun_reply(&p,&tx).unwrap(),(Ipv4Addr::new(203,0,113,7),43210));
        let wrong=[1_u8;12];
        assert!(parse_stun_reply(&p,&wrong).is_err());
    }
    #[test]
    fn compares_only_successful_mapping_pairs() {
        let make=|result:Option<&str>| StunSample{
            server:"test".into(),result:result.map(str::to_owned),error:None
        };
        assert_eq!(mapping_consistency(&[make(Some("a:1")),make(Some("a:1"))]),Some(true));
        assert_eq!(mapping_consistency(&[make(Some("a:1")),make(Some("a:2"))]),Some(false));
        assert_eq!(mapping_consistency(&[make(Some("a:1")),make(None)]),None);
    }
    #[test]
    fn rejects_invalid_short_or_wrong_magic(){
        assert!(parse_stun_reply(&[],&[0;12]).is_err());
        let p=[0_u8;20];
        assert!(parse_stun_reply(&p,&[0;12]).is_err());
    }
}
