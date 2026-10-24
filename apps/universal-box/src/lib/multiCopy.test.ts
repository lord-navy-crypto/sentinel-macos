import {describe,it,expect} from "vitest";
import {addClip,combineClips,moveClip} from "./multiCopy";
describe("manual session multi-copy",()=>{
 it("keeps ordered snippets without editing the original array",()=>{
   const original=["Alpha"];const next=addClip(original,"  Beta  ");
   expect(original).toEqual(["Alpha"]);expect(next).toEqual(["Alpha","Beta"]);
   expect(combineClips(next,"newline")).toBe("Alpha\nBeta");
   expect(combineClips(next,"blank")).toBe("Alpha\n\nBeta");
   expect(combineClips(next,"space")).toBe("Alpha Beta");
 });
 it("rejects empty, excessively long and unsupported input",()=>{
   expect(()=>addClip([],"  ")).toThrow();
   expect(()=>addClip([],"x".repeat(20001))).toThrow();
   expect(()=>combineClips([],"newline")).toThrow();
   expect(()=>combineClips(["hello"],"invalid" as "newline")).toThrow();
 });
 it("moves notes in deliberate order without changing previous session state",()=>{
   const original=["One","Two","三"];
   expect(moveClip(original,2,-1)).toEqual(["One","三","Two"]);
   expect(moveClip(original,0,1)).toEqual(["Two","One","三"]);
   expect(original).toEqual(["One","Two","三"]);
   const moved=moveClip(moveClip(original,2,-1),1,-1);
   expect(combineClips(moved,"blank")).toBe("三\n\nOne\n\nTwo");
   expect(moveClip(original,0,-1)).toEqual(original);
   expect(moveClip(original,2,1)).toEqual(original);
   expect(()=>moveClip(original,-1,1)).toThrow(/Invalid clip/);
   expect(()=>moveClip(original,3,-1)).toThrow(/Invalid clip/);
   expect(()=>moveClip(original,0,0 as 1)).toThrow(/Invalid clip/);
 });
 it("caps collection size",()=>{
   expect(()=>addClip(Array(30).fill("one"),"extra")).toThrow();
 });
});
