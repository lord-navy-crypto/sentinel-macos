import {describe,it,expect} from "vitest";
import {parseCommonsChatInvite,canJoinCommonsChat,mergeLanChatLines,chatHistoryGap,nextChatPage,lanChatNeedsNewSession,type LanChatSnapshot} from "./commonsChatUi";
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

describe("LAN explicit reconnect diagnostics",()=>{
 it("asks for a fresh member session only after authentication/session expiration",()=>{
  expect(lanChatNeedsNewSession("Member not connected; rejoin the room")).toBe(true);
  expect(lanChatNeedsNewSession("Session token does not match the selected member nickname")).toBe(true);
  expect(lanChatNeedsNewSession("Join the room before polling or sending messages")).toBe(true);
  for(const reason of ["Cannot reach LAN chat host: timed out","Connection refused","Wrong chat invitation key or invalid authentication","Unexpected chat protocol version"])
   expect(lanChatNeedsNewSession(reason)).toBe(false);
 });
});
describe("LAN chat history recovery / cursor contracts",()=>{
 const make=(first:number,count:number,hasMore:boolean):LanChatSnapshot=>({
  room:"团队",participants:["Alex"],hasMore,oldestSeq:first,latestSeq:200,
  messages:Array.from({length:count},(_,i)=>({
   seq:first+i,nickname:"Alex",text:"测试 "+(first+i),timestampMs:1000+i,
  })),
 });
 it("reports a factual loss when host history has expired but still retrieves available pages",()=>{
  expect(chatHistoryGap(0,make(16,12,true))).toBe(15);
  expect(chatHistoryGap(15,make(16,12,true))).toBe(0);
  expect(chatHistoryGap(50,make(16,12,true))).toBe(0);
  expect(nextChatPage(0,make(16,12,true))).toBe(27);
  expect(nextChatPage(27,make(28,12,true))).toBe(39);
 });
 it("rejects empty hasMore responses and non-monotonic message sequences",()=>{
  expect(()=>nextChatPage(10,make(11,0,true))).toThrow(/empty page/);
  expect(nextChatPage(12,make(11,2,false))).toBe(12);
  expect(()=>nextChatPage(12,{...make(11,2,false),
   messages:[{seq:12,nickname:"A",text:"1",timestampMs:0},
    {seq:11,nickname:"A",text:"2",timestampMs:0}]})).toThrow(/Out-of-order/);
  expect(chatHistoryGap(0,{...make(0,0,false),oldestSeq:0})).toBe(0);
 });
});
