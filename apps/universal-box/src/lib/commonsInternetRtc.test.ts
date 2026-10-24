import {describe,it,expect} from "vitest";
import {decodeDirectSignal,encodeDirectSignal,readDirectFingerprint,validDirectChatText} from "./commonsInternetRtc";
const F="AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const sdp="v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 "+F+"\r\n";
describe("Public WebRTC manual signaling and privacy boundaries",()=>{
 it("roundtrips complete DataChannel SDP offer and answer",()=>{
  for(const type of ["offer","answer"] as const){
   const encoded=encodeDirectSignal({type,sdp});
   expect(decodeDirectSignal(encoded,type)).toEqual({type,sdp});
   expect(readDirectFingerprint(sdp)).toBe(F);
  }
 });
 it("rejects swapped response types and malformed or non-DataChannel descriptions",()=>{
  expect(()=>decodeDirectSignal(encodeDirectSignal({type:"offer",sdp}),"answer")).toThrow(/answer/);
  expect(()=>decodeDirectSignal(JSON.stringify({type:"offer",sdp:"v=0\n"}),"offer")).toThrow(/DTLS/);
  expect(()=>decodeDirectSignal("not json","offer")).toThrow();
  expect(()=>decodeDirectSignal("x".repeat(130000),"offer")).toThrow(/size/);
  expect(()=>encodeDirectSignal({type:"offer"})).toThrow(/Missing/);
 });
 it("limits direct chat messages and preserves Unicode as text",()=>{
  expect(validDirectChatText("同事：会议开始了")).toBe(true);
  expect(validDirectChatText("   ")).toBe(false);
  expect(validDirectChatText("字".repeat(1001))).toBe(false);
 });
});
