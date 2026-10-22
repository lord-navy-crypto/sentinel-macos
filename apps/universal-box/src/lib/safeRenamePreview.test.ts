import {describe,it,expect} from "vitest";
import {planSafeRenames} from "./safeRenamePreview";

describe("Office daily rename preflight",()=>{
 const config={prefix:"study-",find:"draft",replace:"final",start:1};
 it("generates inspectable names and preserves original extensions and inputs",()=>{
  const originals=[{name:"draft.txt",size:120},{name:"notes.PDF",size:950}];
  const planned=planSafeRenames(originals,config);
  expect(planned.map(x=>x.filename)).toEqual(["study-final-01.txt","study-notes-02.PDF"]);
  expect(originals[0].name).toBe("draft.txt");
  expect(planned.map(x=>x.file)).toEqual(originals);
 });
 it("preserves extensions when a long filename is shortened",()=>{
  const first={name:"a".repeat(240)+".jpeg",size:1024};
  const [planned]=planSafeRenames([first],{...config,prefix:""});
  expect(planned.filename.length).toBeLessThanOrEqual(130);
  expect(planned.filename.endsWith("-01.jpeg")).toBe(true);
  expect(planned.filename).not.toContain("/");
 });
 it("neutralizes unsafe characters and dot prefixes without changing original files",()=>{
  const input=[{name:"../bad:report?.csv",size:500}];
  const [item]=planSafeRenames(input,{...config,prefix:""});
  expect(item.filename).not.toMatch(/[\\/:*?"<>|]/u);
  expect(item.filename.endsWith(".csv")).toBe(true);
  expect(input[0].name).toBe("../bad:report?.csv");
 });
 it("rejects invalid settings, file metadata, excessive count and total",()=>{
  expect(()=>planSafeRenames([] ,config)).toThrow(/1–50/);
  expect(()=>planSafeRenames([{name:"a.pdf",size:100}],{...config,start:1.5})).toThrow(/integer/);
  expect(()=>planSafeRenames([{name:"a.pdf",size:100}],{...config,start:-1})).toThrow(/integer/);
  expect(()=>planSafeRenames([{name:"a."+ "x".repeat(40),size:100}],config)).toThrow(/extension/);
  expect(()=>planSafeRenames([{name:"a.pdf",size:16_000_001}],config)).toThrow(/Invalid/);
  expect(()=>planSafeRenames(Array.from({length:51},(_,i)=>({name:i+".pdf",size:1})),config)).toThrow(/1–50/);
  expect(()=>planSafeRenames([{name:"x.pdf",size:9_000_000},{name:"y.pdf",size:9_000_000}],config)).toThrow(/16 MB/);
 });
 it("reports conflicting sanitized/normalized output names before export",()=>{
  const files=[{name:"X.txt",size:1},{name:"X.txt",size:1}];
  const output=planSafeRenames(files,{prefix:"",find:"",replace:"",start:7});
  expect(output.map(x=>x.filename)).toEqual(["X-07.txt","X-08.txt"]);
  expect(new Set(output.map(x=>x.filename.toLowerCase())).size).toBe(2);
 });
});
