import {describe,it,expect} from "vitest";
import {decodeDirectSignal,encodeDirectSignal,readDirectFingerprint,validDirectChatText,buildCommonsIceServers,summarizeCommonsIceRoute} from "./commonsInternetRtc";
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
  expect(()=>decodeDirectSignal(JSON.stringify({type:"offer",sdp:"v=0\n"+"a=inactive\n".repeat(15)}),"offer")).toThrow(/DTLS/);
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

describe("User-owned TURN relay configuration",()=>{
 const none={publicStun:false,ownTurn:false,turnUrl:"",turnUsername:"",turnCredential:""};
 it("contacts no external ICE service by default and only uses public STUN with consent",()=>{
  expect(buildCommonsIceServers(none)).toEqual([]);
  expect(buildCommonsIceServers({...none,publicStun:true})).toEqual([{urls:"stun:stun.l.google.com:19302"}]);
 });
 it("provides native RTCIceServer with memory-only secret for an explicit TURN server",()=>{
  const c={...none,ownTurn:true,turnUrl:"turns:relay.example.org:5349?transport=tcp",
   turnUsername:"user-001",turnCredential:"not-a-real-secret"};
  const servers=buildCommonsIceServers(c);
  expect(servers).toEqual([{urls:"turns:relay.example.org:5349?transport=tcp",
   username:"user-001",credential:"not-a-real-secret"}]);
  expect(buildCommonsIceServers({...c,publicStun:true})).toHaveLength(2);
 });
 it("rejects embedded credentials, unsafe protocols, bogus ports and whitespace",()=>{
  const c={...none,ownTurn:true,turnUrl:"turn:relay.example.org:3478?transport=udp",turnUsername:"alice",turnCredential:"temporary-pass"};
  for(const address of [
   "https://relay.example.org","turn://relay.example.org:3478",
   "turn:alice:pass@relay.example.org:3478",
   "turn:relay.example.org:0","turn:relay.example.org:65536",
   "turn:relay.example.org:3478\nheader: trick",
   "turns:relay.example.org:5349?transport=udp",
   "turn:bad..example.org:3478",
  ])expect(()=>buildCommonsIceServers({...c,turnUrl:address}),address).toThrow();
  expect(()=>buildCommonsIceServers({...c,turnUsername:""})).toThrow(/username/);
  expect(()=>buildCommonsIceServers({...c,turnCredential:""})).toThrow(/credential/);
 });
});

describe("Actual chosen ICE candidate route reporting",()=>{
 const report=(local:string,remote:string):RTCStatsReport=>new Map([
  ["transport",{id:"transport",type:"transport",selectedCandidatePairId:"pair"}],
  ["pair",{id:"pair",type:"candidate-pair",localCandidateId:"local",remoteCandidateId:"remote"}],
  ["local",{id:"local",type:"local-candidate",candidateType:local}],
  ["remote",{id:"remote",type:"remote-candidate",candidateType:remote}],
 ]) as unknown as RTCStatsReport;
 it("detects TURN only if the selected candidate pair uses relay",()=>{
  expect(summarizeCommonsIceRoute(report("relay","host")).kind).toBe("relay");
  expect(summarizeCommonsIceRoute(report("srflx","relay")).kind).toBe("relay");
  expect(summarizeCommonsIceRoute(report("host","srflx"))).toEqual({
   kind:"direct",localType:"host",remoteType:"srflx",
  });
 });
 it("reports unknown rather than guessing when stats cannot identify a chosen pair",()=>{
  expect(summarizeCommonsIceRoute(new Map() as unknown as RTCStatsReport)).toEqual({
   kind:"unknown",localType:"unknown",remoteType:"unknown",
  });
  expect(summarizeCommonsIceRoute(report("unexpected","host")).kind).toBe("unknown");
 });
});
