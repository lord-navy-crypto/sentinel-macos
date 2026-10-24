import {validDirectChatText} from "./commonsInternetRtc";

/** Minimal bounded WebRTC text exchange: ACK means peer application accepted a frame,
 * NOT that a person read it or that a person's identity was authenticated.
 */
export type DirectMessageFrame={type:"message";id:string;nickname:string;text:string};
export type DirectAckFrame={type:"ack";id:string};
export type DirectWireFrame=DirectMessageFrame|DirectAckFrame;
const validId=(id:unknown):id is string=>typeof id==="string"&&
 id.length>=16&&id.length<=64&&/^[A-Za-z0-9_-]+$/u.test(id);
export function encodeDirectFrame(frame:DirectWireFrame):string{
 const output=JSON.stringify(frame);
 if(output.length>6000)throw Error("Direct message frame exceeds size limit");
 if(!decodeDirectFrame(output))throw Error("Direct message frame is malformed");
 return output;
}
export function decodeDirectFrame(raw:string):DirectWireFrame|null{
 if(raw.length<15||raw.length>6000)return null;
 try{
  const packet=JSON.parse(raw) as unknown;
  if(!packet||typeof packet!=="object")return null;
  const frame=packet as Record<string,unknown>;
  if(!validId(frame.id))return null;
  if(frame.type==="ack")return {type:"ack",id:frame.id};
  if(frame.type!=="message"||typeof frame.nickname!=="string"||
    !frame.nickname.trim()||frame.nickname.length>48||
    /[\u0000-\u001f\u007f]/u.test(frame.nickname)||
    typeof frame.text!=="string"||!validDirectChatText(frame.text))return null;
  return {type:"message",id:frame.id,nickname:frame.nickname,text:frame.text};
 }catch{return null;}
}
export function canQueueDirectFrame(bufferedAmount:number):boolean{
 return Number.isFinite(bufferedAmount)&&bufferedAmount>=0&&bufferedAmount<=64*1024;
}
/** Stable FIFO receiver dedupe: replayed frames are ACKed but never shown twice. */
export function rememberDirectMessage(seen:readonly string[],id:string,limit=500){
 if(!validId(id))throw Error("Invalid direct message ID");
 const duplicate=seen.includes(id);
 return {duplicate,ids:duplicate?[...seen]:[...seen.slice(-(limit-1)),id]};
}
