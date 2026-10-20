import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {
 COMMONS_SCHEMA,createCommonsRoom,commonsMessage,commonsTask,commonsToggleTask,commonsFile,
 exportCommonsPacket,importCommonsPacket,mergeCommonsPackets,safeAttachmentName,
 type CommonsPacket
} from "./commonsKit";

const bytes=(text:string)=>new TextEncoder().encode(text);
describe("Universal Commons offline team exchange",()=>{
 it("round-trips team messages, tasks and SHA256 protected files",async()=>{
  let room=createCommonsRoom("Shared class project","Alex");
  room=commonsMessage(room,"Alex","Can you review the PDF?");
  room=commonsTask(room,"Review draft","Jamie");
  room=commonsToggleTask(room,room.tasks[0].id);
  const added=await commonsFile(room,"notes.txt","Alex",bytes("draft version 1"));
  const pkg:CommonsPacket={room:added.room,attachments:[added.attachment]};
  const binary=await exportCommonsPacket(pkg);
  expect(binary.length).toBeGreaterThan(100);
  const decoded=await importCommonsPacket(binary);
  expect(decoded.room.schema).toBe(COMMONS_SCHEMA);
  expect(decoded.room.messages[0].text).toBe("Can you review the PDF?");
  expect(decoded.room.tasks[0].done).toBe(true);
  expect(decoded.room.files[0].name).toBe("notes.txt");
  expect(new TextDecoder().decode(decoded.attachments[0].bytes)).toBe("draft version 1");
 });
 it("rejects content modified after the manifest SHA256 was computed",async()=>{
  const room=createCommonsRoom("Archive","Alex");
  const added=await commonsFile(room,"paper.txt","Alex",bytes("original"));
  const binary=await exportCommonsPacket({room:added.room,attachments:[added.attachment]});
  const zip=await JSZip.loadAsync(binary);
  zip.file("files/"+added.attachment.id+".bin",bytes("corrupt!"));
  const tampered=await zip.generateAsync({type:"uint8array"});
  await expect(importCommonsPacket(tampered)).rejects.toThrow(/hash mismatch|invalid attachment/i);
 });
 it("rejects unexpected archive entries instead of executing or extracting them",async()=>{
  const room=createCommonsRoom("Safe handoff","Alex");
  const zip=new JSZip();
  zip.file("commons.json",JSON.stringify(room));
  zip.file("../evil.txt","do not extract");
  const payload=await zip.generateAsync({type:"uint8array"});
  await expect(importCommonsPacket(payload)).rejects.toThrow(/Unexpected ZIP entries|not a valid/i);
 });
 it("merges two teammate copies without losing messages or files",async()=>{
  const base=createCommonsRoom("Team","Alex");
  const local=commonsMessage(base,"Alex","Hello Jamie");
  const remote=commonsMessage(base,"Jamie","I've updated the draft");
  const one=await commonsFile(local,"mine.txt","Alex",bytes("A"));
  const two=await commonsFile(remote,"yours.txt","Jamie",bytes("B"));
  const merged=mergeCommonsPackets(
   {room:one.room,attachments:[one.attachment]},
   {room:two.room,attachments:[two.attachment]},
  );
  expect(merged.room.messages.map(m=>m.text).sort()).toEqual(["Hello Jamie","I've updated the draft"]);
  expect(merged.room.files.length).toBe(2);
  expect(merged.attachments.length).toBe(2);
  expect((await importCommonsPacket(await exportCommonsPacket(merged))).room.files).toHaveLength(2);
 });
 it("refuses mismatched team rooms and conflicting messages",()=>{
  const a=createCommonsRoom("A","Alex"),b=createCommonsRoom("B","Jamie");
  expect(()=>mergeCommonsPackets({room:a,attachments:[]},{room:b,attachments:[]})).toThrow(/Different teams/);
  const original=commonsMessage(a,"Alex","first");
  const changed={...original,messages:[{...original.messages[0],text:"different"}]};
  expect(()=>mergeCommonsPackets({room:original,attachments:[]},{room:changed,attachments:[]})).toThrow(/Conflicting message/);
 });
 it("normalizes dangerous attachment names and enforces file limits",async()=>{
  expect(safeAttachmentName("../docs/plan.pdf")).toBe("_/docs_plan.pdf".replace("/","_"));
  const room=createCommonsRoom("Files","Alex");
  await expect(commonsFile(room,"too-big.bin","Alex",new Uint8Array(8_000_001))).rejects.toThrow();
 });
});
