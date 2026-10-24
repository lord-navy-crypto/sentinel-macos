import {describe,it,expect} from "vitest";
import {parseCommonsChatInvite,canJoinCommonsChat,mergeLanChatLines} from "./commonsChatUi";
const key="B".repeat(43);
describe("LAN group chat UI preflight",()=>{
 it("allows standard private, link-local and localhost invitations",()=>{
  expect(parseCommonsChatInvite("uboxchat://192.168.1.8:42000/"+key).port).toBe(42000);
  expect(canJoinCommonsChat("uboxchat://127.0.0.1:65535/"+key)).toBe(true);
  expect(canJoinCommonsChat("uboxchat://10.1.2.3:1/"+key)).toBe(true);
  expect(canJoinCommonsChat("uboxchat://169.254.1.1:123/"+key)).toBe(true);
 });
 it("prevents internet dial, malformed addresses and extra invitation characters",()=>{
  for(const address of ["8.8.8.8","172.32.0.1","192.168.01.1","256.0.0.1","example.org"]){
   expect(canJoinCommonsChat("uboxchat://"+address+":42000/"+key)).toBe(false);
  }
  for(const value of ["uboxchat://192.168.1.1:0/"+key,
   "uboxchat://192.168.1.1:65536/"+key,
   "https://192.168.1.1:456/"+key,
   "uboxchat://192.168.1.1:456/invalid",
   "uboxchat://192.168.1.1:456/"+key+"\nextra"])expect(canJoinCommonsChat(value)).toBe(false);
 });
 it("merges repeated polling snapshots immutably and keeps the latest 200",()=>{
  const a={seq:1,nickname:"甲",text:"A",timestampMs:12},b={...a,seq:2,text:"B"};
  expect(mergeLanChatLines([a],[a,b])).toEqual([a,b]);
  expect(mergeLanChatLines([a],[b])).toEqual([a,b]);
  expect(mergeLanChatLines([],
    Array.from({length:230},(_,i)=>({...a,seq:i+1})))).toHaveLength(200);
 });
});
