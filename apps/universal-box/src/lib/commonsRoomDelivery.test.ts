import {describe,it,expect} from "vitest";
import {newRoomDelivery,recordRoomAck,remainingRoomRecipients,roomDeliveryProgress,upsertRoomReceipt} from "./commonsRoomDelivery";
import type {RoomChat} from "./commonsRoomDelivery";

const room="12345678-1234-4234-9234-123456789abc";
const id="12345678-1234-4234-9234-abcdefabcdef";
const frame:RoomChat={v:1,room,kind:"chat",id,name:"工程同事",text:"明天讨论设计"};

describe("WebRTC room application ACKs and bounded manual retries",()=>{
 it("records each distinct intended recipient only once and never counts irrelevant ACKs",()=>{
  let row=newRoomDelivery(frame,"origin",["alice","bob"]);
  expect(remainingRoomRecipients(row)).toEqual(["alice","bob"]);
  row=recordRoomAck(row,"outsider");
  expect(roomDeliveryProgress(row)).toEqual({acked:0,total:2,completed:false});
  row=recordRoomAck(row,"alice");
  row=recordRoomAck(row,"alice");
  expect(roomDeliveryProgress(row)).toEqual({acked:1,total:2,completed:false});
  expect(remainingRoomRecipients(row)).toEqual(["bob"]);
  row=recordRoomAck(row,"bob");
  expect(roomDeliveryProgress(row)).toEqual({acked:2,total:2,completed:true});
  expect(remainingRoomRecipients(row)).toEqual([]);
 });
 it("does not count source as recipient, cannot widen original list on retry",()=>{
  expect(()=>newRoomDelivery(frame,"alice",["alice"])).toThrow();
  expect(()=>newRoomDelivery(frame,null,["a","a"])).toThrow();
  expect(()=>newRoomDelivery(frame,null,["a","b","c","d"])).toThrow();
  const row=newRoomDelivery(frame,"alice",["bob"]);
  expect(remainingRoomRecipients(row)).toEqual(["bob"]);
  expect(roomDeliveryProgress(newRoomDelivery(frame,"alice",[])).completed).toBe(false);
 });
 it("accepts only monotonic receipts and bounds RAM-based recent send status to 50",()=>{
  let rows=upsertRoomReceipt([],{id,text:frame.text,acked:0,total:0,hostAccepted:false});
  rows=upsertRoomReceipt(rows,{id,text:frame.text,acked:0,total:2,hostAccepted:true});
  rows=upsertRoomReceipt(rows,{id,text:frame.text,acked:2,total:2,hostAccepted:true});
  rows=upsertRoomReceipt(rows,{id,text:frame.text,acked:1,total:2,hostAccepted:true});
  rows=upsertRoomReceipt(rows,{id,text:frame.text,acked:2,total:3,hostAccepted:true});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({acked:2,total:2,hostAccepted:true});
  for(let i=0;i<100;i++)
   rows=upsertRoomReceipt(rows,{id:String(i),text:"test",acked:0,total:0,hostAccepted:false});
  expect(rows).toHaveLength(50);
 });
});
