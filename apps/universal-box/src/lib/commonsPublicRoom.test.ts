import {describe,it,expect} from "vitest";
import {decodePublicRoomSignal,encodePublicRoomSignal,decodePublicRoomFrame,encodePublicRoomFrame,
 rememberRoomMessage,roomSendReady,validPublicRoomName,authorizeRoomResume,validRoomResumeToken,PUBLIC_ROOM_GUEST_LIMIT} from "./commonsPublicRoom";

const room="12345678-1234-4234-9234-123456789abc";
const fingerprint="AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const sdp="v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 "+fingerprint+"\r\n";
const id="abcdef00-1234-4234-9234-111111111111";

describe("Manual host-forwarded public room protocol",()=>{
 it("allows a maximum of three manually paired guests",()=>{
  expect(PUBLIC_ROOM_GUEST_LIMIT).toBe(3);
 });
 it("preserves room identity and WebRTC fingerprint in both signaling directions",()=>{
  for(const type of ["offer","answer"] as const){
   const encoded=encodePublicRoomSignal(room,{type,sdp});
   expect(decodePublicRoomSignal(encoded,type)).toEqual({v:1,room,type,sdp});
  }
  expect(()=>decodePublicRoomSignal(encodePublicRoomSignal(room,{type:"offer",sdp}),"answer")).toThrow();
  expect(()=>encodePublicRoomSignal("wrong",{type:"offer",sdp})).toThrow();
  expect(()=>decodePublicRoomSignal("not-json","offer")).toThrow();
  expect(()=>decodePublicRoomSignal("x".repeat(130000),"offer")).toThrow();
 });
 it("validates bounded Unicode names without control characters",()=>{
  expect(validPublicRoomName("主持人")).toBe(true);
  for(const name of [""," "," trailing ","a".repeat(25),"bad\nname"])
   expect(validPublicRoomName(name)).toBe(false);
 });
 it("rejects oversized, cross-room and invalid frames",()=>{
  const message={v:1 as const,room,kind:"chat" as const,id,name:"李老师",text:"会议开始"};
  expect(decodePublicRoomFrame(encodePublicRoomFrame(message),room)).toEqual(message);
  expect(decodePublicRoomFrame(encodePublicRoomFrame(message),"aaaaaaaa-1234-4234-9234-123456789abc")).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify({...message,text:"字".repeat(1001)}),room)).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify({...message,id:"missing"}),room)).toBeNull();
  expect(decodePublicRoomFrame("no-json",room)).toBeNull();
  expect(decodePublicRoomFrame("x".repeat(9001),room)).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify({v:1,room,kind:"join",name:"路人"}),room)?.kind).toBe("join");
  expect(decodePublicRoomFrame(JSON.stringify({v:1,room,kind:"welcome"}),room)?.kind).toBe("welcome");
 });
 it("validates bounded peer ACKs and group recipient count receipts",()=>{
  const ack={v:1 as const,room,kind:"ack" as const,id};
  const receipt={v:1 as const,room,kind:"receipt" as const,id,acked:2,total:2};
  expect(decodePublicRoomFrame(encodePublicRoomFrame(ack),room)).toEqual(ack);
  expect(decodePublicRoomFrame(encodePublicRoomFrame(receipt),room)).toEqual(receipt);
  expect(decodePublicRoomFrame(encodePublicRoomFrame(receipt),"aaaaaaaa-1234-4234-9234-123456789abc")).toBeNull();
  for(const bad of [
   {...receipt,acked:-1},{...receipt,total:4},{...receipt,acked:3},
   {...receipt,total:1.5},{...receipt,acked:"2"},{...receipt,id:"wrong"}
  ])expect(decodePublicRoomFrame(JSON.stringify(bad),room)).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify({...ack,id:"invalid"}),room)).toBeNull();
 });
 it("allows a valid room-scoped rejoin proof and rejects wrong or stale capability",()=>{
  const token="11111111-2222-4333-8444-555555555555";
  const oldToken="aaaaaaaa-2222-4333-8444-555555555555";
  expect(validRoomResumeToken(token)).toBe(true);
  expect(validRoomResumeToken("not-a-token")).toBe(false);
  expect(authorizeRoomResume(token,"Alice",token,"Alice")).toBe(true);
  expect(authorizeRoomResume(token,"Alice",oldToken,"Alice")).toBe(false);
  expect(authorizeRoomResume(token,"Alice",token,"Mallory")).toBe(false);
  expect(authorizeRoomResume(token,"Alice",undefined,"Alice")).toBe(false);
  const join={v:1 as const,room,kind:"join" as const,name:"Alice",resumeToken:token};
  const welcome={v:1 as const,room,kind:"welcome" as const,resumeToken:oldToken};
  expect(decodePublicRoomFrame(encodePublicRoomFrame(join),room)).toEqual(join);
  expect(decodePublicRoomFrame(encodePublicRoomFrame(welcome),room)).toEqual(welcome);
  expect(decodePublicRoomFrame(JSON.stringify({...join,resumeToken:"invalid"}),room)).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify({...welcome,resumeToken:"invalid"}),room)).toBeNull();
  expect(decodePublicRoomFrame(JSON.stringify(join),"aaaaaaaa-1234-4234-9234-123456789abc")).toBeNull();
 });
 it("only queues data on an open channel with room-specific backpressure",()=>{
  const channel=(readyState:string,bufferedAmount:number)=>({readyState,bufferedAmount}) as RTCDataChannel;
  expect(roomSendReady(channel("open",0))).toBe(true);
  expect(roomSendReady(channel("open",65537))).toBe(false);
  expect(roomSendReady(channel("connecting",0))).toBe(false);
  expect(roomSendReady(null)).toBe(false);
 });
 it("suppresses replay within a bounded in-memory window",()=>{
  const seen=new Set<string>();
  expect(rememberRoomMessage(seen,"peer-one",id)).toBe(true);
  expect(rememberRoomMessage(seen,"peer-one",id)).toBe(false);
  expect(rememberRoomMessage(seen,"peer-two",id)).toBe(true);
  for(let i=0;i<550;i++)rememberRoomMessage(seen,"peer-one","id-"+i);
  expect(seen.size).toBeLessThanOrEqual(500);
 });
});
