import {describe,it,expect} from "vitest";
import {addClip,combineClips} from "./multiCopy";
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
 it("caps collection size",()=>{
   expect(()=>addClip(Array(30).fill("one"),"extra")).toThrow();
 });
});
