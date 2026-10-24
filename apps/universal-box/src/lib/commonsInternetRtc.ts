/** Small, intentionally manual WebRTC signaling format, with no central service.
 * DTLS secures the DataChannel but does not authenticate human identities.
 */
export type DirectSignal={type:"offer"|"answer";sdp:string};
const MAX_SDP_CHARS=120_000;
export function decodeDirectSignal(raw:string,expected:"offer"|"answer"):DirectSignal{
 if(raw.length<100||raw.length>MAX_SDP_CHARS)throw Error("Connection description size is invalid.");
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{throw Error("Paste a complete JSON connection description.");}
 if(!parsed||typeof parsed!=="object")throw Error("Connection description is not an object.");
 const d=parsed as Record<string,unknown>;
 if(d.type!==expected||typeof d.sdp!=="string"||d.sdp.length>MAX_SDP_CHARS||
   !d.sdp.startsWith("v=0")||!d.sdp.includes("m=application")||
   !/a=fingerprint:sha-(?:256|384|512) [0-9A-F:]{40,}/iu.test(d.sdp))
  throw Error("Description must contain a valid WebRTC "+expected+" with DTLS fingerprint.");
 return {type:expected,sdp:d.sdp};
}
export function encodeDirectSignal(desc:RTCSessionDescriptionInit):string{
 if(!desc.sdp||(desc.type!=="offer"&&desc.type!=="answer"))throw Error("Missing negotiated description.");
 const encoded=JSON.stringify({type:desc.type,sdp:desc.sdp});
 if(encoded.length>MAX_SDP_CHARS)throw Error("Connection description exceeds size limit.");
 return encoded;
}
export function readDirectFingerprint(sdp:string):string{
 return /a=fingerprint:sha-256 ([0-9A-F:]+)/iu.exec(sdp)?.[1]??"unavailable";
}
export async function finishIceGathering(pc:RTCPeerConnection,timeoutMs=20000):Promise<void>{
 if(pc.iceGatheringState==="complete")return;
 await new Promise<void>((resolve,reject)=>{
  const tidy=()=>{clearTimeout(timeout);pc.removeEventListener("icegatheringstatechange",listener);};
  const listener=()=>{if(pc.iceGatheringState==="complete"){tidy();resolve();}};
  const timeout=setTimeout(()=>{tidy();reject(Error("ICE gathering timed out. Check network and try again."));},timeoutMs);
  pc.addEventListener("icegatheringstatechange",listener);
  listener();
 });
}
export function validDirectChatText(text:string):boolean{
 return !!text.trim()&&[...text.trim()].length<=1000&&new TextEncoder().encode(text.trim()).length<=4000;
}

/** ICE servers are constructed ONLY after a user's explicit Connect action.
 * A custom TURN server is never probed during form editing or passive page visits.
 * Credentials stay in React memory and must not be copied into offers or status text.
 */
export type CommonsIceOptions={
 publicStun:boolean;
 ownTurn:boolean;
 turnUrl:string;
 turnUsername:string;
 turnCredential:string;
};
export function buildCommonsIceServers(config:CommonsIceOptions):RTCIceServer[]{
 const servers:RTCIceServer[]=[];
 if(config.publicStun)servers.push({urls:"stun:stun.l.google.com:19302"});
 if(!config.ownTurn)return servers;
 const url=config.turnUrl.trim();
 if(url.length>250||url!==config.turnUrl||/[\u0000-\u0020\u007f]/u.test(url))
  throw Error("TURN address must be a single URL without spaces.");
 const match=/^(turns?):([a-z0-9.-]+|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?(?:\?transport=(tcp|udp))?$/iu.exec(url);
 if(!match)throw Error("Use a turn:host:port or turns:host:port address without embedded credentials.");
 if(match[2].startsWith(".")||match[2].endsWith(".")||match[2].includes(".."))
  throw Error("TURN host is invalid.");
 const port=match[3]?Number(match[3]):match[1]==="turns"?5349:3478;
 if(port<1||port>65535)throw Error("TURN port must be between 1 and 65535.");
 if(match[1]==="turns"&&match[4]==="udp")
  throw Error("TURN over TLS needs TCP transport (turns:... or ?transport=tcp).");
 if(!config.turnUsername||config.turnUsername.length>256||
   /[\u0000-\u001f\u007f]/u.test(config.turnUsername))
  throw Error("Provide a valid TURN username.");
 if(!config.turnCredential||config.turnCredential.length>512||
   /[\u0000-\u001f\u007f]/u.test(config.turnCredential))
  throw Error("Provide a valid TURN credential.");
 servers.push({urls:url,username:config.turnUsername,credential:config.turnCredential});
 return servers;
}
