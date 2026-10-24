import {describe,it,expect} from "vitest";
import {canQueueDirectFrame,decodeDirectFrame,encodeDirectFrame,rememberDirectMessage} from "./commonsDirectMessages";
const id="c3d9c42f-1e8d-47ca-aea4-e725ebd1cc68";
describe("Public WebRTC message acceptance receipts",()=>{
 it("round-trips CJK text and a typed application-level acknowledgment",()=>{
  const m={type:"message" as const,id,nickname:"小明",text:"项目完成，明天汇报"};
  expect(decodeDirectFrame(encodeDirectFrame(m))).toEqual(m);
  const ack={type:"ack" as const,id};
  expect(decodeDirectFrame(encodeDirectFrame(ack))).toEqual(ack);
 });
 it("rejects invalid peer frames and limits queue buffering",()=>{
  expect(decodeDirectFrame(JSON.stringify({type:"message",id:"123",nickname:"A",text:"hello"}))).toBe(null);
  expect(decodeDirectFrame(JSON.stringify({type:"message",id,nickname:"A",text:"x".repeat(1001)}))).toBe(null);
  expect(decodeDirectFrame(JSON.stringify({type:"message",id,nickname:"A\n",text:"hello"}))).toBe(null);
  expect(decodeDirectFrame(JSON.stringify({type:"unknown",id}))).toBe(null);
  expect(decodeDirectFrame(JSON.stringify({type:"ack",id:"<unsafe>"}))).toBe(null);
  expect(canQueueDirectFrame(0)).toBe(true);
  expect(canQueueDirectFrame(65536)).toBe(true);
  expect(canQueueDirectFrame(65537)).toBe(false);
  expect(canQueueDirectFrame(-1)).toBe(false);
 });
 it("ACKs a retransmitted ID but displays it only once; bounds retained IDs",()=>{
  const first=rememberDirectMessage([],id);
  expect(first.duplicate).toBe(false);
  expect(rememberDirectMessage(first.ids,id)).toEqual({duplicate:true,ids:[id]});
  const ids=Array.from({length:501},(_,i)=>"msg-"+String(i).padStart(16,"0"));
  let out:string[]=[];
  for(const next of ids)out=rememberDirectMessage(out,next).ids;
  expect(out).toHaveLength(500);
  expect(out.includes(ids[0])).toBe(false);
  expect(out.at(-1)).toBe(ids.at(-1));
 });
});
