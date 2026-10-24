import {describe,expect,it} from "vitest";
import {preflightFiles,excludeStagedFile} from "./intakePreflight";

describe("local intake metadata preflight",()=>{
 it("accepts a safe batch without unnecessary warnings",()=>{
  const p=preflightFiles([{name:"thesis.pdf",size:12},{name:"figure.png",size:45}]);
  expect(p.accepted).toBe(true);
  expect(p.totalBytes).toBe(57);
  expect(p.issues).toEqual([]);
 });
 it("warns about empty, duplicate and multiple extensions",()=>{
  const p=preflightFiles([{name:"draft.pdf.zip",size:0},{name:"draft.pdf.zip",size:5}]);
  expect(p.accepted).toBe(true);
  expect(p.issues.map(i=>i.code)).toContain("empty");
  expect(p.issues.map(i=>i.code)).toContain("duplicate-name");
  expect(p.issues.map(i=>i.code)).toContain("multiple-suffix");
 });
 it("catches direction controls without trusting visual order",()=>{
  const p=preflightFiles([{name:"notes\u202Efdp.txt",size:1}]);
  expect(p.issues.some(i=>i.code==="directional-mark")).toBe(true);
 });
 it("can drop a mistaken file by exact selection index without mutating original files",()=>{
  const first={name:"报告.pdf",size:1500,id:1},second={name:"报告.pdf",size:1500,id:2};
  const third={name:"图表.png",size:2000,id:3};
  const old=[first,second,third];
  expect(preflightFiles(old).issues.some(x=>x.code==="duplicate-name")).toBe(true);
  const next=excludeStagedFile(old,1);
  expect(next).toEqual([first,third]);
  expect(next[0]).toBe(first);
  expect(old).toEqual([first,second,third]);
  expect(preflightFiles(next).issues.some(x=>x.code==="duplicate-name")).toBe(false);
  expect(preflightFiles(next).totalBytes).toBe(3500);
  expect(excludeStagedFile(next,0)).toEqual([third]);
  expect(()=>excludeStagedFile(next,2)).toThrow(/Invalid staged/);
  expect(()=>excludeStagedFile(next,-1)).toThrow(/Invalid staged/);
  expect(()=>excludeStagedFile(next,1.5)).toThrow(/Invalid staged/);
 });
 it("rejects files outside the supported resource budget",()=>{
  expect(preflightFiles([{name:"x",size:64_000_001}]).accepted).toBe(false);
  expect(preflightFiles(Array.from({length:81},(_,i)=>({name:String(i),size:1}))).accepted).toBe(false);
  expect(preflightFiles(Array.from({length:3},(_,i)=>({name:String(i),size:60_000_000}))).accepted).toBe(false);
  expect(preflightFiles([{name:"bad",size:-1}]).accepted).toBe(false);
 });
});
