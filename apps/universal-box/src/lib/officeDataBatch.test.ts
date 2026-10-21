import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {planWordMailMerge,makeWordMailMerge,joinTwoCsv,exportCsvJoin,planBatchText,exportBatchText} from "./officeDataBatch";
import {parseWorkspaceCsv} from "./csvCleanroom";
describe("CSV-driven real Word DOCX mail merge",()=>{
 it("generates editable unique DOCX for each row with Chinese placeholders and preserves literal content",async()=>{
  const source="Name,Project,Date\n李华,地球科学,2026-11-01\nAda,Magnetism,2026-11-02\n";
  const template="# Invitation to {{Project}}\n\nDear {{Name}}, your date is {{Date}}.\n\n- Please confirm attendance.";
  const plan=planWordMailMerge(source,template);
  expect(plan.rowCount).toBe(2);expect(plan.fields).toEqual(["Project","Name","Date"]);
  const zip=await JSZip.loadAsync(await makeWordMailMerge(source,template),{checkCRC32:true});
  expect(zip.file("documents/001-letter.docx")).toBeTruthy();
  expect(zip.file("documents/002-letter.docx")).toBeTruthy();
  const first=await JSZip.loadAsync(await zip.file("documents/001-letter.docx")!.async("uint8array"));
  const second=await JSZip.loadAsync(await zip.file("documents/002-letter.docx")!.async("uint8array"));
  const word=await first.file("word/document.xml")!.async("string");
  const other=await second.file("word/document.xml")!.async("string");
  expect(word).toContain("李华");expect(word).toContain("地球科学");
  expect(other).toContain("Ada");expect(other).toContain("Magnetism");
  expect(word).not.toContain("Ada");
  const audit=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(audit.sourceDataIncluded).toBe(false);
  expect(JSON.stringify(audit)).not.toContain("李华");
 });
 it("rejects unknown placeholder, absent fields, excessive records and ambiguous columns",()=>{
  expect(()=>planWordMailMerge("Name\nAlice\n","# Hey {{Email}}")).toThrow(/missing/);
  expect(()=>planWordMailMerge("A,A\n1,2","# Hi {{A}}")).toThrow(/unique/);
  expect(()=>planWordMailMerge("Name\nAlice\n","# Hi")).toThrow(/placeholder/);
  expect(()=>planWordMailMerge("Name\nAlice\n","# Hi {{Name}")).toThrow(/placeholder/);
  expect(()=>planWordMailMerge("Name\n"+Array(21).fill("Alice").join("\n"),"# Hi {{Name}}")).toThrow(/20 data/);
 });
});
describe("safe one-to-one keyed CSV join",()=>{
 const left="ID,Name,Budget\n001,Li,25\n002,Ada,30\n";
 const right="ID,Project\n001,Hardware\n003,Software\n";
 it("offers inner, left and full joins while retaining leading-zero ID strings",async()=>{
  const inner=joinTwoCsv(left,right,"ID","inner");
  expect(inner.matches).toBe(1);expect(inner.rows).toHaveLength(1);expect(inner.rows[0]).toEqual(["001","Li","25","Hardware"]);
  const partial=joinTwoCsv(left,right,"ID","left");
  expect(partial.rows).toHaveLength(2);expect(partial.rows[1]).toEqual(["002","Ada","30",""]);
  const outer=joinTwoCsv(left,right,"ID","full");
  expect(outer.rows).toHaveLength(3);expect(outer.rows[2]).toEqual(["003","","","Software"]);
  expect(outer.headers).toEqual(["ID","left.Name","left.Budget","right.Project"]);
  const zip=await JSZip.loadAsync(await exportCsvJoin(left,right,"ID","full"));
  const lines=parseWorkspaceCsv(await zip.file("joined/joined.csv")!.async("string"));
  expect(lines[1][0]).toBe("001");
  const audit=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(audit.unmatchedRight).toBe(1);expect(audit.matches).toBe(1);
 });
 it("rejects unknown key, duplicate key, empty key and inconsistent rows",()=>{
  expect(()=>joinTwoCsv(left,right,"unknown","full")).toThrow(/exist in both/);
  expect(()=>joinTwoCsv("ID,Name\n001,A\n001,B",right,"ID","full")).toThrow(/duplicate key/);
  expect(()=>joinTwoCsv("ID,Name\n,A",right,"ID","left")).toThrow(/blank join key/);
  expect(()=>joinTwoCsv("ID,Name\n001,A,EXTRA",right,"ID","inner")).toThrow(/column counts/);
 });
 it("protects spreadsheet formulas when exporting CSV",()=>{
  const res=joinTwoCsv("ID,A\n001,=1+1","ID,B\n001,+1","ID","inner");
  const parsed=parseWorkspaceCsv(res.csv);
  expect(parsed[1][1]).toBe("'=1+1");
  expect(parsed[1][2]).toBe("'+1");
 });
});
describe("bounded multi-file literal replacement to auditable ZIP",()=>{
 const files=[{name:"memo.txt",text:"draft a\nthis draft is good\n"},
  {name:"README.md",text:"already final\n"},{name:"课题.txt",text:"draft draft"}];
 it("exports only changed copies and a per-file audit without original text",async()=>{
  expect(planBatchText(files,"draft","final")).toBe(3);
  const result=await exportBatchText(files,"draft","final");
  expect(result.report.map(r=>r.status)).toEqual(["changed","unchanged","changed"]);
  expect(result.report.map(r=>r.matches)).toEqual([2,0,2]);
  const zip=await JSZip.loadAsync(result.bytes);
  expect(await zip.file("replaced/001-memo.txt")!.async("string")).toBe("final a\nthis final is good\n");
  expect(zip.file("replaced/002-README.md")).toBeNull();
  expect(await zip.file("replaced/003-课题.txt")!.async("string")).toBe("final final");
  const manifest=await zip.file("reports/manifest.json")!.async("string");
  expect(manifest).not.toContain("this draft is good");
  expect(files[0].text).toContain("draft");
 });
 it("fails preflight for bad extensions, huge output and too many files",async()=>{
  expect(()=>planBatchText([{name:"binary.exe",text:"hello"}],"h","x")).toThrow(/text file formats/);
  expect(()=>planBatchText(Array(21).fill({name:"a.txt",text:"x"}),"x","y")).toThrow(/1–20/);
  await expect(exportBatchText([{name:"a.txt",text:"X".repeat(6000)}],"X","A".repeat(50)))
   .resolves.toMatchObject({report:[{status:"failed"}]});
 });
});