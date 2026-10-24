import {describe,it,expect} from "vitest";
import {canReceiveLan,keyFromNearbyInput,parseCommonsLanInvite} from "./commonsLanUi";

const secret="A".repeat(43);
describe("LAN transfer steps / invitation validation",()=>{
 it("accepts private, link-local, localhost URLs with bounded ports",()=>{
  expect(parseCommonsLanInvite("uboxlan://192.168.1.25:49152/"+secret)).toEqual({ip:"192.168.1.25",port:49152,key:secret});
  expect(parseCommonsLanInvite("uboxlan://10.0.0.5:1/"+secret).ip).toBe("10.0.0.5");
  expect(parseCommonsLanInvite("uboxlan://172.31.8.2:65535/"+secret).ip).toBe("172.31.8.2");
  expect(canReceiveLan("uboxlan://169.254.1.2:200/"+secret)).toBe(true);
  expect(canReceiveLan("uboxlan://127.0.0.1:200/"+secret)).toBe(true);
 });
 it("rejects internet destinations and untrusted/malformed URLs",()=>{
  for(const invalid of [
   "uboxlan://8.8.8.8:4321/"+secret,
   "uboxlan://172.32.0.1:4321/"+secret,
   "uboxlan://192.168.1.1:0/"+secret,
   "uboxlan://192.168.1.1:65536/"+secret,
   "uboxlan://192.168.01.1:1234/"+secret,
   "uboxlan://256.168.1.1:1234/"+secret,
   "https://192.168.1.1:1234/"+secret,
   "uboxlan://example.com:1234/"+secret,
   "uboxlan://192.168.1.1:1234/"+"A".repeat(42),
   "uboxlan://192.168.1.1:1234/"+secret+"\nrequest",
  ])expect(canReceiveLan(invalid),invalid).toBe(false);
 });
 it("enforces selected sender's endpoint before extracting a full key",()=>{
  const peer={ip:"192.168.1.25",port:49152};
  expect(keyFromNearbyInput("uboxlan://192.168.1.25:49152/"+secret,peer)).toBe(secret);
  expect(keyFromNearbyInput(secret,peer)).toBe(secret);
  expect(()=>keyFromNearbyInput("uboxlan://192.168.1.26:49152/"+secret,peer)).toThrow(/does not match/);
  expect(()=>keyFromNearbyInput("uboxlan://192.168.1.25:49153/"+secret,peer)).toThrow(/does not match/);
  expect(()=>keyFromNearbyInput("wrong",peer)).toThrow(/43-character/);
 });
});
