//! Opt-in RFC 5389/8489 STUN binding *diagnostic*, not a P2P transport.
//! Uses a public third-party STUN endpoint, only after the user clicks Probe.
use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
use serde::Serialize;
use std::{
    net::{Ipv4Addr, SocketAddr, ToSocketAddrs, UdpSocket},
    time::Duration,
};
const STUN_HOST: &str = "stun.l.google.com:19302";
const MAGIC: [u8;4] = [0x21, 0x12, 0xA4, 0x42];

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct P2pObservation {
    server: String,
    local_endpoint: String,
    observed_public_endpoint: String,
    note: String,
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

fn probe_stun() -> Result<P2pObservation,String> {
    let target=STUN_HOST.to_socket_addrs()
        .map_err(|_|"Could not resolve the optional public STUN server")?
        .find(|addr|matches!(addr,SocketAddr::V4(_)))
        .ok_or("Public STUN server has no IPv4 address")?;
    let sock=UdpSocket::bind("0.0.0.0:0")
        .map_err(|e|format!("Could not create outgoing UDP socket: {e}"))?;
    sock.set_read_timeout(Some(Duration::from_secs(3))).map_err(|e|e.to_string())?;
    sock.set_write_timeout(Some(Duration::from_secs(3))).map_err(|e|e.to_string())?;
    sock.connect(target).map_err(|e|format!("Could not reach STUN endpoint: {e}"))?;
    let mut tx=[0_u8;12];
    OsRng.fill_bytes(&mut tx);
    let mut request=[0_u8;20];
    request[0]=0;request[1]=1; // Binding Request
    request[4..8].copy_from_slice(&MAGIC);
    request[8..20].copy_from_slice(&tx);
    sock.send(&request).map_err(|e|format!("STUN UDP request failed: {e}"))?;
    let mut response=[0_u8;512];
    let size=sock.recv(&mut response).map_err(|e|format!("No STUN response within 3 seconds: {e}"))?;
    let (ip,port)=parse_stun_reply(&response[..size],&tx)?;
    Ok(P2pObservation{
        server: STUN_HOST.into(),
        local_endpoint:sock.local_addr().map(|x|x.to_string()).unwrap_or_else(|_|"unknown".into()),
        observed_public_endpoint:format!("{ip}:{port}"),
        note:"STUN reveals one observed UDP mapping. It does NOT verify that a remote device can connect, prove NAT compatibility, or enable encrypted P2P transfers. Some networks require a relay.".into(),
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
    fn rejects_invalid_short_or_wrong_magic(){
        assert!(parse_stun_reply(&[],&[0;12]).is_err());
        let p=[0_u8;20];
        assert!(parse_stun_reply(&p,&[0;12]).is_err());
    }
}
