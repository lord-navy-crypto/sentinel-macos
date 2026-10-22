import {describe,it,expect} from "vitest";
import {addClip,combineClips,moveClip} from "./multiCopy";
describe("manual session multi-copy",()=>{
 it("keeps ordered snippets without editing the original array",()=>{
   const original=["Alpha"];const next=addClip(original,"  Beta  ");
   expect(original).toEqual(["Alpha"]);expect(next).toEqual(["Alpha","  Beta  "]);
   expect(combineClips(next,"newline")).toBe("Alpha\n  Beta  ");
   expect(combineClips(next,"blank")).toBe("Alpha\n\n  Beta  ");
   expect(combineClips(next,"space")).toBe("Alpha   Beta  ");
 });
 it("rejects empty, excessively long and unsupported input",()=>{
   expect(()=>addClip([],"  ")).toThrow();
   expect(()=>addClip([],"x".repeat(20001))).toThrow();
   expect(()=>combineClips([],"newline")).toThrow();
   expect(()=>combineClips(["hello"],"invalid" as "newline")).toThrow();
 });

 it("preserves intentional multiline clipboard and indentation",()=>{
   const source="  First line  \n  code: value\n";
   const clips=addClip([],source);
   expect(clips[0]).toBe(source);
   expect(combineClips(clips,"newline")).toBe(source);
   expect(()=>addClip([],"  \n ")).toThrow();
   expect(()=>addClip([]," ".repeat(20001)+"a")).toThrow();
 });
 it("reorders snippets without modifying the prior state",()=>{
   const original=["first","second","third"];
   const moved=moveClip(original,2,0);
   expect(moved).toEqual(["third","first","second"]);
   expect(moveClip(moved,0,1)).toEqual(["first","third","second"]);
   expect(original).toEqual(["first","second","third"]);
   expect(()=>moveClip(original,-1,0)).toThrow();
   expect(()=>moveClip(original,0,3)).toThrow();
   expect(()=>moveClip(original,0.5,1)).toThrow();
 });
 it("caps collection size",()=>{
   expect(()=>addClip(Array(30).fill("one"),"extra")).toThrow();
 });
});
