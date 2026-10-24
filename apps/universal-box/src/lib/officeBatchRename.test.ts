import {describe,expect,it} from "vitest";
import {planOfficeBatchRename,renamePlanManifest,renamePlanCsv} from "./officeBatchRename";
describe("Office batch rename preview, collision safety and original-file preservation",()=>{
 it("retains extensions and Chinese/emoji names, with reversible old/new manifest",()=>{
  const plan=planOfficeBatchRename([
   {name:"合同.docx",size:20},{name:"报价 📎.pdf",size:30},{name:"001.xlsx",size:40}],
   {prefix:"2026-",find:"报价",replace:"Offer",start:7});
  expect(plan.map(x=>x.filename)).toEqual(["2026-合同-07.docx","2026-Offer 📎-08.pdf","2026-001-09.xlsx"]);
  const manifest=JSON.parse(renamePlanManifest(plan));
  expect(manifest.files[0]).toEqual({originalName:"合同.docx",renamedCopy:"2026-合同-07.docx",size:20});
 });
 it("detects unsafe collisions across case-insensitive filesystems and NFC equivalents",()=>{
  expect(()=>planOfficeBatchRename([{name:"A.txt",size:1},{name:"a.txt",size:1}],
   {prefix:"",find:"",replace:"",start:1})).not.toThrow(); // numbering separates results
  expect(()=>planOfficeBatchRename([{name:"one.txt",size:1},{name:"two.txt",size:1}],
   {prefix:"",find:"",replace:"",start:0})).toThrow(/whole number/);
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:1}],
   {prefix:"CON",find:"",replace:"",start:1})).not.toThrow(); // resulting name is not reserved
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:1}],
   {prefix:"",find:"",replace:"",start:999999})).toThrow(/whole number/);
 });
 it("refuses path chars and invalid total size, too many files, and oversized rules",()=>{
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:16_000_001}],
   {prefix:"",find:"",replace:"",start:1})).toThrow(/16 MB/);
  expect(()=>planOfficeBatchRename(Array.from({length:51},()=>({name:"a",size:0})),
   {prefix:"",find:"",replace:"",start:1})).toThrow(/1–50/);
  expect(()=>planOfficeBatchRename([{name:"a",size:10}],
   {prefix:"a".repeat(41),find:"",replace:"",start:1})).toThrow(/too long/);
  expect(()=>planOfficeBatchRename([{name:"a",size:10}],
   {prefix:"line\n",find:"",replace:"",start:1})).toThrow(/line breaks/);
 });
 it("supports plain find-and-replace without forced numbering, and detects collisions",()=>{
  const options={prefix:"Final-",find:"Draft",replace:"Approved",start:1,numbered:false};
  const plan=planOfficeBatchRename([{name:"Draft 合同.docx",size:10},{name:"memo.PDF",size:12}],options);
  expect(plan.map(x=>x.filename)).toEqual(["Final-Approved 合同.docx","Final-memo.PDF"]);
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:1},{name:"A.txt",size:2}],
   {prefix:"",find:"",replace:"",start:1,numbered:false})).toThrow(/Duplicate output filename/);
  expect(()=>planOfficeBatchRename([{name:"sentinel-box-rename-plan.json",size:1}],
   {prefix:"",find:"",replace:"",start:1,numbered:false})).toThrow(/reserved for the ZIP manifest/);
 });
 it("rejects sequence overflow instead of silently producing a six-digit label",()=>{
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:1},{name:"b.txt",size:1}],
   {prefix:"",find:"",replace:"",start:99999})).toThrow(/exceed 99,999/);
  expect(()=>planOfficeBatchRename([{name:"a.txt",size:1},{name:"b.txt",size:1}],
   {prefix:"",find:"",replace:"",start:99999,numbered:false})).not.toThrow();
 });
 it("exports Excel-safe old/new CSV with quoted commas, Chinese and formula-prefixed filenames",()=>{
  const options={prefix:"",find:"",replace:"",start:1,numbered:false};
  const plan=planOfficeBatchRename([
   {name:'中文,"汇总".txt',size:12},{name:"=1+2.txt",size:7},
   {name:"+Budget.csv",size:44}],options);
  const csv=renamePlanCsv(plan);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"中文,""汇总"".txt"');
  expect(csv).toContain('"\'=1+2.txt"');
  expect(csv).toContain('"\'+Budget.csv"');
  expect(csv).toContain('"Original filename","Renamed copy","Bytes"\r\n');
  expect(csv.endsWith('"44"\r\n')).toBe(true);
  expect(()=>renamePlanCsv([])).toThrow(/1–50/);
 });
 it("normalizes and cleans unsafe characters without changing file bytes",()=>{
  const plan=planOfficeBatchRename([{name:"my?file.docx",size:10}],
   {prefix:"",find:"",replace:"",start:3});
  expect(plan[0].filename).toBe("my-file-03.docx");
 });
});
