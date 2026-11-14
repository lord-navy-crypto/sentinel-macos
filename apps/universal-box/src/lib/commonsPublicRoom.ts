import {decodeDirectSignal,encodeDirectSignal,validDirectChatText} from "./commonsInternetRtc";

/** Experimental host-forwarded WebRTC room. Room identifiers are NOT passwords or identity proof. */
export const PUBLIC_ROOM_GUEST_LIMIT=3;
export const PUBLIC_ROOM_MAX_BUFFER=64*1024;
/** Heartbeats monitor application responsiveness, not proof of real-world identity.
 * A generous timeout reduces false timeouts during momentary Mac sleep/wake.
 */
export const PUBLIC_ROOM_HEARTBEAT_MS=12_000;
export const PUBLIC_ROOM_STALE_MS=48_000;
export function publicRoomTimedOut(lastReplyMs:number,nowMs:number):boolean{
 return Number.isFinite(lastReplyMs)&&Number.isFinite(nowMs)&&
  lastReplyMs>0&&nowMs>=lastReplyMs&&nowMs-lastReplyMs>PUBLIC_ROOM_STALE_MS;
}
const ROOM_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PublicRoomSignal={v:1;room:string;type:"offer"|"answer";sdp:string};
export type PublicRoomFrame=
 |{v:1;room:string;kind:"join";name:string;resumeToken?:string;heartbeat?:true}
 |{v:1;room:string;kind:"welcome";resumeToken?:string;heartbeat?:true}
 |{v:1;room:string;kind:"deny";reason:"full"|"name"|"invalid"}
 |{v:1;room:string;kind:"leave"}
 |{v:1;room:string;kind:"ack";id:string}
 |{v:1;room:string;kind:"ping"|"pong";id:string}
 |{v:1;room:string;kind:"receipt";id:string;acked:number;total:number}
 |{v:1;room:string;kind:"chat";id:string;name:string;text:string};

