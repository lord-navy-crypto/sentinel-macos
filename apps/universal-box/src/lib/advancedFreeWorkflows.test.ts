import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {createTextEpub,createIntegrityManifest,parseIntegrityManifest,verifyIntegrityManifest,
 compareCsvSnapshots,exportCsvSnapshotDiff} from "./advancedFreeWorkflows";
import {parseWorkspaceCsv} from "./csvCleanroom";
describe("Real EPUB 3 document from user-supplied TXT/Markdown",()=>{
 it("writes mimetype first and uncompressed, navigation, OPF and escaped XHTML in multilingual chapters",async()=>{
  const bytes=await createTextEpub("# Opening\n\nHello <world> & welcome!\n\n# 第二章\n\n中文 & English.","Book <Test>","作者");
  expect(new TextDecoder().decode(bytes.subarray(0,2))).toBe("PK");
  // First entry is the required uncompressed EPUB mimetype, not a normal DEFLATE entry.
  expect(new TextDecoder().decode(bytes.subarray(30,38))).toBe("mimetype");
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  expect(dv.getUint16(8,true)).toBe(0);
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  const opf=await zip.file("OEBPS/package.opf")!.async("string");
  expect(opf).toContain("Book &lt;Test&gt;");
  expect(opf).toContain("作者");
  expect(opf).toContain('properties="nav"');
  const chapter=await zip.file("OEBPS/chapter1.xhtml")!.async("string");
  expect(chapter).toContain("Hello &lt;world&gt; &amp; welcome!");
  const toc=await zip.file("OEBPS/nav.xhtml")!.async("string");
  expect(toc).toContain("第二章");
  expect(Object.keys(zip.files).filter(p=>p.endsWith(".xhtml"))).toHaveLength(3);
 });
 it("rejects oversized texts and invalid metadata",async()=>{
  await expect(createTextEpub("","Book","")).rejects.toThrow(/characters/);
  await expect(createTextEpub("a".repeat(300001),"Book","")).rejects.toThrow(/300,000/);
  await expect(createTextEpub("Content"," \t","")).rejects.toThrow(/Title/);
  await expect(createTextEpub("Content","\u0001","")).rejects.toThrow(/control/);
  await expect(createTextEpub(Array.from({length:31},(_,i)=>"# Chapter "+i+"\nText").join("\n"),"Book","")).rejects.toThrow(/30 chapters/);
 });
});
describe("SHA-256 opt-in file manifest and verification",()=>{
 const file=(name:string,text:string)=>({name,bytes:new TextEncoder().encode(text)});
 it("generates true deterministic SHA-256 and verifies changed, missing and extra files",async()=>{
  const manifest=await createIntegrityManifest([file("hello.txt","abc"),file("物理.md","中文")]);
  expect(manifest.files[0].sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const restored=parseIntegrityManifest(JSON.stringify(manifest));
  const ok=await verifyIntegrityManifest(restored,[file("物理.md","中文"),file("hello.txt","abc")]);
  expect(ok.matches).toEqual(["hello.txt","物理.md"]);
  const changes=await verifyIntegrityManifest(restored,[file("hello.txt","abcd"),file("new.csv","001")]);
  expect(changes).toEqual({matches:[],modified:["hello.txt"],missing:["物理.md"],extra:["new.csv"]});
 });
 it("rejects ambiguous names, non-SHA signatures and malformed manifest",async()=>{
  await expect(createIntegrityManifest([file("a","1"),file("a","2")])).rejects.toThrow(/Duplicate/);
  await expect(createIntegrityManifest([file("../secret","abc")])).rejects.toThrow(/unsafe/);
  expect(()=>parseIntegrityManifest('{"version":1,"algorithm":"MD5","files":[]}')).toThrow(/Unsupported/);
  expect(()=>parseIntegrityManifest("{")).toThrow(/Invalid/);
 });
});
describe("CSV version-aware row and per-cell comparison",()=>{
 it("detects exact keyed edits, added/removals, schema changes and export ZIP",async()=>{
  const old="ID,Name,Score,Old\n001,Alice,95,x\n002,Bob,90,y\n004,Stay,1,z\n";
  const next="ID,Name,Score,New\n001,Alice,97,yes\n003,张三,88,new\n004,Stay,1,ok\n";
  const diff=compareCsvSnapshots(old,next,"ID");
  expect([diff.addedRows,diff.removedRows,diff.changedRows,diff.unchangedRows]).toEqual([1,1,1,1]);
  expect(diff.addedColumns).toEqual(["New"]);
  expect(diff.removedColumns).toEqual(["Old"]);
  expect(diff.changes).toContainEqual({rowId:"001",kind:"cell",column:"Score",before:"95",after:"97"});
  expect(diff.changes).toContainEqual({rowId:"002",kind:"removed",column:"",before:"",after:""});
  const zip=await JSZip.loadAsync(await exportCsvSnapshotDiff(diff),{checkCRC32:true});
  const csv=await zip.file("csv-diff/changes.csv")!.async("string");
  expect(parseWorkspaceCsv(csv)[1]).toEqual(["001","cell","Score","95","97"]);
  expect(JSON.parse(await zip.file("csv-diff/report.json")!.async("string")).addedRows).toBe(1);
 });
 it("refuses duplicate or blank keys and malformed row lengths",()=>{
  expect(()=>compareCsvSnapshots("ID,Name\n001,A\n001,B","ID,Name\n001,C","ID")).toThrow(/duplicate/);
  expect(()=>compareCsvSnapshots("ID,Name\n001,A","ID,Name\n,B","ID")).toThrow(/Empty/);
  expect(()=>compareCsvSnapshots("ID,Name\n001,A","ID,Name\n002,B,Extra","ID")).toThrow(/different/);
  expect(()=>compareCsvSnapshots("ID,Name\n001,A","Other,Name\n002,B","ID")).toThrow(/missing/);
 });
 it("preserves literal formula-like content while making report CSV safe",async()=>{
  const diff=compareCsvSnapshots("ID,Name\n001,safe","ID,Name\n001,=1+2","ID");
  const csv=await (await JSZip.loadAsync(await exportCsvSnapshotDiff(diff))).file("csv-diff/changes.csv")!.async("string");
  expect(csv).toContain("'=1+2");
 });
});
