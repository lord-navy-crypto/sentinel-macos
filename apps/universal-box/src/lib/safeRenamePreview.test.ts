import {describe,it,expect} from "vitest";
import {planSafeRenames,buildRenameMappingCsv,buildRenameMappingJson} from "./safeRenamePreview";

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
 it("produces ordered and reproducible original-to-new filename mapping in both CSV and JSON",()=>{
  const items=planSafeRenames([
    {name:"old, chapter \"A\".txt",size:200},
    {name:"工作记录.csv",size:300},
  ],{prefix:"daily-",find:"",replace:"",start:7});
  const csv=buildRenameMappingCsv(items);
  const json=JSON.parse(buildRenameMappingJson(items));
  expect(csv.startsWith("\uFEFFindex,original_name,new_name,size_bytes\r\n")).toBe(true);
  expect(csv).toContain('"old, chapter ""A"".txt"');
  expect(csv).toContain(items[0].filename);
  expect(csv).toContain('"工作记录.csv"');
  expect(json.files.map((x:{originalName:string})=>x.originalName))
    .toEqual(["old, chapter \"A\".txt","工作记录.csv"]);
  expect(json.files.map((x:{newName:string})=>x.newName))
    .toEqual(items.map(x=>x.filename));
  expect(json.files.map((x:{originalBytes:number})=>x.originalBytes)).toEqual([200,300]);
  expect(items[0].originalName).toBe("old, chapter \"A\".txt");
 });
 it("CSV cells that look like formulas cannot become executable when opened in spreadsheets",()=>{
  const items=planSafeRenames([{name:"=2+3.csv",size:100}],{
    prefix:"",find:"",replace:"",start:1,
  });
  const csv=buildRenameMappingCsv(items);
  expect(csv).toContain('"\'=2+3.csv"');
  expect(csv).toContain('"\'=2+3-01.csv"');
  const json=JSON.parse(buildRenameMappingJson(items));
  expect(json.files[0].originalName).toBe("=2+3.csv");
  expect(json.files[0].newName).toBe("=2+3-01.csv");
 });
 it("reports conflicting sanitized/normalized output names before export",()=>{
  const files=[{name:"X.txt",size:1},{name:"X.txt",size:1}];
  const output=planSafeRenames(files,{prefix:"",find:"",replace:"",start:7});
  expect(output.map(x=>x.filename)).toEqual(["X-07.txt","X-08.txt"]);
  expect(new Set(output.map(x=>x.filename.toLowerCase())).size).toBe(2);
 });
});
