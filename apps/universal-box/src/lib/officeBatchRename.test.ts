import {describe,expect,it} from "vitest";
import {planOfficeBatchRename,renamePlanManifest} from "./officeBatchRename";
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
 it("normalizes and cleans unsafe characters without changing file bytes",()=>{
  const plan=planOfficeBatchRename([{name:"my?file.docx",size:10}],
   {prefix:"",find:"",replace:"",start:3});
  expect(plan[0].filename).toBe("my-file-03.docx");
 });
});
