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
