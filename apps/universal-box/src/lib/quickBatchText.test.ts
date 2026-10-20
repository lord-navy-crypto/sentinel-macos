import {describe,it,expect} from "vitest";
import {replaceTextLiteral,fileNameManifest} from "./quickBatchText";
describe("explicit local text operations",()=>{
 it("replaces literal patterns and reports occurrences",()=>{
  expect(replaceTextLiteral("a.b a.b","a.b","X")).toEqual({text:"X X",count:2});
  expect(replaceTextLiteral("hello","absent","x")).toEqual({text:"hello",count:0});
 });
 it("rejects empty find and excessive result",()=>{
  expect(()=>replaceTextLiteral("a","","b")).toThrow();
  expect(()=>replaceTextLiteral("x".repeat(1000),"x","y".repeat(500))).toThrow();
 });
 it("creates a safe CSV and simple filename list",()=>{
  const files=[{name:"notes.txt",size:42},{name:"=HYPERLINK(1).csv",size:2}];
  expect(fileNameManifest(files,"txt")).toBe("notes.txt\n=HYPERLINK(1).csv\n");
  expect(fileNameManifest(files,"csv")).toContain('"\'=HYPERLINK(1).csv",2');
 });
});