/** Volatile capability proved over the *previous* encrypted channel; not human identity. */
export function validRoomResumeToken(value:unknown):value is string{
 return typeof value==="string"&&MESSAGE_ID.test(value);
}
export function authorizeRoomResume(expectedToken:string,expectedName:string,offeredToken:unknown,offeredName:string):boolean{
 return validRoomResumeToken(expectedToken)&&validRoomResumeToken(offeredToken)&&
  expectedName===offeredName&&expectedToken===offeredToken;
}
export function validPublicRoomName(name:string):boolean{
 return name===name.trim()&&[...name].length>=1&&[...name].length<=24
  &&new TextEncoder().encode(name).length<=72
  &&!/\p{Cc}/u.test(name);
}
export function encodePublicRoomSignal(room:string,desc:RTCSessionDescriptionInit):string{
 if(!ROOM_ID.test(room))throw Error("Invalid temporary room identifier.");
 // Reuse the existing strict SDP/fingerprint validation on both offers and answers.
 const encoded=encodeDirectSignal(desc);
 const validated=decodeDirectSignal(encoded,desc.type==="offer"?"offer":"answer");
 return JSON.stringify({v:1,room,type:validated.type,sdp:validated.sdp});
}
export function decodePublicRoomSignal(raw:string,type:"offer"|"answer"):PublicRoomSignal{
 if(raw.length<100||raw.length>122000)throw Error("Room invitation size is invalid.");
 let item:unknown;
 try{item=JSON.parse(raw);}catch{throw Error("Paste the complete room invitation JSON.");}
 if(!item||typeof item!=="object")throw Error("Room invitation is invalid.");
 const d=item as Record<string,unknown>;
 if(d.v!==1||typeof d.room!=="string"||!ROOM_ID.test(d.room))
  throw Error("Invalid room version or identifier.");
 const sd=decodeDirectSignal(JSON.stringify({type:d.type,sdp:d.sdp}),type);
 return {v:1,room:d.room,type:sd.type,sdp:sd.sdp};
}
export function encodePublicRoomFrame(frame:PublicRoomFrame):string{
 return JSON.stringify(frame);
}
export function decodePublicRoomFrame(raw:unknown,room:string):PublicRoomFrame|null{
 if(typeof raw!=="string"||raw.length>9000||!ROOM_ID.test(room))return null;
 let value:unknown;
 try{value=JSON.parse(raw);}catch{return null;}
 if(!value||typeof value!=="object")return null;
 const d=value as Record<string,unknown>;
 if(d.v!==1||d.room!==room)return null;
 switch(d.kind){
  case "join":
   return typeof d.name==="string"&&validPublicRoomName(d.name)&&
    (d.resumeToken===undefined||validRoomResumeToken(d.resumeToken))&&
    (d.heartbeat===undefined||d.heartbeat===true)?
    {v:1,room,kind:"join",name:d.name,
     ...(d.resumeToken===undefined?{}:{resumeToken:d.resumeToken as string}),
     ...(d.heartbeat===true?{heartbeat:true as const}:{})}:null;
  case "welcome":
   return (d.resumeToken===undefined||validRoomResumeToken(d.resumeToken))&&
    (d.heartbeat===undefined||d.heartbeat===true)?
    {v:1,room,kind:"welcome",
     ...(d.resumeToken===undefined?{}:{resumeToken:d.resumeToken as string}),
     ...(d.heartbeat===true?{heartbeat:true as const}:{})}:null;
  case "deny":return d.reason==="full"||d.reason==="name"||d.reason==="invalid"?
   {v:1,room,kind:"deny",reason:d.reason}:null;
  case "leave":return {v:1,room,kind:"leave"};
  case "ack":return typeof d.id==="string"&&MESSAGE_ID.test(d.id)?{v:1,room,kind:"ack",id:d.id}:null;
  case "ping":
  case "pong":return typeof d.id==="string"&&MESSAGE_ID.test(d.id)?
   {v:1,room,kind:d.kind,id:d.id}:null;
  case "receipt":return typeof d.id==="string"&&MESSAGE_ID.test(d.id)&&
   typeof d.acked==="number"&&typeof d.total==="number"&&
   Number.isInteger(d.acked)&&Number.isInteger(d.total)&&
   d.total>=0&&d.total<=PUBLIC_ROOM_GUEST_LIMIT&&
   d.acked>=0&&d.acked<=d.total?
    {v:1,room,kind:"receipt",id:d.id,acked:d.acked,total:d.total}:null;
  case "chat":
   return typeof d.id==="string"&&MESSAGE_ID.test(d.id)
    &&typeof d.name==="string"&&validPublicRoomName(d.name)
    &&typeof d.text==="string"&&validDirectChatText(d.text)?
     {v:1,room,kind:"chat",id:d.id,name:d.name,text:d.text}:null;
  default:return null;
 }
}
/** Count the next frame before sending; bufferedAmount alone is not a cap. */
export function roomSendReady(channel:RTCDataChannel|null,payloadBytes=0):boolean{
 return !!channel&&channel.readyState==="open"&&
  Number.isSafeInteger(payloadBytes)&&payloadBytes>=0&&payloadBytes<=PUBLIC_ROOM_MAX_BUFFER&&
  channel.bufferedAmount<=PUBLIC_ROOM_MAX_BUFFER-payloadBytes;
}
/** Resend an unanswered ping with its original UUID, so delayed pongs still match. */
export function nextRoomHeartbeatPingId(pendingId:string,newId:()=>string):string{
 return pendingId||newId();
}
/** Do not display duplicate delivery of the same sender/UUID pair. Bounded volatile history. */
export function rememberRoomMessage(seen:Set<string>,sender:string,id:string):boolean{
 const key=sender+"|"+id;
 if(seen.has(key))return false;
 seen.add(key);
 if(seen.size>500){const first=seen.values().next().value;if(first!==undefined)seen.delete(first);}
 return true;
}
